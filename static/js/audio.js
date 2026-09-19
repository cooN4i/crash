// Web Audio API procedural sound synthesizer
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // Step on snow crunch sound
    playStep() {
        if (this.isMuted) return;
        this.init();
        const now = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.08;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600 + Math.random() * 300, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start(now);
    }

    // Axe swing & impact
    playAxe() {
        if (this.isMuted) return;
        this.init();
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.18);
    }

    // Fire crackle
    playFireCrackle() {
        if (this.isMuted) return;
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(120 + Math.random() * 80, now);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.05);
    }

    // Flare Gun rocket shot
    playFlareShot() {
        if (this.isMuted) return;
        this.init();
        const now = this.ctx.currentTime;

        // Blast
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.4);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.7);
    }

    // Helicopter rotor sound
    playHelicopter() {
        if (this.isMuted) return;
        this.init();
        const now = this.ctx.currentTime;

        for (let i = 0; i < 8; i++) {
            const delay = i * 0.12;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'square';
            osc.frequency.setValueAtTime(75, now + delay);

            gain.gain.setValueAtTime(0.25, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.08);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + delay);
            osc.stop(now + delay + 0.08);
        }
    }

    startNightHelicopterSound() {
        if (this.heliInterval) return;
        this.playHelicopter();
        this.heliInterval = setInterval(() => {
            this.playHelicopter();
        }, 1100);
    }

    stopNightHelicopterSound() {
        if (this.heliInterval) {
            clearInterval(this.heliInterval);
            this.heliInterval = null;
        }
    }

    playSpotlightSweep() {
        if (this.isMuted) return;
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(260, now + 1.2);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 2.0);
    }

    // Radio beeps and static
    playRadio() {
        if (this.isMuted) return;
        this.init();
        const now = this.ctx.currentTime;
        const freqs = [880, 1100, 880, 1400];
        freqs.forEach((f, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, now + idx * 0.12);
            gain.gain.setValueAtTime(0.15, now + idx * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, now + (idx + 1) * 0.12);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.12);
            osc.stop(now + (idx + 1) * 0.12);
        });
    }

    // Success chord
    playWin() {
        if (this.isMuted) return;
        this.init();
        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25]; // C chord
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);
            gain.gain.setValueAtTime(0.25, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + i * 0.1);
            osc.stop(now + 1.2);
        });
    }
}

window.soundEngine = new SoundEngine();
