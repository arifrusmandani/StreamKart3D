import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import confetti from "canvas-confetti";

import { SkillCatalog, RARITY_META } from "./skills/SkillCatalog.js";
import { SoundManager } from "./audio/SoundManager.js";
import { TrackManager, TRACK_THEMES } from "./track/TrackManager.js";
import { KartEntity } from "./kart/KartEntity.js";
import { VEHICLE_STYLES } from "./kart/KartModelBuilder.js";
import { ParticleSystem } from "./vfx/ParticleSystem.js";
import { CameraDirector } from "./camera/CameraDirector.js";
import { SkillManager } from "./skills/SkillManager.js";
import { DonationManager, parsePasteNotification } from "./input/DonationEvent.js";
import { WebhookClient } from "./input/WebhookClient.js";
import { RaceController } from "./race/RaceController.js";
import { WeatherSystem } from "./weather/WeatherSystem.js";

const DEFAULT_PARTICIPANTS = [
  { name: "Elden Ring DLC", color: "#f43f5e", style: "f1" },
  { name: "GTA V Roleplay", color: "#38bdf8", style: "supercar" },
  { name: "Horror Lokal", color: "#facc15", style: "buggy" },
  { name: "Valorant Ranked", color: "#4ade80", style: "kart" },
];

const SULTAN_POOL = [
  "Sultan_Budi99",
  "King_Rizky",
  "Boss_Andi",
  "Queen_Sari",
  "Kapten_Dimas",
  "Lord_Hendra",
  "Princess_Ayu",
  "Juragan_99",
  "TuanMuda_Kevin",
  "CrazyRich_Leo",
  "Mafia_Donasi",
  "Kaisar_Reza",
  "Ratu_Sawer",
  "Admiral_Fajar",
  "Pangeran_Vino",
  "BosMuda_Aldi",
  "Shogun_Tama",
  "Duke_Nabil",
  "Baron_Gilang",
  "Lady_Clara",
  "VVIP_Dewa",
  "Emperor_Zaki",
  "Sultan_Piknik",
  "Kapten_Bima",
];

const PALETTE = [
  "#f43f5e",
  "#38bdf8",
  "#facc15",
  "#4ade80",
  "#c084fc",
  "#fb923c",
  "#22d3ee",
  "#e879f9",
  "#a3e635",
  "#f87171",
  "#60a5fa",
  "#fbbf24",
  "#34d399",
  "#f472b6",
  "#818cf8",
  "#fb7185",
  "#2dd4bf",
  "#f59e0b",
  "#a78bfa",
  "#38ef7d",
  "#00f2fe",
  "#ff6b6b",
  "#ffd93d",
  "#6bcb77",
];

function buildSultanPreset(count = 12) {
  const clamped = Math.max(2, Math.min(24, Number(count) || 12));
  return Array.from({ length: clamped }, (_, idx) => ({
    name: SULTAN_POOL[idx % SULTAN_POOL.length],
    color: PALETTE[idx % PALETTE.length],
    style: VEHICLE_STYLES[idx % VEHICLE_STYLES.length].id,
  }));
}

const SULTAN_PRESET = buildSultanPreset(5);

class StreamKartApp {
  constructor() {
    this.isPopoutAdmin = new URLSearchParams(window.location.search).get("popout") === "admin";
    if (this.isPopoutAdmin) {
      document.body.classList.add("popout-admin-mode");
      document.title = "StreamKart 3D — Pop-out Admin Control";
    }

    this.channel = new BroadcastChannel("streamkart_3d_sync_v1");
    this.participants = structuredClone(DEFAULT_PARTICIPANTS);
    this.selectedTargetCarIndex = 0;
    this.gameMode = "voting"; // 'voting' (Mode A) | 'battle_royale' (Mode B)
    this.brMaxSlots = 12; // Mode B configurable participant cap (2 - 24, safe max 24)
    this.registeredRacers = []; // Mode B registered donator slots (up to this.brMaxSlots)

    this.skillCatalog = new SkillCatalog();
    this.sound = new SoundManager();

    this.autoSimEnabled = false;
    this.autoSimTimer = 0;
    this.qualityPreset = "high";
    this.clock = new THREE.Clock();
    this.clockTime = 0;

    this._initCoreSystems();
    this._initUI();
    this._initShortcuts();
    this._initBroadcastSync();

    if (!this.isPopoutAdmin) {
      this._checkCrashRecovery();
      this._animate();
    }
  }

  _initCoreSystems() {
    this.raceController = new RaceController({
      sound: this.sound,
      onStateChange: (state) => this._onRaceStateChange(state),
      onCountdownTick: (val) => this._showCountdown(val),
      onCheckpointBanner: (msg) => this._showAnnouncementBanner(msg),
      onFinish: (result) => this._onRaceFinished(result),
      onRegistrationExpired: () => this._startFromRegistration(),
      onRaceGo: () => this._applyStartingBuffsOnRaceGo(),
    });

    this.donationManager = new DonationManager({
      skillCatalog: this.skillCatalog,
      onExecuteEvent: (evt) => this._executeDonationEvent(evt),
      onStateChange: (state) => this._renderDonationLists(state),
      onCombo: (carIdx, count) => {
        const kart = this.karts?.[carIdx];
        if (kart) {
          kart.applyBoost(0.35, 1.8, false);
          this._showAnnouncementBanner(
            `🔥 SUPPORT COMBO x${count} UNTUK #${kart.number} ${kart.name}! 🔥`
          );
        }
      },
    });

    this.webhookClient = new WebhookClient({
      onDonationEvent: (payload) => {
        this._dispatchCommand({
          type: "SUBMIT_DONATION",
          payload,
        });
      },
      onStatusChange: (whState) => this._renderWebhookStatus(whState),
    });

    if (this.isPopoutAdmin) return;

    // 1. Three.js Scene, Camera, Renderer & Post-Processing
    const canvas = document.getElementById("race-canvas");
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.2,
      1100
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lights
    this.ambientLight = new THREE.AmbientLight(0x94a3b8, 1.6);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfef08a, 2.0);
    this.sunLight.position.set(65, 110, 45);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 320;
    const d = 140;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    // Bloom Post-Processing
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.62, // strength
      0.45, // radius
      0.72 // threshold
    );
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);

    // 2. Track, Particles, Camera Director, SkillManager & Karts
    this.track = new TrackManager(this.scene);
    this.track.buildTrack("sprint", "neon_city", "STREAMKART 3D LIVE");

    this.particles = new ParticleSystem(this.scene, 320);
    this.cameraDirector = new CameraDirector(this.camera, this.track);

    this.skillManager = new SkillManager({
      scene: this.scene,
      track: this.track,
      particles: this.particles,
      sound: this.sound,
      cameraDirector: this.cameraDirector,
      onTelegraph: (info) => this._showTelegraphBanner(info),
      onScreenFlash: (color) => this._triggerScreenFlash(color),
    });

    this.weatherSystem = new WeatherSystem({
      scene: this.scene,
      camera: this.camera,
      ambientLight: this.ambientLight,
      sunLight: this.sunLight,
      track: this.track,
      particles: this.particles,
      sound: this.sound,
      onWeatherBanner: (msg) => this._showAnnouncementBanner(msg),
      onScreenFlash: (color) => this._triggerScreenFlash(color),
    });

    this.karts = [];
    this._rebuildKarts();
    this._applyRacePlanConfiguration();

    // Speedlines & Minimap 2D contexts
    this.speedCanvas = document.getElementById("speedlines-canvas");
    this.speedCtx = this.speedCanvas.getContext("2d");
    this.minimapCanvas = document.getElementById("minimap-canvas");
    this.minimapCtx = this.minimapCanvas.getContext("2d");

    window.addEventListener("resize", () => this._onResize());
    this._onResize();
  }

  _rebuildKarts() {
    if (this.isPopoutAdmin) return;
    const labelLayer = document.getElementById("kart-labels-layer");
    for (const k of this.karts) k.destroy();
    this.karts = [];

    this.participants.forEach((p, idx) => {
      const styleId = p.style || VEHICLE_STYLES[idx % VEHICLE_STYLES.length].id;
      p.style = styleId;
      const kart = new KartEntity({
        index: idx,
        number: idx + 1,
        name: p.name,
        color: p.color,
        style: styleId,
        scene: this.scene,
        labelContainer: labelLayer,
      });
      kart.resetForRace(this.participants.length);
      kart.baseSpeedUnitsPerSec =
        this.track.trackLength / this.track.currentPreset.refLapSeconds;
      this.karts.push(kart);
    });

    if (this.selectedTargetCarIndex >= this.participants.length) {
      this.selectedTargetCarIndex = 0;
    }
    this._renderTargetButtons();
    this._renderParticipantsEditor();
    this._renderLeaderboard();
  }

  _applyRacePlanConfiguration() {
    const mins = Number(document.getElementById("input-voting-minutes")?.value || 3);
    const trackChoice = document.getElementById("select-track-preset")?.value || "auto";
    const themeChoice = document.getElementById("select-track-theme")?.value || "neon_city";
    const rubberChoice = document.getElementById("select-rubberband")?.value || "low";
    const brandText =
      document.getElementById("input-streamer-brand")?.value || "STREAMKART 3D LIVE";

    const plan = this.raceController.configure({
      durationMinutes: mins,
      trackId: trackChoice === "auto" ? null : trackChoice,
      rubberBandMode: rubberChoice,
    });

    const previewEl = document.getElementById("adaptive-lap-preview");
    if (previewEl) {
      previewEl.textContent = `Durasi ${plan.durationMinutes} menit → ${plan.presetName}, ${plan.laps} Lap (~${plan.refLapSeconds} dtk/lap)`;
    }

    if (!this.isPopoutAdmin && this.track) {
      const needRebuild =
        this.track.currentPreset.id !== plan.trackId ||
        this.track.currentTheme.id !== themeChoice;
      if (needRebuild && this.raceController.state === "LOBBY") {
        this.track.buildTrack(plan.trackId, themeChoice, brandText);
        const theme = TRACK_THEMES[themeChoice] || TRACK_THEMES.neon_city;
        this.ambientLight.color.setHex(theme.ambientColor);
        this.sunLight.color.setHex(theme.sunColor);
        this.sunLight.intensity = theme.sunIntensity;
        for (const k of this.karts) {
          k.resetForRace(this.karts.length);
          k.baseSpeedUnitsPerSec =
            this.track.trackLength / this.track.currentPreset.refLapSeconds;
        }
      } else {
        this.track.updateBrandText(brandText);
      }

      const mmLabel = document.getElementById("minimap-track-name");
      if (mmLabel) mmLabel.textContent = plan.presetName;
    }

    this._updateTimerHud();
  }

  _executeDonationEvent(evt) {
    if (this.isPopoutAdmin) return;
    const kart = this.karts[evt.targetCarIndex];
    if (!kart) return;

    // Record donation amount & permanent vote support bonus
    kart.totalDonationsRp += evt.amount;
    kart.donationCount += 1;
    // Every Rp 10.000 adds a gentle permanent speed edge (capped at +18% in KartEntity)
    kart.permanentVoteBonus += (evt.amount / 10000) * 0.009;

    const skill =
      evt.resolvedSkill ||
      this.skillCatalog.resolveSkill({
        skillId: evt.skillId,
        skillKeyword: evt.skillKeyword,
        amount: evt.amount,
      });

    this.skillManager.executeSkill({
      skill,
      casterKart: kart,
      allKarts: this.karts,
      donatorName: evt.donatorName,
      amount: evt.amount,
    });
  }

  _initUI() {
    // 1. Sidebar Tabs
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(btn.dataset.tab)?.classList.add("active");
      });
    });

    // 2. Collapse / Expand Sidebar & Pop-out Admin
    const toggleSidebar = () => {
      document.getElementById("admin-sidebar")?.classList.toggle("collapsed");
      setTimeout(() => this._onResize(), 260);
    };
    document.getElementById("btn-toggle-sidebar")?.addEventListener("click", toggleSidebar);
    document.getElementById("btn-sidebar-close")?.addEventListener("click", toggleSidebar);

    const openPopout = () => {
      const url = new URL(window.location.href);
      url.searchParams.set("popout", "admin");
      window.open(url.toString(), "StreamKartAdmin", "width=460,height=820");
    };
    document.getElementById("btn-popout-admin")?.addEventListener("click", openPopout);
    document.getElementById("btn-sidebar-popout")?.addEventListener("click", openPopout);

    // 3. Transport Controls (Start, Pause, Reset) & Mode B Registration Controls
    document.getElementById("btn-race-start")?.addEventListener("click", () => {
      if (this.gameMode === "battle_royale" && this.raceController.state === "LOBBY") {
        this._dispatchCommand({ type: "OPEN_REGISTRATION" });
      } else {
        this._dispatchCommand({ type: "START_RACE" });
      }
    });
    document.getElementById("btn-race-pause")?.addEventListener("click", () => {
      this._dispatchCommand({ type: "TOGGLE_PAUSE" });
    });
    document.getElementById("btn-race-reset")?.addEventListener("click", () => {
      this._dispatchCommand({ type: "RESET_RACE" });
    });

    // Mode B Registration Overlay Buttons
    document.getElementById("btn-open-registration")?.addEventListener("click", () => {
      this._dispatchCommand({ type: "OPEN_REGISTRATION" });
    });
    document.getElementById("btn-reg-add30s")?.addEventListener("click", () => {
      this._dispatchCommand({ type: "EXTEND_REGISTRATION", seconds: 30 });
    });
    document.getElementById("btn-reg-clear")?.addEventListener("click", () => {
      this._dispatchCommand({ type: "CLEAR_REGISTRATION" });
    });
    document.getElementById("btn-reg-start-now")?.addEventListener("click", () => {
      this._dispatchCommand({ type: "START_RACE" });
    });

    const modeSelect = document.getElementById("select-game-mode");
    modeSelect?.addEventListener("change", (e) => {
      this.gameMode = e.target.value;
      document
        .getElementById("battle-royale-config-box")
        ?.classList.toggle("hidden", this.gameMode !== "battle_royale");
      const startBtn = document.getElementById("btn-race-start");
      if (startBtn && this.raceController.state === "LOBBY") {
        startBtn.textContent =
          this.gameMode === "battle_royale" ? "📢 BUKA DAFTAR" : "▶ MULAI BALAP";
      }
      this._updateParticipantsCardTitle();
      // Sinkronkan daftar peserta default sesuai mode jika masih di Lobby
      if (this.raceController.state === "LOBBY") {
        this.participants =
          this.gameMode === "battle_royale"
            ? buildSultanPreset(this.brMaxSlots)
            : structuredClone(DEFAULT_PARTICIPANTS);
        this._dispatchCommand({
          type: "UPDATE_PARTICIPANTS",
          participants: this.participants,
        });
      }
    });

    // Mode B Manual Participant Count / Max Slot Controls (2 - 24 Karts)
    const brSlotSlider = document.getElementById("input-br-max-slots");
    const brSlotNum = document.getElementById("input-br-max-slots-num");

    const syncBrMaxSlots = (val, applyToParticipants = false) => {
      const clamped = Math.max(2, Math.min(24, Number(val) || 12));
      this.brMaxSlots = clamped;
      if (brSlotSlider) brSlotSlider.value = clamped;
      if (brSlotNum) brSlotNum.value = clamped;
      document.querySelectorAll(".br-slot-btn").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.slots) === clamped);
      });
      this._updateParticipantsCardTitle();

      if (this.raceController.state === "REGISTRATION") {
        this._renderRegistrationOverlay();
      }
      if (applyToParticipants && this.raceController.state === "LOBBY") {
        // Resize current participant list while preserving any custom names already entered
        const nextList = [];
        for (let i = 0; i < clamped; i++) {
          if (this.participants[i]) {
            nextList.push({ ...this.participants[i] });
          } else {
            nextList.push({
              name: SULTAN_POOL[i % SULTAN_POOL.length],
              color: PALETTE[i % PALETTE.length],
              style: VEHICLE_STYLES[i % VEHICLE_STYLES.length].id,
            });
          }
        }
        this.participants = nextList;
        this._dispatchCommand({
          type: "UPDATE_PARTICIPANTS",
          participants: this.participants,
        });
      }
    };

    brSlotSlider?.addEventListener("input", (e) => syncBrMaxSlots(e.target.value, true));
    brSlotNum?.addEventListener("change", (e) => syncBrMaxSlots(e.target.value, true));
    document.querySelectorAll(".br-slot-btn").forEach((btn) => {
      btn.addEventListener("click", () => syncBrMaxSlots(btn.dataset.slots, true));
    });
    document.getElementById("btn-br-fill-slots")?.addEventListener("click", () => {
      syncBrMaxSlots(brSlotNum?.value || this.brMaxSlots, true);
      this._showAnnouncementBanner(
        `🏎️ Jumlah Peserta Mode B Diset ke ${this.brMaxSlots} Mobil!`
      );
    });

    // Collapse / Expand HUD Leaderboard & Right Tools Drawer
    const lbCollapseBtn = document.getElementById("btn-collapse-leaderboard");
    lbCollapseBtn?.addEventListener("click", () => {
      const lb = document.getElementById("hud-leaderboard");
      const isCollapsed = lb?.classList.toggle("collapsed");
      lbCollapseBtn.textContent = isCollapsed ? "▸" : "▾";
    });

    const toolsCollapseBtn = document.getElementById("btn-collapse-tools");
    toolsCollapseBtn?.addEventListener("click", () => {
      const drawer = document.getElementById("hud-tools-drawer");
      const isCollapsed = drawer?.classList.toggle("collapsed");
      toolsCollapseBtn.textContent = isCollapsed ? "🛠️ Tools ◂" : "🛠️ Tools ▸";
    });

    // 4. Live Time Extension (+1m / +5m)
    document.getElementById("btn-add-1m")?.addEventListener("click", () => {
      this._dispatchCommand({ type: "EXTEND_TIME", mins: 1 });
    });
    document.getElementById("btn-add-5m")?.addEventListener("click", () => {
      this._dispatchCommand({ type: "EXTEND_TIME", mins: 5 });
    });

    // 5. Camera Mode Buttons
    document.querySelectorAll(".cam-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".cam-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (this.cameraDirector) {
          this.cameraDirector.setMode(btn.dataset.cam);
        }
      });
    });

    // 6. Audio, Quality & Auto-Simulator Buttons
    const audioBtn = document.getElementById("btn-audio-toggle");
    audioBtn?.addEventListener("click", () => {
      this.sound.init();
      this.sound.setMuted(!this.sound.muted);
      audioBtn.textContent = this.sound.muted ? "🔇 Muted" : "🔊 Audio";
    });

    document.getElementById("select-quality")?.addEventListener("change", (e) => {
      this._setQualityPreset(e.target.value);
    });

    document.getElementById("select-weather")?.addEventListener("change", (e) => {
      this.weatherSystem?.setMode(e.target.value, true);
    });

    const simBtn = document.getElementById("btn-auto-sim");
    simBtn?.addEventListener("click", () => {
      this.autoSimEnabled = !this.autoSimEnabled;
      simBtn.classList.toggle("active", this.autoSimEnabled);
      simBtn.textContent = this.autoSimEnabled ? "🤖 Sim: ON" : "🤖 Sim: OFF";
    });

    // 7. Manual Donation Input Controls
    const amountInput = document.getElementById("input-donation-amount");
    const skillSelect = document.getElementById("select-manual-skill");

    this._populateSkillDropdown();
    this._renderTargetButtons();
    this._renderQuickSkillGrid();
    this._updateSkillPreviewBadge();

    document.querySelectorAll(".nom-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".nom-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (amountInput) amountInput.value = btn.dataset.amount;
        if (skillSelect) skillSelect.value = "auto";
        this._updateSkillPreviewBadge();
      });
    });

    amountInput?.addEventListener("input", () => this._updateSkillPreviewBadge());
    skillSelect?.addEventListener("change", () => this._updateSkillPreviewBadge());

    document.getElementById("btn-submit-donation")?.addEventListener("click", () => {
      this._submitManualFormDonation();
    });

    // Paste Notification Parser
    document.getElementById("btn-parse-send")?.addEventListener("click", () => {
      const pasteInput = document.getElementById("input-paste-raw");
      const parsed = parsePasteNotification(pasteInput?.value, this.participants);
      if (!parsed) return;
      this._dispatchCommand({
        type: "SUBMIT_DONATION",
        payload: {
          source: "paste",
          ...parsed,
        },
      });
      if (pasteInput) pasteInput.value = "";
    });

    document.getElementById("btn-undo-last")?.addEventListener("click", () => {
      this._dispatchCommand({ type: "UNDO_DONATION", eventId: null });
    });

    // 8. Voting Duration & Setup Controls
    const durSlider = document.getElementById("input-voting-minutes");
    const durNum = document.getElementById("input-voting-minutes-num");

    const syncDuration = (mins) => {
      const clamped = Math.max(1, Math.min(60, Number(mins) || 3));
      if (durSlider) durSlider.value = clamped;
      if (durNum) durNum.value = clamped;
      document.querySelectorAll(".dur-btn").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.mins) === clamped);
      });
      this._dispatchCommand({
        type: "UPDATE_SETUP",
        payload: this._collectSetupPayload(),
      });
    };

    durSlider?.addEventListener("input", (e) => syncDuration(e.target.value));
    durNum?.addEventListener("change", (e) => syncDuration(e.target.value));
    document.querySelectorAll(".dur-btn").forEach((btn) => {
      btn.addEventListener("click", () => syncDuration(btn.dataset.mins));
    });

    ["select-track-preset", "select-track-theme", "select-rubberband", "input-streamer-brand"].forEach(
      (id) => {
        document.getElementById(id)?.addEventListener("change", () => {
          this._dispatchCommand({
            type: "UPDATE_SETUP",
            payload: this._collectSetupPayload(),
          });
        });
      }
    );

    // 9. Participant Editor & Presets
    this._renderParticipantsEditor();
    document.getElementById("btn-add-participant")?.addEventListener("click", () => {
      const inp = document.getElementById("input-new-participant");
      const name = inp?.value.trim();
      const maxAllowed = this.gameMode === "battle_royale" ? 24 : 12;
      if (!name || this.participants.length >= maxAllowed) {
        if (this.participants.length >= maxAllowed) {
          this._showAnnouncementBanner(
            `⚠️ Batas maksimal aman (${maxAllowed} mobil) telah tercapai!`
          );
        }
        return;
      }
      const nextIdx = this.participants.length;
      this.participants.push({
        name,
        color: PALETTE[nextIdx % PALETTE.length],
        style: VEHICLE_STYLES[nextIdx % VEHICLE_STYLES.length].id,
      });
      if (this.gameMode === "battle_royale" && this.participants.length > this.brMaxSlots) {
        this.brMaxSlots = Math.min(24, this.participants.length);
        const s1 = document.getElementById("input-br-max-slots");
        const s2 = document.getElementById("input-br-max-slots-num");
        if (s1) s1.value = this.brMaxSlots;
        if (s2) s2.value = this.brMaxSlots;
      }
      if (inp) inp.value = "";
      this._dispatchCommand({
        type: "UPDATE_PARTICIPANTS",
        participants: this.participants,
      });
    });

    document.getElementById("btn-preset-reset")?.addEventListener("click", () => {
      this.participants =
        this.gameMode === "battle_royale"
          ? buildSultanPreset(this.brMaxSlots)
          : structuredClone(DEFAULT_PARTICIPANTS);
      this._dispatchCommand({
        type: "UPDATE_PARTICIPANTS",
        participants: this.participants,
      });
    });

    // 10. Tier Editor
    this._renderTierEditor();
    document.getElementById("btn-save-tiers")?.addEventListener("click", () => {
      const map = {};
      document.querySelectorAll(".tier-min-input").forEach((inp) => {
        map[inp.dataset.skillId] = Number(inp.value) || 5000;
      });
      this.skillCatalog.saveCustomTiers(map);
      this._updateSkillPreviewBadge();
      this._showAnnouncementBanner("💾 Tier Harga Skill Berhasil Disimpan!");
    });

    document.getElementById("btn-reset-tiers")?.addEventListener("click", () => {
      this.skillCatalog.resetTiers();
      this._renderTierEditor();
      this._updateSkillPreviewBadge();
    });

    // 11. Results & Podium 3D Modal Buttons
    const setPodiumViewMode = (isPodium3D) => {
      const modal = document.getElementById("results-modal");
      const floatingBar = document.getElementById("podium-floating-bar");
      modal?.classList.toggle("podium-view-mode", isPodium3D);
      floatingBar?.classList.toggle("hidden", !isPodium3D);
    };

    document.getElementById("btn-results-toggle-podium")?.addEventListener("click", () => {
      setPodiumViewMode(true);
    });
    document.getElementById("btn-podium-show-card")?.addEventListener("click", () => {
      setPodiumViewMode(false);
    });

    document.getElementById("btn-results-confetti")?.addEventListener("click", () => {
      this._fireConfetti();
    });
    document.getElementById("btn-podium-confetti")?.addEventListener("click", () => {
      this._fireConfetti();
    });

    const resetFromPodium = () => {
      const modal = document.getElementById("results-modal");
      modal?.classList.add("hidden");
      modal?.classList.remove("podium-view-mode");
      document.getElementById("podium-floating-bar")?.classList.add("hidden");
      this._dispatchCommand({ type: "RESET_RACE" });
    };
    document.getElementById("btn-results-newrace")?.addEventListener("click", resetFromPodium);
    document.getElementById("btn-podium-newrace")?.addEventListener("click", resetFromPodium);

    // 12. Multi-Tenant Webhook Controls (Tab 4)
    this._initWebhookUI();
  }

  _initWebhookUI() {
    this.webhookClient?.init();

    const providerSelect = document.getElementById("select-webhook-provider");
    providerSelect?.addEventListener("change", (e) => {
      if (!this.webhookClient) return;
      this.webhookClient.provider = e.target.value;
      this.webhookClient.saveConfig();
      this.webhookClient._emitStatus();
    });

    document.getElementById("btn-regen-room")?.addEventListener("click", async () => {
      const slug = document.getElementById("input-room-slug")?.value.trim() || "streamer";
      await this.webhookClient?.regenerateRoom(slug);
      this._showAnnouncementBanner("🔄 Room ID & Secret Token Baru Berhasil Dibuat!");
    });

    const urlInp = document.getElementById("input-webhook-url");
    document.getElementById("btn-toggle-webhook-vis")?.addEventListener("click", () => {
      if (!urlInp) return;
      urlInp.type = urlInp.type === "password" ? "text" : "password";
    });

    document.getElementById("btn-copy-webhook-url")?.addEventListener("click", async () => {
      const url = this.webhookClient?.getWebhookUrl();
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        this._showAnnouncementBanner("📋 URL Webhook Pribadi Berhasil Disalin!");
      } catch {
        if (urlInp) {
          urlInp.type = "text";
          urlInp.select();
        }
      }
    });

    // Webhook Token Controls (Tako X-Tako-Signature HMAC SHA-256)
    const tokenInp = document.getElementById("input-webhook-token");
    tokenInp?.addEventListener("input", (e) => {
      if (!this.webhookClient) return;
      this.webhookClient.webhookToken = e.target.value.trim();
      this.webhookClient.saveConfig();
      this.webhookClient._emitStatus();
    });

    document.getElementById("btn-toggle-token-vis")?.addEventListener("click", () => {
      if (!tokenInp) return;
      tokenInp.type = tokenInp.type === "password" ? "text" : "password";
    });

    document.getElementById("btn-copy-webhook-token")?.addEventListener("click", async () => {
      const tok =
        tokenInp?.value.trim() ||
        this.webhookClient?.webhookToken ||
        this.webhookClient?.secret ||
        "";
      if (!tok) return;
      try {
        await navigator.clipboard.writeText(tok);
        this._showAnnouncementBanner("📋 Webhook Token Berhasil Disalin!");
      } catch {
        if (tokenInp) {
          tokenInp.type = "text";
          tokenInp.select();
        }
      }
    });

    document.getElementById("btn-gen-webhook-token")?.addEventListener("click", () => {
      if (!this.webhookClient) return;
      const newTok = this.webhookClient.generateNewWebhookToken();
      if (tokenInp) {
        tokenInp.value = newTok;
        tokenInp.type = "text";
      }
      this._showAnnouncementBanner(
        "🔑 Webhook Token Baru Dibuat! Salin token & URL Webhook ke Dashboard Tako."
      );
    });

    const reqSigChk = document.getElementById("chk-require-signature");
    reqSigChk?.addEventListener("change", (e) => {
      if (!this.webhookClient) return;
      this.webhookClient.requireSignature = Boolean(e.target.checked);
      this.webhookClient.saveConfig();
      this.webhookClient._emitStatus();
    });

    document.getElementById("btn-send-test-webhook")?.addEventListener("click", async () => {
      const donatorName =
        document.getElementById("input-wh-test-name")?.value.trim() || "Sultan_Saweria";
      const amount = Number(
        document.getElementById("input-wh-test-amount")?.value || 50000
      );
      const message =
        document.getElementById("input-wh-test-msg")?.value.trim() ||
        "#1 !misil tes webhook masuk!";
      const provider =
        document.getElementById("select-webhook-provider")?.value || "saweria";

      try {
        await this.webhookClient?.sendTestWebhook({
          provider,
          donatorName,
          amount,
          message,
        });
      } catch (err) {
        this._showAnnouncementBanner(`❌ Gagal Tes Webhook: ${err.message}`);
      }
    });

    document.getElementById("btn-save-pusher")?.addEventListener("click", async () => {
      if (!this.webhookClient) return;
      this.webhookClient.pusherKey =
        document.getElementById("input-pusher-key")?.value.trim() || "";
      this.webhookClient.pusherCluster =
        document.getElementById("input-pusher-cluster")?.value.trim() || "ap1";
      this.webhookClient.saveConfig();
      await this.webhookClient.connectRealtime();
      this._showAnnouncementBanner("🔌 Konfigurasi Realtime Disimpan!");
    });
  }

  _renderWebhookStatus(whState) {
    const badge = document.getElementById("webhook-status-badge");
    const roomInp = document.getElementById("input-room-id-readonly");
    const urlInp = document.getElementById("input-webhook-url");
    const tokenInp = document.getElementById("input-webhook-token");
    const reqSigChk = document.getElementById("chk-require-signature");
    const provSel = document.getElementById("select-webhook-provider");
    const logsList = document.getElementById("webhook-logs-list");

    if (badge) {
      if (whState.status === "connected_pusher") {
        badge.textContent = "🟢 Pusher Private Aktif";
        badge.style.color = "#4ade80";
      } else if (whState.status === "connected_local") {
        badge.textContent = "🟢 Relay Lokal Aktif";
        badge.style.color = "#4ade80";
      } else if (whState.status === "connected_cloud_poll") {
        badge.textContent = "🟢 Cloud Relay Aktif";
        badge.style.color = "#4ade80";
      } else if (whState.status === "connecting") {
        badge.textContent = "🟡 Menghubungkan...";
        badge.style.color = "#facc15";
      } else {
        badge.textContent = "🔴 Terputus";
        badge.style.color = "#f43f5e";
      }
    }

    if (roomInp) roomInp.value = whState.roomId || "";
    if (urlInp) urlInp.value = whState.webhookUrl || "";
    if (tokenInp && document.activeElement !== tokenInp) {
      tokenInp.value = whState.webhookToken || "";
    }
    if (reqSigChk) {
      reqSigChk.checked = Boolean(whState.requireSignature);
    }
    if (provSel && whState.provider) provSel.value = whState.provider;

    if (logsList && Array.isArray(whState.logs)) {
      if (whState.logs.length === 0) {
        logsList.innerHTML = `<div style="font-size:11px;color:#64748b;text-align:center;padding:8px">Menunggu paket webhook...</div>`;
      } else {
        logsList.innerHTML = whState.logs
          .map(
            (l) => `
            <div class="history-item">
              <div style="width:100%">
                <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                  <span style="color:#94a3b8">${l.time}</span>
                  <span class="lb-badge" style="background:#0284c7">${l.provider.toUpperCase()}</span>
                  <span class="lb-badge" style="background:${
                    l.signatureVerified ? "#15803d" : "#475569"
                  }" title="${l.signatureMethod || ""}">
                    ${l.signatureVerified ? "🔒 HMAC Verified" : "🔑 URL Token"}
                  </span>
                  <strong>${l.donatorName}</strong>
                  <span style="color:#4ade80">Rp ${Number(l.amount).toLocaleString("id-ID")}</span>
                </div>
                <div style="font-size:10px;color:#cbd5e1;margin-top:2px">${l.rawMessage || "-"}</div>
                ${
                  l.rawPayload
                    ? `<details style="margin-top:4px;font-size:10px;color:#94a3b8">
                        <summary style="cursor:pointer;color:#38bdf8">🔍 Lihat Raw Data & Header yang Diterima</summary>
                        <pre style="margin-top:4px;padding:6px;background:rgba(0,0,0,0.45);border-radius:6px;overflow-x:auto;color:#e2e8f0;font-size:9.5px">${JSON.stringify(
                          { headers: l.receivedHeaders, body: l.rawPayload },
                          null,
                          2
                        )}</pre>
                      </details>`
                    : ""
                }
              </div>
            </div>
          `
          )
          .join("");
      }
    }
  }

  _collectSetupPayload() {
    return {
      durationMinutes: Number(document.getElementById("input-voting-minutes")?.value || 3),
      trackPreset: document.getElementById("select-track-preset")?.value || "auto",
      trackTheme: document.getElementById("select-track-theme")?.value || "neon_city",
      rubberBand: document.getElementById("select-rubberband")?.value || "low",
      brandText:
        document.getElementById("input-streamer-brand")?.value || "STREAMKART 3D LIVE",
    };
  }

  _initShortcuts() {
    window.addEventListener("keydown", (e) => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Tab") {
        e.preventDefault();
        document.getElementById("admin-sidebar")?.classList.toggle("collapsed");
        setTimeout(() => this._onResize(), 260);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        this._dispatchCommand({ type: "UNDO_DONATION", eventId: null });
        return;
      }

      if (e.key === "Enter" && isTyping) {
        if (document.activeElement?.id === "input-new-participant") {
          document.getElementById("btn-add-participant")?.click();
          return;
        }
        if (document.activeElement?.id === "input-paste-raw") {
          document.getElementById("btn-parse-send")?.click();
          return;
        }
        this._submitManualFormDonation();
        return;
      }

      if (isTyping) return;

      // 1-9 selects target kart
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < this.participants.length) {
          this.selectedTargetCarIndex = idx;
          this._renderTargetButtons();
        }
      }

      // Q / W / E / R nominal presets
      const presetMap = { q: 5000, w: 10000, e: 25000, r: 50000 };
      const k = e.key.toLowerCase();
      if (presetMap[k]) {
        const amountInput = document.getElementById("input-donation-amount");
        if (amountInput) amountInput.value = presetMap[k];
        document.querySelectorAll(".nom-btn").forEach((b) => {
          b.classList.toggle("active", Number(b.dataset.amount) === presetMap[k]);
        });
        this._updateSkillPreviewBadge();
      }

      if (e.code === "Space") {
        e.preventDefault();
        this._dispatchCommand({ type: "TOGGLE_PAUSE" });
      }
    });
  }

  _initBroadcastSync() {
    this.channel.onmessage = (msg) => {
      const cmd = msg.data;
      if (!cmd || !cmd.type) return;
      this._handleCommand(cmd, false);
    };
  }

  _dispatchCommand(cmd) {
    this._handleCommand(cmd, true);
  }

  _handleCommand(cmd, broadcast = true) {
    if (broadcast) {
      this.channel.postMessage(cmd);
    }

    switch (cmd.type) {
      case "OPEN_REGISTRATION": {
        const regSec = Number(document.getElementById("input-br-reg-sec")?.value || 60);
        const minRp = Number(document.getElementById("input-br-min-rp")?.value || 10000);
        this.gameMode = "battle_royale";
        this.registeredRacers = [];
        if (!this.isPopoutAdmin) {
          document.getElementById("results-modal")?.classList.add("hidden");
          this.skillManager.clearAll();
          this.donationManager.resetForNewRace();
          this.raceController.openRegistration(regSec, minRp);
          this._renderRegistrationOverlay();
        }
        break;
      }

      case "EXTEND_REGISTRATION":
        if (!this.isPopoutAdmin) {
          this.raceController.addRegistrationSeconds(cmd.seconds || 30);
          this._renderRegistrationOverlay();
        }
        break;

      case "CLEAR_REGISTRATION":
        this.registeredRacers = [];
        this._renderRegistrationOverlay();
        break;

      case "START_RACE":
        if (!this.isPopoutAdmin) {
          if (this.raceController.state === "REGISTRATION") {
            this._startFromRegistration();
          } else {
            document.getElementById("results-modal")?.classList.add("hidden");
            document.getElementById("registration-overlay")?.classList.add("hidden");
            this.skillManager.clearAll();
            this.donationManager.resetForNewRace();
            for (const k of this.karts) {
              k.totalDonationsRp = 0;
              k.donationCount = 0;
              k.permanentVoteBonus = 0;
            }
            this.raceController.startCountdown(this.karts, this.track);
          }
        }
        break;

      case "TOGGLE_PAUSE":
        if (!this.isPopoutAdmin) {
          this.raceController.togglePause();
        }
        break;

      case "RESET_RACE":
        if (!this.isPopoutAdmin) {
          document.getElementById("results-modal")?.classList.add("hidden");
          document.getElementById("registration-overlay")?.classList.add("hidden");
          this.skillManager.clearAll();
          this.donationManager.resetForNewRace();
          this.raceController.resetToLobby(this.karts);
          this._renderLeaderboard();
          this._updateTimerHud();
        }
        break;

      case "EXTEND_TIME":
        if (!this.isPopoutAdmin) {
          this.raceController.addExtraMinutes(cmd.mins || 1, this.track);
          this._showAnnouncementBanner(`⏱ WAKTU VOTING DITAMBAH +${cmd.mins} MENIT!`);
        }
        break;

      case "SUBMIT_DONATION":
        this.sound.init();
        if (this.raceController.state === "REGISTRATION") {
          this._handleRegistrationDonation(cmd.payload);
        } else {
          // In Mode B during race, if donatorName matches a racer and no explicit target, target their own car
          const payload = { ...cmd.payload };
          if (this.gameMode === "battle_royale" && payload.targetCarIndex === null) {
            const matchIdx = this.participants.findIndex(
              (p) => p.name.toLowerCase() === String(payload.donatorName || "").toLowerCase()
            );
            if (matchIdx !== -1) payload.targetCarIndex = matchIdx;
          }
          this.donationManager.submitDonation(payload, this.participants.length);
        }
        break;

      case "ASSIGN_UNASSIGNED":
        this.donationManager.assignUnassigned(cmd.eventId, cmd.targetCarIndex);
        break;

      case "UNDO_DONATION": {
        const undone = this.donationManager.undoEvent(cmd.eventId);
        if (undone && !this.isPopoutAdmin && this.karts[undone.targetCarIndex]) {
          const kart = this.karts[undone.targetCarIndex];
          kart.totalDonationsRp = Math.max(0, kart.totalDonationsRp - undone.amount);
          kart.donationCount = Math.max(0, kart.donationCount - 1);
          kart.permanentVoteBonus = Math.max(
            0,
            kart.permanentVoteBonus - (undone.amount / 10000) * 0.009
          );
        }
        break;
      }

      case "UPDATE_SETUP": {
        const p = cmd.payload;
        if (p) {
          const s1 = document.getElementById("input-voting-minutes");
          const s2 = document.getElementById("input-voting-minutes-num");
          if (s1) s1.value = p.durationMinutes;
          if (s2) s2.value = p.durationMinutes;
          this._applyRacePlanConfiguration();
        }
        break;
      }

      case "UPDATE_PARTICIPANTS":
        if (Array.isArray(cmd.participants) && cmd.participants.length >= 2) {
          this.participants = cmd.participants;
          this._rebuildKarts();
        }
        break;
    }
  }

  _submitManualFormDonation(overrideSkillId = null) {
    const donatorName =
      document.getElementById("input-donator-name")?.value.trim() || "Penonton";
    const amount = Number(document.getElementById("input-donation-amount")?.value || 25000);
    const selectSkill = document.getElementById("select-manual-skill")?.value || "auto";
    const rawMessage = document.getElementById("input-donation-msg")?.value.trim() || "";

    const skillId = overrideSkillId || (selectSkill !== "auto" ? selectSkill : null);
    let effectiveAmount = amount;
    if (overrideSkillId) {
      const sk = this.skillCatalog.getById(overrideSkillId);
      if (sk) effectiveAmount = sk.minAmount;
    }

    this._dispatchCommand({
      type: "SUBMIT_DONATION",
      payload: {
        source: "manual",
        donatorName,
        amount: effectiveAmount,
        targetCarIndex: this.selectedTargetCarIndex,
        skillId,
        rawMessage,
      },
    });

    const msgInput = document.getElementById("input-donation-msg");
    if (msgInput) msgInput.value = "";
  }

  _populateSkillDropdown() {
    const select = document.getElementById("select-manual-skill");
    if (!select) return;
    select.innerHTML = `<option value="auto">✨ Otomatis dari Nominal / !Keyword</option>`;
    for (const s of this.skillCatalog.skills) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = `${s.icon} ${s.name} (Rp ${s.minAmount.toLocaleString("id-ID")})`;
      select.appendChild(opt);
    }
  }

  _updateSkillPreviewBadge() {
    const badge = document.getElementById("skill-preview-badge");
    if (!badge) return;
    const amount = Number(document.getElementById("input-donation-amount")?.value || 5000);
    const skillId = document.getElementById("select-manual-skill")?.value || "auto";
    const resolved = this.skillCatalog.resolveSkill({ skillId, amount });
    const rarity = RARITY_META[resolved.rarity] || RARITY_META.common;

    badge.textContent = `${resolved.icon} ${resolved.name} (${rarity.label})`;
    badge.style.background = rarity.badgeBg;
    badge.style.borderColor = rarity.border;
    badge.style.color = rarity.color;
  }

  _renderTargetButtons() {
    const container = document.getElementById("manual-target-buttons");
    if (!container) return;
    container.innerHTML = "";

    this.participants.forEach((p, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `target-kart-btn ${idx === this.selectedTargetCarIndex ? "selected" : ""}`;
      btn.innerHTML = `
        <span class="lb-badge" style="background:${p.color}">#${idx + 1}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</span>
      `;
      btn.addEventListener("click", () => {
        this.selectedTargetCarIndex = idx;
        this._renderTargetButtons();
      });
      container.appendChild(btn);
    });
  }

  _renderQuickSkillGrid() {
    const grid = document.getElementById("quick-skill-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (const s of this.skillCatalog.skills) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quick-skill-btn";
      btn.title = `${s.name}: ${s.description}`;
      btn.innerHTML = `<span>${s.icon}</span><span>${s.name.split(" ")[0]}</span>`;
      btn.addEventListener("click", () => {
        this._submitManualFormDonation(s.id);
      });
      grid.appendChild(btn);
    }
  }

  _updateParticipantsCardTitle() {
    const partTitle = document.getElementById("participants-card-title");
    if (!partTitle) return;
    if (this.gameMode === "battle_royale") {
      partTitle.textContent = `👑 Daftar Pembalap Donatur (${this.participants.length} / Maks ${this.brMaxSlots})`;
    } else {
      partTitle.textContent = `🏎️ Daftar Opsi Voting (${this.participants.length} / Maks 12)`;
    }
  }

  _renderParticipantsEditor() {
    this._updateParticipantsCardTitle();
    const list = document.getElementById("participants-editor-list");
    if (!list) return;
    list.innerHTML = "";

    this.participants.forEach((p, idx) => {
      const curStyle = p.style || VEHICLE_STYLES[idx % VEHICLE_STYLES.length].id;
      const styleOpts = VEHICLE_STYLES.map(
        (vs) =>
          `<option value="${vs.id}" ${vs.id === curStyle ? "selected" : ""}>${vs.name}</option>`
      ).join("");

      const row = document.createElement("div");
      row.className = "participant-row";
      row.innerHTML = `
        <span class="lb-badge" style="background:${p.color}">#${idx + 1}</span>
        <input type="color" class="participant-color" value="${p.color}" />
        <input type="text" class="participant-name-inp" value="${p.name}" />
        <select class="participant-style-sel" title="Pilih Bentuk Bodi Mobil">${styleOpts}</select>
        <button type="button" class="icon-btn del-part-btn" ${
          this.participants.length <= 2 ? "disabled" : ""
        }>✕</button>
      `;

      row.querySelector(".participant-color")?.addEventListener("input", (e) => {
        this.participants[idx].color = e.target.value;
        this._dispatchCommand({
          type: "UPDATE_PARTICIPANTS",
          participants: this.participants,
        });
      });

      row.querySelector(".participant-name-inp")?.addEventListener("change", (e) => {
        this.participants[idx].name = e.target.value.trim() || `Opsi #${idx + 1}`;
        this._dispatchCommand({
          type: "UPDATE_PARTICIPANTS",
          participants: this.participants,
        });
      });

      row.querySelector(".participant-style-sel")?.addEventListener("change", (e) => {
        this.participants[idx].style = e.target.value;
        this._dispatchCommand({
          type: "UPDATE_PARTICIPANTS",
          participants: this.participants,
        });
      });

      row.querySelector(".del-part-btn")?.addEventListener("click", () => {
        if (this.participants.length <= 2) return;
        this.participants.splice(idx, 1);
        this._dispatchCommand({
          type: "UPDATE_PARTICIPANTS",
          participants: this.participants,
        });
      });

      list.appendChild(row);
    });
  }

  _renderTierEditor() {
    const list = document.getElementById("tier-editor-list");
    if (!list) return;
    list.innerHTML = "";

    for (const s of this.skillCatalog.skills) {
      const rarity = RARITY_META[s.rarity] || RARITY_META.common;
      const row = document.createElement("div");
      row.className = "tier-row";
      row.innerHTML = `
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800">
            <span>${s.icon} ${s.name}</span>
            <span style="font-size:9px;padding:1px 6px;border-radius:99px;background:${rarity.badgeBg};color:${rarity.color}">${rarity.label}</span>
            <code style="font-size:10px;color:#38bdf8">!${s.keywords[0]}</code>
          </div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">${s.description}</div>
        </div>
        <input
          type="number"
          class="tier-min-input num-small"
          style="width:95px !important"
          step="1000"
          min="1000"
          data-skill-id="${s.id}"
          value="${s.minAmount}"
        />
      `;
      list.appendChild(row);
    }
  }

  _renderDonationLists({ history, unassigned }) {
    // 1. Unassigned Donations
    const unCard = document.getElementById("unassigned-card");
    const unList = document.getElementById("unassigned-list");
    if (unCard && unList) {
      unCard.classList.toggle("hidden", unassigned.length === 0);
      unList.innerHTML = "";
      for (const evt of unassigned) {
        const div = document.createElement("div");
        div.className = "history-item";
        const btns = this.participants
          .map(
            (p, idx) =>
              `<button class="mini-action-btn assign-btn" data-id="${evt.eventId}" data-idx="${idx}" style="padding:3px 6px;background:${p.color}">#${idx + 1}</button>`
          )
          .join(" ");
        div.innerHTML = `
          <div>
            <strong>${evt.donatorName}</strong> • Rp ${evt.amount.toLocaleString("id-ID")}
            <div style="font-size:10px;color:#94a3b8">${evt.rawMessage || "Tanpa nomor"}</div>
          </div>
          <div style="display:flex;gap:3px">${btns}</div>
        `;
        div.querySelectorAll(".assign-btn").forEach((b) => {
          b.addEventListener("click", () => {
            this._dispatchCommand({
              type: "ASSIGN_UNASSIGNED",
              eventId: b.dataset.id,
              targetCarIndex: Number(b.dataset.idx),
            });
          });
        });
        unList.appendChild(div);
      }
    }

    // 2. History List
    const histEl = document.getElementById("donation-history-list");
    if (!histEl) return;
    histEl.innerHTML = "";
    if (history.length === 0) {
      histEl.innerHTML = `<div style="font-size:11px;color:#64748b;text-align:center;padding:8px">Belum ada donasi masuk.</div>`;
      return;
    }

    for (const evt of history.slice(0, 18)) {
      const timeStr = new Date(evt.timestamp).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const item = document.createElement("div");
      item.className = `history-item ${evt.undone ? "undone" : ""}`;
      item.innerHTML = `
        <div>
          <span style="color:#94a3b8">${timeStr}</span>
          <strong>${evt.donatorName}</strong>
          <span style="color:#4ade80">Rp ${evt.amount.toLocaleString("id-ID")}</span>
          → <strong>#${(evt.targetCarIndex ?? 0) + 1}</strong>
          <span>${evt.resolvedSkill?.icon || ""} ${evt.resolvedSkill?.name || ""}</span>
        </div>
        ${
          !evt.undone
            ? `<button class="mini-action-btn item-undo-btn" style="padding:2px 6px;font-size:10px">↶</button>`
            : ""
        }
      `;
      item.querySelector(".item-undo-btn")?.addEventListener("click", () => {
        this._dispatchCommand({ type: "UNDO_DONATION", eventId: evt.eventId });
      });
      histEl.appendChild(item);
    }
  }

  _onRaceStateChange(state) {
    const badge = document.getElementById("hud-race-state");
    const timerBox = document.getElementById("hud-timer-box");
    const startBtn = document.getElementById("btn-race-start");
    const pauseBtn = document.getElementById("btn-race-pause");

    const labels = {
      LOBBY: "SIAP DI GARIS START",
      REGISTRATION: "📢 PENDAFTARAN DONATUR DIBUKA",
      COUNTDOWN: "BERSIAP MULAI...",
      RACING:
        this.gameMode === "battle_royale"
          ? "👑 DONATOR BATTLE ROYALE 👑"
          : "🔥 LIVE VOTING RACE 🔥",
      LAST_CALL: "⏰ 60 DETIK TERAKHIR! ⏰",
      PAUSED: "⏸ BALAPAN DIJEDA",
      FINISH: "🏁 BALAPAN SELESAI 🏁",
    };
    if (badge) badge.textContent = labels[state] || state;
    timerBox?.classList.toggle("last-call", state === "LAST_CALL");
    document
      .getElementById("registration-overlay")
      ?.classList.toggle("hidden", state !== "REGISTRATION");

    if (startBtn) {
      startBtn.disabled =
        state === "COUNTDOWN" || state === "RACING" || state === "LAST_CALL";
      if (state === "LOBBY") {
        startBtn.textContent =
          this.gameMode === "battle_royale" ? "📢 BUKA DAFTAR" : "▶ MULAI BALAP";
      } else if (state === "REGISTRATION") {
        startBtn.textContent = "🏁 MULAI SEKARANG";
      }
    }
    if (pauseBtn) {
      pauseBtn.disabled = state !== "RACING" && state !== "LAST_CALL" && state !== "PAUSED";
      pauseBtn.textContent = state === "PAUSED" ? "▶ RESUME" : "⏸ PAUSE";
    }
  }

  _showCountdown(val) {
    const overlay = document.getElementById("countdown-overlay");
    const text = document.getElementById("countdown-text");
    if (!overlay || !text) return;

    if (val === null) {
      overlay.classList.add("hidden");
      return;
    }
    overlay.classList.remove("hidden");
    text.textContent = String(val);
    text.style.animation = "none";
    void text.offsetWidth;
    text.style.animation = "countPop 0.5s ease-out";
  }

  _showTelegraphBanner({ skill, headline }) {
    const container = document.getElementById("telegraph-container");
    if (!container) return;
    const rarity = RARITY_META[skill.rarity] || RARITY_META.common;

    const card = document.createElement("div");
    card.className = "telegraph-card";
    card.style.background = rarity.badgeBg;
    card.style.border = `2px solid ${rarity.border}`;
    card.style.boxShadow = `0 10px 28px rgba(0,0,0,0.65), 0 0 24px ${rarity.glow}`;

    card.innerHTML = `
      <span class="telegraph-icon">${skill.icon}</span>
      <div class="telegraph-meta">
        <span class="telegraph-rarity" style="color:${rarity.color}">${rarity.label} SKILL • ${skill.name.toUpperCase()}</span>
        <span class="telegraph-headline">${headline}</span>
      </div>
    `;

    container.prepend(card);
    while (container.children.length > 3) {
      container.lastElementChild?.remove();
    }
    setTimeout(() => {
      card.remove();
    }, 3400);
  }

  _showAnnouncementBanner(text) {
    const banner = document.getElementById("announcement-banner");
    if (!banner) return;
    banner.textContent = text;
    banner.classList.remove("hidden");
    clearTimeout(this._bannerTimeout);
    this._bannerTimeout = setTimeout(() => {
      banner.classList.add("hidden");
    }, 3800);
  }

  _triggerScreenFlash(color) {
    const flash = document.getElementById("screen-flash");
    if (!flash) return;
    flash.style.background = color;
    flash.style.opacity = "1";
    setTimeout(() => {
      flash.style.opacity = "0";
    }, 260);
  }

  _onRaceFinished({ winner, standings, finishReason }) {
    this._fireConfetti();

    // Place Top 3 Winners onto the 3D Championship Podium Pedestals!
    if (this.track?.podiumSlots) {
      standings.forEach((kart, idx) => {
        const place = idx + 1;
        const slot = this.track.podiumSlots.find((s) => s.place === place);
        if (slot) {
          kart.setPodiumSlot(slot);
        } else {
          // Park 4th+ karts neatly behind the stage
          kart.setPodiumSlot(null);
        }
      });
    }

    const modal = document.getElementById("results-modal");
    const floatingBar = document.getElementById("podium-floating-bar");
    const podiumWinnerText = document.getElementById("podium-bar-winner-text");
    if (podiumWinnerText && winner) {
      podiumWinnerText.textContent = `🏆 JUARA #1: #${winner.number} ${winner.name.toUpperCase()} (Rp ${winner.totalDonationsRp.toLocaleString("id-ID")})`;
    }

    // Start in 3D Podium Showcase view for 3.2 seconds so viewers see the 3D Podium ceremony first!
    modal?.classList.remove("hidden");
    modal?.classList.add("podium-view-mode");
    floatingBar?.classList.remove("hidden");

    const reasonBadge = document.getElementById("results-reason-badge");
    const winnerBox = document.getElementById("results-winner-box");
    const listEl = document.getElementById("results-standings-list");
    const mvpBox = document.getElementById("results-mvp-box");

    if (reasonBadge) {
      reasonBadge.textContent =
        finishReason === "PHOTO_FINISH"
          ? "⏱ PHOTO FINISH — WAKTU VOTING HABIS!"
          : "🏁 SELURUH LAP SELESAI TEPAT WAKTU!";
    }

    if (winnerBox && winner) {
      winnerBox.innerHTML = `
        <div style="font-size:13px;color:#facc15;margin-bottom:4px">JUARA #1 PILIHAN PENONTON</div>
        <div style="font-size:26px;color:#ffffff">
          <span style="background:${winner.color};padding:2px 10px;border-radius:8px;margin-right:8px">#${winner.number}</span>
          ${winner.name}
        </div>
        <div style="font-size:13px;color:#4ade80;margin-top:6px">
          Total Dukungan Donasi: Rp ${winner.totalDonationsRp.toLocaleString("id-ID")} (${winner.donationCount}x donasi)
        </div>
      `;
    }

    if (listEl) {
      listEl.innerHTML = standings
        .map(
          (k, idx) => `
          <div class="history-item">
            <div>
              <strong style="color:#facc15;margin-right:6px">#${idx + 1}</strong>
              <span class="lb-badge" style="background:${k.color}">#${k.number}</span>
              <strong style="margin-left:6px">${k.name}</strong>
            </div>
            <div style="color:#4ade80;font-weight:700">
              Rp ${k.totalDonationsRp.toLocaleString("id-ID")}
            </div>
          </div>
        `
        )
        .join("");
    }

    const mvp = this.donationManager.getMvpDonator();
    if (mvpBox) {
      if (mvp) {
        mvpBox.innerHTML = `
          <div style="font-size:32px;margin-bottom:6px">👑</div>
          <div style="font-size:18px;font-weight:900;color:#fff">${mvp.name}</div>
          <div style="font-size:15px;font-weight:800;color:#facc15;margin:4px 0">
            Rp ${mvp.totalAmount.toLocaleString("id-ID")}
          </div>
          <div style="font-size:11px;color:#cbd5e1">
            ${mvp.count}x Donasi • Skill Terakhir: ${mvp.lastSkill}
          </div>
        `;
      } else {
        mvpBox.innerHTML = `<div style="font-size:12px;color:#94a3b8">Belum ada donatur tercatat pada sesi ini.</div>`;
      }
    }

    modal?.classList.remove("hidden");
  }

  // ================= MODE B: DONATOR BATTLE ROYALE METHODS =================
  _computeStartingBuffMeta(totalRp) {
    if (totalRp >= 100000) {
      return { id: "giant", label: "🦖 Giant Start + 🛡️ Shield (6s)", color: "#c084fc" };
    }
    if (totalRp >= 50000) {
      return { id: "nitro_shield", label: "🚀 Nitro NOS + 🛡️ Shield (5s)", color: "#facc15" };
    }
    if (totalRp >= 25000) {
      return { id: "nitro", label: "🚀 Nitro NOS Start (3.6s)", color: "#38bdf8" };
    }
    if (totalRp >= 15000) {
      return { id: "shield", label: "🛡️ Guardian Shield Start (5s)", color: "#4ade80" };
    }
    return { id: "boost", label: "💨 Mini Boost Start (2.2s)", color: "#cbd5e1" };
  }

  _handleRegistrationDonation(payload = {}) {
    const donatorName = String(payload.donatorName || "Sultan_Anonim").trim().slice(0, 28);
    const amount = Math.max(0, Number(payload.amount) || 0);
    const minRp = this.raceController.minEntryRp || 10000;
    const rawMsg = String(payload.rawMessage || "").toLowerCase();

    if (amount < minRp) {
      this._showAnnouncementBanner(
        `⚠️ Donasi ${donatorName} (Rp ${amount.toLocaleString("id-ID")}) belum mencapai minimal daftar Rp ${minRp.toLocaleString("id-ID")}!`
      );
      return;
    }

    // Check if donator requested a specific car body style (!f1, !supercar, !buggy, !kart)
    let requestedStyle = null;
    for (const vs of VEHICLE_STYLES) {
      if (rawMsg.includes(`!${vs.id}`) || payload.skillKeyword === vs.id) {
        requestedStyle = vs.id;
        break;
      }
    }

    const existing = this.registeredRacers.find(
      (r) => r.name.toLowerCase() === donatorName.toLowerCase()
    );
    const maxSlots = Math.max(2, Math.min(24, this.brMaxSlots || 12));

    if (existing) {
      existing.entryTotalRp += amount;
      existing.donationCount += 1;
      if (requestedStyle) existing.style = requestedStyle;
      existing.buffMeta = this._computeStartingBuffMeta(existing.entryTotalRp);
      this.sound.playSkill("guardian_shield");
      this._showAnnouncementBanner(
        `⚡ UPGRADE GARASI! ${existing.name} (Rp ${existing.entryTotalRp.toLocaleString("id-ID")}) → ${existing.buffMeta.label}!`
      );
    } else if (this.registeredRacers.length < maxSlots) {
      const idx = this.registeredRacers.length;
      const style = requestedStyle || VEHICLE_STYLES[idx % VEHICLE_STYLES.length].id;
      const buffMeta = this._computeStartingBuffMeta(amount);
      this.registeredRacers.push({
        name: donatorName,
        color: PALETTE[idx % PALETTE.length],
        style,
        entryTotalRp: amount,
        donationCount: 1,
        buffMeta,
      });
      this.sound.playSkill("giant_mode");
      this._showAnnouncementBanner(
        `🏎️ PEMBALAP BARU! ${donatorName} bergabung di Slot #${idx + 1}/${maxSlots} (${style.toUpperCase()})!`
      );
    } else {
      // All Slots Full: Check if new donation beats the lowest slot (VIP Eviction)
      let lowestIdx = 0;
      for (let i = 1; i < this.registeredRacers.length; i++) {
        if (this.registeredRacers[i].entryTotalRp < this.registeredRacers[lowestIdx].entryTotalRp) {
          lowestIdx = i;
        }
      }
      const lowest = this.registeredRacers[lowestIdx];
      if (amount > lowest.entryTotalRp) {
        const style = requestedStyle || lowest.style;
        const buffMeta = this._computeStartingBuffMeta(amount);
        const evictedName = lowest.name;
        this.registeredRacers[lowestIdx] = {
          name: donatorName,
          color: lowest.color,
          style,
          entryTotalRp: amount,
          donationCount: 1,
          buffMeta,
        };
        this.sound.playSkill("thunder_strike");
        this._showAnnouncementBanner(
          `👑 KUDETA SLOT #${lowestIdx + 1}! ${donatorName} (Rp ${amount.toLocaleString("id-ID")}) menggeser ${evictedName}!`
        );
      } else {
        this._showAnnouncementBanner(
          `⚠️ ${maxSlots} Slot Penuh! Butuh donasi > Rp ${lowest.entryTotalRp.toLocaleString("id-ID")} untuk merebut slot!`
        );
        return;
      }
    }

    // Sync participants & 3D Karts on the starting grid live!
    if (this.registeredRacers.length >= 1) {
      this.participants = this.registeredRacers.map((r) => ({
        name: r.name,
        color: r.color,
        style: r.style,
      }));
      this._rebuildKarts();
    }
    this._renderRegistrationOverlay();
  }

  _renderRegistrationOverlay() {
    const grid = document.getElementById("reg-slots-grid");
    const counter = document.getElementById("reg-slots-counter");
    const ruleBanner = document.getElementById("reg-rule-banner");
    const timerDigits = document.getElementById("reg-timer-digits");
    const maxSlots = Math.max(2, Math.min(24, this.brMaxSlots || 12));

    const minRp = this.raceController.minEntryRp || 10000;
    if (ruleBanner) {
      ruleBanner.innerHTML = `
        Donasi minimal <strong>Rp ${minRp.toLocaleString("id-ID")}</strong> untuk mendaftarkan nama Anda sebagai mobil (Kuota: <strong>${maxSlots} Mobil</strong>)!
        Donasi lebih besar mendapat <strong>Starting Buff (Boost / Shield / Nitro / Giant)</strong> di garis start!
        Ketik <code>!f1</code>, <code>!supercar</code>, <code>!buggy</code>, atau <code>!kart</code> di pesan untuk memilih bodi mobil.
      `;
    }

    if (counter) {
      counter.textContent = `SLOT TERISI: ${this.registeredRacers.length} / ${maxSlots} PEMBALAP`;
    }

    const rem = Math.max(0, Math.ceil(this.raceController.registrationRemainingSeconds));
    const mm = String(Math.floor(rem / 60)).padStart(2, "0");
    const ss = String(rem % 60).padStart(2, "0");
    if (timerDigits) timerDigits.textContent = `${mm}:${ss}`;

    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 0; i < maxSlots; i++) {
      const r = this.registeredRacers[i];
      const div = document.createElement("div");
      if (r) {
        const styleMeta =
          VEHICLE_STYLES.find((v) => v.id === r.style) || VEHICLE_STYLES[0];
        div.className = "reg-slot-item";
        div.style.borderColor = r.color;
        div.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <span class="lb-badge" style="background:${r.color}">#${i + 1}</span>
              <strong style="font-size:12px;margin-left:4px">${r.name}</strong>
            </div>
            <span style="font-size:11px;font-weight:800;color:#4ade80">Rp ${(r.entryTotalRp / 1000).toFixed(0)}k</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#cbd5e1;margin-top:2px">
            <span>${styleMeta.name}</span>
            <span style="color:${r.buffMeta.color};font-weight:700">${r.buffMeta.label}</span>
          </div>
        `;
      } else {
        div.className = "reg-slot-item empty";
        div.textContent = `Slot #${i + 1} — Menunggu Donatur...`;
      }
      grid.appendChild(div);
    }
  }

  _startFromRegistration() {
    // Ensure at least 4 racers if fewer than 2 donators registered
    if (this.registeredRacers.length < 2) {
      const needed = 4 - this.registeredRacers.length;
      for (let i = 0; i < needed; i++) {
        const preset = SULTAN_PRESET[i % SULTAN_PRESET.length];
        this.registeredRacers.push({
          name: preset.name,
          color: preset.color,
          style: preset.style,
          entryTotalRp: 10000,
          donationCount: 1,
          buffMeta: this._computeStartingBuffMeta(10000),
        });
      }
    }

    this.participants = this.registeredRacers.map((r) => ({
      name: r.name,
      color: r.color,
      style: r.style,
    }));
    this._rebuildKarts();

    document.getElementById("registration-overlay")?.classList.add("hidden");
    this.skillManager.clearAll();
    this.donationManager.resetForNewRace();
    this.raceController.startCountdown(this.karts, this.track);
  }

  _applyStartingBuffsOnRaceGo() {
    if (this.gameMode !== "battle_royale" || this.registeredRacers.length === 0) return;

    this.registeredRacers.forEach((r, idx) => {
      const kart = this.karts[idx];
      if (!kart) return;
      kart.totalDonationsRp = r.entryTotalRp;
      kart.donationCount = r.donationCount;
      kart.permanentVoteBonus = Math.min(0.12, (r.entryTotalRp / 10000) * 0.008);

      const buffId = r.buffMeta?.id;
      if (buffId === "giant") {
        kart.applyGiant(5.0, 0.55);
        kart.applyShield(6.0);
      } else if (buffId === "nitro_shield") {
        kart.applyBoost(0.85, 4.0, true);
        kart.applyShield(5.0);
      } else if (buffId === "nitro") {
        kart.applyBoost(0.85, 3.6, true);
      } else if (buffId === "shield") {
        kart.applyShield(5.0);
        kart.applyBoost(0.35, 2.0, false);
      } else {
        kart.applyBoost(0.38, 2.2, false);
      }
    });
  }

  _fireConfetti() {
    confetti({
      particleCount: 95,
      spread: 80,
      origin: { y: 0.55 },
    });
  }

  _checkCrashRecovery() {
    const snap = this.raceController.loadSnapshot();
    const modal = document.getElementById("recovery-modal");
    if (!snap || !modal) return;

    const minsLeft = Math.ceil(snap.remainingSeconds / 60);
    const desc = document.getElementById("recovery-desc");
    if (desc) {
      desc.textContent = `Sisa waktu ~${minsLeft} menit (${snap.karts.length} peserta). Lanjutkan?`;
    }
    modal.classList.remove("hidden");

    document.getElementById("btn-recover-yes")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      this.participants = snap.karts.map((k) => ({ name: k.name, color: k.color }));
      this._rebuildKarts();
      this.raceController.votingDurationMinutes = snap.votingDurationMinutes;
      this.raceController.totalLaps = snap.totalLaps;
      this.raceController.remainingSeconds = snap.remainingSeconds;
      this.raceController.elapsedSeconds = snap.elapsedSeconds;

      snap.karts.forEach((savedKart, idx) => {
        if (this.karts[idx]) {
          Object.assign(this.karts[idx], {
            t: savedKart.t,
            currentLap: savedKart.currentLap,
            totalProgress: savedKart.totalProgress,
            totalDonationsRp: savedKart.totalDonationsRp || 0,
            donationCount: savedKart.donationCount || 0,
            permanentVoteBonus: savedKart.permanentVoteBonus || 0,
          });
        }
      });

      this.raceController.state = "RACING";
      this._onRaceStateChange("RACING");
    });

    document.getElementById("btn-recover-no")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      this.raceController.clearSavedSnapshot();
    });
  }

  _setQualityPreset(preset) {
    this.qualityPreset = preset;
    if (this.isPopoutAdmin) return;
    if (preset === "low") {
      this.renderer.setPixelRatio(1);
      this.bloomPass.enabled = false;
      this.renderer.shadowMap.enabled = false;
    } else if (preset === "medium") {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
      this.bloomPass.enabled = true;
      this.bloomPass.strength = 0.45;
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.bloomPass.enabled = true;
      this.bloomPass.strength = 0.65;
      this.renderer.shadowMap.enabled = true;
    }
  }

  _updateTimerHud() {
    const timerEl = document.getElementById("hud-timer-value");
    const lapEl = document.getElementById("hud-lap-value");
    const paceEl = document.getElementById("hud-pace-value");

    const rem = Math.max(0, Math.ceil(this.raceController.remainingSeconds));
    const mm = String(Math.floor(rem / 60)).padStart(2, "0");
    const ss = String(rem % 60).padStart(2, "0");
    if (timerEl) timerEl.textContent = `${mm}:${ss}`;

    const leaderLap = this.karts?.length
      ? Math.min(
          this.raceController.totalLaps,
          Math.max(1, Math.floor(Math.max(...this.karts.map((k) => k.totalProgress)) + 1))
        )
      : 1;
    if (lapEl) lapEl.textContent = `${leaderLap} / ${this.raceController.totalLaps}`;
    if (paceEl) paceEl.textContent = `${this.raceController.pacingMultiplier.toFixed(2)}x`;
  }

  _renderLeaderboard() {
    const container = document.getElementById("leaderboard-rows");
    const potEl = document.getElementById("hud-total-pot");
    if (!container || !this.karts) return;

    const sorted = [...this.karts].sort((a, b) => a.rank - b.rank);
    const totalPot = this.karts.reduce((acc, k) => acc + k.totalDonationsRp, 0);
    if (potEl) potEl.textContent = `Rp ${totalPot.toLocaleString("id-ID")}`;

    container.innerHTML = "";
    for (const k of sorted) {
      const pct = Math.min(
        100,
        Math.max(4, (Math.max(0, k.totalProgress) / this.raceController.totalLaps) * 100)
      );
      const isFocused = this.cameraDirector?.focusedKartIndex === k.index;

      const row = document.createElement("div");
      row.className = `lb-row ${isFocused ? "focused" : ""}`;
      row.innerHTML = `
        <div class="lb-top">
          <div class="lb-left">
            <span class="lb-rank">${k.rank}</span>
            <span class="lb-badge" style="background:${k.color}">#${k.number}</span>
            <span class="lb-name">${k.name}</span>
            <span>${k.statusEmoji || ""}</span>
          </div>
          <span class="lb-donated">Rp ${(k.totalDonationsRp / 1000).toFixed(0)}k</span>
        </div>
        <div class="lb-bar-track">
          <div class="lb-bar-fill" style="width:${pct.toFixed(1)}%;background:${k.color}"></div>
        </div>
      `;
      row.addEventListener("click", () => {
        if (!this.cameraDirector) return;
        const nextFocus =
          this.cameraDirector.focusedKartIndex === k.index ? null : k.index;
        this.cameraDirector.setFocusedKart(nextFocus);
        this._renderLeaderboard();
      });
      container.appendChild(row);
    }
  }

  _drawMinimap() {
    if (!this.minimapCtx || !this.track) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const scale = 0.56 / this.track.currentPreset.scale;
    const cx = w * 0.5;
    const cy = h * 0.5;

    // Draw track loop
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const pt = this.track.curve.getPointAt(i / 100);
      const x = cx + pt.x * scale;
      const y = cy + pt.z * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
    ctx.lineWidth = 6;
    ctx.stroke();

    // Draw karts
    for (const k of this.karts) {
      const x = cx + k.mesh.position.x * scale;
      const y = cy + k.mesh.position.z * scale;
      ctx.beginPath();
      ctx.arc(x, y, k.rank === 1 ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = k.color;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  _drawSpeedLines() {
    if (!this.speedCtx) return;
    const ctx = this.speedCtx;
    const w = this.speedCanvas.width;
    const h = this.speedCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const leader = [...this.karts].sort((a, b) => a.rank - b.rank)[0];
    if (!leader || (leader.boostTimer <= 0 && !this.raceController.isChaosMode)) return;

    ctx.strokeStyle = leader.isNitro
      ? "rgba(192, 132, 252, 0.35)"
      : "rgba(56, 189, 248, 0.28)";
    ctx.lineWidth = 2;
    const cx = w * 0.5;
    const cy = h * 0.5;

    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r1 = Math.min(w, h) * (0.34 + Math.random() * 0.12);
      const r2 = Math.max(w, h) * 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
      ctx.stroke();
    }
  }

  _updateHypeHud() {
    const hypeRatio = this.donationManager.getHypeProgress(250000);
    const pct = Math.round(hypeRatio * 100);
    const fill = document.getElementById("hype-bar-fill");
    const pctText = document.getElementById("hype-percent");
    const subText = document.getElementById("hype-status-text");

    if (fill) fill.style.width = `${pct}%`;
    if (pctText) pctText.textContent = `${pct}%`;
    if (hypeRatio >= 1 && !this.raceController.isChaosMode) {
      this.raceController.triggerChaosMode(15.0);
    }
    if (subText) {
      subText.textContent = this.raceController.isChaosMode
        ? `🔥 CHAOS MODE AKTIF (${Math.ceil(this.raceController.chaosTimer)}s)!`
        : "Penuhkan bar untuk memicu CHAOS MODE!";
    }
  }

  _onResize() {
    if (this.isPopoutAdmin || !this.renderer) return;
    const viewport = document.getElementById("viewport-area");
    const w = viewport?.clientWidth || window.innerWidth;
    const h = viewport?.clientHeight || window.innerHeight;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);

    if (this.speedCanvas) {
      this.speedCanvas.width = w;
      this.speedCanvas.height = h;
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const rawDt = this.clock.getDelta();
    const dt = Math.min(0.1, rawDt);
    this.clockTime += dt;

    const state = this.raceController.state;
    const isRacing = state === "RACING" || state === "LAST_CALL";

    // Auto-Demo Simulator (triggers realistic random donations during REGISTRATION or RACING)
    if (this.autoSimEnabled && (isRacing || state === "REGISTRATION")) {
      this.autoSimTimer -= dt;
      if (this.autoSimTimer <= 0) {
        this.autoSimTimer = state === "REGISTRATION" ? 1.45 : 2.0 + Math.random() * 2.2;
        const simNames = [
          "Sultan_Budi",
          "King_Rizky",
          "Sari_Cute",
          "Dimas_Pro",
          "Ayu_Stream",
          "Reza_99",
          "Boss_Andi",
          "Kapten_Leo",
          "Putri_Gaming",
          "Hendra_VIP",
        ];
        const simAmounts = [10000, 15000, 25000, 50000, 75000, 100000, 150000];
        const simStyles = ["!f1", "!supercar", "!buggy", "!kart"];
        const randomCar = Math.floor(Math.random() * Math.max(1, this.karts.length));
        const randomAmt = simAmounts[Math.floor(Math.random() * simAmounts.length)];
        const randomStyle = simStyles[Math.floor(Math.random() * simStyles.length)];
        this._dispatchCommand({
          type: "SUBMIT_DONATION",
          payload: {
            source: "simulator",
            donatorName: simNames[Math.floor(Math.random() * simNames.length)],
            amount: randomAmt,
            targetCarIndex: state === "REGISTRATION" ? null : randomCar,
            rawMessage: state === "REGISTRATION" ? `${randomStyle} siap gas!` : "",
          },
        });
      }
    }

    // 1. Update Track, Donation Queue & Race Controller
    this.track.update(dt);
    this.donationManager.update(dt);
    this.raceController.update(dt, this.karts, this.track);

    // 2. Update Karts
    const leaderProgress =
      this.karts.length > 0 ? Math.max(...this.karts.map((k) => k.totalProgress)) : 0;
    const rbStrength = this.raceController.getRubberBandStrength();

    for (const kart of this.karts) {
      kart.update(dt, {
        track: this.track,
        pacingMultiplier: this.raceController.pacingMultiplier,
        rubberBandStrength: rbStrength,
        leaderProgress,
        totalKarts: this.karts.length,
        isRacing,
        clockTime: this.clockTime,
        particles: this.particles,
      });
    }

    // 3. Update Skills, Projectiles, Traps, Weather & Particles
    this.skillManager.update(dt, this.karts, isRacing);
    this.weatherSystem?.update(dt, this.karts, isRacing);
    this.particles.update(dt);

    // 3b. Launch 3D Podium Fireworks during FINISH state
    if (state === "FINISH" && this.track?.podiumCenter) {
      this._fireworkTimer = (this._fireworkTimer || 0) - dt;
      if (this._fireworkTimer <= 0) {
        this._fireworkTimer = 0.55 + Math.random() * 0.45;
        const fwPos = this.track.podiumCenter
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 14,
              5.5 + Math.random() * 5,
              -3.5 + (Math.random() - 0.5) * 3
            )
          );
        const colors = [0xfacc15, 0xf43f5e, 0x38bdf8, 0x4ade80, 0xc084fc];
        const c1 = colors[Math.floor(Math.random() * colors.length)];
        const c2 = colors[Math.floor(Math.random() * colors.length)];
        this.particles.emitExplosion(fwPos, c1, c2, 26);
      }
    }

    // 4. Update Broadcast Camera Director
    this.cameraDirector.update(dt, this.karts, state);

    // 5. Render 3D Scene with Post-Processing
    if (this.qualityPreset === "low") {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }

    // 6. Update Floating Kart Labels & HUD at ~20Hz
    const viewport = document.getElementById("viewport-area");
    const vw = viewport?.clientWidth || window.innerWidth;
    const vh = viewport?.clientHeight || window.innerHeight;
    for (const kart of this.karts) {
      kart.updateScreenLabel(this.camera, vw, vh);
    }

    this._drawSpeedLines();
    if (Math.floor(this.clockTime * 15) !== this._lastHudTick) {
      this._lastHudTick = Math.floor(this.clockTime * 15);
      this._updateTimerHud();
      this._renderLeaderboard();
      this._drawMinimap();
      this._updateHypeHud();
      if (state === "REGISTRATION") {
        this._renderRegistrationOverlay();
      }
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.streamKartApp = new StreamKartApp();
});
