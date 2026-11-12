// «Режиссёр» 3D-сцены. Пользователь только листает страницу: у каждой секции
// свой кадр (положение камеры, время суток, подписи), между кадрами камера
// движется вместе с прокруткой. Никакого управления моделью мышью.
//
// Всё тяжёлое делается в предзагрузке: геометрия, отражения для каждого времени
// суток, компиляция шейдеров, тест производительности.
import * as THREE from 'three';
import { createEngine, tween, ease, nextFrame, TIERS, reducedMotion } from './engine.js';
import { createSky } from './sky.js';
import { buildWorld } from './world.js';
import { createComplex } from './complex.js';
import { buildSite } from './site.js';
import { createLabels } from './labels.js';
import { setAnisotropy } from './tex.js';
import { LAYOUT, floorY, LV, MIRROR_X, SITE, PLAN } from '../../data/building.js';

// Небо: азимут солнца от севера, высота над горизонтом, облачность.
// «front» — условный свет на главный (северный) фасад, как на проектных визуализациях.
const SKY = {
  front: { az: 318, el: 27, cover: 0.3 },
  day: { az: 160, el: 50, cover: 0.34 },
  dusk: { az: 304, el: 2.5, cover: 0.4 },
  night: { az: 330, el: -14, cover: 0.25 },
};

// Кадры. p — камера, t — куда смотрит (x — восток, y — вверх, z — юг; фасад на z ≈ −4, центр на x = −8).
const SHOTS = {
  hero: { p: [-96, 34, -104], t: [-12, 25, 6], fov: 34, sky: 'front' },
  front: { p: [-8, 26, -168], t: [-8, 27, 5], fov: 26, sky: 'front' },
  facade: { p: [-56, 8, -36], t: [-27, 32, -4], fov: 40, sky: 'front' },
  podium: { p: [-36, 6, -44], t: [-30, 6.5, -4], fov: 46, sky: 'dusk', labels: ['tenant'] },
  yard: { p: [44, 48, 92], t: [-8, 3, 30], fov: 38, sky: 'day', labels: ['pin'] },
  location: { p: [230, 290, -400], t: [-8, 0, 50], fov: 30, sky: 'day', labels: ['road', 'stop', 'far', 'site'], far: true },
  mountains: { p: [-8, 62, 30], t: [-8, 64, 900], fov: 52, sky: 'front', labels: ['far'], far: true },
  plans: { p: [-22, 92, 58], t: [-29, 36, 10], fov: 34, sky: 'day', cut: { floor: 9, plan: 'typical' } },
  progress: { p: [-124, 66, -112], t: [-8, 14, 14], fov: 34, sky: 'day', build: true },
  night: { p: [-10, 17, -80], t: [-8, 25, 5], fov: 40, sky: 'night' },
  office: { p: [0, 0, 0], t: [0, 0, 0], fov: 60, sky: 'front', interior: true },
};
// Кадр квартиры: срез на её этаже, камера над её контуром на плане
function apartmentShot(slug) {
  const l = LAYOUT[slug];
  if (!l) return SHOTS.plans;
  const floor = l.floors[0] === l.floors[1] ? l.floors[0] : 9;
  let x0 = 1e9; let x1 = -1e9; let y0 = 1e9; let y1 = -1e9;
  for (const r of l.rects) { x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[2]); y0 = Math.min(y0, r[1]); y1 = Math.max(y1, r[3]); }
  const cx = SITE.axisX + ((x0 + x1) / 2 - MIRROR_X); const cz = SITE.frontZ + (PLAN.B.y1 - (y0 + y1) / 2);
  const y = floorY(floor); const span = Math.max(x1 - x0, y1 - y0);
  const d = 20 + span * 1.5;
  // камера с юга: север чертежа вверху экрана, подписи читаются
  return { p: [cx + d * 0.12, y + d, cz + d * 0.5], t: [cx, y, cz], fov: 34, sky: 'day', cut: { floor, plan: floor === 16 ? 'floor16' : floor === 15 ? 'floor15' : 'typical', rects: l.rects } };
}

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const sm = (t) => t * t * (3 - 2 * t);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } } };

export async function createApp3D(stage, hooks = {}) {
  const P = hooks.progress || (() => {});
  const engine = createEngine(stage);
  const { renderer, scene, camera } = engine;
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const shared = { uNight: { value: 0 }, uDay: { value: 1 } };
  const mobile = matchMedia('(max-width: 899px)');

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

  P(0.74, 'Рассчитываем свет для дня, вечера и ночи…');
  await nextFrame();
  sky.prepare(SKY);
  sky.setShadowFocus(new THREE.Vector3(SITE.axisX, 0, 18), 105);
  const skyCur = { ...SKY.front }; let skyKey = 'front';
  let skyTick = 0;
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
  let track = []; // [{ el, shot, ox, oy, c }] — секции-сцены по порядку
  const cur = { p: V(SHOTS.hero.p), t: V(SHOTS.hero.t), fov: SHOTS.hero.fov, ox: 0, oy: 0 };
  const want = { p: new THREE.Vector3(), t: new THREE.Vector3(), fov: 34, ox: 0, oy: 0 };
  let flight = null; // { t, d, from } — перелёт при смене страницы
  let active = null; // ближайший кадр (для неба, подписей, разреза)
  let todOverride = store.get('radian.tod'); if (!SKY[todOverride]) todOverride = null;
  let mode = { kind: 'none' }; let modeId = 0;
  const tmp = new THREE.Vector3();

  const resolve = (s) => (typeof s === 'string' ? SHOTS[s] || SHOTS.hero : s);
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
    k = sm(Math.min(1, Math.max(0, (k - 0.22) / 0.56))); // у центра секции кадр «стоит»
    blend(a.shot, b.shot, k, want);
    want.ox = a.ox + (b.ox - a.ox) * k; want.oy = a.oy + (b.oy - a.oy) * k;
    return { near: k < 0.5 ? a : b, settled: k < 0.12 || k > 0.88 };
  }

  function applyCamera() {
    const { width, height } = engine.size;
    camera.position.copy(cur.p); camera.lookAt(cur.t);
    // узкий экран: шире угол, чтобы объект помещался
    const aspect = width / height;
    const f = aspect < 1.25 ? Math.min(72, (2 * Math.atan(Math.tan((cur.fov * Math.PI) / 360) * (1.25 / aspect)) * 180) / Math.PI) : cur.fov;
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

  // разрез этажа / стройка — при смене кадра
  async function setMode(shot) {
    const next = shot.cut ? { kind: 'cut', ...shot.cut } : shot.build ? { kind: 'build' } : { kind: 'none' };
    if (JSON.stringify(next) === JSON.stringify(mode)) return;
    const id = ++modeId; const prev = mode; mode = next;
    const top = LV.parapetB + 3;
    cx.highlight(null);
    if (engine.composer) engine.composer.passes.forEach((p) => { if (p.constructor.name === 'GTAOPass') p.enabled = next.kind === 'none'; });
    if (prev.kind === 'build') cx.setConstruction(false);
    if (next.kind === 'build') { cx.setConstruction(true); return; }
    if (next.kind === 'cut') {
      await cx.usePlan(next.plan);
      if (id !== modeId) return;
      const y = floorY(next.floor); const from = Math.min(cx.clipY, top);
      await tween(engine, { duration: prev.kind === 'cut' ? 0.5 : 1.1, easing: ease.inOut, onUpdate: (k) => { if (id === modeId) cx.setCut(from + (y + 1.25 - from) * k, y + 0.03, Math.max(0, (k - 0.6) / 0.4), next.floor < 16); } });
      if (id === modeId && next.rects) cx.highlight(next.rects, y);
      return;
    }
    const from = Math.min(cx.clipY, top);
    await tween(engine, { duration: 0.8, easing: ease.inOut, onUpdate: (k) => { if (id === modeId) cx.setCut(from + (top - from) * k, null, 0); } });
    if (id === modeId) cx.setCut(1e5);
  }

  let lastScroll = -1; let lastLabels = '';
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
    if (moving || lastScroll !== scrollY) { applyCamera(); lastScroll = scrollY; }
    const shot = info.near.shot;
    if (stepSky(dt, shot)) moving = true;
    if (active !== info.near) {
      active = info.near; setMode(shot);
      sky.setShadowFocus(shot.far ? new THREE.Vector3(SITE.axisX, 0, 18) : new THREE.Vector3(SITE.axisX, 0, 18), shot.far ? 260 : 105);
    }
    const want2 = info.settled && !flight ? (shot.labels || []).join() : '';
    if (want2 !== lastLabels) { lastLabels = want2; labels.show(want2 ? want2.split(',') : []); }
    return moving;
  });
  engine.onResize(() => { measure(); applyCamera(); });
  addEventListener('scroll', () => engine.invalidate(), { passive: true });

  if (import.meta.env.DEV) window.__three = { THREE, engine, sky, cx, world, site, SHOTS, cur };

  return {
    // sections — элементы с data-shot; fly — перелёт к первому кадру (смена страницы)
    setTrack(sections, { fly = true } = {}) {
      const m = mobile.matches;
      track = sections.map((el) => {
        const d = el.dataset;
        const shot = d.shot === 'apartment' ? apartmentShot(d.plan) : resolve(d.shot);
        const side = d.side || 'left';
        // текст занимает одну сторону экрана: кадр сдвигаем в свободную и слегка расширяем угол;
        // по вертикали учитываем шапку (десктоп) или текст внизу (телефон)
        const shift = m ? 0 : side === 'left' ? 0.14 : side === 'right' ? -0.14 : 0;
        return { el, shot: shift ? { ...shot, fov: shot.fov * 1.16 } : shot, ox: shift, oy: m ? -0.16 : 0.035, c: 0 };
      });
      measure();
      if (fly && track.length) flight = { t: 0, d: reducedMotion ? 0.01 : 1.9, from: { p: cur.p.toArray(), t: cur.t.toArray(), fov: cur.fov, ox: cur.ox, oy: cur.oy, via: active?.shot.via } };
      active = null;
      engine.invalidate();
    },
    refresh() { measure(); engine.invalidate(); },
    // подсветить квартиру на плане (каталог): slug или null
    preview(slug) { if (mode.kind === 'cut' && !mode.rects) cx.highlight(slug && LAYOUT[slug] && LAYOUT[slug].floors[0] <= mode.floor && LAYOUT[slug].floors[1] >= mode.floor ? LAYOUT[slug].rects : null, floorY(mode.floor)); },
    setTimeOfDay(key) { todOverride = SKY[key] ? key : null; store.set('radian.tod', todOverride || ''); engine.invalidate(); },
    get timeOfDay() { return todOverride; },
    setPaused: (p) => engine.setPaused(p),
    start() { stage.classList.add('ready'); document.body.classList.add('scene-on'); engine.invalidate(); },
  };
}
