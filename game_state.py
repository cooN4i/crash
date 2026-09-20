import random
import math
import time
from typing import Dict, List, Optional, Any

# Screen layout definition
# (0, 0) is Base Camp
# (0, 2) is SOS Field (North 2 steps)
# (-2, 0) is Radio Tower (West 2 steps)
# All other connected coordinates are Forest sectors

FOREST_NAMES = [
    "Северный ельник",
    "Глухая чаща",
    "Сугробная просека",
    "Старый лесоповал",
    "Ветреная опушка",
    "Заснеженный бор",
    "Сосновый склон",
    "Березовый перелесок",
    "Таёжный бурелом",
    "Хвойная лощина",
    "Замёрзшая падь",
    "Волчий яр",
    "Скалистый перелесок",
    "Медвежья тропа",
    "Кедровая роща"]


def generate_procedural_map(
        target_rooms: int = 14) -> Dict[tuple, Dict[str, Any]]:
    """Generates a random connected room layout like The Binding of Isaac, placing key POIs far away."""
    occupied = {(0, 0)}
    frontier = [(0, 0)]
    dirs = [
        (0, 1, "north", "south"),
        (0, -1, "south", "north"),
        (1, 0, "east", "west"),
        (-1, 0, "west", "east")
    ]

    # 1. Grow rooms randomly
    while len(occupied) < target_rooms and frontier:
        cur = random.choice(frontier)
        random.shuffle(dirs)
        added = False
        for dx, dy, _, _ in dirs:
            nxt = (cur[0] + dx, cur[1] + dy)
            if nxt not in occupied:
                occupied.add(nxt)
                frontier.append(nxt)
                added = True
                break
        if not added:
            frontier.remove(cur)

    # 2. BFS distance from camp (0, 0)
    dist = {(0, 0): 0}
    queue = [(0, 0)]
    while queue:
        c = queue.pop(0)
        for dx, dy, _, _ in dirs:
            nxt = (c[0] + dx, c[1] + dy)
            if nxt in occupied and nxt not in dist:
                dist[nxt] = dist[c] + 1
                queue.append(nxt)

    # 3. Find furthest rooms for SOS field and Radio tower
    sorted_by_dist = sorted([c for c in occupied if c != (
        0, 0)], key=lambda c: dist[c], reverse=True)
    sos_coord = sorted_by_dist[0]

    # Pick radio tower far away from camp, and preferably in a different
    # direction
    radio_coord = sorted_by_dist[1]
    for c in sorted_by_dist[1:]:
        if math.hypot(c[0] - sos_coord[0], c[1] - sos_coord[1]) >= 2:
            radio_coord = c
            break

    # 4. Build map layout dict with exits
    layout = {}
    f_names_pool = list(FOREST_NAMES)
    random.shuffle(f_names_pool)
    name_idx = 0

    for coord in occupied:
        exits = []
        for dx, dy, d_name, _ in dirs:
            if (coord[0] + dx, coord[1] + dy) in occupied:
                exits.append(d_name)

        if coord == (0, 0):
            layout[coord] = {
                "id": "camp",
                "name": "Базовый лагерь (Место крушения)",
                "type": "camp",
                "description": "Хвостовая часть самолёта, тлеющий костёр, чемоданы и обломки фюзеляжа.",
                "exits": exits}
        elif coord == sos_coord:
            layout[coord] = {
                "id": "sos_clearing",
                "name": "Открытая равнина (Поляна SOS)",
                "type": "sos_clearing",
                "description": "Широкое ровное поле вдалеке от лагеря. Идеально для знака SOS.",
                "exits": exits}
        elif coord == radio_coord:
            layout[coord] = {
                "id": "radio_tower",
                "name": "Заброшенная радиовышка",
                "type": "radio_tower",
                "description": "Стальная мачта ретранслятора в глубине леса. Дверь бытовки заперта на цепь.",
                "exits": exits}
        else:
            fname = f_names_pool[name_idx % len(f_names_pool)]
            name_idx += 1
            f_id = f"forest_{coord[0]}_{coord[1]}"
            layout[coord] = {
                "id": f_id,
                "name": fname,
                "type": "forest",
                "description": "Заснеженный лес, сосны, поваленные деревья и сугробы.",
                "exits": exits}

    return layout


# Default fallback layout
MAP_LAYOUT = generate_procedural_map()


class Rabbit:
    def __init__(self, rabbit_id: str, x: float, y: float):
        self.id = rabbit_id
        self.x = x
        self.y = y
        self.target_x = x
        self.target_y = y
        self.state = "idle"  # idle, hopping
        self.hop_timer = 0.0

    def update(self, dt: float, screen_w: int = 1100, screen_h: int = 650):
        self.hop_timer -= dt
        if self.hop_timer <= 0:
            self.hop_timer = random.uniform(1.5, 4.0)
            angle = random.uniform(0, 2 * math.pi)
            dist = random.uniform(50, 150)
            self.target_x = max(
                100, min(
                    screen_w - 100, self.x + math.cos(angle) * dist))
            self.target_y = max(
                100, min(
                    screen_h - 100, self.y + math.sin(angle) * dist))

        # Move smoothly toward target
        dx = self.target_x - self.x
        dy = self.target_y - self.y
        dist = math.hypot(dx, dy)
        if dist > 3:
            speed = 100 * dt
            self.x += (dx / dist) * min(speed, dist)
            self.y += (dy / dist) * min(speed, dist)

    def to_dict(self):
        return {
            "id": self.id,
            "x": round(self.x, 1),
            "y": round(self.y, 1),
            "vx": round(self.target_x - self.x, 1),
            "target_x": round(self.target_x, 1)
        }


class Player:
    def __init__(
            self,
            player_id: str,
            name: str,
            role: str = "host",
            platform: str = "pc"):
        self.id = player_id
        self.name = name
        self.role = role
        self.platform = platform
        self.room_coord = (0, 0)
        self.x = 450.0 if role == "host" else 550.0
        self.y = 350.0
        self.health = 100.0
        self.warmth = 100.0
        self.hunger = 100.0
        self.thirst = 100.0
        self.stamina = 3
        self.max_stamina = 3
        self.is_alive = True
        self.inventory: List[Dict[str,
                                  Any]] = [{"id": "axe",
                                            "name": "Топор",
                                            "type": "tool",
                                            "count": 1} if role == "host" else {"id": "canned_food",
                                                                                "name": "Сухпаёк",
                                                                                "type": "food",
                                                                                "count": 1}]
        self.max_slots = 5
        self.ready_to_sleep = False
        self.ready_to_wake = False
        self.last_attack_time = 0.0
        self.previous_coord: Optional[tuple] = None

    def has_item(self, item_id: str) -> bool:
        return any(item["id"] == item_id and item.get(
            "count", 0) > 0 for item in self.inventory)

    def add_item(
            self,
            item_id: str,
            name: str,
            item_type: str,
            count: int = 1) -> bool:
        for slot in self.inventory:
            if slot["id"] == item_id and item_type not in ["tool"]:
                slot["count"] = slot.get("count", 1) + count
                return True
        if len(self.inventory) < self.max_slots:
            self.inventory.append(
                {"id": item_id, "name": name, "type": item_type, "count": count})
            return True
        return False

    def remove_item(self, item_id: str, count: int = 1) -> bool:
        for i, slot in enumerate(self.inventory):
            if slot["id"] == item_id:
                if slot.get("count", 1) > count:
                    slot["count"] -= count
                    return True
                elif slot.get("count", 1) == count:
                    self.inventory.pop(i)
                    return True
        return False

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "platform": self.platform,
            "coord": list(self.room_coord),
            "x": round(self.x, 1),
            "y": round(self.y, 1),
            "health": round(self.health, 1),
            "warmth": round(self.warmth, 1),
            "hunger": round(self.hunger, 1),
            "thirst": round(self.thirst, 1),
            "stamina": self.stamina,
            "max_stamina": self.max_stamina,
            "is_alive": self.is_alive,
            "inventory": self.inventory,
            "ready_to_sleep": self.ready_to_sleep
        }


class GameRoom:
    def __init__(self, room_id: str, is_multiplayer: bool = False):
        self.room_id = room_id
        self.is_multiplayer = is_multiplayer
        self.players: Dict[str, Player] = {}
        self.day = 1
        self.status = "playing"  # playing, won, lost
        self.win_reason = ""
        self.loss_reason = ""
        self.night_event = None

        # Camp State
        self.campfire_built = False  # True once player builds it from blueprint
        self.fire_level = 0  # 0 to 5 (starts unlit)
        self.has_windbreak = False
        self.camp_chest: List[Dict[str, Any]] = [
            {"id": "wood", "name": "Дрова", "type": "fuel", "count": 2},
            {"id": "canned_food", "name": "Сухпаёк", "type": "food", "count": 2},
            {"id": "water", "name": "Вода", "type": "food", "count": 2}
        ]

        # Wreckage Search in Camp
        self.searches_done = 0
        self.lighter_found = False
        self.compass_found = False
        self.flare_gun_found = False
        self.radio_found = False
        self.scrap_in_wreckage = 15

        # Victory Trackers
        self.sos_progress = 0  # Needs 15 scrap to complete
        self.sos_completed = False
        self.sos_rescue_day = 0
        self.sos_helicopter_landed = False
        self.night_helicopter_active = False
        self.tower_breached = False
        self.radio_repaired = False
        self.radio_rescue_day = 0
        self.radio_helicopter_landed = False
        self.radio_installed = False

        # Generate unique procedural room map with distant POIs
        self.map_layout = generate_procedural_map()

        # Trees per room with hitboxes and health
        self.trees: Dict[tuple, List[Dict[str, Any]]] = {}
        self._spawn_trees()

        # Rabbits per screen: Dict[coord_tuple, List[Rabbit]]
        self.rabbits: Dict[tuple, List[Rabbit]] = {}
        self._spawn_rabbits()

        # Fallen wood logs & dropped items per screen
        self.ground_items: Dict[tuple, List[Dict[str, Any]]] = {}
        self._spawn_initial_resources()

    def get_layout_data(self) -> Dict[str, Any]:
        return {
            f"{c[0]}_{c[1]}": {
                "id": v["id"],
                "name": v["name"],
                "type": v["type"],
                "description": v["description"],
                "exits": v["exits"]
            }
            for c, v in self.map_layout.items()
        }

    def _spawn_rabbits(self):
        for coord, info in self.map_layout.items():
            if info["type"] == "forest":
                num_rabbits = random.randint(1, 3)
                self.rabbits[coord] = [
                    Rabbit(
                        f"r_{coord[0]}_{coord[1]}_{i}",
                        random.uniform(200, 900),
                        random.uniform(150, 500)
                    ) for i in range(num_rabbits)
                ]

    def _spawn_trees(self):
        for coord, info in self.map_layout.items():
            trees = []
            if info["type"] == "forest":
                # Deterministic room seed based on coordinate
                seed_val = (coord[0] * 73856093) ^ (coord[1] * 19349663)
                rng = random.Random(seed_val)
                target_count = rng.randint(12, 16)
                attempts = 0
                while len(trees) < target_count and attempts < 120:
                    attempts += 1
                    tx = rng.uniform(100, 1000)
                    ty = rng.uniform(140, 560)
                    # Keep corridors to screen gates completely clear
                    if 440 < tx < 660 and (ty < 180 or ty > 470):
                        continue
                    if (tx < 190 or tx > 910) and 230 < ty < 420:
                        continue
                    # Keep distance from existing trees
                    if any(math.hypot(tx - ot["x"], ty - ot["y"]) < 58 for ot in trees):
                        continue
                    trees.append({
                        "id": f"t_{coord[0]}_{coord[1]}_{len(trees)}",
                        "x": round(tx, 1),
                        "y": round(ty, 1),
                        "size": round(rng.uniform(0.9, 1.25), 2),
                        "health": 3,
                        "max_health": 3,
                        "is_stump": False,
                        "radius": 20.0
                    })
            elif info["type"] == "camp":
                # Only perimeter trees away from plane & fire pit
                camp_coords = [(110, 480), (130, 560), (960, 160), (980, 260), (950, 490)]
                for i, (tx, ty) in enumerate(camp_coords):
                    trees.append({
                        "id": f"t_camp_{i}",
                        "x": float(tx),
                        "y": float(ty),
                        "size": 1.1,
                        "health": 3,
                        "max_health": 3,
                        "is_stump": False,
                        "radius": 20.0
                    })
            elif info["type"] in ["sos_clearing", "radio_tower"]:
                # Clearing border trees
                border_coords = [(130, 180), (140, 480), (970, 180), (960, 490)]
                for i, (tx, ty) in enumerate(border_coords):
                    trees.append({
                        "id": f"t_{coord[0]}_{coord[1]}_{i}",
                        "x": float(tx),
                        "y": float(ty),
                        "size": 1.05,
                        "health": 3,
                        "max_health": 3,
                        "is_stump": False,
                        "radius": 20.0
                    })
            self.trees[coord] = trees

    def _spawn_initial_resources(self):
        for coord in self.map_layout:
            self.ground_items[coord] = []

    def add_player(
            self,
            player_id: str,
            name: str,
            role: str,
            platform: str) -> Player:
        p = Player(player_id, name, role, platform)
        self.players[player_id] = p
        return p

    def remove_player(self, player_id: str):
        if player_id in self.players:
            del self.players[player_id]

    def update_rabbits(self, dt: float):
        for coord, r_list in self.rabbits.items():
            for r in r_list:
                r.update(dt)

    def update_tick(self, dt: float):
        """Real-time tick for campfire warmth radius, freezing, and rabbits."""
        self.update_rabbits(dt)

        if self.status != "playing":
            return

        campfire_center = (570.0, 360.0)
        warmth_radius = 155.0

        for p in self.players.values():
            if not p.is_alive:
                continue

            is_camp = p.room_coord == (0, 0)
            has_fire = self.campfire_built and self.fire_level > 0
            near_fire = math.hypot(p.x - campfire_center[0], p.y - campfire_center[1]) <= warmth_radius
            in_warmth_circle = is_camp and has_fire and near_fire

            if in_warmth_circle:
                # Regain warmth while inside campfire circle
                p.warmth = min(100.0, p.warmth + 14.0 * dt)
            else:
                # Slowly freeze when outside campfire circle or away from camp
                p.warmth = max(0.0, p.warmth - 1.2 * dt)

                # Hypothermia damage if warmth reaches 0
                if p.warmth <= 0.0:
                    p.health = max(0.0, p.health - 5.0 * dt)
                    if p.health <= 0.0:
                        p.is_alive = False

        if self.players and all(not p.is_alive for p in self.players.values()):
            self.status = "lost"
            self.loss_reason = "Все выжившие насмерть замерзли в ледяной тайге."

    def search_wreckage(self, player: Player) -> Dict[str, Any]:
        """Search suitcases & cargo at the base camp."""
        if player.room_coord != (0, 0):
            return {
                "success": False,
                "message": "Обыск доступен только на месте крушения в лагере!"}
        if player.stamina < 1:
            return {
                "success": False,
                "message": "Вы выбились из сил на сегодня (0 энергии)! Нужно поспать в укрытии самолёта."}

        player.stamina -= 1
        self.searches_done += 1

        # 40% chance of empty search (snow-drifted wreckage yielded nothing)
        if random.random() < 0.40:
            return {
                "success": True,
                "stamina": player.stamina,
                "loot": [],
                "message": "Вы тщательно перерыли заснеженные сумки, но ничего полезного не нашлось..."
            }

        loot_found = []

        # 100% Lighter on first search
        if not self.lighter_found:
            self.lighter_found = True
            if player.add_item("lighter", "Зажигалка", "tool", 1):
                loot_found.append("Газовая зажигалка (для розжига костра)")
            else:
                self.camp_chest.append(
                    {"id": "lighter", "name": "Зажигалка", "type": "tool", "count": 1})
                loot_found.append("Зажигалка (Сложена в сундук лагеря)")

        # 10% Compass chance (guaranteed within first 10 searches if not found
        # yet)
        if not self.compass_found:
            if random.random() < 0.10 or self.searches_done >= 10:
                self.compass_found = True
                if player.add_item("compass", "Компас", "tool", 1):
                    loot_found.append("Компас (Ориентация в лесу спасена!)")
                else:
                    self.camp_chest.append(
                        {"id": "compass", "name": "Компас", "type": "tool", "count": 1})
                    loot_found.append("Компас (Сложен в сундук лагеря!)")

        # 10% Flare Gun chance
        if not self.flare_gun_found and random.random() < 0.10:
            self.flare_gun_found = True
            if player.add_item("flare_gun", "Ракетница", "tool", 1):
                loot_found.append("Сигнальная ракетница с ракетой!")
            else:
                self.camp_chest.append(
                    {"id": "flare_gun", "name": "Ракетница", "type": "tool", "count": 1})
                loot_found.append("Ракетница (В сундуке лагеря)")

        # Broken radio chance
        if not self.radio_found and self.searches_done >= 3 and random.random() < 0.25:
            self.radio_found = True
            player.add_item("broken_radio", "Сломанная рация", "quest", 1)
            loot_found.append(
                "Сломанная бортовая рация (требует 5 металлолома)")

        # Scrap metal
        if self.scrap_in_wreckage > 0:
            amt = random.randint(1, 2)
            self.scrap_in_wreckage -= amt
            player.add_item("scrap", "Металлолом", "material", amt)
            loot_found.append(f"Металлолом x{amt}")

        # Food & Water
        roll = random.random()
        if roll < 0.35:
            player.add_item("canned_food", "Консервы", "food", 1)
            loot_found.append("Консервы x1")
        elif roll < 0.65:
            player.add_item("water", "Бутылка воды", "food", 1)
            loot_found.append("Вода x1")

        msg = "Найдено: " + \
            (", ".join(loot_found) if loot_found else "Ничего ценного в этом чемодане.")
        return {"success": True, "message": msg, "loot": loot_found}

    def change_screen(self, player: Player, direction: str) -> Dict[str, Any]:
        """Isaac-style room transition with screen cost & compass check."""
        curr = player.room_coord
        dx, dy = 0, 0
        if direction == "north":
            dy = 1
        elif direction == "south":
            dy = -1
        elif direction == "east":
            dx = 1
        elif direction == "west":
            dx = -1

        intended_target = (curr[0] + dx, curr[1] + dy)
        if intended_target not in self.map_layout:
            return {
                "success": False,
                "boundary": True,
                "message": "Впереди бушует непроглядная пурга, дальше пути нет."
            }

        # Warmth cost for moving through deep snow (hunger/thirst are sleep-only)
        player.warmth = max(0.0, player.warmth - 3.0)

        has_compass = player.has_item("compass") or any(
            p.has_item("compass") for p in self.players.values())

        lost = False
        target_coord = intended_target

        # Check return to previous room without compass
        is_returning = (player.previous_coord is not None and intended_target == player.previous_coord)
        if not has_compass and is_returning:
            # 50% chance to lose way and stumble into a random forest room
            if random.random() < 0.50:
                forest_coords = [
                    c for c, info in self.map_layout.items()
                    if info["type"] == "forest" and c != curr
                ]
                if forest_coords:
                    target_coord = random.choice(forest_coords)
                    lost = True

        player.previous_coord = curr
        player.room_coord = target_coord

        # Position player on entering opposite edge, safely inside the pathway
        gate_center_x = 550.0
        gate_center_y = 325.0
        if direction == "north":
            player.y = 540.0
            player.x = max(490.0, min(610.0, player.x if player.x else gate_center_x))
        elif direction == "south":
            player.y = 110.0
            player.x = max(490.0, min(610.0, player.x if player.x else gate_center_x))
        elif direction == "east":
            player.x = 110.0
            player.y = max(270.0, min(380.0, player.y if player.y else gate_center_y))
        elif direction == "west":
            player.x = 990.0
            player.y = max(270.0, min(380.0, player.y if player.y else gate_center_y))

        room_name = self.map_layout[target_coord]["name"]
        if lost:
            msg = "Кажется, вы заблудились в метели..."
        else:
            msg = f"Переход в: {room_name}"

        return {
            "success": True,
            "coord": list(target_coord),
            "room_name": room_name,
            "lost": lost,
            "direction": direction,
            "new_x": player.x,
            "new_y": player.y,
            "message": msg
        }

    def hit_rabbit(self, player: Player, rabbit_id: str) -> Dict[str, Any]:
        """Attack and catch a rabbit with an axe (costs 1 stamina on catch)."""
        if player.stamina < 1:
            return {
                "success": False,
                "message": "Вы выбились из сил на сегодня (0 энергии)! Нужно поспать."}
        coord = player.room_coord
        r_list = self.rabbits.get(coord, [])
        for i, r in enumerate(r_list):
            if r.id == rabbit_id:
                dist = math.hypot(player.x - r.x, player.y - r.y)
                if dist <= 90:
                    r_list.pop(i)
                    player.stamina -= 1
                    player.add_item("raw_meat", "Сырое мясо зайца", "food", 1)
                    return {
                        "success": True,
                        "message": "Точный удар топором (-1 энергия)! Вы добыли сырое мясо зайца."}
                else:
                    return {"success": False,
                            "message": "Заяц слишком далеко, он увернулся!"}
        return {"success": False, "message": "Заяц скрылся в сугробе!"}

    def cook_meat(self, player: Player) -> Dict[str, Any]:
        """Cook raw meat on campfire in camp."""
        if player.room_coord != (0, 0):
            return {
                "success": False,
                "message": "Жарить мясо можно только у костра в лагере!"}
        if self.fire_level < 1:
            return {
                "success": False,
                "message": "Костёр погас! Сначала подбросьте дров."}

        raw_slot = next((s for s in player.inventory if s["id"] == "raw_meat"), None)
        if not raw_slot:
            return {"success": False, "message": "У вас нет сырого мяса в рюкзаке!"}

        has_cooked_slot = any(s["id"] == "cooked_meat" for s in player.inventory)
        has_free_slot = len(player.inventory) < player.max_slots
        will_vacate_slot = raw_slot.get("count", 1) <= 1

        if not (has_cooked_slot or has_free_slot or will_vacate_slot):
            return {
                "success": False,
                "message": "Инвентарь полон! Освободите место в рюкзаке для готового мяса."
            }

        player.remove_item("raw_meat", 1)
        added = player.add_item("cooked_meat", "Жареное мясо", "food", 1)
        if not added:
            coord_items = self.ground_items.setdefault((0, 0), [])
            coord_items.append({
                "id": f"cooked_meat_{int(time.time() * 1000)}",
                "item_id": "cooked_meat",
                "name": "Жареное мясо",
                "x": 570.0 + random.uniform(-15, 15),
                "y": 360.0 + random.uniform(10, 25)
            })
            return {
                "success": True,
                "message": "Мясо поджарено! Из-за нехватки места оно упало на снег у костра."
            }

        return {
            "success": True,
            "message": "Мясо зайца поджарено на углях костра! (+30 сытости)."}

    def chop_tree(self, player: Player, tree_id: str) -> Dict[str, Any]:
        """Strike a tree with the axe to harvest wood (costs 1 stamina when felled)."""
        if player.stamina < 1:
            return {
                "success": False,
                "message": "Вы выбились из сил на сегодня (0 энергии)! Нужно поспать в укрытии."
            }

        coord = player.room_coord
        t_list = self.trees.get(coord, [])
        for t in t_list:
            if t["id"] == tree_id:
                if t["is_stump"]:
                    return {"success": False, "message": "Пень уже срублен."}
                dist = math.hypot(player.x - t["x"], player.y - t["y"])
                if dist > 90:
                    return {"success": False, "message": "Вы слишком далеко от дерева!"}

                t["health"] -= 1
                if t["health"] <= 0:
                    t["is_stump"] = True
                    player.stamina -= 1
                    wood_count = random.randint(2, 3)
                    coord_items = self.ground_items.setdefault(coord, [])
                    for i in range(wood_count):
                        ox = random.uniform(-20, 20)
                        oy = random.uniform(10, 25)
                        coord_items.append({
                            "id": f"wood_{int(time.time() * 1000)}_{i}",
                            "item_id": "wood",
                            "name": "Дрова",
                            "x": round(t["x"] + ox, 1),
                            "y": round(t["y"] + oy, 1)
                        })
                    return {
                        "success": True,
                        "felled": True,
                        "tree_id": tree_id,
                        "message": f"Сосна срублена (-1 энергия)! На снег упало {wood_count} поленьев дров."
                    }
                else:
                    return {
                        "success": True,
                        "felled": False,
                        "tree_id": tree_id,
                        "health": t["health"],
                        "message": f"Удар топором по сосне! (Прочность: {t['health']}/3)"
                    }
        return {"success": False, "message": "Дерево не найдено."}

    def melt_snow(self, player: Player) -> Dict[str, Any]:
        """Melt clean snow into water at lit campfire (costs 1 stamina)."""
        if player.room_coord != (0, 0):
            return {"success": False, "message": "Топить снег можно только у костра в базовом лагере!"}
        if self.fire_level < 1:
            return {"success": False, "message": "Костёр погас! Сначала разожгите огонь."}
        if player.stamina < 1:
            return {"success": False, "message": "Вы выбились из сил на сегодня (0 энергии)! Нужно поспать."}
        if len(player.inventory) >= player.max_slots and not player.has_item("water"):
            return {"success": False, "message": "Инвентарь полон! Освободите место для воды."}

        player.stamina -= 1
        player.add_item("water", "Вода", "food", 1)
        return {
            "success": True,
            "message": "Вы растопили снег над огнём костра и набрали флягу воды! (+1 Вода, -1 энергия)"
        }

    def use_item(self, player: Player, item_id: str) -> Dict[str, Any]:
        """Consume food or water to restore hunger/thirst/health."""
        if not player.has_item(item_id):
            return {"success": False, "message": "Предмета нет в инвентаре!"}

        if item_id == "canned_food":
            player.remove_item("canned_food", 1)
            player.hunger = min(100.0, player.hunger + 20.0)
            player.health = min(100.0, player.health + 5.0)
            return {"success": True, "message": "Вы съели сухпаёк! (+20 сытости, +5 HP)"}

        elif item_id == "cooked_meat":
            player.remove_item("cooked_meat", 1)
            player.hunger = min(100.0, player.hunger + 30.0)
            player.health = min(100.0, player.health + 15.0)
            return {"success": True, "message": "Вы съели сочное жареное мясо! (+30 сытости, +15 HP)"}

        elif item_id == "raw_meat":
            player.remove_item("raw_meat", 1)
            player.hunger = min(100.0, player.hunger + 10.0)
            player.health = max(0.0, player.health - 15.0)
            if player.health <= 0:
                player.is_alive = False
                self.status = "lost"
                self.loss_reason = f"{player.name} погиб от острого пищевого отравления."
            return {"success": True, "message": "Вы съели сырое мясо. (+10 сытости, -15 HP от несварения!)"}

        elif item_id == "water":
            player.remove_item("water", 1)
            player.thirst = min(100.0, player.thirst + 30.0)
            player.health = min(100.0, player.health + 5.0)
            return {"success": True, "message": "Вы выпили чистую воду! (+30 жажды, +5 HP)"}

        return {"success": False, "message": "Этот предмет нельзя употребить."}

    def add_fuel_to_fire(self, player: Player) -> Dict[str, Any]:
        """Build, light, or add wood to campfire. Requires lighter in player's personal backpack."""
        if player.room_coord != (0, 0):
            return {
                "success": False,
                "message": "Костёр находится в базовом лагере!"}

        # User rule: interacting only possible with items in personal backpack!
        has_lighter = player.has_item("lighter")

        if not self.campfire_built:
            if not has_lighter:
                return {
                    "success": False,
                    "message": "Для розжига костра нужна зажигалка в рюкзаке! Найдите её в вещах самолёта."}
            wood_count = sum(
                s.get("count", 1) for s in player.inventory if s["id"] == "wood")
            if wood_count < 2:
                return {
                    "success": False,
                    "message": "Для постройки костра требуется 2 бревна дров в рюкзаке! Срубите сосны в лесу."}

            player.remove_item("wood", 2)
            self.campfire_built = True
            self.fire_level = 2
            return {
                "success": True,
                "campfire_built": True,
                "fire_level": self.fire_level,
                "message": "Вы сложили камни, уложили брёвна и чиркнули зажигалкой! Костёр ярко заполыхал."}

        if self.fire_level == 0:
            if not has_lighter:
                return {
                    "success": False,
                    "message": "Чтобы заново разжечь потухший костёр, возьмите зажигалку в рюкзак!"}
            if not player.has_item("wood"):
                return {
                    "success": False,
                    "message": "Для розжига костра нужны дрова в рюкзаке! Срубите сосны в лесу."}

            player.remove_item("wood", 1)
            self.fire_level = 2
            return {
                "success": True,
                "fire_level": self.fire_level,
                "message": "Вы чиркнули зажигалкой и снова разожгли костёр! Тепло озарило лагерь."}

        if self.fire_level >= 5:
            return {
                "success": False,
                "message": "Пламя костра уже горит на максимуме (5/5)!"}
        if not player.has_item("wood"):
            return {
                "success": False,
                "message": "У вас нет дров! Срубите сосну топором."}

        player.remove_item("wood", 1)
        self.fire_level = min(5, self.fire_level + 1)
        return {
            "success": True,
            "fire_level": self.fire_level,
            "message": f"Вы подбросили дров в костёр! Сила огня: {self.fire_level}/5"}

    def craft_windbreak(self, player: Player) -> Dict[str, Any]:
        """Craft windbreak shield at base camp."""
        if player.room_coord != (0, 0):
            return {
                "success": False,
                "message": "Крафт ветрозащиты доступен только в лагере!"}
        if self.has_windbreak:
            return {
                "success": False,
                "message": "Ветрозащитный экран уже установлен!"}
        # Needs 3 scrap and 2 wood
        wood_slot = next(
            (s for s in player.inventory if s["id"] == "wood"), None)
        scrap_slot = next(
            (s for s in player.inventory if s["id"] == "scrap"), None)
        if not wood_slot or wood_slot.get(
                "count",
                0) < 2 or not scrap_slot or scrap_slot.get(
                "count",
                0) < 3:
            return {
                "success": False,
                "message": "Для ветрозащиты нужно: 3 металлолома и 2 дерева!"}

        player.remove_item("wood", 2)
        player.remove_item("scrap", 3)
        self.has_windbreak = True
        return {
            "success": True,
            "message": "Ветрозащитный экран установлен! Костёр защищён от метели."}

    def contribute_sos(self, player: Player) -> Dict[str, Any]:
        """Add scrap to the SOS sign on the SOS clearing."""
        curr_type = self.map_layout.get(player.room_coord, {}).get("type")
        if curr_type != "sos_clearing":
            return {
                "success": False,
                "message": "Выкладывать знак SOS можно только на открытой поляне SOS вдалеке от лагеря!"}
        if self.sos_completed:
            return {
                "success": False,
                "message": "Знак SOS уже полностью выложен!"}

        scrap_slot = next(
            (s for s in player.inventory if s["id"] == "scrap"), None)
        if not scrap_slot or scrap_slot.get("count", 0) <= 0:
            return {
                "success": False,
                "message": "У вас нет металлолома! Принесите его из обломков лагеря."}

        amt = scrap_slot.get("count", 1)
        player.remove_item("scrap", amt)
        self.sos_progress += amt

        if self.sos_progress >= 15:
            self.sos_completed = True
            self.sos_rescue_day = self.day + random.randint(2, 10)
            self.sos_helicopter_landed = False
            return {
                "success": True,
                "progress": 15,
                "sos_completed": True,
                "message": (
                    "ЗНАК SOS ПОЛНОСТЬЮ ВЫЛОЖЕН! Теперь вернитесь в лагерь "
                    "и выживайте, пока спасательный борт не заметит сигнал."
                )
            }

        return {
            "success": True,
            "progress": self.sos_progress,
            "message": f"Добавлен металл в знак SOS ({self.sos_progress}/15). Принесите еще!"}

    def board_sos_helicopter(self, player: Player) -> Dict[str, Any]:
        """Board the rescue helicopter on the SOS clearing."""
        curr_type = self.map_layout.get(player.room_coord, {}).get("type")
        if curr_type != "sos_clearing":
            return {
                "success": False,
                "message": "Спасательный вертолёт находится на поляне SOS!"
            }
        if not self.sos_helicopter_landed:
            return {
                "success": False,
                "message": "Вертолёт ещё не приземлился на поляне!"
            }

        self.status = "won"
        self.win_reason = "спасение вертолетом благодаря sos"
        return {
            "success": True,
            "won": True,
            "message": "Вы поднялись на борт вертолёта! Спасатели увозят вас из ледяной тайги!"
        }

    def fire_flare_rocket(self, player: Player) -> Dict[str, Any]:
        """Fire flare gun into the sky to alert the night helicopter."""
        if not player.has_item("flare_gun"):
            return {
                "success": False,
                "message": "У вас в рюкзаке нет сигнальной ракетницы!"
            }

        player.remove_item("flare_gun", 1)
        self.status = "won"
        self.win_reason = "Спасение ракетницей: вертолёт заметил сигнальную ракету и осветил лагерь прожектором!"
        return {
            "success": True,
            "won": True,
            "player_id": player.id,
            "x": player.x,
            "y": player.y,
            "message": "ВЫСТРЕЛ РАКЕТНИЦЫ! Ослепительная красная ракета взмыла в ночное небо!"
        }

    def breach_radio_tower(self, player: Player) -> Dict[str, Any]:
        """Breach locked door at the radio tower."""
        curr_type = self.map_layout.get(player.room_coord, {}).get("type")
        if curr_type != "radio_tower":
            return {"success": False, "message": "Вы не у радиовышки!"}
        if self.tower_breached:
            return {"success": False, "message": "Дверь бытовки уже взломана!"}
        if not player.has_item("axe"):
            return {
                "success": False,
                "message": "Дверь заперта на толстую цепь. Нужен топор для срубания замка!"}

        self.tower_breached = True
        return {
            "success": True,
            "message": "Вы срубили цепь топором! Доступ к радиопередатчику открыт."}

    def repair_and_broadcast(self, player: Player) -> Dict[str, Any]:
        """Repair radio with scrap and broadcast SOS from the tower."""
        curr_type = self.map_layout.get(player.room_coord, {}).get("type")
        if curr_type != "radio_tower":
            return {
                "success": False,
                "message": "Трансляция возможна только на радиовышке!"}
        if not self.tower_breached:
            return {
                "success": False,
                "message": "Сначала взломайте дверь вышки топором!"}

        if self.radio_repaired:
            return {
                "success": True,
                "radio_repaired": True,
                "message": "Сигнал уже передан в эфир! Ожидайте прибытия вертолёта в лагере."
            }

        scrap_slot = next(
            (s for s in player.inventory if s["id"] == "scrap"), None)
        if not player.has_item(
                "broken_radio") or not scrap_slot or scrap_slot.get("count", 0) < 5:
            return {
                "success": False,
                "message": "Для починки рации нужна сломанная рация из самолета и 5 металлолома!"}
        player.remove_item("broken_radio", 1)
        player.remove_item("scrap", 5)
        self.radio_repaired = True
        self.radio_rescue_day = self.day + random.randint(2, 10)
        self.radio_helicopter_landed = False

        return {
            "success": True,
            "radio_repaired": True,
            "message": (
                "СИГНАЛ SOS ПЕРЕДАН В ЭФИР! Военные приняли ваши координаты. "
                "Теперь вернитесь в лагерь и выживайте: спасатели готовят вылет к радиовышке!"
            )
        }

    def board_radio_helicopter(self, player: Player) -> Dict[str, Any]:
        """Board the rescue helicopter at the radio tower."""
        curr_type = self.map_layout.get(player.room_coord, {}).get("type")
        if curr_type != "radio_tower":
            return {
                "success": False,
                "message": "Спасательный вертолёт находится на поляне у радиовышки!"
            }
        if not self.radio_helicopter_landed:
            return {
                "success": False,
                "message": "Вертолёт ещё не приземлился у радиовышки!"
            }

        self.status = "won"
        self.win_reason = "спасение вертолетом благодаря радиовышке"
        return {
            "success": True,
            "won": True,
            "message": "Вы поднялись на борт вертолёта! Военные спасатели увозят вас из ледяной тайги!"
        }

    def trigger_sleep(self, player_id: str) -> Dict[str, Any]:
        """Player votes to sleep. Triggers night phase if all players ready."""
        p = self.players.get(player_id)
        if not p:
            return {"success": False, "message": "Игрок не найден"}
        if p.room_coord != (0, 0):
            return {
                "success": False,
                "message": "Спать можно только внутри укрытия в лагере!"}

        p.ready_to_sleep = True
        alive_players = [pl for pl in self.players.values() if pl.is_alive]
        all_ready = all(
            player.ready_to_sleep for player in alive_players)

        if not all_ready:
            return {
                "success": True,
                "waiting": True,
                "player_id": player_id,
                "name": p.name,
                "message": f"{p.name} лёг спать в укрытии."
            }

        # Both are ready -> run Night Phase!
        return self._run_night_phase()

    def trigger_wake_up(self, player_id: str) -> Dict[str, Any]:
        """Player votes to wake up. Morning begins only when all alive players are ready."""
        p = self.players.get(player_id)
        if not p:
            return {"success": False, "message": "Игрок не найден"}

        p.ready_to_wake = True
        alive_players = [player for player in self.players.values() if player.is_alive]
        all_ready = all(player.ready_to_wake for player in alive_players)

        if not all_ready:
            return {
                "success": True,
                "waiting": True,
                "player_id": player_id,
                "name": p.name,
                "message": "Вы готовы встретить новый день. Ожидание напарника..."
            }

        for player in self.players.values():
            player.ready_to_wake = False

        return {
            "success": True,
            "all_awake": True,
            "day": self.day,
            "message": f"Наступило утро дня {self.day}! Солнце осветило тайгу."
        }

    def _run_night_phase(self) -> Dict[str, Any]:
        self.day += 1
        for p in self.players.values():
            p.ready_to_sleep = False
            p.ready_to_wake = False
            # Hunger and Thirst decay ONLY during sleep!
            # Exact numbers requested by user: Hunger -15, Thirst -20
            p.hunger = max(0.0, p.hunger - 15.0)
            p.thirst = max(0.0, p.thirst - 20.0)

            # Daily energy/stamina is fully restored overnight
            p.stamina = p.max_stamina

            # Warmth and Health calculation based on fire
            if self.fire_level >= 3:
                p.warmth = min(100.0, p.warmth + 30.0)
            elif self.fire_level > 0:
                p.warmth = max(0.0, p.warmth - 10.0)
            else:
                p.warmth = 0.0
                p.health = max(0.0, p.health - 35.0)

            if p.hunger <= 0:
                p.health = max(0.0, p.health - 20.0)
            if p.thirst <= 0:
                p.health = max(0.0, p.health - 35.0)

            if p.health <= 0:
                p.is_alive = False

        # Fire decreases by 2 levels overnight
        self.fire_level = max(0, self.fire_level - 2)

        # Check if all players dead
        if all(not p.is_alive for p in self.players.values()):
            self.status = "lost"
            self.loss_reason = "Все выжившие погибли от суровых условий заснеженного леса."
            return {
                "night_passed": True,
                "event": {
                    "type": "game_over",
                    "title": "Смерть в тайге",
                    "desc": self.loss_reason
                },
                "game_over": True
            }

        # 1. Check SOS rescue helicopter arrival first
        if self.sos_completed and not self.sos_helicopter_landed:
            if self.day >= self.sos_rescue_day:
                self.sos_helicopter_landed = True
                wake_msg = (
                    "Нас разбудил шум вертолёта. Вдруг они нашли наше сообщение на поляне?"
                    if len(self.players) > 1 else
                    "Меня разбудил шум вертолёта. Вдруг они нашли моё сообщение на поляне?"
                )
                event_info = {
                    "type": "sos_helicopter_landed",
                    "title": "ГУЛ ВЕРТОЛЁТА НА РАССВЕТЕ!",
                    "desc": wake_msg
                }
                self.night_event = event_info
                self._spawn_rabbits()
                self._spawn_initial_resources()
                return {
                    "night_passed": True,
                    "day": self.day,
                    "event": event_info,
                    "fire_level": self.fire_level
                }

        # 2. Check Radio Tower rescue helicopter arrival
        if self.radio_repaired and not self.radio_helicopter_landed:
            if self.day >= self.radio_rescue_day:
                self.radio_helicopter_landed = True
                wake_msg = (
                    "Нас разбудил шум вертолёта. Кажется, спасатели высадились у радиовышки!"
                    if len(self.players) > 1 else
                    "Меня разбудил шум вертолёта. Кажется, спасатели высадились у радиовышки!"
                )
                event_info = {
                    "type": "radio_helicopter_landed",
                    "title": "ГУЛ ВЕРТОЛЁТА НАД ТАЙГОЙ!",
                    "desc": wake_msg
                }
                self.night_event = event_info
                self._spawn_rabbits()
                self._spawn_initial_resources()
                return {
                    "night_passed": True,
                    "day": self.day,
                    "event": event_info,
                    "fire_level": self.fire_level
                }

        # 2. Night helicopter flyby event (8% chance, between 5% and 10%)
        if random.random() < 0.08:
            has_flare_inv = any(p.has_item("flare_gun") for p in self.players.values())
            has_flare_chest = any(s["id"] == "flare_gun" for s in self.camp_chest)
            has_flare = has_flare_inv or has_flare_chest
            if has_flare:
                self.night_helicopter_active = True
                event_info = {
                    "type": "night_helicopter_active",
                    "title": "ГУЛ ВЕРТОЛЁТА В НОЧНОМ НЕБЕ!",
                    "desc": "Сквозь вой ветра слышен тяжелый рев винтов вертолёта! Быстрее возьмите сигнальную ракетницу и выстрелите в небо!",
                    "has_flare": True
                }
            else:
                event_info = {
                    "type": "night_helicopter_missed",
                    "title": "ГУЛ ВЕРТОЛЁТА В НОЧИ",
                    "desc": "ВАМ НЕЧЕМ ПРИВЛЕЧЬ ВНИМАНИЕ ВЕРТОЛЕТА. ШАНС ЧТО ВАС ЗАМЕТЯТ ОЧЕНЬ МАЛ.",
                    "has_flare": False
                }
            self.night_event = event_info
            self._spawn_rabbits()
            self._spawn_initial_resources()
            return {
                "night_passed": True,
                "day": self.day,
                "event": event_info,
                "fire_level": self.fire_level
            }

        # 3. Standard random night events
        event_info = {
            "type": "calm",
            "title": "Спокойная ночь",
            "desc": "Лес был тих, вы пережили ночь."
        }

        if random.random() < 0.35:
            roll = random.choice(["blizzard", "frost", "wolves"])
            if roll == "blizzard":
                self.fire_level = 0
                for p in self.players.values():
                    p.warmth = max(0.0, p.warmth - 30.0)
                event_info = {
                    "type": "blizzard_hit",
                    "title": "Ледяная ночная метель!",
                    "desc": "Свирепый буран задул костёр дотла! Мороз ворвался в укрытие. Вы получили переохлаждение!"
                }
            elif roll == "frost":
                wood_in_chest = next((s for s in self.camp_chest if s["id"] == "wood"), None)
                if wood_in_chest and wood_in_chest.get("count", 0) >= 3:
                    wood_in_chest["count"] -= 3
                    event_info = {
                        "type": "frost_saved",
                        "title": "Аномальные заморозки",
                        "desc": "Температура рухнула. Из запасов лагеря сожжено 3 полена, вы не замерзли."
                    }
                else:
                    for p in self.players.values():
                        p.health = max(10.0, p.health - 40.0)
                        p.warmth = max(0.0, p.warmth - 40.0)
                    event_info = {
                        "type": "frost_hit",
                        "title": "Аномальные заморозки: не хватило дров!",
                        "desc": "Дров в лагере не хватило для поддержания пламени. Вы получили глубокое обморожение!"
                    }
            elif roll == "wolves":
                has_weapon = any(p.has_item("axe") or p.has_item("flare_gun") for p in self.players.values())
                if self.fire_level >= 4 or has_weapon:
                    event_info = {
                        "type": "wolves_repelled",
                        "title": "Стая волков у лагеря",
                        "desc": "Волки подошли к обломкам, но яркий огонь и оружие отогнали хищников!"
                    }
                else:
                    for p in self.players.values():
                        p.health = max(0.0, p.health - 30.0)
                        if p.health <= 0:
                            p.is_alive = False
                    event_info = {
                        "type": "wolves_attack",
                        "title": "Нападение волков!",
                        "desc": "Костёр был слаб, и у вас не было оружия. Стая волков нанесла вам тяжелые раны!"
                    }

        self.night_event = event_info
        self._spawn_rabbits()
        self._spawn_initial_resources()

        return {
            "night_passed": True,
            "day": self.day,
            "event": event_info,
            "fire_level": self.fire_level
        }

    def respond_to_helicopter(self, player: Player,
                              action: str) -> Dict[str, Any]:
        """Respond to helicopter event with flare or fire."""
        if action == "flare":
            if player.has_item("flare_gun"):
                player.remove_item("flare_gun", 1)
                self.status = "won"
                self.win_reason = "Спасение ракетницей: яркая красная ракета озарила ночное небо, вертолет спас вас!"
                return {
                    "success": True,
                    "won": True,
                    "message": "ВЫСТРЕЛ РАКЕТНИЦЫ! Вертолёт увидел сигнал и садится!"}
            else:
                return {
                    "success": False,
                    "message": "У вас нет сигнальной ракетницы!"}
        elif action == "fire":
            if self.fire_level >= 3:
                # 20% chance
                if random.random() < 0.20:
                    self.status = "won"
                    self.win_reason = "Спасение костром: пилоты заметили столб пламени среди заснеженной тайги!"
                    return {
                        "success": True,
                        "won": True,
                        "message": "НЕВЕРОЯТНО! Пилоты разглядели пламя вашего костра и приземлились!"}
                else:
                    return {
                        "success": False,
                        "won": False,
                        "message": "Вертолёт пролетел мимо... Пилоты не заметили костер в метели."}
            else:
                return {
                    "success": False,
                    "won": False,
                    "message": "Костёр слишком слаб, чтобы пилоты могли заметить его в темноте!"}
        return {"success": False, "message": "Неизвестное действие"}

    def to_dict(self, for_player_id: Optional[str] = None):
        return {
            "room_id": self.room_id,
            "is_multiplayer": self.is_multiplayer,
            "day": self.day,
            "status": self.status,
            "win_reason": self.win_reason,
            "loss_reason": self.loss_reason,
            "fire_level": self.fire_level,
            "campfire_built": self.campfire_built,
            "lighter_found": self.lighter_found,
            "has_windbreak": self.has_windbreak,
            "camp_chest": self.camp_chest,
            "sos_progress": self.sos_progress,
            "sos_completed": self.sos_completed,
            "sos_rescue_day": self.sos_rescue_day,
            "sos_helicopter_landed": self.sos_helicopter_landed,
            "night_helicopter_active": self.night_helicopter_active,
            "tower_breached": self.tower_breached,
            "radio_repaired": self.radio_repaired,
            "radio_rescue_day": self.radio_rescue_day,
            "radio_helicopter_landed": self.radio_helicopter_landed,
            "players": {pid: p.to_dict() for pid, p in self.players.items()},
            "night_event": self.night_event
        }
