import * as THREE from "three";

/**
 * Pooled 3D Particle & Lightning Effect System for high FPS with Bloom.
 */
export class ParticleSystem {
  constructor(scene, maxParticles = 320) {
    this.scene = scene;
    this.maxParticles = maxParticles;
    this.pool = [];
    this.bolts = [];

    const geo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    for (let i = 0; i < maxParticles; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.pool.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        scale: 1,
        gravity: 0,
      });
    }
    this.cursor = 0;
  }

  spawn({ pos, vel, color = 0x38bdf8, life = 0.45, scale = 1.0, gravity = 0 }) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.maxParticles;

    p.mesh.position.copy(pos);
    p.mesh.scale.setScalar(scale);
    p.mesh.material.color.setHex(color);
    p.mesh.material.opacity = 1;
    p.mesh.visible = true;

    p.vel.copy(vel);
    p.life = life;
    p.maxLife = life;
    p.scale = scale;
    p.gravity = gravity;
  }

  emitExhaust(pos, color = 0x38bdf8) {
    this.spawn({
      pos: pos.clone().add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.4
        )
      ),
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        1.2 + Math.random() * 1.5,
        (Math.random() - 0.5) * 2
      ),
      color,
      life: 0.28,
      scale: 0.85,
    });
  }

  emitDriftSpark(pos) {
    this.spawn({
      pos,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        2.0 + Math.random() * 2.5,
        (Math.random() - 0.5) * 5
      ),
      color: Math.random() > 0.4 ? 0xf97316 : 0x38bdf8,
      life: 0.22,
      scale: 0.55,
      gravity: 12,
    });
  }

  emitExplosion(pos, colorA = 0xf97316, colorB = 0xfacc15, count = 28) {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() * 0.9 + 0.2,
        Math.random() - 0.5
      )
        .normalize()
        .multiplyScalar(5 + Math.random() * 11);

      this.spawn({
        pos,
        vel: dir,
        color: i % 2 === 0 ? colorA : colorB,
        life: 0.45 + Math.random() * 0.35,
        scale: 1.2 + Math.random() * 0.9,
        gravity: 16,
      });
    }
  }

  emitLightningBolt(targetPos, color = 0xfacc15) {
    const points = [];
    const segments = 10;
    const height = 28;
    for (let i = 0; i <= segments; i++) {
      const ratio = i / segments;
      const jitter = i === 0 || i === segments ? 0 : 1.6;
      points.push(
        new THREE.Vector3(
          targetPos.x + (Math.random() - 0.5) * jitter,
          targetPos.y + (1 - ratio) * height,
          targetPos.z + (Math.random() - 0.5) * jitter
        )
      );
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, 16, 0.22, 6, false);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
    this.bolts.push({ mesh, life: 0.38, maxLife: 0.38 });

    this.emitExplosion(targetPos, color, 0xffffff, 18);
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }

      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 6;

      const ratio = p.life / p.maxLife;
      p.mesh.scale.setScalar(p.scale * ratio);
      p.mesh.material.opacity = ratio;
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        this.bolts.splice(i, 1);
      } else {
        b.mesh.material.opacity = b.life / b.maxLife;
      }
    }
  }
}
