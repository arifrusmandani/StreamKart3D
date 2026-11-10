import * as THREE from "three";
import { buildStylizedKartMesh } from "./KartModelBuilder.js";

export class KartEntity {
  constructor({ index, number, name, color, style = "f1", scene, labelContainer }) {
    this.index = index;
    this.number = number;
    this.name = name;
    this.color = color;
    this.style = style;
    this.scene = scene;
    this.podiumSlot = null; // { position: Vector3, lookAt: Vector3, place: 1|2|3 }

    // Progress & Lap state
    this.t = 0;
    this.currentLap = 0;
    this.totalProgress = 0;
    this.rank = index + 1;
    this.finished = false;
    this.finishTime = null;

    // Donation stats for this kart/option
    this.totalDonationsRp = 0;
    this.donationCount = 0;
    this.permanentVoteBonus = 0;

    // Pseudo-physics state
    this.baseSpeedUnitsPerSec = 20.0;
    this.currentSpeed = 0;
    this.lateralOffset = ((index % 3) - 1) * 2.5;
    this.targetLateralOffset = this.lateralOffset;
    this.laneChangeCooldown = 1.5 + Math.random() * 2;
    this.noiseSeed = Math.random() * 100;

    // Jump & vertical knockup physics
    this.heightOffset = 0;
    this.verticalVelocity = 0;

    // Status Effect Timers (FSM)
    this.boostTimer = 0;
    this.boostMultiplier = 0;
    this.isNitro = false;

    this.shieldTimer = 0;
    this.spinTimer = 0;
    this.stunTimer = 0;
    this.freezeTimer = 0;
    this.oilTimer = 0;
    this.giantTimer = 0;
    this.shrunkTimer = 0;
    this.stunImmunityTimer = 0;

    this.statusEmoji = "";
    this.statusEmojiTimer = 0;
    this.isDrifting = false;
    this.spinAngle = 0;
    this.currentScale = 1.0;

    // Build 3D Kart Model
    this.model = buildStylizedKartMesh({ colorHex: color, number, style: this.style });
    this.mesh = this.model.root;
    this.scene.add(this.mesh);

    // Build Floating HTML Label above Kart
    this.labelEl = document.createElement("div");
    this.labelEl.className = "kart-nametag";
    this.labelEl.innerHTML = `
      <span class="kart-tag-num" style="background:${color}">#${number}</span>
      <span class="kart-tag-name">${this._escape(name)}</span>
      <span class="kart-tag-emoji"></span>
    `;
    if (labelContainer) {
      labelContainer.appendChild(this.labelEl);
    }
  }

  resetForRace(totalKarts = 4) {
    const cols = totalKarts > 12 ? 4 : 3;
    const row = Math.floor(this.index / cols);
    const colIdx = this.index % cols;

    this.t = 0.993 - row * 0.0085 - colIdx * 0.0014;
    if (this.t < 0) this.t += 1;
    this.hasCrossedStartLine = false;
    this.currentLap = 0;
    this.totalProgress = 0;
    this.rank = this.index + 1;
    this.finished = false;
    this.finishTime = null;

    const centeredCol = colIdx - (cols - 1) * 0.5;
    const colSpacing = cols === 4 ? 2.45 : 2.65;
    this.lateralOffset = centeredCol * colSpacing + (row % 2 === 0 ? 0.22 : -0.22);
    this.targetLateralOffset = this.lateralOffset;
    this.currentSpeed = 0;
    this.heightOffset = 0;
    this.verticalVelocity = 0;

    this.boostTimer = 0;
    this.boostMultiplier = 0;
    this.isNitro = false;
    this.shieldTimer = 0;
    this.spinTimer = 0;
    this.stunTimer = 0;
    this.freezeTimer = 0;
    this.oilTimer = 0;
    this.giantTimer = 0;
    this.shrunkTimer = 0;
    this.stunImmunityTimer = 0;
    this.statusEmoji = "";
    this.statusEmojiTimer = 0;
    this.currentScale = 1.0;
    this.podiumSlot = null;
    this.mesh.scale.setScalar(1.0);
  }

  setPodiumSlot(slot) {
    this.podiumSlot = slot;
    this.spinTimer = 0;
    this.stunTimer = 0;
    this.freezeTimer = 0;
    this.oilTimer = 0;
    this.giantTimer = 0;
    this.shrunkTimer = 0;
    if (slot) {
      const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };
      this.setStatusEmoji(medals[slot.place] || "🏁", 999);
    }
  }

  setStatusEmoji(emoji, duration = 2.5) {
    this.statusEmoji = emoji;
    this.statusEmojiTimer = duration;
  }

  hasCrowdControlImmunity() {
    return this.shieldTimer > 0 || this.stunImmunityTimer > 0;
  }

  applyBoost(bonusMultiplier, duration, isNitro = false) {
    // Cap max stacked boost at +125%
    this.boostMultiplier = Math.min(1.25, Math.max(this.boostMultiplier, bonusMultiplier));
    this.boostTimer = Math.max(this.boostTimer, duration);
    if (isNitro) this.isNitro = true;
    this.setStatusEmoji(isNitro ? "🚀" : "💨", duration);
  }

  applyShield(duration) {
    this.shieldTimer = Math.max(this.shieldTimer, duration);
    // Cleanse active CC
    this.spinTimer = 0;
    this.stunTimer = 0;
    this.freezeTimer = 0;
    this.oilTimer = 0;
    this.setStatusEmoji("🛡️", duration);
  }

  applySpinOut(duration = 1.5) {
    if (this.giantTimer > 0 || this.hasCrowdControlImmunity()) return false;
    this.spinTimer = duration;
    this.spinAngle = 0;
    this.setStatusEmoji("😵", duration + 0.5);
    return true;
  }

  applyOilSlip(duration = 2.2) {
    if (this.giantTimer > 0 || this.hasCrowdControlImmunity()) return false;
    this.oilTimer = duration;
    this.setStatusEmoji("🛢️", duration);
    return true;
  }

  applyStun(duration = 2.5, knockupVelocity = 9.5) {
    if (this.hasCrowdControlImmunity()) return false;
    this.stunTimer = duration;
    this.verticalVelocity = knockupVelocity;
    this.currentSpeed *= 0.15;
    this.setStatusEmoji("💥", duration + 0.5);
    return true;
  }

  applyFreeze(duration = 2.2) {
    if (this.hasCrowdControlImmunity()) return false;
    this.freezeTimer = duration;
    // Neutralizes active speed buffs
    this.boostTimer = 0;
    this.boostMultiplier = 0;
    this.isNitro = false;
    this.currentSpeed = 0;
    this.setStatusEmoji("🥶", duration + 0.5);
    return true;
  }

  applyGiant(duration = 5.5, speedBonus = 0.55) {
    this.giantTimer = Math.max(this.giantTimer, duration);
    this.shrunkTimer = 0;
    this.spinTimer = 0;
    this.oilTimer = 0;
    this.applyBoost(speedBonus, duration, false);
    this.setStatusEmoji("🦖", duration);
  }

  applyThunderShrink(duration = 4.2) {
    if (this.shieldTimer > 0 || this.giantTimer > 0) return false;
    this.shrunkTimer = duration;
    this.boostTimer = 0;
    this.setStatusEmoji("⚡", duration);
    return true;
  }

  update(dt, { track, pacingMultiplier = 1.0, rubberBandStrength = 0.04, leaderProgress = 0, totalKarts = 4, isRacing = false, clockTime = 0, particles = null }) {
    // 1. Tick Status Timers
    const wasCC = this.spinTimer > 0 || this.stunTimer > 0 || this.freezeTimer > 0;

    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) {
        this.boostMultiplier = 0;
        this.isNitro = false;
      }
    }
    if (this.shieldTimer > 0) this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    if (this.spinTimer > 0) this.spinTimer = Math.max(0, this.spinTimer - dt);
    if (this.stunTimer > 0) this.stunTimer = Math.max(0, this.stunTimer - dt);
    if (this.freezeTimer > 0) this.freezeTimer = Math.max(0, this.freezeTimer - dt);
    if (this.oilTimer > 0) this.oilTimer = Math.max(0, this.oilTimer - dt);
    if (this.giantTimer > 0) this.giantTimer = Math.max(0, this.giantTimer - dt);
    if (this.shrunkTimer > 0) this.shrunkTimer = Math.max(0, this.shrunkTimer - dt);
    if (this.stunImmunityTimer > 0) this.stunImmunityTimer = Math.max(0, this.stunImmunityTimer - dt);
    if (this.statusEmojiTimer > 0) {
      this.statusEmojiTimer -= dt;
      if (this.statusEmojiTimer <= 0) this.statusEmoji = "";
    }

    const isNowCC = this.spinTimer > 0 || this.stunTimer > 0 || this.freezeTimer > 0;
    if (wasCC && !isNowCC) {
      // Grant 2.0 seconds of Stun Immunity after recovering from CC
      this.stunImmunityTimer = 2.0;
    }

    // 2. Smooth Scale Transitions (Giant vs Shrunk vs Normal)
    const targetScale = this.giantTimer > 0 ? 2.15 : this.shrunkTimer > 0 ? 0.54 : 1.0;
    this.currentScale = THREE.MathUtils.lerp(this.currentScale, targetScale, dt * 7);
    this.mesh.scale.setScalar(this.currentScale);

    // 2b. Podium 3D Celebration State
    if (this.podiumSlot) {
      const hopPhase = clockTime * (this.podiumSlot.place === 1 ? 6.5 : 4.8) + this.index;
      const hopY = Math.max(0, Math.sin(hopPhase)) * (this.podiumSlot.place === 1 ? 0.42 : 0.22);
      this.mesh.position.copy(this.podiumSlot.position);
      this.mesh.position.y += hopY;

      const lookMat = new THREE.Matrix4().lookAt(
        this.mesh.position,
        this.podiumSlot.lookAt,
        new THREE.Vector3(0, 1, 0)
      );
      const q = new THREE.Quaternion().setFromRotationMatrix(lookMat);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      this.mesh.quaternion.slerp(q, Math.min(1, dt * 10));

      // Celebratory wheelie pitch & wiggle
      this.model.bodyGroup.rotation.x = -hopY * 0.45;
      this.model.bodyGroup.rotation.z = Math.sin(clockTime * 5 + this.index) * 0.08;
      this.model.bodyGroup.rotation.y =
        this.podiumSlot.place === 1 ? Math.sin(clockTime * 2.2) * 0.35 : 0;

      for (const w of this.model.wheels) {
        w.rotation.x += dt * 14;
      }
      for (const flame of this.model.flameCones) {
        flame.visible = true;
        flame.material.color.setHex(0xfacc15);
        flame.scale.set(1, 0.9 + Math.random() * 0.5, 1);
      }
      this.model.shieldMesh.visible = false;
      this.model.iceMesh.visible = false;
      this.model.dizzyGroup.visible = false;
      return;
    }

    // 3. Speed & Pseudo-Physics Calculation
    if (isRacing && !this.finished) {
      // Organic ±3.5% speed oscillation so unaided karts trade positions naturally
      const organicNoise =
        1.0 +
        Math.sin(clockTime * 1.3 + this.noiseSeed) * 0.032 +
        Math.cos(clockTime * 0.7 + this.noiseSeed * 1.7) * 0.022;

      // Rubber-banding for trailing karts
      const gapBehindLeader = Math.max(0, leaderProgress - this.totalProgress);
      const rubberBonus = Math.min(0.14, gapBehindLeader * rubberBandStrength * 0.35);

      // Permanent vote support bonus (capped so race stays exciting)
      const voteSupportBonus = Math.min(0.18, this.permanentVoteBonus);

      let multiplier = organicNoise + rubberBonus + voteSupportBonus + this.boostMultiplier;

      if (this.shrunkTimer > 0) multiplier *= 0.52;
      if (this.oilTimer > 0) multiplier *= 0.58;
      if (this.spinTimer > 0) multiplier *= 0.15;
      if (this.stunTimer > 0 || this.freezeTimer > 0) multiplier = 0;

      const targetSpeed = this.baseSpeedUnitsPerSec * multiplier * pacingMultiplier;
      const accelRate = this.freezeTimer > 0 || this.stunTimer > 0 ? 14 : 5.5;
      this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSpeed, dt * accelRate);

      // Advance along spline
      const deltaT = (this.currentSpeed * dt) / track.trackLength;
      const prevT = this.t;
      this.t = (this.t + deltaT) % 1;

      // Detect lap completion across t = 0
      if (!this.hasCrossedStartLine) {
        if (this.t < 0.5) {
          this.hasCrossedStartLine = true;
          this.currentLap = 0;
        }
        this.totalProgress = Math.max(0, this.hasCrossedStartLine ? this.t : 0);
      } else {
        if (prevT > 0.85 && this.t < 0.15 && this.totalProgress > 0.15) {
          this.currentLap += 1;
        }
        this.totalProgress = Math.max(this.totalProgress, this.currentLap + this.t);
      }

      // Dynamic Lane Changing & Oil Wobble
      this.laneChangeCooldown -= dt;
      if (this.laneChangeCooldown <= 0) {
        const maxLane = track.roadWidth * 0.36;
        this.targetLateralOffset = THREE.MathUtils. randFloat(-maxLane, maxLane);
        this.laneChangeCooldown = 2.0 + Math.random() * 2.5;
      }
      if (this.oilTimer > 0) {
        this.lateralOffset += Math.sin(clockTime * 18 + this.index) * 9.5 * dt;
      } else {
        this.lateralOffset = THREE.MathUtils.lerp(
          this.lateralOffset,
          this.targetLateralOffset,
          dt * 2.4
        );
      }
      const clampEdge = track.roadWidth * 0.41;
      this.lateralOffset = THREE.MathUtils.clamp(this.lateralOffset, -clampEdge, clampEdge);
    } else if (this.finished) {
      // Cruise smoothly after finishing
      this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, 9.0, dt * 3);
      this.t = (this.t + (this.currentSpeed * dt) / track.trackLength) % 1;
    } else {
      this.currentSpeed = 0;
    }

    // 4. Vertical Jump / Knockup Gravity
    if (this.heightOffset > 0 || this.verticalVelocity !== 0) {
      this.heightOffset += this.verticalVelocity * dt;
      this.verticalVelocity -= 24.0 * dt; // Gravity
      if (this.heightOffset <= 0) {
        this.heightOffset = 0;
        this.verticalVelocity = 0;
      }
    }

    // 5. Compute World Transform on Spline
    const { position, tangent, up, curvature } = track.getTransformAt(
      this.t,
      this.lateralOffset,
      this.heightOffset
    );
    this.mesh.position.copy(position);

    const lookMatrix = new THREE.Matrix4().lookAt(
      position,
      position.clone().add(tangent),
      up
    );
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
    // Align +Z forward of kart model with spline tangent
    const flipY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    targetQuat.multiply(flipY);
    this.mesh.quaternion.slerp(targetQuat, Math.min(1, dt * 15));

    // 6. Secondary Motion: Body Roll, Pitch, Drift Angle, Spin-out & Wheel Rotation
    const speedRatio = Math.min(1.6, this.currentSpeed / this.baseSpeedUnitsPerSec);
    this.isDrifting = Math.abs(curvature) > 0.42 && speedRatio > 0.75 && this.heightOffset === 0;

    if (this.spinTimer > 0) {
      this.spinAngle += dt * 16.0;
      this.model.bodyGroup.rotation.y = this.spinAngle;
    } else {
      const driftYaw = this.isDrifting ? Math.sign(curvature) * 0.28 : 0;
      this.model.bodyGroup.rotation.y = THREE.MathUtils.lerp(
        this.model.bodyGroup.rotation.y,
        driftYaw,
        dt * 8
      );
    }

    // Lean body on corners + pitch up on boost/jump
    const targetRoll = -curvature * 0.22 * speedRatio;
    const targetPitch =
      this.heightOffset > 0.1
        ? -this.verticalVelocity * 0.025
        : this.boostTimer > 0
        ? -0.07
        : 0;
    this.model.bodyGroup.rotation.z = THREE.MathUtils.lerp(
      this.model.bodyGroup.rotation.z,
      targetRoll,
      dt * 10
    );
    this.model.bodyGroup.rotation.x = THREE.MathUtils.lerp(
      this.model.bodyGroup.rotation.x,
      targetPitch,
      dt * 10
    );

    // Suspension bounce
    this.model.bodyGroup.position.y =
      this.heightOffset === 0 ? Math.sin(clockTime * 22 + this.index) * 0.022 * speedRatio : 0;

    // Spin wheels & steer front wheels
    for (const w of this.model.wheels) {
      w.rotation.x += this.currentSpeed * dt * 1.4;
    }
    const steerAngle = THREE.MathUtils.clamp(-curvature * 0.48, -0.45, 0.45);
    for (const p of this.model.frontWheelPivots) {
      p.rotation.y = THREE.MathUtils.lerp(p.rotation.y, steerAngle, dt * 12);
    }

    // 7. Update Visual Status Attachments (Flames, Shield, Ice, Dizzy Stars)
    const showFlames = this.boostTimer > 0;
    for (const flame of this.model.flameCones) {
      flame.visible = showFlames;
      if (showFlames) {
        flame.material.color.setHex(this.isNitro ? 0xc084fc : 0x38bdf8);
        const flicker = 0.85 + Math.random() * 0.55;
        flame.scale.set(1, this.isNitro ? flicker * 1.45 : flicker, 1);
      }
    }

    this.model.shieldMesh.visible = this.shieldTimer > 0;
    if (this.shieldTimer > 0) {
      this.model.shieldMesh.rotation.y += dt * 2.2;
      this.model.shieldMesh.rotation.z += dt * 1.1;
    }

    this.model.iceMesh.visible = this.freezeTimer > 0;

    const showDizzy = this.spinTimer > 0 || this.stunTimer > 0;
    this.model.dizzyGroup.visible = showDizzy;
    if (showDizzy) {
      this.model.dizzyGroup.rotation.y += dt * 6.5;
    }

    // Emit exhaust / nitro / drift particles
    if (particles && isRacing) {
      if (this.boostTimer > 0 && Math.random() < 0.75) {
        const backPos = position.clone().sub(tangent.clone().multiplyScalar(1.4));
        backPos.y += 0.5;
        particles.emitExhaust(backPos, this.isNitro ? 0xc084fc : 0x38bdf8);
      }
      if (this.isDrifting && Math.random() < 0.65) {
        const sparkPos = position.clone().sub(tangent.clone().multiplyScalar(0.9));
        sparkPos.y += 0.18;
        particles.emitDriftSpark(sparkPos);
      }
    }
  }

  updateScreenLabel(camera, viewportWidth, viewportHeight) {
    if (!this.labelEl) return;
    const worldPos = this.mesh.position.clone();
    worldPos.y += 2.2 * this.currentScale;
    worldPos.project(camera);

    if (worldPos.z > 1) {
      this.labelEl.style.display = "none";
      return;
    }

    const x = (worldPos.x * 0.5 + 0.5) * viewportWidth;
    const y = (-worldPos.y * 0.5 + 0.5) * viewportHeight;

    this.labelEl.style.display = "flex";
    this.labelEl.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;

    const emojiSpan = this.labelEl.querySelector(".kart-tag-emoji");
    if (emojiSpan && emojiSpan.textContent !== this.statusEmoji) {
      emojiSpan.textContent = this.statusEmoji;
    }
  }

  destroy() {
    this.scene.remove(this.mesh);
    if (this.labelEl && this.labelEl.parentNode) {
      this.labelEl.parentNode.removeChild(this.labelEl);
    }
  }

  _escape(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }
}
