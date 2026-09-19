// 3/4 Perspective 2.5D Renderer with Y-Sorting, Tree Chopping, and Seamless Illustrated Terrain
class GameRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.width = 1100;
        this.height = 650;

        // Image assets with transparent off-screen processing
        this.rawImages = {
            airplane: new Image(),
            pineTree: new Image(),
            survivor: new Image(),
            rabbit: new Image(),
            snowGround: new Image()
        };
        this.processedImages = {
            airplane: null,
            pineTree: null,
            survivor: null,
            rabbit: null,
            snowGround: null
        };

        this.initImageSources();

        // Particle systems
        this.snowParticles = [];
        this.fireParticles = [];
        this.smokeParticles = [];
        this.woodChips = [];
        this.footprints = [];
        this.flameTimer = 0;

        // Cinematic effects (night helicopter, flare, spotlight)
        this.flareRocket = null;
        this.spotlight = null;
        this.isNightMode = false;
        this.speechBubbles = {};

        this.initSnowParticles();
    }

    initImageSources() {
        this.rawImages.snowGround.src = "/static/assets/snow_ground.jpg";

        const setupTransparent = (key, src, threshold = 238) => {
            const img = this.rawImages[key];
            img.onload = () => {
                this.processedImages[key] = this.createTransparentSprite(img, threshold);
            };
            img.src = src;
        };

        setupTransparent("survivor", "/static/assets/survivor.jpg", 232);
        setupTransparent("pineTree", "/static/assets/pine_tree.jpg", 238);
        setupTransparent("rabbit", "/static/assets/rabbit.jpg", 238);

        // Airplane image with soft border fade so it seamlessly melts into the snow
        this.rawImages.airplane.onload = () => {
            this.processedImages.airplane = this.createFeatheredAirplane(this.rawImages.airplane);
        };
        this.rawImages.airplane.src = "/static/assets/airplane.jpg";
    }

    createTransparentSprite(img, threshold) {
        const off = document.createElement("canvas");
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        off.width = w;
        off.height = h;
        const octx = off.getContext("2d");
        octx.drawImage(img, 0, 0);

        try {
            const imgData = octx.getImageData(0, 0, w, h);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
                const r = d[i], g = d[i + 1], b = d[i + 2];
                // Check if pixel is white background
                if (r >= threshold && g >= threshold && b >= threshold) {
                    d[i + 3] = 0;
                } else if (r >= threshold - 30 && g >= threshold - 30 && b >= threshold - 30) {
                    // Soft edge anti-aliasing
                    const avg = (r + g + b) / 3;
                    const factor = (avg - (threshold - 30)) / 30;
                    d[i + 3] = Math.floor(d[i + 3] * Math.max(0, 1 - factor));
                }
            }
            octx.putImageData(imgData, 0, 0);
        } catch (e) {
            return img;
        }
        return off;
    }

    createFeatheredAirplane(img) {
        const off = document.createElement("canvas");
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        off.width = w;
        off.height = h;
        const octx = off.getContext("2d");
        octx.drawImage(img, 0, 0);

        // Seamless soft rectangle edge fade so outer snow melts into canvas snow
        try {
            const padX = Math.floor(w * 0.14);
            const padY = Math.floor(h * 0.16);
            const imgData = octx.getImageData(0, 0, w, h);
            const d = imgData.data;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    let alphaX = 1.0;
                    if (x < padX) alphaX = Math.pow(x / padX, 1.4);
                    if (x > w - padX) alphaX = Math.min(alphaX, Math.pow((w - x) / padX, 1.4));

                    let alphaY = 1.0;
                    if (y < padY) alphaY = Math.pow(y / padY, 1.4);
                    if (y > h - padY) alphaY = Math.min(alphaY, Math.pow((h - y) / padY, 1.4));

                    const alpha = alphaX * alphaY;
                    if (alpha < 1.0) {
                        const idx = (y * w + x) * 4;
                        d[idx + 3] = Math.floor(d[idx + 3] * alpha);
                    }
                }
            }
            octx.putImageData(imgData, 0, 0);
        } catch (e) {
            return img;
        }
        return off;
    }

    initSnowParticles() {
        for (let i = 0; i < 140; i++) {
            this.snowParticles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: Math.random() * 2.0 + 0.8,
                speedX: Math.random() * 2 - 2.8,
                speedY: Math.random() * 2.5 + 1.2,
                alpha: Math.random() * 0.7 + 0.3
            });
        }
    }

    addFootprint(x, y, angle) {
        this.footprints.push({
            x, y, angle,
            alpha: 0.5
        });
        if (this.footprints.length > 70) {
            this.footprints.shift();
        }
    }

    addWoodChips(x, y) {
        for (let i = 0; i < 10; i++) {
            this.woodChips.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 15,
                vx: (Math.random() - 0.5) * 120,
                vy: -Math.random() * 80 - 30,
                size: Math.random() * 3 + 2,
                life: 1.0,
                color: Math.random() > 0.4 ? "#854d0e" : "#fef08a"
            });
        }
    }

    update(dt, fireLevel = 0) {
        this.flameTimer += dt * 7;

        // Update snowflakes
        for (let p of this.snowParticles) {
            p.x += p.speedX;
            p.y += p.speedY;
            if (p.y > this.height) {
                p.y = -5;
                p.x = Math.random() * (this.width + 100);
            }
            if (p.x < -10) {
                p.x = this.width + 5;
            }
        }

        // Fade footprints in snow
        for (let i = this.footprints.length - 1; i >= 0; i--) {
            this.footprints[i].alpha -= dt * 0.025;
            if (this.footprints[i].alpha <= 0) {
                this.footprints.splice(i, 1);
            }
        }

        // Update wood chips from axe chopping
        for (let i = this.woodChips.length - 1; i >= 0; i--) {
            const c = this.woodChips[i];
            c.life -= dt * 2.5;
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            c.vy += 220 * dt; // gravity
            if (c.life <= 0) {
                this.woodChips.splice(i, 1);
            }
        }

        // Animated Campfire Particles
        const cx = 570;
        const cy = 360;
        if (fireLevel > 0) {
            const spawnCount = Math.floor(fireLevel * 3.5);
            for (let i = 0; i < spawnCount; i++) {
                this.fireParticles.push({
                    x: cx + (Math.random() - 0.5) * (20 + fireLevel * 4),
                    y: cy + (Math.random() - 0.5) * 8 - 4,
                    vx: (Math.random() - 0.5) * 26,
                    vy: -Math.random() * (45 + fireLevel * 20) - 35,
                    size: Math.random() * (5 + fireLevel * 2.5) + 2.5,
                    life: 1.0,
                    decay: Math.random() * 1.6 + 1.1,
                    colorType: Math.random()
                });
            }

            if (Math.random() < 0.28) {
                this.smokeParticles.push({
                    x: cx + (Math.random() - 0.5) * 18,
                    y: cy - 25,
                    vx: (Math.random() - 0.5) * 14 - 10,
                    vy: -Math.random() * 30 - 22,
                    size: Math.random() * 12 + 10,
                    life: 1.0,
                    decay: 0.45
                });
            }
        }

        // Update flame particles
        for (let i = this.fireParticles.length - 1; i >= 0; i--) {
            const p = this.fireParticles[i];
            p.life -= p.decay * dt;
            p.x += p.vx * dt + Math.sin(p.life * 12) * 1.2;
            p.y += p.vy * dt;
            p.size *= 0.95;
            if (p.life <= 0 || p.size <= 0.4) {
                this.fireParticles.splice(i, 1);
            }
        }

        // Update smoke particles
        for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
            const p = this.smokeParticles[i];
            p.life -= p.decay * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.size += dt * 16;
            if (p.life <= 0) {
                this.smokeParticles.splice(i, 1);
            }
        }

        // Update flare rocket
        if (this.flareRocket) {
            const r = this.flareRocket;
            r.timer += dt;
            r.y += r.vy * dt;
            r.redGlow = Math.min(1.0, r.redGlow + dt * 2.0);

            // Spawn sparks and smoke trail
            for (let i = 0; i < 3; i++) {
                r.sparks.push({
                    x: r.x + (Math.random() - 0.5) * 8,
                    y: r.y + Math.random() * 12,
                    vx: (Math.random() - 0.5) * 40,
                    vy: Math.random() * 50 + 20,
                    life: 1.0,
                    color: Math.random() > 0.3 ? "#ef4444" : "#fef08a",
                    size: Math.random() * 3 + 2
                });
            }

            // Update rocket sparks
            for (let i = r.sparks.length - 1; i >= 0; i--) {
                const s = r.sparks[i];
                s.life -= dt * 2.2;
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                if (s.life <= 0) r.sparks.splice(i, 1);
            }

            // Exactly 2.0 seconds after rocket launch: smoothly activate searchlight beam onto player location!
            if (r.timer >= 2.0 && !this.spotlight) {
                this.startSpotlight(r.startX, r.startY);
            }

            if (r.y < -200 && r.sparks.length === 0 && r.timer > 4.5) {
                this.flareRocket = null;
            }
        }

        // Update searchlight beam
        if (this.spotlight) {
            const sp = this.spotlight;
            sp.timer += dt;
            sp.radius += (sp.targetRadius - sp.radius) * Math.min(1, 3.5 * dt);
            sp.alpha = Math.min(0.9, sp.alpha + dt * 1.5);
        }

        // Update speech bubbles
        if (this.speechBubbles) {
            for (let pid in this.speechBubbles) {
                this.speechBubbles[pid].timer -= dt;
                if (this.speechBubbles[pid].timer <= 0) {
                    delete this.speechBubbles[pid];
                }
            }
        }
    }

    addSpeechBubble(playerId, text) {
        if (!this.speechBubbles) this.speechBubbles = {};
        this.speechBubbles[playerId] = {
            text: text.length > 35 ? text.substring(0, 32) + "..." : text,
            timer: 4.5
        };
    }

    render(gameState, localPlayerId, mapLayout, rabbits, groundItems, trees) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        const localPlayer = gameState.players ? gameState.players[localPlayerId] : null;
        const currentCoord = localPlayer ? `${localPlayer.coord[0]}_${localPlayer.coord[1]}` : "0_0";
        const effectiveMap = (mapLayout && Object.keys(mapLayout).length > 0)
            ? mapLayout
            : (gameState && gameState.map_layout ? gameState.map_layout : {});
        const roomInfo = effectiveMap[currentCoord] || null;
        const roomType = roomInfo ? roomInfo.type : (currentCoord === "0_0" ? "camp" : "forest");
        const exits = (roomInfo && roomInfo.exits) ? roomInfo.exits : [];

        // 1. Snow ground matching the hand-drawn style of the airplane
        this.drawSnowBackground(ctx, currentCoord, roomType);

        // 2. Screen borders and open pathways
        this.drawRoomBorders(ctx, exits);

        // 3. Footprints in snow
        this.drawFootprints(ctx);

        // 4. Large static set-pieces that sit directly on the ground
        if (roomType === "camp") {
            this.drawCampSetPiece(ctx, gameState);
            if (gameState.campfire_built && (gameState.fire_level || 0) > 0) {
                this.drawWarmthCircle(ctx, 570, 360);
            }
        } else if (roomType === "sos_clearing") {
            this.drawSOSClearing(ctx, gameState);
        } else if (roomType === "radio_tower") {
            this.drawRadioTower(ctx, gameState);
        }

        // 5. Y-SORTED ENTITY RENDERING PIPELINE (Trees, Players, Items, Rabbits, Campfire)
        const yEntities = [];

        // Add Trees & Stumps
        const roomTrees = trees ? (trees[currentCoord] || []) : [];
        for (let t of roomTrees) {
            yEntities.push({ type: "tree", sortY: t.y, data: t });
        }

        // Add Ground items (wood logs, dropped items)
        const items = groundItems ? (groundItems[currentCoord] || []) : [];
        for (let it of items) {
            yEntities.push({ type: "item", sortY: it.y, data: it });
        }

        // Add Rabbits
        const rList = rabbits ? (rabbits[currentCoord] || []) : [];
        for (let r of rList) {
            yEntities.push({ type: "rabbit", sortY: r.y, data: r });
        }

        // Add Campfire (if in camp and already built - no blueprint before building)
        if (roomType === "camp" && gameState.campfire_built) {
            yEntities.push({ type: "campfire", sortY: 360, data: gameState.fire_level || 0 });
        }

        // Add Players in this room
        if (gameState.players) {
            for (let pid in gameState.players) {
                const p = gameState.players[pid];
                if (p.coord[0] === (localPlayer ? localPlayer.coord[0] : 0) &&
                    p.coord[1] === (localPlayer ? localPlayer.coord[1] : 0)) {
                    yEntities.push({ type: "player", sortY: p.y, data: p, isLocal: pid === localPlayerId });
                }
            }
        }

        // Sort by Y so higher objects on screen are rendered behind lower objects!
        yEntities.sort((a, b) => a.sortY - b.sortY);

        // Render each sorted entity
        for (let ent of yEntities) {
            if (ent.type === "tree") {
                this.drawTreeEntity(ctx, ent.data);
            } else if (ent.type === "item") {
                this.drawGroundItem(ctx, ent.data);
            } else if (ent.type === "rabbit") {
                this.drawRabbit(ctx, ent.data);
            } else if (ent.type === "campfire") {
                this.drawCampfireEntity(ctx, 570, 360, ent.data);
            } else if (ent.type === "campfire_blueprint") {
                this.drawCampfireBlueprint(ctx, 570, 360);
            } else if (ent.type === "player") {
                this.drawPlayer(ctx, ent.data, ent.isLocal);
            }
        }

        // 6. Flying wood chips from axe chopping
        this.drawWoodChips(ctx);

        // 7. Animated Campfire flame particles & smoke
        if (roomType === "camp" && gameState.campfire_built) {
            this.drawCampfireParticles(ctx, gameState.fire_level || 0);
        }

        // 8. Dynamic radial lighting & blizzard vignette
        this.drawLightingAndVignette(ctx, gameState, localPlayer, roomType);

        // 9. Signal flare rocket & helicopter spotlight beam
        this.drawFlareRocket(ctx);
        this.drawSpotlightBeam(ctx);

        // 10. Snowfall particles
        this.drawSnowflakes(ctx);
    }

    drawSnowBackground(ctx, coordStr, roomType) {
        const snowImg = this.rawImages.snowGround;
        if (snowImg && (snowImg.complete || snowImg.naturalWidth > 0)) {
            const hash = coordStr.split('_').reduce((acc, v) => acc + Math.abs(parseInt(v) || 0) * 31, 13);
            const flipX = (roomType !== "camp") && (hash % 2 === 0);
            const flipY = (roomType !== "camp") && (hash % 3 === 0);

            ctx.save();
            if (flipX || flipY) {
                ctx.translate(flipX ? this.width : 0, flipY ? this.height : 0);
                ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
            }
            ctx.drawImage(snowImg, 0, 0, this.width, this.height);
            ctx.restore();
            return;
        }

        // Fallback only while images are loading
        const grad = ctx.createLinearGradient(0, 0, this.width, this.height);
        grad.addColorStop(0, "#e8f1f7");
        grad.addColorStop(0.6, "#d8e6f1");
        grad.addColorStop(1, "#c2d6e6");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.width, this.height);
    }

    drawRoomBorders(ctx, exits) {
        const wallThickness = 45;
        const gateSize = 150;
        const exitsList = exits || [];

        ctx.fillStyle = "#152634";

        // North wall
        const leftW = (this.width - gateSize) / 2;
        if (exitsList.includes("north")) {
            ctx.fillRect(0, 0, leftW, wallThickness);
            ctx.fillRect(leftW + gateSize, 0, leftW, wallThickness);
            this.drawGatePath(ctx, leftW, 0, gateSize, wallThickness, "north");
        } else {
            ctx.fillRect(0, 0, this.width, wallThickness);
        }

        // South wall
        if (exitsList.includes("south")) {
            ctx.fillRect(0, this.height - wallThickness, leftW, wallThickness);
            ctx.fillRect(leftW + gateSize, this.height - wallThickness, leftW, wallThickness);
            this.drawGatePath(ctx, leftW, this.height - wallThickness, gateSize, wallThickness, "south");
        } else {
            ctx.fillRect(0, this.height - wallThickness, this.width, wallThickness);
        }

        // West wall
        const topH = (this.height - gateSize) / 2;
        if (exitsList.includes("west")) {
            ctx.fillRect(0, 0, wallThickness, topH);
            ctx.fillRect(0, topH + gateSize, wallThickness, topH);
            this.drawGatePath(ctx, 0, topH, wallThickness, gateSize, "west");
        } else {
            ctx.fillRect(0, 0, wallThickness, this.height);
        }

        // East wall
        if (exitsList.includes("east")) {
            ctx.fillRect(this.width - wallThickness, 0, wallThickness, topH);
            ctx.fillRect(this.width - wallThickness, topH + gateSize, wallThickness, topH);
            this.drawGatePath(ctx, this.width - wallThickness, topH, wallThickness, gateSize, "east");
        } else {
            ctx.fillRect(this.width - wallThickness, 0, wallThickness, this.height);
        }
    }

    drawWarmthCircle(ctx, cx, cy) {
        ctx.save();
        const pulse = Math.sin(this.flameTimer * 1.5) * 4;
        const radius = 155 + pulse;

        // Soft warm radial wash
        const fillGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, radius);
        fillGrad.addColorStop(0, "rgba(251, 146, 60, 0.22)");
        fillGrad.addColorStop(0.7, "rgba(251, 191, 36, 0.09)");
        fillGrad.addColorStop(1, "rgba(249, 115, 22, 0.0)");
        ctx.fillStyle = fillGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // Glowing dashed perimeter ring
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -this.flameTimer * 10;
        ctx.strokeStyle = "rgba(251, 146, 60, 0.85)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner subtle golden line
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(254, 240, 138, 0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
        ctx.stroke();

        // Descriptive label along the ring
        ctx.fillStyle = "rgba(254, 215, 170, 0.95)";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("♨️ ЗОНА ТЕПЛА (СОГРЕВАНИЕ)", cx, cy + radius + 15);

        ctx.restore();
    }

    drawGatePath(ctx, x, y, w, h, dir) {
        ctx.save();
        ctx.fillStyle = "rgba(200, 225, 245, 0.5)";
        ctx.fillRect(x, y, w, h);

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        const cx = x + w / 2;
        const cy = y + h / 2;
        if (dir === "north") {
            ctx.moveTo(cx, cy - 8); ctx.lineTo(cx - 10, cy + 8); ctx.lineTo(cx + 10, cy + 8);
        } else if (dir === "south") {
            ctx.moveTo(cx, cy + 8); ctx.lineTo(cx - 10, cy - 8); ctx.lineTo(cx + 10, cy - 8);
        } else if (dir === "west") {
            ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy - 10); ctx.lineTo(cx + 8, cy + 10);
        } else if (dir === "east") {
            ctx.moveTo(cx + 8, cy); ctx.lineTo(cx - 8, cy - 10); ctx.lineTo(cx - 8, cy + 10);
        }
        ctx.fill();
        ctx.restore();
    }

    drawFootprints(ctx) {
        ctx.save();
        for (let fp of this.footprints) {
            ctx.fillStyle = `rgba(110, 140, 168, ${fp.alpha})`;
            ctx.beginPath();
            ctx.ellipse(fp.x, fp.y, 5, 2.8, fp.angle, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    drawCampSetPiece(ctx, gameState) {
        ctx.save();

        // 1. Realistic Crashed Airplane in top-left corner seamlessly feathered on snow
        const planeImg = this.processedImages.airplane || this.rawImages.airplane;
        const planeX = 50;
        const planeY = 65;
        const planeW = 480;
        const planeH = 270;

        if (planeImg && (planeImg.complete || planeImg.width > 0)) {
            ctx.drawImage(planeImg, planeX, planeY, planeW, planeH);
        }

        // Shelter / Sleep entrance (fuselage door)
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.beginPath();
        ctx.roundRect(175, 295, 135, 30, 6);
        ctx.fill();
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("🛏️ УКРЫТИЕ (СОН)", 242, 315);

        // Suitcases for wreckage search
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.beginPath();
        ctx.roundRect(325, 280, 120, 30, 6);
        ctx.fill();
        ctx.fillStyle = "#fbbf24";
        ctx.fillText("🔍 ОБЫСК [E]", 385, 300);

        // Airplane Tail cargo hatch for shared supplies
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.beginPath();
        ctx.roundRect(430, 260, 125, 30, 6);
        ctx.fill();
        ctx.fillStyle = "#34d399";
        ctx.fillText("🧳 ЗАПАСЫ [E]", 492, 280);

        // Windbreak shield if built
        if (gameState.has_windbreak) {
            ctx.fillStyle = "#94a3b8";
            ctx.fillRect(495, 300, 16, 90);
            ctx.strokeStyle = "#1e293b";
            ctx.lineWidth = 2;
            ctx.strokeRect(495, 300, 16, 90);
            ctx.fillStyle = "#cbd5e1";
            ctx.font = "11px sans-serif";
            ctx.fillText("🛡️ Ветрозащита", 475, 290);
        }

        ctx.restore();
    }

    drawTreeEntity(ctx, tree) {
        ctx.save();
        const tx = tree.x;
        const ty = tree.y; // base of trunk on snow
        const size = tree.size || 1.0;

        // Tree shake animation when being chopped
        let shakeX = 0;
        if (tree.hitTimer && tree.hitTimer > 0) {
            shakeX = Math.sin(tree.hitTimer * 40) * 5;
            tree.hitTimer -= 0.03;
        }

        if (tree.is_stump) {
            // Cut snow stump in 3/4 view
            ctx.fillStyle = "rgba(40, 60, 80, 0.35)";
            ctx.beginPath();
            ctx.ellipse(tx, ty + 5, 20 * size, 10 * size, 0, 0, Math.PI * 2);
            ctx.fill();

            // Wooden stump trunk
            ctx.fillStyle = "#5c2e0b";
            ctx.beginPath();
            ctx.ellipse(tx, ty - 6, 15 * size, 8 * size, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(tx - 15 * size, ty - 6, 30 * size, 10 * size);

            // Stump rings and snow
            ctx.fillStyle = "#92400e";
            ctx.beginPath();
            ctx.ellipse(tx, ty - 6, 14 * size, 7 * size, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(tx - 4, ty - 8, 4, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Full 3/4 snowy spruce tree
            // Shadow under trunk
            ctx.fillStyle = "rgba(40, 65, 85, 0.35)";
            ctx.beginPath();
            ctx.ellipse(tx, ty + 8, 30 * size, 14 * size, 0, 0, Math.PI * 2);
            ctx.fill();

            const img = this.processedImages.pineTree || this.rawImages.pineTree;
            const w = 110 * size;
            const h = 160 * size;
            if (img && (img.complete || img.width > 0)) {
                ctx.drawImage(img, tx - w / 2 + shakeX, ty - h + 18, w, h);
            } else {
                // Procedural 3/4 tree fallback
                ctx.fillStyle = "#1e3a2b";
                ctx.beginPath();
                ctx.moveTo(tx + shakeX, ty - h);
                ctx.lineTo(tx - w / 2 + shakeX, ty);
                ctx.lineTo(tx + w / 2 + shakeX, ty);
                ctx.closePath();
                ctx.fill();
            }

            // Tree health bar if damaged
            if (tree.health < (tree.max_health || 3)) {
                const bw = 34;
                ctx.fillStyle = "#0f172a";
                ctx.fillRect(tx - bw / 2, ty + 12, bw, 4);
                ctx.fillStyle = "#22c55e";
                ctx.fillRect(tx - bw / 2, ty + 12, (bw * tree.health) / (tree.max_health || 3), 4);
            }
        }

        ctx.restore();
    }

    drawCampfireEntity(ctx, cx, cy, fireLevel) {
        ctx.save();

        // Stone circle hearth
        ctx.fillStyle = "#334155";
        for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2;
            const sx = cx + Math.cos(angle) * 34;
            const sy = cy + Math.sin(angle) * 22;
            ctx.beginPath();
            ctx.arc(sx, sy, 8, 0, Math.PI * 2);
            ctx.fill();

            // Snow dusting on stones
            ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
            ctx.beginPath();
            ctx.arc(sx, sy - 3, 5, 0, Math.PI);
            ctx.fill();
            ctx.fillStyle = "#334155";
        }

        // Wooden logs
        ctx.fillStyle = fireLevel > 0 ? "#3d1f0a" : "#1e1b18";
        ctx.fillRect(cx - 22, cy - 6, 44, 12);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(0.9);
        ctx.fillRect(-22, -6, 44, 12);
        ctx.restore();

        if (fireLevel > 0) {
            // Glowing coal core
            const emberGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26);
            emberGrad.addColorStop(0, "#fbbf24");
            emberGrad.addColorStop(0.4, "#ea580c");
            emberGrad.addColorStop(1, "rgba(220, 38, 38, 0)");
            ctx.fillStyle = emberGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, 26, 0, Math.PI * 2);
            ctx.fill();

            // Procedural dancing 3/4 flame tongues
            this.drawFlameTongues(ctx, cx, cy, fireLevel);

            ctx.fillStyle = "#fef08a";
            ctx.font = "bold 12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`🔥 Костёр (${fireLevel}/5)`, cx, cy - 48 - fireLevel * 6);
        } else {
            // Cold charred soot center and frost
            ctx.fillStyle = "#090d14";
            ctx.beginPath();
            ctx.ellipse(cx, cy, 18, 10, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#94a3b8";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("❄️ Костёр потушен (зажигалка + 1 дерево)", cx, cy - 26);
        }

        ctx.restore();
    }

    drawFlameTongues(ctx, cx, cy, fireLevel) {
        ctx.save();
        const t = this.flameTimer;

        const layers = [
            { color: "#ef4444", scale: 1.0, count: 5, waveSpeed: 1.0 },
            { color: "#f97316", scale: 0.85, count: 4, waveSpeed: 1.3 },
            { color: "#fde047", scale: 0.6, count: 3, waveSpeed: 1.7 }
        ];

        for (let l of layers) {
            ctx.fillStyle = l.color;
            ctx.beginPath();
            const h = (24 + fireLevel * 10) * l.scale;
            const w = (22 + fireLevel * 4) * l.scale;

            ctx.moveTo(cx - w, cy);
            for (let i = 0; i <= l.count; i++) {
                const px = cx - w + (i / l.count) * (w * 2);
                const flicker = Math.sin(t * l.waveSpeed * 2 + i * 2) * (8 * l.scale);
                const tipY = cy - h + flicker;
                const cpX = px + Math.cos(t * 3 + i) * 6;
                ctx.quadraticCurveTo(cpX, cy - h * 0.5, px, tipY);
            }
            ctx.quadraticCurveTo(cx + w * 0.5, cy, cx + w, cy);
            ctx.closePath();
            ctx.fill();
        }

        // Inner white-hot spark center
        ctx.fillStyle = "#ffffff";
        const innerH = 12 + Math.sin(t * 4) * 4;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 4, 8, innerH, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawCampfireParticles(ctx, fireLevel) {
        if (fireLevel <= 0) return;
        ctx.save();

        for (let s of this.smokeParticles) {
            ctx.fillStyle = `rgba(100, 116, 139, ${s.life * 0.3})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalCompositeOperation = "lighter";
        for (let p of this.fireParticles) {
            let col = "#f97316";
            if (p.colorType > 0.6) col = "#fde047";
            else if (p.colorType < 0.25) col = "#ef4444";

            ctx.fillStyle = col;
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1.0;
        ctx.restore();
    }

    drawWoodChips(ctx) {
        ctx.save();
        for (let c of this.woodChips) {
            ctx.fillStyle = c.color;
            ctx.globalAlpha = Math.max(0, c.life);
            ctx.fillRect(c.x, c.y, c.size, c.size);
        }
        ctx.restore();
    }

    drawSOSClearing(ctx, gameState) {
        ctx.save();
        const progress = Math.min(15, gameState.sos_progress || 0);

        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`ЗНАК SOS: ${progress}/15 металла выложено`, 550, 160);

        // 15 defined metal plate slots: 5 for 'S', 5 for 'O', 5 for 'S'
        const plates = [
            // First 'S' (5 plates)
            { x: 310, y: 245, w: 74, h: 22 }, // Top
            { x: 310, y: 271, w: 24, h: 42 }, // Upper left
            { x: 310, y: 317, w: 74, h: 22 }, // Mid
            { x: 360, y: 343, w: 24, h: 42 }, // Lower right
            { x: 310, y: 389, w: 74, h: 22 }, // Bot

            // 'O' (5 plates)
            { x: 505, y: 245, w: 90, h: 22 }, // Top
            { x: 505, y: 271, w: 24, h: 114 }, // Left side
            { x: 571, y: 271, w: 24, h: 114 }, // Right side
            { x: 505, y: 389, w: 90, h: 22 }, // Bot
            { x: 533, y: 317, w: 34, h: 22 }, // Center brace

            // Second 'S' (5 plates)
            { x: 710, y: 245, w: 74, h: 22 }, // Top
            { x: 710, y: 271, w: 24, h: 42 }, // Upper left
            { x: 710, y: 317, w: 74, h: 22 }, // Mid
            { x: 760, y: 343, w: 24, h: 42 }, // Lower right
            { x: 710, y: 389, w: 74, h: 22 }  // Bot
        ];

        for (let i = 0; i < plates.length; i++) {
            const p = plates[i];
            if (i < progress) {
                // Placed polished metal plate
                const grad = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
                grad.addColorStop(0, "#f8fafc");
                grad.addColorStop(0.5, "#cbd5e1");
                grad.addColorStop(1, "#94a3b8");
                ctx.fillStyle = grad;
                ctx.fillRect(p.x, p.y, p.w, p.h);

                ctx.strokeStyle = "#334155";
                ctx.lineWidth = 2;
                ctx.strokeRect(p.x, p.y, p.w, p.h);

                // Corner rivets
                ctx.fillStyle = "#1e293b";
                const rPad = 3;
                ctx.fillRect(p.x + rPad, p.y + rPad, 3, 3);
                ctx.fillRect(p.x + p.w - rPad - 3, p.y + rPad, 3, 3);
                ctx.fillRect(p.x + rPad, p.y + p.h - rPad - 3, 3, 3);
                ctx.fillRect(p.x + p.w - rPad - 3, p.y + p.h - rPad - 3, 3, 3);
            } else {
                // Stencil imprint in snow waiting for metal plate
                ctx.fillStyle = "rgba(148, 180, 205, 0.3)";
                ctx.fillRect(p.x, p.y, p.w, p.h);

                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = "rgba(71, 85, 105, 0.55)";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(p.x, p.y, p.w, p.h);
                ctx.setLineDash([]);

                ctx.fillStyle = "rgba(71, 85, 105, 0.6)";
                ctx.font = "bold 9px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(`${i + 1}`, p.x + p.w / 2, p.y + p.h / 2 + 3);
            }
        }

        // Draw Landed Rescue Helicopter if it has arrived!
        if (gameState.sos_helicopter_landed) {
            this.drawLandedHelicopter(ctx, 550, 160);
        }

        ctx.restore();
    }

    drawLandedHelicopter(ctx, hx, hy) {
        ctx.save();
        // Drop shadow on snow
        ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
        ctx.beginPath();
        ctx.ellipse(hx, hy + 25, 95, 28, 0, 0, Math.PI * 2);
        ctx.fill();

        // Landing skids
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 4;
        ctx.beginPath();
        // Left skid
        ctx.moveTo(hx - 70, hy + 18); ctx.lineTo(hx + 55, hy + 18);
        ctx.moveTo(hx - 35, hy + 18); ctx.lineTo(hx - 20, hy + 2);
        ctx.moveTo(hx + 25, hy + 18); ctx.lineTo(hx + 20, hy + 2);
        // Right skid
        ctx.moveTo(hx - 60, hy + 26); ctx.lineTo(hx + 65, hy + 26);
        ctx.moveTo(hx - 25, hy + 26); ctx.lineTo(hx - 12, hy + 10);
        ctx.moveTo(hx + 35, hy + 26); ctx.lineTo(hx + 28, hy + 10);
        ctx.stroke();

        // Tail boom
        ctx.fillStyle = "#ea580c";
        ctx.beginPath();
        ctx.moveTo(hx + 30, hy - 10);
        ctx.lineTo(hx + 125, hy - 32);
        ctx.lineTo(hx + 125, hy - 22);
        ctx.lineTo(hx + 30, hy + 5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Tail fin
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(hx + 120, hy - 25);
        ctx.lineTo(hx + 138, hy - 48);
        ctx.lineTo(hx + 144, hy - 48);
        ctx.lineTo(hx + 130, hy - 20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Tail rotor blur
        ctx.strokeStyle = "rgba(203, 213, 225, 0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx + 135, hy - 35, 14, 0, Math.PI * 2);
        ctx.stroke();

        // Main fuselage body (Search & Rescue orange and white)
        ctx.fillStyle = "#ea580c"; // bright rescue orange
        ctx.beginPath();
        ctx.ellipse(hx - 15, hy - 2, 58, 24, -0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // White emergency belly stripe
        ctx.fillStyle = "#f8fafc";
        ctx.beginPath();
        ctx.ellipse(hx - 15, hy + 6, 52, 10, -0.05, 0, Math.PI);
        ctx.fill();

        // Cockpit windshield (dark blue-grey glass)
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.moveTo(hx - 68, hy - 2);
        ctx.quadraticCurveTo(hx - 60, hy - 20, hx - 35, hy - 18);
        ctx.lineTo(hx - 32, hy + 2);
        ctx.quadraticCurveTo(hx - 50, hy + 4, hx - 68, hy - 2);
        ctx.closePath();
        ctx.fill();

        // Glass reflection highlight
        ctx.strokeStyle = "rgba(186, 230, 253, 0.75)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hx - 60, hy - 6);
        ctx.lineTo(hx - 40, hy - 14);
        ctx.stroke();

        // Main rotor mast
        ctx.fillStyle = "#334155";
        ctx.fillRect(hx - 17, hy - 32, 6, 12);

        // Spinning main rotor blades / disc blur
        const rotorAngle = this.flameTimer * 16;
        ctx.save();
        ctx.translate(hx - 14, hy - 32);
        // Blurred rotor disc
        ctx.fillStyle = "rgba(226, 232, 240, 0.25)";
        ctx.beginPath();
        ctx.ellipse(0, 0, 110, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(203, 213, 225, 0.7)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-Math.cos(rotorAngle) * 110, -Math.sin(rotorAngle) * 18);
        ctx.lineTo(Math.cos(rotorAngle) * 110, Math.sin(rotorAngle) * 18);
        ctx.stroke();
        ctx.restore();

        // Rescue text & Red cross badge
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("RESCUE", hx + 5, hy - 2);

        // Blinking beacon light on tail
        const blink = Math.sin(this.flameTimer * 6) > 0;
        ctx.fillStyle = blink ? "#ef4444" : "#7f1d1d";
        ctx.beginPath();
        ctx.arc(hx + 138, hy - 48, 4, 0, Math.PI * 2);
        ctx.fill();

        // Interactive boarding badge
        ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
        ctx.beginPath();
        ctx.roundRect(hx - 100, hy + 38, 200, 28, 6);
        ctx.fill();
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = "#34d399";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText("🚁 [E] ПОДНЯТЬСЯ НА БОРТ", hx, hy + 56);

        ctx.restore();
    }

    drawRadioTower(ctx, gameState) {
        ctx.save();
        const tx = 550;
        const ty = 300;

        // Steel tower legs
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(tx - 65, ty + 120);
        ctx.lineTo(tx, ty - 180);
        ctx.lineTo(tx + 65, ty + 120);
        ctx.stroke();

        // Cross bracing
        ctx.lineWidth = 3;
        for (let y = ty - 140; y <= ty + 80; y += 40) {
            ctx.beginPath();
            ctx.moveTo(tx - 35, y);
            ctx.lineTo(tx + 35, y);
            ctx.stroke();
        }

        // Blinking beacon
        const blink = Math.sin(this.flameTimer * 0.8) > 0;
        ctx.fillStyle = blink ? "#ef4444" : "#7f1d1d";
        ctx.beginPath();
        ctx.arc(tx, ty - 185, 9, 0, Math.PI * 2);
        ctx.fill();

        // Shack
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(tx - 75, ty + 50, 150, 85);
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 4;
        ctx.strokeRect(tx - 75, ty + 50, 150, 85);

        const breached = gameState.tower_breached;
        ctx.fillStyle = breached ? "#020617" : "#475569";
        ctx.fillRect(tx - 22, ty + 72, 44, 63);

        ctx.textAlign = "center";
        if (!breached) {
            ctx.strokeStyle = "#f59e0b";
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(tx - 25, ty + 82); ctx.lineTo(tx + 25, ty + 115);
            ctx.moveTo(tx + 25, ty + 82); ctx.lineTo(tx - 25, ty + 115);
            ctx.stroke();

            ctx.fillStyle = "#fbbf24";
            ctx.font = "bold 13px sans-serif";
            ctx.fillText("🔒 ЗАПЕРТО НА ЦЕПЬ (Топор)", tx, ty + 160);
        } else if (!gameState.radio_repaired) {
            ctx.fillStyle = "#38bdf8";
            ctx.font = "bold 13px sans-serif";
            ctx.fillText("📻 ВЗЛОМАНО (Нужна рация + 5 металла)", tx, ty + 160);
        } else {
            ctx.fillStyle = "#10b981";
            ctx.font = "bold 13px sans-serif";
            ctx.fillText("📡 СИГНАЛ SOS ПЕРЕДАН (Ожидание вертолёта)", tx, ty + 160);
        }

        // Draw Landed Rescue Helicopter if it has arrived!
        if (gameState.radio_helicopter_landed) {
            this.drawLandedHelicopter(ctx, 280, 170);
        }

        ctx.restore();
    }

    drawGroundItem(ctx, item) {
        ctx.save();
        ctx.fillStyle = "rgba(40, 60, 80, 0.3)";
        ctx.beginPath();
        ctx.ellipse(item.x, item.y + 4, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // 3/4 firewood log
        ctx.fillStyle = "#5c2e0b";
        ctx.fillRect(item.x - 14, item.y - 6, 28, 11);
        ctx.fillStyle = "#7c3f10";
        ctx.beginPath();
        ctx.ellipse(item.x + 14, item.y, 4, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("🪵 Дрова [E]", item.x, item.y - 10);
        ctx.restore();
    }

    drawRabbit(ctx, rabbit) {
        ctx.save();
        const rx = rabbit.x;
        const ry = rabbit.y;

        ctx.fillStyle = "rgba(71, 85, 105, 0.3)";
        ctx.beginPath();
        ctx.ellipse(rx, ry + 6, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        const img = this.processedImages.rabbit || this.rawImages.rabbit;
        const facingLeft = rabbit.vx !== undefined ? rabbit.vx < 0 : ((rabbit.target_x || rx) < rx);
        const size = 42;

        ctx.translate(rx, ry);
        if (facingLeft) ctx.scale(-1, 1);

        if (img && (img.complete || img.width > 0)) {
            ctx.drawImage(img, -size / 2, -size + 8, size, size);
        } else {
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.ellipse(0, -10, 14, 10, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    drawPlayer(ctx, player, isLocal) {
        ctx.save();
        const px = player.x;
        const py = player.y; // base of player's feet on ground

        // Drop shadow on snow
        ctx.fillStyle = "rgba(45, 65, 85, 0.4)";
        ctx.beginPath();
        ctx.ellipse(px, py + 4, 20, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Walking bob and axe swing animation
        const walkCycle = player.walkCycle || 0;
        const bob = Math.sin(walkCycle) * 3.5;
        const isAttacking = player.attackTimer && player.attackTimer > 0;
        if (player.attackTimer) player.attackTimer -= 0.03;

        // Facing direction: check angle or vx
        const angle = player.angle || 0;
        const facingLeft = Math.cos(angle) < -0.2;

        ctx.translate(px, py + bob);
        if (facingLeft) ctx.scale(-1, 1);

        // 3/4 upright survivor sprite
        const w = 58;
        const h = 76;
        const img = this.processedImages.survivor || this.rawImages.survivor;

        if (img && (img.complete || img.width > 0)) {
            // Drawn standing upright from feet (py)
            ctx.drawImage(img, -w / 2, -h + 8, w, h);
        } else {
            // Fallback
            ctx.fillStyle = player.role === "host" ? "#ea580c" : "#2563eb";
            ctx.fillRect(-14, -45, 28, 45);
        }

        // Axe swing slash effect
        if (isAttacking) {
            ctx.strokeStyle = "rgba(254, 240, 138, 0.85)";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(15, -25, 26, -0.6 * Math.PI, 0.4 * Math.PI);
            ctx.stroke();
        }

        if (facingLeft) ctx.scale(-1, 1);
        ctx.translate(-px, -(py + bob));

        // Stamina indicator right above the player
        const curStam = player.stamina !== undefined ? player.stamina : 3;
        const maxStam = player.max_stamina || 3;
        const stamStartX = px - 22;
        for (let i = 0; i < maxStam; i++) {
            const pipX = stamStartX + i * 16;
            const pipY = py - 82;
            ctx.fillStyle = i < curStam ? "#facc15" : "#64748b";
            ctx.font = "bold 13px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("⚡", pipX, pipY);
        }
        ctx.fillStyle = curStam > 0 ? "#fef08a" : "#94a3b8";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`${curStam}/${maxStam}`, px + 22, py - 83);

        // Name tag & HP bar
        ctx.fillStyle = isLocal ? "#38bdf8" : "#f1f5f9";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(player.name + (isLocal ? " (ВЫ)" : ""), px, py - 66);

        // HP bar
        const barW = 40;
        const barH = 5;
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(px - barW / 2, py - 62, barW, barH);
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(px - barW / 2, py - 62, (barW * Math.max(0, player.health)) / 100, barH);

        // Speech Bubble
        const bubble = this.speechBubbles ? this.speechBubbles[player.id] : null;
        if (bubble && bubble.timer > 0) {
            ctx.save();
            ctx.font = "bold 12px sans-serif";
            const textMetrics = ctx.measureText(bubble.text);
            const padX = 10;
            const bw = Math.min(220, Math.max(60, textMetrics.width + padX * 2));
            const bh = 24;
            const bx = px - bw / 2;
            const by = py - 116;

            const alpha = Math.min(1.0, bubble.timer * 2);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
            ctx.strokeStyle = isLocal ? "#38bdf8" : "#34d399";
            ctx.lineWidth = 1.5;

            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 6);
            ctx.fill();
            ctx.stroke();

            // Downward pointer arrow
            ctx.beginPath();
            ctx.moveTo(px - 5, by + bh);
            ctx.lineTo(px + 5, by + bh);
            ctx.lineTo(px, by + bh + 5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#f8fafc";
            ctx.textAlign = "center";
            ctx.fillText(bubble.text, px, by + 16);
            ctx.restore();
        }

        ctx.restore();
    }

    drawLightingAndVignette(ctx, gameState, localPlayer, roomType) {
        ctx.save();
        const px = localPlayer ? localPlayer.x : 550;
        const py = localPlayer ? localPlayer.y : 325;

        const isNight = this.isNightMode || (gameState && gameState.night_helicopter_active);
        const innerRad = isNight ? 40 : 110;
        const outerRad = isNight ? 450 : 680;
        const darkness = ctx.createRadialGradient(px, py, innerRad, px, py, outerRad);
        if (isNight) {
            darkness.addColorStop(0, "rgba(2, 6, 12, 0.2)");
            darkness.addColorStop(0.5, "rgba(2, 6, 12, 0.8)");
            darkness.addColorStop(1, "rgba(1, 3, 7, 0.96)");
        } else {
            darkness.addColorStop(0, "rgba(8, 18, 30, 0.04)");
            darkness.addColorStop(0.7, "rgba(6, 14, 24, 0.42)");
            darkness.addColorStop(1, "rgba(4, 9, 16, 0.85)");
        }

        ctx.fillStyle = darkness;
        ctx.fillRect(0, 0, this.width, this.height);

        // Campfire warm light if built
        const fireLevel = gameState.fire_level || 0;
        if (roomType === "camp" && gameState.campfire_built && fireLevel > 0) {
            const flicker = Math.sin(this.flameTimer * 3.5) * 12 + Math.cos(this.flameTimer * 7) * 5;
            const radius = 95 + fireLevel * 65 + flicker;
            const fireGlow = ctx.createRadialGradient(570, 360, 12, 570, 360, radius);
            fireGlow.addColorStop(0, "rgba(251, 191, 36, 0.52)");
            fireGlow.addColorStop(0.45, "rgba(249, 115, 22, 0.24)");
            fireGlow.addColorStop(1, "rgba(0, 0, 0, 0)");

            ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = fireGlow;
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.globalCompositeOperation = "source-over";
        }

        ctx.restore();
    }

    launchFlareRocket(startX, startY) {
        this.flareRocket = {
            startX: startX,
            startY: startY,
            x: startX,
            y: startY - 30,
            vy: -360,
            sparks: [],
            redGlow: 0.1,
            timer: 0
        };
    }

    startSpotlight(targetX, targetY) {
        this.spotlight = {
            x: targetX,
            y: targetY,
            radius: 0,
            targetRadius: 180,
            alpha: 0,
            timer: 0
        };
    }

    drawFlareRocket(ctx) {
        if (!this.flareRocket) return;
        const r = this.flareRocket;
        ctx.save();

        // Red atmospheric flare illumination over entire camp
        ctx.fillStyle = `rgba(239, 68, 68, ${0.28 * r.redGlow})`;
        ctx.fillRect(0, 0, this.width, this.height);

        // Rocket Sparks trail
        for (let s of r.sparks) {
            ctx.fillStyle = s.color;
            ctx.globalAlpha = Math.max(0, s.life);
            ctx.fillRect(s.x, s.y, s.size, s.size);
        }
        ctx.globalAlpha = 1.0;

        // Glowing red rocket missile
        if (r.y > -80) {
            // Bright red flare halo
            const halo = ctx.createRadialGradient(r.x, r.y, 4, r.x, r.y, 45);
            halo.addColorStop(0, "rgba(254, 240, 138, 0.95)");
            halo.addColorStop(0.3, "rgba(239, 68, 68, 0.85)");
            halo.addColorStop(1, "rgba(239, 68, 68, 0)");
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(r.x, r.y, 45, 0, Math.PI * 2);
            ctx.fill();

            // Rocket core
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.ellipse(r.x, r.y, 4, 9, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    drawSpotlightBeam(ctx) {
        if (!this.spotlight) return;
        const sp = this.spotlight;
        ctx.save();

        const topX = sp.x;
        const topY = -20;
        const groundX = sp.x;
        const groundY = sp.y;

        // 1. Conical searchlight beam sweeping down from sky
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const beamGrad = ctx.createLinearGradient(topX, topY, groundX, groundY);
        beamGrad.addColorStop(0, `rgba(254, 240, 138, ${0.65 * sp.alpha})`);
        beamGrad.addColorStop(0.6, `rgba(254, 240, 138, ${0.45 * sp.alpha})`);
        beamGrad.addColorStop(1, `rgba(255, 255, 255, ${0.25 * sp.alpha})`);

        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(topX - 15, topY);
        ctx.lineTo(topX + 15, topY);
        ctx.lineTo(groundX + sp.radius, groundY);
        ctx.lineTo(groundX - sp.radius, groundY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // 2. Bright searchlight oval pool on snow
        const poolGrad = ctx.createRadialGradient(groundX, groundY, 15, groundX, groundY, sp.radius);
        poolGrad.addColorStop(0, `rgba(255, 255, 255, ${0.92 * sp.alpha})`);
        poolGrad.addColorStop(0.5, `rgba(254, 240, 138, ${0.65 * sp.alpha})`);
        poolGrad.addColorStop(0.85, `rgba(251, 191, 36, ${0.35 * sp.alpha})`);
        poolGrad.addColorStop(1, "rgba(251, 191, 36, 0)");

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = poolGrad;
        ctx.beginPath();
        ctx.ellipse(groundX, groundY, sp.radius, sp.radius * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 3. Searchlight headline banner
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 10;
        ctx.fillText("🔦 ПОИСКОВЫЙ ПРОЖЕКТОР ОБНАРУЖИЛ ВАС!", groundX, groundY - sp.radius * 0.55 - 20);

        ctx.restore();
    }

    drawSnowflakes(ctx) {
        ctx.save();
        ctx.fillStyle = "#ffffff";
        for (let p of this.snowParticles) {
            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

window.GameRenderer = GameRenderer;
