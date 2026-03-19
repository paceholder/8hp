import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ─────────────────────────────────────────────────────────────────────────────
// ZF 8HP DATA
// ─────────────────────────────────────────────────────────────────────────────

const GEAR_DATA = {
    'R': { engaged: ['A','B','D'],   ratio: -3.297, name: 'Rev' },
    '1': { engaged: ['A','B','C'],   ratio: 4.696,  name: '1st' },
    '2': { engaged: ['A','B','E'],   ratio: 3.130,  name: '2nd' },
    '3': { engaged: ['B','C','E'],   ratio: 2.104,  name: '3rd' },
    '4': { engaged: ['B','C','D'],   ratio: 1.667,  name: '4th' },
    '5': { engaged: ['C','D','E'],   ratio: 1.285,  name: '5th' },
    '6': { engaged: ['B','D','E'],   ratio: 1.000,  name: '6th' },
    '7': { engaged: ['A','D','E'],   ratio: 0.839,  name: '7th' },
    '8': { engaged: ['A','C','D'],   ratio: 0.667,  name: '8th' },
};

const GS_SPEC = [
    { sun: 48, ring: 96  },  // GS1
    { sun: 48, ring: 96  },  // GS2
    { sun: 69, ring: 111 },  // GS3
    { sun: 23, ring: 85  },  // GS4
];

// ─────────────────────────────────────────────────────────────────────────────
// PALETTE — warm grays, muted metal, terracotta accent
// ─────────────────────────────────────────────────────────────────────────────

const PAL = {
    bg:           0xf0efed,
    housing:      0xc8c5be,
    sun:          0xb8a870,
    ring:         0x8a8a90,
    planet:       0xa0a0a8,
    carrier:      0x909098,
    inputShaft:   0xc4a835,
    outputShaft:  0x6aaa45,
    connShaft:    0x9898a0,
    clutchSteel:  0xb0b0b0,
    clutchFric:   0x9a6e40,
    engaged:      0xc44b1a,
    engagedEmit:  0x441500,
    disengaged:   0xa0a0a0,
    drumOn:       0xc44b1a,
    drumOff:      0x909090,
};

// ─────────────────────────────────────────────────────────────────────────────
// RENDERER
// ─────────────────────────────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.bg);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 300);
camera.position.set(4, 8, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.sortObjects = true;  // ensure transparent objects are sorted by distance
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 0, 0);
controls.minDistance = 3;
controls.maxDistance = 80;
// Unrestricted rotation
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;
controls.enablePan = true;

// ─────────────────────────────────────────────────────────────────────────────
// LIGHTING — soft, technical, from all angles
// ─────────────────────────────────────────────────────────────────────────────

scene.add(new THREE.HemisphereLight(0xdddcda, 0x88857e, 0.7));

const key = new THREE.DirectionalLight(0xfffaf0, 1.6);
key.position.set(10, 18, 14);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -20; key.shadow.camera.right = 20;
key.shadow.camera.top = 20; key.shadow.camera.bottom = -20;
key.shadow.bias = -0.0004;
scene.add(key);

const fill = new THREE.DirectionalLight(0xd0d8e8, 0.5);
fill.position.set(-10, 6, -8);
scene.add(fill);

const back = new THREE.DirectionalLight(0xffe8d0, 0.3);
back.position.set(-4, -8, 12);
scene.add(back);

// Subtle ground plane for shadow catching
const groundGeo = new THREE.PlaneGeometry(60, 60);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.08 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -5;
ground.receiveShadow = true;
scene.add(ground);

// ─────────────────────────────────────────────────────────────────────────────
// POST-PROCESSING — SAO for ambient occlusion
// ─────────────────────────────────────────────────────────────────────────────

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const sao = new SAOPass(scene, camera);
sao.params.saoBias = 0.5;
sao.params.saoIntensity = 0.008;
sao.params.saoScale = 3;
sao.params.saoKernelRadius = 50;
sao.params.saoBlur = true;
sao.params.saoBlurRadius = 6;
sao.params.saoBlurStdDev = 4;
sao.params.saoBlurDepthCutoff = 0.01;
composer.addPass(sao);
composer.addPass(new OutputPass());

// ─────────────────────────────────────────────────────────────────────────────
// INVOLUTE GEAR GEOMETRY
// ─────────────────────────────────────────────────────────────────────────────

/** Generate an involute curve point for angle t on base circle */
function involutePoint(rb, t) {
    return [
        rb * (Math.cos(t) + t * Math.sin(t)),
        rb * (Math.sin(t) - t * Math.cos(t)),
    ];
}

/**
 * Create a detailed external spur gear profile.
 * Returns an ExtrudeGeometry along X axis.
 */
function makeExternalGear(module, teeth, faceWidth, boreR) {
    const m = module;
    const z = teeth;
    const rp = (m * z) / 2;           // pitch radius
    const ra = rp + m;                 // addendum
    const rd = rp - 1.25 * m;         // dedendum
    const rb = rp * Math.cos(20 * Math.PI / 180); // base circle
    const shape = new THREE.Shape();

    const ptsPerTooth = 12;
    const toothAngle = (2 * Math.PI) / z;

    // Tooth width at pitch circle (half)
    const halfToothPitch = toothAngle / 4;

    for (let i = 0; i < z; i++) {
        const startA = i * toothAngle;
        // Dedendum start
        const dA = startA - halfToothPitch * 0.9;

        // Build involute flank going up
        for (let j = 0; j <= ptsPerTooth; j++) {
            const frac = j / ptsPerTooth;
            // Blend from dedendum to addendum
            const r = rd + (ra - rd) * frac;
            // Involute angle offset
            const invA = Math.sqrt(Math.max(0, (r / rb) * (r / rb) - 1));
            const baseA = Math.acos(Math.min(1, rb / Math.max(r, rb + 0.001)));
            const angle = startA - halfToothPitch + baseA * 0.7 * frac;
            const y = Math.cos(angle) * r;
            const zz = Math.sin(angle) * r;
            if (i === 0 && j === 0) shape.moveTo(y, zz);
            else shape.lineTo(y, zz);
        }

        // Tooth tip arc
        const tipA1 = startA - halfToothPitch * 0.15;
        const tipA2 = startA + halfToothPitch * 0.15;
        shape.lineTo(Math.cos(tipA1) * ra, Math.sin(tipA1) * ra);
        shape.lineTo(Math.cos(tipA2) * ra, Math.sin(tipA2) * ra);

        // Involute flank going down
        for (let j = ptsPerTooth; j >= 0; j--) {
            const frac = j / ptsPerTooth;
            const r = rd + (ra - rd) * frac;
            const baseA = Math.acos(Math.min(1, rb / Math.max(r, rb + 0.001)));
            const angle = startA + halfToothPitch - baseA * 0.7 * frac;
            const y = Math.cos(angle) * r;
            const zz = Math.sin(angle) * r;
            shape.lineTo(y, zz);
        }

        // Root arc to next tooth
        const rootA1 = startA + halfToothPitch * 0.9;
        const rootA2 = startA + toothAngle - halfToothPitch * 0.9;
        shape.lineTo(Math.cos(rootA1) * rd, Math.sin(rootA1) * rd);
        if (i < z - 1) {
            // Small arc along dedendum to next tooth
            const steps = 4;
            for (let s = 1; s <= steps; s++) {
                const a = rootA1 + (rootA2 - rootA1) * (s / steps);
                shape.lineTo(Math.cos(a) * rd, Math.sin(a) * rd);
            }
        }
    }
    shape.closePath();

    // Bore hole
    if (boreR > 0.01) {
        const hole = new THREE.Path();
        const seg = 36;
        for (let i = 0; i <= seg; i++) {
            const a = (i / seg) * Math.PI * 2;
            if (i === 0) hole.moveTo(Math.cos(a) * boreR, Math.sin(a) * boreR);
            else hole.lineTo(Math.cos(a) * boreR, Math.sin(a) * boreR);
        }
        shape.holes.push(hole);
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: faceWidth, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(-faceWidth / 2, 0, 0);
    geo.computeVertexNormals();
    return geo;
}

/**
 * Internal (ring) gear: teeth on inside, smooth outside
 */
function makeInternalGear(module, teeth, faceWidth, outerR) {
    const m = module;
    const z = teeth;
    const rp = (m * z) / 2;
    const ra = rp - m;               // addendum (inside)
    const rd = rp + 0.8 * m;         // dedendum (inside, towards outer)
    const shape = new THREE.Shape();

    // Outer circle
    const seg = 64;
    for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        if (i === 0) shape.moveTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
        else shape.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
    }
    shape.closePath();

    // Inner hole with gear teeth
    const hole = new THREE.Path();
    const toothAngle = (2 * Math.PI) / z;
    const halfTooth = toothAngle / 4;
    const ptsPerFlank = 8;

    for (let i = 0; i < z; i++) {
        const startA = i * toothAngle;

        // Root (outer edge of inner teeth)
        const rootA = startA - halfTooth * 0.9;
        if (i === 0) hole.moveTo(Math.cos(rootA) * rd, Math.sin(rootA) * rd);
        else hole.lineTo(Math.cos(rootA) * rd, Math.sin(rootA) * rd);

        // Flank going to tip (smaller radius = deeper into bore)
        for (let j = 0; j <= ptsPerFlank; j++) {
            const frac = j / ptsPerFlank;
            const r = rd + (ra - rd) * frac;
            const angle = startA - halfTooth * (1 - frac * 0.85);
            hole.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }

        // Tip arc
        const tipA1 = startA - halfTooth * 0.15;
        const tipA2 = startA + halfTooth * 0.15;
        hole.lineTo(Math.cos(tipA1) * ra, Math.sin(tipA1) * ra);
        hole.lineTo(Math.cos(tipA2) * ra, Math.sin(tipA2) * ra);

        // Other flank
        for (let j = ptsPerFlank; j >= 0; j--) {
            const frac = j / ptsPerFlank;
            const r = rd + (ra - rd) * frac;
            const angle = startA + halfTooth * (1 - frac * 0.85);
            hole.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }

        // Root arc to next tooth
        const rootEnd = startA + halfTooth * 0.9;
        hole.lineTo(Math.cos(rootEnd) * rd, Math.sin(rootEnd) * rd);

        if (i < z - 1) {
            const nextRoot = (i + 1) * toothAngle - halfTooth * 0.9;
            const steps = 3;
            for (let s = 1; s <= steps; s++) {
                const a = rootEnd + (nextRoot - rootEnd) * (s / steps);
                hole.lineTo(Math.cos(a) * rd, Math.sin(a) * rd);
            }
        }
    }
    shape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(shape, { depth: faceWidth, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(-faceWidth / 2, 0, 0);
    geo.computeVertexNormals();
    return geo;
}

/** Hollow cylinder (shaft / drum) along X */
function makeTube(ir, or, length, segs = 32) {
    const pts = [
        new THREE.Vector2(ir, -length / 2),
        new THREE.Vector2(or, -length / 2),
        new THREE.Vector2(or, length / 2),
        new THREE.Vector2(ir, length / 2),
    ];
    const geo = new THREE.LatheGeometry(pts, segs);
    geo.rotateZ(Math.PI / 2);
    geo.computeVertexNormals();
    return geo;
}

/** Shaft with a canvas texture showing bold stripes — rotation unmissable */
function makeVisibleShaft(radius, length, nStripes = 4, baseColor = 0xbbbbbb, stripeColor = 0x333333) {
    const g = new THREE.Group();

    // Create a striped texture via canvas
    const canvas = document.createElement('canvas');
    canvas.width = nStripes * 2 * 4; // small, repeating
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const segW = canvas.width / (nStripes * 2);
    for (let i = 0; i < nStripes * 2; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#' + baseColor.toString(16).padStart(6, '0') : '#' + stripeColor.toString(16).padStart(6, '0');
        ctx.fillRect(i * segW, 0, segW, canvas.height);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // Repeat once around circumference, stretch along length
    tex.repeat.set(1, 1);

    const cylGeo = new THREE.CylinderGeometry(radius, radius, length, 32, 1, false);
    cylGeo.rotateZ(Math.PI / 2); // align along X
    const cylMat = new THREE.MeshStandardMaterial({
        map: tex,
        metalness: 0.05,
        roughness: 0.9,
    });
    const cyl = new THREE.Mesh(cylGeo, cylMat);
    cyl.castShadow = true;
    g.add(cyl);

    return g;
}

/** Planet carrier with discs + arms */
function makeCarrier(ir, or, length, nArms = 4) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: PAL.carrier, metalness: 0.05, roughness: 0.9, side: THREE.DoubleSide });

    // Top & bottom plates (thin discs)
    const discGeo = new THREE.RingGeometry(ir, or, 48);
    [length / 2, -length / 2].forEach(x => {
        const d = new THREE.Mesh(discGeo, mat);
        d.rotation.y = Math.PI / 2;
        d.position.x = x;
        d.castShadow = true;
        d.receiveShadow = true;
        g.add(d);
    });

    // Cross-arms
    const armW = 0.08, armD = (or - ir) * 0.85;
    const armGeo = new THREE.BoxGeometry(length * 0.98, armW, armD);
    for (let i = 0; i < nArms; i++) {
        const a = (i / nArms) * Math.PI * 2;
        const r = (ir + or) * 0.52;
        const arm = new THREE.Mesh(armGeo, mat);
        arm.position.set(0, Math.cos(a) * r, Math.sin(a) * r);
        arm.rotation.x = a;
        arm.castShadow = true;
        g.add(arm);
    }
    return g;
}

/** Clutch pack: alternating steel + friction discs in a drum */
function makeClutchPack(ir, or, length, nDiscs) {
    const g = new THREE.Group();
    const gap = length / (nDiscs + 1);

    for (let i = 0; i < nDiscs; i++) {
        const x = -length / 2 + gap * (i + 1);
        const isSteel = i % 2 === 0;
        const discGeo = new THREE.RingGeometry(ir, or, 48);
        const discMat = new THREE.MeshStandardMaterial({
            color: isSteel ? PAL.clutchSteel : PAL.clutchFric,
            metalness: isSteel ? 0.1 : 0.05,
            roughness: isSteel ? 0.8 : 0.9,
            side: THREE.DoubleSide,
        });
        discMat.userData = { isSteel, isDrum: false };
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.rotation.y = Math.PI / 2;
        disc.position.x = x;
        disc.castShadow = true;
        g.add(disc);
    }

    // Drum shell
    const drumGeo = makeTube(or - 0.01, or + 0.04, length);
    const drumMat = new THREE.MeshStandardMaterial({
        color: PAL.drumOff,
        metalness: 0.05,
        roughness: 0.9,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    drumMat.userData = { isDrum: true };
    const drum = new THREE.Mesh(drumGeo, drumMat);
    drum.castShadow = true;
    g.add(drum);

    // Piston (one end)
    const pistonGeo = new THREE.RingGeometry(ir + 0.02, or - 0.02, 48);
    const pistonMat = new THREE.MeshStandardMaterial({
        color: 0x808080, metalness: 0.05, roughness: 0.9, side: THREE.DoubleSide,
    });
    pistonMat.userData = { isDrum: false, isSteel: true };
    const piston = new THREE.Mesh(pistonGeo, pistonMat);
    piston.rotation.y = Math.PI / 2;
    piston.position.x = -length / 2 + 0.02;
    g.add(piston);

    return g;
}

function mat(color, opts = {}) {
    const trans = opts.transparent ?? false;
    return new THREE.MeshStandardMaterial({
        color,
        metalness: opts.metalness ?? 0.1,
        roughness: opts.roughness ?? 0.85,
        transparent: trans,
        opacity: opts.opacity ?? 1,
        side: trans ? THREE.DoubleSide : THREE.FrontSide,
        depthWrite: !trans,
        flatShading: false,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD TRANSMISSION — axis along X, engine side = -X, output = +X
// ─────────────────────────────────────────────────────────────────────────────

const root = new THREE.Group();
scene.add(root);

const housingGrp = new THREE.Group();
const shaftGrp = new THREE.Group();
const gearGrp = new THREE.Group();
const clutchGrp = new THREE.Group();
root.add(housingGrp, shaftGrp, gearGrp, clutchGrp);

// Module (tooth size) — chosen so pitchR = module*teeth/2 gives nice sizes
const M = 0.05;  // gear module

// Face widths
const FW = 0.9;
const GAP = 0.45;
const totalLen = 4 * FW + 3 * GAP; // ~4.95

// X positions of each gear set center
const gsX = [];
{
    const start = -totalLen / 2 + FW / 2;
    for (let i = 0; i < 4; i++) gsX.push(start + i * (FW + GAP));
}

const parts = {
    suns: [], rings: [], carriers: [], planets: [],
    clutches: {},
    inputShaft: null, outputShaft: null,
};

// ── Gear Sets ────────────────────────────────────────────────────────────────

GS_SPEC.forEach((spec, idx) => {
    const x = gsX[idx];
    const sunPitchR = (M * spec.sun) / 2;
    const ringPitchR = (M * spec.ring) / 2;
    const planetTeeth = (spec.ring - spec.sun) / 2;
    const planetPitchR = (M * planetTeeth) / 2;
    const planetOrbitR = sunPitchR + planetPitchR;

    // Sun
    const sunGeo = makeExternalGear(M, spec.sun, FW * 0.82, 0.18);
    const sunMesh = new THREE.Mesh(sunGeo, mat(PAL.sun, { metalness: 0.05, roughness: 0.85 }));
    sunMesh.position.x = x;
    sunMesh.castShadow = true;
    sunMesh.receiveShadow = true;
    gearGrp.add(sunMesh);
    parts.suns.push({ mesh: sunMesh, idx, teeth: spec.sun });

    // Ring
    const ringOuterR = ringPitchR + M * 1.8;
    const ringGeo = makeInternalGear(M, spec.ring, FW * 0.88, ringOuterR);
    const ringMesh = new THREE.Mesh(ringGeo, mat(PAL.ring, { metalness: 0.05, roughness: 0.85, transparent: true, opacity: 0.78 }));
    ringMesh.position.x = x;
    ringMesh.castShadow = true;
    ringMesh.receiveShadow = true;
    gearGrp.add(ringMesh);
    parts.rings.push({ mesh: ringMesh, idx, teeth: spec.ring });

    // Carrier
    const carrier = makeCarrier(0.2, planetOrbitR + planetPitchR * 0.45, FW * 0.9, 4);
    carrier.position.x = x;
    gearGrp.add(carrier);
    parts.carriers.push({ mesh: carrier, idx });

    // Planets (4 per set)
    const nP = 4;
    for (let p = 0; p < nP; p++) {
        const a = (p / nP) * Math.PI * 2;
        const pGeo = makeExternalGear(M, planetTeeth, FW * 0.75, 0.06);
        const pMesh = new THREE.Mesh(pGeo, mat(PAL.planet, { metalness: 0.05, roughness: 0.85 }));
        pMesh.position.set(x, Math.cos(a) * planetOrbitR, Math.sin(a) * planetOrbitR);
        pMesh.castShadow = true;
        gearGrp.add(pMesh);
        parts.planets.push({ mesh: pMesh, idx, angle: a, orbitR: planetOrbitR, baseX: x, pTeeth: planetTeeth });

        // Pin shaft
        const pinGeo = makeTube(0, 0.045, FW * 0.9, 12);
        const pin = new THREE.Mesh(pinGeo, mat(0x606068, { metalness: 0.05, roughness: 0.9 }));
        pin.position.set(x, Math.cos(a) * planetOrbitR, Math.sin(a) * planetOrbitR);
        gearGrp.add(pin);
    }
});

// ── Torque Drums — cylindrical shells that carry rotation between gear sets ──
// In a real transmission, these drums wrap around gear elements and are what
// the clutches physically grab onto. They conduct torque between gear sets.

parts.drums = [];

// Drum colors per connection (so user can visually trace which drum goes where)
const DRUM_STYLES = [
    { color: 0xc09940, label: 'Sun shaft drum (GS1↔GS2 sun)' },       // gold
    { color: 0x5588aa, label: 'GS1 carrier ↔ GS4 ring drum' },        // blue
    { color: 0x7a6699, label: 'GS2 ring ↔ GS3 sun drum' },            // purple
    { color: 0x558866, label: 'GS3 ring ↔ GS4 sun drum' },            // teal
    { color: 0xaa6644, label: 'GS4 carrier → output drum' },           // brown
];

function addDrum(innerR, outerR, xStart, xEnd, color, labelText) {
    const len = Math.abs(xEnd - xStart);
    const xMid = (xStart + xEnd) / 2;

    // Everything in one group so it all rotates together
    const grp = new THREE.Group();
    grp.position.x = xMid;

    const geo = makeTube(innerR, outerR, len);
    const drumMat = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.05,
        roughness: 0.85,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, drumMat);
    mesh.renderOrder = 1;
    grp.add(mesh);

    // Wide bold stripes on drum so rotation is unmissable
    const nStripes = 3;
    for (let i = 0; i < nStripes; i++) {
        const a = (i / nStripes) * Math.PI * 2;
        // Make stripes much wider and thicker
        const sGeo = new THREE.BoxGeometry(len * 0.96, outerR * 0.25, 0.04);
        const darkerColor = new THREE.Color(color).multiplyScalar(0.3);
        const sMat = new THREE.MeshStandardMaterial({
            color: darkerColor, metalness: 0, roughness: 1,
        });
        const stripe = new THREE.Mesh(sGeo, sMat);
        stripe.position.set(0, Math.cos(a) * (outerR + 0.02), Math.sin(a) * (outerR + 0.02));
        stripe.rotation.x = a;
        grp.add(stripe);
    }

    // End flanges
    const halfLen = len / 2;
    [-halfLen, halfLen].forEach(xOff => {
        const flangeGeo = new THREE.RingGeometry(innerR, outerR, 32);
        const flange = new THREE.Mesh(flangeGeo, drumMat.clone());
        flange.rotation.y = Math.PI / 2;
        flange.position.x = xOff;
        flange.material.opacity = 0.5;
        grp.add(flange);
    });

    gearGrp.add(grp);
    return { group: grp, drumMat, innerR, outerR, xMid, len };
}

// Sun shaft drum: wraps around GS1 & GS2 sun gears (this is what Brake A grabs)
const sunR = GS_SPEC[0].sun * M / 2;
const drum_sunShaft = addDrum(sunR + M * 1.2, sunR + M * 1.2 + 0.08,
    gsX[0] - FW * 0.5, gsX[1] + FW * 0.5, DRUM_STYLES[0].color);
parts.drums.push({ group: drum_sunShaft.group, speedKey: 'gs1_sun', type: 'drum', drumMat: drum_sunShaft.drumMat });

// GS1 carrier → GS4 ring drum
const carrierR = (sunR + GS_SPEC[0].ring * M / 2) / 2;
const drum_gs1c_gs4r = addDrum(carrierR + 0.12, carrierR + 0.2,
    gsX[0] - FW * 0.3, gsX[3] + FW * 0.3, DRUM_STYLES[1].color);
parts.drums.push({ group: drum_gs1c_gs4r.group, speedKey: 'gs1_carrier', type: 'drum', drumMat: drum_gs1c_gs4r.drumMat });

// GS2 ring → GS3 sun drum
const gs2ringR = GS_SPEC[1].ring * M / 2;
const drum_gs2r_gs3s = addDrum(gs2ringR + M * 2 + 0.05, gs2ringR + M * 2 + 0.13,
    gsX[1] - FW * 0.2, gsX[2] + FW * 0.2, DRUM_STYLES[2].color);
parts.drums.push({ group: drum_gs2r_gs3s.group, speedKey: 'gs2_ring', type: 'drum', drumMat: drum_gs2r_gs3s.drumMat });

// GS3 ring → GS4 sun drum
const gs3ringR = GS_SPEC[2].ring * M / 2;
const drum_gs3r_gs4s = addDrum(gs3ringR + M * 2 + 0.05, gs3ringR + M * 2 + 0.13,
    gsX[2] - FW * 0.2, gsX[3] + FW * 0.2, DRUM_STYLES[3].color);
parts.drums.push({ group: drum_gs3r_gs4s.group, speedKey: 'gs3_ring', type: 'drum', drumMat: drum_gs3r_gs4s.drumMat });

// GS4 carrier → output drum
const gs4carrierR = (GS_SPEC[3].sun * M / 2 + GS_SPEC[3].ring * M / 2) / 2;
const drum_output = addDrum(gs4carrierR + 0.1, gs4carrierR + 0.18,
    gsX[3] - FW * 0.3, gsX[3] + FW + 0.5, DRUM_STYLES[4].color);
parts.drums.push({ group: drum_output.group, speedKey: 'gs4_carrier', type: 'drum', drumMat: drum_output.drumMat });

// ── Shafts ───────────────────────────────────────────────────────────────────

// Input shaft — bold yellow/dark stripes, extends from TC to past GS4
const inpShaftLen = totalLen + 4.5;
const inpShaft = makeVisibleShaft(0.16, inpShaftLen, 4, 0xd4a830, 0x665520);
inpShaft.position.x = (gsX[0] + gsX[3]) / 2 - 1.5;
shaftGrp.add(inpShaft);
parts.inputShaft = inpShaft;

// Output shaft — bold green/dark stripes
const outShaft = makeVisibleShaft(0.22, 2.5, 4, 0x6aaa45, 0x2d5520);
outShaft.position.x = gsX[3] + 2;
shaftGrp.add(outShaft);
parts.outputShaft = outShaft;

// Interconnecting concentric shafts (these are hollow, keep as tubes but add stripe)
function makeConnShaft(ir, or, length, x) {
    const g = new THREE.Group();
    const tubeGeo = makeTube(ir, or, length);
    const tubeMesh = new THREE.Mesh(tubeGeo, mat(PAL.connShaft, { transparent: true, opacity: 0.35 }));
    g.add(tubeMesh);
    // Bold stripes on outside so rotation is visible
    const nStripes = 4;
    for (let i = 0; i < nStripes; i++) {
        const a = (i / nStripes) * Math.PI * 2;
        const stripeGeo = new THREE.BoxGeometry(length * 0.98, 0.04, (or - ir) + 0.04);
        const stripeMesh = new THREE.Mesh(stripeGeo, new THREE.MeshStandardMaterial({
            color: 0x333333, metalness: 0.05, roughness: 0.9,
        }));
        stripeMesh.position.set(0, Math.cos(a) * ((ir + or) / 2), Math.sin(a) * ((ir + or) / 2));
        stripeMesh.rotation.x = a;
        g.add(stripeMesh);
    }
    g.position.x = x;
    return g;
}

// GS1 carrier ↔ GS4 ring
const c1 = makeConnShaft(0.26, 0.32, Math.abs(gsX[3] - gsX[0]) + FW, (gsX[0] + gsX[3]) / 2);
shaftGrp.add(c1);

// GS2 ring ↔ GS3 sun
const c2 = makeConnShaft(0.38, 0.43, GAP + FW * 0.6, (gsX[1] + gsX[2]) / 2);
shaftGrp.add(c2);

// GS3 ring ↔ GS4 sun
const c3 = makeConnShaft(0.46, 0.50, GAP + FW * 0.3, (gsX[2] + gsX[3]) / 2 + 0.15);
shaftGrp.add(c3);

// ── Clutches & Brakes ────────────────────────────────────────────────────────

const cSpecs = {
    A: { ir: 0.2,  or: 0.52,  len: 0.55, nDiscs: 7,  x: gsX[0] - FW * 0.85 },
    B: { ir: GS_SPEC[0].ring * M / 2 + M * 1.8, or: GS_SPEC[0].ring * M / 2 + M * 1.8 + 0.32, len: 0.6, nDiscs: 8, x: gsX[0] },
    C: { ir: 0.55, or: 1.0,   len: 0.5,  nDiscs: 6,  x: (gsX[2] + gsX[3]) / 2 },
    D: { ir: 0.28, or: 0.72,  len: 0.5,  nDiscs: 6,  x: gsX[3] + FW * 0.72 },
    E: { ir: GS_SPEC[2].sun * M / 2 + M * 0.5, or: GS_SPEC[2].ring * M / 2 - M * 0.5, len: 0.45, nDiscs: 6, x: gsX[2] + FW * 0.6 },
};

Object.entries(cSpecs).forEach(([name, s]) => {
    const pack = makeClutchPack(s.ir, s.or, s.len, s.nDiscs);
    pack.position.x = s.x;
    clutchGrp.add(pack);
    parts.clutches[name] = pack;
});

// ── Clutch connection lines — show what each clutch/brake connects ───────────
// Brake A: GS1/GS2 sun → housing case
// Brake B: GS1 ring → housing case
// Clutch C: input shaft → GS4 sun
// Clutch D: GS3 carrier → GS4 carrier (output)
// Clutch E: GS3 sun → GS3 ring (locks GS3)

const connLineMat = new THREE.MeshStandardMaterial({
    color: 0xcc5520, metalness: 0, roughness: 1,
    transparent: true, opacity: 0.6, depthWrite: false,
});
const connLineBrakeMat = new THREE.MeshStandardMaterial({
    color: 0x888888, metalness: 0, roughness: 1,
    transparent: true, opacity: 0.5, depthWrite: false,
});

function addConnection(from, to, isBrake) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const curve = new THREE.LineCurve3(start, end);
    const geo = new THREE.TubeGeometry(curve, 1, 0.03, 6, false);
    const line = new THREE.Mesh(geo, isBrake ? connLineBrakeMat.clone() : connLineMat.clone());
    line.userData.isConnLine = true;
    clutchGrp.add(line);
    return line;
}

parts.connLines = {};

// Brake A connects to GS1 sun & GS2 sun on one side, case (y offset up) on other
const aX = cSpecs.A.x;
parts.connLines.A = [
    addConnection([aX, 0.5, 0], [gsX[0], 0.5, 0], true),    // → GS1 sun area
    addConnection([aX, -0.5, 0], [gsX[1], -0.5, 0], true),   // → GS2 sun area
    addConnection([aX, 0, 0.6], [aX, 0, 3.5], true), // → case (grounded)
];

// Brake B connects GS1 ring to case
const bX = cSpecs.B.x;
const bR = cSpecs.B.or;
parts.connLines.B = [
    addConnection([bX, bR + 0.1, 0], [bX, 3.5, 0], true), // → case
];

// Clutch C connects input shaft to GS4 sun
const cX = cSpecs.C.x;
parts.connLines.C = [
    addConnection([cX - 0.3, 0, 0], [gsX[1], 0, 0], false),   // from input shaft
    addConnection([cX + 0.3, 0, 0], [gsX[3], 0, 0], false),   // to GS4 sun
];

// Clutch D connects GS3 carrier to output (GS4 carrier)
const dX = cSpecs.D.x;
parts.connLines.D = [
    addConnection([dX - 0.3, 0, 0], [gsX[2], 0, 0], false),   // from GS3 carrier
    addConnection([dX + 0.3, 0, 0], [gsX[3] + 1, 0, 0], false), // to output
];

// Clutch E connects GS3 sun to GS3 ring (locks them together)
const eX = cSpecs.E.x;
const gs3SunR = GS_SPEC[2].sun * M / 2;
const gs3RingR = GS_SPEC[2].ring * M / 2;
parts.connLines.E = [
    addConnection([eX, gs3SunR + 0.1, 0], [eX, (gs3SunR + gs3RingR) / 2, 0], false),   // sun side
    addConnection([eX, (gs3SunR + gs3RingR) / 2, 0], [eX, gs3RingR - 0.1, 0], false),   // ring side
];

// ── Torque Converter (Hydrotransformator) ────────────────────────────────────

const tcGroup = new THREE.Group();
const tcX = gsX[0] - FW * 2.2; // engine side of GS1
const tcR = 1.8;
const tcWidth = 1.2;

// Impeller (engine side) — donut shape
const impellerGeo = new THREE.TorusGeometry(tcR * 0.6, tcR * 0.35, 16, 32);
impellerGeo.rotateY(Math.PI / 2);
const impellerMat = new THREE.MeshStandardMaterial({
    color: 0xcc8833, metalness: 0.05, roughness: 0.85,
    transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide,
});
const impeller = new THREE.Mesh(impellerGeo, impellerMat);
impeller.position.x = tcX - tcWidth * 0.2;
tcGroup.add(impeller);

// Turbine (transmission side) — slightly smaller donut
const turbineGeo = new THREE.TorusGeometry(tcR * 0.55, tcR * 0.3, 16, 32);
turbineGeo.rotateY(Math.PI / 2);
const turbineMat = new THREE.MeshStandardMaterial({
    color: 0x88aa55, metalness: 0.05, roughness: 0.85,
    transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide,
});
const turbine = new THREE.Mesh(turbineGeo, turbineMat);
turbine.position.x = tcX + tcWidth * 0.2;
tcGroup.add(turbine);

// Stator (center)
const statorGeo = new THREE.TorusGeometry(tcR * 0.3, tcR * 0.12, 12, 24);
statorGeo.rotateY(Math.PI / 2);
const statorMat = new THREE.MeshStandardMaterial({
    color: 0x888888, metalness: 0.05, roughness: 0.9,
});
const stator = new THREE.Mesh(statorGeo, statorMat);
stator.position.x = tcX;
tcGroup.add(stator);

// TC outer shell (two half-domes)
const tcShellGeo = new THREE.SphereGeometry(tcR, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
const tcShellMat = new THREE.MeshStandardMaterial({
    color: 0xbbbbbb, metalness: 0.0, roughness: 1.0,
    transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide,
});
// Engine half
const tcShell1 = new THREE.Mesh(tcShellGeo, tcShellMat);
tcShell1.rotation.z = -Math.PI / 2;
tcShell1.position.x = tcX;
tcGroup.add(tcShell1);
// Transmission half
const tcShell2 = new THREE.Mesh(tcShellGeo, tcShellMat.clone());
tcShell2.rotation.z = Math.PI / 2;
tcShell2.position.x = tcX;
tcGroup.add(tcShell2);

// Lock-up clutch disc
const lockupGeo = new THREE.RingGeometry(0.2, tcR * 0.8, 32);
const lockupMat = new THREE.MeshStandardMaterial({
    color: 0xaa6633, metalness: 0.05, roughness: 0.9, side: THREE.DoubleSide,
});
const lockup = new THREE.Mesh(lockupGeo, lockupMat);
lockup.rotation.y = Math.PI / 2;
lockup.position.x = tcX + tcWidth * 0.45;
tcGroup.add(lockup);

// Label
tcGroup.add(makeLabel('TC', new THREE.Vector3(tcX, tcR + 0.5, 0), { fontSize: 26, color: '#666' }));

gearGrp.add(tcGroup);
parts.tcImpeller = impeller;
parts.tcTurbine = turbine;

// ── Housing ──────────────────────────────────────────────────────────────────

const maxRingR = Math.max(...GS_SPEC.map(s => s.ring * M / 2 + M * 2));
const caseR = Math.max(maxRingR + 0.8, tcR + 0.3);
const caseLen = totalLen + 2;

// Main shell
const shellGeo = makeTube(caseR - 0.06, caseR, caseLen, 48);
const shellMat = mat(PAL.housing, { metalness: 0.0, roughness: 1.0, transparent: true, opacity: 0.08 });
const shell = new THREE.Mesh(shellGeo, shellMat);
shell.receiveShadow = true;
housingGrp.add(shell);

// Ribs (external stiffeners)
const ribGeo = new THREE.BoxGeometry(0.06, 0.18, caseR * 0.3);
for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rib = new THREE.Mesh(ribGeo, mat(PAL.housing, { transparent: true, opacity: 0.08 }));
    rib.position.set(0, Math.cos(a) * (caseR + 0.06), Math.sin(a) * (caseR + 0.06));
    rib.rotation.x = a;
    housingGrp.add(rib);
}

// Bell housing (engine side)
const bellGeo = new THREE.SphereGeometry(caseR, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.5);
bellGeo.rotateZ(-Math.PI / 2);
const bellMesh = new THREE.Mesh(bellGeo, mat(PAL.housing, { transparent: true, opacity: 0.08 }));
bellMesh.position.x = -caseLen / 2;
housingGrp.add(bellMesh);

// Tail
const tailR = caseR * 0.55;
const tailLen = 2;
const tailGeo = makeTube(tailR - 0.04, tailR, tailLen, 32);
const tailMesh = new THREE.Mesh(tailGeo, mat(PAL.housing, { transparent: true, opacity: 0.08 }));
tailMesh.position.x = caseLen / 2 + tailLen / 2 - 0.2;
housingGrp.add(tailMesh);

// Flange ring at tail
const flangeGeo = new THREE.RingGeometry(tailR - 0.04, caseR, 48);
const flangeMat = mat(PAL.housing, { transparent: true, opacity: 0.08 });
const flange = new THREE.Mesh(flangeGeo, flangeMat);
flange.rotation.y = Math.PI / 2;
flange.position.x = caseLen / 2 - 0.02;
housingGrp.add(flange);

// End caps
[caseLen / 2, -caseLen / 2].forEach((x, i) => {
    const capGeo = new THREE.RingGeometry(i === 0 ? tailR : 0.2, caseR, 48);
    const cap = new THREE.Mesh(capGeo, flangeMat.clone());
    cap.rotation.y = Math.PI / 2;
    cap.position.x = x;
    housingGrp.add(cap);
});

// ── Labels ───────────────────────────────────────────────────────────────────

function makeLabel(text, pos, opts = {}) {
    const { fontSize = 28, color = '#1a1a1a' } = opts;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.font = `500 ${fontSize}px "DM Mono", monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 24);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(pos);
    sprite.scale.set(1.6, 0.3, 1);
    return sprite;
}

['GS1','GS2','GS3','GS4'].forEach((name, i) => {
    const rr = GS_SPEC[i].ring * M / 2 + M * 2 + 0.5;
    gearGrp.add(makeLabel(name, new THREE.Vector3(gsX[i], rr, 0), { fontSize: 26, color: '#666' }));
});

// ─────────────────────────────────────────────────────────────────────────────
// SPEED SOLVER
// ─────────────────────────────────────────────────────────────────────────────

function solveSpeeds(gear) {
    const { ratio, engaged } = GEAR_DATA[gear];
    const out = 1 / Math.abs(ratio) * Math.sign(ratio);

    // Known: GS2 carrier = input = 1, GS4 carrier = output
    const s = { input: 1, output: out, gs2_carrier: 1, gs4_carrier: out };
    const k = GS_SPEC.map(g => g.ring / g.sun);

    if (engaged.includes('A')) { s.gs1_sun = 0; s.gs2_sun = 0; }
    if (engaged.includes('B')) { s.gs1_ring = 0; }
    if (engaged.includes('C')) { s.gs4_sun = 1; }
    if (engaged.includes('D')) { s.gs3_carrier = out; }

    // Rigid: GS3_ring = GS4_sun
    if (s.gs4_sun !== undefined) s.gs3_ring = s.gs4_sun;

    // Clutch E locks GS3
    if (engaged.includes('E')) {
        const known = s.gs3_sun ?? s.gs3_ring ?? s.gs3_carrier;
        if (known !== undefined) { s.gs3_sun = known; s.gs3_ring = known; s.gs3_carrier = known; }
    }

    // GS4: (1+k4)*Nc = Ns + k4*Nr
    if (s.gs4_sun !== undefined && s.gs4_carrier !== undefined && s.gs4_ring === undefined) {
        s.gs4_ring = ((1 + k[3]) * s.gs4_carrier - s.gs4_sun) / k[3];
    }
    if (s.gs4_ring !== undefined && s.gs4_carrier !== undefined && s.gs4_sun === undefined) {
        s.gs4_sun = (1 + k[3]) * s.gs4_carrier - k[3] * s.gs4_ring;
        s.gs3_ring = s.gs4_sun;
    }

    // Rigid: GS1_carrier = GS4_ring
    if (s.gs4_ring !== undefined) s.gs1_carrier = s.gs4_ring;

    // GS1
    if (s.gs1_carrier !== undefined && s.gs1_ring !== undefined && s.gs1_sun === undefined)
        s.gs1_sun = (1 + k[0]) * s.gs1_carrier - k[0] * s.gs1_ring;
    if (s.gs1_carrier !== undefined && s.gs1_sun !== undefined && s.gs1_ring === undefined)
        s.gs1_ring = ((1 + k[0]) * s.gs1_carrier - s.gs1_sun) / k[0];

    // GS2
    if (s.gs2_sun !== undefined && s.gs2_carrier !== undefined && s.gs2_ring === undefined)
        s.gs2_ring = ((1 + k[1]) * s.gs2_carrier - s.gs2_sun) / k[1];

    // Rigid: GS2_ring = GS3_sun
    if (s.gs2_ring !== undefined && s.gs3_sun === undefined) s.gs3_sun = s.gs2_ring;
    if (s.gs3_sun !== undefined && s.gs2_ring === undefined) {
        s.gs2_ring = s.gs3_sun;
        if (s.gs2_sun === undefined) s.gs2_sun = (1 + k[1]) * s.gs2_carrier - k[1] * s.gs2_ring;
    }

    // GS3 again
    if (engaged.includes('E')) {
        const kn = s.gs3_sun ?? s.gs3_ring ?? s.gs3_carrier;
        if (kn !== undefined) { s.gs3_sun = kn; s.gs3_ring = kn; s.gs3_carrier = kn; }
    } else {
        if (s.gs3_sun !== undefined && s.gs3_ring !== undefined && s.gs3_carrier === undefined)
            s.gs3_carrier = (s.gs3_sun + k[2] * s.gs3_ring) / (1 + k[2]);
        if (s.gs3_sun !== undefined && s.gs3_carrier !== undefined && s.gs3_ring === undefined)
            s.gs3_ring = ((1 + k[2]) * s.gs3_carrier - s.gs3_sun) / k[2];
        if (s.gs3_ring !== undefined && s.gs3_carrier !== undefined && s.gs3_sun === undefined)
            s.gs3_sun = (1 + k[2]) * s.gs3_carrier - k[2] * s.gs3_ring;
    }

    // Final back-propagation
    if (s.gs3_ring !== undefined && s.gs4_sun === undefined) {
        s.gs4_sun = s.gs3_ring;
        if (s.gs4_ring === undefined)
            s.gs4_ring = ((1 + k[3]) * s.gs4_carrier - s.gs4_sun) / k[3];
        s.gs1_carrier = s.gs4_ring;
    }
    if (s.gs1_carrier !== undefined) {
        if (s.gs1_sun === undefined && s.gs1_ring !== undefined)
            s.gs1_sun = (1 + k[0]) * s.gs1_carrier - k[0] * s.gs1_ring;
        if (s.gs1_ring === undefined && s.gs1_sun !== undefined)
            s.gs1_ring = ((1 + k[0]) * s.gs1_carrier - s.gs1_sun) / k[0];
    }
    if (s.gs2_ring === undefined && s.gs3_sun !== undefined) s.gs2_ring = s.gs3_sun;
    if (s.gs2_sun === undefined && s.gs2_ring !== undefined)
        s.gs2_sun = (1 + k[1]) * s.gs2_carrier - k[1] * s.gs2_ring;

    // Default unknowns to 0
    for (let i = 1; i <= 4; i++)
        ['sun','ring','carrier'].forEach(p => { if (s[`gs${i}_${p}`] === undefined) s[`gs${i}_${p}`] = 0; });

    return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

let currentGear = '1';
let targetSpeeds = solveSpeeds('1');
let curSpeeds = { ...targetSpeeds };
let animSpeed = 1.5;

// ─────────────────────────────────────────────────────────────────────────────
// POWER FLOW ARROWS — animated dashed tubes showing torque path
// ─────────────────────────────────────────────────────────────────────────────

// Flow arrows live in a SEPARATE scene so they render on top of the
// post-processed main scene (SAO composer ignores renderOrder/depthTest)
const flowScene = new THREE.Scene();
const flowGroup = new THREE.Group();
flowScene.add(flowGroup);

// Power flow paths per gear: arrays of [x,y,z] waypoints forming a contiguous polyline.
// The offset (y) shows which "layer" the torque passes through.
const h = 2.0; // vertical offset for path routing above/below center
const FLOW_POINTS = {
    '1': [[-6,0,0], [gsX[1],0,0], [gsX[1],h,0], [gsX[0],h,0], [gsX[0],h*1.2,0], [gsX[3],h*1.2,0], [gsX[3],0,0], [6,0,0]],
    '2': [[-6,0,0], [gsX[1],0,0], [gsX[1],h,0], [gsX[2],h,0], [gsX[2],0,0], [gsX[3],0,0], [6,0,0]],
    '3': [[-6,0,0], [gsX[1],0,0], [gsX[1],h,0], [gsX[2],h,0], [gsX[3],h,0], [gsX[3],0,0], [6,0,0]],
    '4': [[-6,0,0], [gsX[1],0,0], [gsX[2],0,0], [gsX[3],0,0], [6,0,0]],
    '5': [[-6,0,0], [gsX[1],0,0], [gsX[2],0,0], [gsX[2],-h,0], [gsX[3],-h,0], [gsX[3],0,0], [6,0,0]],
    '6': [[-6,0,0], [6,0,0]],
    '7': [[-6,0,0], [gsX[1],0,0], [gsX[1],-h,0], [gsX[2],-h,0], [gsX[3],-h,0], [gsX[3],0,0], [6,0,0]],
    '8': [[-6,0,0], [gsX[1],0,0], [gsX[1],-h,0], [gsX[3],-h,0], [gsX[3],0,0], [6,0,0]],
    'R': [[-6,0,0], [gsX[1],0,0], [gsX[0],0,0], [gsX[0],h,0], [gsX[3],h,0], [gsX[3],0,0], [6,0,0]],
};

// Build flow arrow meshes
let flowMeshes = [];
const FLOW_COLOR = 0xe85d20;

function buildFlowArrows(gear) {
    flowMeshes.forEach(m => { flowGroup.remove(m); m.geometry?.dispose(); m.material?.dispose(); });
    flowMeshes = [];

    const pts = FLOW_POINTS[gear];
    if (!pts || pts.length < 2) return;

    const totalSegs = pts.length - 1;

    for (let i = 0; i < totalSegs; i++) {
        const start = new THREE.Vector3(...pts[i]);
        const end = new THREE.Vector3(...pts[i + 1]);
        const dir = end.clone().sub(start);
        if (dir.length() < 0.01) continue;

        // Opaque tube
        const curve = new THREE.LineCurve3(start, end);
        const tubeGeo = new THREE.TubeGeometry(curve, 1, 0.1, 8, false);
        const tubeMat = new THREE.MeshBasicMaterial({ color: FLOW_COLOR });
        tubeMat.userData = { segIndex: i, totalSegs };
        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        flowGroup.add(tube);
        flowMeshes.push(tube);

        // Arrowhead at end of each segment
        const arrowGeo = new THREE.ConeGeometry(0.18, 0.3, 8);
        const arrowMat = new THREE.MeshBasicMaterial({ color: FLOW_COLOR });
        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        const quat = new THREE.Quaternion();
        quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        arrow.quaternion.copy(quat);
        arrow.position.copy(end);
        flowGroup.add(arrow);
        flowMeshes.push(arrow);
    }
}

// Which gear sets are "active" (in the power path) per gear
const GS_ACTIVE = {
    'R': [0,1,2,3], '1': [0,1,3], '2': [0,1,2,3], '3': [1,2,3],
    '4': [1,2,3], '5': [2,3], '6': [0,1,2,3], '7': [0,1,2,3], '8': [0,1,2,3],
};

// Colors for active vs inactive parts
const ACTIVE_COLORS = {
    sun:     0xd4a820,
    ring:    0x5580b0,
    planet:  0x7099bb,
    carrier: 0x6088a0,
};
const INACTIVE_GRAY = 0xcccccc;

function setGear(gear) {
    currentGear = gear;
    targetSpeeds = solveSpeeds(gear);
    const d = GEAR_DATA[gear];
    const activeGS = GS_ACTIVE[gear];

    // UI
    document.querySelectorAll('.gear-btn').forEach(b => b.classList.toggle('active', b.dataset.gear === gear));
    document.getElementById('current-gear').textContent = d.name;
    document.getElementById('current-ratio').textContent = d.ratio.toFixed(3);
    document.querySelectorAll('.el-card').forEach(card => {
        card.classList.toggle('engaged', d.engaged.includes(card.dataset.el));
    });

    // Rebuild flow arrows
    buildFlowArrows(gear);

    // ── Helper: all dynamic materials stay transparent with depthWrite OFF
    //    This prevents view-angle-dependent disappearing of geometry
    function setM(m, color, opacity, emHex, emInt) {
        m.color.setHex(color);
        m.transparent = true;
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
        m.opacity = opacity;
        m.emissive.setHex(emHex);
        m.emissiveIntensity = emInt;
        m.needsUpdate = true;
    }

    // ── Gear sets: active = colored, inactive = gray ghost
    parts.suns.forEach(({ mesh, idx }) => {
        const on = activeGS.includes(idx);
        setM(mesh.material,
            on ? ACTIVE_COLORS.sun : INACTIVE_GRAY,
            on ? 0.95 : 0.15,
            on ? 0x1a0800 : 0x000000,
            on ? 0.2 : 0);
        mesh.renderOrder = on ? 2 : 0;
    });

    parts.rings.forEach(({ mesh, idx }) => {
        const on = activeGS.includes(idx);
        setM(mesh.material,
            on ? ACTIVE_COLORS.ring : INACTIVE_GRAY,
            on ? 0.78 : 0.1,
            on ? 0x001122 : 0x000000,
            on ? 0.15 : 0);
        mesh.renderOrder = on ? 1 : 0;
    });

    parts.carriers.forEach(({ mesh, idx }) => {
        const on = activeGS.includes(idx);
        mesh.traverse(ch => {
            if (!ch.isMesh) return;
            setM(ch.material,
                on ? ACTIVE_COLORS.carrier : INACTIVE_GRAY,
                on ? 0.92 : 0.15,
                0x000000, 0);
            ch.renderOrder = on ? 2 : 0;
        });
    });

    parts.planets.forEach(p => {
        const on = activeGS.includes(p.idx);
        setM(p.mesh.material,
            on ? ACTIVE_COLORS.planet : INACTIVE_GRAY,
            on ? 0.95 : 0.15,
            0x000000, 0);
        p.mesh.renderOrder = on ? 2 : 0;
    });

    // ── Clutches: engaged = vivid orange, disengaged = nearly invisible
    ['A','B','C','D','E'].forEach(el => {
        const on = d.engaged.includes(el);
        const grp = parts.clutches[el];
        grp.traverse(ch => {
            if (!ch.isMesh) return;
            const m = ch.material;
            if (m.userData?.isDrum) {
                setM(m,
                    on ? PAL.drumOn : 0xbbbbbb,
                    on ? 0.65 : 0.04,
                    on ? PAL.engagedEmit : 0x000000,
                    on ? 0.7 : 0);
            } else {
                setM(m,
                    on ? (m.userData?.isSteel ? 0xee8844 : 0xdd5522) : INACTIVE_GRAY,
                    on ? 0.95 : 0.06,
                    on ? 0x551800 : 0x000000,
                    on ? 0.4 : 0);
            }
            ch.renderOrder = on ? 3 : 0;
        });
    });

    // Input/output shafts — always vivid
    parts.inputShaft.traverse(ch => {
        if (!ch.isMesh) return;
        if (ch.material.color.getHex() !== 0x222222 && ch.material.color.getHex() !== 0x444450) {
            ch.material.color.setHex(PAL.inputShaft);
            ch.material.emissive.setHex(0x1a0a00);
            ch.material.emissiveIntensity = 0.2;
        }
    });
    parts.outputShaft.traverse(ch => {
        if (!ch.isMesh) return;
        if (ch.material.color.getHex() !== 0x222222 && ch.material.color.getHex() !== 0x444450) {
            ch.material.color.setHex(PAL.outputShaft);
            ch.material.emissive.setHex(0x0a1a00);
            ch.material.emissiveIntensity = 0.2;
        }
    });

    // Connection lines — engaged = visible orange, disengaged = invisible
    ['A','B','C','D','E'].forEach(el => {
        const on = d.engaged.includes(el);
        const lines = parts.connLines[el];
        if (!lines) return;
        lines.forEach(line => {
            line.material.opacity = on ? 0.8 : 0.0;
            line.material.color.setHex(on ? 0xdd5520 : 0x999999);
            line.material.needsUpdate = true;
            line.visible = on;
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATION
// ─────────────────────────────────────────────────────────────────────────────

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();
    const lf = 1 - Math.exp(-4 * dt);

    for (const k in targetSpeeds) curSpeeds[k] = curSpeeds[k] + (targetSpeeds[k] - curSpeeds[k]) * lf;

    const V = animSpeed * 2.0;

    // Suns
    parts.suns.forEach(({ mesh, idx }) => {
        mesh.rotation.x += (curSpeeds[`gs${idx + 1}_sun`] || 0) * V * dt;
    });

    // Rings
    parts.rings.forEach(({ mesh, idx }) => {
        mesh.rotation.x += (curSpeeds[`gs${idx + 1}_ring`] || 0) * V * dt;
    });

    // Carriers
    parts.carriers.forEach(({ mesh, idx }) => {
        mesh.rotation.x += (curSpeeds[`gs${idx + 1}_carrier`] || 0) * V * dt;
    });

    // Planets — orbit + self spin
    parts.planets.forEach(p => {
        const cs = curSpeeds[`gs${p.idx + 1}_carrier`] || 0;
        const ss = curSpeeds[`gs${p.idx + 1}_sun`] || 0;
        p.angle += cs * V * dt;
        p.mesh.position.y = Math.cos(p.angle) * p.orbitR;
        p.mesh.position.z = Math.sin(p.angle) * p.orbitR;
        const sunT = GS_SPEC[p.idx].sun;
        p.mesh.rotation.x += (ss - cs) * V * dt * (sunT / p.pTeeth);
    });

    // Torque converter — impeller at input speed, turbine slightly slower (slip)
    if (parts.tcImpeller) parts.tcImpeller.rotation.x += (curSpeeds.input || 0) * V * dt;
    if (parts.tcTurbine) parts.tcTurbine.rotation.x += (curSpeeds.input || 0) * V * dt * 0.92;

    // Drums — rotate the whole group (shell + stripes + flanges together)
    parts.drums.forEach(d => {
        if (d.speedKey && d.group) {
            d.group.rotation.x += (curSpeeds[d.speedKey] || 0) * V * dt;
        }
    });

    // Shafts
    const inpRot = (curSpeeds.input || 0) * V * dt;
    const outRot = (curSpeeds.output || 0) * V * dt;
    parts.inputShaft.children.forEach(ch => { ch.rotation.x += inpRot; });
    parts.outputShaft.children.forEach(ch => { ch.rotation.x += outRot; });

    // Connecting shafts rotation
    const c1Speed = curSpeeds.gs1_carrier || 0;
    c1.children.forEach(ch => { ch.rotation.x += c1Speed * V * dt; });
    const c2Speed = curSpeeds.gs2_ring || 0;
    c2.children.forEach(ch => { ch.rotation.x += c2Speed * V * dt; });
    const c3Speed = curSpeeds.gs3_ring || 0;
    c3.children.forEach(ch => { ch.rotation.x += c3Speed * V * dt; });

    // Animated flow pulse — traveling bright wave along the path
    const pulsePeriod = 1.5;
    const phase = (t % pulsePeriod) / pulsePeriod;
    const baseCol = new THREE.Color(FLOW_COLOR);
    const brightCol = new THREE.Color(0xffaa44);
    flowMeshes.forEach(m => {
        if (m.material?.userData?.segIndex !== undefined) {
            const seg = m.material.userData;
            const segPhase = seg.segIndex / seg.totalSegs;
            const dist = Math.abs(phase - segPhase);
            const wave = Math.max(0, 1 - dist * 3);
            m.material.color.copy(baseCol).lerp(brightCol, wave);
        }
    });

    // Engaged clutch pulse
    const { engaged } = GEAR_DATA[currentGear];
    ['A','B','C','D','E'].forEach(el => {
        const g = parts.clutches[el];
        if (engaged.includes(el)) {
            const p = 1 + Math.sin(t * 4) * 0.02;
            g.scale.set(1, p, p);
        } else {
            g.scale.set(1, 1, 1);
        }
    });

    controls.update();
    composer.render();

    // Render flow arrows on top — clear only depth, keep color from composer
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(flowScene, camera);
    renderer.autoClear = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI WIRING
// ─────────────────────────────────────────────────────────────────────────────

document.querySelectorAll('.gear-btn').forEach(b =>
    b.addEventListener('click', () => setGear(b.dataset.gear)));

document.getElementById('show-housing').addEventListener('change', e => housingGrp.visible = e.target.checked);
document.getElementById('show-shafts').addEventListener('change', e => shaftGrp.visible = e.target.checked);
document.getElementById('show-gears').addEventListener('change', e => gearGrp.visible = e.target.checked);
document.getElementById('show-clutches').addEventListener('change', e => clutchGrp.visible = e.target.checked);
document.getElementById('show-flow').addEventListener('change', e => flowGroup.visible = e.target.checked);

document.getElementById('housing-opacity').addEventListener('input', e => {
    const v = e.target.value / 100;
    document.getElementById('opacity-val').textContent = `${e.target.value}%`;
    housingGrp.traverse(ch => { if (ch.isMesh && ch.material.transparent) ch.material.opacity = v; });
});

document.getElementById('anim-speed').addEventListener('input', e => {
    animSpeed = e.target.value / 100;
    document.getElementById('speed-val').textContent = `${e.target.value}%`;
});

document.getElementById('drum-opacity').addEventListener('input', e => {
    const v = e.target.value / 100;
    document.getElementById('drum-opacity-val').textContent = `${e.target.value}%`;
    parts.drums.forEach(d => {
        if (d.type === 'drum' && d.drumMat) {
            d.drumMat.opacity = v;
            d.drumMat.needsUpdate = true;
        }
    });
});

window.addEventListener('keydown', e => {
    if (e.key >= '1' && e.key <= '8') setGear(e.key);
    if (e.key.toLowerCase() === 'r') setGear('R');
});

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
});

// ── GO ───────────────────────────────────────────────────────────────────────

setGear('1');
animate();
