import * as THREE from "three";

export class CameraDirector {
  constructor(camera, track) {
    this.camera = camera;
    this.track = track;

    this.mode = "AUTO"; // AUTO | CHASE | DRONE | TRACKSIDE | ONBOARD
    this.activeSubMode = "CHASE";
    this.autoSwitchTimer = 11.0;

    this.focusedKartIndex = null; // null = follow leader
    this.actionTargetKart = null;
    this.actionCutTimer = 0;
    this.droneOverrideTimer = 0;

    this.baseFov = 62;
    this.extraFov = 0;
    this.shakeIntensity = 0;
    this.clockTime = 0;

    this.currentPos = new THREE.Vector3(0, 12, -80);
    this.currentLookAt = new THREE.Vector3(0, 1, -60);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode !== "AUTO") {
      this.activeSubMode = mode;
    }
  }

  setFocusedKart(indexOrNull) {
    this.focusedKartIndex = indexOrNull;
  }

  triggerActionCut(kart, duration = 2.4, { fovBoost = 8, shake = 0.25 } = {}) {
    if (!kart) return;
    this.actionTargetKart = kart;
    this.actionCutTimer = Math.max(this.actionCutTimer, duration);
    this.extraFov = Math.max(this.extraFov, fovBoost);
    this.addShake(shake);
  }

  setTemporaryDrone(duration = 3.2, shake = 0.4) {
    this.droneOverrideTimer = Math.max(this.droneOverrideTimer, duration);
    this.addShake(shake);
  }

  addShake(amount) {
    this.shakeIntensity = Math.min(1.2, this.shakeIntensity + amount);
  }

  update(dt, karts, raceState) {
    this.clockTime += dt;
    if (!karts || karts.length === 0) return;

    const sorted = [...karts].sort((a, b) => a.rank - b.rank);
    const leader = sorted[0];

    let subjectKart = leader;
    if (this.focusedKartIndex !== null && karts[this.focusedKartIndex]) {
      subjectKart = karts[this.focusedKartIndex];
    }

    // Tick action cut & drone timers
    if (this.actionCutTimer > 0) {
      this.actionCutTimer = Math.max(0, this.actionCutTimer - dt);
    }
    if (this.droneOverrideTimer > 0) {
      this.droneOverrideTimer = Math.max(0, this.droneOverrideTimer - dt);
    }

    // Decide effective camera submode
    let effectiveMode = this.mode === "AUTO" ? this.activeSubMode : this.mode;

    if (raceState === "LOBBY" || raceState === "REGISTRATION" || raceState === "COUNTDOWN") {
      effectiveMode = "DRONE";
    } else if (raceState === "FINISH" || raceState === "PODIUM" || raceState === "RESULTS") {
      effectiveMode = "FINISH";
    } else if (this.droneOverrideTimer > 0 && this.mode === "AUTO") {
      effectiveMode = "DRONE";
    } else if (this.actionCutTimer > 0 && this.actionTargetKart && this.mode === "AUTO") {
      effectiveMode = "ACTION";
      subjectKart = this.actionTargetKart;
    } else if (this.mode === "AUTO") {
      this.autoSwitchTimer -= dt;
      if (this.autoSwitchTimer <= 0) {
        const roll = Math.random();
        if (roll < 0.64) {
          this.activeSubMode = "CHASE";
          this.autoSwitchTimer = 9 + Math.random() * 5;
        } else if (roll < 0.84) {
          this.activeSubMode = "TRACKSIDE";
          this.autoSwitchTimer = 4.5 + Math.random() * 2.5;
        } else {
          this.activeSubMode = "DRONE";
          this.autoSwitchTimer = 4.5 + Math.random() * 2.5;
        }
        effectiveMode = this.activeSubMode;
      }
    }

    const { position, tangent, right } = this.track.getTransformAt(
      subjectKart.t,
      subjectKart.lateralOffset,
      subjectKart.heightOffset
    );

    const desiredPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();
    let lerpSpeed = 7.5;

    switch (effectiveMode) {
      case "ACTION": {
        // Dramatic angled action chase shot
        desiredPos
          .copy(position)
          .addScaledVector(tangent, -7.2)
          .addScaledVector(right, 3.2)
          .add(new THREE.Vector3(0, 3.4, 0));
        desiredLook.copy(position).add(new THREE.Vector3(0, 1.0, 0));
        lerpSpeed = 9.5;
        break;
      }

      case "ONBOARD": {
        desiredPos
          .copy(position)
          .addScaledVector(tangent, 0.35)
          .add(new THREE.Vector3(0, 1.55, 0));
        desiredLook
          .copy(position)
          .addScaledVector(tangent, 16.0)
          .add(new THREE.Vector3(0, 1.1, 0));
        lerpSpeed = 18.0;
        break;
      }

      case "TRACKSIDE": {
        // Snap to a corner ahead of the leader
        const snapT = (Math.floor(subjectKart.t * 8) / 8 + 0.04) % 1;
        const corner = this.track.getTransformAt(
          snapT,
          this.track.roadWidth * 0.5 + 5.5,
          4.8
        );
        desiredPos.copy(corner.position);
        desiredLook.copy(position).add(new THREE.Vector3(0, 1.0, 0));
        lerpSpeed = 5.0;
        break;
      }

      case "DRONE": {
        const orbitAngle = this.clockTime * 0.42;
        const radius = 26;
        desiredPos.set(
          position.x + Math.cos(orbitAngle) * radius,
          position.y + 18.5,
          position.z + Math.sin(orbitAngle) * radius
        );
        desiredLook.copy(position).add(new THREE.Vector3(0, 1.2, 0));
        lerpSpeed = 4.2;
        break;
      }

      case "FINISH":
      case "PODIUM": {
        const center = this.track.podiumCenter || new THREE.Vector3(0, 0, -12);
        const sway = Math.sin(this.clockTime * 0.65) * 4.8;
        const bob = Math.cos(this.clockTime * 0.9) * 0.6;
        desiredPos.set(center.x + sway, center.y + 4.4 + bob, center.z + 9.8);
        desiredLook.set(center.x, center.y + 2.4, center.z - 0.5);
        lerpSpeed = 4.5;
        break;
      }

      case "CHASE":
      default: {
        const boostPullback = subjectKart.boostTimer > 0 ? 1.5 : 0;
        desiredPos
          .copy(position)
          .addScaledVector(tangent, -(9.5 + boostPullback))
          .addScaledVector(right, subjectKart.lateralOffset * 0.15)
          .add(new THREE.Vector3(0, 4.3, 0));
        desiredLook
          .copy(position)
          .addScaledVector(tangent, 6.5)
          .add(new THREE.Vector3(0, 1.2, 0));
        lerpSpeed = 8.0;
        break;
      }
    }

    this.currentPos.lerp(desiredPos, Math.min(1, dt * lerpSpeed));
    this.currentLookAt.lerp(desiredLook, Math.min(1, dt * (lerpSpeed + 3)));

    // Apply screen shake
    const finalPos = this.currentPos.clone();
    if (this.shakeIntensity > 0.005) {
      finalPos.x += (Math.random() - 0.5) * this.shakeIntensity * 1.4;
      finalPos.y += (Math.random() - 0.5) * this.shakeIntensity * 1.1;
      finalPos.z += (Math.random() - 0.5) * this.shakeIntensity * 1.4;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 1.8);
    }

    this.camera.position.copy(finalPos);
    this.camera.lookAt(this.currentLookAt);

    // Dynamic FOV widening on boost
    const targetExtraFov =
      subjectKart.boostTimer > 0
        ? subjectKart.isNitro
          ? 14
          : 8
        : this.extraFov;
    this.extraFov = THREE.MathUtils.lerp(this.extraFov, 0, dt * 3);
    const desiredFov = this.baseFov + targetExtraFov;
    if (Math.abs(this.camera.fov - desiredFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, desiredFov, dt * 8);
      this.camera.updateProjectionMatrix();
    }
  }
}
