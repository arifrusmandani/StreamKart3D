/**
 * Procedural Arcade Audio Engine using Web Audio API.
 * 100% Zero Copyright / Content-ID safe for YouTube & Twitch streamers.
 */

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxVolume = 0.65;
    this.bgmVolume = 0.3;
    this.muted = false;
    this.bgmEnabled = true;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.isChaos = false;
    this.isLastCall = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 1;
    this.masterGain.connect(this.ctx.destination);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
  }

  setSfxVolume(vol) {
    this.sfxVolume = Math.max(0, Math.min(1, Number(vol)));
  }

  setBgmVolume(vol) {
    this.bgmVolume = Math.max(0, Math.min(1, Number(vol)));
  }

  startBgm() {
    this.init();
    this.stopBgm();
    if (!this.bgmEnabled) return;

    this.bgmStep = 0;
    const stepTimeMs = 135; // ~111 BPM 16th notes
    const bassLine = [110, 110, 130.81, 146.83, 164.81, 146.83, 130.81, 98.0];
    const leadLine = [440, 0, 523.25, 659.25, 587.33, 0, 523.25, 392.0];
    const chaosLead = [587.33, 698.46, 880, 698.46, 987.77, 880, 698.46, 587.33];

    this.bgmTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.bgmEnabled || this.bgmVolume <= 0.01) return;
      if (this.ctx.state === "suspended") return;

      const now = this.ctx.currentTime;
      const idx = this.bgmStep % 8;
      const tempoBoost = this.isChaos ? 1.25 : this.isLastCall ? 1.12 : 1.0;

      // Synthwave Bass pulse on every step
      const bassFreq = bassLine[idx] * tempoBoost;
      this._playTone({
        freq: bassFreq,
        endFreq: bassFreq * 0.98,
        type: "sawtooth",
        duration: 0.1,
        gain: this.bgmVolume * 0.22,
        filterFreq: 650,
      });

      // Kick on 0, 4
      if (idx % 4 === 0) {
        this._playTone({
          freq: 130,
          endFreq: 35,
          type: "sine",
          duration: 0.11,
          gain: this.bgmVolume * 0.45,
        });
      }

      // Hi-hat on odd steps
      if (idx % 2 === 1) {
        this._playNoise({
          duration: 0.04,
          gain: this.bgmVolume * 0.12,
          highpass: 5000,
        });
      }

      // Lead synth
      const activeLead = this.isChaos ? chaosLead : leadLine;
      const leadFreq = activeLead[idx];
      if (leadFreq > 0 && (this.bgmStep % 16 < 12 || this.isChaos)) {
        this._playTone({
          freq: leadFreq * (this.isLastCall ? 1.05946 : 1),
          endFreq: leadFreq * (this.isLastCall ? 1.05946 : 1),
          type: "square",
          duration: 0.11,
          gain: this.bgmVolume * 0.12,
          filterFreq: 2200,
        });
      }

      this.bgmStep++;
    }, stepTimeMs);
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  playCountdown(num) {
    this.init();
    if (!this.ctx || this.muted) return;
    if (num > 0) {
      this._playTone({
        freq: 440,
        endFreq: 440,
        type: "square",
        duration: 0.18,
        gain: this.sfxVolume * 0.5,
      });
    } else {
      // GO!
      this._playTone({
        freq: 880,
        endFreq: 1174.66,
        type: "sawtooth",
        duration: 0.45,
        gain: this.sfxVolume * 0.65,
      });
    }
  }

  playSkill(skillId) {
    this.init();
    if (!this.ctx || this.muted) return;

    switch (skillId) {
      case "mini_boost":
        this._playTone({
          freq: 240,
          endFreq: 680,
          type: "sawtooth",
          duration: 0.35,
          gain: this.sfxVolume * 0.45,
        });
        break;

      case "nitro_nos":
        this._playNoise({ duration: 0.55, gain: this.sfxVolume * 0.5, bandpass: 900 });
        this._playTone({
          freq: 180,
          endFreq: 920,
          type: "sawtooth",
          duration: 0.6,
          gain: this.sfxVolume * 0.55,
        });
        break;

      case "banana_trap":
      case "oil_slick":
        this._playTone({
          freq: 520,
          endFreq: 220,
          type: "triangle",
          duration: 0.18,
          gain: this.sfxVolume * 0.45,
        });
        break;

      case "guardian_shield":
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          setTimeout(() => {
            this._playTone({
              freq: f,
              endFreq: f * 1.02,
              type: "sine",
              duration: 0.28,
              gain: this.sfxVolume * 0.38,
            });
          }, i * 55);
        });
        break;

      case "homing_missile":
      case "sultan_strike":
        // Radar lock beeps + rocket launch
        [0, 90, 180].forEach((delay) => {
          setTimeout(() => {
            this._playTone({
              freq: skillId === "sultan_strike" ? 1046 : 880,
              endFreq: 880,
              type: "square",
              duration: 0.06,
              gain: this.sfxVolume * 0.4,
            });
          }, delay);
        });
        setTimeout(() => {
          this._playNoise({ duration: 0.5, gain: this.sfxVolume * 0.55, bandpass: 1200 });
          this._playTone({
            freq: 300,
            endFreq: 760,
            type: "sawtooth",
            duration: 0.45,
            gain: this.sfxVolume * 0.4,
          });
        }, 240);
        break;

      case "freeze_ray":
        [1046.5, 1318.5, 1567.98, 2093].forEach((f, i) => {
          setTimeout(() => {
            this._playTone({
              freq: f,
              endFreq: f * 0.95,
              type: "triangle",
              duration: 0.2,
              gain: this.sfxVolume * 0.4,
            });
          }, i * 45);
        });
        break;

      case "magnet_beam":
        this._playTone({
          freq: 320,
          endFreq: 640,
          type: "sine",
          duration: 0.5,
          gain: this.sfxVolume * 0.45,
        });
        break;

      case "giant_mode":
        [220, 277.18, 329.63, 440, 554.37, 659.25].forEach((f, i) => {
          setTimeout(() => {
            this._playTone({
              freq: f,
              endFreq: f,
              type: "square",
              duration: 0.1,
              gain: this.sfxVolume * 0.45,
            });
          }, i * 55);
        });
        break;

      case "thunder_strike":
        this._playNoise({ duration: 0.75, gain: this.sfxVolume * 0.8, bandpass: 450 });
        this._playTone({
          freq: 140,
          endFreq: 38,
          type: "sawtooth",
          duration: 0.75,
          gain: this.sfxVolume * 0.7,
        });
        break;

      case "position_swap":
        this._playTone({
          freq: 220,
          endFreq: 1480,
          type: "sine",
          duration: 0.35,
          gain: this.sfxVolume * 0.5,
        });
        setTimeout(() => {
          this._playTone({
            freq: 1480,
            endFreq: 330,
            type: "sine",
            duration: 0.3,
            gain: this.sfxVolume * 0.5,
          });
        }, 220);
        break;

      case "meteor_shower":
        for (let i = 0; i < 4; i++) {
          setTimeout(() => {
            this._playTone({
              freq: 920,
              endFreq: 120,
              type: "sawtooth",
              duration: 0.42,
              gain: this.sfxVolume * 0.45,
            });
            setTimeout(() => this.playExplosion(), 380);
          }, i * 550);
        }
        break;

      default:
        this._playTone({
          freq: 440,
          endFreq: 660,
          type: "triangle",
          duration: 0.25,
          gain: this.sfxVolume * 0.4,
        });
    }
  }

  playExplosion() {
    this.init();
    if (!this.ctx || this.muted) return;
    this._playNoise({ duration: 0.45, gain: this.sfxVolume * 0.75, bandpass: 350 });
    this._playTone({
      freq: 120,
      endFreq: 32,
      type: "sawtooth",
      duration: 0.45,
      gain: this.sfxVolume * 0.65,
    });
  }

  playSpinOut() {
    this.init();
    if (!this.ctx || this.muted) return;
    [600, 480, 720, 390, 540].forEach((f, i) => {
      setTimeout(() => {
        this._playTone({
          freq: f,
          endFreq: f * 0.82,
          type: "sine",
          duration: 0.09,
          gain: this.sfxVolume * 0.42,
        });
      }, i * 65);
    });
  }

  playShieldReflect() {
    this.init();
    if (!this.ctx || this.muted) return;
    this._playTone({
      freq: 1200,
      endFreq: 2400,
      type: "triangle",
      duration: 0.22,
      gain: this.sfxVolume * 0.55,
    });
  }

  playFinishFanfare() {
    this.init();
    if (!this.ctx || this.muted) return;
    const notes = [
      { f: 523.25, d: 0.14, t: 0 },
      { f: 523.25, d: 0.14, t: 150 },
      { f: 523.25, d: 0.14, t: 300 },
      { f: 659.25, d: 0.35, t: 450 },
      { f: 587.33, d: 0.25, t: 820 },
      { f: 659.25, d: 0.25, t: 1100 },
      { f: 783.99, d: 0.65, t: 1380 },
    ];
    for (const n of notes) {
      setTimeout(() => {
        this._playTone({
          freq: n.f,
          endFreq: n.f,
          type: "sawtooth",
          duration: n.d,
          gain: this.sfxVolume * 0.55,
          filterFreq: 2600,
        });
      }, n.t);
    }
  }

  _playTone({ freq, endFreq, type = "sine", duration = 0.2, gain = 0.3, filterFreq = 4000 }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const amp = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), now);
    if (endFreq && endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFreq, now);

    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(Math.max(0.001, gain), now + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  _playNoise({ duration = 0.2, gain = 0.3, bandpass = null, highpass = null }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(Math.max(0.001, gain), now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    if (bandpass || highpass) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = bandpass ? "bandpass" : "highpass";
      filter.frequency.setValueAtTime(bandpass || highpass, now);
      noise.connect(filter);
      filter.connect(amp);
    } else {
      noise.connect(amp);
    }

    amp.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + duration);
  }
}
