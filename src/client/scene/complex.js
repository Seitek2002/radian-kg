// Комплекс RADIAN GROUP: геометрия по чертежам (оси, отметки) и визуализациям (фасады).
// Строится один корпус (западный, как на чертеже); восточный — тот же буфер,
// отражённый по оси симметрии. Координаты здесь — плана: px (восток), py (север), h (высота).
import * as THREE from 'three';
import { Builder, rng } from './geo.js';
import { createMaterials } from './materials.js';
import { LV, PLAN, MIRROR_X, SITE, PLAN_IMAGE, floorY } from '../../data/building.js';
import { asset } from '../base.js';

const A = PLAN.A; const B = PLAN.B;
const FLOORS_A = []; for (let f = 3; f <= 14; f++) FLOORS_A.push(f);
const FLOORS_B = []; for (let f = 3; f <= 15; f++) FLOORS_B.push(f);

export function createComplex(engine, shared) {
  const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5);
  const M = createMaterials(shared, cut);
  const b = new Builder();
  const rnd = rng(7);

  // ── помощники: коробка в координатах плана и элементы на фасаде
  const P = (name, x0, x1, h0, h1, y0, y1, faces) => b.box(name, x0, x1, h0, h1, -y1, -y0, faces);
  // фасад: N/S — плоскость py = c (вдоль px), E/W — плоскость px = c (вдоль py); d — наружу от плоскости
  const fbox = (name, F, a0, a1, h0, h1, d0, d1) => {
    const { s, c } = F;
    if (s === 'N') P(name, a0, a1, h0, h1, c + d0, c + d1);
    else if (s === 'S') P(name, a0, a1, h0, h1, c - d1, c - d0);
    else if (s === 'E') P(name, c + d0, c + d1, h0, h1, a0, a1);
    else P(name, c - d1, c - d0, h0, h1, a0, a1);
  };
  const NORMAL = { N: [0, 0, -1], S: [0, 0, 1], E: [1, 0, 0], W: [-1, 0, 0] };
  const fpt = (F, a, h, d) => {
    const { s, c } = F;
    if (s === 'N') return [a, h, -(c + d)];
    if (s === 'S') return [a, h, -(c - d)];
    if (s === 'E') return [c + d, h, -a];
    return [c - d, h, -a];
  };
  const pane = (name, F, a0, a1, h0, h1, d) => {
    const n = NORMAL[F.s]; const t = [n[2], 0, -n[0]];
    const c = fpt(F, (a0 + a1) / 2, (h0 + h1) / 2, d);
    const w = a1 - a0; const hh = h1 - h0;
    const p = (su, sv) => [c[0] + t[0] * su * w / 2, c[1] + sv * hh / 2, c[2] + t[2] * su * w / 2];
    b.quad(name, p(-1, -1), p(1, -1), p(1, 1), p(-1, 1), n, [0, 0, 1, 0, 1, 1, 0, 1], [1 + rnd() * 97, w, hh]);
  };
  // наклонная грань (откосы порталов): порядок вершин выбирается по наружной нормали
  const slope = (name, F, pts) => {
    const v = pts.map(([a, h, d]) => fpt(F, a, h, d));
    const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
    const e2 = [v[3][0] - v[0][0], v[3][1] - v[0][1], v[3][2] - v[0][2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(...n) || 1; n = n.map((k) => k / l);
    const o = NORMAL[F.s];
    const uv = pts.flatMap(([a, h]) => [a, h]);
    if (n[0] * o[0] + n[2] * o[2] < 0) {
      n = n.map((k) => -k);
      b.quad(name, v[3], v[2], v[1], v[0], n, [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]]);
    } else b.quad(name, v[0], v[1], v[2], v[3], n, uv);
  };
  // стена с проёмами: полосы между краями проёмов, в каждой — куски стены над и под проёмами
  const wall = (name, F, a0, a1, h0, h1, openings = [], t = 0.35, d = 0) => {
    const xs = [...new Set([a0, a1, ...openings.flatMap((o) => [o.a0, o.a1])].map((v) => Math.round(Math.min(a1, Math.max(a0, v)) * 1000) / 1000))].sort((p, q) => p - q);
    for (let i = 0; i < xs.length - 1; i++) {
      const s0 = xs[i]; const s1 = xs[i + 1];
      if (s1 - s0 < 0.002) continue;
      const os = openings.filter((o) => o.a0 <= s0 + 0.002 && o.a1 >= s1 - 0.002).sort((p, q) => p.h0 - q.h0);
      let h = h0;
      for (const o of os) {
        if (o.h0 > h + 0.002) fbox(name, F, s0, s1, h, Math.min(o.h0, h1), d - t, d);
        h = Math.max(h, o.h1);
      }
      if (h < h1 - 0.002) fbox(name, F, s0, s1, h, h1, d - t, d);
    }
  };
  // окно в проёме: тёмная рама, импосты, стекло с «комнатой»
  const win = (F, o, { r = 0.16, mull = 1, transom = 0, glass = 'glass', d = 0 } = {}) => {
    const { a0, a1, h0, h1 } = o;
    const f = 0.055; const z0 = d - r - 0.06; const z1 = d - r + 0.03;
    fbox('frame', F, a0, a0 + f, h0, h1, z0, z1);
    fbox('frame', F, a1 - f, a1, h0, h1, z0, z1);
    fbox('frame', F, a0 + f, a1 - f, h0, h0 + f, z0, z1);
    fbox('frame', F, a0 + f, a1 - f, h1 - f, h1, z0, z1);
    for (let i = 1; i <= mull; i++) {
      const x = a0 + ((a1 - a0) * i) / (mull + 1);
      fbox('frame', F, x - 0.025, x + 0.025, h0 + f, h1 - f, z0, z1);
    }
    if (transom) fbox('frame', F, a0 + f, a1 - f, h0 + (h1 - h0) * transom - 0.025, h0 + (h1 - h0) * transom + 0.025, z0, z1);
    pane(glass, F, a0 + f, a1 - f, h0 + f, h1 - f, d - r - 0.02);
  };
  // стеклянное ограждение
  const rail = (F, a0, a1, h, d, hh = 1.1) => {
    fbox('rail', F, a0, a1, h, h + hh, d - 0.012, d + 0.012);
    fbox('frame', F, a0, a1, h + hh, h + hh + 0.04, d - 0.03, d + 0.03);
  };
  // лоджия: ниша с плитой, ограждением и остеклением в глубине
  const loggia = (F, o, wallName, depth = 1.25) => {
    const { a0, a1, h0, h1 } = o;
    fbox(wallName, F, a0, a0 + 0.02, h0, h1, -depth, -0.35);
    fbox(wallName, F, a1 - 0.02, a1, h0, h1, -depth, -0.35);
    fbox('slab', F, a0, a1, h0 - 0.12, h0 + 0.03, -depth, 0);
    fbox('slab', F, a0, a1, h1 - 0.03, h1 + 0.1, -depth, -0.02);
    rail(F, a0, a1, h0 + 0.03, -0.06, 1.05);
    win(F, { a0: a0 + 0.02, a1: a1 - 0.02, h0: h0 + 0.03, h1: h1 - 0.03 }, { r: 0, d: -depth + 0.05, mull: 1 });
  };

  // ════════════════ СЕКЦИЯ Б — белая башня ════════════════
  const BN = { s: 'N', c: B.y1 }; const BS = { s: 'S', c: B.y0 }; const BE = { s: 'E', c: B.x1 }; const BW = { s: 'W', c: B.x0 };
  // северный фасад: 6 пилонов, 5 витражных полос; стекло утоплено на 0,45 м
  {
    const cols = [16.9, 18.35, 20.15, 21.5, 23.3, 24.65, 26.45, 27.8, 29.6, 30.95, 32.75, 34.3];
    const piers = [[0, 'stone'], [2, 'stone'], [4, 'perf'], [6, 'stone'], [8, 'perf'], [10, 'stone']];
    for (const [i, kind] of piers) {
      const a0 = cols[i]; const a1 = cols[i + 1];
      if (kind === 'stone') fbox('stone', BN, a0, a1, LV.podium, LV.parapetB, -0.6, 0);
      else {
        fbox('perf', BN, a0, a1, LV.podium, LV.f16, -0.5, -0.22);
        fbox('stone', BN, a0, a1, LV.f16, LV.parapetB, -0.6, 0);
      }
    }
    fbox('stone', BN, 16.9, 34.3, LV.roofB + 0.3, LV.parapetB, -0.6, 0); // верхний пояс
    fbox('stone', BN, 16.9, 34.3, LV.podium, LV.podium + 0.25, -0.6, -0.1); // пояс над стилобатом
    for (let k = 0; k < 5; k++) {
      const a0 = cols[1 + k * 2]; const a1 = cols[2 + k * 2];
      for (const f of FLOORS_B) {
        const y = floorY(f);
        fbox('spandrel', BN, a0, a1, y, y + 0.55, -0.56, -0.47);
        win(BN, { a0, a1, h0: y + 0.55, h1: y + 3.3 }, { r: 0.03, d: -0.45, mull: 1, transom: 0.68 });
      }
      // 16-й этаж: глубокие лоджии под «короной»
      const y = LV.f16;
      fbox('slab', BN, a0, a1, y - 0.1, y + 0.12, -1.7, -0.3);
      rail(BN, a0, a1, y + 0.12, -0.42, 1.0);
      win(BN, { a0, a1, h0: y + 0.12, h1: y + 2.75 }, { r: 0, d: -1.65, mull: 1 });
      fbox('stone', BN, a0, a1, y + 2.75, LV.roofB + 0.3, -1.7, -0.25);
    }
  }
  // южный фасад: 6 оконных полос с тёмными простенками
  {
    const cols = [14.8, 16.0, 17.5, 19.12, 20.62, 22.24, 23.74, 25.36, 26.86, 28.48, 29.98, 31.6, 33.1, 34.3];
    for (let i = 0; i < cols.length - 1; i += 2) {
      const kind = i === 4 || i === 8 ? 'perf' : 'stone';
      if (kind === 'stone') fbox('stone', BS, cols[i], cols[i + 1], 0, LV.parapetB, -0.5, 0);
      else { fbox('perf', BS, cols[i], cols[i + 1], LV.podium, LV.roofB, -0.42, -0.2); fbox('stone', BS, cols[i], cols[i + 1], 0, LV.podium, -0.5, 0); fbox('stone', BS, cols[i], cols[i + 1], LV.roofB, LV.parapetB, -0.5, 0); }
    }
    fbox('stone', BS, 14.8, 34.3, LV.roofB + 0.2, LV.parapetB, -0.5, 0);
    fbox('stone', BS, 14.8, 34.3, LV.podium - 0.3, LV.podium + 0.2, -0.5, -0.05);
    for (let k = 0; k < 6; k++) {
      const a0 = cols[1 + k * 2]; const a1 = cols[2 + k * 2];
      for (let f = 3; f <= 16; f++) {
        const y = floorY(f);
        fbox('spandrel', BS, a0, a1, y, y + 0.85, -0.46, -0.38);
        win(BS, { a0, a1, h0: y + 0.85, h1: y + 3.05 }, { r: 0.03, d: -0.36, mull: 1 });
        fbox('spandrel', BS, a0, a1, y + 3.05, y + 3.3, -0.46, -0.38);
      }
      // 1–2 этажи во двор
      const door = k === 1 || k === 4;
      win(BS, { a0, a1, h0: door ? 0.05 : 0.9, h1: 3.3 }, { r: 0.05, d: -0.36, mull: door ? 1 : 0, glass: 'glassShop' });
      fbox('spandrel', BS, a0, a1, 3.3, 4.7, -0.46, -0.38);
      win(BS, { a0, a1, h0: 4.7, h1: 7.6 }, { r: 0.05, d: -0.36, mull: 1 });
      fbox('stone', BS, a0, a1, 7.6, LV.podium - 0.3, -0.5, -0.3);
      if (door) { fbox('door', BS, a0 - 0.4, a1 + 0.4, 3.45, 3.6, 0, 1.5); fbox('frame', BS, a0 - 0.4, a1 + 0.4, 3.6, 3.66, 0, 1.5); }
    }
  }
  // восточный торец (к проходу между корпусами): глухой камень, внизу — металл
  wall('stone', BE, B.y0, B.y1, LV.podium, LV.parapetB, [
    { a0: 15.4, a1: 17.0, h0: LV.f16 + 0.7, h1: LV.f16 + 2.7 }, { a0: 26.2, a1: 27.8, h0: LV.f16 + 0.7, h1: LV.f16 + 2.7 },
  ]);
  win(BE, { a0: 15.4, a1: 17.0, h0: LV.f16 + 0.7, h1: LV.f16 + 2.7 }); win(BE, { a0: 26.2, a1: 27.8, h0: LV.f16 + 0.7, h1: LV.f16 + 2.7 });
  fbox('metal', BE, B.y0, B.y1, 0, LV.podium, -0.35, 0);
  // западная стена башни над кровлей секции А
  wall('stone', BW, B.y0, PLAN.stack.y0, LV.roofA, LV.parapetB, [
    { a0: 15.0, a1: 16.6, h0: LV.f16 + 0.7, h1: LV.f16 + 2.7 }, { a0: 22.6, a1: 24.2, h0: LV.f16 + 0.7, h1: LV.f16 + 2.7 },
  ]);
  win(BW, { a0: 15.0, a1: 16.6, h0: LV.f16 + 0.7, h1: LV.f16 + 2.7 }); win(BW, { a0: 22.6, a1: 24.2, h0: LV.f16 + 0.7, h1: LV.f16 + 2.7 });
  // ядро башни (чтобы свет не «протекал») и кровля
  P('roof', B.x0 + 0.3, B.x1 - 0.3, LV.roofB - 0.2, LV.roofB, B.y0 + 0.3, B.y1 - 0.5);
  P('slate', 22, 27, LV.roofB, LV.roofB + 2.2, 23, 28.5);
  P('metal', 17, 19.5, LV.roofB, LV.roofB + 1.1, 15, 18); P('metal', 29, 31.5, LV.roofB, LV.roofB + 1.1, 16, 19);

  // ════════════════ СТОПКА БАЛКОНОВ в углу ════════════════
  {
    const S = PLAN.stack; const top = LV.f16;
    const SW = { s: 'W', c: S.x0 }; const SN = { s: 'N', c: 29.6 };
    const ops = (a0, a1) => [...FLOORS_B].map((f) => ({ a0, a1, h0: floorY(f) + 0.1, h1: floorY(f) + 2.9 }));
    wall('slate', SW, S.y0, 29.6, LV.podium, top, ops(27.7, 29.3)); // западная стена кухни
    for (const o of ops(27.7, 29.3)) win(SW, o, { mull: 1 });
    wall('slate', SN, S.x0, S.x1, LV.podium, top, ops(14.0, 16.3)); // стена с балконной дверью
    for (const o of ops(14.0, 16.3)) win(SN, o, { mull: 1 });
    P('slate', S.x0 - 0.05, S.x0 + 0.4, LV.podium, top + 0.1, B.y1 - 0.45, B.y1 + 0.05); // угловая колонна
    for (const f of [...FLOORS_B, 16]) {
      const y = floorY(f);
      P('slate', S.x0 - 0.1, S.x1, y - 0.22, y + 0.02, 29.6, B.y1 + 0.1);
      P('slate', S.x0 - 0.1, S.x1, y + 0.02, y + 0.2, B.y1 - 0.05, B.y1 + 0.1); // бортик
      rail({ s: 'N', c: B.y1 }, S.x0 + 0.4, S.x1, y + 0.2, 0.02, 0.95);
      rail({ s: 'W', c: S.x0 }, 29.7, B.y1 - 0.45, y + 0.2, 0.05, 0.95);
    }
    // 16-й этаж над стопкой: белые стены башни
    wall('stone', SW, S.y0, 29.6, top, LV.parapetB, []);
    wall('stone', SN, S.x0, S.x1, top, LV.parapetB, [{ a0: 14.2, a1: 16.2, h0: top + 0.15, h1: top + 2.7 }]);
    win(SN, { a0: 14.2, a1: 16.2, h0: top + 0.15, h1: top + 2.7 });
    P('stone', S.x1 - 0.02, S.x1 + 0.3, LV.podium, LV.parapetB, 29.6, B.y1); // бок крайнего пилона
  }

  // ════════════════ СЕКЦИЯ А — коричневый объём ════════════════
  const AW = { s: 'W', c: A.x0 }; const AN = { s: 'N', c: A.y1 }; const AE = { s: 'E', c: A.xe };
  const top = LV.roofA;
  const fl = (a0, a1, lo = 0.6, hi = 2.75) => FLOORS_A.map((f) => ({ a0, a1, h0: floorY(f) + lo, h1: floorY(f) + hi }));
  // западный фасад
  {
    const W1 = fl(4.0, 6.6); const W2 = fl(7.6, 9.0); const W3 = fl(12.7, 14.2); const W4 = fl(16.6, 18.1); const W5 = fl(21.8, 23.3);
    const L1 = fl(10.0, 11.7, 0.15, 3.0); const L2 = fl(19.2, 20.9, 0.15, 3.0);
    const strip = [{ a0: 14.9, a1: 15.8, h0: LV.podium + 0.4, h1: top - 0.3 }];
    const bay = fl(24.4, 27.2, 0.75, 3.0);
    wall('brown', AW, 2.9, A.y1, LV.podium, top + 0.45, [...W1, ...W2, ...W3, ...W4, ...W5, ...L1, ...L2, ...strip, ...bay]);
    for (const o of W1) win(AW, o, { mull: 2 });
    for (const o of [...W2, ...W3, ...W4, ...W5]) win(AW, o, { mull: 1 });
    for (const o of [...L1, ...L2]) loggia(AW, o, 'brown');
    for (const o of bay) win(AW, o, { mull: 2, r: 0.1 });
    fbox('brownDark', AW, 14.9, 15.8, LV.podium + 0.4, top - 0.3, -0.2, -0.1);
    // белый торец у южного края
    const WE = fl(0.7, 2.1);
    wall('stone', AW, A.y0, 2.9, LV.podium, top + 0.45, WE);
    for (const o of WE) win(AW, o, { mull: 0 });
  }
  // северный фасад (к магистрали)
  {
    const bay = fl(-1.55, 0.3, 0.75, 3.0);
    const WA = fl(0.9, 2.7); const WB = fl(4.2, 6.0); const WC = fl(7.5, 9.3); const WD = fl(10.8, 12.6);
    const strips = [{ a0: 3.0, a1: 3.8, h0: LV.podium + 0.4, h1: top - 0.3 }, { a0: 9.6, a1: 10.4, h0: LV.podium + 0.4, h1: top - 0.3 }];
    wall('brown', AN, A.x0, 12.9, LV.podium, top + 0.45, [...bay, ...WA, ...WB, ...WC, ...WD, ...strips]);
    wall('slate', AN, 12.9, A.x1, LV.podium, top + 0.45, []);
    for (const o of bay) win(AN, o, { mull: 1, r: 0.1 });
    for (const o of [...WA, ...WB, ...WC, ...WD]) win(AN, o, { mull: 1 });
    for (const s of strips) fbox('brownDark', AN, s.a0, s.a1, s.h0, s.h1, -0.2, -0.1);
    // корзины кондиционеров под окнами через этаж
    FLOORS_A.forEach((f, i) => { if (i % 2) fbox('spandrel', AN, 4.2, 6.0, floorY(f) + 0.12, floorY(f) + 0.58, 0, 0.22); });
  }
  // южный торец с эркером и угловыми балконами
  {
    const yb = A.bay.y0; const AS = { s: 'S', c: yb }; const AS0 = { s: 'S', c: A.y0 };
    const cols = [[3.0, 4.6], [5.9, 7.3], [8.7, 10.2]];
    const ops = cols.flatMap(([a0, a1]) => FLOORS_A.map((f) => ({ a0, a1, h0: floorY(f), h1: floorY(f) + 3.3 })));
    wall('stone', AS, 1.7, 11.4, LV.podium - 0.3, top + 0.45, ops);
    for (const [a0, a1] of cols) {
      for (const f of FLOORS_A) {
        const y = floorY(f);
        fbox('spandrel', AS, a0, a1, y, y + 0.8, -0.3, -0.2);
        win(AS, { a0, a1, h0: y + 0.8, h1: y + 3.0 }, { mull: 1, r: 0.15 });
        fbox('spandrel', AS, a0, a1, y + 3.0, y + 3.3, -0.3, -0.2);
      }
    }
    // боковые стенки эркера и стены за балконами
    wall('stone', { s: 'W', c: 1.7 }, yb, A.y0, LV.podium - 0.3, top + 0.45, []);
    wall('stone', { s: 'E', c: 11.4 }, yb, A.y0, LV.podium - 0.3, top + 0.45, []);
    const doorsW = FLOORS_A.map((f) => ({ a0: -1.3, a1: 1.2, h0: floorY(f) + 0.1, h1: floorY(f) + 2.8 }));
    const doorsE = FLOORS_A.map((f) => ({ a0: 11.9, a1: 14.3, h0: floorY(f) + 0.1, h1: floorY(f) + 2.8 }));
    wall('stone', AS0, A.x0, 1.7, LV.podium, top + 0.45, doorsW);
    wall('stone', AS0, 11.4, A.xe, LV.podium, top + 0.45, doorsE);
    for (const o of [...doorsW, ...doorsE]) win(AS0, o, { mull: 1 });
    for (const f of FLOORS_A) {
      const y = floorY(f);
      P('slab', 0, 1.7, y - 0.2, y + 0.02, yb, A.y0); P('slab', 11.4, 13.1, y - 0.2, y + 0.02, yb, A.y0);
      rail(AS, 0, 1.7, y + 0.02, -0.03, 1.0); rail({ s: 'W', c: 0 }, yb, A.y0, y + 0.02, -0.03, 1.0);
      rail(AS, 11.4, 13.1, y + 0.02, -0.03, 1.0); rail({ s: 'E', c: 13.1 }, yb, A.y0, y + 0.02, -0.03, 1.0);
    }
    P('stone', 1.7, 11.4, LV.podium - 0.3, LV.podium, yb, A.y0); // низ эркера
    // 1–2 этажи: глухая стена с входом
    const g = [{ a0: 5.2, a1: 7.4, h0: 0.05, h1: 3.2 }, { a0: 1.2, a1: 2.6, h0: 4.9, h1: 7.2 }, { a0: 10.0, a1: 11.4, h0: 4.9, h1: 7.2 }];
    wall('stoneBase', AS0, PLAN.podium.x0, A.xe, 0, LV.podium, g);
    win(AS0, g[0], { mull: 1, glass: 'glassShop' }); win(AS0, g[1]); win(AS0, g[2]);
    fbox('door', AS0, 4.8, 7.8, 3.3, 3.45, 0, 1.4);
  }
  // восточный фасад южной части (во двор)
  {
    const W1 = fl(1.2, 2.6); const W2 = fl(8.3, 9.7); const D = fl(5.3, 6.9, 0.1, 2.8);
    wall('stone', AE, A.y0, A.ye, LV.podium, top + 0.45, [...W1, ...W2, ...D]);
    for (const o of [...W1, ...W2, ...D]) win(AE, o, { mull: 1 });
    for (const f of FLOORS_A) { const y = floorY(f); P('slab', A.xe, A.xe + 0.95, y - 0.18, y + 0.02, 5.0, 7.2); rail({ s: 'E', c: A.xe + 0.95 }, 5.0, 7.2, y + 0.02, -0.03, 1.0); rail({ s: 'S', c: 5.0 }, A.xe, A.xe + 0.95, y + 0.02, -0.03, 1.0); rail({ s: 'N', c: 7.2 }, A.xe, A.xe + 0.95, y + 0.02, -0.03, 1.0); }
    wall('brown', { s: 'N', c: A.ye }, 13.1, A.xe, 0, top + 0.45, []);
    wall('brown', { s: 'E', c: 13.1 }, A.ye, B.y0, 0, top + 0.45, []);
    const g = [{ a0: 1.4, a1: 3.4, h0: 0.9, h1: 3.2 }, { a0: 6.0, a1: 8.4, h0: 0.05, h1: 3.2 }, { a0: 1.4, a1: 3.4, h0: 4.9, h1: 7.4 }, { a0: 6.0, a1: 8.4, h0: 4.9, h1: 7.4 }];
    wall('stoneBase', AE, A.y0, A.ye, 0, LV.podium, g);
    for (const o of g) win(AE, o, { mull: 1, glass: o.h0 < 1 ? 'glassShop' : 'glass' });
  }
  // кровля секции А (+48,0): терраса, ограждение, зелень; отступающий 15-й этаж
  {
    P('roof', A.x0, A.xe, top - 0.2, top, A.bay.y0, A.y1);
    P('deck', A.x0 + 0.5, 13.0, top, top + 0.06, A.bay.y0 + 0.4, 6.6);
    rail(AW, A.y0, A.y1, top + 0.45, -0.1, 1.05); rail(AN, A.x0, A.x1, top + 0.45, -0.1, 1.05);
    rail({ s: 'S', c: A.bay.y0 }, 0, 13.1, top + 0.1, -0.05, 1.2); rail({ s: 'E', c: A.xe }, A.y0, A.ye, top + 0.45, -0.1, 1.05);
    P('hedge', A.x0 + 0.5, A.x0 + 1.3, top, top + 0.85, 7.4, 26.6); P('hedge', A.x0 + 1.4, 12.6, top, top + 0.85, 26.0, 26.8);
    P('hedge', 0.4, 12.6, top + 0.06, top + 0.75, A.bay.y0 + 0.4, A.bay.y0 + 1.1);
    // 15-й этаж — белый объём с отступом от фасадов
    const p0 = 1.0; const p1 = 13.4; const q0 = 7.0; const q1 = 25.2;
    const pw = (F, a0, a1, list) => { const os = list.map(([s0, s1]) => ({ a0: s0, a1: s1, h0: top + 0.5, h1: top + 2.75 })); wall('stone', F, a0, a1, top, LV.f16 + 0.5, os); for (const o of os) win(F, o, { mull: 1 }); };
    pw({ s: 'W', c: p0 }, q0, q1, [[8.4, 10.6], [12.6, 14.8], [17.2, 19.4], [21.6, 23.8]]);
    pw({ s: 'N', c: q1 }, p0, p1, [[2.4, 4.8], [6.8, 9.2], [10.8, 12.6]]);
    pw({ s: 'S', c: q0 }, p0, p1, [[2.2, 5.6], [7.4, 10.8]]);
    P('roof', p0, p1, LV.f16 + 0.3, LV.f16 + 0.5, q0, q1);
    P('slate', 6.2, 12.8, LV.f16 + 0.5, LV.f16 + 3.0, 12.8, 19.2); // лестничный выход
    P('hedge', p0 + 0.5, p0 + 1.2, LV.f16 + 0.5, LV.f16 + 1.2, q0 + 0.6, q1 - 0.6);
    P('metal', 2.6, 4.8, LV.f16 + 0.5, LV.f16 + 1.5, 20, 23);
  }

  // ════════════════ СТИЛОБАТ: порталы с откосами ════════════════
  const portal = (F, a0, a1, n, { skip = [], tag = () => null, garage = -1 } = {}) => {
    const pitch = (a1 - a0) / n; const pier = 1.16; const H = 7.45; const cham = 0.26; const deep = 0.42;
    fbox('stoneBase', F, a0, a1, H, LV.podium, -0.5, 0); // перемычка
    for (let i = 0; i <= n; i++) {
      const c = a0 + i * pitch;
      const p0 = i === 0 ? a0 : c - pier / 2; const p1 = i === n ? a1 : c + pier / 2;
      fbox('stoneBase', F, p0, p1, 0, H, -0.5, 0);
    }
    for (let i = 0; i < n; i++) {
      if (skip.includes(i)) continue;
      const o0 = a0 + i * pitch + (i === 0 ? pier : pier / 2); const o1 = a0 + (i + 1) * pitch - (i === n - 1 ? pier : pier / 2);
      // скошенные откосы — характерная деталь порталов
      slope('stoneBase', F, [[o0, 0, 0], [o0 + cham, 0, -deep], [o0 + cham, H - cham, -deep], [o0, H, 0]]);
      slope('stoneBase', F, [[o1, 0, 0], [o1, H, 0], [o1 - cham, H - cham, -deep], [o1 - cham, 0, -deep]]);
      slope('stoneBase', F, [[o0, H, 0], [o0 + cham, H - cham, -deep], [o1 - cham, H - cham, -deep], [o1, H, 0]]);
      const w0 = o0 + cham; const w1 = o1 - cham; const t = tag(i);
      const g1 = t === 'office' ? 'xOffice' : 'glassShop';
      if (i === garage) fbox('door', F, w0, w1, 0, 3.5, -deep - 0.08, -deep);
      else win(F, { a0: w0, a1: w1, h0: 0.12, h1: 3.5 }, { r: 0.02, d: -deep, mull: 1, transom: 0.74, glass: g1 });
      fbox('spandrel', F, w0, w1, 3.5, 4.45, -deep - 0.1, -deep + 0.02);
      win(F, { a0: w0, a1: w1, h0: 4.45, h1: H - cham }, { r: 0.02, d: -deep, mull: 1, glass: t === 'office' ? 'xOffice2' : 'glassShop' });
    }
    return { pitch, pier };
  };
  const Pd = PLAN.podium;
  const PN = { s: 'N', c: Pd.y1 }; const PW = { s: 'W', c: Pd.x0 };
  const northBays = 10; const westBays = 8;
  portal(PN, Pd.x0, Pd.x1, northBays, { garage: 0, tag: (i) => (i >= 8 ? 'office' : null) });
  portal(PW, A.y0, Pd.y1, westBays, {});
  // кровля стилобата: терракотовый пояс и живая изгородь
  P('roof', Pd.x0, A.x1, LV.podium - 0.15, LV.podium, A.y1, Pd.y1); P('roof', Pd.x0, A.x0, LV.podium - 0.15, LV.podium, A.y0, A.y1);
  P('band', Pd.x0 - 0.05, A.x1 + 0.1, LV.podium, LV.podium + 0.45, A.y1 + 0.2, Pd.y1 + 0.06);
  P('band', Pd.x0 - 0.05, A.x0 + 0.1, LV.podium, LV.podium + 0.45, A.y0, A.y1 + 0.2);
  P('hedge', Pd.x0 + 0.35, A.x1 - 0.2, LV.podium + 0.45, LV.podium + 1.45, Pd.y1 - 1.15, Pd.y1 - 0.2);
  P('hedge', Pd.x0 + 0.25, Pd.x0 + 1.05, LV.podium + 0.45, LV.podium + 1.3, A.y0 + 0.4, Pd.y1 - 1.3);
  P('stoneBase', Pd.x0, A.x0, 0, LV.podium, A.y0 - 0.02, A.y0 + 0.35); // торец у двора
  P('stoneBase', B.x1 - 0.5, B.x1, 0, LV.podium, B.y1, Pd.y1); // торец у прохода

  // ════════════════ сборка ════════════════
  const group = new THREE.Group();
  group.name = 'complex';
  const west = new THREE.Group(); const east = new THREE.Group();
  const x0 = SITE.axisX - MIRROR_X; const z0 = SITE.frontZ + B.y1;
  west.position.set(x0, 0, z0);
  east.position.set(SITE.axisX + MIRROR_X, 0, z0);
  east.scale.x = -1;
  group.add(west, east);
  // окна офиса продаж — прозрачные только в западном корпусе, в восточном это обычные витрины
  M.xOffice = new THREE.MeshStandardMaterial({ color: '#dfeaf0', roughness: 0.03, metalness: 0.9, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.2, clippingPlanes: [cut] });
  M.xOffice2 = M.glass;
  const meshes = b.meshes(M, { noShadow: ['rail', 'xOffice'] });
  for (const [name, m] of Object.entries(meshes)) {
    if (name === 'rail' || name === 'xOffice') m.renderOrder = 3;
    west.add(m);
    const twin = new THREE.Mesh(m.geometry, name === 'xOffice' ? M.glassShop : m.material);
    twin.castShadow = m.castShadow && name !== 'xOffice'; twin.receiveShadow = true; twin.renderOrder = name === 'rail' ? 3 : 0;
    east.add(twin);
  }

  // ── разрез этажа: «перекрытие» по контуру секций и чертёж этажа на нём
  const shapeA = [[A.x0, A.y0], [0, A.y0], [0, A.bay.y0], [A.bay.x1, A.bay.y0], [A.bay.x1, A.y0], [A.xe, A.y0], [A.xe, A.ye], [13.1, A.ye], [13.1, B.y0], [B.x0, B.y0], [B.x0, A.y1], [A.x0, A.y1]];
  const shapeB = [[B.x0, B.y0], [B.x1, B.y0], [B.x1, B.y1], [B.x0, B.y1]];
  const capMat = new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.95, envMapIntensity: 0.3 });
  const mkCap = (pts, g) => { const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py)))).rotateX(-Math.PI / 2), capMat); m.visible = false; m.receiveShadow = true; g.add(m); return m; };
  const capsA = [west, east].map((g) => mkCap(shapeA, g)); const capsB = [west, east].map((g) => mkCap(shapeB, g));
  const planMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const I = PLAN_IMAGE;
  const planMesh = new THREE.Mesh(new THREE.PlaneGeometry(I.x1 - I.x0, I.y1 - I.y0).rotateX(-Math.PI / 2), planMat);
  planMesh.position.set((I.x0 + I.x1) / 2, 0, -(I.y0 + I.y1) / 2);
  planMesh.visible = false; planMesh.renderOrder = 4;
  west.add(planMesh);
  const planTex = new Map();
  // name: typical | floor15 | floor16
  const loadPlan = (name) => {
    if (!planTex.has(name)) {
      planTex.set(name, new Promise((res) => new THREE.TextureLoader().load(asset(`assets/floors/${name}.webp`), (t) => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = engine.renderer.capabilities.getMaxAnisotropy();
        engine.renderer.initTexture(t); res(t);
      }, undefined, () => res(null))));
    }
    return planTex.get(name);
  };
  // шейдер пересобирается только при первом чертеже; дальше меняется одна текстура
  const usePlan = async (name) => { const t = await loadPlan(name); if (t && planMat.map !== t) { const first = !planMat.map; planMat.map = t; if (first) planMat.needsUpdate = true; } };

  // квартиры на плане этажа: выбранная — золотая, соседние — приглушены, под курсором — подсвечена
  const unitMats = {
    sel: new THREE.MeshBasicMaterial({ color: '#D2AB67', transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false }),
    dim: new THREE.MeshBasicMaterial({ color: '#14181F', transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }),
    hov: new THREE.MeshBasicMaterial({ color: '#D2AB67', transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }),
    none: new THREE.MeshBasicMaterial({ visible: false }),
  };
  const unitBoxes = Array.from({ length: 30 }, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), unitMats.none); m.visible = false; m.renderOrder = 5; west.add(m); return m; });
  let units = []; let unitHover = null;
  const paintUnits = () => {
    for (const u of units) for (const m of u.meshes) m.material = unitMats[u.slug === unitHover && u.state !== 'sel' ? 'hov' : u.state];
    engine.invalidate();
  };
  // list: [{ slug, rects, state: 'sel' | 'dim' | 'none' }], y — уровень пола
  function showUnits(list, y) {
    let i = 0; units = [];
    for (const u of list || []) {
      const meshes = [];
      for (const r of u.rects) {
        const m = unitBoxes[i++]; if (!m) break;
        m.visible = true; m.scale.set(r[2] - r[0] - 0.1, 0.12, r[3] - r[1] - 0.1); m.position.set((r[0] + r[2]) / 2, y + 0.12, -(r[1] + r[3]) / 2);
        meshes.push(m);
      }
      units.push({ ...u, meshes });
    }
    for (; i < unitBoxes.length; i++) unitBoxes[i].visible = false;
    unitHover = null; paintUnits();
  }
  function hoverUnit(slug) { if (slug !== unitHover) { unitHover = slug; paintUnits(); } }

  let clipY = 1e5;
  // y — высота среза; capY — где лежит «перекрытие» (null — без него); plan — прозрачность чертежа 0..1;
  // withA — показывать ли перекрытие секции А (на 16-м этаже её нет)
  function setCut(y, capY = null, plan = 0, withA = true) {
    clipY = y; cut.constant = y;
    for (const c of capsB) { c.visible = capY != null; if (capY != null) c.position.y = capY; }
    for (const c of capsA) { c.visible = capY != null && withA; if (capY != null) c.position.y = capY; }
    planMesh.visible = plan > 0.01 && capY != null && !!planMat.map;
    if (planMesh.visible) { planMesh.position.y = capY + 0.05; planMat.opacity = plan; }
    engine.updateShadows();
  }

  // ── режим стройки: возведено до уровня 1-го этажа, остальное — контур проекта
  const ghost = new THREE.Group(); ghost.visible = false; group.add(ghost);
  {
    const lines = [];
    const vol = (g, x0_, x1_, h0, h1, y0, y1) => { const bx = new THREE.BoxGeometry(x1_ - x0_, h1 - h0, y1 - y0).translate((x0_ + x1_) / 2, (h0 + h1) / 2, -(y0 + y1) / 2); lines.push([g, new THREE.EdgesGeometry(bx)]); bx.dispose(); };
    for (const g of [west, east]) {
      for (let f = 3; f <= 16; f++) vol(g, B.x0, B.x1, floorY(f), floorY(f) + 3.3, B.y0, B.y1);
      for (let f = 3; f <= 14; f++) vol(g, A.x0, A.x1, floorY(f), floorY(f) + 3.3, A.y0, A.y1);
      vol(g, Pd.x0, Pd.x1, LV.f2, LV.podium, A.y0, Pd.y1);
    }
    const lm = new THREE.LineBasicMaterial({ color: '#D2AB67', transparent: true, opacity: 0.6, depthWrite: false });
    for (const [g, e] of lines) {
      const l = new THREE.LineSegments(e, lm);
      l.position.copy(g.position); l.scale.copy(g.scale);
      ghost.add(l);
    }
    // башенный кран во дворе
    const cb = new Builder();
    const cx = SITE.axisX; const cz = SITE.frontZ + 44; const ch = 76;
    cb.box('c', cx - 0.9, cx + 0.9, 0, ch, cz - 0.9, cz + 0.9);
    cb.box('c', cx - 46, cx + 16, ch, ch + 1.3, cz - 0.7, cz + 0.7);
    cb.box('c', cx + 11, cx + 16, ch - 2.6, ch, cz - 1.4, cz + 1.4);
    cb.box('c', cx - 1.2, cx + 1.2, ch - 2.4, ch, cz + 0.9, cz + 3.2);
    cb.box('c', cx - 30.1, cx - 29.9, ch - 34, ch, cz - 0.1, cz + 0.1);
    const crane = new THREE.Mesh(cb.geometry('c'), new THREE.MeshStandardMaterial({ color: '#D2AB67', roughness: 0.55, metalness: 0.3 }));
    crane.castShadow = true;
    ghost.add(crane);
  }
  function setConstruction(on) {
    ghost.visible = on;
    if (on) setCut(LV.f2 + 0.3, LV.f2 + 0.1, 0); else setCut(1e5);
  }

  return {
    group, west, east, materials: M, setCut, setConstruction, loadPlan, usePlan, showUnits, hoverUnit,
    get clipY() { return clipY; },
    // точка в координатах плана → мировые координаты (west = чертёж)
    world(px, py, h = 0, mirror = false) { return new THREE.Vector3(SITE.axisX + (mirror ? -1 : 1) * (px - MIRROR_X), h, SITE.frontZ + (B.y1 - py)); },
    portals: { north: { a0: Pd.x0, a1: Pd.x1, n: northBays, y: Pd.y1 } },
  };
}
