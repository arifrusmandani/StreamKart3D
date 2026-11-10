import * as THREE from "three";

export const VEHICLE_STYLES = [
  { id: "f1", name: "🏎️ Formula Aero" },
  { id: "supercar", name: "🚘 Cyber Supercar" },
  { id: "buggy", name: "🚙 Monster Buggy" },
  { id: "kart", name: "🏁 Arcade Kart" },
];

/**
 * Builds a stylized 3D racing vehicle in one of 4 distinct silhouettes:
 * - 'f1': Long needle nose, wide front wing, halo bar, overhead airbox, dual-plane F1 wing
 * - 'supercar': Enclosed wedge hypercar with glass canopy, LED headlight strip & cyberpunk taillight bar
 * - 'buggy': Raised offroad monster buggy with roll cage, roof LED spotlights, spare tire & chunky tires
 * - 'kart': Classic open-wheel arcade racing kart with side pods & exposed chrome engine
 */
export function buildStylizedKartMesh({
  colorHex = "#f43f5e",
  number = 1,
  style = "kart",
} = {}) {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const primaryColor = new THREE.Color(colorHex);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.24,
    metalness: 0.38,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0.22,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.65,
    metalness: 0.25,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.15,
    metalness: 0.88,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x090d16,
    roughness: 0.05,
    metalness: 0.92,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    emissive: primaryColor,
    emissiveIntensity: 0.9,
  });
  const headLightMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });

  // Underglow neon plate (shared across all styles)
  const underglow = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.06, 2.25), glowMat);
  underglow.position.set(0, 0.16, 0);
  bodyGroup.add(underglow);

  // Number badge texture
  const numTex = createNumberBadgeTexture(number, colorHex);
  const numMat = new THREE.MeshBasicMaterial({ map: numTex });

  // Driver Helmet Group (used in open-cockpit styles or visible through canopy)
  const helmetGroup = new THREE.Group();
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 14), accentMat);
  helmet.castShadow = true;
  helmetGroup.add(helmet);

  const helmetStripe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.28, 0.5), bodyMat);
  helmetStripe.position.set(0, 0.07, 0);
  helmetGroup.add(helmetStripe);

  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 10, 0, Math.PI, 0.35, 0.9),
    glassMat
  );
  visor.rotation.y = -Math.PI / 2;
  helmetGroup.add(visor);

  // Build style-specific bodywork
  let wheelConfig;
  let exhaustPositions;

  if (style === "f1") {
    // ================= 1. FORMULA AERO GT =================
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 2.95), darkMat);
    floor.position.set(0, 0.22, 0.05);
    bodyGroup.add(floor);

    // Narrow sculpted monocoque + long needle nose
    const monocoque = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.38, 1.9), bodyMat);
    monocoque.position.set(0, 0.42, -0.05);
    monocoque.castShadow = true;
    bodyGroup.add(monocoque);

    const needleNose = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 1.15), bodyMat);
    needleNose.position.set(0, 0.33, 1.25);
    needleNose.rotation.x = 0.12;
    needleNose.castShadow = true;
    bodyGroup.add(needleNose);

    // Wide multi-element F1 Front Wing
    const frontWingMain = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 0.42), accentMat);
    frontWingMain.position.set(0, 0.22, 1.68);
    bodyGroup.add(frontWingMain);

    const frontFlap = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.06, 0.22), bodyMat);
    frontFlap.position.set(0, 0.28, 1.56);
    frontFlap.rotation.x = -0.22;
    bodyGroup.add(frontFlap);

    [-0.86, 0.86].forEach((x) => {
      const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.48), bodyMat);
      endplate.position.set(x, 0.28, 1.65);
      bodyGroup.add(endplate);
    });

    // Sidepods with radiator intakes
    [-0.56, 0.56].forEach((x) => {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 1.25), bodyMat);
      pod.position.set(x, 0.38, -0.15);
      pod.castShadow = true;
      bodyGroup.add(pod);

      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.1), darkMat);
      intake.position.set(x, 0.38, 0.44);
      bodyGroup.add(intake);
    });

    // Overhead Airbox Scoop & Shark Fin
    const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.78), bodyMat);
    airbox.position.set(0, 0.76, -0.58);
    bodyGroup.add(airbox);

    const sharkFin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.75), accentMat);
    sharkFin.position.set(0, 0.88, -0.88);
    bodyGroup.add(sharkFin);

    // Halo Cockpit Bar
    const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 16, Math.PI), darkMat);
    haloRing.rotation.x = Math.PI / 2 - 0.15;
    haloRing.position.set(0, 0.82, 0.02);
    bodyGroup.add(haloRing);

    const haloPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28), darkMat);
    haloPillar.position.set(0, 0.72, 0.34);
    haloPillar.rotation.x = -0.35;
    bodyGroup.add(haloPillar);

    // High-Downforce Dual-Plane Rear Wing
    const rearWingLow = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.07, 0.36), darkMat);
    rearWingLow.position.set(0, 0.85, -1.32);
    const rearWingHigh = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.08, 0.32), bodyMat);
    rearWingHigh.position.set(0, 1.12, -1.38);
    rearWingHigh.rotation.x = -0.22;
    bodyGroup.add(rearWingLow, rearWingHigh);

    [-0.78, 0.78].forEach((x) => {
      const rPlate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.56, 0.48), accentMat);
      rPlate.position.set(x, 0.94, -1.34);
      bodyGroup.add(rPlate);
    });

    // Number plate on nose
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.34), numMat);
    plate.position.set(0, 0.46, 1.15);
    plate.rotation.x = -Math.PI / 2 + 0.14;
    bodyGroup.add(plate);

    helmetGroup.position.set(0, 0.84, -0.05);
    bodyGroup.add(helmetGroup);

    wheelConfig = [
      { x: -0.82, y: 0.32, z: 1.05, r: 0.32, w: 0.32, isFront: true },
      { x: 0.82, y: 0.32, z: 1.05, r: 0.32, w: 0.32, isFront: true },
      { x: -0.86, y: 0.35, z: -0.92, r: 0.35, w: 0.42, isFront: false },
      { x: 0.86, y: 0.35, z: -0.92, r: 0.35, w: 0.42, isFront: false },
    ];
    exhaustPositions = [
      { x: -0.16, y: 0.55, z: -1.35 },
      { x: 0.16, y: 0.55, z: -1.35 },
    ];
  } else if (style === "supercar") {
    // ================= 2. CYBER NEON HYPERCAR =================
    const baseBody = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.36, 2.75), bodyMat);
    baseBody.position.set(0, 0.38, 0);
    baseBody.castShadow = true;
    bodyGroup.add(baseBody);

    // Sculpted front hood wedge
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.22, 0.95), bodyMat);
    hood.position.set(0, 0.44, 0.92);
    hood.rotation.x = 0.18;
    bodyGroup.add(hood);

    // Front Splitter & Glowing Cyber LED Headlight Bar
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.1, 0.35), darkMat);
    splitter.position.set(0, 0.21, 1.32);
    bodyGroup.add(splitter);

    const ledFront = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.07, 0.08), headLightMat);
    ledFront.position.set(0, 0.42, 1.36);
    bodyGroup.add(ledFront);

    // Enclosed Tinted Aerodynamic Glass Canopy Dome
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.38, 1.35), glassMat);
    canopy.position.set(0, 0.68, -0.08);
    canopy.castShadow = true;
    bodyGroup.add(canopy);

    const roofScoop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.85), accentMat);
    roofScoop.position.set(0, 0.88, -0.18);
    bodyGroup.add(roofScoop);

    // Side Accent Blades
    [-0.83, 0.83].forEach((x) => {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 1.8), glowMat);
      skirt.position.set(x, 0.26, 0);
      bodyGroup.add(skirt);
    });

    // GT Wing & Full-width Cyberpunk Taillight Bar
    const tailLight = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.1, 0.08), tailLightMat);
    tailLight.position.set(0, 0.48, -1.36);
    bodyGroup.add(tailLight);

    const gtWing = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.08, 0.36), darkMat);
    gtWing.position.set(0, 0.88, -1.24);
    gtWing.rotation.x = -0.16;
    bodyGroup.add(gtWing);

    [-0.52, 0.52].forEach((x) => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.22), darkMat);
      strut.position.set(x, 0.7, -1.2);
      bodyGroup.add(strut);
    });

    // Number plate on front hood
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.4), numMat);
    plate.position.set(0, 0.56, 0.96);
    plate.rotation.x = -Math.PI / 2 + 0.2;
    bodyGroup.add(plate);

    helmetGroup.position.set(0, 0.66, -0.05);
    bodyGroup.add(helmetGroup);

    wheelConfig = [
      { x: -0.82, y: 0.32, z: 0.86, r: 0.33, w: 0.28, isFront: true },
      { x: 0.82, y: 0.32, z: 0.86, r: 0.33, w: 0.28, isFront: true },
      { x: -0.84, y: 0.35, z: -0.84, r: 0.36, w: 0.34, isFront: false },
      { x: 0.84, y: 0.35, z: -0.84, r: 0.36, w: 0.34, isFront: false },
    ];
    exhaustPositions = [
      { x: -0.32, y: 0.34, z: -1.38 },
      { x: 0.32, y: 0.34, z: -1.38 },
    ];
  } else if (style === "buggy") {
    // ================= 3. MONSTER OFFROAD BUGGY =================
    // High-clearance lifted chassis
    const skidPlate = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.22, 2.35), darkMat);
    skidPlate.position.set(0, 0.44, 0);
    bodyGroup.add(skidPlate);

    const buggyTub = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.38, 1.95), bodyMat);
    buggyTub.position.set(0, 0.65, -0.05);
    buggyTub.castShadow = true;
    bodyGroup.add(buggyTub);

    const buggyHood = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.28, 0.78), accentMat);
    buggyHood.position.set(0, 0.72, 0.82);
    buggyHood.rotation.x = 0.14;
    bodyGroup.add(buggyHood);

    // Bull-bar front bumper
    const bullBar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.38, 8), chromeMat);
    bullBar.rotation.z = Math.PI / 2;
    bullBar.position.set(0, 0.62, 1.28);
    bodyGroup.add(bullBar);

    // Tubular Roll Cage & Roof Panel with 4 LED Spotlights
    [-0.54, 0.54].forEach((x) => {
      const frontPost = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.68), chromeMat);
      frontPost.position.set(x, 1.08, 0.36);
      frontPost.rotation.x = -0.28;

      const rearPost = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.68), chromeMat);
      rearPost.position.set(x, 1.08, -0.58);
      rearPost.rotation.x = 0.25;
      bodyGroup.add(frontPost, rearPost);
    });

    const roofRack = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.08, 0.88), bodyMat);
    roofRack.position.set(0, 1.38, -0.12);
    bodyGroup.add(roofRack);

    // 4 Roof LED Spotlights
    [-0.36, -0.12, 0.12, 0.36].forEach((x) => {
      const podLight = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 10), headLightMat);
      podLight.rotation.x = Math.PI / 2;
      podLight.position.set(x, 1.47, 0.32);
      bodyGroup.add(podLight);
    });

    // Angled Rear Spare Tire
    const spareTire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14), darkMat);
    spareTire.rotation.x = Math.PI / 3;
    spareTire.position.set(0, 0.92, -1.16);
    bodyGroup.add(spareTire);

    // Number plate on hood
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.38), numMat);
    plate.position.set(0, 0.88, 0.84);
    plate.rotation.x = -Math.PI / 2 + 0.18;
    bodyGroup.add(plate);

    helmetGroup.position.set(0, 1.05, -0.08);
    bodyGroup.add(helmetGroup);

    // Oversized Monster Offroad Wheels
    wheelConfig = [
      { x: -0.92, y: 0.44, z: 0.88, r: 0.44, w: 0.38, isFront: true },
      { x: 0.92, y: 0.44, z: 0.88, r: 0.44, w: 0.38, isFront: true },
      { x: -0.96, y: 0.48, z: -0.82, r: 0.48, w: 0.44, isFront: false },
      { x: 0.96, y: 0.48, z: -0.82, r: 0.48, w: 0.44, isFront: false },
    ];
    exhaustPositions = [
      { x: -0.42, y: 0.78, z: -1.18 },
      { x: 0.42, y: 0.78, z: -1.18 },
    ];
  } else {
    // ================= 4. CLASSIC ARCADE KART =================
    const pan = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.16, 2.55), darkMat);
    pan.position.set(0, 0.24, 0);
    pan.castShadow = true;
    bodyGroup.add(pan);

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.36, 1.85), bodyMat);
    chassis.position.set(0, 0.42, -0.05);
    chassis.castShadow = true;
    bodyGroup.add(chassis);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.24, 0.85), bodyMat);
    nose.position.set(0, 0.34, 1.02);
    nose.rotation.x = 0.16;
    nose.castShadow = true;
    bodyGroup.add(nose);

    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.16, 0.36), accentMat);
    frontBumper.position.set(0, 0.26, 1.38);
    bodyGroup.add(frontBumper);

    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), numMat);
    plate.position.set(0, 0.48, 1.06);
    plate.rotation.x = -Math.PI / 2 + 0.22;
    bodyGroup.add(plate);

    [-0.64, 0.64].forEach((x) => {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 1.3), bodyMat);
      pod.position.set(x, 0.36, -0.05);
      pod.castShadow = true;
      bodyGroup.add(pod);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 1.15), accentMat);
      stripe.position.set(x, 0.39, -0.05);
      bodyGroup.add(stripe);
    });

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.48, 0.55), darkMat);
    seat.position.set(0, 0.62, -0.22);
    bodyGroup.add(seat);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.42, 0.38), bodyMat);
    torso.position.set(0, 0.78, -0.14);
    bodyGroup.add(torso);

    helmetGroup.position.set(0, 1.12, -0.1);
    bodyGroup.add(helmetGroup);

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.38, 0.65), chromeMat);
    engineBlock.position.set(0, 0.58, -0.82);
    bodyGroup.add(engineBlock);

    [-0.42, 0.42].forEach((x) => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.25), darkMat);
      strut.position.set(x, 0.88, -1.08);
      bodyGroup.add(strut);
    });

    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.1, 0.42), bodyMat);
    spoiler.position.set(0, 1.12, -1.14);
    spoiler.rotation.x = -0.18;
    spoiler.castShadow = true;
    bodyGroup.add(spoiler);

    wheelConfig = [
      { x: -0.78, y: 0.3, z: 0.88, r: 0.3, w: 0.28, isFront: true },
      { x: 0.78, y: 0.3, z: 0.88, r: 0.3, w: 0.28, isFront: true },
      { x: -0.84, y: 0.34, z: -0.78, r: 0.35, w: 0.36, isFront: false },
      { x: 0.84, y: 0.34, z: -0.78, r: 0.35, w: 0.36, isFront: false },
    ];
    exhaustPositions = [
      { x: -0.28, y: 0.56, z: -1.22 },
      { x: 0.28, y: 0.56, z: -1.22 },
    ];
  }

  // Dual Exhaust Pipes + Dynamic Flame Cones
  const flameCones = [];
  exhaustPositions.forEach(({ x, y, z }) => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.44, 10), chromeMat);
    pipe.rotation.x = Math.PI / 2 + 0.16;
    pipe.position.set(x, y, z);
    bodyGroup.add(pipe);

    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.95, 10), flameMat);
    flame.rotation.x = -Math.PI / 2 - 0.15;
    flame.position.set(x, y - 0.04, z - 0.55);
    flame.visible = false;
    bodyGroup.add(flame);
    flameCones.push(flame);
  });

  // Build 4 Wheels
  const wheels = [];
  const frontWheelPivots = [];
  wheelConfig.forEach(({ x, y, z, r, w, isFront }) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    root.add(pivot);
    if (isFront) frontWheelPivots.push(pivot);

    const tireGeo = new THREE.CylinderGeometry(r, r, w, 16);
    tireGeo.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, darkMat);
    tire.castShadow = true;

    const rimGeo = new THREE.CylinderGeometry(r * 0.56, r * 0.56, w + 0.02, 8);
    rimGeo.rotateZ(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, glowMat);
    tire.add(rim);

    pivot.add(tire);
    wheels.push(tire);
  });

  // Status Effect Attachments (Shield, Ice Crystal, Dizzy Stars)
  const shieldGeo = new THREE.IcosahedronGeometry(1.8, 1);
  const shieldMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.9,
    wireframe: true,
    transparent: true,
    opacity: 0.65,
  });
  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.position.set(0, 0.78, 0);
  shieldMesh.visible = false;
  root.add(shieldMesh);

  const iceGeo = new THREE.OctahedronGeometry(1.7, 1);
  const iceMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.55,
    roughness: 0.08,
    metalness: 0.2,
    transparent: true,
    opacity: 0.68,
  });
  const iceMesh = new THREE.Mesh(iceGeo, iceMat);
  iceMesh.position.set(0, 0.78, 0);
  iceMesh.visible = false;
  root.add(iceMesh);

  const dizzyGroup = new THREE.Group();
  dizzyGroup.position.set(0, 1.72, -0.1);
  dizzyGroup.visible = false;
  const starGeo = new THREE.OctahedronGeometry(0.14, 0);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.set(Math.cos(angle) * 0.52, 0, Math.sin(angle) * 0.52);
    dizzyGroup.add(star);
  }
  root.add(dizzyGroup);

  return {
    root,
    bodyGroup,
    helmetGroup,
    wheels,
    frontWheelPivots,
    flameCones,
    shieldMesh,
    iceMesh,
    dizzyGroup,
    bodyMat,
  };
}

function createNumberBadgeTexture(number, colorHex) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, 128, 96);
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 120, 88);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 54px 'Orbitron', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`#${number}`, 64, 52);

  return new THREE.CanvasTexture(canvas);
}
