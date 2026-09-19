import os
import asyncio
import json
import random
import time
import html
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db, init_db
from models import GameSession, PlayerRecord
from game_state import GameRoom

app = FastAPI(title="Crash: Survival Multiplayer Game")

# In-memory active rooms
rooms: Dict[str, GameRoom] = {}
# Active WebSockets: room_id -> {player_id -> WebSocket}
active_connections: Dict[str, Dict[str, WebSocket]] = {}


class CreateRoomRequest(BaseModel):
    player_name: str = "Выживший 1"
    platform: str = "pc"  # pc or mobile


class JoinRoomRequest(BaseModel):
    room_id: str
    player_name: str = "Выживший 2"
    platform: str = "pc"


@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.on_event("startup")
async def startup():
    await init_db()
    asyncio.create_task(game_loop_ticker())


async def game_loop_ticker():
    last_time = time.time()
    while True:
        try:
            now = time.time()
            dt = now - last_time
            last_time = now

            for room_id, room in list(rooms.items()):
                room.update_tick(dt)
                # Broadcast room tick if players connected
                conns = active_connections.get(room_id, {})
                if conns:
                    # Gather active player coordinates to avoid sending inactive map sectors
                    active_coords = {p.room_coord for p in room.players.values()}
                    rabbits_data = {
                        f"{c[0]}_{c[1]}": [r.to_dict() for r in room.rabbits.get(c, [])]
                        for c in active_coords
                    }
                    ground_data = {
                        f"{c[0]}_{c[1]}": room.ground_items.get(c, [])
                        for c in active_coords
                    }
                    state_msg = json.dumps({
                        "type": "room_state",
                        "state": room.to_dict(),
                        "rabbits": rabbits_data,
                        "ground_items": ground_data
                    })
                    for ws in list(conns.values()):
                        try:
                            await ws.send_text(state_msg)
                        except Exception:
                            pass
        except Exception as e:
            print(f"Error in game ticker: {e}")
        await asyncio.sleep(0.05)  # 20 Hz update rate


@app.post("/api/rooms/create")
async def create_room(req: CreateRoomRequest, db: AsyncSession = Depends(get_db)):
    # 8-digit unique room id
    room_id = str(random.randint(10000000, 99999999))
    while room_id in rooms:
        room_id = str(random.randint(10000000, 99999999))

    player_id = f"p_{int(time.time() * 1000)}_{random.randint(100, 999)}"
    new_room = GameRoom(room_id, is_multiplayer=True)
    new_room.add_player(
        player_id,
        req.player_name,
        role="host",
        platform=req.platform)
    rooms[room_id] = new_room

    # Save to DB
    session_rec = GameSession(
        room_id=room_id,
        is_multiplayer=True,
        status="active")
    db.add(session_rec)
    await db.commit()
    await db.refresh(session_rec)

    p_rec = PlayerRecord(
        session_id=session_rec.id,
        player_id=player_id,
        player_name=req.player_name,
        role="host",
        platform=req.platform
    )
    db.add(p_rec)
    await db.commit()

    return {
        "success": True,
        "room_id": room_id,
        "player_id": player_id,
        "role": "host"
    }


@app.post("/api/rooms/singleplayer")
async def create_singleplayer(req: CreateRoomRequest, db: AsyncSession = Depends(get_db)):
    room_id = str(random.randint(10000000, 99999999))
    player_id = f"p_solo_{int(time.time() * 1000)}"
    new_room = GameRoom(room_id, is_multiplayer=False)
    new_room.add_player(
        player_id,
        req.player_name,
        role="host",
        platform=req.platform)
    rooms[room_id] = new_room

    session_rec = GameSession(
        room_id=room_id,
        is_multiplayer=False,
        status="active")
    db.add(session_rec)
    await db.commit()

    return {
        "success": True,
        "room_id": room_id,
        "player_id": player_id,
        "role": "host"
    }


@app.post("/api/rooms/join")
async def join_room(req: JoinRoomRequest, db: AsyncSession = Depends(get_db)):
    room_id = req.room_id.strip()
    if room_id not in rooms:
        raise HTTPException(
            status_code=404,
            detail="Комната с таким ID не найдена!")

    room = rooms[room_id]
    if len(room.players) >= 2:
        raise HTTPException(
            status_code=400,
            detail="Комната уже заполнена (максимум 2 игрока)!")

    player_id = f"p_{int(time.time() * 1000)}_{random.randint(100, 999)}"
    room.add_player(
        player_id,
        req.player_name,
        role="guest",
        platform=req.platform)

    # Update in DB
    result = await db.execute(select(GameSession).where(GameSession.room_id == room_id))
    session_rec = result.scalar_one_or_none()
    if session_rec:
        p_rec = PlayerRecord(
            session_id=session_rec.id,
            player_id=player_id,
            player_name=req.player_name,
            role="guest",
            platform=req.platform
        )
        db.add(p_rec)
        await db.commit()

    return {
        "success": True,
        "room_id": room_id,
        "player_id": player_id,
        "role": "guest"
    }


async def send_res(ws: WebSocket, action: str, result: dict):
    await ws.send_text(json.dumps({
        "type": "action_result",
        "action": action,
        "result": result
    }))


async def broadcast_res(room_id: str, action: str, result: dict):
    msg = json.dumps({
        "type": "action_result",
        "action": action,
        "result": result
    })
    for ws in active_connections.get(room_id, {}).values():
        try:
            await ws.send_text(msg)
        except Exception:
            pass


@app.websocket("/ws/{room_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, player_id: str):
    await websocket.accept()

    if room_id not in rooms:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "Комната не найдена"
        }))
        await websocket.close()
        return

    room = rooms[room_id]
    player = room.players.get(player_id)
    if not player:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "Игрок не найден"
        }))
        await websocket.close()
        return

    if room_id not in active_connections:
        active_connections[room_id] = {}
    active_connections[room_id][player_id] = websocket

    # Send room-specific procedural layout, trees, and ground items once on init
    layout_data = room.get_layout_data()
    trees_data = {
        f"{c[0]}_{c[1]}": t_list
        for c, t_list in room.trees.items()
    }
    ground_data = {
        f"{c[0]}_{c[1]}": g_list
        for c, g_list in room.ground_items.items()
    }
    await websocket.send_text(json.dumps({
        "type": "init",
        "player_id": player_id,
        "map_layout": layout_data,
        "trees": trees_data,
        "ground_items": ground_data
    }))

    try:
        while True:
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            action_type = data.get("type")

            if action_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

            elif action_type == "move":
                player.x = float(data.get("x", player.x))
                player.y = float(data.get("y", player.y))

            elif action_type == "change_screen":
                direction = data.get("direction")
                res = room.change_screen(player, direction)
                if res.get("success"):
                    target_coord = tuple(res["coord"])
                    coord_str = f"{target_coord[0]}_{target_coord[1]}"
                    res["ground_items"] = room.ground_items.get(target_coord, [])
                    res["rabbits"] = [
                        r.to_dict() for r in room.rabbits.get(target_coord, [])
                    ]
                    res["coord_str"] = coord_str
                await send_res(websocket, "change_screen", res)

            elif action_type == "search_wreckage":
                res = room.search_wreckage(player)
                await send_res(websocket, "search_wreckage", res)

            elif action_type == "hit_rabbit":
                rabbit_id = data.get("rabbit_id")
                res = room.hit_rabbit(player, rabbit_id)
                await send_res(websocket, "hit_rabbit", res)

            elif action_type == "chop_tree":
                tree_id = data.get("tree_id")
                res = room.chop_tree(player, tree_id)
                await send_res(websocket, "chop_tree", res)
                if res.get("success"):
                    coord = player.room_coord
                    coord_str = f"{coord[0]}_{coord[1]}"
                    trees_msg = json.dumps({
                        "type": "trees_update",
                        "coord": coord_str,
                        "trees": room.trees.get(coord, [])
                    })
                    for p_ws in active_connections.get(room_id, {}).values():
                        try:
                            await p_ws.send_text(trees_msg)
                        except Exception:
                            pass

            elif action_type == "pickup_ground_item":
                item_id = data.get("item_id")
                coord = player.room_coord
                g_list = room.ground_items.get(coord, [])
                found_idx = None
                for i, item in enumerate(g_list):
                    if item["id"] == item_id:
                        found_idx = i
                        break
                if found_idx is not None:
                    item = g_list[found_idx]
                    if player.add_item(
                            item["item_id"], item["name"], "fuel", 1):
                        g_list.pop(found_idx)
                        await send_res(websocket, "pickup", {
                            "success": True,
                            "message": f"Подобрано: {item['name']}"
                        })
                    else:
                        await send_res(websocket, "pickup", {
                            "success": False,
                            "message": "Инвентарь полон (макс. 5 слотов)!"
                        })

            elif action_type == "add_fuel":
                res = room.add_fuel_to_fire(player)
                await send_res(websocket, "add_fuel", res)

            elif action_type == "cook_meat":
                res = room.cook_meat(player)
                await send_res(websocket, "cook_meat", res)

            elif action_type == "craft_windbreak":
                res = room.craft_windbreak(player)
                await send_res(websocket, "craft_windbreak", res)

            elif action_type == "contribute_sos":
                res = room.contribute_sos(player)
                await send_res(websocket, "contribute_sos", res)

            elif action_type == "board_sos_helicopter":
                res = room.board_sos_helicopter(player)
                await broadcast_res(room_id, "board_sos_helicopter", res)

            elif action_type == "board_radio_helicopter":
                res = room.board_radio_helicopter(player)
                await broadcast_res(room_id, "board_radio_helicopter", res)

            elif action_type == "fire_flare_rocket":
                res = room.fire_flare_rocket(player)
                await broadcast_res(room_id, "fire_flare_rocket", res)

            elif action_type == "breach_tower":
                res = room.breach_radio_tower(player)
                await send_res(websocket, "breach_tower", res)

            elif action_type == "repair_radio":
                res = room.repair_and_broadcast(player)
                await send_res(websocket, "repair_radio", res)

            elif action_type == "melt_snow":
                res = room.melt_snow(player)
                await send_res(websocket, "melt_snow", res)

            elif action_type == "use_item":
                item_id = data.get("item_id")
                res = room.use_item(player, item_id)
                await send_res(websocket, "use_item", res)

            elif action_type == "camp_chest_transfer":
                direction = data.get("direction")
                item_id = data.get("item_id")
                if player.room_coord != (0, 0):
                    await send_res(websocket, "chest", {
                        "success": False,
                        "message": "Сундук находится в лагере!"
                    })
                elif direction == "to_chest":
                    p_slot = next(
                        (s for s in player.inventory if s["id"] == item_id), None)
                    if p_slot:
                        item_name = p_slot["name"]
                        item_type = p_slot["type"]
                        player.remove_item(item_id, 1)
                        c_slot = next(
                            (s for s in room.camp_chest if s["id"] == item_id), None)
                        if c_slot:
                            c_slot["count"] = c_slot.get("count", 1) + 1
                        else:
                            room.camp_chest.append({
                                "id": item_id,
                                "name": item_name,
                                "type": item_type,
                                "count": 1
                            })
                        await send_res(websocket, "chest", {
                            "success": True,
                            "message": f"Переложено в сундук: {item_name}"
                        })
                elif direction == "to_inventory":
                    c_slot = next(
                        (s for s in room.camp_chest if s["id"] == item_id), None)
                    if c_slot and c_slot.get("count", 1) > 0:
                        if player.add_item(
                                c_slot["id"], c_slot["name"], c_slot["type"], 1):
                            if c_slot["count"] > 1:
                                c_slot["count"] -= 1
                            else:
                                room.camp_chest.remove(c_slot)
                            await send_res(websocket, "chest", {
                                "success": True,
                                "message": f"Взято из сундука: {c_slot['name']}"
                            })
                        else:
                            await send_res(websocket, "chest", {
                                "success": False,
                                "message": "Инвентарь полон (макс. 5 слотов)!"
                            })

            elif action_type == "sleep":
                res = room.trigger_sleep(player_id)
                await broadcast_res(room_id, "sleep", res)

            elif action_type == "respond_helicopter":
                action = data.get("action")
                res = room.respond_to_helicopter(player, action)
                await broadcast_res(room_id, "respond_helicopter", res)

            elif action_type == "wake_up":
                res = room.trigger_wake_up(player_id)
                await broadcast_res(room_id, "wake_up", res)

            elif action_type == "chat_message":
                raw_text = str(data.get("text", "")).strip()
                if raw_text and len(raw_text) <= 150:
                    clean_text = html.escape(raw_text)
                    await broadcast_res(room_id, "chat_message", {
                        "player_id": player_id,
                        "name": player.name,
                        "text": clean_text,
                        "time": time.strftime("%H:%M")
                    })

    except WebSocketDisconnect:
        if room_id in active_connections and player_id in active_connections[room_id]:
            del active_connections[room_id][player_id]
            if not active_connections[room_id]:
                del active_connections[room_id]


# Mount static folder
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def get_index():
    return FileResponse("static/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
