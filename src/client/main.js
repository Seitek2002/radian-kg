// Точка входа. Страница полностью работает без JS и без WebGL (статический HTML).
// JS добавляет переходы без перезагрузки, а 3D-движок грузится отдельным чанком
// после первой отрисовки — с прогрессом в процентах (сначала байты чанка,
// потом этапы подготовки сцены).
import { initDom, openLead } from './ui/dom.js';
import { createRouter } from './router.js';
import { createPage } from './page.js';

const stage = document.querySelector('[data-stage]');
const pl = document.querySelector('[data-pl]'); // полноэкранный предзагрузчик
const pre = {
  pct: pl?.querySelector('[data-pre-pct]'),
  bar: pl?.querySelector('[data-pre-bar]'),
  text: pl?.querySelector('[data-pre-text]'),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Тяжёлая работа (разбор движка, сборка сцены) — только после вступления логотипа,
// чтобы анимация заставки не делила время с JS. Скачивание идёт параллельно.
const introDone = () => new Promise((r) => setTimeout(r, Math.max(0, (reduced ? 0 : 2400) - performance.now())));

// Убираем предзагрузчик не раньше, чем доиграет анимация логотипа (~2,9 с от начала
// загрузки страницы). Промис — момент, когда экран начинает гаснуть.
function hideLoader(minMs = reduced ? 0 : 2900) {
  if (!pl || pl.classList.contains('done')) return Promise.resolve();
  if (import.meta.env.DEV && location.search.includes('pl-debug')) return new Promise(() => {}); // заставка остаётся — для отладки анимации
  const wait = Math.max(0, minMs - performance.now());
  return new Promise((resolve) => setTimeout(() => {
    // страница под заставкой не рисовалась (visibility: hidden) — проявляем её,
    // пока заставка ещё непрозрачна, и только через пару кадров начинаем гасить
    document.documentElement.classList.add('pl-reveal');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      pl.classList.add('done');
      document.documentElement.classList.remove('pl-on');
      setTimeout(() => { pl.remove(); document.documentElement.classList.remove('pl-reveal'); }, 900);
      resolve();
    }));
  }, wait));
}
let shown = 0;
function progress(p, text) {
  if (text) performance.mark(`3d:${text}`); // этапы загрузки — видны в DevTools → Performance
  shown = Math.max(shown, p); // проценты только растут
  const v = Math.round(shown * 100);
  if (pre.pct) pre.pct.textContent = `${v}%`;
  if (pre.bar) pre.bar.style.transform = `scaleX(${shown})`; // transform — без пересчёта вёрстки
  if (text && pre.text) pre.text.textContent = text;
}

// Прокси к 3D: запоминает последние вызовы, пока движок грузится
let app = null;
const last = { view: null, rects: null, filter: { rooms: null, area: 'all' }, paused: false };
const scene = {
  setView(view, opts) { last.view = [view, opts]; app?.setView(view, opts); },
  setRects(r, d) { last.rects = r; app?.setRects(r, d); },
  setLayout(l) { app?.setLayout(l); },
  setFilter(f) { last.filter = { ...last.filter, ...f }; app?.setFilter(f); },
  previewPlan(s) { app?.previewPlan(s); },
  previewRooms(n) { app?.previewRooms(n); },
  prefetchPlan(s) { app?.prefetchPlan(s); },
  closeCard() { app?.closeCard(); },
  setPaused(p) { last.paused = p; app?.setPaused(p); },
};

initDom();
const page = createPage(scene);
const router = createRouter({ onPage: (main, url) => page.mount(main, url) });
page.mount(document.querySelector('main'), location);

// Только наличие API: пробный контекст WebGL стоит 200–300 мс главного потока.
// Если контекст на деле не создастся — это поймает запуск движка (catch ниже).
const webgl = () => !!window.WebGL2RenderingContext;

// Скачиваем чанк 3D-движка с прогрессом по байтам; import() затем возьмёт его из кэша
async function download(meta) {
  if (!meta || !window.ReadableStream) return;
  try {
    const total = Number(meta.dataset.size) || 0;
    const res = await fetch(meta.content);
    if (!res.ok || !res.body || !total) return;
    const reader = res.body.getReader();
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      progress(0.02 + 0.32 * Math.min(1, got / total), `Загружаем 3D-движок… ${Math.round(got / 1024)} из ${Math.round(total / 1024)} КБ`);
    }
  } catch { /* не страшно: import() скачает сам */ }
}

async function boot3D() {
  if (!stage) { hideLoader(0); return; }
  if (!webgl()) { stage.classList.add('no3d'); hideLoader(0); return; }
  window.__3d = true;
  document.querySelectorAll('[data-3d-only]').forEach((el) => { el.hidden = false; });
  progress(0.02, 'Загружаем 3D-модель комплекса…');
  try {
    await download(document.querySelector('meta[name="x-3d"]'));
    await introDone();
    progress(0.34, 'Запускаем 3D-движок…');
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // дать отрисовать текст
    const { createApp3D } = await import('./scene/app3d.js');
    const a = await createApp3D(stage, {
      progress,
      rects: last.rects || page.rects(),
      initial: last.view ? { view: last.view[0], opts: last.view[1] } : null,
      navigate: (u) => router.go(u),
      lead: (ctx) => openLead(ctx),
    });
    if (import.meta.env.DEV) window.__app = a;
    a.setRects(page.rects(), 0);
    a.setFilter(last.filter);
    a.setPaused(last.paused);
    await hideLoader();
    app = a; // с этого момента страница управляет сценой напрямую
    app.setRects(page.rects(), 0);
    app.setFilter(last.filter);
    if (last.view) app.setView(...last.view); // облёт камеры — одновременно с исчезновением заставки
  } catch (e) {
    console.error('3D недоступно:', e);
    stage.classList.add('no3d');
    hideLoader(0);
  }
}

// экономия трафика: 3D только по запросу
if (navigator.connection?.saveData) {
  hideLoader(0);
  const b = document.createElement('button');
  b.className = 's-btn';
  b.style.cssText = 'position:absolute;left:50%;top:60%;transform:translate(-50%,-50%);z-index:3;pointer-events:auto';
  b.textContent = 'Загрузить 3D-модель (≈ 1,3 МБ)';
  b.addEventListener('click', () => { b.remove(); boot3D(); }, { once: true });
  stage?.querySelector('.stage-frame')?.append(b);
} else {
  boot3D(); // сразу: заставка закрывает страницу, ждать загрузки картинок незачем
}
