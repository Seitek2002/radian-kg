// «Режиссёр» 3D-сцены. У каждой секции страницы свой кадр (положение камеры,
// время суток, подписи); между кадрами камера движется вместе с прокруткой.
// Поверх кадра пользователь может сам повернуть модель (потянуть) и приблизить
// её (кнопки, щипок, Ctrl + колесо); у следующей секции вид возвращается к её кадру.
// На плане этажа квартиры кликабельны.
//
// Всё тяжёлое делается в предзагрузке: геометрия, отражения для каждого времени
// суток, компиляция шейдеров, замер видеокарты.
import * as THREE from 'three';
import { createEngine, tween, ease, nextFrame, TIERS, reducedMotion } from './engine.js';
import { createSky } from './sky.js';
import { buildWorld } from './world.js';
import { createComplex } from './complex.js';
import { buildSite } from './site.js';
import { createLabels } from './labels.js';
import { setAnisotropy } from './tex.js';
import { LAYOUT, floorY, LV, MIRROR_X, SITE, PLAN } from '../../data/building.js';
import { planBySlug, fmtArea } from '../../data/plans.js';
import CONTEXT from '../../data/context.json';

// Небо: азимут солнца от севера, высота над горизонтом, облачность.
// «front» — условный свет на главный (северный) фасад, как на проектных визуализациях.
const SKY = {
  front: { az: 318, el: 27, cover: 0.3 },
  day: { az: 160, el: 50, cover: 0.34 },
  dusk: { az: 304, el: 2.5, cover: 0.4 },
  night: { az: 330, el: -14, cover: 0.25 },
};

// Кадры. p — камера, t — куда смотрит (x — восток, y — вверх, z — юг; фасад на z ≈ −4, центр на x = −8).
// Камеры стоят между Южной магистралью и комплексом — перед соседними домами и деревьями.
// az — на сколько радиан можно повернуть модель вручную (по умолчанию полный круг);
// look — с этого места не облетаем объект, а осматриваемся; m — поправки для телефона;
// wide — до какого угла можно расширить кадр на узком экране.
const SHOTS = {
  hero: { p: [-96, 34, -104], t: [-12, 25, 6], fov: 34, sky: 'front' },
  front: { p: [-8, 32, -92], t: [-8, 27, 5], fov: 40, sky: 'front', wide: 84, m: { p: [-8, 34, -100] } },
  facade: { p: [-56, 8, -36], t: [-27, 32, -4], fov: 40, sky: 'front', az: 0.75 },
  podium: { p: [-47, 4.4, -25], t: [-24, 5.6, -4], fov: 56, sky: 'dusk', labels: ['tenant'], az: 0.6 },
  yard: { p: [44, 48, 92], t: [-8, 3, 30], fov: 38, sky: 'day', labels: ['pin'] },
  location: { p: [230, 290, -400], t: [-8, 0, 50], fov: 30, sky: 'day', labels: ['road', 'stop', 'far', 'site'], far: true },
  mountains: { p: [-8, 62, 30], t: [-8, 64, 900], fov: 52, sky: 'front', labels: ['far'], far: true, look: true },
  progress: { p: [-124, 66, -112], t: [-8, 14, 14], fov: 34, sky: 'day', build: true },
  night: { p: [-10, 17, -80], t: [-8, 25, 5], fov: 40, sky: 'night', az: 1.1 },
  office: { p: [0, 0, 0], t: [0, 0, 0], fov: 60, sky: 'front', look: true },
};
const BLOCK = [PLAN.A.x0, PLAN.A.bay.y0, PLAN.B.x1, PLAN.B.y1]; // западный корпус в координатах плана

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const sm = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } } };
// узкий экран: шире угол, чтобы объект помещался
const effFov = (fov, aspect, cap = 72) => (aspect < 1.25 ? Math.min(Math.max(cap, fov), (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (1.25 / aspect)) * 180) / Math.PI) : fov);
const unitsOnFloor = (f) => Object.entries(LAYOUT).filter(([, l]) => l.floors[0] <= f && f <= l.floors[1]);
const unitLabel = (slug, short) => { const p = planBySlug[slug]; return !p ? slug : short ? `${p.rooms}к, ${fmtArea(p.area)} м²` : `${p.rooms}-комн.${p.terrace ? ' с террасой' : ''}, ${fmtArea(p.area)} м²`; };

// Объёмы, сквозь которые камера не должна пролетать при ручном повороте: [x0, x1, z0, z1, высота]
const SOLIDS = [
  [SITE.axisX - 50, SITE.axisX + 50, SITE.frontZ - 1, SITE.frontZ + 34, LV.parapetB + 2],
  ...CONTEXT.buildings.filter((b) => b.pts.length > 2).map((b) => {
    let x0 = 1e9; let x1 = -1e9; let z0 = 1e9; let z1 = -1e9;
    for (const [x, z] of b.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return [x0, x1, z0, z1, b.lv > 4 ? b.lv * 3 + 1.2 : b.lv * 3.1 + 0.4];
  }),
];
// на какой высоте над точкой (x, z) камере свободно
function clearance(x, z) {
  let h = 0; const m = 7;
  for (const s of SOLIDS) if (x > s[0] - m && x < s[1] + m && z > s[2] - m && z < s[3] + m && s[4] > h) h = s[4];
  return h ? h + 5 : 0;
}

export async function createApp3D(stage, hooks = {}) {
  const P = hooks.progress || (() => {});
  const engine = createEngine(stage);
  const { renderer, scene, camera, canvas } = engine;
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const shared = { uNight: { value: 0 }, uDay: { value: 1 } };
  const mobile = matchMedia('(max-width: 62rem)');

  P(0.36, 'Готовим небо и хребет Ала-Тоо…');
  await nextFrame();
  const sky = createSky(engine, shared, { detail: !mobile.matches });
  P(0.42, 'Прокладываем улицы по карте района…');
  await nextFrame();
  const world = await buildWorld(engine, { progress: (k) => P(0.42 + 0.16 * k) });
  P(0.6, 'Возводим комплекс по чертежам…');
  await nextFrame();
  const cx = createComplex(engine, shared);
  scene.add(cx.group);
  P(0.68, 'Благоустраиваем двор и открываем офис продаж…');
  await nextFrame();
  const site = buildSite(engine, world, shared);
  world.finish();
  Object.assign(SHOTS.office, { p: site.officeView.eye, t: site.officeView.target, via: site.officeView.door });

  // подписи
  const layer = stage.querySelector('[data-labels]');
  const labels = createLabels(engine, layer);
  for (const l of [...world.labels, ...site.labels]) labels.add(l.text, l.pos, { group: l.kind, cls: l.kind });
  labels.add('Хребет Ала-Тоо, юг', new THREE.Vector3(-8, 3200, 24000), { group: 'far', cls: 'far' });
  labels.add('RADIAN GROUP', new THREE.Vector3(SITE.axisX, LV.parapetB + 10, 10), { group: 'site', cls: 'site' });

  P(0.71, 'Раскладываем чертежи по этажам…');
  await cx.usePlan('typical'); // чертёж типового этажа — заранее, чтобы первый разрез шёл без рывка
  P(0.74, 'Рассчитываем свет для дня, вечера и ночи…');
  await nextFrame();
  sky.prepare(SKY);
  const FOCUS = new THREE.Vector3(SITE.axisX, 0, 18);
  const SHADOW_R = 150; const SHADOW_FAR = 290;
  sky.setShadowFocus(FOCUS, SHADOW_R);
  const skyCur = { ...SKY.front }; let skyKey = 'front'; let skyTick = 0;
  const applySky = (key, final = true) => {
    sky.set(skyCur, key, final || ++skyTick % 4 === 0); // тени — каждый 4-й кадр и в конце
    world.setNight(sky.night); site.setNight(sky.night);
    if (engine.bloom) engine.bloom.strength = 0.16 + 0.42 * sky.night;
  };
  applySky('front');

  P(0.8, 'Компилируем материалы…');
  await nextFrame();
  camera.position.set(...SHOTS.hero.p); camera.lookAt(...SHOTS.hero.t); camera.fov = SHOTS.hero.fov; camera.updateProjectionMatrix();
  {
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { await renderer.compileAsync(scene, camera); } catch { renderer.compile(scene, camera); }
    for (const o of hidden) o.visible = false;
  }
  P(0.9, 'Подбираем качество под ваше устройство…');
  await nextFrame();
  engine.buildComposer();
  engine.updateShadows();
  {
    // реальное время кадра на каждом уровне качества: берём лучший, который укладывается в 60 к/с с запасом
    let tier = mobile.matches ? 'medium' : 'high'; let ms = 0;
    for (;;) {
      engine.setTier(tier);
      sky.setShadowSize(TIERS[tier].shadow);
      ms = engine.benchmark(5);
      if (ms <= 11 || tier === 'low') break;
      tier = tier === 'high' ? 'medium' : 'low';
      await nextFrame();
    }
    if (import.meta.env.DEV) console.info(`[3D] кадр ${ms.toFixed(1)} мс → качество: ${tier}`);
  }
  const applyTier = (t) => { sky.setShadowSize(TIERS[t].shadow); world.setTier(t); applySky(skyKey); };
  applyTier(engine.tier);
  engine.onTier(applyTier);
  engine.draw();
  P(1, 'Готово');

  // ───────────────────────── кадры и прокрутка ─────────────────────────
  let sectionsNow = []; let track = []; // [{ el, shot, ox, oy, c }] — секции-сцены по порядку
  const cur = { p: V(SHOTS.hero.p), t: V(SHOTS.hero.t), fov: SHOTS.hero.fov, ox: 0, oy: 0 };
  const want = { p: new THREE.Vector3(), t: new THREE.Vector3(), fov: 34, ox: 0, oy: 0 };
  let flight = null; // { t, d, from } — перелёт при смене страницы
  let active = null; // ближайший кадр (для неба, подписей, разреза)
  let todOverride = store.get('radian.tod'); if (!SKY[todOverride]) todOverride = null;
  let mode = { kind: 'none' }; let modeId = 0;
  // ручной вид поверх кадра: поворот, наклон, приближение (goal — куда стремится); lift — подъём над препятствием
  const user = { az: 0, el: 0, zoom: 1, lift: 0 }; const goal = { az: 0, el: 0, zoom: 1 };
  const tmp = new THREE.Vector3(); const off = new THREE.Vector3();
  const custom = () => Math.abs(user.az) + Math.abs(user.el) + Math.abs(user.zoom - 1) > 1e-3;

  // Кадр «сверху на план»: вписывает прямоугольник плана (x0, y0, x1, y1) в свободную от текста часть экрана
  function fitShot(el, rect, floor, { margin = 1.3, tilt = 12, cut } = {}) {
    const { width: W, height: H } = engine.size; const m = mobile.matches;
    const nav = document.querySelector('[data-hdr]')?.offsetHeight || 64;
    // свободное место считаем по тексту секции: на телефоне — над текстом, когда секция встала под шапку
    const s = el.getBoundingClientRect(); const b = (el.querySelector('.scene-body') || el).getBoundingClientRect();
    let fr;
    if (m) {
      const top = nav + 50; const textTop = nav + (b.top - s.top);
      fr = { x: 6, y: top, w: W - 12, h: Math.max(H * 0.24, Math.min(H * 0.66, textTop) - H * 0.045 - top) };
    } else {
      const x0 = el.dataset.side === 'right' ? 24 : b.right + 40; const x1 = el.dataset.side === 'right' ? b.left - 40 : W - (W >= 1280 ? 150 : 24);
      fr = { x: x0, y: nav + 8, w: Math.max(W * 0.3, x1 - x0), h: H - nav - 84 };
    }
    const cxw = SITE.axisX + ((rect[0] + rect[2]) / 2 - MIRROR_X); const czw = SITE.frontZ + (PLAN.B.y1 - (rect[1] + rect[3]) / 2);
    const bw = (rect[2] - rect[0]) * margin; const bh = (rect[3] - rect[1]) * margin;
    const fov = effFov(34, W / H); const tv = Math.tan((fov * Math.PI) / 360); const th = tv * (W / H);
    const d = Math.max(bw / 2 / (th * (fr.w / W)), bh / 2 / (tv * (fr.h / H)));
    const a = (tilt * Math.PI) / 180; const y = floorY(floor);
    return {
      // камера с юга: север чертежа вверху экрана, подписи читаются
      p: [cxw, y + d * Math.cos(a), czw + d * Math.sin(a)], t: [cxw, y, czw], fov, sky: 'day', cut,
      fit: { ox: (fr.x + fr.w / 2 - W / 2) / W, oy: (fr.y + fr.h / 2 - H / 2) / H },
    };
  }
  function shotFor(el) {
    const d = el.dataset;
    if (d.shot === 'apartment' && LAYOUT[d.plan]) {
      const l = LAYOUT[d.plan];
      const floor = l.floors[0] === l.floors[1] ? l.floors[0] : 9;
      const r = l.rects.reduce((b, q) => [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])], [1e9, 1e9, -1e9, -1e9]);
      return fitShot(el, r, floor, { margin: mobile.matches ? 1.14 : 1.34, cut: { floor, plan: floor === 16 ? 'floor16' : floor === 15 ? 'floor15' : 'typical', slug: d.plan } });
    }
    if (d.shot === 'plans' || d.shot === 'apartment') return fitShot(el, BLOCK, 9, { margin: 1.08, tilt: 22, cut: { floor: 9, plan: 'typical', slug: null } });
    return SHOTS[d.shot] || SHOTS.hero;
  }
  function rebuild() {
    const m = mobile.matches; const ai = track.indexOf(active); const aspect = engine.size.width / engine.size.height;
    track = sectionsNow.map((el) => {
      let shot = shotFor(el); const side = el.dataset.side || 'left';
      if (shot.fit) return { el, shot, ox: shot.fit.ox, oy: shot.fit.oy, c: 0 };
      if (m && shot.m) shot = { ...shot, ...shot.m };
      // текст занимает одну сторону экрана: кадр сдвигаем в свободную и слегка расширяем угол;
      // по вертикали учитываем шапку (десктоп) или текст внизу (телефон)
      const shift = m ? 0 : side === 'left' ? 0.14 : side === 'right' ? -0.14 : 0;
      return { el, shot: { ...shot, fov: effFov(shot.fov * (shift ? 1.16 : 1), aspect, shot.wide) }, ox: shift, oy: m ? -0.16 : 0.035, c: 0 };
    });
    if (ai >= 0 && track[ai]) active = track[ai];
    measure();
  }
  function measure() {
    for (const k of track) { const r = k.el.getBoundingClientRect(); k.c = r.top + scrollY + r.height / 2; }
  }
  // положение между кадрами A и B (k: 0..1); в интерьер — через «дверь»
  function blend(A, B, k, out) {
    const via = B.via || A.via;
    if (via) {
      if (k < 0.55) out.p.lerpVectors(V(A.p), tmp.set(...via), sm(k / 0.55)); else out.p.lerpVectors(tmp.set(...via), V(B.p), sm((k - 0.55) / 0.45));
    } else out.p.lerpVectors(V(A.p), V(B.p), k);
    out.t.lerpVectors(V(A.t), V(B.t), k);
    out.fov = A.fov + (B.fov - A.fov) * k;
  }
  function target() {
    if (!track.length) return null;
    const yc = scrollY + innerHeight / 2;
    let i = 0;
    while (i < track.length - 1 && yc > track[i + 1].c) i++;
    const a = track[i]; const b = track[Math.min(track.length - 1, i + 1)];
    let k = a === b || yc <= a.c ? 0 : (yc - a.c) / (b.c - a.c);
    k = sm(clamp((k - 0.22) / 0.56, 0, 1)); // у центра секции кадр «стоит»
    blend(a.shot, b.shot, k, want);
    want.ox = a.ox + (b.ox - a.ox) * k; want.oy = a.oy + (b.oy - a.oy) * k;
    return { near: k < 0.5 ? a : b, settled: k < 0.12 || k > 0.88 };
  }

  // где окажется камера с учётом ручного поворота и приближения (без подъёма)
  function orbit(out) {
    off.copy(cur.p).sub(cur.t);
    const r0 = off.length(); const r = r0 * user.zoom;
    const th = Math.atan2(off.x, off.z) - user.az; const ph = clamp(Math.acos(clamp(off.y / r0, -1, 1)) - user.el, 0.04, 1.52);
    return out.set(cur.t.x + r * Math.sin(ph) * Math.sin(th), Math.max(1.5, cur.t.y + r * Math.cos(ph)), cur.t.z + r * Math.sin(ph) * Math.cos(th));
  }
  function applyCamera() {
    const { width, height } = engine.size;
    const look = !!active?.shot.look;
    if (look) {
      // в помещении и на видовой точке осматриваемся с места
      off.copy(cur.t).sub(cur.p); const r = off.length();
      const th = Math.atan2(off.x, off.z) + user.az * 0.6; const ph = clamp(Math.acos(clamp(off.y / r, -1, 1)) + user.el * 0.6, 0.9, 2.2);
      camera.position.copy(cur.p);
      camera.lookAt(cur.p.x + r * Math.sin(ph) * Math.sin(th), cur.p.y + r * Math.cos(ph), cur.p.z + r * Math.sin(ph) * Math.cos(th));
    } else if (custom() || user.lift > 0.01) {
      orbit(camera.position); camera.position.y += user.lift;
      camera.lookAt(cur.t);
    } else { camera.position.copy(cur.p); camera.lookAt(cur.t); }
    const f = cur.fov * (look ? clamp(user.zoom, 0.55, 1.2) : 1); // угол уже подобран под экран в rebuild()
    if (Math.abs(camera.fov - f) > 0.01) camera.fov = f;
    camera.setViewOffset(width, height, -cur.ox * width, -cur.oy * height, width, height);
    camera.updateProjectionMatrix();
  }

  // небо плавно догоняет кадр; тени пересчитываются, пока оно меняется
  function stepSky(dt, shot) {
    const key = todOverride || shot.sky;
    const to = SKY[key];
    const da = ((to.az - skyCur.az + 540) % 360) - 180;
    const de = to.el - skyCur.el; const dc = to.cover - skyCur.cover;
    if (Math.abs(da) < 0.05 && Math.abs(de) < 0.05 && Math.abs(dc) < 0.005 && skyKey === key) return false;
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 3.2);
    skyCur.az += da * k; skyCur.el += de * k; skyCur.cover += dc * k;
    if (Math.abs(da) < 0.6 && Math.abs(de) < 0.4) { Object.assign(skyCur, to); skyKey = key; }
    // отражения — от ближайшего по высоте солнца «готового» неба
    let best = key; let bd = 1e9;
    for (const [n, s] of Object.entries(SKY)) { const d = Math.abs(s.el - skyCur.el) + Math.abs((((s.az - skyCur.az + 540) % 360) - 180)) * 0.15; if (d < bd) { bd = d; best = n; } }
    applySky(best, skyKey === key);
    return true;
  }

  // квартиры на открытом этаже: выбранная — золотая, соседние приглушены; у каждой подпись
  let lastLabels = '';
  function showFloor(m) {
    const y = floorY(m.floor); const list = unitsOnFloor(m.floor);
    cx.showUnits(list.map(([slug, l]) => ({ slug, rects: l.rects, state: m.slug ? (slug === m.slug ? 'sel' : 'dim') : 'none' })), y);
    labels.remove('apt');
    for (const [slug, l] of list) {
      const r = l.rects.reduce((a, b) => ((a[2] - a[0]) * (a[3] - a[1]) >= (b[2] - b[0]) * (b[3] - b[1]) ? a : b));
      labels.add(unitLabel(slug, mobile.matches), cx.world((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, y + 0.4), { group: 'apt', cls: slug === m.slug ? 'apt sel' : 'apt' });
    }
    lastLabels = null;
    engine.invalidate();
  }
  function hideFloor() { cx.showUnits(null); labels.remove('apt'); canvas.classList.remove('pick'); }
  // разрез этажа / стройка — при смене кадра
  async function setMode(shot) {
    const next = shot.cut ? { kind: 'cut', ...shot.cut } : shot.build ? { kind: 'build' } : { kind: 'none' };
    if (JSON.stringify(next) === JSON.stringify(mode)) return;
    const id = ++modeId; const prev = mode; mode = next;
    const top = LV.parapetB + 3;
    const sameFloor = prev.kind === 'cut' && next.kind === 'cut' && prev.floor === next.floor;
    if (!sameFloor) hideFloor();
    if (engine.composer) engine.composer.passes.forEach((p) => { if (p.constructor.name === 'GTAOPass') p.enabled = next.kind === 'none'; });
    if (prev.kind === 'build') cx.setConstruction(false);
    if (next.kind === 'build') { cx.setConstruction(true); return; }
    if (next.kind === 'cut') {
      await cx.usePlan(next.plan);
      if (id !== modeId) return;
      if (sameFloor && cx.clipY < top) { showFloor(next); return; } // та же отметка: меняется только выбранная квартира
      const y = floorY(next.floor); const from = Math.min(cx.clipY, top);
      await tween(engine, { duration: prev.kind === 'cut' ? 0.5 : 1.1, easing: ease.inOut, onUpdate: (k) => { if (id === modeId) cx.setCut(from + (y + 1.25 - from) * k, y + 0.03, Math.max(0, (k - 0.6) / 0.4), next.floor < 16); } });
      if (id === modeId) showFloor(next);
      return;
    }
    const from = Math.min(cx.clipY, top);
    await tween(engine, { duration: 0.8, easing: ease.inOut, onUpdate: (k) => { if (id === modeId) cx.setCut(from + (top - from) * k, null, 0); } });
    if (id === modeId) cx.setCut(1e5);
  }

  let lastScroll = -1;
  engine.onFrame((dt) => {
    const info = target();
    if (!info) return false;
    let moving = false;
    if (flight) {
      flight.t += dt;
      const k = ease.inOut(Math.min(1, flight.t / flight.d));
      const B = { p: want.p.toArray(), t: want.t.toArray(), fov: want.fov, via: info.near.shot.via || flight.via };
      const out = { p: cur.p, t: cur.t, fov: 0 };
      blend(flight.from, B, k, out);
      cur.fov = out.fov; cur.ox = flight.from.ox + (want.ox - flight.from.ox) * k; cur.oy = flight.from.oy + (want.oy - flight.from.oy) * k;
      if (flight.t >= flight.d) flight = null;
      moving = true;
    } else {
      const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 6.5);
      const d = cur.p.distanceToSquared(want.p) + cur.t.distanceToSquared(want.t) + Math.abs(cur.fov - want.fov) + Math.abs(cur.ox - want.ox) * 100 + Math.abs(cur.oy - want.oy) * 100;
      if (d > 1e-5) {
        cur.p.lerp(want.p, k); cur.t.lerp(want.t, k); cur.fov += (want.fov - cur.fov) * k; cur.ox += (want.ox - cur.ox) * k; cur.oy += (want.oy - cur.oy) * k;
        if (d < 1e-4) { cur.p.copy(want.p); cur.t.copy(want.t); cur.fov = want.fov; cur.ox = want.ox; cur.oy = want.oy; }
        moving = true;
      }
    }
    const shot = info.near.shot;
    if (active !== info.near) {
      const first = active === null;
      active = info.near; setMode(shot);
      if (!first) resetView(); // новая секция — вид возвращается к её кадру
      sky.setShadowFocus(FOCUS, shot.far ? SHADOW_FAR : SHADOW_R);
    }
    // ручной вид догоняет цель; над домами камера приподнимается, а не пролетает сквозь них
    const ud = Math.abs(goal.az - user.az) + Math.abs(goal.el - user.el) + Math.abs(goal.zoom - user.zoom);
    if (ud > 1e-4) {
      const k = reducedMotion || ud < 2e-4 ? 1 : 1 - Math.exp(-dt * 12);
      user.az += (goal.az - user.az) * k; user.el += (goal.el - user.el) * k; user.zoom += (goal.zoom - user.zoom) * k;
      moving = true;
    }
    let need = 0;
    if (custom() && !shot.look) { orbit(tmp); need = Math.max(0, clearance(tmp.x, tmp.z) - tmp.y); }
    if (Math.abs(need - user.lift) > 0.01) { user.lift += (need - user.lift) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 5)); moving = true; } else user.lift = need;
    if (moving || lastScroll !== scrollY) { applyCamera(); lastScroll = scrollY; }
    if (stepSky(dt, shot)) moving = true;
    const groups = info.settled && !flight ? [...(shot.labels || []), ...(mode.kind === 'cut' ? ['apt'] : [])].join() : '';
    if (groups !== lastLabels) { lastLabels = groups; labels.show(groups ? groups.split(',') : []); }
    return moving;
  });
  engine.onResize(() => { rebuild(); applyCamera(); });
  addEventListener('scroll', () => engine.invalidate(), { passive: true });

  // ───────────────────────── ручной вид и выбор квартиры ─────────────────────────
  function resetView() { goal.az = 0; goal.el = 0; goal.zoom = 1; hooks.view?.(false); engine.invalidate(); }
  function zoomBy(f) { goal.zoom = clamp(goal.zoom * f, 0.32, 2.2); hooks.view?.(true); engine.invalidate(); }

  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  function pickUnit(x, y) {
    if (mode.kind !== 'cut' || flight) return null;
    const { width, height } = engine.size;
    ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin; const d = ray.ray.direction; const y0 = floorY(mode.floor) + 0.05;
    if (d.y > -1e-4) return null;
    const k = (y0 - o.y) / d.y; const wx = o.x + d.x * k; const wz = o.z + d.z * k;
    const px = wx - SITE.axisX + MIRROR_X; const py = PLAN.B.y1 - (wz - SITE.frontZ);
    for (const [slug, l] of unitsOnFloor(mode.floor)) for (const r of l.rects) if (px >= r[0] && px <= r[2] && py >= r[1] && py <= r[3]) return slug;
    return null;
  }
  const pts = new Map(); let drag = null; let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, touch: e.pointerType !== 'mouse' };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); if (drag) drag.moved = true; }
    if (e.pointerType === 'mouse') e.preventDefault(); // без выделения текста при перетаскивании
    try { canvas.setPointerCapture(e.pointerId); } catch { /* не критично */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) { // мышь без нажатия: какая квартира под курсором
      const slug = e.pointerType === 'mouse' ? pickUnit(e.clientX, e.clientY) : null;
      const other = slug && slug !== mode.slug ? slug : null;
      cx.hoverUnit(other); canvas.classList.toggle('pick', !!other);
      return;
    }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && dist > 0) zoomBy(pinch / dist);
      pinch = dist;
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) { drag.moved = true; drag.x = e.clientX; drag.y = e.clientY; canvas.classList.add('dragging'); hooks.view?.(true); }
    if (!drag.moved) return;
    const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    const lim = active?.shot.look ? 1.1 : active?.shot.az ?? Math.PI * 2;
    goal.az = clamp(goal.az + dx * 0.0055, -lim, lim);
    if (!drag.touch) goal.el = clamp(goal.el + dy * 0.004, -0.9, 0.9); // на телефоне вертикальный жест — прокрутка страницы
    engine.invalidate();
  });
  const release = (e) => {
    const had = pts.delete(e.pointerId);
    if (pts.size < 2) pinch = 0;
    if (!had || pts.size) return;
    canvas.classList.remove('dragging');
    const d = drag; drag = null;
    if (!d || d.moved || e.type === 'pointercancel') return;
    const slug = pickUnit(e.clientX, e.clientY); // нажатие без перетаскивания — выбор квартиры на плане
    if (slug && slug !== mode.slug) { cx.hoverUnit(null); canvas.classList.remove('pick'); hooks.navigate?.(`planirovki/${slug}/`); }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { if (!pts.size) { cx.hoverUnit(null); canvas.classList.remove('pick'); } });
  canvas.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); zoomBy(Math.exp(clamp(e.deltaY, -60, 60) * 0.012)); }, { passive: false }); // Ctrl + колесо, щипок на тачпаде
  canvas.addEventListener('dblclick', () => { if (mode.kind !== 'cut') resetView(); });

  if (import.meta.env.DEV) window.__three = { THREE, engine, sky, cx, world, site, SHOTS, cur, user, goal, pickUnit, get track() { return track; }, get mode() { return mode; } };

  return {
    // sections — элементы с data-shot; fly — перелёт к первому кадру (смена страницы)
    setTrack(sections, { fly = true } = {}) {
      sectionsNow = sections;
      const prev = active?.shot;
      active = null;
      rebuild();
      if (fly && track.length) {
        // перелёт начинается оттуда, где камера стоит сейчас — с учётом ручного поворота
        const from = custom() && !prev?.look ? orbit(new THREE.Vector3()).toArray() : cur.p.toArray();
        from[1] += user.lift;
        flight = { t: 0, d: reducedMotion ? 0.01 : 1.9, from: { p: from, t: cur.t.toArray(), fov: cur.fov, ox: cur.ox, oy: cur.oy, via: prev?.via } };
        cur.p.fromArray(from);
      }
      goal.az = 0; goal.el = 0; goal.zoom = 1; user.az = 0; user.el = 0; user.zoom = 1; user.lift = 0;
      hooks.view?.(false);
      engine.invalidate();
    },
    refresh() { rebuild(); engine.invalidate(); },
    // подсветить квартиру на плане (карточка каталога под курсором): slug или null
    preview(slug) { if (mode.kind === 'cut') cx.hoverUnit(slug && slug !== mode.slug ? slug : null); },
    zoom: zoomBy, resetView,
    setTimeOfDay(key) { todOverride = SKY[key] ? key : null; store.set('radian.tod', todOverride || ''); engine.invalidate(); },
    get timeOfDay() { return todOverride; },
    setPaused: (p) => engine.setPaused(p),
    start() { stage.classList.add('ready'); document.body.classList.add('scene-on'); engine.invalidate(); },
  };
}
