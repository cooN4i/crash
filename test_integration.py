import asyncio
import json
import urllib.request
import websockets


async def test_full_flow():
    # 1. Test HTTP GET /
    req = urllib.request.urlopen("http://127.0.0.1:8000/")
    assert req.status == 200
    html = req.read().decode('utf-8')
    assert "КРУШЕНИЕ" in html
    print("[1] HTTP GET / -> OK")

    # 2. Test create room
    create_req = urllib.request.Request(
        "http://127.0.0.1:8000/api/rooms/create",
        data=json.dumps({"player_name": "Survivor1", "platform": "pc"}).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    res = urllib.request.urlopen(create_req)
    data = json.loads(res.read().decode('utf-8'))
    assert data["success"] is True
    room_id = data["room_id"]
    p1_id = data["player_id"]
    assert len(room_id) == 8
    print(f"[2] Room created with ID {room_id} -> OK")

    # 3. Test join room
    join_req = urllib.request.Request(
        "http://127.0.0.1:8000/api/rooms/join",
        data=json.dumps(
            {
                "room_id": room_id,
                "player_name": "Survivor2",
                "platform": "mobile"}).encode('utf-8'),
        headers={
            "Content-Type": "application/json"})
    res2 = urllib.request.urlopen(join_req)
    data2 = json.loads(res2.read().decode('utf-8'))
    assert data2["success"] is True
    p2_id = data2["player_id"]
    print(f"[3] Player 2 joined room {room_id} -> OK")

    # 4. Test WebSockets
    ws1_url = f"ws://127.0.0.1:8000/ws/{room_id}/{p1_id}"
    ws2_url = f"ws://127.0.0.1:8000/ws/{room_id}/{p2_id}"

    async with websockets.connect(ws1_url) as ws1, websockets.connect(ws2_url):
        # Receive init from ws1
        init_exit = "north"
        for _ in range(5):
            raw = await ws1.recv()
            msg = json.loads(raw)
            if msg.get("type") == "init" and "map_layout" in msg:
                camp_info = msg["map_layout"].get("0_0", {})
                exits = camp_info.get("exits", ["north"])
                init_exit = exits[0]
                break

        # Player 1 searches wreckage
        await ws1.send(json.dumps({"type": "search_wreckage"}))

        # Wait for action result
        for _ in range(5):
            reply = json.loads(await ws1.recv())
            if reply.get("type") == "action_result" and reply.get(
                    "action") == "search_wreckage":
                assert reply["result"]["success"] is True
                res_msg = reply['result']['message']
                print(f"[4] Wreckage search result: {res_msg} -> OK")
                break

        # Player 1 moves and changes screen using available exit
        await ws1.send(json.dumps({"type": "change_screen", "direction": init_exit}))
        for _ in range(5):
            reply = json.loads(await ws1.recv())
            if reply.get("type") == "action_result" and reply.get(
                    "action") == "change_screen":
                assert reply["result"]["success"] is True
                res_msg = reply['result']['message']
                print(f"[5] Screen transition to {init_exit}: {res_msg} -> OK")
                break

    print("ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(test_full_flow())
