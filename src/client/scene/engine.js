// Ядро: рендерер, пост-обработка, цикл кадров.
//
// Холст всегда на весь экран и не меняет размер. Кадр рисуется только при
// изменениях (движение камеры по скроллу, анимация). Тени пересчитываются
// только по запросу. Уровень качества выбирается тестом при загрузке и
// снижается сам, если устройство не успевает:
//   high   — затенение в углах (GTAO) + свечение + сглаживание MSAA
//   medium — свечение + MSAA
//   low    — без пост-обработки
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export const isMobile = matchMedia('(max-width: 899px)').matches || matchMedia('(pointer: coarse)').matches;
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const TIERS = {
  high: { dpr: 1.5, budget: 2.8e6, shadow: 4096, trees: 1, ao: true, bloom: true },
  medium: { dpr: 1.5, budget: 2.4e6, shadow: 2048, trees: 0.7, ao: false, bloom: true },
  low: { dpr: 1.1, budget: 1.9e6, shadow: 2048, trees: 0.6, ao: false, bloom: false },
};
const ORDER = ['high', 'medium', 'low'];

export function createEngine(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // сохраняет цвет материалов (ACES уводит коричневый в рыжий)
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.localClippingEnabled = true;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.3, 90000);

  let tier = isMobile ? 'medium' : 'high';
  let cw = 1; let ch = 1;
  let dirty = true;
  const hooks = new Set(); const late = new Set(); const tierListeners = new Set();

  // пост-обработка
  let composer = null; let gtao = null; let bloom = null;
  function buildComposer() {
    composer?.dispose?.();
    composer = null; gtao = null; bloom = null;
    const t = TIERS[tier];
    if (!t.bloom && !t.ao) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    if (t.ao) {
      gtao = new GTAOPass(scene, camera, size.x, size.y);
      gtao.blendIntensity = 0.85;
      gtao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.4, thickness: 1.6, scale: 1.1, samples: 8, distanceFallOff: 0.6, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
      composer.addPass(gtao);
    }
    if (t.bloom) {
      bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.6, 0.92);
      composer.addPass(bloom);
    }
    composer.addPass(new OutputPass());
  }

  const pixelRatio = () => {
    const t = TIERS[tier];
    return Math.max(0.6, Math.min(devicePixelRatio || 1, t.dpr, Math.sqrt(t.budget / (cw * ch))));
  };
  function resize() {
    const w = Math.max(1, stage.clientWidth); const h = Math.max(1, stage.clientHeight);
    if (w === cw && h === ch) return;
    cw = w; ch = h;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(cw, ch, false);
    composer?.setPixelRatio(pixelRatio());
    composer?.setSize(cw, ch);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    for (const fn of resizeListeners) fn(cw, ch);
    dirty = true;
  }
  const resizeListeners = new Set();
  new ResizeObserver(resize).observe(stage);
  resize();

  const draw = () => { if (composer) composer.render(); else renderer.render(scene, camera); };

  let last = performance.now(); let paused = false;
  let slow = 0; let active = 0; let cooldown = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const raw = now - last; const dt = Math.min(0.05, raw / 1000);
    last = now;
    if (paused || document.hidden) return;
    let anim = false;
    for (const h of hooks) if (h(dt, now / 1000)) anim = true;
    if (dirty || anim) {
      for (const h of late) h();
      draw();
      dirty = false;
      // сторож производительности: устойчиво меньше ~27 к/с в движении — понижаем качество
      if (anim) {
        active++;
        if (active > 20 && raw > 37) slow++; else if (raw < 24) slow = Math.max(0, slow - 1);
        if (slow > 28 && now > cooldown && tier !== 'low') { setTier(ORDER[ORDER.indexOf(tier) + 1]); slow = 0; cooldown = now + 3500; }
      } else active = 0;
    }
  }
  requestAnimationFrame(loop);

  function setTier(t) {
    tier = t;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(cw, ch, false);
    buildComposer();
    for (const fn of tierListeners) fn(t);
    dirty = true;
  }

  return {
    THREE, renderer, scene, camera, canvas,
    get size() { return { width: cw, height: ch }; },
    get tier() { return tier; },
    get bloom() { return bloom; },
    get composer() { return composer; },
    setTier, onTier(fn) { tierListeners.add(fn); }, onResize(fn) { resizeListeners.add(fn); },
    buildComposer,
    invalidate() { dirty = true; },
    updateShadows() { renderer.shadowMap.needsUpdate = true; dirty = true; },
    onFrame(fn) { hooks.add(fn); return () => hooks.delete(fn); },
    onLate(fn) { late.add(fn); return () => late.delete(fn); },
    setPaused(p) { paused = p; if (!p) dirty = true; },
    draw,
    // Время кадра на GPU (мс). readPixels заставляет дождаться видеокарту — иначе замер врёт:
    // команды WebGL асинхронны, а gl.finish в браузерах ненадёжен.
    benchmark(frames = 6) {
      const gl = renderer.getContext(); const px = new Uint8Array(4);
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      draw(); sync();
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) { draw(); sync(); }
      return (performance.now() - t0) / frames;
    },
  };
}

export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export function tween(engine, { duration = 1, easing = ease.inOut, onUpdate, delay = 0 }) {
  return new Promise((resolve) => {
    if (reducedMotion || duration <= 0) { onUpdate(1); engine.invalidate(); resolve(); return; }
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
