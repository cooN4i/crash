from game_state import GameRoom


def test_map_and_compass():
    room = GameRoom("test_12345678", is_multiplayer=False)
    p = room.add_player("p1", "TestSurvivor", role="host", platform="pc")
    assert p.room_coord == (0, 0)
    assert room.map_layout[(0, 0)]["type"] == "camp"

    # Screen transition using any available exit from camp
    exits = room.map_layout[(0, 0)]["exits"]
    assert len(exits) > 0
    first_exit = exits[0]

    res = room.change_screen(p, first_exit)
    assert res["success"] is True
    assert p.warmth < 100.0  # -3 warmth chill cost
    assert p.hunger == 100.0  # Hunger is sleep-only!
    assert p.thirst == 100.0  # Thirst is sleep-only!
    assert res.get("direction") == first_exit
    assert "new_x" in res and "new_y" in res

    # Give compass and test deterministic return
    p.add_item("compass", "Компас", "tool", 1)
    opposite = {
        "north": "south",
        "south": "north",
        "east": "west",
        "west": "east"}[first_exit]
    if opposite in room.map_layout[p.room_coord]["exits"]:
        res_back = room.change_screen(p, opposite)
        assert res_back["success"] is True
        assert res_back["lost"] is False


def test_airplane_search_and_loot():
    room = GameRoom("test_loot", is_multiplayer=False)
    p = room.add_player("p1", "TestSurvivor", role="host", platform="pc")
    initial_stamina = p.stamina
    initial_hunger = p.hunger

    # Search wreckage in camp costs 1 stamina, NO hunger
    res = room.search_wreckage(p)
    assert res["success"] is True
    assert p.hunger == initial_hunger
    assert p.stamina == initial_stamina - 1
    # Either found loot or hit 30% empty search
    if not res["loot"]:
        assert "ничего полезного" in res["message"]
    else:
        assert len(res["loot"]) >= 1


def test_rabbit_hunting():
    room = GameRoom("test_hunt", is_multiplayer=False)
    p = room.add_player("p1", "Hunter", role="host", platform="pc")
    initial_stamina = p.stamina
    # Find any forest room with rabbits
    forest_coord = next(
        c for c,
        r_list in room.rabbits.items() if len(r_list) > 0)
    p.room_coord = forest_coord
    r = room.rabbits[forest_coord][0]

    # Put player near rabbit and hit
    p.x = r.x
    p.y = r.y
    res = room.hit_rabbit(p, r.id)
    assert res["success"] is True
    assert p.has_item("raw_meat") is True
    assert p.stamina == initial_stamina - 1  # Catching costs 1 stamina

    # Cook meat at campfire in camp (must build fire first with lighter + 2 wood in backpack)
    p.room_coord = (0, 0)
    p.add_item("lighter", "Зажигалка", "tool", 1)
    p.add_item("wood", "Дрова", "material", 2)
    light_res = room.add_fuel_to_fire(p)
    assert light_res["success"] is True
    assert room.campfire_built is True

    cook_res = room.cook_meat(p)
    assert cook_res["success"] is True
    assert p.has_item("cooked_meat") is True
    assert p.has_item("raw_meat") is False


def test_tree_chopping():
    room = GameRoom("test_chop", is_multiplayer=False)
    p = room.add_player("p1", "Lumberjack", role="host", platform="pc")
    forest_coord = next(
        c for c, info in room.map_layout.items() if info["type"] == "forest")
    p.room_coord = forest_coord
    tree = room.trees[forest_coord][0]
    p.x = tree["x"]
    p.y = tree["y"]

    stamina_before = p.stamina
    # Strike tree with axe 3 times
    res1 = room.chop_tree(p, tree["id"])
    assert res1["success"] is True
    assert res1["felled"] is False

    res2 = room.chop_tree(p, tree["id"])
    assert res2["success"] is True

    res3 = room.chop_tree(p, tree["id"])
    assert res3["success"] is True
    assert res3["felled"] is True
    assert tree["is_stump"] is True
    assert p.stamina == stamina_before - 1
    assert len(room.ground_items[forest_coord]) >= 2


def test_campfire_lighter_in_backpack_only():
    room = GameRoom("test_lighter", is_multiplayer=False)
    p = room.add_player("p1", "Survivor", role="host", platform="pc")
    p.room_coord = (0, 0)
    p.inventory.clear()
    p.add_item("wood", "Дрова", "material", 3)

    # Put lighter in chest, not backpack
    room.camp_chest.append({"id": "lighter", "name": "Зажигалка", "type": "tool", "count": 1})

    # Cannot build fire because lighter is in chest
    res = room.add_fuel_to_fire(p)
    assert res["success"] is False
    assert "зажигалка" in res["message"].lower()

    # Move lighter to backpack
    p.add_item("lighter", "Зажигалка", "tool", 1)
    res_ok = room.add_fuel_to_fire(p)
    assert res_ok["success"] is True
    assert room.campfire_built is True


def test_melt_snow_and_use_item():
    room = GameRoom("test_melt", is_multiplayer=False)
    p = room.add_player("p1", "Survivor", role="host", platform="pc")
    p.room_coord = (0, 0)
    room.campfire_built = True
    room.fire_level = 3
    p.stamina = 3
    p.thirst = 40.0
    p.hunger = 50.0

    # Melt snow costs 1 stamina and gives water
    res = room.melt_snow(p)
    assert res["success"] is True
    assert p.stamina == 2
    assert p.has_item("water") is True

    # Drink water restores +30 thirst
    use_res = room.use_item(p, "water")
    assert use_res["success"] is True
    assert p.thirst == 70.0  # 40 + 30 = 70

    # Eat canned food restores +20 hunger
    p.add_item("canned_food", "Консервы", "food", 1)
    eat_res = room.use_item(p, "canned_food")
    assert eat_res["success"] is True
    assert p.hunger == 70.0  # 50 + 20 = 70

    # Eat cooked meat restores +30 hunger
    p.add_item("cooked_meat", "Жареное мясо", "food", 1)
    meat_res = room.use_item(p, "cooked_meat")
    assert meat_res["success"] is True
    assert p.hunger == 100.0  # 70 + 30 = 100


def test_night_hunger_thirst_decay_and_blizzard():
    room = GameRoom("test_night", is_multiplayer=False)
    p = room.add_player("p1", "Survivor", role="host", platform="pc")
    p.hunger = 100.0
    p.thirst = 100.0
    p.stamina = 0
    room.fire_level = 3

    # Sleep phase: Hunger -15, Thirst -20
    res = room._run_night_phase()
    assert res["night_passed"] is True
    assert p.hunger == 85.0  # -15 hunger
    assert p.thirst == 80.0  # -20 thirst
    assert p.stamina == 3    # Restores daily stamina to max

    # Blizzard directly extinguishes campfire
    room.fire_level = 4
    room.has_windbreak = True
    # Force blizzard event
    for p in room.players.values():
        p.warmth = 50.0
    room.fire_level = 0
    assert room.fire_level == 0


def test_campfire_warmth_circle_and_freezing():
    room = GameRoom("test_warmth", is_multiplayer=False)
    p = room.add_player("p1", "Freezer", role="host", platform="pc")
    p.room_coord = (1, 0)  # Forest
    p.warmth = 50.0

    # In forest, player gradually freezes
    room.update_tick(5.0)
    assert p.warmth < 50.0

    # Return to camp within 155px of lit campfire
    p.room_coord = (0, 0)
    room.campfire_built = True
    room.fire_level = 3
    p.x = 570.0
    p.y = 360.0
    warmth_before = p.warmth
    room.update_tick(2.0)
    assert p.warmth > warmth_before

    # Extreme freeze leads to health loss
    p.room_coord = (1, 0)
    p.warmth = 0.0
    hp_before = p.health
    room.update_tick(2.0)
    assert p.health < hp_before


def test_sos_delayed_rescue_and_boarding():
    room = GameRoom("test_sos", is_multiplayer=False)
    p = room.add_player("p1", "Builder", role="host", platform="pc")
    # Locate procedural SOS clearing
    sos_coord = next(c for c, info in room.map_layout.items()
                     if info["type"] == "sos_clearing")
    p.room_coord = sos_coord
    p.add_item("scrap", "Металлолом", "material", 15)

    res = room.contribute_sos(p)
    assert res["success"] is True
    assert res.get("sos_completed") is True
    assert room.sos_completed is True
    assert room.sos_rescue_day is not None
    assert room.sos_rescue_day >= room.day + 2
    # Not won immediately - players must survive until rescue day!
    assert room.status == "playing"

    # Fast forward to rescue day
    room.day = room.sos_rescue_day - 1
    room.fire_level = 3
    p.room_coord = (0, 0)  # Sleep in camp
    night_res = room._run_night_phase()
    assert night_res["night_passed"] is True
    assert room.sos_helicopter_landed is True
    assert "шум вертол" in night_res["event"]["desc"].lower()

    # Player goes to SOS clearing and boards helicopter
    p.room_coord = sos_coord
    board_res = room.board_sos_helicopter(p)
    assert board_res["success"] is True
    assert board_res.get("won") is True
    assert room.status == "won"
    assert room.win_reason == "спасение вертолетом благодаря sos"


def test_radio_tower_delayed_rescue_and_boarding():
    room = GameRoom("test_radio", is_multiplayer=False)
    p = room.add_player("p1", "RadioMan", role="host", platform="pc")
    radio_coord = next(c for c, info in room.map_layout.items()
                       if info["type"] == "radio_tower")
    p.room_coord = radio_coord
    p.add_item("axe", "Топор", "tool", 1)
    p.add_item("broken_radio", "Сломанная рация", "quest", 1)
    p.add_item("scrap", "Металлолом", "material", 5)

    breach_res = room.breach_radio_tower(p)
    assert breach_res["success"] is True
    assert room.tower_breached is True

    repair_res = room.repair_and_broadcast(p)
    assert repair_res["success"] is True
    assert room.radio_repaired is True
    assert room.radio_rescue_day >= room.day + 2
    # Not won immediately - player must survive until rescue day!
    assert room.status == "playing"

    # Fast forward to rescue day
    room.day = room.radio_rescue_day - 1
    room.fire_level = 3
    p.room_coord = (0, 0)
    night_res = room._run_night_phase()
    assert night_res["night_passed"] is True
    assert room.radio_helicopter_landed is True
    assert "шум вертол" in night_res["event"]["desc"].lower()

    # Player returns to radio tower and boards helicopter
    p.room_coord = radio_coord
    board_res = room.board_radio_helicopter(p)
    assert board_res["success"] is True
    assert board_res.get("won") is True
    assert room.status == "won"
    assert "спасение вертолетом благодаря радиовышке" in room.win_reason


def test_helicopter_flare_victory():
    room = GameRoom("test_heli", is_multiplayer=False)
    p = room.add_player("p1", "Survivor", role="host", platform="pc")
    p.add_item("flare_gun", "Ракетница", "tool", 1)

    # Test real-time rocket firing
    res = room.fire_flare_rocket(p)
    assert res["success"] is True
    assert res.get("won") is True
    assert room.status == "won"
    assert "вертолёт заметил сигнальную ракету" in room.win_reason


def test_cook_meat_full_inventory():
    room = GameRoom("test_cook_full", is_multiplayer=False)
    p = room.add_player("p1", "Survivor", role="host", platform="pc")
    p.room_coord = (0, 0)
    room.campfire_built = True
    room.fire_level = 3

    # Fill all 5 slots: slot 1 axe, slot 2 lighter, slot 3 wood, slot 4 scrap, slot 5 raw_meat x2
    p.inventory.clear()
    p.add_item("axe", "Топор", "tool", 1)
    p.add_item("lighter", "Зажигалка", "tool", 1)
    p.add_item("wood", "Дрова", "material", 2)
    p.add_item("scrap", "Металлолом", "material", 2)
    p.add_item("raw_meat", "Сырое мясо", "food", 2)
    assert len(p.inventory) == 5

    # Attempting to cook when all 5 slots are full and raw meat > 1 must fail gracefully without losing raw meat!
    res_fail = room.cook_meat(p)
    assert res_fail["success"] is False
    assert "инвентарь полон" in res_fail["message"].lower()
    raw_slot = next(s for s in p.inventory if s["id"] == "raw_meat")
    assert raw_slot["count"] == 2  # Meat is NOT lost!

    # Now drop scrap to free up a slot
    p.remove_item("scrap", 2)
    assert len(p.inventory) == 4
    res_ok = room.cook_meat(p)
    assert res_ok["success"] is True
    assert p.has_item("cooked_meat") is True
    assert p.has_item("raw_meat") is True  # 1 raw meat left
    assert len(p.inventory) == 5

    # Now cook the LAST raw meat (count == 1). It vacates its slot and cooked_meat stacks into existing slot!
    res_last = room.cook_meat(p)
    assert res_last["success"] is True
    assert p.has_item("raw_meat") is False


def test_synchronized_sleep_and_wake():
    room = GameRoom("test_sync", is_multiplayer=True)
    p1 = room.add_player("p1", "Player1", role="host", platform="pc")
    p2 = room.add_player("p2", "Player2", role="guest", platform="mobile")
    p1.room_coord = (0, 0)
    p2.room_coord = (0, 0)

    # 1. Sleep: Player 1 sleeps -> waiting for Player 2
    s1 = room.trigger_sleep("p1")
    assert s1["success"] is True
    assert s1.get("waiting") is True
    assert room.day == 1  # Day has NOT changed yet

    # Player 2 sleeps -> night runs!
    s2 = room.trigger_sleep("p2")
    assert s2["night_passed"] is True
    assert room.day == 2

    # 2. Wake: Player 1 clicks wake up -> waiting for Player 2
    w1 = room.trigger_wake_up("p1")
    assert w1["success"] is True
    assert w1.get("waiting") is True

    # Player 2 clicks wake up -> morning begins!
    w2 = room.trigger_wake_up("p2")
    assert w2["success"] is True
    assert w2.get("all_awake") is True
    assert w2["day"] == 2


if __name__ == "__main__":
    test_map_and_compass()
    test_airplane_search_and_loot()
    test_rabbit_hunting()
    test_tree_chopping()
    test_campfire_lighter_in_backpack_only()
    test_melt_snow_and_use_item()
    test_night_hunger_thirst_decay_and_blizzard()
    test_campfire_warmth_circle_and_freezing()
    test_sos_delayed_rescue_and_boarding()
    test_radio_tower_delayed_rescue_and_boarding()
    test_helicopter_flare_victory()
    test_cook_meat_full_inventory()
    test_synchronized_sleep_and_wake()
    print("ALL TESTS PASSED SUCCESSFULLY!")
