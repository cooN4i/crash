// Main Game Client Engine with Tree Chopping, Hitboxes, Campfire Lifecycle, and Smooth Movement
class CrashGame {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");
        this.renderer = new GameRenderer(this.canvas);
        this.sound = window.soundEngine;

        this.roomId = null;
        this.playerId = null;
        this.role = null;
        this.ws = null;

        this.gameState = {};
        this.mapLayout = {};
        this.trees = {};
        this.rabbits = {};
        this.groundItems = {};

        // Local input state
        this.keys = {};
        this.moveVector = { x: 0, y: 0 };
        this.isMobile = false;

        // Local physics & prediction state
        this.localPos = { x: 450, y: 350, angle: 0, walkCycle: 0 };
        this.remotePlayersLerp = {};
        this.lastMoveSent = 0;
        this.stepTimer = 0;

        // Debounce & throttles
        this.isTransitioning = false;
        this.transitionCooldown = 0;
        this.toastThrottles = {};
        this.interactionTarget = null;

        this.initPlatformDetection();
        this.initEventListeners();
        this.initJoystick();
        this.startGameLoop();
    }

    initPlatformDetection() {
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 900;
        if (this.isMobile) {
            document.getElementById("mobile-controls").style.display = "block";
        }
    }

    initJoystick() {
        const zone = document.getElementById("joystick-zone");
        if (zone) {
            this.joystick = new VirtualJoystick(zone, (vec) => {
                this.moveVector = vec;
            });
        }
    }

    initEventListeners() {
        // Keyboard controls
        window.addEventListener("keydown", (e) => {
            const chatInput = document.getElementById("chat-input");
            const isChatFocused = document.activeElement === chatInput;

            if (e.key === "Enter") {
                if (isChatFocused) {
                    this.sendChatMessage();
                } else {
                    this.openChat();
                }
                e.preventDefault();
                return;
            }
            if (e.key === "Escape" && isChatFocused) {
                this.closeChat();
                e.preventDefault();
                return;
            }

            if (isChatFocused) return;

            this.keys[e.key.toLowerCase()] = true;
            this.sound.init();

            if (e.key.toLowerCase() === "e" || e.key.toLowerCase() === "у") {
                this.triggerInteraction();
            }
            if (e.key.toLowerCase() === "t" || e.key.toLowerCase() === "е") {
                this.sendAction("melt_snow");
            }
            if (e.key.toLowerCase() === "g" || e.key.toLowerCase() === "п") {
                this.sendAction("cook_meat");
            }
            if (["1", "2", "3", "4", "5"].includes(e.key)) {
                this.useSlotItem(parseInt(e.key) - 1);
            }
            if (e.code === "Space") {
                this.triggerAttack();
                e.preventDefault();
            }
        });

        window.addEventListener("keyup", (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // Chat UI listeners
        const btnToggleChat = document.getElementById("btn-toggle-chat");
        if (btnToggleChat) {
            btnToggleChat.addEventListener("click", () => {
                const row = document.getElementById("chat-input-row");
                if (row.style.display === "none") {
                    this.openChat();
                } else {
                    this.closeChat();
                }
            });
        }
        const btnSendChat = document.getElementById("btn-send-chat");
        if (btnSendChat) {
            btnSendChat.addEventListener("click", () => this.sendChatMessage());
        }

        // Touch buttons
        document.getElementById("btn-touch-attack").addEventListener("click", () => {
            this.triggerAttack();
        });
        document.getElementById("btn-touch-interact").addEventListener("click", () => {
            this.triggerInteraction();
        });
        document.getElementById("btn-touch-chest").addEventListener("click", () => {
            this.toggleChestModal();
        });

        // Lobby buttons
        document.getElementById("btn-solo").addEventListener("click", () => this.createSingleplayer());
        document.getElementById("btn-create-coop").addEventListener("click", () => this.createCoopRoom());
        document.getElementById("btn-join-coop").addEventListener("click", () => this.joinCoopRoom());
        document.getElementById("btn-copy-code").addEventListener("click", () => this.copyRoomCode());
        document.getElementById("room-code-tag").addEventListener("click", () => this.copyRoomCode());

        // Modals
        document.getElementById("btn-close-chest").addEventListener("click", () => {
            document.getElementById("chest-modal").style.display = "none";
        });
        document.getElementById("btn-wake-up").addEventListener("click", () => {
            const wakeBtn = document.getElementById("btn-wake-up");
            wakeBtn.disabled = true;
            wakeBtn.innerText = "⏳ Ожидание напарника...";
            this.sendAction("wake_up");
        });
        document.getElementById("btn-heli-fire").addEventListener("click", () => {
            this.sendAction("respond_helicopter", { action: "fire" });
            document.getElementById("helicopter-actions").style.display = "none";
        });

        // Inventory slots clicking
        const slots = document.querySelectorAll(".inventory-slot");
        slots.forEach(slot => {
            slot.addEventListener("click", () => {
                const idx = parseInt(slot.getAttribute("data-slot"));
                this.useSlotItem(idx);
            });
        });
    }

    async createSingleplayer() {
        const name = document.getElementById("player-name-input").value.trim() || "Выживший";
        try {
            const res = await fetch("/api/rooms/singleplayer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ player_name: name, platform: this.isMobile ? "mobile" : "pc" })
            });
            const data = await res.json();
            if (data.success) {
                this.roomId = data.room_id;
                this.playerId = data.player_id;
                this.role = data.role;
                document.getElementById("lobby-modal").style.display = "none";
                this.connectWebSocket();
            }
        } catch (err) {
            this.showToast("Ошибка при создании игры");
        }
    }

    async createCoopRoom() {
        const name = document.getElementById("player-name-input").value.trim() || "Выживший 1";
        try {
            const res = await fetch("/api/rooms/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ player_name: name, platform: this.isMobile ? "mobile" : "pc" })
            });
            const data = await res.json();
            if (data.success) {
                this.roomId = data.room_id;
                this.playerId = data.player_id;
                this.role = data.role;
                document.getElementById("lobby-modal").style.display = "none";
                document.getElementById("waiting-modal").style.display = "flex";
                document.getElementById("display-room-id").innerText = this.roomId;
                this.connectWebSocket();
            }
        } catch (err) {
            this.showToast("Ошибка создания лобби");
        }
    }

    async joinCoopRoom() {
        const name = document.getElementById("player-name-input").value.trim() || "Выживший 2";
        const roomId = document.getElementById("join-room-input").value.trim();
        if (!roomId) {
            this.showToast("Введите ID комнаты!");
            return;
        }
        try {
            const res = await fetch("/api/rooms/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room_id: roomId, player_name: name, platform: this.isMobile ? "mobile" : "pc" })
            });
            const data = await res.json();
            if (data.success) {
                this.roomId = data.room_id;
                this.playerId = data.player_id;
                this.role = data.role;
                document.getElementById("lobby-modal").style.display = "none";
                this.connectWebSocket();
            } else {
                this.showToast(data.detail || "Не удалось подключиться");
            }
        } catch (err) {
            this.showToast("Ошибка подключения к комнате");
        }
    }

    connectWebSocket() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws/${this.roomId}/${this.playerId}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            document.getElementById("room-code-tag").innerText = `ID: ${this.roomId}`;
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };

        this.ws.onclose = () => {
            this.showToast("Связь с сервером потеряна");
        };
    }

    handleServerMessage(data) {
        if (data.type === "init") {
            this.mapLayout = data.map_layout || this.mapLayout;
        } else if (data.type === "room_state") {
            if (data.map_layout) {
                this.mapLayout = data.map_layout;
            } else if (data.state && data.state.map_layout) {
                this.mapLayout = data.state.map_layout;
            }

            const oldLocal = this.getLocalPlayer();
            const serverLocal = data.state.players ? data.state.players[this.playerId] : null;

            if (oldLocal && serverLocal) {
                if (oldLocal.coord[0] !== serverLocal.coord[0] || oldLocal.coord[1] !== serverLocal.coord[1]) {
                    this.localPos.x = serverLocal.x;
                    this.localPos.y = serverLocal.y;
                } else {
                    const dist = Math.hypot(this.localPos.x - serverLocal.x, this.localPos.y - serverLocal.y);
                    if (dist > 85) {
                        this.localPos.x = serverLocal.x;
                        this.localPos.y = serverLocal.y;
                    }
                }
            } else if (serverLocal) {
                this.localPos.x = serverLocal.x;
                this.localPos.y = serverLocal.y;
            }

            this.gameState = data.state;
            this.rabbits = data.rabbits || {};
            this.groundItems = data.ground_items || {};
            if (data.trees) {
                this.trees = data.trees;
            }

            const p = this.getLocalPlayer();
            if (p) {
                p.x = this.localPos.x;
                p.y = this.localPos.y;
                p.angle = this.localPos.angle;
                p.walkCycle = this.localPos.walkCycle;
            }

            if (Object.keys(this.gameState.players || {}).length >= 2) {
                document.getElementById("waiting-modal").style.display = "none";
            }

            this.updateHUD();
            this.checkGameOutcome();
        } else if (data.type === "action_result") {
            this.handleActionResult(data.action, data.result);
        }
    }

    handleActionResult(action, res) {
        if (action === "change_screen") {
            this.isTransitioning = false;
            const p = this.getLocalPlayer();

            if (!res.success) {
                if (p) {
                    this.localPos.x = Math.max(55, Math.min(1045, this.localPos.x));
                    this.localPos.y = Math.max(55, Math.min(595, this.localPos.y));
                    p.x = this.localPos.x;
                    p.y = this.localPos.y;
                }
                this.showToast(res.message, 5000);
            } else {
                if (res.new_x !== undefined && res.new_y !== undefined) {
                    this.localPos.x = res.new_x;
                    this.localPos.y = res.new_y;
                    if (p) {
                        p.x = res.new_x;
                        p.y = res.new_y;
                        p.coord = res.coord;
                    }
                }
                if (res.lost) {
                    this.showToast(res.message, 5000);
                } else {
                    this.showToast(res.message, 2500);
                }
            }
        } else if (action === "chop_tree") {
            if (res.success) {
                this.sound.playAxe();
                this.showToast(res.message);
            } else {
                this.showToast(res.message, 2000);
            }
        } else {
            if (res.message) {
                this.showToast(res.message);
            }
            if (action === "hit_rabbit" && res.success) {
                this.sound.playAxe();
            } else if (action === "sleep" && res.night_passed) {
                this.showNightModal(res);
            } else if (action === "repair_radio" && res.success) {
                this.sound.playRadio();
            } else if (action === "board_sos_helicopter" && res.won) {
                this.sound.playWin();
                this.showToast(res.message);
            } else if (action === "board_radio_helicopter" && res.won) {
                this.sound.playWin();
                this.showToast(res.message);
            } else if (action === "wake_up") {
                const wakeBtn = document.getElementById("btn-wake-up");
                if (res.waiting) {
                    wakeBtn.disabled = true;
                    wakeBtn.innerText = "⏳ Ожидание напарника...";
                    this.showToast(res.message);
                } else if (res.all_awake) {
                    wakeBtn.disabled = false;
                    document.getElementById("night-modal").style.display = "none";
                    if (!this.gameState.night_helicopter_active) {
                        this.renderer.isNightMode = false;
                        this.sound.stopNightHelicopterSound();
                    }
                    this.showToast(res.message, 3000);
                }
            } else if (action === "chat_message") {
                this.addChatMessage(res);
            } else if (action === "fire_flare_rocket") {
                if (res.success) {
                    const p = this.getLocalPlayer();
                    this.renderer.launchFlareRocket(res.x || (p ? p.x : 550), res.y || (p ? p.y : 360));
                    this.sound.playFlareShot();
                    this.sound.startNightHelicopterSound();
                    this.showToast(res.message);
                    setTimeout(() => {
                        this.sound.playSpotlightSweep();
                    }, 2000);
                    setTimeout(() => {
                        this.sound.stopNightHelicopterSound();
                        this.sound.playWin();
                    }, 3500);
                } else {
                    this.showToast(res.message, 2500);
                }
            }
        }
    }

    showNightModal(nightData) {
        const modal = document.getElementById("night-modal");
        const titleEl = document.getElementById("night-event-title");
        const descEl = document.getElementById("night-event-desc");
        const heliActions = document.getElementById("helicopter-actions");

        const ev = nightData.event || {};
        titleEl.innerText = ev.title || "🌙 НОЧЬ НАСТУПИЛА";
        descEl.innerText = ev.desc || "Ночь прошла спокойно.";
        heliActions.style.display = "none";

        const wakeBtn = document.getElementById("btn-wake-up");
        if (ev.type === "night_helicopter_active") {
            this.sound.startNightHelicopterSound();
            this.renderer.isNightMode = true;
            wakeBtn.innerText = "🚀 Встать и запустить ракету!";
        } else if (ev.type === "night_helicopter_missed") {
            this.sound.playHelicopter();
            this.renderer.isNightMode = false;
            wakeBtn.innerText = "Продолжить (Наступило утро)";
        } else if (ev.type === "sos_helicopter_landed") {
            this.sound.playHelicopter();
            this.renderer.isNightMode = false;
            wakeBtn.innerText = "🚁 Проснуться и проверить поляну SOS!";
        } else if (ev.type === "radio_helicopter_landed") {
            this.sound.playHelicopter();
            this.renderer.isNightMode = false;
            wakeBtn.innerText = "🚁 Проснуться и проверить радиовышку!";
        } else {
            this.renderer.isNightMode = false;
            wakeBtn.innerText = "Проснуться";
        }

        modal.style.display = "flex";
    }

    checkGameOutcome() {
        if (this.gameState.status === "won") {
            const vModal = document.getElementById("victory-modal");
            document.getElementById("victory-reason").innerText = this.gameState.win_reason || "Вы спасены!";
            document.getElementById("victory-stats").innerText = `Прожито дней: ${this.gameState.day}`;
            vModal.style.display = "flex";
        } else if (this.gameState.status === "lost") {
            const gModal = document.getElementById("gameover-modal");
            document.getElementById("gameover-reason").innerText = this.gameState.loss_reason || "Вы погибли.";
            gModal.style.display = "flex";
        }
    }

    sendAction(type, payload = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, ...payload }));
        }
    }

    lerpAngle(a, b, t) {
        let diff = (b - a) % (2 * Math.PI);
        if (diff < -Math.PI) diff += 2 * Math.PI;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        return a + diff * t;
    }

    updateLocalMovement(dt) {
        const p = this.getLocalPlayer();
        if (!p || !p.is_alive) return;

        if (this.transitionCooldown > 0) {
            this.transitionCooldown -= dt;
        }

        let dx = 0;
        let dy = 0;

        // Keyboard vector
        if (this.keys["w"] || this.keys["arrowup"]) dy -= 1;
        if (this.keys["s"] || this.keys["arrowdown"]) dy += 1;
        if (this.keys["a"] || this.keys["arrowleft"]) dx -= 1;
        if (this.keys["d"] || this.keys["arrowright"]) dx += 1;

        // Joystick vector
        if (this.moveVector.x !== 0 || this.moveVector.y !== 0) {
            dx = this.moveVector.x;
            dy = this.moveVector.y;
        }

        const len = Math.hypot(dx, dy);
        if (len > 0.05) {
            const normX = dx / (len > 1 ? len : 1);
            const normY = dy / (len > 1 ? len : 1);
            const speed = 190 * dt;

            // Calculate smooth angle facing direction of movement
            const targetAngle = Math.atan2(normY, normX);
            this.localPos.angle = this.lerpAngle(this.localPos.angle, targetAngle, 14 * dt);
            this.localPos.walkCycle += dt * 14;

            let nx = this.localPos.x + normX * speed;
            let ny = this.localPos.y + normY * speed;

            // Tree Trunk Collision (hitboxes prevent walking through trees)
            const coordStr = `${p.coord[0]}_${p.coord[1]}`;
            const roomTrees = this.trees[coordStr] || [];
            const playerRad = 14;

            for (let t of roomTrees) {
                const trunkRad = t.is_stump ? 14 : (t.radius || 20) * (t.size || 1.0);
                const dist = Math.hypot(nx - t.x, ny - t.y);
                const minDist = trunkRad + playerRad;

                if (dist < minDist && dist > 0.001) {
                    // Push player out smoothly along collision normal
                    const pushX = (nx - t.x) / dist;
                    const pushY = (ny - t.y) / dist;
                    nx = t.x + pushX * minDist;
                    ny = t.y + pushY * minDist;
                }
            }

            // Screen boundary & solid wall collision
            const effectiveMap = (this.mapLayout && Object.keys(this.mapLayout).length > 0)
                ? this.mapLayout
                : (this.gameState && this.gameState.map_layout ? this.gameState.map_layout : {});
            const roomInfo = effectiveMap[coordStr];
            const exitsList = (roomInfo && roomInfo.exits) ? roomInfo.exits : [];

            const wallThickness = 50;
            const gateMinX = (1100 - 150) / 2; // 475
            const gateMaxX = gateMinX + 150;    // 625
            const gateMinY = (650 - 150) / 2;  // 250
            const gateMaxY = gateMinY + 150;    // 400

            // North boundary collision: solid wall if no north exit or outside the gate opening
            if (!exitsList.includes("north") || nx < gateMinX || nx > gateMaxX) {
                ny = Math.max(wallThickness + 6, ny);
            }

            // South boundary collision: solid wall if no south exit or outside the gate opening
            if (!exitsList.includes("south") || nx < gateMinX || nx > gateMaxX) {
                ny = Math.min(650 - wallThickness - 6, ny);
            }

            // West boundary collision: solid wall if no west exit or outside the gate opening
            if (!exitsList.includes("west") || ny < gateMinY || ny > gateMaxY) {
                nx = Math.max(wallThickness + 6, nx);
            }

            // East boundary collision: solid wall if no east exit or outside the gate opening
            if (!exitsList.includes("east") || ny < gateMinY || ny > gateMaxY) {
                nx = Math.min(1100 - wallThickness - 6, nx);
            }

            // Screen edge transitions ONLY allowed through verified open gates!
            if (!this.isTransitioning && this.transitionCooldown <= 0) {
                let transitionDir = null;
                if (ny < 38 && exitsList.includes("north") && nx >= gateMinX && nx <= gateMaxX) {
                    transitionDir = "north";
                } else if (ny > 612 && exitsList.includes("south") && nx >= gateMinX && nx <= gateMaxX) {
                    transitionDir = "south";
                } else if (nx < 38 && exitsList.includes("west") && ny >= gateMinY && ny <= gateMaxY) {
                    transitionDir = "west";
                } else if (nx > 1062 && exitsList.includes("east") && ny >= gateMinY && ny <= gateMaxY) {
                    transitionDir = "east";
                }

                if (transitionDir) {
                    this.isTransitioning = true;
                    this.transitionCooldown = 1.2;
                    this.sendAction("change_screen", { direction: transitionDir });
                    return;
                }
            }

            this.localPos.x = Math.max(30, Math.min(1070, nx));
            this.localPos.y = Math.max(30, Math.min(620, ny));

            p.x = this.localPos.x;
            p.y = this.localPos.y;
            p.angle = this.localPos.angle;
            p.walkCycle = this.localPos.walkCycle;

            // Footprints & step sounds
            this.stepTimer += dt;
            if (this.stepTimer > 0.3) {
                this.stepTimer = 0;
                this.renderer.addFootprint(p.x, p.y + 4, this.localPos.angle);
                this.sound.playStep();
            }

            // Sync with server at ~20Hz
            const now = Date.now();
            if (now - this.lastMoveSent > 50) {
                this.lastMoveSent = now;
                this.sendAction("move", { x: p.x, y: p.y });
            }
        } else {
            this.localPos.walkCycle = 0;
            p.walkCycle = 0;
            p.angle = this.localPos.angle;
        }

        // Smooth remote players in co-op
        if (this.gameState.players) {
            for (let pid in this.gameState.players) {
                if (pid === this.playerId) continue;
                const remote = this.gameState.players[pid];
                if (!this.remotePlayersLerp[pid]) {
                    this.remotePlayersLerp[pid] = { x: remote.x, y: remote.y, angle: remote.angle || 0 };
                }
                const l = this.remotePlayersLerp[pid];
                const rdx = remote.x - l.x;
                const rdy = remote.y - l.y;
                if (Math.hypot(rdx, rdy) > 2) {
                    l.angle = Math.atan2(rdy, rdx);
                    remote.walkCycle = (remote.walkCycle || 0) + dt * 12;
                } else {
                    remote.walkCycle = 0;
                }
                l.x += rdx * Math.min(1, 14 * dt);
                l.y += rdy * Math.min(1, 14 * dt);
                remote.x = l.x;
                remote.y = l.y;
                remote.angle = l.angle;
            }
        }
    }

    updateInteractions() {
        const p = this.getLocalPlayer();
        const hint = document.getElementById("interaction-hint");
        if (!p || !p.is_alive) {
            hint.classList.remove("visible");
            return;
        }

        const coordStr = `${p.coord[0]}_${p.coord[1]}`;
        const roomInfo = this.mapLayout[coordStr];
        const roomType = roomInfo ? roomInfo.type : "forest";
        this.interactionTarget = null;

        // Base Camp
        if (roomType === "camp") {
            // Shelter / Sleep in airplane cabin
            if (Math.hypot(p.x - 242, p.y - 315) < 70) {
                this.interactionTarget = { type: "sleep" };
                hint.innerText = "[E] Лечь спать в самолёт (Начать ночь)";
                hint.classList.add("visible");
                return;
            }
            // Suitcases search in wreckage
            if (Math.hypot(p.x - 385, p.y - 300) < 70) {
                this.interactionTarget = { type: "search_wreckage" };
                hint.innerText = "[E] Обыскать чемоданы (-1 энергия)";
                hint.classList.add("visible");
                return;
            }
            // Airplane Tail section for shared supplies
            if (Math.hypot(p.x - 492, p.y - 280) < 70) {
                this.interactionTarget = { type: "open_chest" };
                hint.innerText = "[E] Запасы самолёта (Багажный отсек)";
                hint.classList.add("visible");
                return;
            }

            // Campfire Lifecycle:
            // 1. Not built: requires lighter & 2 wood in backpack
            // 2. Extinguished: relight with lighter + 1 wood
            // 3. Lit: add fuel / cook meat / [T] melt snow
            if (Math.hypot(p.x - 570, p.y - 360) < 85) {
                if (!this.gameState.campfire_built) {
                    const woodCount = (p.inventory || []).filter(i => i.id === "wood").reduce((acc, i) => acc + (i.count || 1), 0);
                    const hasLighter = (p.inventory || []).some(i => i.id === "lighter");
                    this.interactionTarget = { type: "add_fuel" };
                    if (hasLighter && woodCount >= 2) {
                        hint.innerText = "[E] Разжечь костёр (Зажигалка + 2 бревна)";
                    } else if (hasLighter) {
                        hint.innerText = `[E] Для костра нужно 2 дерева (${woodCount}/2 в рюкзаке)`;
                    } else {
                        hint.innerText = "[E] Для костра нужна зажигалка в рюкзаке!";
                    }
                    hint.classList.add("visible");
                    return;
                } else {
                    const fireLevel = this.gameState.fire_level || 0;
                    if (fireLevel === 0) {
                        this.interactionTarget = { type: "add_fuel" };
                        hint.innerText = "[E] Разжечь потухший костёр (зажигалка + 1 дерево)";
                    } else {
                        const hasMeat = p.inventory.some(i => i.id === "raw_meat");
                        this.interactionTarget = { type: "add_fuel" };
                        if (hasMeat) {
                            hint.innerText = `[E] Дрова (${fireLevel}/5) | [G] Пожарить мясо | [T] Растопить снег (+вода)`;
                        } else {
                            hint.innerText = `[E] Подбросить дров (${fireLevel}/5) | [G] Жарить мясо | [T] Растопить снег (+вода)`;
                        }
                    }
                    hint.classList.add("visible");
                    return;
                }
            }
        }

        // SOS Clearing
        if (roomType === "sos_clearing") {
            if (this.gameState.sos_helicopter_landed) {
                if (Math.hypot(p.x - 550, p.y - 160) < 110) {
                    this.interactionTarget = { type: "board_sos_helicopter" };
                    hint.innerText = "[E] Сесть в вертолет (Спасение!)";
                    hint.classList.add("visible");
                    return;
                }
            }
            if (Math.hypot(p.x - 550, p.y - 310) < 120) {
                if (!this.gameState.sos_completed) {
                    this.interactionTarget = { type: "contribute_sos" };
                    hint.innerText = "[E] Выложить металлолом в знак SOS";
                    hint.classList.add("visible");
                    return;
                } else if (!this.gameState.sos_helicopter_landed) {
                    hint.innerText = "Знак SOS выложен! Ждите поисковый вертолёт в лагере...";
                    hint.classList.add("visible");
                    return;
                }
            }
        }

        // Radio Tower
        if (roomType === "radio_tower") {
            if (this.gameState.radio_helicopter_landed) {
                if (Math.hypot(p.x - 280, p.y - 170) < 110) {
                    this.interactionTarget = { type: "board_radio_helicopter" };
                    hint.innerText = "[E] Сесть в вертолёт (Спасение!) 🚁";
                    hint.classList.add("visible");
                    return;
                }
            }
            if (Math.hypot(p.x - 550, p.y - 360) < 80) {
                if (!this.gameState.tower_breached) {
                    this.interactionTarget = { type: "breach_tower" };
                    hint.innerText = "[E] Срубить цепь топором и вскрыть дверь";
                } else if (!this.gameState.radio_repaired) {
                    this.interactionTarget = { type: "repair_radio" };
                    hint.innerText = "[E] Настроить рацию (рация + 5 металла) и вызвать спасателей";
                } else {
                    this.interactionTarget = null;
                    if (this.gameState.radio_helicopter_landed) {
                        hint.innerText = "Спасательный вертолёт уже ждёт рядом на поляне!";
                    } else {
                        hint.innerText = "Сигнал передан в эфир! Ждите спасательный борт в лагере...";
                    }
                }
                hint.classList.add("visible");
                return;
            }
        }

        // Dropped Wood Logs on Ground
        const items = this.groundItems[coordStr] || [];
        for (let item of items) {
            if (Math.hypot(p.x - item.x, p.y - item.y) < 45) {
                this.interactionTarget = { type: "pickup_item", item_id: item.id };
                hint.innerText = `[E] Подобрать: ${item.name}`;
                hint.classList.add("visible");
                return;
            }
        }

        hint.classList.remove("visible");
    }

    triggerInteraction() {
        if (!this.interactionTarget) return;
        const target = this.interactionTarget;

        if (target.type === "open_chest") {
            this.toggleChestModal();
        } else if (target.type === "pickup_item") {
            this.sendAction("pickup_ground_item", { item_id: target.item_id });
        } else {
            this.sendAction(target.type);
        }
    }

    triggerAttack() {
        this.sound.playAxe();
        const p = this.getLocalPlayer();
        if (!p || !p.is_alive) return;

        p.attackTimer = 0.25; // Axe swing slash effect

        const coordStr = `${p.coord[0]}_${p.coord[1]}`;

        // 1. Check closest tree to chop with axe
        const tList = this.trees[coordStr] || [];
        let closestTree = null;
        let minTreeDist = 85;
        for (let t of tList) {
            if (t.is_stump) continue;
            const d = Math.hypot(p.x - t.x, p.y - t.y);
            if (d < minTreeDist) {
                minTreeDist = d;
                closestTree = t;
            }
        }

        if (closestTree) {
            this.sendAction("chop_tree", { tree_id: closestTree.id });
            closestTree.hitTimer = 0.3;
            this.renderer.addWoodChips(closestTree.x, closestTree.y - 40);
            return;
        }

        // 2. Check closest rabbit to hunt with axe
        const rList = this.rabbits[coordStr] || [];
        let closestRabbit = null;
        let minRabbitDist = 95;
        for (let r of rList) {
            const d = Math.hypot(p.x - r.x, p.y - r.y);
            if (d < minRabbitDist) {
                minRabbitDist = d;
                closestRabbit = r;
            }
        }

        if (closestRabbit) {
            this.sendAction("hit_rabbit", { rabbit_id: closestRabbit.id });
        }
    }

    useSlotItem(slotIdx) {
        const p = this.getLocalPlayer();
        if (!p || !p.inventory || !p.inventory[slotIdx]) return;
        const item = p.inventory[slotIdx];

        if (item.type === "food") {
            this.sendAction("use_item", { item_id: item.id });
        } else if (item.id === "wood") {
            if (p.coord[0] === 0 && p.coord[1] === 0) {
                this.sendAction("add_fuel");
            } else {
                this.showToast("Дровами можно строить и топить костёр в базовом лагере!");
            }
        } else if (item.id === "compass") {
            this.showToast("🧭 Компас активен! Он гарантирует точный возврат без потери направления.");
        } else if (item.id === "flare_gun") {
            this.sendAction("fire_flare_rocket");
        } else if (item.id === "lighter") {
            this.showToast("🔥 Газовая зажигалка готова для розжига костра в лагере!");
        }
    }

    toggleChestModal() {
        const modal = document.getElementById("chest-modal");
        if (modal.style.display === "flex") {
            modal.style.display = "none";
            return;
        }
        modal.style.display = "flex";
        this.renderChestGrids();
    }

    renderChestGrids() {
        const chestContainer = document.getElementById("chest-items-grid");
        const bpContainer = document.getElementById("backpack-items-grid");
        chestContainer.innerHTML = "";
        bpContainer.innerHTML = "";

        const chestItems = this.gameState.camp_chest || [];
        for (let it of chestItems) {
            const div = document.createElement("div");
            div.className = "inventory-slot";
            div.innerHTML = `<span class="slot-icon">${this.getItemIcon(it.id)}</span>
                             <span class="slot-name">${it.name}</span>
                             <span class="slot-count">${it.count || 1}</span>`;
            div.onclick = () => {
                this.sendAction("camp_chest_transfer", { direction: "to_inventory", item_id: it.id });
                setTimeout(() => this.renderChestGrids(), 100);
            };
            chestContainer.appendChild(div);
        }

        const p = this.getLocalPlayer();
        const bpItems = p ? p.inventory : [];
        for (let it of bpItems) {
            const div = document.createElement("div");
            div.className = "inventory-slot";
            div.innerHTML = `<span class="slot-icon">${this.getItemIcon(it.id)}</span>
                             <span class="slot-name">${it.name}</span>
                             <span class="slot-count">${it.count || 1}</span>`;
            div.onclick = () => {
                this.sendAction("camp_chest_transfer", { direction: "to_chest", item_id: it.id });
                setTimeout(() => this.renderChestGrids(), 100);
            };
            bpContainer.appendChild(div);
        }
    }

    getItemIcon(itemId) {
        const icons = {
            wood: "🪵",
            scrap: "🔩",
            canned_food: "🥫",
            water: "💧",
            raw_meat: "🥩",
            cooked_meat: "🍖",
            axe: "🪓",
            lighter: "🔥",
            compass: "🧭",
            flare_gun: "🚀",
            broken_radio: "📻"
        };
        return icons[itemId] || "📦";
    }

    updateHUD() {
        const p = this.getLocalPlayer();
        if (!p) return;

        document.getElementById("health-bar").style.width = `${Math.max(0, p.health)}%`;
        document.getElementById("warmth-bar").style.width = `${Math.max(0, p.warmth)}%`;
        document.getElementById("hunger-bar").style.width = `${Math.max(0, p.hunger)}%`;
        document.getElementById("thirst-bar").style.width = `${Math.max(0, p.thirst || 0)}%`;
        const curStam = p.stamina !== undefined ? p.stamina : 3;
        const maxStam = p.max_stamina || 3;
        for (let i = 0; i < 3; i++) {
            const pipEl = document.getElementById(`stamina-pip-${i}`);
            if (pipEl) {
                pipEl.className = i < curStam ? "stamina-pip active" : "stamina-pip spent";
            }
        }
        document.getElementById("stamina-text").innerText = `${curStam}/${maxStam}`;
        document.getElementById("day-counter").innerText = `День ${this.gameState.day || 1}`;

        const fireLevel = this.gameState.fire_level || 0;
        const fireMeter = document.getElementById("fire-meter-box");
        if (fireMeter) {
            fireMeter.style.display = fireLevel > 0 ? "flex" : "none";
        }
        const pips = document.querySelectorAll("#fire-pips .fire-pip");
        pips.forEach((pip, idx) => {
            if (idx < fireLevel) {
                pip.classList.add("active");
            } else {
                pip.classList.remove("active");
            }
        });

        const slots = document.querySelectorAll("#hud-bottom .inventory-slot");
        slots.forEach((slot, idx) => {
            const it = p.inventory[idx];
            if (it) {
                slot.innerHTML = `
                    <span class="slot-hotkey">[${idx + 1}]</span>
                    <span class="slot-icon">${this.getItemIcon(it.id)}</span>
                    <span class="slot-name">${it.name}</span>
                    <span class="slot-count">${it.count > 1 ? it.count : ''}</span>
                `;
            } else {
                slot.innerHTML = `<span class="slot-hotkey">[${idx + 1}]</span>`;
            }
        });
    }

    getLocalPlayer() {
        return this.gameState.players ? this.gameState.players[this.playerId] : null;
    }

    showToast(msg, throttleMs = 0) {
        if (!msg) return;
        const now = Date.now();
        if (throttleMs > 0) {
            if (this.toastThrottles[msg] && (now - this.toastThrottles[msg]) < throttleMs) {
                return;
            }
            this.toastThrottles[msg] = now;
        }

        const container = document.getElementById("toast-container");
        if (!container) return;

        while (container.children.length >= 3) {
            container.removeChild(container.firstChild);
        }

        const toast = document.createElement("div");
        toast.className = "toast";
        toast.innerText = msg;
        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 3500);
    }

    copyRoomCode() {
        if (!this.roomId) return;
        navigator.clipboard.writeText(this.roomId).then(() => {
            this.showToast(`ID комнаты скопирован: ${this.roomId}`);
        });
    }

    openChat() {
        const row = document.getElementById("chat-input-row");
        const input = document.getElementById("chat-input");
        if (!row || !input) return;
        row.style.display = "flex";
        input.focus();
    }

    closeChat() {
        const row = document.getElementById("chat-input-row");
        const input = document.getElementById("chat-input");
        if (!row || !input) return;
        row.style.display = "none";
        input.blur();
    }

    sendChatMessage() {
        const input = document.getElementById("chat-input");
        if (!input) return;
        const text = input.value.trim();
        if (text) {
            this.sendAction("chat_message", { text: text });
            input.value = "";
        }
        this.closeChat();
    }

    addChatMessage(msg) {
        const container = document.getElementById("chat-messages");
        if (container) {
            const el = document.createElement("div");
            el.className = "chat-msg";
            el.innerHTML = `<span class="chat-time">${msg.time || ""}</span><span class="chat-name">${msg.name || "Выживший"}:</span>${msg.text}`;
            container.appendChild(el);
            container.scrollTop = container.scrollHeight;
        }

        if (this.renderer && msg.player_id) {
            this.renderer.addSpeechBubble(msg.player_id, msg.text);
        }
    }

    startGameLoop() {
        let lastTime = performance.now();
        const loop = (time) => {
            const dt = Math.min((time - lastTime) / 1000, 0.1);
            lastTime = time;

            this.updateLocalMovement(dt);
            this.updateInteractions();
            this.renderer.update(dt, this.gameState.fire_level || 0);
            this.renderer.render(
                this.gameState,
                this.playerId,
                this.mapLayout,
                this.rabbits,
                this.groundItems,
                this.trees
            );

            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

window.addEventListener("DOMContentLoaded", () => {
    window.gameApp = new CrashGame();
});
