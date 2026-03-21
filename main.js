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
camera.position.set(3, 5, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
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
controls.enableRotate = false; // rotation handled by modelPivot drag
controls.enablePan = true;
controls.zoomToCursor = true;

// Arcball-style drag — rotate modelPivot around world axes, floor stays fixed
{
    let dragging = false, prevX = 0, prevY = 0;
    const canvas = renderer.domElement;
    const _qY = new THREE.Quaternion();
    const _qX = new THREE.Quaternion();
    const _axisY = new THREE.Vector3(0, 1, 0);
    const _axisX = new THREE.Vector3();

    canvas.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        if (e.target !== canvas) return;
        dragging = true;
        prevX = e.clientX;
        prevY = e.clientY;
    });
    window.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dx = e.clientX - prevX;
        const dy = e.clientY - prevY;
        prevX = e.clientX;
        prevY = e.clientY;
        // Horizontal drag → rotate around world Y
        _qY.setFromAxisAngle(_axisY, dx * 0.005);
        // Vertical drag → rotate around camera's right vector (world space)
        _axisX.set(1, 0, 0).applyQuaternion(camera.quaternion);
        _qX.setFromAxisAngle(_axisX, dy * 0.005);
        modelPivot.quaternion.premultiply(_qY).premultiply(_qX);
    });
    window.addEventListener('pointerup', () => { dragging = false; });
}

// ─────────────────────────────────────────────────────────────────────────────
// LIGHTING — soft, technical, from all angles
// ─────────────────────────────────────────────────────────────────────────────

scene.add(new THREE.HemisphereLight(0xdddcda, 0x88857e, 0.7));

const key = new THREE.DirectionalLight(0xfffaf0, 1.6);
key.position.set(10, 18, 14);
scene.add(key);

const fill = new THREE.DirectionalLight(0xd0d8e8, 0.5);
fill.position.set(-10, 6, -8);
scene.add(fill);

const back = new THREE.DirectionalLight(0xffe8d0, 0.3);
back.position.set(-4, -8, 12);
scene.add(back);

// ── Floor + shadow ───────────────────────────────────────────────────────────
// Large visible floor plane beneath the gearbox so it looks like it sits on a surface.
const FLOOR_Y = -5;
const floorGeo = new THREE.PlaneGeometry(200, 200);
const floorMat = new THREE.MeshBasicMaterial({ color: 0xf0efed });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = FLOOR_Y;
floor.renderOrder = -2;
scene.add(floor);

// Dark concentrated shadow on the floor
{
    const sz = 512;
    const c = document.createElement('canvas');
    c.width = sz; c.height = sz;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(sz/2, sz/2, 0, sz/2, sz/2, sz * 0.42);
    g.addColorStop(0, 'rgba(0,0,0,0.80)');
    g.addColorStop(0.2, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.30)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, sz, sz);
    const tex = new THREE.CanvasTexture(c);
    const blobGeo = new THREE.PlaneGeometry(24, 12);
    const blobMat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = FLOOR_Y + 0.01;
    blob.renderOrder = -1;
    scene.add(blob);
}

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
 * Create a detailed external spur gear profile using correct involute math.
 * Returns an ExtrudeGeometry along X axis.
 */
function makeExternalGear(module, teeth, faceWidth, boreR) {
    const m = module;
    const z = teeth;
    const rp = (m * z) / 2;           // pitch radius
    const ra = rp + 0.7 * m;          // addendum (tip) — reduced for clearance
    const rd = rp - 1.25 * m;         // dedendum (root)
    const phi = 20 * Math.PI / 180;   // pressure angle
    const rb = rp * Math.cos(phi);    // base circle

    // Involute function: inv(α) = tan(α) - α
    function inv(alpha) { return Math.tan(alpha) - alpha; }

    // Angular half-tooth-thickness at any radius r — reduced by backlash factor
    const backlash = 0.25;            // fraction of tooth pitch for clearance
    const halfThickPitch = Math.PI / (2 * z) * (1 - backlash);
    const invPhi = inv(phi);

    function halfThickAt(r) {
        if (r <= rb) return halfThickPitch + invPhi;
        const alpha = Math.acos(rb / r);
        return halfThickPitch + invPhi - inv(alpha);
    }

    const shape = new THREE.Shape();
    const ptsPerFlank = 14;
    const toothAngle = (2 * Math.PI) / z;

    for (let i = 0; i < z; i++) {
        const tc = i * toothAngle; // tooth center angle

        // Left flank: root → tip
        for (let j = 0; j <= ptsPerFlank; j++) {
            const frac = j / ptsPerFlank;
            const r = rd + (ra - rd) * frac;
            const angle = tc - halfThickAt(r);
            const y = Math.cos(angle) * r;
            const zz = Math.sin(angle) * r;
            if (i === 0 && j === 0) shape.moveTo(y, zz);
            else shape.lineTo(y, zz);
        }

        // Tip arc
        const htTip = halfThickAt(ra);
        const tipSteps = 3;
        for (let s = 1; s <= tipSteps; s++) {
            const a = tc - htTip + 2 * htTip * (s / tipSteps);
            shape.lineTo(Math.cos(a) * ra, Math.sin(a) * ra);
        }

        // Right flank: tip → root
        for (let j = ptsPerFlank; j >= 0; j--) {
            const frac = j / ptsPerFlank;
            const r = rd + (ra - rd) * frac;
            const angle = tc + halfThickAt(r);
            shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }

        // Root arc to next tooth
        const rootEnd = tc + halfThickAt(rd);
        if (i < z - 1) {
            const nextRootStart = (i + 1) * toothAngle - halfThickAt(rd);
            const steps = 4;
            for (let s = 1; s <= steps; s++) {
                const a = rootEnd + (nextRootStart - rootEnd) * (s / steps);
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
 * Internal (ring) gear: teeth on inside, smooth outside.
 * Uses correct involute math (internal gear formula).
 */
function makeInternalGear(module, teeth, faceWidth, outerR) {
    const m = module;
    const z = teeth;
    const rp = (m * z) / 2;
    const ra = rp - 0.7 * m;         // addendum (tip, inward) — reduced for clearance
    const rd = rp + 0.8 * m;         // dedendum (root, outward)
    const phi = 20 * Math.PI / 180;
    const rb = rp * Math.cos(phi);

    function inv(alpha) { return Math.tan(alpha) - alpha; }
    const invPhi = inv(phi);

    // Internal gear tooth half-thickness — reduced by backlash factor
    const backlash = 0.25;
    const halfThickBase = Math.PI / (2 * z) * (1 - backlash);
    function halfThickAt(r) {
        if (r <= rb) return halfThickBase - invPhi;
        const alpha = Math.acos(rb / r);
        return halfThickBase - invPhi + inv(alpha);
    }

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
    const ptsPerFlank = 10;

    for (let i = 0; i < z; i++) {
        const tc = i * toothAngle;

        // Left flank: root (large r) → tip (small r)
        for (let j = 0; j <= ptsPerFlank; j++) {
            const frac = j / ptsPerFlank;
            const r = rd + (ra - rd) * frac;
            const angle = tc - halfThickAt(r);
            const y = Math.cos(angle) * r;
            const zz = Math.sin(angle) * r;
            if (i === 0 && j === 0) hole.moveTo(y, zz);
            else hole.lineTo(y, zz);
        }

        // Tip arc
        const htTip = halfThickAt(ra);
        const tipSteps = 3;
        for (let s = 1; s <= tipSteps; s++) {
            const a = tc - htTip + 2 * htTip * (s / tipSteps);
            hole.lineTo(Math.cos(a) * ra, Math.sin(a) * ra);
        }

        // Right flank: tip → root
        for (let j = ptsPerFlank; j >= 0; j--) {
            const frac = j / ptsPerFlank;
            const r = rd + (ra - rd) * frac;
            const angle = tc + halfThickAt(r);
            hole.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }

        // Root arc to next tooth
        if (i < z - 1) {
            const rootEnd = tc + halfThickAt(rd);
            const nextRootStart = (i + 1) * toothAngle - halfThickAt(rd);
            const steps = 3;
            for (let s = 1; s <= steps; s++) {
                const a = rootEnd + (nextRootStart - rootEnd) * (s / steps);
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

/** Planet carrier with narrow ring plates + pin bosses + arms
 *  openSide: 'engine' = no outer ring/arms on -X side,
 *            'tail'   = no outer ring/arms on +X side,
 *            null     = both sides */
function makeCarrier(ir, or, length, nArms, planetOrbitR, planetR, openSide) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: PAL.carrier, metalness: 0.05, roughness: 0.9, side: THREE.DoubleSide });

    // Narrow hub ring (center, around shaft)
    const hubOr = ir + 0.08;
    const hubGeo = new THREE.RingGeometry(ir, hubOr, 48);

    // Outer ring (around planet orbit, narrow band) — same material as arms
    const outerIr = planetOrbitR + planetR * 0.6;
    const outerGeo = new THREE.RingGeometry(outerIr, or, 48);

    // sides: [+X (tail), -X (engine)]
    const sides = [{x: length / 2, side: 'tail'}, {x: -length / 2, side: 'engine'}];
    sides.forEach(({x, side}) => {
        // Hub disc on both sides
        const hub = new THREE.Mesh(hubGeo, mat);
        hub.rotation.y = Math.PI / 2;
        hub.position.x = x;
        g.add(hub);
        // Outer ring only on non-open side
        if (side !== openSide) {
            const outer = new THREE.Mesh(outerGeo, mat);
            outer.rotation.y = Math.PI / 2;
            outer.position.x = x;
            g.add(outer);
        }
    });

    // Radial arms connecting hub to outer ring
    const armRadius = 0.022;
    const armLen = outerIr - hubOr;
    const armGeo = new THREE.CylinderGeometry(armRadius, armRadius, armLen, 8);
    const armOffsets = [];
    if (openSide !== 'tail') armOffsets.push(length * 0.45);
    if (openSide !== 'engine') armOffsets.push(-length * 0.45);
    for (let i = 0; i < nArms; i++) {
        const a = (i / nArms) * Math.PI * 2;
        const midR = (hubOr + outerIr) / 2;
        for (const xOff of armOffsets) {
            const arm = new THREE.Mesh(armGeo, mat);
            arm.position.set(xOff, Math.cos(a) * midR, Math.sin(a) * midR);
            arm.rotation.x = a;
            arm.castShadow = true;
            g.add(arm);
        }
    }
    return g;
}

/** Clutch pack: solid opaque cylinder with bee-stripe axial bands */
function makeClutchPack(ir, or, length, nDiscs) {
    const g = new THREE.Group();

    const lightMat = new THREE.MeshStandardMaterial({
        color: PAL.clutchSteel, metalness: 0.1, roughness: 0.8,
    });
    const darkMat = new THREE.MeshStandardMaterial({
        color: 0x222222, metalness: 0, roughness: 1,
    });

    // End caps
    const capGeo = new THREE.RingGeometry(ir, or, 48);
    for (const side of [-1, 1]) {
        const cap = new THREE.Mesh(capGeo, lightMat);
        cap.rotation.y = Math.PI / 2;
        cap.position.x = side * length / 2;
        g.add(cap);
    }

    // Alternating light/dark bands that together form the full cylinder wall
    const nBands = nDiscs * 2 + 1;
    const bandWidth = length / nBands;
    for (let i = 0; i < nBands; i++) {
        const isDark = i % 2 === 1;
        const bGeo = makeTube(ir, or, bandWidth);
        const band = new THREE.Mesh(bGeo, isDark ? darkMat : lightMat);
        band.position.x = -length / 2 + bandWidth * (i + 0.5);
        g.add(band);
    }

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

const modelPivot = new THREE.Group();
scene.add(modelPivot);
const root = new THREE.Group();
modelPivot.add(root);

const housingGrp = new THREE.Group();
housingGrp.visible = false;
const shaftGrp = new THREE.Group();
const gearGrp = new THREE.Group();
const clutchGrp = new THREE.Group();
root.add(housingGrp, shaftGrp, gearGrp, clutchGrp);

// ── Real ZF 8HP dimensions (scaled: 1 unit ≈ 50mm) ──────────────────────────
// Overall transmission: ~710mm long, ~244mm case bore diameter
// Reference: ZF 8HP70 SAE paper + GEARS Magazine 845RE teardown

const SCALE = 1 / 50; // mm to model units

// Real diameters (mm) → model radii
const DIMS = {
    caseBore:    244 * SCALE / 2,   // 2.44 → r=1.22
    tcOD:        268 * SCALE / 2,   // torque converter radius
    tcDepth:     174 * SCALE / 2,   // TC depth (half — we model one side)
    s1OD:        73.7 * SCALE / 2,  // P1/P2 sun OD (48T, shared sun)
    s2OD:        73.7 * SCALE / 2,  // same as s1OD — one physical part
    s3OD:        89.5 * SCALE / 2,  // P3 sun OD (69T, 8HP70)
    s4OD:        35 * SCALE / 2,    // P4 sun OD (23T, estimated)
    p3RingOD:    160.4 * SCALE / 2, // P3 ring gear OD
    brakeA_OD:   146 * SCALE / 2,   // Brake A friction OD
    brakeB_OD:   198 * SCALE / 2,   // Brake B friction OD
    clutchC_OD:  170 * SCALE / 2,   // Clutch C friction OD
    clutchD_OD:  172 * SCALE / 2,   // Clutch D friction OD (hub 162mm)
    clutchE_OD:  170 * SCALE / 2,   // Clutch E friction OD
    drumC_OD:    117 * SCALE / 2,   // Drum C inner OD
    drumE_OD:    117 * SCALE / 2,   // Drum E inner OD
    hubD_OD:     162 * SCALE / 2,   // Hub D OD
    hubD_H:      30 * SCALE,        // Hub D clutch pack thickness (4 plates ~17mm + clearance)
    inputShaftR:  16 * SCALE / 2,   // input shaft radius (estimated)
    outputShaftR: 35 * SCALE / 2,   // output shaft spline OD
};

// Gear module derived from P1 sun: module = OD / teeth (OD = 2*radius)
// All meshing gears within a set share the same module
const M = (DIMS.s1OD * 2) / 48;  // ≈ 0.0307 per tooth

// Per-gear-set module (different sets can have different modules)
const M_GS = [
    (DIMS.s1OD * 2) / 48,  // GS1: from P1 sun
    (DIMS.s2OD * 2) / 48,  // GS2: from P2 sun
    (DIMS.s3OD * 2) / 69,  // GS3: from P3 sun
    (DIMS.s4OD * 2) / 23,  // GS4: from P4 sun
];

// Axial layout (mm from front face, engine side = 0)
// Real order: TC | Brake A | P1 + Brake B | P2 | P3 | C | D | E | P4 | Output
// Total gear train length ≈ 520mm
const AX = {
    brakeA:   50 * SCALE,     // Brake A, front
    P1:       100 * SCALE,    // first planetary (Brake B wraps around it)
    P2:       170 * SCALE,    // second planetary
    P3:       240 * SCALE,    // third planetary
    clutchC:  310 * SCALE,    // Clutch C
    clutchD:  350 * SCALE,    // Clutch D
    clutchE:  390 * SCALE,    // Clutch E
    P4:       450 * SCALE,    // fourth planetary (output)
};
const axCenter = 260 * SCALE; // center point for model origin

// Face widths (realistic: gear face ~22mm, clutch packs 17-26mm)
const FW = 22 * SCALE;       // gear face width
const FW_CLUTCH = 25 * SCALE; // clutch pack width
const GAP = 20 * SCALE;       // gap between components

// X positions of each gear set center (shifted so model is centered at origin)
const gsX = [
    AX.P1 - axCenter,
    AX.P2 - axCenter,
    AX.P3 - axCenter,
    AX.P4 - axCenter,
];
const totalLen = (AX.P4 - AX.P1) + FW * 2;

const parts = {
    suns: [], rings: [], carriers: [], planets: [],
    clutches: {},
    gsGroups: [],    // per-gear-set visibility groups
    inputShaft: null, outputShaft: null,
};

let inactiveOpacity = 0.15; // controlled by UI slider

// ── Gear Sets ────────────────────────────────────────────────────────────────

// Real sun ODs per gear set
const SUN_RADII = [DIMS.s1OD, DIMS.s2OD, DIMS.s3OD, DIMS.s4OD];

// Shared GS1+GS2 sun gear — one long gear spanning both planetary sets
const sharedSunM = M_GS[0];
const sharedSunLen = Math.abs(gsX[1] - gsX[0]) + FW;  // spans GS1 to GS2
const sharedSunGeo = makeExternalGear(sharedSunM, GS_SPEC[0].sun, sharedSunLen, 0.18);
const sharedSunMesh = new THREE.Mesh(sharedSunGeo, mat(PAL.sun, { metalness: 0.05, roughness: 0.85 }));
sharedSunMesh.position.x = (gsX[0] + gsX[1]) / 2;  // centered between GS1 and GS2
sharedSunMesh.castShadow = true;
sharedSunMesh.receiveShadow = true;
gearGrp.add(sharedSunMesh);
// Register shared sun once under GS1 (gs1_sun = gs2_sun always)
parts.suns.push({ mesh: sharedSunMesh, idx: 0, teeth: GS_SPEC[0].sun });

GS_SPEC.forEach((spec, idx) => {
    const x = gsX[idx];
    const m = M_GS[idx]; // per-set module
    const sunPitchR = (m * spec.sun) / 2;
    const ringPitchR = (m * spec.ring) / 2;
    const planetTeeth = (spec.ring - spec.sun) / 2;
    const planetPitchR = (m * planetTeeth) / 2;
    const planetOrbitR = sunPitchR + planetPitchR;

    // Per-gear-set group for visibility toggling
    const gsGroup = new THREE.Group();
    gsGroup.name = `GS${idx + 1}`;
    gearGrp.add(gsGroup);
    parts.gsGroups.push(gsGroup);

    // Sun — GS1 and GS2 share the long sun gear above; GS3/GS4 get their own
    let sunMesh;
    if (idx <= 1) {
        sunMesh = sharedSunMesh;
    } else {
        const sunGeo = makeExternalGear(m, spec.sun, FW * 0.82, 0.18);
        sunMesh = new THREE.Mesh(sunGeo, mat(PAL.sun, { metalness: 0.05, roughness: 0.85 }));
        sunMesh.position.x = x;
        sunMesh.castShadow = true;
        sunMesh.receiveShadow = true;
        gsGroup.add(sunMesh);
        parts.suns.push({ mesh: sunMesh, idx, teeth: spec.sun });
    }

    // Ring
    const ringOuterR = ringPitchR + m * 3.5;
    const ringGeo = makeInternalGear(m, spec.ring, FW * 0.88, ringOuterR);
    const ringMesh = new THREE.Mesh(ringGeo, mat(PAL.ring, {
        metalness: 0.05, roughness: 0.85, transparent: true, opacity: 0.78,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }));
    ringMesh.position.x = x;
    ringMesh.castShadow = true;
    ringMesh.receiveShadow = true;
    gsGroup.add(ringMesh);
    parts.rings.push({ mesh: ringMesh, idx, teeth: spec.ring });

    // GS1 open on engine side (input), GS3 open on engine side (tapered drum)
    const carrierOpenSide = (idx === 0 || idx === 2) ? 'engine' : null;
    const carrier = makeCarrier(0.2, planetOrbitR + planetPitchR * 0.45, FW * 0.9, 4, planetOrbitR, planetPitchR + m, carrierOpenSide);
    carrier.position.x = x;
    gsGroup.add(carrier);
    parts.carriers.push({ mesh: carrier, idx });

    // Planets (4 per set)
    const nP = 4;
    // Rotate sun and ring by half-tooth so gaps face the first planet (at angle 0)
    sunMesh.rotation.x = Math.PI / spec.sun;
    ringMesh.rotation.x = Math.PI / spec.ring;
    for (let p = 0; p < nP; p++) {
        const a = (p / nP) * Math.PI * 2;
        const pGeo = makeExternalGear(m, planetTeeth, FW * 0.75, 0.06);
        const pMesh = new THREE.Mesh(pGeo, mat(PAL.planet, { metalness: 0.05, roughness: 0.85 }));
        pMesh.position.set(x, Math.cos(a) * planetOrbitR, Math.sin(a) * planetOrbitR);
        // Rolling constraint: planet rotates -a * Zs/Zp as it orbits by a
        // Tooth at angle 0 (outward) for first planet; gap at π (inward) faces sun
        pMesh.rotation.x = -a * spec.sun / planetTeeth;
        pMesh.castShadow = true;
        gsGroup.add(pMesh);
        parts.planets.push({ mesh: pMesh, idx, angle: a, orbitR: planetOrbitR, baseX: x, pTeeth: planetTeeth });
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

function addDrum(innerR, outerR, xStart, xEnd, color, labelText, endInnerR, endOuterR, noFlanges) {
    const len = Math.abs(xEnd - xStart);
    const xMid = (xStart + xEnd) / 2;
    // Support tapered drums: different radii at start vs end
    const ir0 = innerR, or0 = outerR;
    const ir1 = endInnerR ?? innerR, or1 = endOuterR ?? outerR;

    const grp = new THREE.Group();
    grp.position.x = xMid;

    const drumMat = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.05,
        roughness: 0.85,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
    });

    // Cage bars — straight lines from start radius to end radius
    const nBars = 5;
    const barThick = Math.max(or0 - ir0, or1 - ir1);
    for (let i = 0; i < nBars; i++) {
        const a = (i / nBars) * Math.PI * 2;
        const r0 = (ir0 + or0) / 2;
        const r1 = (ir1 + or1) / 2;
        // Build tapered bar from two triangles using BufferGeometry
        const hw = 0.01; // half-width of bar
        const positions = new Float32Array([
            // start face (x = -len/2)
            -len/2, Math.cos(a)*r0 - Math.sin(a)*barThick/2, Math.sin(a)*r0 + Math.cos(a)*barThick/2,
            -len/2, Math.cos(a)*r0 + Math.sin(a)*barThick/2, Math.sin(a)*r0 - Math.cos(a)*barThick/2,
            // end face (x = +len/2)
             len/2, Math.cos(a)*r1 + Math.sin(a)*barThick/2, Math.sin(a)*r1 - Math.cos(a)*barThick/2,
             len/2, Math.cos(a)*r1 - Math.sin(a)*barThick/2, Math.sin(a)*r1 + Math.cos(a)*barThick/2,
        ]);
        // Extrude into a thin box by duplicating with offset
        const cos_a = Math.cos(a), sin_a = Math.sin(a);
        const ny = -sin_a * hw, nz = cos_a * hw;
        const verts = new Float32Array(24); // 8 vertices
        for (let v = 0; v < 4; v++) {
            verts[v*3]   = positions[v*3];
            verts[v*3+1] = positions[v*3+1] + ny;
            verts[v*3+2] = positions[v*3+2] + nz;
        }
        for (let v = 0; v < 4; v++) {
            verts[12+v*3]   = positions[v*3];
            verts[12+v*3+1] = positions[v*3+1] - ny;
            verts[12+v*3+2] = positions[v*3+2] - nz;
        }
        const idx = [0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,4,5, 0,5,1, 2,6,7, 2,7,3, 0,3,7, 0,7,4, 1,5,6, 1,6,2];
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        const bar = new THREE.Mesh(geo, drumMat);
        bar.renderOrder = 1;
        grp.add(bar);
    }

    // End flanges at actual radii (skip if noFlanges)
    if (!noFlanges) {
        const flangeGeo0 = new THREE.RingGeometry(ir0, or0, 48);
        const flange0 = new THREE.Mesh(flangeGeo0, drumMat);
        flange0.rotation.y = Math.PI / 2;
        flange0.position.x = -len / 2;
        flange0.renderOrder = 1;
        grp.add(flange0);

        const flangeGeo1 = new THREE.RingGeometry(ir1, or1, 48);
        const flange1 = new THREE.Mesh(flangeGeo1, drumMat);
        flange1.rotation.y = Math.PI / 2;
        flange1.position.x = len / 2;
        flange1.renderOrder = 1;
        grp.add(flange1);
    }

    gearGrp.add(grp);
    return { group: grp, drumMat, innerR, outerR, xMid, len };
}

// ── Shaft dimensions (needed by drums AND shafts, defined early) ─────────────
const inpShaftLen = 521 * SCALE;
const outShaftLen = 180 * SCALE;

const sunShaftR = DIMS.s1OD + 0.02;
const c1ir = sunShaftR + 0.03;       // GS1 carrier ↔ GS4 ring inner
const c1or = c1ir + 0.04;
const c2ir = c1or + 0.02;            // GS2 ring ↔ GS3 sun inner
const c2or = c2ir + 0.04;
const c3ir = c2or + 0.02;            // GS3 ring ↔ GS4 sun inner
const c3or = c3ir + 0.04;

// Sun shaft drum removed — the shared long sun gear itself is the visual connection

// GS1 carrier → GS4 ring drum (concentric tube, GS1 output face to GS4 input face)
{
    const xStart = gsX[0] + FW * 0.5 + 0.02;  // just inside GS1 tail face
    const xEnd = gsX[3] - FW * 0.5 - 0.02;    // just inside GS4 engine face
    const grp = new THREE.Group();
    const xMid = (xStart + xEnd) / 2;
    const len = xEnd - xStart;
    grp.position.x = xMid;
    const tubeIr = DIMS.inputShaftR + 0.005;
    const tubeOr = tubeIr + 0.01;
    const drumMat = new THREE.MeshStandardMaterial({
        color: DRUM_STYLES[1].color,
        metalness: 0.05, roughness: 0.85,
        transparent: true, opacity: 0.4,
        side: THREE.DoubleSide, depthWrite: false,
    });
    const tubeGeo = makeTube(tubeIr, tubeOr, len);
    const tube = new THREE.Mesh(tubeGeo, drumMat);
    tube.renderOrder = 1;
    grp.add(tube);
    gearGrp.add(grp);
    parts.drums.push({ group: grp, speedKey: 'gs1_carrier', type: 'drum', drumMat });
}

// GS2 ring → GS3 sun drum — tapered, connecting adjacent faces
const gs2ringR = (M_GS[1] * GS_SPEC[1].ring) / 2 + M_GS[1] * 3.5;
const gs3sunR = (M_GS[2] * GS_SPEC[2].sun) / 2;
const drum_gs2r_gs3s = addDrum(gs2ringR - 0.04, gs2ringR,
    gsX[1] + FW * 0.5, gsX[2] - FW * 0.5, DRUM_STYLES[2].color, null,
    gs3sunR - 0.02, gs3sunR + 0.02, true);
parts.drums.push({ group: drum_gs2r_gs3s.group, speedKey: 'gs2_ring', type: 'drum', drumMat: drum_gs2r_gs3s.drumMat });

// GS3 ring → GS4 sun drum — polyline rods routed above clutches C/D/E
const gs3ringR = (M_GS[2] * GS_SPEC[2].ring) / 2 + M_GS[2] * 3.5;
const gs4sunR = (M_GS[3] * GS_SPEC[3].sun) / 2;
const clutchClearR = Math.max(DIMS.clutchC_OD, DIMS.clutchE_OD + 0.08) + 0.06; // above clutch OD
{
    const grp = new THREE.Group();
    const drumMat = new THREE.MeshStandardMaterial({
        color: DRUM_STYLES[3].color,
        metalness: 0.05, roughness: 0.85,
        transparent: true, opacity: 0.4,
        side: THREE.DoubleSide, depthWrite: false,
    });

    // Polyline waypoints (in world X, local R):
    // 1) GS4 sun surface → short stub toward output (+X)
    // 2) radial outward to clearance radius
    // 3) axial toward GS3 ring (-X)
    // 4) radial inward to GS3 ring surface
    const x4 = gsX[3] + FW * 0.5;      // GS4 tail face
    const x4out = x4 + FW;              // ~1 inch past GS4 toward output
    const x3 = gsX[2] + FW * 0.5;       // GS3 tail face (facing clutches)
    const xMid = (x3 + x4out) / 2;
    grp.position.x = xMid;

    const nBars = 5;
    const barR = 0.015; // rod radius
    for (let i = 0; i < nBars; i++) {
        const a = (i / nBars) * Math.PI * 2;
        const cos_a = Math.cos(a), sin_a = Math.sin(a);

        // 4 segments per rod, each a thin cylinder
        const segments = [
            // seg 1: axial stub at GS4 sun radius
            { from: [x4, gs4sunR], to: [x4out, gs4sunR] },
            // seg 2: radial outward at x4out
            { from: [x4out, gs4sunR], to: [x4out, clutchClearR] },
            // seg 3: axial run above clutches
            { from: [x4out, clutchClearR], to: [x3, clutchClearR] },
            // seg 4: radial inward to GS3 ring
            { from: [x3, clutchClearR], to: [x3, gs3ringR] },
        ];

        segments.forEach(({ from, to }) => {
            const [fx, fr] = from;
            const [tx, tr] = to;
            const dx = tx - fx, dr = tr - fr;
            const segLen = Math.sqrt(dx * dx + dr * dr);
            const mx = (fx + tx) / 2 - xMid; // local X
            const mr = (fr + tr) / 2;

            const geo = new THREE.CylinderGeometry(barR, barR, segLen, 6);
            const rod = new THREE.Mesh(geo, drumMat);

            // CylinderGeometry axis is Y; we need to orient it along the segment direction
            // Segment direction in local frame: (dx, dr*cos_a, dr*sin_a)
            // For axial segments (dr=0): rotate 90° around Z
            // For radial segments (dx=0): rotate around X by angle a
            if (Math.abs(dr) < 0.001) {
                // Axial segment
                rod.rotation.z = Math.PI / 2;
                rod.position.set(mx, cos_a * mr, sin_a * mr);
            } else if (Math.abs(dx) < 0.001) {
                // Radial segment
                rod.rotation.x = a;
                rod.position.set(mx, cos_a * mr, sin_a * mr);
            }
            rod.renderOrder = 1;
            grp.add(rod);
        });
    }

    gearGrp.add(grp);
    parts.drums.push({ group: grp, speedKey: 'gs3_ring', type: 'drum', drumMat });
}

// GS4 carrier → output drum
const gs4cR = (DIMS.s4OD + SUN_RADII[3] * GS_SPEC[3].ring / GS_SPEC[3].sun) / 2;
const drum_output = addDrum(gs4cR, gs4cR + 0.04,
    gsX[3] - FW, gsX[3] + FW + outShaftLen * 0.3, DRUM_STYLES[4].color);
parts.drums.push({ group: drum_output.group, speedKey: 'gs4_carrier', type: 'drum', drumMat: drum_output.drumMat });

// ── Shafts ───────────────────────────────────────────────────────────────────

// Input shaft — runs from TC through to clutch area (real: ~521mm, 32 splines)
const inpShaft = makeVisibleShaft(DIMS.inputShaftR, inpShaftLen, 4, 0xd4a830, 0x665520);
inpShaft.position.x = (gsX[0] + gsX[1]) / 2 - 1;
shaftGrp.add(inpShaft);
parts.inputShaft = inpShaft;

// Output shaft — from P4 carrier out the back (real: ~180mm)
const outShaft = makeVisibleShaft(DIMS.outputShaftR, outShaftLen, 4, 0x6aaa45, 0x2d5520);
outShaft.position.x = gsX[3] + outShaftLen / 2 + FW;
shaftGrp.add(outShaft);
parts.outputShaft = outShaft;

// ── Clutches & Brakes ────────────────────────────────────────────────────────

// Clutch/brake specs with real dimensions and positions
// Real order: Brake A | P1 + Brake B | P2 | P3 | C | D | E | P4
const brakeAX = AX.brakeA - axCenter;
const brakeBX = AX.P1 - axCenter;  // Brake B wraps around P1
const clutchCX = AX.clutchC - axCenter;
const clutchDX = AX.clutchD - axCenter;
const clutchEX = AX.clutchE - axCenter;

const cSpecs = {
    A: { ir: DIMS.inputShaftR + 0.02, or: DIMS.brakeA_OD, len: FW_CLUTCH, nDiscs: 5, x: brakeAX },
    B: { ir: DIMS.brakeB_OD - 0.15, or: DIMS.brakeB_OD, len: FW_CLUTCH, nDiscs: 5, x: brakeBX },
    C: { ir: DIMS.drumC_OD - 0.05, or: DIMS.clutchC_OD, len: FW_CLUTCH, nDiscs: 6, x: clutchCX },
    D: { ir: DIMS.drumC_OD - 0.05, or: DIMS.clutchC_OD, len: FW_CLUTCH, nDiscs: 4, x: clutchDX },
    E: { ir: DIMS.drumE_OD - 0.05, or: DIMS.clutchE_OD + 0.08, len: FW_CLUTCH, nDiscs: 5, x: clutchEX },
};

// Speed key for each clutch — what member speed drives it
const CLUTCH_SPEED_KEYS = {
    A: 'gs1_sun',      // Brake A: GS1/GS2 sun → case
    B: 'gs1_ring',     // Brake B: GS1 ring → case
    C: 'input',        // Clutch C: input → GS4 sun
    D: 'gs3_carrier',  // Clutch D: GS3 carrier → output
    E: 'gs3_sun',      // Clutch E: GS3 sun ↔ GS3 ring
};

Object.entries(cSpecs).forEach(([name, s]) => {
    const pack = makeClutchPack(s.ir, s.or, s.len, s.nDiscs);
    pack.position.x = s.x;
    clutchGrp.add(pack);
    parts.clutches[name] = pack;
});

// ── Clutch labels — show what each clutch connects in the 3D view
const CLUTCH_LABELS = {
    A: 'A: Sun↔Case',
    B: 'B: Ring↔Case',
    C: 'C: Input↔GS4',
    D: 'D: GS3↔Output',
    E: 'E: GS3s↔GS3r',
};
Object.entries(CLUTCH_LABELS).forEach(([name, text]) => {
    const s = cSpecs[name];
    const y = s.or + 0.35;
    clutchGrp.add(makeLabel(text, new THREE.Vector3(s.x, y, 0), { fontSize: 18, color: '#c44b1a' }));
});


// ── Torque Converter (Hydrotransformator) ────────────────────────────────────

const tcGroup = new THREE.Group();
// TC sits just before Brake A, in the bell housing
const brakesXpos = AX.brakeA - axCenter;
const tcWidth = DIMS.tcDepth;
const tcX = brakesXpos - FW_CLUTCH - tcWidth / 2; // just before brakes
const tcR = Math.min(DIMS.tcOD, DIMS.caseBore - 0.05); // must fit inside case bore

// Impeller (engine side) — donut shape + vane group
const impellerGrp = new THREE.Group();
impellerGrp.position.x = tcX - tcWidth * 0.2;
const impellerGeo = new THREE.TorusGeometry(tcR * 0.6, tcR * 0.35, 16, 32);
impellerGeo.rotateY(Math.PI / 2);
const impellerMat = new THREE.MeshStandardMaterial({
    color: 0xcc8833, metalness: 0.05, roughness: 0.85,
    transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide,
});
const impeller = new THREE.Mesh(impellerGeo, impellerMat);
impellerGrp.add(impeller);
tcGroup.add(impellerGrp);

// Turbine (transmission side) — slightly smaller donut + vane group
const turbineGrp = new THREE.Group();
turbineGrp.position.x = tcX + tcWidth * 0.2;
const turbineGeo = new THREE.TorusGeometry(tcR * 0.55, tcR * 0.3, 16, 32);
turbineGeo.rotateY(Math.PI / 2);
const turbineMat = new THREE.MeshStandardMaterial({
    color: 0x88aa55, metalness: 0.05, roughness: 0.85,
    transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide,
});
const turbine = new THREE.Mesh(turbineGeo, turbineMat);
turbineGrp.add(turbine);
tcGroup.add(turbineGrp);

// Stator (center) — with one-way clutch hub
const statorGeo = new THREE.TorusGeometry(tcR * 0.3, tcR * 0.12, 12, 24);
statorGeo.rotateY(Math.PI / 2);
const statorMat = new THREE.MeshStandardMaterial({
    color: 0x888888, metalness: 0.05, roughness: 0.9,
});
const stator = new THREE.Mesh(statorGeo, statorMat);

// One-way clutch hub (inner ring of stator)
const owcGeo = new THREE.CylinderGeometry(tcR * 0.15, tcR * 0.15, 0.3, 20, 1, true);
owcGeo.rotateZ(Math.PI / 2);
const owcMat = new THREE.MeshStandardMaterial({
    color: 0x777777, metalness: 0.2, roughness: 0.7, side: THREE.DoubleSide,
});
const owc = new THREE.Mesh(owcGeo, owcMat);

// Interior vanes — radial blades inside impeller, turbine, and stator
function addTCVanes(parent, majorR, minorR, color, count) {
    const vaneMat = new THREE.MeshStandardMaterial({
        color, metalness: 0.15, roughness: 0.7,
        transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
    });
    const vaneH = minorR * 1.6;
    const vaneW = minorR * 0.7;
    const vGeo = new THREE.PlaneGeometry(vaneW, vaneH);
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const vane = new THREE.Mesh(vGeo, vaneMat);
        // Position at torus center ring (local coords, group holds x offset)
        const ry = Math.cos(angle) * majorR;
        const rz = Math.sin(angle) * majorR;
        vane.position.set(0, ry, rz);
        // Orient radially: face toward axis, with slight twist for blade curve
        vane.lookAt(0, 0, 0);
        vane.rotateY(Math.PI * 0.17);
        parent.add(vane);
    }
}

addTCVanes(impellerGrp, tcR * 0.6, tcR * 0.35, 0xdd9944, 24);
addTCVanes(turbineGrp, tcR * 0.55, tcR * 0.3, 0x99bb66, 24);

// Stator group — stator torus + one-way clutch + vanes (static)
const statorGrp = new THREE.Group();
statorGrp.position.x = tcX;
statorGrp.add(stator);
statorGrp.add(owc);
addTCVanes(statorGrp, tcR * 0.3, tcR * 0.12, 0x999999, 16);
tcGroup.add(statorGrp);

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

modelPivot.add(tcGroup);
parts.tcGroup = tcGroup;
parts.tcImpeller = impellerGrp;
parts.tcTurbine = turbineGrp;

// ── Housing ──────────────────────────────────────────────────────────────────

const caseR = DIMS.caseBore + 0.05; // case bore radius + wall thickness
const caseLen = 600 * SCALE; // main case length (excluding TC)

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

    // Rigid: GS1_sun = GS2_sun (same physical shaft)
    if (s.gs1_sun !== undefined) s.gs2_sun = s.gs1_sun;
    else if (s.gs2_sun !== undefined) s.gs1_sun = s.gs2_sun;

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

    // Final: enforce gs1_sun = gs2_sun
    if (s.gs1_sun !== undefined && s.gs2_sun === undefined) s.gs2_sun = s.gs1_sun;
    if (s.gs2_sun !== undefined && s.gs1_sun === undefined) s.gs1_sun = s.gs2_sun;

    // Default unknowns to 0
    for (let i = 1; i <= 4; i++)
        ['sun','ring','carrier'].forEach(p => { if (s[`gs${i}_${p}`] === undefined) s[`gs${i}_${p}`] = 0; });

    return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

let currentGear = '8';
let targetSpeeds = solveSpeeds('1');
let curSpeeds = { ...targetSpeeds };
let animSpeed = 1.0;

// ─────────────────────────────────────────────────────────────────────────────
// POWER FLOW ARROWS — animated dashed tubes showing torque path
// ─────────────────────────────────────────────────────────────────────────────

// Flow arrows live in a SEPARATE scene so they render on top of the
// post-processed main scene (SAO composer ignores renderOrder/depthTest)
const flowScene = new THREE.Scene();
const flowGroup = new THREE.Group();
flowScene.add(flowGroup);

// Power flow paths per gear.
// X order: brakeA → GS1+brakeB → GS2 → GS3 → C → D → E → GS4 → out
// Y offset = radial position (0 = center shaft, positive = outward)
// All paths go strictly left-to-right, no backtracking.

const inX = gsX[1] - FW * 1.5;
const outX = gsX[3] + FW * 2.0;

// Radial heights for routing (Y offsets above center axis)
const hShaft = 0;         // center shaft
const hInner = 0.8;       // inner drum level (sun shaft, clutch C/D)
const hOuter = 1.6;       // outer drum level (ring gears, clutch E, brake B)

const FLOW_POINTS = {
    // 1st (A,B,C): Input→GS2 carrier→(via C connects input to GS4 sun)→GS4 reduces→Output
    // GS1 locked by A+B holds GS4 ring at zero
    '1': [
        [inX,hShaft,0], [gsX[1],hShaft,0],         // input to GS2 carrier
        [gsX[1],hInner,0], [gsX[3],hInner,0],      // through Clutch C path to GS4 sun
        [gsX[3],hShaft,0], [outX,hShaft,0],         // GS4 carrier → output
    ],
    // 2nd (A,B,E): Input→GS2 carrier→GS2 ring(overdrive)→E locks GS3→GS4 sun→GS4 reduces→Output
    '2': [
        [inX,hShaft,0], [gsX[1],hShaft,0],         // input to GS2 carrier
        [gsX[1],hOuter,0], [gsX[2],hOuter,0],      // GS2 ring → through E/GS3 locked
        [gsX[3],hOuter,0], [gsX[3],hShaft,0],      // → GS4 sun → GS4 carrier
        [outX,hShaft,0],                            // output
    ],
    // 3rd (B,C,E): Two paths merge in GS4:
    //   C connects input directly to GS4 sun
    //   E locks GS3, GS2 ring feeds through
    //   B holds GS1 ring (reaction torque)
    '3': [
        [inX,hShaft,0], [gsX[1],hShaft,0],         // input to GS2
        [gsX[1],hInner,0], [gsX[3],hInner,0],      // via C to GS4 sun
        [gsX[3],hShaft,0], [outX,hShaft,0],         // GS4 → output
    ],
    // 4th (B,C,D): C→GS4 sun + D connects GS3 carrier to output
    '4': [
        [inX,hShaft,0], [gsX[1],hShaft,0],         // input to GS2
        [gsX[1],hInner,0], [gsX[2],hInner,0],      // through GS2 ring/GS3 sun
        [gsX[2],hShaft,0], [outX,hShaft,0],         // GS3 carrier → D → output
    ],
    // 5th (C,D,E): C→GS4 sun, E locks GS3, D→output
    '5': [
        [inX,hShaft,0], [gsX[1],hShaft,0],         // input
        [gsX[1],hInner,0], [gsX[3],hInner,0],      // via C to GS4 sun
        [gsX[3],hShaft,0], [outX,hShaft,0],         // GS4 carrier → D → output
    ],
    // 6th (B,D,E): Direct drive 1:1 — everything locked together
    '6': [
        [inX,hShaft,0], [outX,hShaft,0],           // straight through, 1:1
    ],
    // 7th (A,D,E): Input→GS2(sun=0, overdrive)→ring→E/GS3 locked→D→output
    '7': [
        [inX,hShaft,0], [gsX[1],hShaft,0],         // input to GS2 carrier
        [gsX[1],hOuter,0], [gsX[2],hOuter,0],      // GS2 ring (overdrive) → GS3 locked
        [gsX[2],hShaft,0], [outX,hShaft,0],         // GS3 carrier → D → output
    ],
    // 8th (A,C,D): Input→GS2(sun=0, max overdrive)→GS3→D→output + C→GS4
    '8': [
        [inX,hShaft,0], [gsX[1],hShaft,0],         // input to GS2
        [gsX[1],hOuter,0], [gsX[2],hOuter,0],      // GS2 ring overdrive → GS3
        [gsX[2],hShaft,0], [outX,hShaft,0],         // → D → output
    ],
    // Reverse (A,B,D): Input→GS2→ring→GS3 carrier(reversed)→D→output
    'R': [
        [inX,hShaft,0], [gsX[1],hShaft,0],         // input to GS2
        [gsX[1],hOuter,0], [gsX[2],hOuter,0],      // GS2 ring → GS3
        [gsX[2],hShaft,0], [outX,hShaft,0],         // GS3 carrier → D → output (reversed)
    ],
};

// Build flow arrow meshes
let flowMeshes = [];
const FLOW_COLOR = 0x66dd88;

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

// ─────────────────────────────────────────────────────────────────────────────
// VELOCITY-BASED COLORING — parts at the same angular velocity share a color
// ─────────────────────────────────────────────────────────────────────────────

const VELOCITY_PALETTE = [
    0x5588cc, // blue
    0xcc5588, // rose
    0x55bb99, // teal
    0xbb7744, // amber
    0x8866bb, // purple
    0xcc9933, // ochre
    0x669977, // sage
    0xaa5577, // mauve
];

/** Given a speed map, return a Map<roundedSpeed, color> */
function assignSpeedColors(speeds) {
    const round = v => Math.round(v * 10000) / 10000;
    const unique = [...new Set(Object.values(speeds).map(round))].sort((a, b) => a - b);

    const colorMap = new Map();
    colorMap.set(round(0), 0x999999);           // grounded = gray
    colorMap.set(round(1), PAL.inputShaft);      // input speed = gold
    const outR = round(speeds.output);
    if (!colorMap.has(outR)) colorMap.set(outR, PAL.outputShaft); // output = green

    let pi = 0;
    for (const s of unique) {
        if (!colorMap.has(s)) {
            colorMap.set(s, VELOCITY_PALETTE[pi % VELOCITY_PALETTE.length]);
            pi++;
        }
    }
    return colorMap;
}

function colorForSpeed(speed, colorMap) {
    const r = Math.round(speed * 10000) / 10000;
    for (const [s, c] of colorMap) {
        if (Math.abs(r - s) < 0.0002) return c;
    }
    return 0xcccccc;
}

// ─────────────────────────────────────────────────────────────────────────────
// TORQUE PATH DESCRIPTIONS
// ─────────────────────────────────────────────────────────────────────────────

const ELEMENT_INFO = {
    A: { name: 'Brake A', type: 'brake' },
    B: { name: 'Brake B', type: 'brake' },
    C: { name: 'Clutch C', type: 'clutch' },
    D: { name: 'Clutch D', type: 'clutch' },
    E: { name: 'Clutch E', type: 'clutch' },
};

const TORQUE_PATHS = {
    'R': {
        elements: {
            A: 'Locks sun shaft — GS1/GS2 sun held stationary',
            B: 'Locks GS1 ring — GS1 fully grounded to case',
            D: 'Connects GS3 carrier to output shaft',
        },
        path: 'Input → GS2 carrier → GS2 planets → GS2 ring → GS3 sun → GS3 planets → GS3 carrier → Output (reversed)',
    },
    '1': {
        elements: {
            A: 'Locks sun shaft — GS1/GS2 sun held stationary',
            B: 'Locks GS1 ring — GS1 fully locked, so GS4 ring = 0',
            C: 'Connects input shaft directly to GS4 sun',
        },
        path: 'Input → C → GS4 sun; GS4 ring = 0 (via locked GS1) → GS4 provides maximum reduction → Output',
    },
    '2': {
        elements: {
            A: 'Locks sun shaft — GS1/GS2 sun held stationary',
            B: 'Locks GS1 ring — GS1 fully locked, GS4 ring = 0',
            E: 'Locks GS3 — sun, ring, carrier all rotate together',
        },
        path: 'Input → GS2 carrier → GS2 ring → GS3 (locked) → GS4 sun; GS4 ring = 0 → GS4 reduces → Output',
    },
    '3': {
        elements: {
            B: 'Locks GS1 ring — provides reaction torque',
            C: 'Connects input to GS4 sun at input speed',
            E: 'Locks GS3 — all GS3 parts at same speed',
        },
        path: 'Input → C → GS4 sun; Input → GS2 → GS3 (locked) → also GS4 sun; GS1 ring braked → Output',
    },
    '4': {
        elements: {
            B: 'Locks GS1 ring — provides reaction torque',
            C: 'Connects input to GS4 sun at input speed',
            D: 'Connects GS3 carrier to output shaft',
        },
        path: 'Input → C → GS4 sun; Input → GS2 → GS3 carrier → Output via D; two parallel paths merge',
    },
    '5': {
        elements: {
            C: 'Connects input to GS4 sun at input speed',
            D: 'Connects GS3 carrier to output shaft',
            E: 'Locks GS3 — all of GS3 rotates as one unit',
        },
        path: 'Input → C → GS4 sun → GS3 ring; GS3 locked → GS3 carrier → Output via D; mild overdrive',
    },
    '6': {
        elements: {
            B: 'Locks GS1 ring — provides reaction torque',
            D: 'Connects GS3 carrier to output shaft',
            E: 'Locks GS3 — direct path through GS3',
        },
        path: 'Input → GS2 carrier → GS2 ring → GS3 (locked) → GS3 carrier → Output via D; 1:1 direct drive',
    },
    '7': {
        elements: {
            A: 'Locks sun shaft — GS2 sun = 0, overdrive in GS2',
            D: 'Connects GS3 carrier to output shaft',
            E: 'Locks GS3 — direct path through GS3',
        },
        path: 'Input → GS2 carrier (sun = 0) → GS2 ring speeds up → GS3 (locked) → Output via D; overdrive',
    },
    '8': {
        elements: {
            A: 'Locks sun shaft — GS2 sun = 0, overdrive in GS2',
            C: 'Connects input to GS4 sun at input speed',
            D: 'Connects GS3 carrier to output shaft',
        },
        path: 'Input → C → GS4 sun; Input → GS2 (sun = 0) → GS3 → Output via D; maximum overdrive',
    },
};

function updateTorquePanel(gear) {
    const container = document.getElementById('torque-path');
    const tp = TORQUE_PATHS[gear];
    const engaged = GEAR_DATA[gear].engaged;

    let html = '';
    // Show all 5 elements, engaged ones first
    ['A','B','C','D','E'].forEach(el => {
        const on = engaged.includes(el);
        const info = ELEMENT_INFO[el];
        const desc = on ? tp.elements[el] : (info.type === 'brake' ? 'Open — not braking' : 'Open — not transmitting');
        html += `<div class="tp-step">
            <span class="tp-badge ${on ? 'engaged' : 'open'}">${el}</span>
            <div class="tp-text">
                <div class="tp-name">${info.name} — ${on ? 'Engaged' : 'Open'}</div>
                <div class="tp-desc">${desc}</div>
            </div>
        </div>`;
    });

    // Torque path summary
    html += `<div class="tp-path">
        <div class="tp-path-label">Torque Path</div>
        ${tp.path}
    </div>`;

    container.innerHTML = html;
}

function setGear(gear) {
    currentGear = gear;
    targetSpeeds = solveSpeeds(gear);
    const d = GEAR_DATA[gear];

    // UI
    document.querySelectorAll('.gear-btn').forEach(b => b.classList.toggle('active', b.dataset.gear === gear));
    document.getElementById('current-gear').textContent = d.name;
    document.getElementById('current-ratio').textContent = d.ratio.toFixed(3);
    updateTorquePanel(gear);

    // Rebuild flow arrows
    buildFlowArrows(gear);

    // ── Velocity-based color assignment
    const speeds = targetSpeeds;
    const cMap = assignSpeedColors(speeds);

    function sColor(key) { return colorForSpeed(speeds[key] || 0, cMap); }
    function isMoving(key) { return Math.abs(speeds[key] || 0) > 0.001; }

    // Helper: near-opaque parts use normal depth writing; translucent use transparent path
    function setM(m, color, opacity, emHex, emInt) {
        m.color.setHex(color);
        m.opacity = opacity;
        m.emissive.setHex(emHex);
        m.emissiveIntensity = emInt;
        if (opacity >= 0.8) {
            m.transparent = false;
            m.depthWrite = true;
        } else {
            m.transparent = true;
            m.depthWrite = false;
        }
        m.needsUpdate = true;
    }

    // ── Gear sets: colored by angular velocity
    parts.suns.forEach(({ mesh, idx }) => {
        const key = `gs${idx + 1}_sun`;
        const col = sColor(key);
        const on = isMoving(key);
        setM(mesh.material, col, on ? 0.95 : inactiveOpacity, 0x000000, 0);
        mesh.visible = on || inactiveOpacity > 0.05;
        mesh.renderOrder = on ? 2 : 0;
    });

    parts.rings.forEach(({ mesh, idx }) => {
        const key = `gs${idx + 1}_ring`;
        const col = sColor(key);
        const on = isMoving(key);
        setM(mesh.material, col, on ? 0.95 : inactiveOpacity, 0x000000, 0);
        mesh.visible = on || inactiveOpacity > 0.05;
        mesh.renderOrder = on ? 1 : 0;
    });

    parts.carriers.forEach(({ mesh, idx }) => {
        const key = `gs${idx + 1}_carrier`;
        const col = sColor(key);
        const on = isMoving(key);
        mesh.visible = on || inactiveOpacity > 0.05;
        mesh.traverse(ch => {
            if (!ch.isMesh) return;
            setM(ch.material, col, on ? 0.92 : inactiveOpacity, 0x000000, 0);
            ch.material.side = THREE.DoubleSide; // flat planes need DoubleSide
            ch.renderOrder = on ? 2 : 0;
        });
    });

    parts.planets.forEach(p => {
        // Planets orbit with carrier — color by carrier speed
        const key = `gs${p.idx + 1}_carrier`;
        const col = sColor(key);
        const on = isMoving(key);
        setM(p.mesh.material, col, on ? 0.95 : inactiveOpacity, 0x000000, 0);
        p.mesh.visible = on || inactiveOpacity > 0.05;
        p.mesh.renderOrder = on ? 2 : 0;
    });

    // ── Clutches: engaged = visible barrel, disengaged = hidden
    ['A','B','C','D','E'].forEach(el => {
        const on = d.engaged.includes(el);
        const grp = parts.clutches[el];
        grp.visible = on;
    });

    // ── Shafts: colored by velocity
    const inpCol = sColor('input');
    parts.inputShaft.traverse(ch => {
        if (!ch.isMesh) return;
        ch.material.color.setHex(inpCol);
        ch.material.emissive.setHex(0x1a0a00);
        ch.material.emissiveIntensity = 0.2;
    });
    const outCol = sColor('output');
    parts.outputShaft.traverse(ch => {
        if (!ch.isMesh) return;
        ch.material.color.setHex(outCol);
        ch.material.emissive.setHex(0x0a1a00);
        ch.material.emissiveIntensity = 0.2;
    });

    // ── Torque drums: colored by velocity
    parts.drums.forEach(dr => {
        if (!dr.speedKey || !dr.drumMat) return;
        const col = sColor(dr.speedKey);
        dr.drumMat.color.setHex(col);
        dr.drumMat.needsUpdate = true;
        // All cage bar/flange meshes share drumMat, so color update above covers everything
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

    const V = animSpeed * 0.8;

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

    // Planets — orbit position + absolute rotation (carrier + rolling on sun)
    // Check which gear sets are locked (all elements same speed → no planet self-spin)
    const { engaged } = GEAR_DATA[currentGear];
    const gsLocked = [false, false, false, false];
    // Brakes A+B both engaged → GS1 sun=0, ring=0, carrier=0 → GS1 locked at zero
    if (engaged.includes('A') && engaged.includes('B')) gsLocked[0] = true;
    // Clutch E locks GS3 (sun = ring = carrier)
    if (engaged.includes('E')) gsLocked[2] = true;
    // 6th gear (direct drive) — everything locked at 1:1
    if (currentGear === '6') { gsLocked[0] = gsLocked[1] = gsLocked[2] = gsLocked[3] = true; }

    parts.planets.forEach(p => {
        const cs = curSpeeds[`gs${p.idx + 1}_carrier`] || 0;
        const ss = curSpeeds[`gs${p.idx + 1}_sun`] || 0;
        p.angle += cs * V * dt;
        p.mesh.position.y = Math.cos(p.angle) * p.orbitR;
        p.mesh.position.z = Math.sin(p.angle) * p.orbitR;

        if (gsLocked[p.idx]) {
            // Gear set is locked — planets just ride with the carrier, no self-spin
            p.mesh.rotation.x += cs * V * dt;
        } else {
            const sunT = GS_SPEC[p.idx].sun;
            p.mesh.rotation.x += (cs + (cs - ss) * (sunT / p.pTeeth)) * V * dt;
        }
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

    // Clutch rotation
    ['A','B','C','D','E'].forEach(el => {
        const g = parts.clutches[el];
        const speedKey = CLUTCH_SPEED_KEYS[el];
        g.rotation.x += (curSpeeds[speedKey] || 0) * V * dt;
    });

    controls.update();

    // Sync flow arrows rotation with model pivot
    flowGroup.quaternion.copy(modelPivot.quaternion);

    composer.render();

    // Render flow arrows on top — clear only depth, keep color from composer
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(flowScene, camera);
    renderer.autoClear = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS PERSISTENCE (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'zf8hp_settings';

function saveSettings() {
    const s = {};
    // Toggles
    ['show-tc','show-shafts','show-gears','show-gs1','show-gs2','show-gs3','show-gs4',
     'show-clutches','show-flow'].forEach(id => {
        s[id] = document.getElementById(id).checked;
    });
    // Sliders
    ['housing-opacity','inactive-opacity','drum-opacity','anim-speed'].forEach(id => {
        s[id] = document.getElementById(id).value;
    });
    // Current gear
    s.gear = currentGear;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function loadSettings() {
    let s;
    try { s = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch {}
    if (!s) return;

    // Toggles — set checkbox and fire change event
    ['show-tc','show-shafts','show-gears','show-gs1','show-gs2','show-gs3','show-gs4',
     'show-clutches','show-flow'].forEach(id => {
        if (s[id] !== undefined) {
            const el = document.getElementById(id);
            el.checked = s[id];
            el.dispatchEvent(new Event('change'));
        }
    });
    // Sliders — set value and fire input event
    ['housing-opacity','inactive-opacity','drum-opacity','anim-speed'].forEach(id => {
        if (s[id] !== undefined) {
            const el = document.getElementById(id);
            el.value = s[id];
            el.dispatchEvent(new Event('input'));
        }
    });
    // Gear
    if (s.gear) return s.gear;
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI WIRING
// ─────────────────────────────────────────────────────────────────────────────

document.querySelectorAll('.gear-btn').forEach(b =>
    b.addEventListener('click', () => { setGear(b.dataset.gear); saveSettings(); }));

document.getElementById('show-tc').addEventListener('change', e => { tcGroup.visible = e.target.checked; saveSettings(); });
document.getElementById('show-shafts').addEventListener('change', e => { shaftGrp.visible = e.target.checked; saveSettings(); });
document.getElementById('show-gears').addEventListener('change', e => { gearGrp.visible = e.target.checked; saveSettings(); });
document.getElementById('show-clutches').addEventListener('change', e => { clutchGrp.visible = e.target.checked; saveSettings(); });
document.getElementById('show-flow').addEventListener('change', e => { flowGroup.visible = e.target.checked; saveSettings(); });

document.getElementById('housing-opacity').addEventListener('input', e => {
    const v = e.target.value / 100;
    document.getElementById('opacity-val').textContent = `${e.target.value}%`;
    housingGrp.visible = v > 0.01;
    housingGrp.traverse(ch => { if (ch.isMesh && ch.material.transparent) ch.material.opacity = v; });
    saveSettings();
});

document.getElementById('anim-speed').addEventListener('input', e => {
    animSpeed = e.target.value / 100;
    document.getElementById('speed-val').textContent = `${e.target.value}%`;
    saveSettings();
});

document.getElementById('drum-opacity').addEventListener('input', e => {
    const v = e.target.value / 100;
    document.getElementById('drum-opacity-val').textContent = `${e.target.value}%`;
    parts.drums.forEach(d => {
        if (d.type === 'drum' && d.group) {
            d.group.traverse(ch => {
                if (!ch.isMesh) return;
                ch.material.opacity = v;
                ch.material.transparent = v < 0.99;
                ch.material.depthWrite = v >= 0.99;
                ch.material.needsUpdate = true;
                ch.visible = v > 0.01;
            });
        }
    });
    saveSettings();
});

// Per-gear-set visibility
['gs1','gs2','gs3','gs4'].forEach((id, i) => {
    document.getElementById(`show-${id}`).addEventListener('change', e => {
        parts.gsGroups[i].visible = e.target.checked;
        saveSettings();
    });
});

// Inactive (stopped) parts opacity
document.getElementById('inactive-opacity').addEventListener('input', e => {
    inactiveOpacity = e.target.value / 100;
    document.getElementById('inactive-opacity-val').textContent = `${e.target.value}%`;
    setGear(currentGear);
    saveSettings();
});

window.addEventListener('keydown', e => {
    if (e.key >= '1' && e.key <= '8') { setGear(e.key); saveSettings(); }
    if (e.key.toLowerCase() === 'r') { setGear('R'); saveSettings(); }
});

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
});

// ── GO ───────────────────────────────────────────────────────────────────────

const savedGear = loadSettings();
// Fire initial slider values so defaults (drum=0, housing=0) take effect
['housing-opacity','drum-opacity'].forEach(id => {
    document.getElementById(id).dispatchEvent(new Event('input'));
});
setGear(savedGear || '8');
animate();
