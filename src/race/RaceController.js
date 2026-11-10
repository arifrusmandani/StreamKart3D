import { TRACK_PRESETS } from "../track/TrackManager.js";

const SNAPSHOT_STORAGE_KEY = "streamkart_active_race_snapshot_v1";

export class RaceController {
  constructor({
    sound,
    onStateChange,
    onCountdownTick,
    onCheckpointBanner,
    onFinish,
    onRegistrationExpired,
    onRaceGo,
  }) {
    this.sound = sound;
    this.onStateChange = onStateChange;
    this.onCountdownTick = onCountdownTick;
    this.onCheckpointBanner = onCheckpointBanner;
    this.onFinish = onFinish;
    this.onRegistrationExpired = onRegistrationExpired;
    this.onRaceGo = onRaceGo;

    this.state = "LOBBY"; // LOBBY | REGISTRATION | COUNTDOWN | RACING | PAUSED | LAST_CALL | FINISH | RESULTS
    this.gameMode = "voting"; // voting (Mode A) | battle_royale (Mode B)

    this.registrationDurationSeconds = 60;
    this.registrationRemainingSeconds = 60;
    this.minEntryRp = 10000;

    this.votingDurationMinutes = 3;
    this.manualLapOverride = null;
    this.totalLaps = 6;
    this.remainingSeconds = 180;
    this.elapsedSeconds = 0;

    this.pacingMultiplier = 1.0;
    this.pacingTickTimer = 0;
    this.rubberBandMode = "low"; // off | low | medium
    this.pureVoteWeight = true;

    this.countdownValue = 3;
    this.countdownTimer = 0;

    this.isChaosMode = false;
    this.chaosTimer = 0;
    this.nextCheckpointSec = 600; // Every 10 minutes
    this.snapshotTimer = 0;
    this.finishReason = "LAP_COMPLETE"; // LAP_COMPLETE | PHOTO_FINISH
  }

  /**
   * Computes recommended track preset and lap count from voting duration (1–60 min).
   */
  static computeRacePlan(durationMinutes, currentTrackId = null, manualLaps = null) {
    const mins = Math.max(1, Math.min(60, Number(durationMinutes) || 3));
    const totalSeconds = mins * 60;

    let recommendedTrackId = "sprint";
    if (mins >= 21) recommendedTrackId = "grandprix";
    else if (mins >= 6) recommendedTrackId = "circuit";

    const trackId = currentTrackId || recommendedTrackId;
    const preset = TRACK_PRESETS[trackId] || TRACK_PRESETS.circuit;
    const computedLaps = Math.max(1, Math.round(totalSeconds / preset.refLapSeconds));
    const laps = manualLaps && manualLaps >= 1 ? manualLaps : computedLaps;

    return {
      durationMinutes: mins,
      totalSeconds,
      recommendedTrackId,
      trackId,
      presetName: preset.name,
      refLapSeconds: preset.refLapSeconds,
      laps,
    };
  }

  configure({ durationMinutes, trackId, manualLaps = null, gameMode = "voting", rubberBandMode = "low", pureVoteWeight = true }) {
    const plan = RaceController.computeRacePlan(durationMinutes, trackId, manualLaps);
    this.votingDurationMinutes = plan.durationMinutes;
    this.manualLapOverride = manualLaps;
    this.totalLaps = plan.laps;
    this.remainingSeconds = plan.totalSeconds;
    this.gameMode = gameMode;
    this.rubberBandMode = rubberBandMode;
    this.pureVoteWeight = pureVoteWeight;
    this._emitChange();
    return plan;
  }

  getRubberBandStrength() {
    if (this.rubberBandMode === "off") return 0;
    if (this.rubberBandMode === "medium") return 0.085;
    return 0.042; // low
  }

  openRegistration(durationSeconds = 60, minEntryRp = 10000) {
    this.clearSavedSnapshot();
    this.gameMode = "battle_royale";
    this.registrationDurationSeconds = Math.max(15, Number(durationSeconds) || 60);
    this.registrationRemainingSeconds = this.registrationDurationSeconds;
    this.minEntryRp = Math.max(1000, Number(minEntryRp) || 10000);
    this.state = "REGISTRATION";
    this._emitChange();
  }

  addRegistrationSeconds(extraSec = 30) {
    if (this.state !== "REGISTRATION") return;
    this.registrationRemainingSeconds += extraSec;
  }

  startCountdown(karts, track) {
    this.clearSavedSnapshot();
    for (const k of karts) {
      k.resetForRace(karts.length);
      // Set base speed so 1 lap at m=1.0 takes refLapSeconds
      k.baseSpeedUnitsPerSec = track.trackLength / track.currentPreset.refLapSeconds;
    }

    this.remainingSeconds = this.votingDurationMinutes * 60;
    this.elapsedSeconds = 0;
    this.pacingMultiplier = 1.0;
    this.isChaosMode = false;
    this.chaosTimer = 0;
    this.nextCheckpointSec = 600;

    this.state = "COUNTDOWN";
    this.countdownValue = 3;
    this.countdownTimer = 1.0;
    this.sound.playCountdown(3);
    if (this.onCountdownTick) this.onCountdownTick(3);
    this._emitChange();
  }

  togglePause() {
    if (this.state === "RACING" || this.state === "LAST_CALL") {
      this.prevActiveState = this.state;
      this.state = "PAUSED";
      this._emitChange();
    } else if (this.state === "PAUSED") {
      this.state = this.prevActiveState || "RACING";
      this._emitChange();
    }
  }

  addExtraMinutes(extraMins, track) {
    if (this.state !== "RACING" && this.state !== "LAST_CALL" && this.state !== "PAUSED") return;
    const addSec = extraMins * 60;
    this.remainingSeconds += addSec;
    this.votingDurationMinutes = Math.min(60, this.votingDurationMinutes + extraMins);

    // Also add proportional laps so pacing stays natural
    const extraLaps = Math.max(1, Math.round(addSec / track.currentPreset.refLapSeconds));
    this.totalLaps += extraLaps;

    if (this.remainingSeconds > 60 && this.state === "LAST_CALL") {
      this.state = "RACING";
      this.sound.isLastCall = false;
    }
    this._emitChange();
  }

  triggerChaosMode(duration = 15.0) {
    if (this.isChaosMode) return;
    this.isChaosMode = true;
    this.chaosTimer = duration;
    this.sound.isChaos = true;
    if (this.onCheckpointBanner) {
      this.onCheckpointBanner("🔥 HYPE METER PENUH! CHAOS MODE 15 DETIK! 🔥");
    }
    this._emitChange();
  }

  resetToLobby(karts) {
    this.clearSavedSnapshot();
    this.state = "LOBBY";
    this.remainingSeconds = this.votingDurationMinutes * 60;
    this.elapsedSeconds = 0;
    this.pacingMultiplier = 1.0;
    this.isChaosMode = false;
    this.sound.isChaos = false;
    this.sound.isLastCall = false;
    for (const k of karts) {
      k.resetForRace(karts.length);
      k.totalDonationsRp = 0;
      k.donationCount = 0;
      k.permanentVoteBonus = 0;
    }
    this._emitChange();
  }

  update(dt, karts, track) {
    // 0. Registration State (Mode B: Donator Battle Royale)
    if (this.state === "REGISTRATION") {
      this.registrationRemainingSeconds = Math.max(0, this.registrationRemainingSeconds - dt);
      if (this.registrationRemainingSeconds <= 0) {
        if (this.onRegistrationExpired) {
          this.onRegistrationExpired();
        }
      }
      return;
    }

    // 1. Countdown State
    if (this.state === "COUNTDOWN") {
      this.countdownTimer -= dt;
      if (this.countdownTimer <= 0) {
        this.countdownValue -= 1;
        if (this.countdownValue > 0) {
          this.countdownTimer = 1.0;
          this.sound.playCountdown(this.countdownValue);
          if (this.onCountdownTick) this.onCountdownTick(this.countdownValue);
        } else if (this.countdownValue === 0) {
          this.countdownTimer = 0.75;
          this.sound.playCountdown(0);
          if (this.onCountdownTick) this.onCountdownTick("GO!");
        } else {
          if (this.onCountdownTick) this.onCountdownTick(null);
          this.state = this.remainingSeconds <= 60 ? "LAST_CALL" : "RACING";
          this.sound.startBgm();
          if (this.onRaceGo) this.onRaceGo();
          this._emitChange();
        }
      }
      return;
    }

    if (this.state !== "RACING" && this.state !== "LAST_CALL") {
      return;
    }

    // 2. Tick Wall-Clock Voting Timer
    this.remainingSeconds = Math.max(0, this.remainingSeconds - dt);
    this.elapsedSeconds += dt;

    // Transition to LAST_CALL at 60s remaining
    if (this.state === "RACING" && this.remainingSeconds <= 60 && this.remainingSeconds > 0) {
      this.state = "LAST_CALL";
      this.sound.isLastCall = true;
      if (this.onCheckpointBanner) {
        this.onCheckpointBanner("⏰ 60 DETIK TERAKHIR! PENENTUAN VOTING! ⏰");
      }
      this._emitChange();
    }

    // Check 10-minute Halftime / Checkpoint Banner for long races
    if (this.elapsedSeconds >= this.nextCheckpointSec) {
      const minsPassed = Math.round(this.nextCheckpointSec / 60);
      this.nextCheckpointSec += 600;
      if (this.onCheckpointBanner) {
        this.onCheckpointBanner(`🏁 CHECKPOINT ${minsPassed} MENIT! BONUS BOOST SEMUA PESERTA!`);
      }
      for (const k of karts) {
        k.applyBoost(0.45, 2.5, false);
      }
    }

    // Tick Chaos Mode
    if (this.isChaosMode) {
      this.chaosTimer -= dt;
      if (this.chaosTimer <= 0) {
        this.isChaosMode = false;
        this.sound.isChaos = false;
        this._emitChange();
      }
    }

    // 3. Rank Calculation
    const sorted = [...karts].sort((a, b) => b.totalProgress - a.totalProgress);
    sorted.forEach((k, idx) => {
      k.rank = idx + 1;
    });
    const leader = sorted[0];

    // 4. Pacing Controller (§4.3): Recalculate global multiplier m every 0.5s
    this.pacingTickTimer -= dt;
    if (this.pacingTickTimer <= 0 && leader) {
      this.pacingTickTimer = 0.5;
      const remainingLapsForLeader = Math.max(0.02, this.totalLaps - leader.totalProgress);
      const remainingDistanceUnits = remainingLapsForLeader * track.trackLength;
      const baseSpeed = leader.baseSpeedUnitsPerSec || 20;
      const safeRemSec = Math.max(1.5, this.remainingSeconds);

      const rawTargetM = remainingDistanceUnits / (baseSpeed * safeRemSec);
      const clampedTargetM = Math.max(0.75, Math.min(1.3, rawTargetM));
      this.pacingMultiplier += (clampedTargetM - this.pacingMultiplier) * 0.18;
    }

    // 5. Check Finish Condition (Leader completes totalLaps OR Voting Timer hits 00:00)
    if (leader && leader.totalProgress >= this.totalLaps) {
      leader.finished = true;
      this.finishReason = "LAP_COMPLETE";
      this._completeRace(sorted);
      return;
    }

    if (this.remainingSeconds <= 0) {
      this.finishReason = "PHOTO_FINISH";
      if (leader) leader.finished = true;
      this._completeRace(sorted);
      return;
    }

    // 6. Periodic Snapshot to localStorage every 5s (§11.5)
    this.snapshotTimer += dt;
    if (this.snapshotTimer >= 5.0) {
      this.snapshotTimer = 0;
      this.saveSnapshot(karts);
    }
  }

  _completeRace(sortedKarts) {
    this.clearSavedSnapshot();
    this.state = "FINISH";
    this.sound.isChaos = false;
    this.sound.isLastCall = false;
    this.sound.stopBgm();
    this.sound.playFinishFanfare();
    this._emitChange();

    if (this.onFinish) {
      this.onFinish({
        winner: sortedKarts[0],
        standings: sortedKarts,
        finishReason: this.finishReason,
      });
    }
  }

  saveSnapshot(karts) {
    try {
      const payload = {
        savedAt: Date.now(),
        votingDurationMinutes: this.votingDurationMinutes,
        totalLaps: this.totalLaps,
        remainingSeconds: this.remainingSeconds,
        elapsedSeconds: this.elapsedSeconds,
        karts: karts.map((k) => ({
          number: k.number,
          name: k.name,
          color: k.color,
          t: k.t,
          currentLap: k.currentLap,
          totalProgress: k.totalProgress,
          totalDonationsRp: k.totalDonationsRp,
          donationCount: k.donationCount,
          permanentVoteBonus: k.permanentVoteBonus,
        })),
      };
      localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }

  loadSnapshot() {
    try {
      const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Only offer recovery if snapshot is < 2 hours old and has remaining time
      if (Date.now() - data.savedAt > 7200000 || data.remainingSeconds <= 3) {
        this.clearSavedSnapshot();
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  clearSavedSnapshot() {
    try {
      localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  _emitChange() {
    if (this.onStateChange) {
      this.onStateChange(this.state);
    }
  }
}
