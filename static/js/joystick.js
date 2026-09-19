// Virtual touch joystick for mobile devices
class VirtualJoystick {
    constructor(containerEl, onChangeCallback) {
        this.container = containerEl;
        this.onChange = onChangeCallback;
        this.active = false;
        this.touchId = null;
        this.baseX = 0;
        this.baseY = 0;
        this.stickX = 0;
        this.stickY = 0;
        this.maxRadius = 55;
        this.vector = { x: 0, y: 0 };

        this.baseEl = null;
        this.stickEl = null;
        this.initDOM();
        this.bindEvents();
    }

    initDOM() {
        this.baseEl = document.createElement("div");
        this.baseEl.className = "joystick-base";

        this.stickEl = document.createElement("div");
        this.stickEl.className = "joystick-stick";

        this.baseEl.appendChild(this.stickEl);
        this.container.appendChild(this.baseEl);
        this.baseEl.style.left = "65px";
        this.baseEl.style.top = "65px";
        this.baseEl.style.opacity = "0.55";
        this.baseEl.style.display = "block";
    }

    bindEvents() {
        const zone = this.container;

        const onTouchStart = (e) => {
            if (this.active) return;
            const touch = e.changedTouches[0];
            this.active = true;
            this.touchId = touch.identifier;

            const rect = zone.getBoundingClientRect();
            this.baseX = touch.clientX - rect.left;
            this.baseY = touch.clientY - rect.top;

            this.baseEl.style.left = `${this.baseX}px`;
            this.baseEl.style.top = `${this.baseY}px`;
            this.baseEl.style.opacity = "1.0";
            this.baseEl.style.display = "block";

            this.stickX = 0;
            this.stickY = 0;
            this.stickEl.style.transform = `translate(0px, 0px)`;
            this.updateVector();
            e.preventDefault();
        };

        const onTouchMove = (e) => {
            if (!this.active) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                if (touch.identifier === this.touchId) {
                    const rect = zone.getBoundingClientRect();
                    const curX = touch.clientX - rect.left;
                    const curY = touch.clientY - rect.top;

                    let dx = curX - this.baseX;
                    let dy = curY - this.baseY;
                    const dist = Math.hypot(dx, dy);

                    if (dist > this.maxRadius) {
                        dx = (dx / dist) * this.maxRadius;
                        dy = (dy / dist) * this.maxRadius;
                    }

                    this.stickX = dx;
                    this.stickY = dy;
                    this.stickEl.style.transform = `translate(${dx}px, ${dy}px)`;
                    this.updateVector();
                    break;
                }
            }
            e.preventDefault();
        };

        const onTouchEnd = (e) => {
            if (!this.active) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.touchId) {
                    this.reset();
                    break;
                }
            }
            e.preventDefault();
        };

        zone.addEventListener("touchstart", onTouchStart, { passive: false });
        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("touchend", onTouchEnd, { passive: false });
        window.addEventListener("touchcancel", onTouchEnd, { passive: false });
    }

    updateVector() {
        const len = Math.hypot(this.stickX, this.stickY);
        if (len > 5) {
            this.vector.x = this.stickX / this.maxRadius;
            this.vector.y = this.stickY / this.maxRadius;
        } else {
            this.vector.x = 0;
            this.vector.y = 0;
        }
        if (this.onChange) {
            this.onChange(this.vector);
        }
    }

    reset() {
        this.active = false;
        this.touchId = null;
        this.baseEl.style.left = "65px";
        this.baseEl.style.top = "65px";
        this.baseEl.style.opacity = "0.55";
        this.stickEl.style.transform = "translate(0px, 0px)";
        this.vector.x = 0;
        this.vector.y = 0;
        if (this.onChange) {
            this.onChange(this.vector);
        }
    }
}

window.VirtualJoystick = VirtualJoystick;
