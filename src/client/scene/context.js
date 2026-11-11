// Окружение комплекса по данным OpenStreetMap: дороги, соседние дома, деревья,
// фонари вдоль Южной магистрали; участок комплекса — парковка, двор, площадка.
// Ночью: окна в домах, фонари и световые пятна на дорогах.
// Строится частями с паузами, чтобы предзагрузчик успевал показывать прогресс.
import * as THREE from 'three';
import { mergeGeometries as mergeRaw } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import CONTEXT from '../../data/context.json';
import { ORIGIN } from '../../data/building.js';
import { TIERS } from './engine.js';

// склейка с приведением к единому виду (индексированные + неиндексированные)
const mergeGeometries = (list) => mergeRaw(list.some((g) => !g.index) ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list);
const C = (h) => new THREE.Color(h);
const pause = () => new Promise((r) => setTimeout(r, 0));

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Лента вдоль полилинии (дорога, разметка, тротуар)
function ribbon(pts, w, y) {
  const pos = []; const idx = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0]; let tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = -tz; const nz = tx;
    pos.push(p[0] + nx * w / 2, y, p[1] + nz * w / 2, p[0] - nx * w / 2, y, p[1] - nz * w / 2);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1; // нормали всегда вверх
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

function walk(pts, step, fn) {
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]; const [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (!len) continue;
    const dx = (bx - ax) / len; const dz = (bz - az) / len;
    let d = step - carry;
    while (d <= len) { fn(ax + dx * d, az + dz * d, dx, dz); d += step; }
    carry = (carry + len) % step;
  }
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax; const vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}

function slice(g, start, count) {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
  }
  return out;
}

// Ночные окна частных домов: 4×4 окна на плитку 12×12 м (этаж ≈ 3 м)
function houseWindows() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  const r = rng(9);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if (r() > 0.3) continue;
      g.globalAlpha = 0.6 + r() * 0.4;
      g.fillStyle = r() < 0.5 ? '#ffd296' : '#ffe6c0';
      g.fillRect(x * 64 + 20, y * 64 + 22, 24, 22);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 12, 1 / 12);
  return t;
}

function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ROAD_Y = { service: 0.03, unclassified: 0.04, residential: 0.05, tertiary: 0.07, secondary: 0.08, primary_link: 0.09, primary: 0.1, trunk: 0.1 };
const ROAD_COL = { primary: '#3d4045', trunk: '#3d4045', primary_link: '#45484d', secondary: '#4a4d52', tertiary: '#4f5257', residential: '#66676a', unclassified: '#66676a', service: '#7b7a76' };

export async function buildContext(engine, { progress = () => {} } = {}) {
  const { scene } = engine;
  const root = new THREE.Group();
  root.name = 'context';
  scene.add(root);
  const [ox, , oz] = ORIGIN;
  const rnd = rng(42);
  const mtx = new THREE.Matrix4(); const q = new THREE.Quaternion(); const s1 = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0); const v = new THREE.Vector3();

  // ── дороги
  const byCol = new Map();
  const walks = []; const lanes = [];
  for (const r of CONTEXT.roads) {
    const key = ROAD_COL[r.c];
    if (!byCol.has(key)) byCol.set(key, []);
    byCol.get(key).push(ribbon(r.pts, r.w, ROAD_Y[r.c] ?? 0.05));
    if (r.c === 'primary' || r.c === 'secondary' || r.c === 'tertiary') walks.push(ribbon(r.pts, r.w + (r.c === 'primary' ? 7 : 4), 0.015));
    if (r.c === 'primary') {
      walk(r.pts, 9, (x, z, dx, dz) => {
        const g2 = new THREE.PlaneGeometry(0.18, 3.2).rotateX(-Math.PI / 2);
        g2.rotateY(Math.atan2(dx, dz));
        g2.translate(x, 0.12, z);
        lanes.push(g2);
      });
    }
  }
  const roadMats = [];
  for (const [col, list] of byCol) {
    const mat = new THREE.MeshLambertMaterial({ color: C(col), polygonOffset: true, polygonOffsetFactor: -2 });
    roadMats.push(mat);
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.receiveShadow = true;
    root.add(m);
  }
  if (walks.length) {
    const m = new THREE.Mesh(mergeGeometries(walks), new THREE.MeshLambertMaterial({ color: C('#b9b4a8'), polygonOffset: true, polygonOffsetFactor: -1 }));
    m.receiveShadow = true;
    root.add(m);
  }
  if (lanes.length) root.add(new THREE.Mesh(mergeGeometries(lanes), new THREE.MeshBasicMaterial({ color: C('#e9e6dd') })));
  progress(0.2);
  await pause();

  // ── соседние дома (OSM): стены и кровли раздельно — ночью в стенах горят окна
  const roofs = ['#8e4a3d', '#6f7d6b', '#8a8e93', '#a99a80', '#7c5a48', '#9aa2a6'].map(C);
  const wallCols = ['#ece6da', '#e3dccd', '#d9d2c4', '#efeae2'].map(C);
  const caps = []; const sides = []; const polys = [];
  for (const b of CONTEXT.buildings) {
    const pts = b.pts;
    if (pts.length < 3) continue;
    polys.push(pts);
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const [g0, g1] = g.groups;
    if (!g0 || !g1) { g.dispose(); continue; }
    const roof = b.h > 12 ? wallCols[1] : roofs[Math.floor(rnd() * roofs.length)];
    const wall = wallCols[Math.floor(rnd() * wallCols.length)];
    const paint = (geo, c) => {
      const col = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return geo;
    };
    caps.push(paint(slice(g, g0.start, g0.count), roof));
    sides.push(paint(slice(g, g1.start, g1.count), wall));
    g.dispose();
  }
  const houseSide = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: C('#ffffff'), emissiveMap: houseWindows(), emissiveIntensity: 0 });
  for (const [list, mat] of [[caps, new THREE.MeshLambertMaterial({ vertexColors: true })], [sides, houseSide]]) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  progress(0.4);
  await pause();

  // ── участок комплекса (координаты относительно центра комплекса)
  const site = new THREE.Group();
  site.position.set(ox, 0, oz);
  root.add(site);
  const flat = (w, d, color, x, z, y = 0.03) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: C(color), polygonOffset: true, polygonOffsetFactor: -3 }));
    m.position.set(x, y, z);
    m.receiveShadow = true;
    site.add(m);
    return m;
  };
  flat(96, 82, '#d6d0c4', 0, 6, 0.02);
  flat(84, 11, '#55585c', 0, -24, 0.04);
  flat(84, 5, '#8da267', 0, -32.5, 0.04);
  flat(82, 34, '#93ab6d', 0, 27, 0.04);
  flat(4, 34, '#cfc8ba', 0, 27, 0.05);
  flat(82, 3.2, '#cfc8ba', 0, 21, 0.05);
  flat(22, 20, '#b8695a', -24, 32, 0.06);
  const circle = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: C('#5d86a8') }));
  circle.position.set(-27, 0.07, 30); circle.receiveShadow = true; site.add(circle);
  const marks = [];
  for (let x = -40; x <= 40; x += 2.7) marks.push(new THREE.PlaneGeometry(0.12, 4.6).rotateX(-Math.PI / 2).translate(x, 0.05, -26.5));
  site.add(new THREE.Mesh(mergeGeometries(marks), new THREE.MeshBasicMaterial({ color: C('#e8e4da') })));
  const carGeo = new THREE.BoxGeometry(1.8, 1.35, 4.4).translate(0, 0.75, 0);
  const cars = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }), 26);
  const carCols = ['#f2f2f0', '#1d1f22', '#9aa0a6', '#7c1f1f', '#1f3550', '#e9e6df', '#3b3f44'].map(C);
  let ci = 0;
  for (let x = -38.6; x <= 38.6 && ci < 26; x += 2.7) {
    if (rnd() < 0.42) continue;
    mtx.makeTranslation(x, 0, -26.5 + (rnd() - 0.5) * 0.4);
    cars.setMatrixAt(ci, mtx);
    cars.setColorAt(ci, carCols[Math.floor(rnd() * carCols.length)]);
    ci++;
  }
  cars.count = ci;
  cars.castShadow = true;
  site.add(cars);
  const fence = new THREE.MeshStandardMaterial({ color: C('#2a2d31'), roughness: 0.6 });
  for (const [w, d, x, z] of [[84, 0.08, 0, 44], [0.08, 34, -42, 27], [0.08, 34, 42, 27]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.8, d), fence);
    m.position.set(x, 0.9, z); m.castShadow = true; site.add(m);
  }
  const hedge = new THREE.Mesh(new THREE.BoxGeometry(84, 1, 1.1), new THREE.MeshLambertMaterial({ color: C('#3f5f34') }));
  hedge.position.set(0, 0.5, -34.5); hedge.castShadow = true; site.add(hedge);

  // ── фонари вдоль Южной магистрали + световые пятна (ночью)
  const lampPts = [];
  for (const r of CONTEXT.roads) {
    if (r.c !== 'primary') continue;
    walk(r.pts, 30, (x, z, dx, dz) => {
      const off = r.w / 2 + 2.2;
      lampPts.push([x - dz * off, z + dx * off, Math.atan2(dx, dz)]);
    });
  }
  const pole = new THREE.CylinderGeometry(0.09, 0.13, 9, 6).translate(0, 4.5, 0);
  const arm = new THREE.BoxGeometry(0.1, 0.1, 2.4).translate(0, 9, -1.1);
  const lamps = new THREE.InstancedMesh(mergeGeometries([pole, arm]), new THREE.MeshLambertMaterial({ color: C('#c9ccc7') }), lampPts.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.16, 0.7).translate(0, 8.95, -2.2),
    new THREE.MeshLambertMaterial({ color: C('#d8d8d0'), emissive: C('#ffd9a0'), emissiveIntensity: 0 }), lampPts.length);
  const glowPts = [];
  const head = new THREE.Vector3();
  lampPts.forEach(([x, z, a], i) => {
    q.setFromAxisAngle(up, a + Math.PI / 2);
    mtx.compose(v.set(x, 0, z), q, s1.set(1, 1, 1));
    lamps.setMatrixAt(i, mtx);
    heads.setMatrixAt(i, mtx);
    head.set(0, 0, -2.2).applyQuaternion(q);
    glowPts.push([x + head.x, z + head.z, 15]);
  });
  lamps.castShadow = true;
  root.add(lamps, heads);
  // дворовые и уличные огни частного сектора — только световые пятна
  for (const r of CONTEXT.roads) {
    if (r.c !== 'residential' && r.c !== 'tertiary' && r.c !== 'secondary') continue;
    walk(r.pts, 46, (x, z) => { if (Math.hypot(x, z) < 650 && rnd() < 0.8) glowPts.push([x, z, 10]); });
  }
  for (const [x, z] of [[-30, 12], [0, 14], [30, 12], [-30, 38], [0, 40], [30, 38], [-38, -30], [0, -30], [38, -30]]) glowPts.push([x + ox, z + oz, 9]);
  const glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: C('#ffc98a'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), glowPts.length);
  glowPts.forEach(([x, z, sz], i) => glow.setMatrixAt(i, mtx.compose(v.set(x, 0.25, z), q.identity(), s1.set(sz, 1, sz))));
  glow.renderOrder = 1;
  glow.visible = false;
  root.add(glow);
  progress(0.6);
  await pause();

  // ── деревья: вязы/карагачи (круглые кроны) и пирамидальные тополя
  const segs = [];
  for (const r of CONTEXT.roads) for (let i = 1; i < r.pts.length; i++) segs.push([...r.pts[i - 1], ...r.pts[i], r.w / 2 + 2.5]);
  const polyBoxes = polys.map((p) => {
    let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
    for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return [x0 - 2, x1 + 2, z0 - 2, z1 + 2];
  });
  const freeAt = (x, z) => {
    const lx = x - ox; const lz = z - oz;
    if (lx > -50 && lx < 50 && lz > -38 && lz < 48) return false;
    for (const [x0, x1, z0, z1] of polyBoxes) if (x > x0 && x < x1 && z > z0 && z < z1) return false;
    for (const [ax, az, bx, bz, w] of segs) if (distToSeg(x, z, ax, az, bx, bz) < w) return false;
    return true;
  };
  const trees = [];
  const N = 1700; const R = 520;
  for (let i = 0; i < N * 3 && trees.length < N; i++) {
    const x = (rnd() * 2 - 1) * R; const z = (rnd() * 2 - 1) * R;
    if (Math.hypot(x, z) > R || !freeAt(x, z)) continue;
    trees.push([x, z, rnd() < 0.3 ? 1 : 0, 0.75 + rnd() * 0.6, false]);
    if (i % 600 === 0) { progress(0.6 + 0.3 * (trees.length / N)); await pause(); }
  }
  // обязательные — аллея на разделительной полосе магистрали и двор комплекса
  for (const r of CONTEXT.roads) {
    if (r.c !== 'primary') continue;
    walk(r.pts, 11, (x, z, dx, dz) => {
      const off = -(r.w / 2 + 2.6);
      const tx = x - dz * off; const tz = z + dx * off;
      if (Math.abs(tx) < 650) trees.unshift([tx, tz, 1, 0.8 + rnd() * 0.25, true]);
    });
  }
  for (const [x, z] of [[-6, 14], [8, 14], [22, 14], [36, 14], [-38, 18], [-38, 40], [10, 40], [26, 40], [38, 32], [14, 30], [30, 26], [-14, 41]]) trees.unshift([x + ox, z + oz, 0, 0.85 + rnd() * 0.3, true]);

  const crownGeo = new THREE.IcosahedronGeometry(1, 1).scale(3.2, 2.8, 3.2).translate(0, 6.5, 0);
  const poplarGeo = new THREE.ConeGeometry(1.5, 15, 7).translate(0, 10, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 4, 5).translate(0, 2, 0);
  const leafMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const crowns = new THREE.InstancedMesh(crownGeo, leafMat, trees.length);
  const poplars = new THREE.InstancedMesh(poplarGeo, leafMat, trees.length);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: C('#5b4a3a') }), trees.length);
  const greens = ['#4f6b3a', '#5c7a43', '#46613a', '#6b8348', '#58703f'].map(C);
  let nc = 0; let np = 0;
  const prefix = []; // сколько крон/тополей среди первых k деревьев — для уровня качества
  trees.forEach(([x, z, kind, sc], i) => {
    q.setFromAxisAngle(up, rnd() * Math.PI * 2);
    mtx.compose(v.set(x, 0, z), q, s1.set(sc, sc * (0.9 + rnd() * 0.3), sc));
    trunks.setMatrixAt(i, mtx);
    const col = greens[Math.floor(rnd() * greens.length)];
    if (kind) { poplars.setMatrixAt(np, mtx); poplars.setColorAt(np++, col); } else { crowns.setMatrixAt(nc, mtx); crowns.setColorAt(nc++, col); }
    prefix.push([nc, np]);
  });
  crowns.count = nc; poplars.count = np;
  for (const m of [crowns, poplars, trunks]) { m.castShadow = true; root.add(m); }
  function setTier(tier) {
    const k = Math.max(1, Math.floor(trees.length * TIERS[tier].trees));
    trunks.count = k;
    [crowns.count, poplars.count] = prefix[k - 1];
    engine.updateShadows();
  }
  setTier(engine.tier);
  progress(1);

  // подписи улиц — на улице примерно в 260 м от комплекса, чтобы не закрывать его
  const roadLabels = [];
  const seen = new Set();
  for (const r of CONTEXT.roads) {
    if (!r.name || seen.has(r.name)) continue;
    let best = null; let bd = Infinity;
    walk(r.pts, 10, (x, z) => { const d = Math.abs(Math.hypot(x - ox, z - oz) - 260); if (d < bd) { bd = d; best = [x, z]; } });
    if (best && bd < 120) { seen.add(r.name); roadLabels.push({ text: r.name, pos: new THREE.Vector3(best[0], 2, best[1]) }); }
  }

  const roadDay = roadMats.map((m) => m.color.clone());
  function setNight(n) {
    houseSide.emissiveIntensity = 1.25 * n;
    heads.material.emissiveIntensity = 4 * n;
    glow.material.opacity = 0.85 * n;
    glow.visible = n > 0.02;
    roadMats.forEach((m, i) => m.color.copy(roadDay[i]).multiplyScalar(1 - 0.25 * n));
    engine.invalidate();
  }

  return { root, roadLabels, attribution: CONTEXT.attribution, setNight, setTier, glow };
}
