import * as THREE from "three";

export const TRACK_PRESETS = {
  sprint: {
    id: "sprint",
    name: "Sprint Oval-X",
    refLapSeconds: 30,
    roadWidth: 11.5,
    scale: 1.0,
    points: [
      [0, 0, -68],
      [58, 0.5, -58],
      [82, 2.5, -10],
      [62, 1.5, 48],
      [18, 0, 32],
      [-18, 0, 62],
      [-68, 2.0, 48],
      [-82, 0.5, -8],
      [-55, 0, -58],
    ],
    ramps: [0.22, 0.68],
    boostPads: [0.12, 0.48, 0.85],
    itemBoxRows: [0.28, 0.58, 0.9],
  },
  circuit: {
    id: "circuit",
    name: "Grand Arcade Circuit",
    refLapSeconds: 60,
    roadWidth: 12.0,
    scale: 1.38,
    points: [
      [0, 0, -85],
      [65, 0, -82],
      [105, 3.5, -40],
      [88, 4.0, 15],
      [38, 1.5, 18],
      [25, 0, 58],
      [75, 2.0, 88],
      [15, 3.0, 112],
      [-48, 1.0, 88],
      [-32, 0, 38],
      [-85, 2.5, 22],
      [-105, 1.5, -35],
      [-65, 0, -78],
    ],
    ramps: [0.18, 0.52, 0.81],
    boostPads: [0.09, 0.34, 0.63, 0.91],
    itemBoxRows: [0.22, 0.46, 0.72, 0.95],
  },
  grandprix: {
    id: "grandprix",
    name: "Hyperion Grand Prix",
    refLapSeconds: 90,
    roadWidth: 12.5,
    scale: 1.72,
    points: [
      [0, 0, -95],
      [75, 0, -92],
      [122, 4.5, -52],
      [115, 5.5, 5],
      [62, 2.0, 22],
      [42, 0, -18],
      [12, 0, 28],
      [78, 3.0, 68],
      [95, 4.0, 115],
      [28, 2.5, 128],
      [-28, 0, 92],
      [-72, 2.0, 112],
      [-115, 4.0, 65],
      [-78, 1.5, 18],
      [-118, 2.5, -28],
      [-78, 0, -85],
    ],
    ramps: [0.14, 0.42, 0.67, 0.88],
    boostPads: [0.07, 0.27, 0.51, 0.75, 0.93],
    itemBoxRows: [0.16, 0.35, 0.56, 0.78, 0.96],
  },
};

export const TRACK_THEMES = {
  neon_city: {
    id: "neon_city",
    name: "Kota Malam Neon",
    skyColor: 0x070918,
    fogColor: 0x0b1026,
    groundColor: 0x060913,
    gridColor: 0x1e293b,
    kerbColorA: 0x06b6d4,
    kerbColorB: 0xf43f5e,
    railColor: 0x38bdf8,
    ambientColor: 0x64748b,
    sunColor: 0xc084fc,
    sunIntensity: 1.5,
  },
  sunny_beach: {
    id: "sunny_beach",
    name: "Pantai Tropis Siang",
    skyColor: 0x0284c7,
    fogColor: 0x38bdf8,
    groundColor: 0x0e7490,
    gridColor: 0x155e75,
    kerbColorA: 0xef4444,
    kerbColorB: 0xf8fafc,
    railColor: 0xfacc15,
    ambientColor: 0xbae6fd,
    sunColor: 0xfef08a,
    sunIntensity: 2.2,
  },
  cyber_desert: {
    id: "cyber_desert",
    name: "Gurun Senja Horizon",
    skyColor: 0x2e1065,
    fogColor: 0x7c2d12,
    groundColor: 0x451a03,
    gridColor: 0x78350f,
    kerbColorA: 0xf97316,
    kerbColorB: 0xfef3c7,
    railColor: 0xfb923c,
    ambientColor: 0xfdba74,
    sunColor: 0xf97316,
    sunIntensity: 1.9,
  },
};

export class TrackManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.curve = null;
    this.frames = null;
    this.sampleCount = 600;
    this.roadWidth = 12;
    this.trackLength = 600;
    this.currentPreset = TRACK_PRESETS.circuit;
    this.currentTheme = TRACK_THEMES.neon_city;
    this.streamerBrand = "STREAMKART 3D LIVE";

    this.itemBoxes = [];
    this.boostPads = [];
    this.ramps = [];
    this.billboardMeshes = [];
    this.spectatorMesh = null;
    this.spectatorBaseY = [];
    this.clockTime = 0;
  }

  buildTrack(presetId = "circuit", themeId = "neon_city", streamerBrand = null) {
    if (streamerBrand) this.streamerBrand = streamerBrand;
    this.currentPreset = TRACK_PRESETS[presetId] || TRACK_PRESETS.circuit;
    this.currentTheme = TRACK_THEMES[themeId] || TRACK_THEMES.neon_city;
    this.roadWidth = this.currentPreset.roadWidth;

    // Clear previous meshes
    while (this.group.children.length > 0) {
      const child = this.group.children.pop();
      this.group.remove(child);
    }
    this.itemBoxes = [];
    this.boostPads = [];
    this.ramps = [];
    this.billboardMeshes = [];

    // Apply theme to scene
    this.scene.background = new THREE.Color(this.currentTheme.skyColor);
    this.scene.fog = new THREE.FogExp2(this.currentTheme.fogColor, 0.0022);

    // 1. Build closed CatmullRomCurve3
    const s = this.currentPreset.scale;
    const rawPts = this.currentPreset.points.map(
      ([x, y, z]) => new THREE.Vector3(x * s, y, z * s)
    );
    this.curve = new THREE.CatmullRomCurve3(rawPts, true, "catmullrom", 0.5);
    this.trackLength = this.curve.getLength();
    this.frames = this.curve.computeFrenetFrames(this.sampleCount, true);

    // 2. Ground & Stylized Grid
    this._buildGround();

    // 3. Road Ribbon, Kerbs & Guardrails
    this._buildRoadAndKerbs();

    // 4. Start/Finish Gantry & Grandstands
    this._buildStartFinishGantry();
    this._buildGrandstands();

    // 5. Streamer Billboards & 3D Championship Podium Stage
    this._buildBillboards();
    this._buildPodiumStage();

    // 6. Interactive Boost Pads, Jump Ramps, Item Boxes
    this._buildTrackFeatures();

    // 7. Scenery Props (Trees / Buildings / Lamps)
    this._buildEnvironmentProps();
  }

  updateBrandText(text) {
    this.streamerBrand = (text || "STREAMKART 3D LIVE").toUpperCase();
    const tex = this._createBillboardTexture(this.streamerBrand);
    for (const mesh of this.billboardMeshes) {
      if (mesh.material) {
        mesh.material.map = tex;
        mesh.material.emissiveMap = tex;
        mesh.material.needsUpdate = true;
      }
    }
  }

  /**
   * Returns world position, forward tangent, right binormal, normal up, and curvature at parameter t in [0,1].
   */
  getTransformAt(t, lateralOffset = 0, heightOffset = 0) {
    const wrappedT = ((t % 1) + 1) % 1;
    const point = this.curve.getPointAt(wrappedT);
    const tangent = this.curve.getTangentAt(wrappedT).normalize();

    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
    const up = new THREE.Vector3().crossVectors(right, tangent).normalize();

    // Estimate signed horizontal curvature for body roll & drift
    const tAhead = (wrappedT + 0.008) % 1;
    const tangentAhead = this.curve.getTangentAt(tAhead).normalize();
    const turnDir = new THREE.Vector3().crossVectors(tangent, tangentAhead).y;
    const curvature = THREE.MathUtils.clamp(turnDir * 42, -1, 1);

    const pos = point
      .clone()
      .addScaledVector(right, lateralOffset)
      .addScaledVector(up, heightOffset);

    return { position: pos, tangent, right, up, curvature };
  }

  update(dt) {
    this.clockTime += dt;

    // Rotate & bob item boxes + handle respawn timers
    for (const box of this.itemBoxes) {
      if (!box.active) {
        box.respawnTimer -= dt;
        if (box.respawnTimer <= 0) {
          box.active = true;
          box.mesh.visible = true;
        }
        continue;
      }
      box.mesh.rotation.y += dt * 2.4;
      box.mesh.rotation.x += dt * 1.1;
      box.mesh.position.y = box.baseY + Math.sin(this.clockTime * 3.5 + box.phase) * 0.25;
    }

    // Animate cheering spectators in grandstands
    if (this.spectatorMesh && this.spectatorBaseY.length > 0) {
      const dummy = new THREE.Object3D();
      const count = this.spectatorBaseY.length;
      for (let i = 0; i < count; i++) {
        this.spectatorMesh.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
        dummy.position.y =
          this.spectatorBaseY[i] + Math.abs(Math.sin(this.clockTime * 6 + i * 0.7)) * 0.35;
        dummy.updateMatrix();
        this.spectatorMesh.setMatrixAt(i, dummy.matrix);
      }
      this.spectatorMesh.instanceMatrix.needsUpdate = true;
    }
  }

  _buildGround() {
    const groundGeo = new THREE.PlaneGeometry(900, 900);
    const groundMat = new THREE.MeshStandardMaterial({
      color: this.currentTheme.groundColor,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.35;
    ground.receiveShadow = true;
    this.group.add(ground);

    const grid = new THREE.GridHelper(
      900,
      90,
      this.currentTheme.railColor,
      this.currentTheme.gridColor
    );
    grid.position.y = -0.3;
    grid.material.opacity = 0.28;
    grid.material.transparent = true;
    this.group.add(grid);
  }

  _buildRoadAndKerbs() {
    const segments = this.sampleCount;
    const halfW = this.roadWidth * 0.5;
    const kerbW = 1.15;

    const roadPositions = [];
    const roadUvs = [];
    const roadIndices = [];

    const kerbPositions = [];
    const kerbColors = [];
    const kerbIndices = [];

    const colorA = new THREE.Color(this.currentTheme.kerbColorA);
    const colorB = new THREE.Color(this.currentTheme.kerbColorB);
    const worldUp = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const pt = this.curve.getPointAt(u % 1);
      const tan = this.curve.getTangentAt(u % 1).normalize();
      const right = new THREE.Vector3().crossVectors(tan, worldUp).normalize();

      const leftEdge = pt.clone().addScaledVector(right, -halfW);
      const rightEdge = pt.clone().addScaledVector(right, halfW);

      roadPositions.push(leftEdge.x, leftEdge.y + 0.02, leftEdge.z);
      roadPositions.push(rightEdge.x, rightEdge.y + 0.02, rightEdge.z);

      roadUvs.push(0, u * 45);
      roadUvs.push(1, u * 45);

      // Left & right raised kerbs
      const leftOuter = pt.clone().addScaledVector(right, -(halfW + kerbW));
      const rightOuter = pt.clone().addScaledVector(right, halfW + kerbW);

      const stripeColor = Math.floor(i / 2) % 2 === 0 ? colorA : colorB;

      // Left kerb vertices (inner, outer)
      kerbPositions.push(leftOuter.x, leftOuter.y + 0.14, leftOuter.z);
      kerbPositions.push(leftEdge.x, leftEdge.y + 0.14, leftEdge.z);
      // Right kerb vertices (inner, outer)
      kerbPositions.push(rightEdge.x, rightEdge.y + 0.14, rightEdge.z);
      kerbPositions.push(rightOuter.x, rightOuter.y + 0.14, rightOuter.z);

      for (let c = 0; c < 4; c++) {
        kerbColors.push(stripeColor.r, stripeColor.g, stripeColor.b);
      }

      if (i < segments) {
        const rBase = i * 2;
        roadIndices.push(rBase, rBase + 1, rBase + 2);
        roadIndices.push(rBase + 1, rBase + 3, rBase + 2);

        const kBase = i * 4;
        // Left kerb quad
        kerbIndices.push(kBase, kBase + 1, kBase + 4);
        kerbIndices.push(kBase + 1, kBase + 5, kBase + 4);
        // Right kerb quad
        kerbIndices.push(kBase + 2, kBase + 3, kBase + 6);
        kerbIndices.push(kBase + 3, kBase + 7, kBase + 6);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute("position", new THREE.Float32BufferAttribute(roadPositions, 3));
    roadGeo.setAttribute("uv", new THREE.Float32BufferAttribute(roadUvs, 2));
    roadGeo.setIndex(roadIndices);
    roadGeo.computeVertexNormals();

    const roadTex = this._createAsphaltTexture();
    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.72,
      metalness: 0.15,
    });
    this.roadMat = roadMat;
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);

    const kerbGeo = new THREE.BufferGeometry();
    kerbGeo.setAttribute("position", new THREE.Float32BufferAttribute(kerbPositions, 3));
    kerbGeo.setAttribute("color", new THREE.Float32BufferAttribute(kerbColors, 3));
    kerbGeo.setIndex(kerbIndices);
    kerbGeo.computeVertexNormals();

    const kerbMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.4,
      metalness: 0.2,
      emissive: new THREE.Color(this.currentTheme.kerbColorA),
      emissiveIntensity: this.currentTheme.id === "neon_city" ? 0.18 : 0.04,
    });
    this.kerbMat = kerbMat;
    const kerbMesh = new THREE.Mesh(kerbGeo, kerbMat);
    kerbMesh.receiveShadow = true;
    this.group.add(kerbMesh);
  }

  _buildStartFinishGantry() {
    const { position, tangent, right } = this.getTransformAt(0, 0, 0);
    const gantry = new THREE.Group();
    gantry.position.copy(position);

    const lookTarget = position.clone().add(tangent);
    gantry.lookAt(lookTarget);

    const halfW = this.roadWidth * 0.5 + 1.4;
    const pillarGeo = new THREE.CylinderGeometry(0.45, 0.55, 8.5, 12);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.7,
      roughness: 0.25,
    });

    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-halfW, 4.25, 0);
    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(halfW, 4.25, 0);
    gantry.add(leftPillar, rightPillar);

    // Overhead banner with checkered texture
    const bannerTex = this._createCheckeredBannerTexture();
    const bannerGeo = new THREE.BoxGeometry(halfW * 2 + 1.2, 2.1, 0.9);
    const bannerMat = new THREE.MeshStandardMaterial({
      map: bannerTex,
      emissive: 0xffffff,
      emissiveMap: bannerTex,
      emissiveIntensity: 0.35,
    });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 7.8, 0);
    gantry.add(banner);

    // Start line strip on the road
    const stripGeo = new THREE.PlaneGeometry(this.roadWidth, 2.6);
    const stripMat = new THREE.MeshBasicMaterial({
      map: bannerTex,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.06;
    gantry.add(strip);

    this.group.add(gantry);
  }

  _buildGrandstands() {
    const { position, tangent, right } = this.getTransformAt(0.97, 0, 0);
    const standGroup = new THREE.Group();
    standGroup.position.copy(position).addScaledVector(right, this.roadWidth * 0.5 + 9.5);
    standGroup.lookAt(position);

    const tierGeo = new THREE.BoxGeometry(24, 1.2, 2.5);
    const tierMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });

    const spectatorPositions = [];
    for (let row = 0; row < 4; row++) {
      const tier = new THREE.Mesh(tierGeo, tierMat);
      tier.position.set(0, row * 1.1 + 0.6, -row * 2.1);
      standGroup.add(tier);

      for (let col = -10; col <= 10; col += 1.2) {
        spectatorPositions.push(new THREE.Vector3(col, row * 1.1 + 1.55, -row * 2.1));
      }
    }

    // Roof canopy
    const roofGeo = new THREE.BoxGeometry(25, 0.4, 10.5);
    const roofMat = new THREE.MeshStandardMaterial({
      color: this.currentTheme.kerbColorA,
      emissive: this.currentTheme.kerbColorA,
      emissiveIntensity: 0.25,
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, 7.2, -3.2);
    roof.rotation.x = 0.15;
    standGroup.add(roof);

    // Instanced cheering spectators
    const specGeo = new THREE.BoxGeometry(0.55, 0.85, 0.55);
    const specMat = new THREE.MeshStandardMaterial({ roughness: 0.4 });
    this.spectatorMesh = new THREE.InstancedMesh(specGeo, specMat, spectatorPositions.length);
    this.spectatorBaseY = [];

    const palette = [0xf43f5e, 0x38bdf8, 0xfacc15, 0x4ade80, 0xc084fc, 0xfb923c];
    const dummy = new THREE.Object3D();
    spectatorPositions.forEach((pos, idx) => {
      dummy.position.copy(pos);
      dummy.updateMatrix();
      this.spectatorMesh.setMatrixAt(idx, dummy.matrix);
      this.spectatorMesh.setColorAt(
        idx,
        new THREE.Color(palette[idx % palette.length])
      );
      this.spectatorBaseY.push(pos.y);
    });
    standGroup.add(this.spectatorMesh);

    this.group.add(standGroup);
  }

  _buildBillboards() {
    const spots = [0.16, 0.41, 0.66, 0.86];
    const tex = this._createBillboardTexture(this.streamerBrand);

    spots.forEach((t, idx) => {
      const side = idx % 2 === 0 ? 1 : -1;
      const { position, tangent } = this.getTransformAt(
        t,
        side * (this.roadWidth * 0.5 + 5.8),
        0
      );

      const boardGroup = new THREE.Group();
      boardGroup.position.copy(position);
      boardGroup.lookAt(position.clone().sub(tangent));

      const postGeo = new THREE.CylinderGeometry(0.28, 0.35, 5.2, 8);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.y = 2.6;
      boardGroup.add(post);

      const screenGeo = new THREE.BoxGeometry(8.5, 2.8, 0.35);
      const screenMat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.65,
      });
      const screen = new THREE.Mesh(screenGeo, screenMat);
      screen.position.y = 5.2;
      boardGroup.add(screen);
      this.billboardMeshes.push(screen);

      this.group.add(boardGroup);
    });
  }

  _buildPodiumStage() {
    this.podiumCenter = new THREE.Vector3(0, 0, -12);
    const stageGroup = new THREE.Group();
    stageGroup.position.copy(this.podiumCenter);

    // Circular base platform + glowing ring
    const basePlatform = new THREE.Mesh(
      new THREE.CylinderGeometry(9.2, 9.8, 0.36, 32),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.35,
        metalness: 0.6,
      })
    );
    basePlatform.position.y = 0.05;
    basePlatform.receiveShadow = true;
    stageGroup.add(basePlatform);

    const neonRing = new THREE.Mesh(
      new THREE.TorusGeometry(9.45, 0.14, 12, 48),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    neonRing.rotation.x = Math.PI / 2;
    neonRing.position.y = 0.22;
    stageGroup.add(neonRing);

    // 3 Stepped Podium Pedestals: Center (1st - Gold), Left (2nd - Silver), Right (3rd - Bronze)
    const pedestals = [
      {
        place: 1,
        x: 0,
        h: 2.35,
        color: 0xfacc15,
        emissive: 0xca8a04,
        label: "1ST",
        badgeColor: "#eab308",
      },
      {
        place: 2,
        x: -3.7,
        h: 1.65,
        color: 0xe2e8f0,
        emissive: 0x64748b,
        label: "2ND",
        badgeColor: "#94a3b8",
      },
      {
        place: 3,
        x: 3.7,
        h: 1.15,
        color: 0xf97316,
        emissive: 0x9a3412,
        label: "3RD",
        badgeColor: "#ea580c",
      },
    ];

    this.podiumSlots = [];

    pedestals.forEach(({ place, x, h, color, emissive, label, badgeColor }) => {
      const box = new THREE.Mesh(
        new THREE.CylinderGeometry(1.75, 1.9, h, 24),
        new THREE.MeshStandardMaterial({
          color,
          emissive,
          emissiveIntensity: 0.32,
          roughness: 0.22,
          metalness: 0.72,
        })
      );
      box.position.set(x, 0.22 + h * 0.5, 0);
      box.castShadow = true;
      box.receiveShadow = true;
      stageGroup.add(box);

      // Front rank plaque
      const plaqueTex = this._createPodiumPlaqueTexture(label, badgeColor);
      const plaque = new THREE.Mesh(
        new THREE.PlaneGeometry(1.7, 0.9),
        new THREE.MeshBasicMaterial({ map: plaqueTex })
      );
      plaque.position.set(x, 0.22 + h * 0.55, 1.92);
      stageGroup.add(plaque);

      const worldSlotPos = this.podiumCenter
        .clone()
        .add(new THREE.Vector3(x, 0.22 + h, 0));
      const worldLookTarget = worldSlotPos.clone().add(new THREE.Vector3(0, 0, 10));

      this.podiumSlots.push({
        place,
        position: worldSlotPos,
        lookAt: worldLookTarget,
      });
    });

    // Backdrop Championship Wall & Streamer Brand Screen
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(13.5, 5.6, 0.5),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.4,
        metalness: 0.5,
      })
    );
    wall.position.set(0, 3.0, -3.6);
    stageGroup.add(wall);

    const screenTex = this._createBillboardTexture(this.streamerBrand);
    const backdropScreen = new THREE.Mesh(
      new THREE.BoxGeometry(11.8, 3.8, 0.25),
      new THREE.MeshStandardMaterial({
        map: screenTex,
        emissive: 0xffffff,
        emissiveMap: screenTex,
        emissiveIntensity: 0.75,
      })
    );
    backdropScreen.position.set(0, 3.4, -3.3);
    stageGroup.add(backdropScreen);
    this.billboardMeshes.push(backdropScreen);

    // Golden Trophy Columns Left & Right
    [-6.2, 6.2].forEach((x) => {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.48, 5.2, 12),
        new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          metalness: 0.85,
          roughness: 0.18,
        })
      );
      col.position.set(x, 2.8, -2.5);
      stageGroup.add(col);

      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.75, 0),
        new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0xfacc15,
          emissiveIntensity: 0.9,
        })
      );
      star.position.set(x, 6.0, -2.5);
      stageGroup.add(star);
    });

    this.group.add(stageGroup);
  }

  _createPodiumPlaqueTexture(label, colorHex) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 10;
    ctx.strokeRect(6, 6, 244, 116);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 68px 'Orbitron', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 128, 68);

    return new THREE.CanvasTexture(canvas);
  }

  _buildTrackFeatures() {
    // 1. Chevron Boost Pads
    const boostTex = this._createBoostPadTexture();
    for (const t of this.currentPreset.boostPads) {
      const lane = (Math.floor(t * 100) % 3 - 1) * 2.5;
      const { position, tangent } = this.getTransformAt(t, lane, 0.06);
      const padGeo = new THREE.PlaneGeometry(3.2, 5.5);
      const padMat = new THREE.MeshBasicMaterial({
        map: boostTex,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.copy(position);
      pad.lookAt(position.clone().add(tangent));
      pad.rotateX(-Math.PI / 2);
      this.group.add(pad);
      this.boostPads.push({ t, lateralOffset: lane, radius: 2.3 });
    }

    // 2. Jump Ramps
    for (const t of this.currentPreset.ramps) {
      const { position, tangent } = this.getTransformAt(t, 0, 0);
      const rampGeo = new THREE.BoxGeometry(this.roadWidth * 0.72, 0.85, 4.2);
      const rampMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xeab308,
        emissiveIntensity: 0.35,
      });
      const ramp = new THREE.Mesh(rampGeo, rampMat);
      ramp.position.copy(position);
      ramp.lookAt(position.clone().add(tangent));
      ramp.rotateX(0.18);
      ramp.position.y += 0.25;
      this.group.add(ramp);
      this.ramps.push({ t, radius: 3.5 });
    }

    // 3. Floating Item Boxes (rows of 3 across the track)
    const boxGeo = new THREE.OctahedronGeometry(0.78, 0);
    for (const t of this.currentPreset.itemBoxRows) {
      [-3.2, 0, 3.2].forEach((lane, idx) => {
        const { position } = this.getTransformAt(t, lane, 1.25);
        const boxMat = new THREE.MeshStandardMaterial({
          color: idx === 1 ? 0xfacc15 : 0x38bdf8,
          emissive: idx === 1 ? 0xeab308 : 0x0284c7,
          emissiveIntensity: 0.75,
          roughness: 0.15,
          metalness: 0.3,
          transparent: true,
          opacity: 0.88,
        });
        const mesh = new THREE.Mesh(boxGeo, boxMat);
        mesh.position.copy(position);
        this.group.add(mesh);

        this.itemBoxes.push({
          t,
          lateralOffset: lane,
          position: position.clone(),
          baseY: position.y,
          phase: t * 20 + idx,
          mesh,
          active: true,
          respawnTimer: 0,
        });
      });
    }
  }

  _buildEnvironmentProps() {
    const propCount = 75;
    const isNeon = this.currentTheme.id === "neon_city";
    const trunkGeo = isNeon
      ? new THREE.BoxGeometry(3.2, 14, 3.2)
      : new THREE.CylinderGeometry(0.45, 0.7, 4.5, 7);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: isNeon ? 0x0f172a : 0x78350f,
      emissive: isNeon ? this.currentTheme.railColor : 0x000000,
      emissiveIntensity: isNeon ? 0.22 : 0,
      roughness: 0.5,
    });

    const crownGeo = isNeon
      ? new THREE.BoxGeometry(3.5, 0.6, 3.5)
      : new THREE.ConeGeometry(2.6, 5.5, 7);
    const crownMat = new THREE.MeshStandardMaterial({
      color:
        this.currentTheme.id === "sunny_beach"
          ? 0x22c55e
          : this.currentTheme.id === "cyber_desert"
          ? 0xd97706
          : 0xf43f5e,
      emissive: isNeon ? 0xf43f5e : 0x000000,
      emissiveIntensity: isNeon ? 0.65 : 0,
      roughness: 0.6,
    });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, propCount);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, propCount);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < propCount; i++) {
      const t = i / propCount;
      const side = i % 2 === 0 ? 1 : -1;
      const dist = this.roadWidth * 0.5 + 8 + ((i * 7) % 18);
      const { position } = this.getTransformAt(t, side * dist, 0);

      const scaleY = isNeon ? 0.6 + ((i * 3) % 10) * 0.18 : 0.85 + (i % 4) * 0.2;
      dummy.position.set(position.x, (isNeon ? 7 : 2.25) * scaleY - 0.3, position.z);
      dummy.scale.set(1, scaleY, 1);
      dummy.rotation.y = (i * 1.3) % Math.PI;
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      dummy.position.set(
        position.x,
        (isNeon ? 14.2 : 5.5) * scaleY - 0.3,
        position.z
      );
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    }

    this.group.add(trunks, crowns);
  }

  _createAsphaltTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#1e2430";
    ctx.fillRect(0, 0, 512, 512);

    // Subtle grain
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)";
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
    }

    // Outer racing lines
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(18, 0, 10, 512);
    ctx.fillRect(484, 0, 10, 512);

    // Dashed center lines
    ctx.fillStyle = "rgba(250, 204, 21, 0.85)";
    ctx.fillRect(252, 40, 8, 180);
    ctx.fillRect(252, 300, 8, 180);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  _createCheckeredBannerTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    const size = 32;
    for (let y = 0; y < 128; y += size) {
      for (let x = 0; x < 512; x += size) {
        ctx.fillStyle = (x / size + y / size) % 2 === 0 ? "#ffffff" : "#0f172a";
        ctx.fillRect(x, y, size, size);
      }
    }

    ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
    ctx.fillRect(96, 22, 320, 84);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 4;
    ctx.strokeRect(96, 22, 320, 84);

    ctx.fillStyle = "#facc15";
    ctx.font = "900 40px 'Orbitron', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("START / FINISH", 256, 66);

    return new THREE.CanvasTexture(canvas);
  }

  _createBillboardTexture(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, 512, 192);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(0.5, "#1e1b4b");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 192);

    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 496, 176);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 22px 'Orbitron', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⚡ OFFICIAL STREAM ARENA ⚡", 256, 52);

    ctx.fillStyle = "#facc15";
    ctx.font = "900 42px 'Orbitron', sans-serif";
    ctx.fillText(text.slice(0, 22), 256, 118);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "600 18px sans-serif";
    ctx.fillText("DONATE TO BOOST OR ATTACK!", 256, 158);

    return new THREE.CanvasTexture(canvas);
  }

  _createBoostPadTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "rgba(6, 182, 212, 0.25)";
    ctx.fillRect(0, 0, 128, 256);

    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 10;
    for (let y = 40; y <= 210; y += 55) {
      ctx.beginPath();
      ctx.moveTo(20, y + 30);
      ctx.lineTo(64, y);
      ctx.lineTo(108, y + 30);
      ctx.stroke();
    }

    return new THREE.CanvasTexture(canvas);
  }
}
