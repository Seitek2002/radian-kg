// Ядро: рендерер, камера, цикл кадров.
//
// Против лагов:
//  • холст всегда размером с окно и НЕ меняет размер при смене раскладки —
//    раскладка = маска clip-path + сдвиг кадра камеры (setViewOffset);
//  • рисуется только видимая область (scissor);
//  • кадр рисуется только при изменениях (рендер по требованию);
//  • тени пересчитываются только когда что-то изменилось (updateShadows);
//  • уровень качества выбирается тестом при загрузке и снижается сам,
//    если устройство не успевает.
import * as THREE from 'three';

export const isMobile = matchMedia('(max-width: 899px)').matches || matchMedia('(pointer: coarse)').matches;
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const TIERS = {
  high: { dpr: 2, budget: 4.5e6, shadow: 2048, trees: 1 },
  medium: { dpr: 1.5, budget: 2.8e6, shadow: 2048, trees: 0.8 },
  low: { dpr: 1, budget: 1.5e6, shadow: 1024, trees: 0.5 },
};
const ORDER = ['high', 'medium', 'low'];

// Поле зрения видимой области: шире на узких экранах, чтобы камере не приходилось
// отъезжать за соседние дома. v, h — радианы.
export function rectFov(f) {
  const fr = f.w / Math.max(1, f.h);
  const vDeg = fr >= 1.3 ? 32 : fr >= 0.9 ? 32 + (1.3 - fr) * 25 : 42 + (0.9 - Math.max(fr, 0.45)) * 18;
  const v = (vDeg * Math.PI) / 180;
  return { v, h: 2 * Math.atan(Math.tan(v / 2) * fr), aspect: fr };
}

const lerpRect = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k });
const sameRect = (a, b) => a && b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;

export function createEngine(stage, ui) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.localClippingEnabled = true;
  renderer.setScissorTest(true);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'Интерактивная 3D-модель комплекса');
  canvas.setAttribute('role', 'img');
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 80000);
  camera.position.set(-120, 40, -160);

  const hooks = new Set(); // (dt) => true, если ещё анимирую
  const late = new Set(); // после анимаций кадра (подписи)
  let dirty = true;
  let cw = 1; let ch = 1;
  let tier = isMobile ? 'medium' : 'high';

  // прямоугольники в координатах окна: frame — куда центрировать кадр,
  // clip — что видно, ui — где интерфейс
  let frame = { x: 0, y: 0, w: innerWidth, h: innerHeight };
  let clip = { ...frame };
  let uiRect = { ...frame };
  let tweenR = null;

  function pixelRatio() {
    const t = TIERS[tier];
    return Math.max(0.6, Math.min(devicePixelRatio || 1, t.dpr, Math.sqrt(t.budget / (cw * ch))));
  }

  function applyView() {
    // поле зрения подбираем под форму видимой области
    const half = Math.tan(rectFov(frame).v / 2) * (ch / Math.max(1, frame.h));
    camera.fov = (2 * Math.atan(half) * 180) / Math.PI;
    camera.aspect = cw / ch;
    const dx = frame.x + frame.w / 2 - cw / 2;
    const dy = frame.y + frame.h / 2 - ch / 2;
    camera.setViewOffset(cw, ch, -dx, -dy, cw, ch);
    camera.updateProjectionMatrix();
    const c = clip;
    renderer.setScissor(c.x, ch - c.y - c.h, Math.max(0, c.w), Math.max(0, c.h));
    stage.style.clipPath = `inset(${c.y}px ${Math.max(0, cw - c.x - c.w)}px ${Math.max(0, ch - c.y - c.h)}px ${c.x}px)`;
    dirty = true;
  }
  function applyUI() {
    Object.assign(ui.style, { left: `${uiRect.x}px`, top: `${uiRect.y}px`, width: `${uiRect.w}px`, height: `${uiRect.h}px` });
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)); const h = Math.max(1, Math.round(r.height));
    if (w === cw && h === ch) return;
    cw = w; ch = h;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(cw, ch, false);
    applyView();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  let last = performance.now();
  let paused = false;
  let slow = 0; let active = 0; let cooldown = 0;
  function frameLoop(now) {
    requestAnimationFrame(frameLoop);
    const dt = Math.min(0.05, (now - last) / 1000);
    const rawDt = now - last;
    last = now;
    if (paused || document.hidden) return;
    let anim = false;
    if (tweenR) {
      tweenR.t += dt;
      const k = Math.min(1, tweenR.t / tweenR.d);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      frame = lerpRect(tweenR.f0, tweenR.f1, e);
      clip = lerpRect(tweenR.c0, tweenR.c1, e);
      applyView();
      if (k >= 1) { tweenR = null; applyUI(); ui.classList.remove('moving'); }
      anim = true;
    }
    for (const h of hooks) if (h(dt)) anim = true;
    if (dirty || anim) {
      for (const h of late) h();
      if (clip.w > 1 && clip.h > 1) renderer.render(scene, camera);
      dirty = false;
      // сторож производительности: устойчиво < ~28 к/с — понижаем качество
      if (anim) {
        active++;
        if (active > 20 && rawDt > 36) slow++; else if (rawDt < 24) slow = Math.max(0, slow - 1);
        if (slow > 30 && now > cooldown && tier !== 'low') { setTier(ORDER[ORDER.indexOf(tier) + 1]); slow = 0; cooldown = now + 4000; }
      } else active = 0;
    }
  }
  requestAnimationFrame(frameLoop);

  const tierListeners = new Set();
  function setTier(t) {
    tier = t;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(cw, ch, false);
    applyView();
    for (const fn of tierListeners) fn(t);
  }

  return {
    THREE, renderer, scene, camera, canvas,
    get size() { return { width: cw, height: ch }; },
    get frame() { return frame; },
    get clip() { return clip; },
    get tier() { return tier; },
    setTier, onTier(fn) { tierListeners.add(fn); },
    invalidate() { dirty = true; },
    updateShadows() { renderer.shadowMap.needsUpdate = true; dirty = true; },
    onFrame(fn) { hooks.add(fn); return () => hooks.delete(fn); },
    onLate(fn) { late.add(fn); return () => late.delete(fn); },
    setPaused(p) { paused = p; if (!p) dirty = true; },
    // угловой размер видимого кадра — чтобы вписывать объекты
    frameFov() {
      const v = (camera.fov * Math.PI) / 180;
      const tv = Math.tan(v / 2);
      return { v: 2 * Math.atan(tv * (frame.h / ch)), h: 2 * Math.atan(tv * (cw / ch) * (frame.w / cw)) };
    },
    // кадр, к которому идёт анимация (для расчёта ракурса заранее)
    get targetFrame() { return tweenR ? tweenR.f1 : frame; },
    setRects(next, duration = 0) {
      const f1 = next.frame; const c1 = next.clip; const u1 = next.ui || next.clip;
      if (sameRect(f1, tweenR ? tweenR.f1 : frame) && sameRect(c1, tweenR ? tweenR.c1 : clip)) {
        if (!sameRect(u1, uiRect)) { uiRect = u1; if (!tweenR) applyUI(); }
        return;
      }
      uiRect = u1;
      if (duration <= 0 || reducedMotion) {
        tweenR = null; frame = f1; clip = c1;
        applyView(); applyUI(); ui.classList.remove('moving');
        return;
      }
      tweenR = { t: 0, d: duration, f0: frame, c0: clip, f1, c1 };
      ui.classList.add('moving');
    },
    // тест производительности: среднее время кадра (мс), с ожиданием GPU
    benchmark(frames = 8) {
      const gl = renderer.getContext();
      renderer.render(scene, camera);
      gl.finish();
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) renderer.render(scene, camera);
      gl.finish();
      return (performance.now() - t0) / frames;
    },
  };
}

// Твин без зависимостей
export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export function tween(engine, { duration = 1, easing = ease.inOut, onUpdate, delay = 0 }) {
  return new Promise((resolve) => {
    if (reducedMotion || duration <= 0) {
      onUpdate(1);
      engine.invalidate();
      resolve();
      return;
    }
    let t = -delay;
    const off = engine.onFrame((dt) => {
      t += dt;
      if (t < 0) return true;
      const k = Math.min(1, t / duration);
      onUpdate(easing(k));
      if (k >= 1) { off(); resolve(); }
      return true;
    });
  });
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
