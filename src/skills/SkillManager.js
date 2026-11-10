import * as THREE from "three";

/**
 * Manages the execution of all 13 skills with the 5 Layers of Juice:
 * 1. Telegraph Banner UI Callout
 * 2. 3D VFX (Traps, Missiles, Beams, Portals, Lightning, Meteors)
 * 3. Arcade Sound Effects (SoundManager)
 * 4. Broadcast Camera Director cuts & screen shake
 * 5. Kart FSM reactions + emoji status
 */
export class SkillManager {
  constructor({ scene, track, particles, sound, cameraDirector, onTelegraph, onScreenFlash }) {
    this.scene = scene;
    this.track = track;
    this.particles = particles;
    this.sound = sound;
    this.cameraDirector = cameraDirector;
    this.onTelegraph = onTelegraph;
    this.onScreenFlash = onScreenFlash;

    this.traps = [];
    this.projectiles = [];
    this.beams = [];
    this.meteors = [];
    this.portals = [];
  }

  clearAll() {
    for (const trap of this.traps) this.scene.remove(trap.mesh);
    for (const proj of this.projectiles) this.scene.remove(proj.mesh);
    for (const beam of this.beams) this.scene.remove(beam.mesh);
    for (const m of this.meteors) {
      this.scene.remove(m.mesh);
      this.scene.remove(m.ringMesh);
    }
    for (const p of this.portals) this.scene.remove(p.mesh);

    this.traps = [];
    this.projectiles = [];
    this.beams = [];
    this.meteors = [];
    this.portals = [];
  }

  /**
   * Executes a resolved skill for `casterKart`.
   */
  executeSkill({ skill, casterKart, allKarts, donatorName = "PENONTON", amount = 0 }) {
    if (!casterKart || !skill) return;

    this.sound.playSkill(skill.id);

    // Sort karts by rank (1 = leader)
    const sortedByRank = [...allKarts].sort((a, b) => a.rank - b.rank);
    const casterRankIdx = sortedByRank.findIndex((k) => k.index === casterKart.index);

    // Helper to pick rival ahead (or behind if caster is #1)
    const getRivalAhead = () => {
      if (allKarts.length <= 1) return casterKart;
      if (casterRankIdx > 0) return sortedByRank[casterRankIdx - 1];
      return sortedByRank[1];
    };

    const leaderKart = sortedByRank[0] || casterKart;

    switch (skill.id) {
      case "mini_boost": {
        casterKart.applyBoost(skill.speedBonus || 0.38, skill.duration || 2.2, false);
        this.particles.emitExplosion(casterKart.mesh.position, 0x38bdf8, 0xffffff, 14);
        this._emitCallout({
          skill,
          donatorName,
          amount,
          headline: `${donatorName} memberi MINI BOOST ke #${casterKart.number} ${casterKart.name}!`,
        });
        break;
      }

      case "banana_trap": {
        this._spawnTrap({
          type: "banana",
          ownerIndex: casterKart.index,
          t: (casterKart.t - 0.015 + 1) % 1,
          lateralOffset: casterKart.lateralOffset,
        });
        this._emitCallout({
          skill,
          donatorName,
          amount,
          headline: `${donatorName} menjatuhkan BANANA TRAP di belakang #${casterKart.number} ${casterKart.name}!`,
        });
        break;
      }

      case "oil_slick": {
        this._spawnTrap({
          type: "oil",
          ownerIndex: casterKart.index,
          t: (casterKart.t - 0.018 + 1) % 1,
          lateralOffset: casterKart.lateralOffset,
        });
        this._emitCallout({
          skill,
          donatorName,
          amount,
          headline: `${donatorName} menumpahkan OIL SLICK dari #${casterKart.number} ${casterKart.name}!`,
        });
        break;
      }

      case "guardian_shield": {
        casterKart.applyShield(skill.duration || 6.5);
        this._emitCallout({
          skill,
          donatorName,
          amount,
          headline: `${donatorName} memasang GUARDIAN SHIELD pada #${casterKart.number} ${casterKart.name}!`,
        });
        break;
      }

      case "nitro_nos": {
        casterKart.applyBoost(skill.speedBonus || 0.85, skill.duration || 3.6, true);
        this.particles.emitExplosion(casterKart.mesh.position, 0xc084fc, 0x38bdf8, 24);
        this.cameraDirector.triggerActionCut(casterKart, 2.2, { fovBoost: 12, shake: 0.22 });
        this._emitCallout({
          skill,
          donatorName,
          amount,
          headline: `${donatorName} menyalakan NITRO NOS untuk #${casterKart.number} ${casterKart.name}!`,
        });
        break;
      }

      case "homing_missile": {
        const targetKart = getRivalAhead();
        this._spawnMissile({
          type: "homing",
          shooterKart: casterKart,
          targetKart,
        });
        this.cameraDirector.triggerActionCut(targetKart, 2.4, { shake: 0.25 });
        this._emitCallout({
          skill,
          donatorName,
          amount,
          headline: `${donatorName} (#${casterKart.number}) menembak HOMING MISSILE ke #${targetKart.number} ${targetKart.name}!`,
        });
        break;
      }

      case "freeze_ray": {
        const targetKart = getRivalAhead();
        this.particles.emitLightningBolt(targetKart.mesh.position, 0x38bdf8);
        if (targetKart.shieldTimer > 0) {
          this.sound.playShieldReflect();
          targetKart.setStatusEmoji("🛡️", 1.8);
        } else {
          targetKart.applyFreeze(skill.duration || 2.2);
        }
        this.cameraDirector.triggerActionCut(targetKart, 2.2, { shake: 0.3 });
        this._emitCallout({
          skill,
          donatorName,
          amount,
          headline: `${donatorName} membekukan #${targetKart.number} ${targetKart.name} dengan FREEZE RAY!`,
        });
        break;
      }

      case "magnet_beam": {
        const targetKart = getRivalAhead();
        casterKart.applyBoost(0.65, 2.4, false);
        this._spawnBeam(casterKart, targetKart, 2.2);
        this.cameraDirector.triggerActionCut(casterKart, 2.2, { shake: 0.15 });
        this._emitCallout({
          skill,
          donatorName,
          amount,
          headline: `${donatorName} menarik #${casterKart.number} ${casterKart.name} mendekati #${targetKart.number} dengan MAGNET BEAM!`,
        });
        break;
      }

      case "giant_mode": {
        casterKart.applyGiant(skill.duration || 5.5, skill.speedBonus || 0.55);
        this.particles.emitExplosion(casterKart.mesh.position, 0xc084fc, 0xfacc15, 28);
        this.cameraDirector.triggerActionCut(casterKart, 2.8, { shake: 0.4 });
        this._emitCallout({
          skill,
          donatorName,
          amount,
          headline: `${donatorName} mengaktifkan GIANT MODE 2X pada #${casterKart.number} ${casterKart.name}!`,
        });
        break;
      }

      case "thunder_strike": {
        if (this.onScreenFlash) this.onScreenFlash("rgba(250, 204, 21, 0.55)");
        for (const k of allKarts) {
          if (k.index === casterKart.index) continue;
          this.particles.emitLightningBolt(k.mesh.position, 0xfacc15);
          k.applyThunderShrink(skill.duration || 4.2);
        }
        casterKart.applyBoost(0.35, 2.5, false);
        this.cameraDirector.triggerActionCut(casterKart, 2.6, { shake: 0.65 });
        this._emitCallout({
          skill,
          donatorName,
          amount,
          headline: `⚡ ${donatorName} memanggil THUNDER STRIKE! Semua lawan #${casterKart.number} mengecil & melambat!`,
        });
        break;
      }

      case "sultan_strike": {
        const targetKart =
          leaderKart.index === casterKart.index && sortedByRank[1]
            ? sortedByRank[1]
            : leaderKart;
        this._spawnMissile({
          type: "sultan",
          shooterKart: casterKart,
          targetKart,
        });
        this.cameraDirector.triggerActionCut(targetKart, 2.8, { shake: 0.55 });
        this._emitCallout({
          skill,
          donatorName,
          amount,
          headline: `👑 SULTAN STRIKE dari ${donatorName}! Mengincar Peringkat #${targetKart.rank} (${targetKart.name})!`,
        });
        break;
      }

      case "position_swap": {
        const targetKart = getRivalAhead();
        if (targetKart.index !== casterKart.index && casterKart.rank > targetKart.rank) {
          this._spawnPortal(casterKart.mesh.position.clone());
          this._spawnPortal(targetKart.mesh.position.clone());

          // Swap spline parameters and lap counts
          const tmpT = casterKart.t;
          const tmpLap = casterKart.currentLap;
          const tmpProg = casterKart.totalProgress;

          casterKart.t = targetKart.t;
          casterKart.currentLap = targetKart.currentLap;
          casterKart.totalProgress = targetKart.totalProgress;

          targetKart.t = tmpT;
          targetKart.currentLap = tmpLap;
          targetKart.totalProgress = tmpProg;

          casterKart.setStatusEmoji("🌀", 2.5);
          targetKart.setStatusEmoji("❓", 2.5);
        } else {
          // Already #1: grant mega warp boost instead
          casterKart.applyBoost(1.05, 3.5, true);
        }
        this.cameraDirector.triggerActionCut(casterKart, 2.6, { shake: 0.45 });
        this._emitCallout({
          skill,
          donatorName,
          amount,
          headline: `🌀 MYTHIC! ${donatorName} menukar posisi #${casterKart.number} ${casterKart.name} dengan #${targetKart.number} ${targetKart.name}!`,
        });
        break;
      }

      case "meteor_shower": {
        if (this.onScreenFlash) this.onScreenFlash("rgba(244, 63, 94, 0.5)");
        const rivals = allKarts.filter((k) => k.index !== casterKart.index);
        const targets = rivals.length > 0 ? rivals : allKarts;
        for (let i = 0; i < 6; i++) {
          const target = targets[i % targets.length];
          this._spawnMeteor(target, i * 0.45);
        }
        casterKart.applyShield(5.0);
        this.cameraDirector.setTemporaryDrone(3.5, 0.65);
        this._emitCallout({
          skill,
          donatorName,
          amount,
          headline: `☄️ ARMAGEDDON! ${donatorName} menjatuhkan METEOR SHOWER untuk membantu #${casterKart.number} ${casterKart.name}!`,
        });
        break;
      }
    }
  }

  update(dt, karts, isRacing) {
    // 1. Check Track Boost Pads, Jump Ramps & Floating Item Boxes
    if (isRacing) {
      this._updateTrackInteractions(dt, karts);
    }

    // 2. Update Traps on Track (Banana & Oil Slick)
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const trap = this.traps[i];
      trap.age += dt;
      if (trap.type === "banana") {
        trap.mesh.rotation.y += dt * 3.2;
      }

      let triggered = false;
      for (const kart of karts) {
        if (trap.age < 0.75 && kart.index === trap.ownerIndex) continue;
        const dist = kart.mesh.position.distanceTo(trap.mesh.position);
        if (dist < 1.85) {
          if (trap.type === "banana") {
            if (kart.applySpinOut(1.5)) {
              this.sound.playSpinOut();
              this.particles.emitExplosion(trap.mesh.position, 0xfacc15, 0xffffff, 12);
            }
          } else {
            if (kart.applyOilSlip(2.2)) {
              this.sound.playSpinOut();
              this.particles.emitExplosion(trap.mesh.position, 0x334155, 0xa855f7, 12);
            }
          }
          triggered = true;
          break;
        }
      }

      if (triggered || trap.age > 35) {
        this.scene.remove(trap.mesh);
        this.traps.splice(i, 1);
      }
    }

    // 3. Update Homing Missiles & Sultan Strikes
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.progress += dt / proj.flightDuration;

      const curT = this._lerpCircularT(proj.startT, proj.targetKart.t, Math.min(1, proj.progress));
      const curLat = THREE.MathUtils.lerp(
        proj.startLat,
        proj.targetKart.lateralOffset,
        Math.min(1, proj.progress)
      );
      const arcHeight =
        proj.type === "sultan"
          ? Math.sin(Math.min(1, proj.progress) * Math.PI) * 16.0 + 1.0
          : Math.sin(Math.min(1, proj.progress) * Math.PI) * 2.2 + 0.85;

      const { position, tangent } = this.track.getTransformAt(curT, curLat, arcHeight);
      proj.mesh.position.copy(position);
      proj.mesh.lookAt(position.clone().add(tangent));

      this.particles.emitExhaust(
        position,
        proj.type === "sultan" ? 0xfacc15 : 0xf43f5e
      );

      if (proj.progress >= 1.0) {
        // Impact! Check if target has Guardian Shield to reflect
        const hitKart = proj.targetKart;
        if (hitKart.shieldTimer > 0 && !proj.reflected && proj.shooterKart) {
          // Reflect missile back to shooter!
          proj.reflected = true;
          proj.progress = 0;
          proj.startT = hitKart.t;
          proj.startLat = hitKart.lateralOffset;
          proj.targetKart = proj.shooterKart;
          this.sound.playShieldReflect();
          hitKart.setStatusEmoji("🛡️", 2.0);
          continue;
        }

        this.sound.playExplosion();
        this.particles.emitExplosion(
          hitKart.mesh.position,
          proj.type === "sultan" ? 0xfacc15 : 0xf97316,
          0xf43f5e,
          34
        );
        hitKart.applyStun(proj.type === "sultan" ? 3.0 : 2.5, proj.type === "sultan" ? 12.5 : 9.5);
        this.cameraDirector.addShake(proj.type === "sultan" ? 0.65 : 0.4);

        this.scene.remove(proj.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // 4. Update Magnet Beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        this.beams.splice(i, 1);
        continue;
      }
      const p1 = b.caster.mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0));
      const p2 = b.target.mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0));
      b.mesh.geometry.setFromPoints([p1, p2]);
    }

    // 5. Update Falling Meteors
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (m.delay > 0) {
        m.delay -= dt;
        continue;
      }
      m.mesh.visible = true;
      m.ringMesh.visible = true;
      m.progress += dt * 1.45;

      const impactPos = m.targetKart.mesh.position.clone();
      m.ringMesh.position.set(impactPos.x, impactPos.y + 0.08, impactPos.z);
      m.ringMesh.rotation.z += dt * 5;

      const skyStart = impactPos.clone().add(new THREE.Vector3(8, 26, -6));
      m.mesh.position.lerpVectors(skyStart, impactPos, Math.min(1, m.progress));
      this.particles.emitExhaust(m.mesh.position, 0xf97316);

      if (m.progress >= 1.0) {
        this.sound.playExplosion();
        this.particles.emitExplosion(impactPos, 0xf43f5e, 0xfacc15, 32);
        m.targetKart.applyStun(1.7, 8.5);
        this.cameraDirector.addShake(0.45);

        this.scene.remove(m.mesh);
        this.scene.remove(m.ringMesh);
        this.meteors.splice(i, 1);
      }
    }

    // 6. Update Portals
    for (let i = this.portals.length - 1; i >= 0; i--) {
      const p = this.portals[i];
      p.life -= dt;
      p.mesh.rotation.z += dt * 8;
      p.mesh.scale.setScalar(1 + (1 - p.life / p.maxLife) * 0.6);
      p.mesh.material.opacity = p.life / p.maxLife;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.portals.splice(i, 1);
      }
    }
  }

  _updateTrackInteractions(dt, karts) {
    // 1. Boost pads
    for (const pad of this.track.boostPads) {
      for (const kart of karts) {
        const dT = Math.abs(kart.t - pad.t);
        const dLat = Math.abs(kart.lateralOffset - pad.lateralOffset);
        if (dT < 0.011 && dLat < 2.1 && kart.boostTimer < 0.3) {
          kart.applyBoost(0.32, 1.3, false);
          this.particles.emitExhaust(kart.mesh.position, 0x22d3ee);
        }
      }
    }

    // 2. Jump Ramps
    for (const ramp of this.track.ramps) {
      for (const kart of karts) {
        const dT = Math.abs(kart.t - ramp.t);
        if (dT < 0.009 && kart.heightOffset === 0) {
          kart.verticalVelocity = 8.4;
          kart.applyBoost(0.25, 1.1, false);
        }
      }
    }

    // 3. Floating Item Boxes (grant organic mini-items so the track feels alive!)
    for (const box of this.track.itemBoxes) {
      if (!box.active) continue;
      for (const kart of karts) {
        if (kart.mesh.position.distanceTo(box.mesh.position) < 1.8) {
          box.active = false;
          box.mesh.visible = false;
          box.respawnTimer = 6.0;
          this.particles.emitExplosion(box.mesh.position, 0xfacc15, 0x38bdf8, 12);

          // Roll a light item effect
          const roll = Math.random();
          if (roll < 0.6) {
            kart.applyBoost(0.28, 1.6, false);
          } else if (roll < 0.85) {
            kart.applyShield(3.2);
          } else {
            this._spawnTrap({
              type: "banana",
              ownerIndex: kart.index,
              t: (kart.t - 0.014 + 1) % 1,
              lateralOffset: kart.lateralOffset,
            });
          }
          break;
        }
      }
    }

    // 4. Giant Kart collisions & soft lateral push between karts
    for (let i = 0; i < karts.length; i++) {
      for (let j = i + 1; j < karts.length; j++) {
        const a = karts[i];
        const b = karts[j];
        const dist = a.mesh.position.distanceTo(b.mesh.position);
        const minDist = a.giantTimer > 0 || b.giantTimer > 0 ? 2.6 : 1.55;
        if (dist < minDist) {
          if (a.giantTimer > 0 && b.giantTimer <= 0) {
            b.applySpinOut(1.3);
          } else if (b.giantTimer > 0 && a.giantTimer <= 0) {
            a.applySpinOut(1.3);
          }
          const pushDir = a.lateralOffset >= b.lateralOffset ? 1 : -1;
          a.lateralOffset += pushDir * 3.5 * dt;
          b.lateralOffset -= pushDir * 3.5 * dt;
        }
      }
    }
  }

  _spawnTrap({ type, ownerIndex, t, lateralOffset }) {
    const { position } = this.track.getTransformAt(t, lateralOffset, 0.08);
    let mesh;
    if (type === "banana") {
      mesh = new THREE.Group();
      const peelMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xeab308,
        emissiveIntensity: 0.45,
        roughness: 0.3,
      });
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.95, 7), peelMat);
      core.position.y = 0.45;
      core.rotation.z = 0.22;
      mesh.add(core);
    } else {
      const oilGeo = new THREE.CylinderGeometry(1.35, 1.45, 0.08, 16);
      const oilMat = new THREE.MeshStandardMaterial({
        color: 0x090d16,
        emissive: 0x581c87,
        emissiveIntensity: 0.35,
        roughness: 0.05,
        metalness: 0.9,
      });
      mesh = new THREE.Mesh(oilGeo, oilMat);
    }
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.traps.push({ type, ownerIndex, mesh, age: 0 });
  }

  _spawnMissile({ type, shooterKart, targetKart }) {
    const group = new THREE.Group();
    const bodyColor = type === "sultan" ? 0xfacc15 : 0xf43f5e;
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(type === "sultan" ? 0.55 : 0.34, type === "sultan" ? 1.85 : 1.25, 10),
      new THREE.MeshStandardMaterial({
        color: bodyColor,
        emissive: bodyColor,
        emissiveIntensity: 0.75,
      })
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);
    group.position.copy(shooterKart.mesh.position);
    this.scene.add(group);

    this.projectiles.push({
      type,
      mesh: group,
      shooterKart,
      targetKart,
      startT: shooterKart.t,
      startLat: shooterKart.lateralOffset,
      progress: 0,
      flightDuration: type === "sultan" ? 1.15 : 0.85,
      reflected: false,
    });
  }

  _spawnBeam(caster, target, duration) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      caster.mesh.position,
      target.mesh.position,
    ]);
    const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 3 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.beams.push({ mesh: line, caster, target, life: duration });
  }

  _spawnPortal(position) {
    const geo = new THREE.TorusGeometry(1.4, 0.16, 10, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
      transparent: true,
      opacity: 0.95,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position).add(new THREE.Vector3(0, 1.0, 0));
    this.scene.add(mesh);
    this.portals.push({ mesh, life: 0.9, maxLife: 0.9 });
  }

  _spawnMeteor(targetKart, delay) {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.95, 1),
      new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xef4444,
        emissiveIntensity: 1.1,
      })
    );
    mesh.visible = false;
    this.scene.add(mesh);

    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.65, 24),
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      })
    );
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.visible = false;
    this.scene.add(ringMesh);

    this.meteors.push({
      mesh,
      ringMesh,
      targetKart,
      delay,
      progress: 0,
    });
  }

  _lerpCircularT(a, b, alpha) {
    let delta = b - a;
    if (delta < -0.5) delta += 1;
    if (delta > 0.5) delta -= 1;
    return (a + delta * alpha + 1) % 1;
  }

  _emitCallout({ skill, donatorName, amount, headline }) {
    if (this.onTelegraph) {
      this.onTelegraph({
        skill,
        donatorName,
        amount,
        headline,
      });
    }
  }
}
