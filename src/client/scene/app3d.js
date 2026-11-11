// Оркестратор 3D: загрузка с прогрессом, ракурсы разделов, выбор квартир,
// поэтажный разрез, «влёт» в квартиру с 3D-планировкой, время суток, стройка.
//
// Главное правило против лагов: вся тяжёлая работа — в предзагрузке
// (геометрия, компиляция ВСЕХ шейдеров, отражения для дня/вечера/ночи,
// тест производительности). Во время анимаций ничего не создаётся и не компилируется.
import * as THREE from 'three';
import { createEngine, tween, ease, nextFrame, rectFov, TIERS } from './engine.js';
import { createEnvironment, TOD } from './env.js';
import { buildContext } from './context.js';
import { createBuilding, ROOM_COLORS } from './building.js';
import { createRig } from './rig.js';
import { createLabels } from './labels.js';
import { createStageUI } from './stageui.js';
import { buildPlan, planMaterials } from './plan3d.js';
import { sunPosition, localDate } from './sun.js';
import { asset } from '../base.js';
import { UNITS, unitById, unitsByPlan, floorY, ORIGIN, GEO, ORIENT_LABEL, towerLabel, roofY } from '../../data/building.js';
import { planBySlug, planTitle, fmtArea, AREA_RANGES } from '../../data/plans.js';
import { SITE } from '../../data/site.js';

const O = new THREE.Vector3(...ORIGIN);
const DEG = Math.PI / 180;
const TOD_UI = {
  day: { label: 'День', hint: '21 июня, 10:30' },
  evening: { label: 'Вечер', hint: '21 июня, 19:55' },
  night: { label: 'Ночь', hint: '21 июня, 23:30' },
};

// Ракурсы: цель (в координатах комплекса), азимут камеры от севера, высота, дистанция, радиус кадра
const VIEWS = {
  // с северо-востока: между высотками Джала, комплекс на фоне гор; на телефоне — ближе, чтобы соседние дома не закрывали
  home: { t: [0, 26, -2], az: 15, el: 4, d: 195, R: 44, auto: true, labels: [], pick: true, mobile: { d: 165, R: 30, el: 6 } },
  about: { t: [0, 27, -2], az: 326, el: 11, d: 150, R: 48, pick: true },
  'about-side': { t: [0, 26, 0], az: 52, el: 17, d: 140, R: 48, pick: true },
  facade: { t: [-12, 31, -16], az: 342, el: 6, d: 62, R: 20, labels: ['facade'], pick: true },
  plans: { t: [0, 27, -4], az: 28, el: 12, d: 150, R: 48, labels: ['blocks'], pick: true, floors: true },
  location: { t: [20, 0, 30], az: 32, el: 42, d: 720, R: 280, labels: ['roads', 'mountains', 'site'], compass: true, sun: true, far: true },
  sun: { t: [0, 12, 0], az: 20, el: 36, d: 330, R: 110, labels: ['roads', 'mountains'], compass: true, sun: true },
  map: { t: [20, 0, 30], az: 32, el: 42, d: 720, R: 280, labels: ['roads', 'mountains', 'site'], compass: true, far: true },
  podium: { t: [-6, 5, -16], az: 330, el: 4, d: 72, R: 26, labels: ['podium'] },
  courtyard: { t: [0, 6, 22], az: 150, el: 27, d: 150, R: 48, labels: ['courtyard'] },
  developer: { t: [0, 24, 0], az: 228, el: 13, d: 190, R: 58, pick: true },
  progress: { t: [0, 16, 0], az: 35, el: 24, d: 160, R: 52, construction: true, labels: ['progress'] },
  purchase: { t: [0, 26, 0], az: 292, el: 15, d: 170, R: 54, pick: true },
  contacts: { t: [0, 22, -12], az: 8, el: 3, d: 100, R: 34, pick: true },
};

const push = (event, params = {}) => (window.dataLayer = window.dataLayer || []).push({ event, ...params });
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } },
};

export async function createApp3D(stage, hooks = {}) {
  const P = hooks.progress || (() => {});
  const desktop = matchMedia('(min-width: 900px)');
  const uiEl = stage.querySelector('[data-stage-ui]');
  const engine = createEngine(stage, uiEl);
  const { renderer, scene, camera } = engine;
  const ui = createStageUI(stage, TOD_UI);
  if (hooks.rects) engine.setRects(hooks.rects, 0);

  // ── 1. небо и горы
  P(0.36, 'Готовим небо и горы Ала-Тоо…');
  await nextFrame();
  const env = createEnvironment(engine, SITE.geo);

  // ── 2. город вокруг (OSM)
  P(0.42, 'Прокладываем улицы и сажаем деревья…');
  await nextFrame();
  const ctx = await buildContext(engine, { progress: (k) => P(0.42 + 0.2 * k) });

  // ── 3. комплекс
  P(0.63, 'Возводим комплекс RADIAN GROUP…');
  await nextFrame();
  const bld = createBuilding(engine);
  bld.setRoomsResolver((s) => planBySlug[s]?.rooms || 1);
  const rig = createRig(engine);
  const labels = createLabels(engine, ui.labels);
  const interior = new THREE.PointLight('#ffd6a0', 0, 40, 1.8); // свет в квартире ночью
  scene.add(interior);

  const L = (x, y, z) => new THREE.Vector3(x, y, z).add(O);
  const topY = roofY + GEO.crown;
  labels.add('Блок 1', L(-13, topY + 4, -6), { group: 'blocks', cls: 'pin' });
  labels.add('Блок 2', L(13, topY + 4, -6), { group: 'blocks', cls: 'pin' });
  labels.add(SITE.brand, L(0, topY + 8, -6), { group: 'site', cls: 'pin big' });
  for (const r of ctx.roadLabels) labels.add(r.text, r.pos, { group: 'roads', cls: 'road big' });
  labels.add('Горы Ала-Тоо — юг', new THREE.Vector3(0, 2600, 16000), { group: 'mountains', cls: 'big' });
  labels.add('Первый этаж: магазины, рестораны, фитнес — по проекту', L(-14, 8.6, -17), { group: 'podium', cls: 'pin' });
  labels.add('Закрытый двор · 466 м² площадки и 202 м² озеленения по проекту', L(0, 3, 28), { group: 'courtyard', cls: 'pin' });
  labels.add(`Сейчас: уровень 1 этажа · ${SITE.stage.date}`, L(-20, 6, -17), { group: 'progress', cls: 'pin big' });
  labels.add('Проект: до 16 этажей · сдача — 2029 (ориентир)', L(-13, topY + 3, -6), { group: 'progress', cls: 'pin' });
  labels.add('Потолки 3 м · большие окна', L(-12, floorY(10) + 1.6, -17.2), { group: 'facade', cls: 'pin' });

  // ── состояние
  let viewName = null;
  let viewToken = 0;
  let filter = { rooms: null, area: 'all' };
  let planState = null; // { model, unit, slug, mode, low }
  let sunCustom = false;
  let todKey = TOD[store.get('radian.tod')] ? store.get('radian.tod') : 'day';
  let pageRects = hooks.rects || null;
  let full = false;
  const planCache = new Map();

  function loadModel(code) {
    if (!planCache.has(code)) {
      planCache.set(code, buildPlan(code, renderer).then((m) => { m.upload(); return m; }).catch((e) => { planCache.delete(code); throw e; }));
    }
    return planCache.get(code);
  }

  // ── 4. отражения для дня, вечера и ночи — ДО компиляции: карта окружения входит в шейдеры
  P(0.68, 'Рассчитываем отражения для дня, вечера и ночи…');
  await nextFrame();
  env.prepareEnv();
  env.setSun(env.todPos(todKey), todKey);
  syncNight();
  ui.tod.set(todKey);
  ui.sun.set(TOD[todKey].month, TOD[todKey].hours);

  // ── 5. компиляция всех шейдеров заранее (иначе — рывки при первом показе)
  P(0.74, 'Компилируем материалы и освещение…');
  await nextFrame();
  {
    // макет планировки с теми же материалами — программы останутся в кэше
    const dm = planMaterials();
    const px = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    px.colorSpace = THREE.SRGBColorSpace; // как у настоящих текстур — иначе другой шейдер
    px.needsUpdate = true;
    dm.floor.map = px; dm.floor.emissiveMap = px;
    const dummy = new THREE.Group();
    const df = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), dm.floor);
    df.receiveShadow = true; // флаги теней тоже входят в «ключ» шейдера
    const dw = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 4), [dm.cap, dm.side]);
    dw.castShadow = true;
    dw.receiveShadow = true;
    dummy.add(df, dw);
    dummy.position.copy(O).setY(80);
    scene.add(dummy);
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    const v0 = camFor(VIEWS.home);
    camera.position.set(...v0.pos);
    camera.lookAt(...v0.target);
    rig.controls.target.set(...v0.target);
    // по одному материалу за шаг: прогресс движется, а главный поток не занят надолго
    const seen = new Set(); const items = [];
    scene.traverse((o) => {
      if (!o.material) return;
      // один материал может давать разные шейдеры: обычная/инстансная модель, тени, цвета вершин
      const key = `${(Array.isArray(o.material) ? o.material : [o.material]).map((m) => m.uuid).join()}|${o.type}|${o.receiveShadow}|${!!o.geometry?.attributes?.color}`;
      if (!seen.has(key)) { seen.add(key); items.push(o); }
    });
    for (let i = 0; i < items.length; i++) {
      try { await renderer.compileAsync(items[i], camera, scene); } catch { renderer.compile(items[i], camera, scene); }
      P(0.74 + 0.1 * ((i + 1) / items.length));
    }
    P(0.84, 'Готовим тени…');
    await nextFrame();
    engine.updateShadows();
    renderer.render(scene, camera); // теневые шейдеры и загрузка геометрии в видеопамять
    for (const o of hidden) o.visible = false;
    dummy.visible = false;
  }


  // ── 6. тест производительности → уровень качества
  P(0.88, 'Подбираем качество под ваше устройство…');
  await nextFrame();
  {
    const ms = engine.benchmark(6);
    const tier = ms < 9 ? 'high' : ms < 20 ? 'medium' : 'low';
    const finalTier = engine.tier === 'medium' && tier === 'high' ? 'medium' : tier; // телефоны — не выше «среднего»
    engine.setTier(finalTier);
    if (import.meta.env.DEV) console.info(`[3D] кадр ${ms.toFixed(1)} мс → качество: ${finalTier}`);
  }
  const applyTier = (t) => { env.setShadowSize(TIERS[t].shadow); ctx.setTier(t); };
  applyTier(engine.tier);
  engine.onTier(applyTier);

  // ── 7. планировка (если открыта страница квартиры)
  if (hooks.initial?.view === 'plan' && planBySlug[hooks.initial.opts?.plan]) {
    P(0.93, 'Загружаем планировку квартиры…');
    try { await loadModel(planBySlug[hooks.initial.opts.plan].code); } catch { /* загрузим при показе */ }
  }
  P(1, 'Готово');

  // ───────────────────────── ракурсы ─────────────────────────
  function camFor(view) {
    const v = !desktop.matches && view.mobile ? { ...view, ...view.mobile } : view;
    const t = new THREE.Vector3(...v.t).add(O);
    const f = rectFov(engine.targetFrame);
    const d = Math.max(v.d, (v.R / Math.tan(Math.min(f.v, f.h) / 2)) * 1.05);
    const a = v.az * DEG; const e = v.el * DEG;
    const p = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).multiplyScalar(d).add(t);
    return { pos: p.toArray(), target: t.toArray(), dist: d };
  }

  const unitMatches = (u) => {
    const p = planBySlug[u.plan];
    if (filter.rooms && p.rooms !== filter.rooms) return false;
    const r = AREA_RANGES.find((x) => x.id === filter.area) || AREA_RANGES[0];
    return r.test(p.area);
  };
  function applyFilterHL() {
    const active = filter.rooms || (filter.area && filter.area !== 'all');
    bld.highlight(active && viewName === 'plans' && !bld.floorMode ? UNITS.filter(unitMatches).map((u) => u.id) : []);
  }

  function goView(name, { intro = false } = {}) {
    const v = VIEWS[name] || VIEWS.home;
    const { pos, target, dist } = camFor(v);
    rig.setLimits({ minDistance: Math.min(25, dist * 0.35), maxDistance: Math.max(v.far ? 2600 : 520, dist * 1.8), maxPolar: v.far ? 1.25 : 1.5, autoRotate: !!v.auto });
    env.setShadowFocus(new THREE.Vector3(...target).setY(0), v.far ? 260 : 120);
    if (intro) {
      const t = new THREE.Vector3(...target);
      const p = new THREE.Vector3(...pos).sub(t).multiplyScalar(1.6).add(t);
      p.y += 50;
      camera.position.copy(p);
      rig.controls.target.copy(t);
      camera.lookAt(t);
    }
    return rig.flyTo(pos, target, { duration: intro ? 2.2 : 1.5, arc: intro ? 0.05 : 0.18 });
  }

  async function setView(name, opts = {}) {
    const token = ++viewToken;
    const first = viewName === null;
    if (name === 'plan') return showPlan(opts.plan, opts.unit, token, first);
    const v = VIEWS[name] || VIEWS.home;
    if (planState) leavePlan(); // параллельно с перелётом камеры
    const prev = viewName;
    viewName = name;
    ui.hideCard(); ui.hideTip(); bld.hover(null); ui.busy(false);
    if (!v.floors && bld.floorMode) exitFloor(false);
    bld.setConstruction(!!v.construction);
    labels.show(v.labels || []);
    ui.floors.show(!!v.floors);
    ui.compass.hidden = !v.compass;
    if (v.sun) ui.sun.show(true); else if (prev && VIEWS[prev]?.sun) ui.sun.show(false);
    ui.legend.hide();
    if (v.construction) ui.legend.show('<span><i style="background:#9B978F"></i>Построено</span><span><i style="border:1px solid #D2AB67"></i>Проект</span>');
    applyFilterHL();
    if (v.pick && (name === 'home' || name === 'plans') && prev !== name) ui.showHint(matchMedia('(pointer: coarse)').matches ? 'Нажмите на окно — откроется квартира' : 'Наведите на окно — подскажем тип квартиры');
    if (bld.floorMode && v.floors) return;
    await goView(name, { intro: first });
  }

  // ── поэтажный план
  async function enterFloor(f, tower) {
    const list = bld.setFloorMode(f, tower);
    labels.remove('tiles');
    for (const u of list) {
      const p = planBySlug[u.plan];
      const b = u.box;
      labels.add(`${p.rooms}к · ${fmtArea(p.area)} м²`, L((b.x0 + b.x1) / 2, floorY(f) + 2.2, (b.z0 + b.z1) / 2), { group: 'tiles' });
    }
    labels.show(['tiles']);
    ui.legend.show(Object.entries(ROOM_COLORS).map(([r, c]) => `<span><i style="background:${c}"></i>${r}-комн.</span>`).join(''));
    applyFilterHL();
    const cx = tower ? (tower === 1 ? -14 : 14) : 0;
    const v = { t: [cx, floorY(f), -6], az: tower === 2 ? 20 : 340, el: 58, d: tower ? 70 : 110, R: tower ? 22 : 46 };
    const { pos, target } = camFor(v);
    rig.setLimits({ minDistance: 25, maxDistance: 260, maxPolar: 1.3 });
    env.setShadowFocus(new THREE.Vector3(...target), 70);
    push('floor_select', { floor: f, tower: tower || 'all' });
    await rig.flyTo(pos, target, { duration: 1.1, arc: 0.1 });
  }
  function exitFloor(fly = true) {
    bld.setFloorMode(null);
    labels.remove('tiles');
    labels.show(VIEWS[viewName]?.labels || []);
    ui.legend.hide();
    ui.floors.reset();
    applyFilterHL();
    if (fly) goView(viewName);
  }
  ui.floors.onSelect = (f, tower) => (f == null ? exitFloor() : enterFloor(f, tower));

  // ── «влёт» в квартиру
  function defaultUnit(slug) {
    return unitsByPlan(slug).sort((a, b) => Math.abs(a.floor - 9) - Math.abs(b.floor - 9) || a.tower - b.tower)[0];
  }
  function animateClip(to, capY, duration) {
    const from = Math.min(bld.clipY, topY + 1);
    return tween(engine, {
      duration, easing: ease.inOut,
      onUpdate: (k) => {
        const y = from + (to - from) * k;
        bld.setClip(k >= 1 && to > 1e4 ? 1e5 : y, k >= 1 ? capY : Math.max(capY, y));
      },
    });
  }
  const SEC = { x0: GEO.strip.x0, x1: GEO.white.x1, z0: GEO.white.z0, z1: GEO.white.z1 };
  function placeModel(model, u) {
    const g = model.group;
    const b = u.box;
    let cx = (b.x0 + b.x1) / 2;
    let cz = (b.z0 + b.z1) / 2;
    let w = model.size.w; let d = model.size.d;
    g.rotation.y = 0;
    if (planBySlug[u.plan].terrace) {
      // терраса — на кровле тёмного объёма (наружу от башни)
      g.rotation.y = u.tower === 1 ? -Math.PI / 2 : Math.PI / 2;
      [w, d] = [d, w];
      cx = u.tower === 1 ? GEO.strip.x0 - 1 : -GEO.strip.x0 + 1;
      cz = (SEC.z0 + SEC.z1) / 2;
    } else {
      const sx0 = u.tower === 1 ? SEC.x0 : -SEC.x1; const sx1 = u.tower === 1 ? SEC.x1 : -SEC.x0;
      const clamp = (c, size, a0, a1) => (size >= a1 - a0 ? (a0 + a1) / 2 : Math.min(a1 - size / 2, Math.max(a0 + size / 2, c)));
      cx = clamp(cx, w, sx0, sx1);
      cz = clamp(cz, d, SEC.z0, SEC.z1);
    }
    g.position.set(cx, floorY(u.floor) + 0.01, cz);
    bld.group.add(g);
    return { center: new THREE.Vector3(cx, floorY(u.floor), cz).add(O), R: Math.max(w, d) / 2 + 1.5, w, d };
  }

  async function showPlan(slug, unitId, token, first) {
    const plan = planBySlug[slug];
    if (!plan) return;
    let u = unitById[unitId];
    if (!u || u.plan !== slug) u = defaultUnit(slug);
    if (planState && planState.unit.id === u.id) return; // уже показываем
    if (planState) await leavePlan(true);
    if (token !== viewToken) return;
    viewName = 'plan';
    ui.hideCard(); ui.hideTip(); ui.hideHint(); bld.hover(null);
    if (bld.floorMode) exitFloor(false);
    bld.setConstruction(false);
    labels.show([]);
    ui.floors.show(false); ui.compass.hidden = true; ui.legend.hide(); ui.sun.show(false);
    const modelP = loadModel(plan.code); // грузится, пока камера летит к фасаду

    // 1) квартира снаружи
    bld.highlight([u.id]);
    const c = bld.unitCenter(u);
    const south = u.orient.includes('S') && !u.orient.includes('N');
    const zf = south ? 1 : -1;
    const side = u.tower === 1 ? -1 : 1;
    if (first) {
      camera.position.set(c.x + side * 120, c.y + 70, c.z + zf * 260);
      rig.controls.target.copy(c);
      camera.lookAt(c);
    }
    rig.setLimits({ minDistance: 5, maxDistance: 600, maxPolar: 1.5 });
    env.setShadowFocus(c.clone().setY(floorY(u.floor)), 40);
    await rig.flyTo([c.x + side * 16, c.y + 7, c.z + zf * 46], c.toArray(), { duration: first ? 1.8 : 1.3, arc: 0.12 });
    if (token !== viewToken) return;

    // 2) планировка готова? (обычно да — грузилась во время полёта)
    let model;
    const slow = setTimeout(() => ui.busy(true), 250);
    try { model = await modelP; } catch { clearTimeout(slow); ui.busy(false); return; }
    clearTimeout(slow);
    ui.busy(false);
    if (token !== viewToken) return;

    bld.highlight([]);
    const { center, R, w, d } = placeModel(model, u);
    const f = rectFov(engine.targetFrame);
    const low = f.aspect < 1; // на телефоне по умолчанию «срез» — больше видно пол
    planState = { model, unit: u, slug, mode: '3d', low };
    model.setWallHeight(low ? 1.2 : 3);
    model.setWalls(0);
    interior.position.copy(center).setY(center.y + 2.9);
    syncNight();

    // 3) одновременно: срез этажей, камера опускается к планировке, стены «вырастают».
    //    Длинная сторона планировки — по длинной стороне кадра, взгляд сверху под 66°.
    const e = 66 * DEG;
    const portrait = f.aspect < 1;
    const longZ = portrait ? w > d * 1.15 : d > w * 1.15;
    const longX = portrait ? d > w * 1.15 : w > d * 1.15;
    const a = longZ ? (side < 0 ? 270 : 90) - zf * 14 : (south ? 180 : 0) + side * (longX ? 10 : 30);
    const H = longZ ? d : w; const V = longZ ? w : d;
    const dist = Math.max((H / 2 + 1.5) / Math.tan(f.h / 2), (V * Math.sin(e) / 2 + 1.5 * Math.cos(e) + 1.5) / Math.tan(f.v / 2)) * 1.15;
    const pos = new THREE.Vector3(Math.sin(a * DEG) * Math.cos(e), Math.sin(e), -Math.cos(a * DEG) * Math.cos(e)).multiplyScalar(dist).add(center);
    env.setShadowFocus(center, R + 4);
    await Promise.all([
      animateClip(floorY(u.floor) + 0.06, floorY(u.floor), 0.9),
      rig.flyTo(pos.toArray(), center.toArray(), { duration: 1.6, arc: 0.08 }),
      tween(engine, { duration: 1.1, delay: 0.55, easing: ease.out, onUpdate: (k) => { model.setWalls(k); engine.updateShadows(); } }),
    ]);
    if (token !== viewToken) return;
    rig.setLimits({ minDistance: R * 0.9, maxDistance: R * 5, maxPolar: 1.38, minPolar: 0.05, pan: false });
    planState.cam = { pos: pos.toArray(), target: center.toArray() };
    ui.planbar.show(planState);
    const others = unitsByPlan(slug).slice(0, desktop.matches ? 6 : 3);
    ui.where.show(others.map((x) => ({ id: x.id, label: `Б${x.tower} · ${x.floor} эт.` })), u.id);
    ui.showHint('Вращайте и приближайте планировку', 3500);
    push('plan_3d_view', { layout_id: slug, unit: u.id });
  }

  async function leavePlan(quick = false) {
    if (!planState) return;
    const { model } = planState;
    planState = null;
    interior.intensity = 0;
    ui.planbar.hide(); ui.where.hide(); ui.show2D(null);
    await tween(engine, { duration: quick ? 0.25 : 0.35, easing: ease.inOut, onUpdate: (k) => { model.setWalls(1 - k); engine.updateShadows(); } });
    bld.group.remove(model.group);
    if (planState) return; // уже открыли другую
    await animateClip(2e5, 2e5, quick ? 0.35 : 0.7);
    if (!planState) bld.setClip(1e5);
  }

  ui.planbar.onAction = ({ mode, toggleWalls, out }) => {
    if (!planState) return;
    const code = planBySlug[planState.slug].code;
    if (mode) {
      planState.mode = mode;
      ui.show2D(mode === '3d' ? null : asset(mode === 'img' ? `assets/plans/${code}.webp` : `assets/plans/${code}-draft.png`), planTitle(planBySlug[planState.slug]));
      push('plan_mode', { layout_id: planState.slug, mode });
    }
    if (toggleWalls) {
      planState.low = !planState.low;
      planState.model.setWallHeight(planState.low ? 1.2 : 3);
      planState.model.setWalls(1);
      engine.updateShadows();
    }
    if (out) { hooks.navigate?.(asset('planirovki/')); return; }
    ui.planbar.show(planState);
  };
  ui.where.onPick = (id) => {
    if (!planState) return;
    const url = new URL(location.href);
    url.searchParams.set('u', id);
    history.replaceState(history.state, '', url);
    setView('plan', { plan: planState.slug, unit: id });
  };

  // ── время суток
  function syncNight() {
    const n = env.night;
    bld.setNight(n);
    ctx.setNight(n);
    interior.intensity = planState ? 45 * n : 0;
  }
  let todTween = 0;
  async function applyTOD(key) {
    if (!TOD[key]) return;
    const id = ++todTween;
    todKey = key; sunCustom = false;
    store.set('radian.tod', key);
    ui.tod.set(key);
    ui.sun.set(TOD[key].month, TOD[key].hours);
    const to = env.todPos(key);
    const from = env.sunState;
    const da = ((to.azimuth - from.azimuth + 540) % 360) - 180;
    push('time_of_day', { tod: key });
    await tween(engine, {
      duration: 1.4, easing: ease.inOutSine,
      onUpdate: (k) => {
        if (id !== todTween) return;
        env.setSun({ azimuth: from.azimuth + da * k, elevation: from.elevation + (to.elevation - from.elevation) * k }, k >= 1 ? key : 'keep');
        syncNight();
      },
    });
  }
  ui.tod.onPick = applyTOD;
  ui.sun.onChange = (month, hours) => {
    sunCustom = true;
    ++todTween;
    ui.tod.set(null);
    env.setSun(sunPosition(localDate(month, 21, hours), SITE.geo.lat, SITE.geo.lng));
    syncNight();
  };

  // ── выбор квартиры мышью/пальцем
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const canvas = engine.canvas;
  let pointer = null;
  let down = null;
  let hovered = null;
  const pickable = () => viewName && viewName !== 'plan' && (VIEWS[viewName]?.pick || bld.floorMode);
  function pick(x, y) {
    const { width, height } = engine.size;
    ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    let best = null;
    for (const hit of ray.intersectObject(bld.hit, false)) {
      const u = bld.unitAt(hit.instanceId);
      if (floorY(u.floor) >= bld.clipY - 0.2) continue;
      if (bld.floorMode && u.floor !== bld.floorMode) continue;
      best = { kind: 'unit', unit: u, distance: hit.distance };
      break;
    }
    if (!bld.floorMode) {
      for (const hit of ray.intersectObjects(bld.extraHits, false)) {
        if (!best || hit.distance < best.distance - 0.5) best = { kind: hit.object.userData.kind, distance: hit.distance };
        break;
      }
    }
    return best;
  }
  const unitText = (u) => {
    const p = planBySlug[u.plan];
    return `<b>${p.rooms}-комн.${p.terrace ? ' с террасой' : ''} · ${fmtArea(p.area)} м²</b>${towerLabel(u.tower)} · ${u.floor} этаж`;
  };
  engine.onFrame(() => {
    if (!pointer || rig.flying || !pickable()) return false;
    const { x, y } = pointer;
    pointer = null;
    const res = pick(x, y);
    const u = res?.kind === 'unit' ? res.unit : null;
    if (!ui.cardOpen && u !== hovered) { hovered = u; bld.hover(u); }
    canvas.style.cursor = u ? 'pointer' : '';
    if (!res) ui.hideTip();
    else if (res.kind === 'unit') ui.showTip(x, y, unitText(res.unit));
    else if (res.kind === 'apart') ui.showTip(x, y, '<b>Апартаменты и апарт-отель</b>По проекту — 114 номеров; статус уточняйте у менеджера');
    else if (res.kind === 'podium') ui.showTip(x, y, '<b>Первый этаж</b>Магазины, рестораны, фитнес-зал — по проекту');
    return false;
  });
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerleave', () => { ui.hideTip(); if (hovered && !ui.cardOpen) { hovered = null; bld.hover(null); } });
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; ui.hideHint(); });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || rig.flying) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 700;
    down = null;
    if (moved > 7 || !quick || !pickable()) return;
    const res = pick(e.clientX, e.clientY);
    if (res?.kind === 'unit') openCard(res.unit);
    else if (ui.cardOpen) { ui.hideCard(); bld.hover(null); hovered = null; }
  });

  function openCard(u) {
    const p = planBySlug[u.plan];
    ui.hideTip();
    bld.hover(u);
    hovered = u;
    rig.controls.autoRotate = false;
    const ori = u.orient.map((o) => ORIENT_LABEL[o]).join(', ');
    const view = u.orient.includes('S') ? ' — в сторону гор' : '';
    const ctxText = `${planTitle(p)}, ${towerLabel(u.tower)}, ${u.floor} этаж`;
    ui.showCard({
      img: asset(`assets/plans/${p.code}-s.webp`),
      title: planTitle(p),
      meta: `<b>${towerLabel(u.tower)} · ${u.floor} этаж</b><br>Окна: ${ori}${view}<br>Потолки 3 м · ПСО · от ${SITE.priceFromFmt} за м²`,
      actions: [
        { label: 'Планировка в 3D', href: asset(`planirovki/${p.slug}/?u=${u.id}`), primary: true },
        { label: 'Запросить', onClick: () => hooks.lead?.(ctxText) },
      ],
    });
    push('unit_click', { layout_id: p.slug, unit: u.id });
  }
  ui.onCardClose = () => { bld.hover(null); hovered = null; };

  // ── инструменты
  ui.tools.reset.addEventListener('click', () => {
    if (planState?.cam) rig.flyTo(planState.cam.pos, planState.cam.target, { duration: 1, arc: 0.05 });
    else if (bld.floorMode) enterFloor(bld.floorMode, null);
    else goView(viewName || 'home');
  });
  const hdrH = () => document.querySelector('[data-hdr]')?.offsetHeight || 64;
  function setFull(on) {
    full = on;
    ui.tools.full.innerHTML = on ? ui.tools.icons.collapse : ui.tools.icons.expand;
    ui.tools.full.title = on ? 'Свернуть модель' : 'Развернуть модель';
    const W = document.documentElement.clientWidth; const Hh = innerHeight; const top = hdrH();
    const r = { x: 0, y: top, w: W, h: Hh - top };
    engine.setRects(on ? { frame: r, clip: r, ui: r } : pageRects, 0.6);
    document.body.classList.toggle('stage-full', on);
  }
  ui.tools.full.addEventListener('click', () => setFull(!full));
  ui.compass.addEventListener('click', () => goView(viewName || 'location'));
  const fwd = new THREE.Vector3();
  engine.onLate(() => {
    if (ui.compass.hidden) return;
    camera.getWorldDirection(fwd);
    ui.compass.firstChild.style.transform = `rotate(${-Math.atan2(fwd.x, -fwd.z) / DEG}deg)`;
  });

  if (import.meta.env.DEV) window.__three = { THREE, engine, rig, bld, env, ctx, labels, get plan() { return planState; } };

  await nextFrame();
  stage.classList.add('ready');
  document.body.classList.add('scene-on');

  return {
    setView,
    setRects(r, duration = 0) {
      pageRects = r;
      if (!full) engine.setRects(r, duration);
    },
    setLayout() { if (full) setFull(false); },
    setFilter(f) { filter = { ...filter, ...f }; applyFilterHL(); },
    previewPlan(slug) {
      if (viewName === 'plan' || bld.floorMode) return;
      if (!slug) return applyFilterHL();
      bld.highlight(unitsByPlan(slug).map((u) => u.id));
    },
    previewRooms(n) {
      if (viewName === 'plan' || bld.floorMode) return;
      if (!n) return applyFilterHL();
      bld.highlight(UNITS.filter((u) => planBySlug[u.plan].rooms === n).map((u) => u.id));
    },
    prefetchPlan(slug) { const p = planBySlug[slug]; if (p) loadModel(p.code).catch(() => {}); },
    closeCard() { ui.hideCard(); bld.hover(null); hovered = null; },
    setPaused: (p) => engine.setPaused(p),
    get view() { return viewName; },
  };
}
