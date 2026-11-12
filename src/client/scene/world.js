// Город вокруг комплекса — по данным OpenStreetMap (реальные улицы, дома, газоны,
// ряды деревьев, арыки): Южная магистраль к северу, ул. Жеңишгүл к западу,
// ул. К. Тыналиева к востоку. Строится частями, чтобы заставка показывала прогресс.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import CONTEXT from '../../data/context.json';
import { ribbon, walk, rng } from './geo.js';
import * as T from './tex.js';
import { TIERS } from './engine.js';

const C = (h) => new THREE.Color(h);
const pause = () => new Promise((r) => setTimeout(r, 0));
const SITE = { x0: -62, x1: 46, z0: -14, z1: 62 }; // участок комплекса: здесь своё благоустройство

const ROAD_Y = { service: 0.04, living_street: 0.045, unclassified: 0.05, residential: 0.055, tertiary: 0.07, secondary: 0.08, primary_link: 0.09, primary: 0.1 };

function distToSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax; const vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}

// Стены по контуру: UV — периметр × высота (в метрах), чтобы окна ложились по этажам
function wallsGeo(pts, h) {
  const pos = []; const uv = []; const nor = []; const idx = [];
  let u = 0; let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i]; const b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 0.05) continue;
    const nx = ((b[1] - a[1]) / l) * sgn; const nz = (-(b[0] - a[0]) / l) * sgn;
    const k = pos.length / 3;
    pos.push(a[0], 0, a[1], b[0], 0, b[1], b[0], h, b[1], a[0], h, a[1]);
    uv.push(u, 0, u + l, 0, u + l, h, u, h);
    for (let j = 0; j < 4; j++) nor.push(nx, 0, nz);
    if (sgn > 0) idx.push(k, k + 2, k + 1, k, k + 3, k + 2); else idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    u += l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function roofGeo(pts, h) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))));
  g.rotateX(-Math.PI / 2); g.translate(0, h, 0);
  return g;
}
const paint = (g, c) => { const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const strip = (g) => { g.deleteAttribute('uv'); return g; };

// Кроны: «комковатые» сферы с затемнением снизу — читаются как листва, а не как шар
function crownGeo(rnd) {
  const parts = [];
  const blobs = [[0, 6.2, 0, 3.1], [1.6, 5.3, 0.6, 2.2], [-1.4, 5.6, -0.9, 2.3], [0.2, 7.7, -0.4, 2.0]];
  for (const [x, y, z, r] of blobs) {
    const g = mergeVertices(new THREE.IcosahedronGeometry(r, 1).deleteAttribute('uv').deleteAttribute('normal')); // 80 граней на «ком»: деревьев тысячи
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + Math.sin(p.getX(i) * 2.9 + p.getY(i) * 2.1) * Math.cos(p.getZ(i) * 2.5) * 0.13 + Math.sin(p.getX(i) * 7.3) * Math.sin(p.getY(i) * 6.1 + p.getZ(i) * 6.7) * 0.07 + (rnd() - 0.5) * 0.05;
      p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k * 0.9 + y, p.getZ(i) * k + z);
    }
    parts.push(g);
  }
  const g = mergeGeometries(parts); g.computeVertexNormals();
  const p = g.attributes.position; const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = (0.34 + 0.66 * THREE.MathUtils.smoothstep(p.getY(i), 3.0, 8.8)) * (0.82 + rnd() * 0.36); col.set([k, k * (0.96 + rnd() * 0.08), k * 0.9], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function spruceGeo() {
  const parts = [];
  for (let i = 0; i < 5; i++) { const k = i / 5; parts.push(new THREE.ConeGeometry(2.3 * (1 - k * 0.78), 3.6, 9, 1, true).translate(0, 2.6 + i * 2.05, 0)); }
  const g = mergeGeometries(parts); const p = g.attributes.position; const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getZ(i)); const k = 0.5 + 0.5 * Math.min(1, r / 1.6); col.set([k, k, k], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function carGeo() {
  const body = new THREE.BoxGeometry(1.85, 0.72, 4.5).translate(0, 0.62, 0);
  const cab = new THREE.BoxGeometry(1.62, 0.55, 2.3).translate(0, 1.25, -0.15);
  const wheels = [[-0.9, 1.45], [0.9, 1.45], [-0.9, -1.45], [0.9, -1.45]].map(([x, z]) => new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10).rotateZ(Math.PI / 2).translate(x, 0.34, z));
  paint(body, C('#ffffff')); paint(cab, C('#1a1d22')); wheels.forEach((w) => paint(w, C('#0c0c0d')));
  return mergeGeometries([body, cab, ...wheels].map((g) => (g.index ? g.toNonIndexed() : g)));
}

export async function buildWorld(engine, { progress = () => {} } = {}) {
  const { scene } = engine;
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const rnd = rng(42);
  const mtx = new THREE.Matrix4(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3(); const v = new THREE.Vector3(); const up = new THREE.Vector3(0, 1, 0);
  const inSite = (x, z, m = 0) => x > SITE.x0 - m && x < SITE.x1 + m && z > SITE.z0 - m && z < SITE.z1 + m;

  // ── земля
  const groundMat = new THREE.MeshStandardMaterial({ map: T.grass(), color: C('#9a987e'), roughness: 1, envMapIntensity: 0.25 });
  const gg = new THREE.CircleGeometry(60000, 72).rotateX(-Math.PI / 2);
  { const p = gg.attributes.position; const uv = gg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i)); }
  const ground = new THREE.Mesh(gg, groundMat); ground.receiveShadow = true; ground.position.y = -0.03; root.add(ground);

  // ── газоны (OSM)
  const lawnMat = new THREE.MeshStandardMaterial({ map: T.grass(), color: C('#a9b98a'), roughness: 1, envMapIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -1 });
  const lawns = CONTEXT.grass.map((pts) => { const g = roofGeo(pts, 0.02); const p = g.attributes.position; const uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i)); return g; });
  if (lawns.length) { const m = new THREE.Mesh(mergeGeometries(lawns), lawnMat); m.receiveShadow = true; root.add(m); }

  // ── дороги: асфальт, бордюр-тротуар, разметка
  const asphalt = new THREE.MeshStandardMaterial({ map: T.asphalt(), roughness: 0.93, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -3 });
  const walkMat = new THREE.MeshStandardMaterial({ map: T.pavers(), roughness: 0.9, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
  const roadG = []; const curbG = []; const markG = [];
  for (const r of CONTEXT.roads) {
    roadG.push(ribbon(r.pts, r.w, ROAD_Y[r.c] ?? 0.05));
    if (r.c === 'primary' || r.c === 'secondary' || r.c === 'tertiary') curbG.push(ribbon(r.pts, r.w + (r.c === 'primary' ? 5 : 4.4), 0.025));
    if (r.c === 'primary') {
      for (const off of [-r.w / 6, r.w / 6]) walk(r.pts, 12, (x, z, dx, dz) => { markG.push(new THREE.PlaneGeometry(0.16, 4).rotateX(-Math.PI / 2).rotateY(Math.atan2(dx, dz)).translate(x - dz * off, 0.125, z + dx * off)); });
      for (const off of [-r.w / 2 + 0.35, r.w / 2 - 0.35]) markG.push(strip(ribbon(r.pts, 0.14, 0.125, off)));
    } else if (r.c === 'secondary' || r.c === 'tertiary') {
      walk(r.pts, 9, (x, z, dx, dz) => { markG.push(new THREE.PlaneGeometry(0.14, 3).rotateX(-Math.PI / 2).rotateY(Math.atan2(dx, dz)).translate(x, 0.105, z)); });
    }
  }
  for (const p of CONTEXT.paths) curbG.push(ribbon(p.pts, p.w, 0.03));
  const waterG = CONTEXT.water.map((pts) => strip(ribbon(pts, 1.3, 0.035)));
  { const m = new THREE.Mesh(mergeGeometries(curbG), walkMat); m.receiveShadow = true; root.add(m); }
  { const m = new THREE.Mesh(mergeGeometries(roadG), asphalt); m.receiveShadow = true; root.add(m); }
  { const m = new THREE.Mesh(mergeGeometries(markG.map((g) => strip(g.index ? g.toNonIndexed() : g))), new THREE.MeshBasicMaterial({ color: C('#d9d6cc'), polygonOffset: true, polygonOffsetFactor: -4 })); root.add(m); }
  if (waterG.length) root.add(new THREE.Mesh(mergeGeometries(waterG), new THREE.MeshStandardMaterial({ color: C('#3d5a66'), roughness: 0.08, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -3 })));
  progress(0.25); await pause();

  // ── дома: частный сектор и многоэтажки Джала
  const wallCols = ['#e7e1d5', '#ddd6c8', '#cfc8bb', '#efeae2', '#d9cdbd', '#c9b9a6'].map(C);
  const roofCols = ['#8b5145', '#6c7a68', '#7f858a', '#a1917a', '#74564a', '#8f979b', '#5f6468'].map(C);
  const hW = []; const hR = []; const tW = []; const tR = [];
  for (const b of CONTEXT.buildings) {
    if (b.pts.length < 3) continue;
    const tower = b.lv > 4;
    const h = tower ? b.lv * 3 + 1.2 : b.lv * 3.1 + 0.4;
    if (tower) { tW.push(wallsGeo(b.pts, h)); tR.push(strip(roofGeo(b.pts, h))); } else {
      hW.push(paint(strip(wallsGeo(b.pts, h)), wallCols[Math.floor(rnd() * wallCols.length)]));
      hR.push(paint(strip(roofGeo(b.pts, h)), roofCols[Math.floor(rnd() * roofCols.length)]));
    }
  }
  const houseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, envMapIntensity: 0.3 });
  const towerMat = new THREE.MeshStandardMaterial({ map: T.towerFacade(false), emissiveMap: T.towerFacade(true), emissive: C('#ffffff'), emissiveIntensity: 0, roughness: 0.8, envMapIntensity: 0.4 });
  const roofMat = new THREE.MeshStandardMaterial({ color: C('#5c6064'), roughness: 0.95, envMapIntensity: 0.3 });
  for (const [list, mat] of [[[...hW, ...hR], houseMat], [tW, towerMat], [tR, roofMat]]) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), mat);
    m.castShadow = true; m.receiveShadow = true; root.add(m);
  }
  progress(0.5); await pause();

  // ── фонари Южной магистрали и огни улиц
  const lampPts = []; const glowPts = [];
  for (const r of CONTEXT.roads) {
    if (r.c === 'primary') walk(r.pts, 34, (x, z, dx, dz) => { const off = r.w / 2 + 1.6; lampPts.push([x - dz * off, z + dx * off, Math.atan2(dx, dz)]); });
    else if (r.c === 'residential' || r.c === 'tertiary' || r.c === 'secondary') walk(r.pts, 52, (x, z) => { if (Math.hypot(x, z) < 700 && rnd() < 0.8 && !inSite(x, z)) glowPts.push([x, z, 11]); });
  }
  const pole = mergeGeometries([new THREE.CylinderGeometry(0.08, 0.13, 10, 6).translate(0, 5, 0), new THREE.BoxGeometry(0.09, 0.09, 2.6).translate(0, 10, -1.2)]);
  const lampMat = new THREE.MeshStandardMaterial({ color: C('#b9bcb8'), roughness: 0.5, metalness: 0.6 });
  const lamps = new THREE.InstancedMesh(pole, lampMat, lampPts.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.14, 0.8).translate(0, 9.95, -2.4), new THREE.MeshStandardMaterial({ color: C('#d6d6ce'), emissive: C('#ffd9a0'), emissiveIntensity: 0 }), lampPts.length);
  lampPts.forEach(([x, z, a], i) => {
    q.setFromAxisAngle(up, a + Math.PI / 2); mtx.compose(v.set(x, 0, z), q, sc.set(1, 1, 1));
    lamps.setMatrixAt(i, mtx); heads.setMatrixAt(i, mtx);
    const h = new THREE.Vector3(0, 0, -2.4).applyQuaternion(q); glowPts.push([x + h.x, z + h.z, 17]);
  });
  lamps.castShadow = true; root.add(lamps, heads);
  const glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.glow(), color: C('#ffc98a'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 600);
  glow.renderOrder = 2; glow.visible = false; root.add(glow);
  const addGlow = (x, z, s) => glowPts.push([x, z, s]);

  // ── деревья
  const segs = [];
  for (const r of CONTEXT.roads) for (let i = 1; i < r.pts.length; i++) segs.push([...r.pts[i - 1], ...r.pts[i], r.w / 2 + 2.4]);
  const boxes = CONTEXT.buildings.map((b) => { let x0 = 1e9; let x1 = -1e9; let z0 = 1e9; let z1 = -1e9; for (const [x, z] of b.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0 - 2.5, x1 + 2.5, z0 - 2.5, z1 + 2.5]; });
  // сетка для быстрых проверок
  const cell = 40; const grid = new Map(); const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  segs.forEach((s) => { const n = Math.ceil(Math.hypot(s[2] - s[0], s[3] - s[1]) / 20) + 1; for (let i = 0; i <= n; i++) { const k = key(s[0] + ((s[2] - s[0]) * i) / n, s[1] + ((s[3] - s[1]) * i) / n); (grid.get(k) || grid.set(k, []).get(k)).push(s); } });
  const free = (x, z) => {
    if (inSite(x, z, 3)) return false;
    for (const [x0, x1, z0, z1] of boxes) if (x > x0 && x < x1 && z > z0 && z < z1) return false;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grid.get(`${Math.floor(x / cell) + i},${Math.floor(z / cell) + j}`); if (l) for (const s of l) if (distToSeg(x, z, s[0], s[1], s[2], s[3]) < s[4]) return false; }
    return true;
  };
  const trees = []; // [x, z, вид (0 — лиственное, 1 — ель), масштаб, обязательное]
  for (const row of CONTEXT.treeRows) walk(row, 8, (x, z) => { if (!inSite(x, z, 2)) trees.push([x, z, 0, 0.8 + rnd() * 0.35, 1]); }, 2);
  // ели вдоль Южной магистрали — как на визуализациях
  for (const r of CONTEXT.roads) if (r.c === 'primary') walk(r.pts, 13, (x, z, dx, dz) => { const off = -(r.w / 2 + 3.2); const tx = x - dz * off; const tz = z + dx * off; if (Math.abs(tx) < 700 && free(tx, tz)) trees.push([tx, tz, 1, 0.75 + rnd() * 0.3, 1]); });
  const must = trees.length;
  const N = 2600; const R = 640;
  for (let i = 0; i < N * 4 && trees.length < must + N; i++) {
    const a = rnd() * 6.283; const d = Math.sqrt(rnd()) * R; const x = Math.cos(a) * d; const z = Math.sin(a) * d;
    if (!free(x, z)) continue;
    trees.push([x, z, rnd() < 0.16 ? 1 : 0, 0.6 + rnd() * 0.75, 0]);
    if (i % 900 === 0) { progress(0.5 + 0.4 * ((trees.length - must) / N)); await pause(); }
  }
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.15 });
  const cGeo = crownGeo(rnd); const sGeo = spruceGeo(); const tGeo = new THREE.CylinderGeometry(0.17, 0.26, 4.6, 6).translate(0, 2.3, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: C('#4f4034'), roughness: 1 });
  const greens = ['#5d7440', '#667c45', '#536a3b', '#71844a', '#5f7340', '#7a8249'].map(C);
  const blues = ['#3f5a45', '#3a5344', '#4a6350'].map(C);
  // два набора: город (число зависит от уровня качества) и участок комплекса (всегда целиком)
  const forest = (cap) => {
    const set = { crowns: new THREE.InstancedMesh(cGeo, leafMat, cap), spruces: new THREE.InstancedMesh(sGeo, leafMat, cap), trunks: new THREE.InstancedMesh(tGeo, trunkMat, cap), nc: 0, ns: 0, nt: 0 };
    for (const m of [set.crowns, set.spruces, set.trunks]) { m.castShadow = true; m.receiveShadow = true; m.count = 0; root.add(m); }
    set.plant = (x, z, kind, sz) => {
      q.setFromAxisAngle(up, rnd() * 6.283); mtx.compose(v.set(x, 0, z), q, sc.set(sz, sz * (0.88 + rnd() * 0.3), sz));
      set.trunks.setMatrixAt(set.nt++, mtx);
      if (kind) { set.spruces.setMatrixAt(set.ns, mtx); set.spruces.setColorAt(set.ns++, blues[Math.floor(rnd() * blues.length)]); } else { set.crowns.setMatrixAt(set.nc, mtx); set.crowns.setColorAt(set.nc++, greens[Math.floor(rnd() * greens.length)]); }
    };
    set.sync = (nc = set.nc, ns = set.ns, nt = set.nt) => { set.crowns.count = nc; set.spruces.count = ns; set.trunks.count = nt; for (const m of [set.crowns, set.spruces, set.trunks]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); } };
    return set;
  };
  const city = forest(trees.length); const own = forest(120);
  const prefix = [];
  trees.forEach(([x, z, kind, sz]) => { city.plant(x, z, kind, sz); prefix.push([city.nc, city.ns, city.nt]); });
  const addTree = (x, z, kind = 0, sz = 1) => own.plant(x, z, kind, sz);
  function setTier(tier) {
    const k = Math.max(must, Math.floor(must + (trees.length - must) * TIERS[tier].trees));
    city.sync(...(prefix[k - 1] || [0, 0, 0]));
    engine.updateShadows();
  }

  // ── машины на магистрали и улицах
  const carCols = ['#eeeeec', '#1c1e21', '#8f959b', '#6d1c1c', '#1d3048', '#d9d6cf', '#34383d', '#b8bcc0'].map(C);
  const cars = new THREE.InstancedMesh(carGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.55, envMapIntensity: 0.9 }), 160);
  let ncar = 0;
  function addCar(x, z, angle) { if (ncar >= 160) return; q.setFromAxisAngle(up, angle); cars.setMatrixAt(ncar, mtx.compose(v.set(x, 0, z), q, sc.set(1, 1, 1))); cars.setColorAt(ncar++, carCols[Math.floor(rnd() * carCols.length)]); cars.count = ncar; }
  for (const r of CONTEXT.roads) {
    if (r.c !== 'primary' && r.c !== 'tertiary') continue;
    walk(r.pts, r.c === 'primary' ? 46 : 70, (x, z, dx, dz) => { if (Math.hypot(x, z) > 620 || rnd() < 0.35) return; const off = (rnd() < 0.5 ? -1 : 1) * (r.c === 'primary' ? r.w / 3 : 1.7); addCar(x - dz * off, z + dx * off + 0, Math.atan2(dx, dz) + (r.c === 'primary' ? 0 : off > 0 ? 0 : Math.PI)); }, 10 + rnd() * 30);
  }
  cars.count = ncar; cars.castShadow = true; cars.receiveShadow = true; root.add(cars);
  progress(1);

  // подписи улиц и остановок
  const labels = [];
  const seen = new Set();
  for (const r of CONTEXT.roads) {
    if (!r.name || seen.has(r.name)) continue;
    let best = null; let bd = 1e9;
    walk(r.pts, 10, (x, z) => { const d = Math.abs(Math.hypot(x + 8, z - 13) - (r.c === 'primary' ? 190 : 150)); if (d < bd && Math.hypot(x, z) < 420) { bd = d; best = [x, z]; } });
    if (best && bd < 90) { seen.add(r.name); labels.push({ text: r.name, pos: new THREE.Vector3(best[0], 3, best[1]), kind: 'road' }); }
  }
  for (const s of CONTEXT.stops) if (Math.hypot(s.p[0], s.p[1]) < 140) labels.push({ text: `Остановка «${s.name}»`, pos: new THREE.Vector3(s.p[0], 4, s.p[1]), kind: 'stop' });

  function finish() {
    glow.count = Math.min(600, glowPts.length);
    glowPts.slice(0, 600).forEach(([x, z, sz], i) => glow.setMatrixAt(i, mtx.compose(v.set(x, 0.3, z), q.identity(), sc.set(sz, 1, sz))));
    glow.instanceMatrix.needsUpdate = true;
    cars.instanceMatrix.needsUpdate = true; if (cars.instanceColor) cars.instanceColor.needsUpdate = true; cars.computeBoundingSphere();
    own.sync();
    setTier(engine.tier);
  }
  function setNight(n) {
    towerMat.emissiveIntensity = 1.5 * n;
    heads.material.emissiveIntensity = 5 * n;
    glow.material.opacity = 0.8 * n; glow.visible = n > 0.02;
  }

  return { root, labels, attribution: CONTEXT.attribution, setNight, setTier, finish, addTree, addCar, addGlow, mats: { asphalt, walkMat, lawnMat, leafMat } };
}
