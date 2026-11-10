import * as THREE from "three";

export const WEATHER_PRESETS = {
  clear_day: {
    id: "clear_day",
    name: "☀️ Siang Cerah",
    skyColor: 0x0284c7,
    fogColor: 0x38bdf8,
    fogDensity: 0.0016,
    ambientColor: 0xbae6fd,
    ambientIntensity: 1.75,
    sunColor: 0xfef08a,
    sunIntensity: 2.3,
    sunPos: [75, 125, 50],
    roadRoughness: 0.72,
    roadMetalness: 0.15,
    kerbEmissive: 0.08,
    rainIntensity: 0,
  },
  sunset_dusk: {
    id: "sunset_dusk",
    name: "🌅 Senja Keemasan",
    skyColor: 0x3b0764,
    fogColor: 0x9a3412,
    fogDensity: 0.0022,
    ambientColor: 0xfdba74,
    ambientIntensity: 1.45,
    sunColor: 0xf97316,
    sunIntensity: 2.1,
    sunPos: [110, 48, -65],
    roadRoughness: 0.48,
    roadMetalness: 0.3,
    kerbEmissive: 0.22,
    rainIntensity: 0,
  },
  neon_night: {
    id: "neon_night",
    name: "🌙 Malam Neon",
    skyColor: 0x050814,
    fogColor: 0x0b1026,
    fogDensity: 0.0024,
    ambientColor: 0x475569,
    ambientIntensity: 1.2,
    sunColor: 0xc084fc,
    sunIntensity: 1.35,
    sunPos: [45, 95, 35],
    roadRoughness: 0.36,
    roadMetalness: 0.38,
    kerbEmissive: 0.45,
    rainIntensity: 0,
  },
  rain_storm: {
    id: "rain_storm",
    name: "⛈️ Hujan Badai",
    skyColor: 0x090f1d,
    fogColor: 0x1e293b,
    fogDensity: 0.0034,
    ambientColor: 0x64748b,
    ambientIntensity: 1.1,
    sunColor: 0x38bdf8,
    sunIntensity: 1.15,
    sunPos: [30, 100, 20],
    roadRoughness: 0.12, // Wet reflective asphalt!
    roadMetalness: 0.72,
    kerbEmissive: 0.55,
    rainIntensity: 1.0,
  },
};

const CYCLE_ORDER = ["clear_day", "sunset_dusk", "neon_night", "rain_storm"];

export class WeatherSystem {
  constructor({ scene, camera, ambientLight, sunLight, track, particles, sound, onWeatherBanner, onScreenFlash }) {
    this.scene = scene;
    this.camera = camera;
    this.ambientLight = ambientLight;
    this.sunLight = sunLight;
    this.track = track;
    this.particles = particles;
    this.sound = sound;
    this.onWeatherBanner = onWeatherBanner;
    this.onScreenFlash = onScreenFlash;

    this.mode = "auto"; // 'auto' | 'clear_day' | 'sunset_dusk' | 'neon_night' | 'rain_storm'
    this.currentPresetId = "neon_night";
    this.targetPreset = WEATHER_PRESETS.neon_night;

    this.cycleTimer = 0;
    this.cycleIntervalSec = 38; // Switch phase every 38s in auto mode
    this.cycleIndex = 2; // Start at neon_night

    this.rainIntensity = 0;
    this.stormLightningTimer = 6.0;

    this._initRainSystem();
  }

  _initRainSystem() {
    this.rainCount = 1100;
    this.rainBoxSize = 70;
    const positions = new Float32Array(this.rainCount * 6); // 2 vertices per rain streak
    this.rainDrops = [];

    for (let i = 0; i < this.rainCount; i++) {
      const x = (Math.random() - 0.5) * this.rainBoxSize;
      const y = Math.random() * 38;
      const z = (Math.random() - 0.5) * this.rainBoxSize;
      this.rainDrops.push({ x, y, z, speed: 34 + Math.random() * 14 });

      const base = i * 6;
      positions[base] = x;
      positions[base + 1] = y;
      positions[base + 2] = z;
      positions[base + 3] = x - 0.25;
      positions[base + 4] = y - 1.45;
      positions[base + 5] = z - 0.15;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0,
    });

    this.rainMesh = new THREE.LineSegments(geo, this.rainMat);
    this.rainMesh.visible = false;
    this.rainMesh.frustumCulled = false;
    this.scene.add(this.rainMesh);
  }

  setMode(mode, announce = false) {
    this.mode = mode;
    if (mode === "auto") {
      this.targetPreset = WEATHER_PRESETS[CYCLE_ORDER[this.cycleIndex]];
    } else if (WEATHER_PRESETS[mode]) {
      this.currentPresetId = mode;
      this.targetPreset = WEATHER_PRESETS[mode];
      if (announce && this.onWeatherBanner) {
        this.onWeatherBanner(`🌦️ CUACA ARENA: ${this.targetPreset.name.toUpperCase()}`);
      }
    }
  }

  applyImmediate(presetId) {
    const p = WEATHER_PRESETS[presetId] || WEATHER_PRESETS.neon_night;
    this.currentPresetId = p.id;
    this.targetPreset = p;

    if (this.scene.background) this.scene.background.setHex(p.skyColor);
    if (this.scene.fog) {
      this.scene.fog.color.setHex(p.fogColor);
      this.scene.fog.density = p.fogDensity;
    }
    this.ambientLight.color.setHex(p.ambientColor);
    this.ambientLight.intensity = p.ambientIntensity;
    this.sunLight.color.setHex(p.sunColor);
    this.sunLight.intensity = p.sunIntensity;
    this.sunLight.position.set(...p.sunPos);
    this.rainIntensity = p.rainIntensity;
    this._updateTrackSurface(p.roadRoughness, p.roadMetalness, p.kerbEmissive);
  }

  update(dt, karts, isRacing) {
    // 1. Auto-Cycle Progression during race
    if (this.mode === "auto" && isRacing) {
      this.cycleTimer += dt;
      if (this.cycleTimer >= this.cycleIntervalSec) {
        this.cycleTimer = 0;
        this.cycleIndex = (this.cycleIndex + 1) % CYCLE_ORDER.length;
        const nextId = CYCLE_ORDER[this.cycleIndex];
        this.currentPresetId = nextId;
        this.targetPreset = WEATHER_PRESETS[nextId];

        if (this.onWeatherBanner) {
          const msg =
            nextId === "rain_storm"
              ? "⛈️ PERINGATAN CUACA: HUJAN BADAI & PETIR TURUN DI SIRKUIT!"
              : `🌦️ TRANSISI WAKTU ARENA: ${this.targetPreset.name.toUpperCase()}`;
          this.onWeatherBanner(msg);
        }
      }
    }

    // 2. Smoothly Interpolate Environment Colors & Lighting
    const p = this.targetPreset;
    const lerpFactor = Math.min(1, dt * 1.4);

    if (this.scene.background) {
      this.scene.background.lerp(new THREE.Color(p.skyColor), lerpFactor);
    }
    if (this.scene.fog) {
      this.scene.fog.color.lerp(new THREE.Color(p.fogColor), lerpFactor);
      this.scene.fog.density = THREE.MathUtils.lerp(
        this.scene.fog.density,
        p.fogDensity,
        lerpFactor
      );
    }

    this.ambientLight.color.lerp(new THREE.Color(p.ambientColor), lerpFactor);
    this.ambientLight.intensity = THREE.MathUtils.lerp(
      this.ambientLight.intensity,
      p.ambientIntensity,
      lerpFactor
    );

    this.sunLight.color.lerp(new THREE.Color(p.sunColor), lerpFactor);
    this.sunLight.intensity = THREE.MathUtils.lerp(
      this.sunLight.intensity,
      p.sunIntensity,
      lerpFactor
    );
    this.sunLight.position.lerp(new THREE.Vector3(...p.sunPos), lerpFactor);

    this.rainIntensity = THREE.MathUtils.lerp(this.rainIntensity, p.rainIntensity, lerpFactor);
    this._updateTrackSurface(
      THREE.MathUtils.lerp(this._lastRoughness ?? 0.6, p.roadRoughness, lerpFactor),
      THREE.MathUtils.lerp(this._lastMetalness ?? 0.2, p.roadMetalness, lerpFactor),
      THREE.MathUtils.lerp(this._lastKerbEmissive ?? 0.2, p.kerbEmissive, lerpFactor)
    );

    // 3. Update 3D Rain Streaks & Wet Tire Spray
    if (this.rainIntensity > 0.03) {
      this.rainMesh.visible = true;
      this.rainMat.opacity = this.rainIntensity * 0.62;

      const camPos = this.camera.position;
      const posAttr = this.rainMesh.geometry.attributes.position;
      const arr = posAttr.array;

      for (let i = 0; i < this.rainCount; i++) {
        const drop = this.rainDrops[i];
        drop.y -= drop.speed * dt;
        drop.x -= 4.5 * dt; // Wind slant
        if (drop.y < -2) {
          drop.y = 32 + Math.random() * 8;
          drop.x = (Math.random() - 0.5) * this.rainBoxSize;
          drop.z = (Math.random() - 0.5) * this.rainBoxSize;
        }

        const wx = camPos.x + drop.x;
        const wy = Math.max(0, camPos.y * 0.35 + drop.y);
        const wz = camPos.z + drop.z;

        const base = i * 6;
        arr[base] = wx;
        arr[base + 1] = wy;
        arr[base + 2] = wz;
        arr[base + 3] = wx - 0.22;
        arr[base + 4] = wy - 1.5;
        arr[base + 5] = wz - 0.12;
      }
      posAttr.needsUpdate = true;

      // Emit water spray behind moving karts on wet road
      if (isRacing && this.particles && karts) {
        for (const k of karts) {
          if (k.currentSpeed > 6 && k.heightOffset === 0 && Math.random() < 0.35 * this.rainIntensity) {
            this.particles.emitExhaust(k.mesh.position, 0x93c5fd);
          }
        }
      }

      // Periodic ambient storm lightning in background
      if (this.rainIntensity > 0.5) {
        this.stormLightningTimer -= dt;
        if (this.stormLightningTimer <= 0) {
          this.stormLightningTimer = 5.5 + Math.random() * 7.0;
          if (this.onScreenFlash) {
            this.onScreenFlash("rgba(186, 230, 253, 0.28)");
          }
          if (this.particles && karts?.length > 0) {
            const randKart = karts[Math.floor(Math.random() * karts.length)];
            const boltPos = randKart.mesh.position
              .clone()
              .add(new THREE.Vector3((Math.random() - 0.5) * 35, 0, (Math.random() - 0.5) * 35));
            this.particles.emitLightningBolt(boltPos, 0x7dd3fc);
          }
        }
      }
    } else {
      this.rainMesh.visible = false;
    }
  }

  _updateTrackSurface(roughness, metalness, kerbEmissive) {
    this._lastRoughness = roughness;
    this._lastMetalness = metalness;
    this._lastKerbEmissive = kerbEmissive;

    if (this.track?.roadMat) {
      this.track.roadMat.roughness = roughness;
      this.track.roadMat.metalness = metalness;
    }
    if (this.track?.kerbMat) {
      this.track.kerbMat.emissiveIntensity = kerbEmissive;
    }
  }
}
