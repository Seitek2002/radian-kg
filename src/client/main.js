// Точка входа. Страница полностью работает без JS и без WebGL (статический HTML).
// JS добавляет переходы без перезагрузки, а 3D-движок грузится отдельным чанком
// после первой отрисовки — с прогрессом в процентах (сначала байты чанка,
// потом этапы подготовки сцены).
import { initDom, openLead } from './ui/dom.js';
import { createRouter } from './router.js';
import { createPage } from './page.js';

const stage = document.querySelector('[data-stage]');
const pre = {
  pct: stage?.querySelector('[data-pre-pct]'),
  bar: stage?.querySelector('[data-pre-bar]'),
  text: stage?.querySelector('[data-pre-text]'),
};
let shown = 0;
function progress(p, text) {
  shown = Math.max(shown, p); // проценты только растут
  const v = Math.round(shown * 100);
  if (pre.pct) pre.pct.textContent = `${v}%`;
  if (pre.bar) pre.bar.style.width = `${v}%`;
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

function webgl() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}

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
  if (!stage) return;
  if (!webgl()) { stage.classList.add('no3d'); return; }
  window.__3d = true;
  document.querySelectorAll('[data-3d-only]').forEach((el) => { el.hidden = false; });
  progress(0.02, 'Загружаем 3D-движок…');
  try {
    await download(document.querySelector('meta[name="x-3d"]'));
    progress(0.34, 'Запускаем 3D-движок…');
    const { createApp3D } = await import('./scene/app3d.js');
    const a = await createApp3D(stage, {
      progress,
      rects: last.rects || page.rects(),
      initial: last.view ? { view: last.view[0], opts: last.view[1] } : null,
      navigate: (u) => router.go(u),
      lead: (ctx) => openLead(ctx),
    });
    app = a;
    if (import.meta.env.DEV) window.__app = app;
    app.setRects(page.rects(), 0);
    app.setFilter(last.filter);
    if (last.view) app.setView(...last.view);
    app.setPaused(last.paused);
  } catch (e) {
    console.error('3D недоступно:', e);
    stage.classList.add('no3d');
  }
}

// экономия трафика: 3D только по запросу
if (navigator.connection?.saveData) {
  if (pre.text) pre.text.textContent = 'Включена экономия трафика';
  const b = document.createElement('button');
  b.className = 's-btn';
  b.style.cssText = 'position:absolute;left:50%;top:60%;transform:translate(-50%,-50%);z-index:3;pointer-events:auto';
  b.textContent = 'Загрузить 3D-модель (≈ 1,3 МБ)';
  b.addEventListener('click', () => { b.remove(); boot3D(); }, { once: true });
  stage?.querySelector('.stage-frame')?.append(b);
} else if (document.readyState === 'complete') {
  boot3D();
} else {
  addEventListener('load', () => boot3D(), { once: true });
}
