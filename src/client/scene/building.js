// Процедурная модель комплекса по проектным визуализациям radian.kg:
// две башни (белый объём с пилонами и «короной» + полоса балконов + тёмный
// объём с террасой на кровле), общий двухэтажный стилобат с витринами.
// Все детали одного материала сливаются в одну геометрию (мало draw calls).
import * as THREE from 'three';
import { mergeGeometries as mergeRaw } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// склейка с приведением к единому виду (индексированные + неиндексированные)
const mergeGeometries = (list) => mergeRaw(list.some((g) => !g.index) ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list);
import { GEO, ORIGIN, UNITS, floorY, floorH, roofY, darkRoofY } from '../../data/building.js';

const C = (h) => new THREE.Color(h);
export const ROOM_COLORS = { 1: '#E3C88E', 2: '#9FBBA2', 3: '#93AFCB', 4: '#CFA0A0' };

// детерминированный «случайный» выбор горящих окон
const lit = (t, y, k) => {
  const v = Math.sin(t * 91.7 + y * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v) < 0.42;
};

// Текстура ночных окон для стеклянных объёмов: 5 пролётов × 14 этажей
function windowGrid() {
  const cols = 5; const rows = 14; const cw = 64; const rh = 40;
  const cv = document.createElement('canvas');
  cv.width = cols * cw; cv.height = rows * rh;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, cv.width, cv.height);
  const warm = ['#ffd59a', '#ffe2b8', '#ffc982', '#fff0d6'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453;
      const k = v - Math.floor(v);
      if (k > 0.46) continue;
      g.globalAlpha = 0.55 + k;
      g.fillStyle = warm[Math.floor(k * 100) % warm.length];
      g.fillRect(c * cw + 5, r * rh + 4, cw - 10, rh - 8);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBuilding(engine) {
  const { scene } = engine;
  const group = new THREE.Group();
  group.name = 'complex';
  group.position.set(...ORIGIN);
  scene.add(group);

  // Плоскость разреза: всё выше clipY не рисуется (поэтажный разрез, «влёт» в квартиру)
  const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5);
  const clip = { clippingPlanes: [cut], clipShadows: true };
  const M = {
    white: new THREE.MeshStandardMaterial({ color: C('#F1EEE8'), roughness: 0.82, ...clip }),
    dark: new THREE.MeshStandardMaterial({ color: C('#2E2926'), roughness: 0.78, ...clip }),
    frameL: new THREE.MeshStandardMaterial({ color: C('#6E655C'), roughness: 0.7, ...clip }),
    // стекло белых объёмов: ночью светятся окна (сетка 5 пролётов × 14 этажей)
    glassW: new THREE.MeshStandardMaterial({ color: C('#45596E'), roughness: 0.08, metalness: 0.72, envMapIntensity: 1.5, emissive: C('#ffe2b8'), emissiveMap: windowGrid(), emissiveIntensity: 0, ...clip }),
    // окна тёмных объёмов: часть «жилых» загорается ночью
    glass: new THREE.MeshStandardMaterial({ color: C('#45596E'), roughness: 0.08, metalness: 0.72, envMapIntensity: 1.5, ...clip }),
    glassL: new THREE.MeshStandardMaterial({ color: C('#45596E'), roughness: 0.08, metalness: 0.72, envMapIntensity: 1.5, emissive: C('#ffcf8f'), emissiveIntensity: 0, ...clip }),
    shop: new THREE.MeshStandardMaterial({ color: C('#3A4654'), roughness: 0.1, metalness: 0.75, envMapIntensity: 1.1, emissive: C('#3a2c18'), emissiveIntensity: 0.35, ...clip }),
    frame: new THREE.MeshStandardMaterial({ color: C('#383B40'), roughness: 0.55, metalness: 0.3, ...clip }),
    slab: new THREE.MeshStandardMaterial({ color: C('#E4E0D8'), roughness: 0.9, ...clip }),
    rail: new THREE.MeshStandardMaterial({ color: C('#A9BCCB'), roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false, ...clip }),
    deck: new THREE.MeshStandardMaterial({ color: C('#8C735B'), roughness: 0.85, ...clip }),
    green: new THREE.MeshLambertMaterial({ color: C('#567640'), flatShading: true, ...clip }),
    dim: new THREE.MeshStandardMaterial({ color: C('#1E2126'), roughness: 0.9, ...clip }),
  };
  const parts = Object.fromEntries(Object.keys(M).map((k) => [k, []]));
  const add = (mat, x0, x1, y0, y1, z0, z1) => {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parts[mat].push(g);
  };
  const tree = (x, y, z, s = 1) => {
    parts.green.push(new THREE.IcosahedronGeometry(1.1 * s, 0).scale(1, 1.15, 1).translate(x, y + 1.6 * s, z));
  };

  const P = GEO.podium;
  const fy = (f) => floorY(f);
  const RY = roofY;
  const DY = darkRoofY;

  // ── стилобат (1–2 этажи)
  const PH = 2 * P.fh;
  add('slab', P.x0, P.x1, PH - 0.35, PH + 0.25, P.z0, P.z1); // кровля стилобата
  add('dim', P.x0 + 0.6, P.x1 - 0.6, 0, PH - 0.35, P.z0 + 0.6, P.z1 - 0.6); // «интерьер» за стеклом
  // витрины: фасад, двор, торцы
  add('shop', P.x0 + 0.2, -3.6, 0.1, PH - 0.35, P.z0 + 0.1, P.z0 + 0.3);
  add('shop', 3.6, P.x1 - 0.2, 0.1, PH - 0.35, P.z0 + 0.1, P.z0 + 0.3);
  add('shop', -3.6, 3.6, P.fh + 0.1, PH - 0.35, P.z0 + 0.1, P.z0 + 0.3); // переход над въездом во двор
  add('dim', -3.4, 3.4, 0, P.fh, P.z0 + 0.3, P.z1 - 0.3); // проход во двор
  add('shop', P.x0 + 0.2, P.x1 - 0.2, 0.1, PH - 0.35, P.z1 - 0.3, P.z1 - 0.1);
  add('shop', P.x0 + 0.1, P.x0 + 0.3, 0.1, PH - 0.35, P.z0 + 0.2, P.z1 - 0.2);
  add('shop', P.x1 - 0.3, P.x1 - 0.1, 0.1, PH - 0.35, P.z0 + 0.2, P.z1 - 0.2);
  // межэтажный пояс, козырёк и колонны
  add('white', P.x0, P.x1, P.fh - 0.2, P.fh + 0.2, P.z0 - 0.1, P.z0 + 0.4);
  add('white', P.x0, P.x1, P.fh - 0.2, P.fh + 0.2, P.z1 - 0.4, P.z1 + 0.1);
  add('frame', P.x0 + 0.4, -3.6, P.fh - 0.45, P.fh - 0.25, P.z0 - 1.3, P.z0 + 0.1);
  add('frame', 3.6, P.x1 - 0.4, P.fh - 0.45, P.fh - 0.25, P.z0 - 1.3, P.z0 + 0.1);
  for (let x = P.x0; x <= P.x1 + 0.01; x += (P.x1 - P.x0) / 19) {
    add('white', x - 0.3, x + 0.3, 0, PH + 0.25, P.z0 - 0.35, P.z0 + 0.35);
    add('white', x - 0.3, x + 0.3, 0, PH + 0.25, P.z1 - 0.35, P.z1 + 0.35);
  }
  for (const x of [P.x0, P.x1]) for (let z = P.z0; z <= P.z1 + 0.01; z += (P.z1 - P.z0) / 6) add('white', x - 0.35, x + 0.35, 0, PH + 0.25, z - 0.3, z + 0.3);

  // ── башни
  const mir = (t, a, b) => (t === 1 ? [a, b] : [-b, -a]);
  for (const t of [1, 2]) {
    const X = (a, b) => mir(t, a, b);
    const W = GEO.white; const S = GEO.strip; const D = GEO.dark;
    const outer = t === 1 ? -1 : 1; // направление наружу по x

    // белый объём: стеклянное «ядро»
    add('glassW', ...X(W.x0, W.x1 - 0.35), PH, RY, W.z0 + 0.35, W.z1 - 0.35);
    // межэтажные тяги на стекле
    for (let f = GEO.firstRes; f <= GEO.topRes; f++) {
      const y = fy(f);
      add('frame', ...X(W.x0, W.x1 - 0.3), y - 0.08, y + 0.08, W.z0 + 0.28, W.z0 + 0.4);
      add('frame', ...X(W.x0, W.x1 - 0.3), y - 0.08, y + 0.08, W.z1 - 0.4, W.z1 - 0.28);
      add('frame', ...X(W.x1 - 0.42, W.x1 - 0.3), y - 0.08, y + 0.08, W.z0 + 0.35, W.z1 - 0.35);
    }
    // пилоны фасада и двора — 5 пролётов; на фасаде — от земли до «короны»
    const top = RY + GEO.crown;
    const ww = W.x1 - W.x0;
    for (let i = 0; i <= 5; i++) {
      const x = W.x0 + 0.35 + i * ((ww - 0.7) / 5);
      const half = i === 0 || i === 5 ? 0.45 : 0.3;
      add('white', ...X(x - half, x + half), 0, top, W.z0 - 0.5, W.z0 + 0.4);
      add('white', ...X(x - half, x + half), PH, top, W.z1 - 0.4, W.z1 + 0.5);
    }
    const dd = W.z1 - W.z0;
    for (let i = 0; i <= 5; i++) {
      const z = W.z0 + 0.35 + i * ((dd - 0.7) / 5);
      add('white', ...X(W.x1 - 0.4, W.x1 + 0.5), PH, top, z - 0.3, z + 0.3);
    }
    // «корона»: верхний пояс и кровля
    add('white', ...X(W.x0, W.x1 + 0.5), top - 0.8, top, W.z0 - 0.5, W.z0 + 0.4);
    add('white', ...X(W.x0, W.x1 + 0.5), top - 0.8, top, W.z1 - 0.4, W.z1 + 0.5);
    add('white', ...X(W.x1 - 0.4, W.x1 + 0.5), top - 0.8, top, W.z0, W.z1);
    add('white', ...X(S.x0, W.x0 + 0.5), top - 0.8, top, W.z0 - 0.5, W.z1 + 0.5);
    add('slab', ...X(S.x0, W.x1 - 0.3), RY - 0.1, RY + 0.35, W.z0 + 0.3, W.z1 - 0.3);
    add('frame', ...X(W.x0 + 4, W.x0 + 9), RY + 0.35, RY + 2.4, W.z0 + 6, W.z0 + 11);
    add('rail', ...X(W.x0 + 0.5, W.x1 - 0.5), RY + 0.35, RY + 1.45, W.z0 + 0.45, W.z0 + 0.55);

    // полоса балконов между объёмами
    add('glassW', ...X(S.x0, S.x1), PH, RY, S.z0 + 1.6, S.z1 - 1.6);
    for (let f = GEO.firstRes; f <= GEO.topRes; f++) {
      const y = fy(f);
      add('slab', ...X(S.x0, S.x1), y - 0.12, y + 0.12, S.z0 - 0.4, S.z0 + 1.6);
      add('slab', ...X(S.x0, S.x1), y - 0.12, y + 0.12, S.z1 - 1.6, S.z1 + 0.4);
      add('rail', ...X(S.x0 + 0.05, S.x1 - 0.05), y + 0.12, y + 1.2, S.z0 - 0.4, S.z0 - 0.32);
      add('rail', ...X(S.x0 + 0.05, S.x1 - 0.05), y + 0.12, y + 1.2, S.z1 + 0.32, S.z1 + 0.4);
    }
    add('slab', ...X(S.x0, S.x1), RY - 0.12, RY + 0.2, S.z0 - 0.4, S.z1 + 0.4);

    // тёмный объём: сетка окон, французские балконы, терраса на кровле
    add('dark', ...X(D.x0, D.x1), PH, DY, D.z0, D.z1);
    const win = (cx, y, face, along) => {
      // face: 'front' | 'back' | 'side'; along — x (для фасадов) или z (для торца)
      const w = 1.4; const h0 = y + 0.35; const h1 = y + 2.75;
      if (face === 'side') {
        const xs = t === 1 ? D.x0 : -D.x0;
        const o = outer;
        add('frameL', xs + o * -0.02, xs + o * 0.06, h0 - 0.14, h1 + 0.14, along - w - 0.14, along + w + 0.14);
        add(lit(t, y, along) ? 'glassL' : 'glass', xs + o * 0.04, xs + o * 0.1, h0, h1, along - w, along + w);
      } else {
        const z = face === 'front' ? D.z0 : D.z1;
        const s = face === 'front' ? -1 : 1;
        add('frameL', ...X(cx - w - 0.14, cx + w + 0.14), h0 - 0.14, h1 + 0.14, z + s * -0.02, z + s * 0.06);
        add(lit(t, y, cx + z) ? 'glassL' : 'glass', ...X(cx - w, cx + w), h0, h1, z + s * 0.04, z + s * 0.1);
      }
    };
    const dw = D.x1 - D.x0;
    for (let f = GEO.firstRes; f <= GEO.dark.topFloor; f++) {
      const y = fy(f);
      for (let i = 0; i < 3; i++) {
        const cx = D.x0 + dw * (i + 0.5) / 3;
        win(cx, y, 'front');
        win(cx, y, 'back');
      }
      for (let i = 0; i < 5; i++) win(0, y, 'side', D.z0 + (D.z1 - D.z0) * (i + 0.5) / 5);
      // французский балкон в среднем окне фасада
      const cx = D.x0 + dw / 2;
      add('slab', ...X(cx - 1.7, cx + 1.7), y + 0.1, y + 0.28, D.z0 - 1.1, D.z0);
      add('rail', ...X(cx - 1.65, cx + 1.65), y + 0.28, y + 1.3, D.z0 - 1.1, D.z0 - 1.02);
    }
    // парапет и терраса на кровле тёмного объёма (её использует квартира 15-го этажа)
    add('dark', ...X(D.x0, D.x1), DY, DY + 0.45, D.z0, D.z0 + 0.3);
    add('dark', ...X(D.x0, D.x1), DY, DY + 0.45, D.z1 - 0.3, D.z1);
    add('dark', ...X(D.x0, D.x0 + 0.3), DY, DY + 0.45, D.z0, D.z1);
    add('rail', ...X(D.x0 + 0.05, D.x1), DY + 0.45, DY + 1.5, D.z0 + 0.05, D.z0 + 0.15);
    add('rail', ...X(D.x0 + 0.05, D.x1), DY + 0.45, DY + 1.5, D.z1 - 0.15, D.z1 - 0.05);
    add('rail', ...X(D.x0 + 0.05, D.x0 + 0.15), DY + 0.45, DY + 1.5, D.z0, D.z1);
    add('deck', ...X(D.x0 + 0.3, D.x1), DY, DY + 0.08, D.z0 + 0.3, D.z1 - 0.3);
    for (const [px, pz] of [[D.x0 + 2, D.z0 + 2.2], [D.x0 + 2, D.z1 - 2.2], [D.x0 + 6.5, D.z1 - 2.2], [D.x0 + 2, (D.z0 + D.z1) / 2]]) {
      const [a] = X(px - 1, px + 1);
      add('green', a, a + 2, DY, DY + 0.7, pz - 1, pz + 1);
      tree(a + 1, DY + 0.7, pz, 0.8);
    }
    // озеленённая терраса стилобата перед тёмным объёмом
    add('green', ...X(D.x0 + 0.4, D.x1 - 0.4), PH + 0.25, PH + 0.75, P.z0 + 0.3, D.z0 - 0.2);
    for (let i = 0; i < 4; i++) {
      const [a, b] = X(D.x0 + 1.5 + i * 3.4, D.x0 + 1.6 + i * 3.4);
      tree((a + b) / 2, PH + 0.75, (P.z0 + D.z0) / 2, 0.65);
    }
  }

  const meshes = {};
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), M[k]);
    m.castShadow = k !== 'rail';
    m.receiveShadow = true;
    m.name = `complex-${k}`;
    if (k === 'rail') m.renderOrder = 2;
    group.add(m);
    meshes[k] = m;
    list.forEach((g) => g.dispose());
  }

  // ── квартиры: невидимые объёмы для выбора + подсветка
  const SEC = { x0: GEO.strip.x0, x1: GEO.white.x1, z0: GEO.white.z0, z1: GEO.white.z1 };
  const unitBox = (u, grow = 0.7) => {
    const b = u.box;
    const sx0 = u.tower === 1 ? SEC.x0 : -SEC.x1;
    const sx1 = u.tower === 1 ? SEC.x1 : -SEC.x0;
    const e = (v, edge, d) => (Math.abs(v - edge) < 0.01 ? d : 0);
    const x0 = b.x0 - (e(b.x0, sx0, grow) || -0.06);
    const x1 = b.x1 + (e(b.x1, sx1, grow) || -0.06);
    const z0 = b.z0 - (e(b.z0, SEC.z0, grow) || -0.06);
    const z1 = b.z1 + (e(b.z1, SEC.z1, grow) || -0.06);
    const y0 = floorY(u.floor) + 0.05;
    const y1 = floorY(u.floor) + floorH(u.floor) - 0.05;
    return { x0, x1, y0, y1, z0, z1 };
  };
  const unitMatrix = (u, grow) => {
    const b = unitBox(u, grow);
    return new THREE.Matrix4().compose(
      new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2),
      new THREE.Quaternion(),
      new THREE.Vector3(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0),
    );
  };
  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const hit = new THREE.InstancedMesh(unitBoxGeo, new THREE.MeshBasicMaterial({ visible: false }), UNITS.length);
  UNITS.forEach((u, i) => hit.setMatrixAt(i, unitMatrix(u, 0.8)));
  hit.name = 'units-hit';
  group.add(hit);

  const hlMat = new THREE.MeshBasicMaterial({ color: C('#D2AB67'), transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, clippingPlanes: [cut] });
  const hl = new THREE.InstancedMesh(unitBoxGeo, hlMat, UNITS.length);
  hl.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  hl.renderOrder = 3;
  hl.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  UNITS.forEach((u, i) => { hl.setMatrixAt(i, zero); hl.setColorAt(i, C('#D2AB67')); });
  group.add(hl);

  const hovMat = new THREE.MeshBasicMaterial({ color: C('#F3D9A4'), transparent: true, opacity: 0.62, depthWrite: false, clippingPlanes: [cut] });
  const hov = new THREE.Mesh(unitBoxGeo, hovMat);
  hov.visible = false;
  hov.renderOrder = 4;
  const hovEdges = new THREE.LineSegments(new THREE.EdgesGeometry(unitBoxGeo), new THREE.LineBasicMaterial({ color: C('#FFFFFF'), transparent: true, opacity: 0.9 }));
  hov.add(hovEdges);
  group.add(hov);

  // Прочие цели для подсказок: апарт-часть и стилобат
  const extraHits = [];
  for (const t of [1, 2]) {
    const D = GEO.dark;
    const [x0, x1] = mir(t, D.x0 - 0.5, D.x1);
    const m = new THREE.Mesh(unitBoxGeo, hit.material);
    m.scale.set(x1 - x0, DY - PH, D.z1 - D.z0 + 1);
    m.position.set((x0 + x1) / 2, (DY + PH) / 2, (D.z0 + D.z1) / 2);
    m.userData.kind = 'apart';
    group.add(m);
    extraHits.push(m);
  }
  {
    const m = new THREE.Mesh(unitBoxGeo, hit.material);
    m.scale.set(P.x1 - P.x0 + 1, PH, P.z1 - P.z0 + 1);
    m.position.set(0, PH / 2, (P.z0 + P.z1) / 2);
    m.userData.kind = 'podium';
    group.add(m);
    extraHits.push(m);
  }

  // ── «крышка» разреза: перекрытие на высоте clipY
  const capMat = new THREE.MeshStandardMaterial({ color: C('#C9C0B0'), roughness: 1, envMapIntensity: 0.25 });
  const capParts = [];
  for (const t of [1, 2]) {
    const W = GEO.white; const S = GEO.strip; const D = GEO.dark;
    capParts.push({ box: [...mir(t, S.x0, W.x1), W.z0, W.z1], top: RY });
    capParts.push({ box: [...mir(t, D.x0, D.x1), D.z0, D.z1], top: DY });
  }
  capParts.push({ box: [P.x0, P.x1, P.z0, P.z1], top: PH });
  const caps = capParts.map(({ box: [x0, x1, z0, z1], top: tp }) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.3, z1 - z0), capMat);
    m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    m.userData.top = tp;
    m.receiveShadow = true;
    m.visible = false;
    group.add(m);
    return m;
  });

  // плитки квартир и перегородки — для поэтажного плана
  const tileMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), tileMat, 8);
  tiles.count = 0;
  tiles.receiveShadow = true;
  group.add(tiles);
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: C('#F4F1EC'), roughness: 0.8 }), 64);
  walls.count = 0;
  walls.castShadow = true;
  group.add(walls);

  let clipY = 1e5;
  let floorMode = null;
  // y — высота среза; capY — где положить «перекрытие», закрывающее разрез
  function setClip(y, capY = y) {
    clipY = y;
    cut.constant = y;
    for (const c of caps) {
      c.visible = !construction && y < c.userData.top - 0.05 && y > 0.5 && capY < c.userData.top;
      c.position.y = capY - 0.15;
    }
    refreshHL();
    engine.updateShadows();
  }

  // ── подсветка
  let hlSet = new Set();
  function refreshHL() {
    UNITS.forEach((u, i) => {
      const visible = hlSet.has(u.id) && floorY(u.floor) < clipY - 0.2 && !floorMode;
      hl.setMatrixAt(i, visible ? unitMatrix(u, 0.75) : zero);
    });
    hl.instanceMatrix.needsUpdate = true;
  }
  function highlight(ids) {
    hlSet = new Set(ids);
    refreshHL();
    engine.invalidate();
  }
  function hover(u) {
    if (!u) { hov.visible = false; engine.invalidate(); return; }
    const m = unitMatrix(u, floorMode ? 0.02 : 0.9);
    m.decompose(hov.position, hov.quaternion, hov.scale);
    if (floorMode) { hov.scale.y = 0.6; hov.position.y = floorY(u.floor) + 0.3; }
    hov.visible = true;
    engine.invalidate();
  }

  // ── поэтажный план: разрез + цветные плитки квартир
  function setFloorMode(f, tower = null) {
    floorMode = f;
    if (f == null) {
      tiles.count = 0; walls.count = 0;
      setClip(1e5);
      return [];
    }
    setClip(floorY(f) + 1.25, floorY(f));
    const list = UNITS.filter((u) => u.floor === f && (tower == null || u.tower === tower));
    const mm = new THREE.Matrix4();
    let wi = 0;
    list.forEach((u, i) => {
      const b = u.box;
      const y = floorY(f) + 0.02;
      mm.compose(new THREE.Vector3((b.x0 + b.x1) / 2, y + 0.04, (b.z0 + b.z1) / 2), new THREE.Quaternion(), new THREE.Vector3(b.x1 - b.x0 - 0.5, 0.08, b.z1 - b.z0 - 0.5));
      tiles.setMatrixAt(i, mm);
      tiles.setColorAt(i, C(ROOM_COLORS[planRooms(u.plan)] || '#ddd'));
      // перегородки по периметру квартиры (1,2 м — чтобы было видно сверху)
      for (const [x0, x1, z0, z1] of [[b.x0, b.x1, b.z0, b.z0 + 0.2], [b.x0, b.x1, b.z1 - 0.2, b.z1], [b.x0, b.x0 + 0.2, b.z0, b.z1], [b.x1 - 0.2, b.x1, b.z0, b.z1]]) {
        if (wi >= 64) break;
        mm.compose(new THREE.Vector3((x0 + x1) / 2, y + 0.6, (z0 + z1) / 2), new THREE.Quaternion(), new THREE.Vector3(x1 - x0, 1.2, z1 - z0));
        walls.setMatrixAt(wi++, mm);
      }
    });
    tiles.count = list.length;
    walls.count = wi;
    tiles.instanceMatrix.needsUpdate = true;
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
    walls.instanceMatrix.needsUpdate = true;
    refreshHL();
    engine.updateShadows();
    return list;
  }
  let planRooms = () => 1;

  // ── режим стройки: построено до уровня 1-го этажа, остальное — контур проекта
  let construction = false;
  const ghost = new THREE.Group();
  ghost.visible = false;
  group.add(ghost);
  {
    const edges = [];
    const vol = (x0, x1, y0, y1, z0, z1) => {
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      edges.push(new THREE.EdgesGeometry(g));
      g.dispose();
    };
    vol(P.x0, P.x1, 0, PH, P.z0, P.z1);
    for (const t of [1, 2]) {
      const W = GEO.white; const S = GEO.strip; const D = GEO.dark;
      for (let f = GEO.firstRes; f <= GEO.topRes; f++) vol(...mir(t, S.x0, W.x1), fy(f), fy(f + 1), W.z0, W.z1);
      for (let f = GEO.firstRes; f <= GEO.dark.topFloor; f++) vol(...mir(t, D.x0, D.x1), fy(f), fy(f + 1), D.z0, D.z1);
      vol(...mir(t, W.x0, W.x1), RY, RY + GEO.crown, W.z0, W.z1);
    }
    ghost.add(new THREE.LineSegments(mergeGeometries(edges), new THREE.LineBasicMaterial({ color: C('#D2AB67'), transparent: true, opacity: 0.55, depthWrite: false })));
    const veil = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: C('#F7F3EB'), transparent: true, opacity: 0.06, depthWrite: false }));
    veil.scale.set(P.x1 - P.x0, RY + GEO.crown, P.z1 - P.z0);
    veil.position.set(0, (RY + GEO.crown) / 2, (P.z0 + P.z1) / 2);
    ghost.add(veil);
    // выпуски арматуры/колонн над перекрытием 1-го этажа и башенный кран
    const stub = [];
    for (let x = P.x0 + 2; x < P.x1; x += 6) for (let z = P.z0 + 2; z < P.z1; z += 6) stub.push(new THREE.BoxGeometry(0.5, 1.6, 0.5).translate(x, P.fh + 0.8, z));
    const stubs = new THREE.Mesh(mergeGeometries(stub), new THREE.MeshStandardMaterial({ color: C('#9B978F'), roughness: 0.9 }));
    stubs.castShadow = true;
    ghost.add(stubs);
    const crane = [];
    const cx = 14; const cz = 22; const ch = 74;
    crane.push(new THREE.BoxGeometry(1.8, ch, 1.8).translate(cx, ch / 2, cz));
    crane.push(new THREE.BoxGeometry(62, 1.4, 1.4).translate(cx - 14, ch + 1, cz));
    crane.push(new THREE.BoxGeometry(5, 3, 3).translate(cx + 13, ch - 0.6, cz));
    crane.push(new THREE.BoxGeometry(2.4, 2.2, 2.4).translate(cx, ch - 1.6, cz + 1.6));
    crane.push(new THREE.BoxGeometry(0.1, 30, 0.1).translate(cx - 30, ch - 14, cz));
    const craneMesh = new THREE.Mesh(mergeGeometries(crane), new THREE.MeshStandardMaterial({ color: C('#D2AB67'), roughness: 0.55, metalness: 0.2 }));
    craneMesh.castShadow = true;
    ghost.add(craneMesh);
  }
  function setConstruction(on) {
    construction = on;
    ghost.visible = on;
    if (on) { floorMode = null; tiles.count = 0; walls.count = 0; setClip(P.fh + 0.25); } else setClip(1e5);
    for (const c of caps) c.visible = false;
    if (on) {
      const c = caps[caps.length - 1];
      c.visible = true;
      c.position.y = P.fh + 0.1; // перекрытие над 1-м этажом
    }
    engine.updateShadows();
  }

  const world = new THREE.Vector3();
  function unitCenter(u) {
    const b = u.box;
    return world.set((b.x0 + b.x1) / 2, floorY(u.floor) + floorH(u.floor) / 2, (b.z0 + b.z1) / 2).add(group.position).clone();
  }

  // ночь: светятся окна и витрины первого этажа
  const shopDay = C('#3a2c18'); const shopNight = C('#ffc27a');
  function setNight(n) {
    M.glassW.emissiveIntensity = 1.05 * n;
    M.glassL.emissiveIntensity = 0.95 * n;
    M.shop.emissive.lerpColors(shopDay, shopNight, n);
    M.shop.emissiveIntensity = 0.35 + 1.1 * n;
    engine.invalidate();
  }

  return {
    group, hit, extraHits, meshes, materials: M, setNight,
    highlight, hover, setClip, setFloorMode, setConstruction, unitCenter,
    get clipY() { return clipY; },
    get floorMode() { return floorMode; },
    setRoomsResolver(fn) { planRooms = fn; },
    unitAt(i) { return UNITS[i]; },
    PH, RY, DY,
  };
}
