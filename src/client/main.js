// Точка входа. Страница полностью работает без JS и без WebGL (статический HTML
// поверх проектной визуализации). JS добавляет переходы без перезагрузки,
// а 3D-движок грузится отдельным чанком — с прогрессом на заставке.
import { initDom, openLead } from './ui/dom.js';
import { createRouter } from './router.js';
import { createPage } from './page.js';
import { asset } from './base.js';

const stage = document.querySelector('[data-stage]');
const pl = document.querySelector('[data-pl]'); // полноэкранная заставка
const pre = { pct: pl?.querySelector('[data-pre-pct]'), bar: pl?.querySelector('[data-pre-bar]'), text: pl?.querySelector('[data-pre-text]') };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Тяжёлая работа (разбор движка, сборка сцены) — только после вступления логотипа,
// чтобы анимация заставки не делила время с JS. Скачивание идёт параллельно.
const introDone = () => new Promise((r) => setTimeout(r, Math.max(0, (reduced ? 0 : 2400) - performance.now())));

let shown = 0;
function progress(p, text) {
  if (text) performance.mark(`3d:${text}`);
  shown = Math.max(shown, p); // проценты только растут
  if (pre.pct) pre.pct.textContent = `${Math.round(shown * 100)}%`;
  if (pre.bar) pre.bar.style.transform = `scaleX(${shown})`;
  if (text && pre.text) pre.text.textContent = text;
}

// Заставка уходит не раньше, чем доиграет логотип (~2,9 с от начала загрузки)
function hideLoader(minMs = reduced ? 0 : 2900) {
  if (!pl || pl.classList.contains('done')) return Promise.resolve();
  if (import.meta.env.DEV && location.search.includes('pl-debug')) return new Promise(() => {});
  return new Promise((resolve) => setTimeout(() => {
    document.documentElement.classList.add('pl-reveal');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      pl.classList.add('done');
      document.documentElement.classList.remove('pl-on');
      setTimeout(() => { pl.remove(); document.documentElement.classList.remove('pl-reveal'); }, 900);
      resolve();
    }));
  }, Math.max(0, minMs - performance.now())));
}

// Прокси к 3D: запоминает последний сценарий, пока движок грузится
let app = null;
const last = { track: null, paused: false };
const scene = {
  setTrack(sections, opts) { last.track = [sections, opts]; app?.setTrack(sections, opts); },
  refresh() { app?.refresh(); },
  preview(slug) { app?.preview(slug); },
  setPaused(p) { last.paused = p; app?.setPaused(p); },
};

initDom();
const page = createPage(scene);
const router = createRouter({ onPage: (main) => page.mount(main, { fly: true }) });
page.mount(document.querySelector('main'), { fly: false });

// вид модели: приблизить, отдалить, вернуть кадр секции (поворот — перетаскиванием самой модели)
const view = document.querySelector('[data-view]');
const viewReset = view?.querySelector('[data-view-key="reset"]');
const viewStore = { get used() { try { return localStorage.getItem('radian.view') === '1'; } catch { return false; } }, set used(v) { try { localStorage.setItem('radian.view', v ? '1' : ''); } catch { /* приватный режим */ } } };
if (viewStore.used) document.body.classList.add('view-used');
function onView(changed) {
  if (viewReset) viewReset.disabled = !changed;
  if (changed && !document.body.classList.contains('view-used')) { document.body.classList.add('view-used'); viewStore.used = true; }
}
view?.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !app) return;
  const k = b.dataset.viewKey;
  if (k === 'reset') app.resetView(); else app.zoom(k === 'in' ? 0.78 : 1.28);
  (window.dataLayer = window.dataLayer || []).push({ event: 'model_view', action: k });
});

// время суток на модели
const tod = document.querySelector('[data-tod]');
const syncTod = (key) => tod?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.todKey || null) === (key || null))));
tod?.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !app) return;
  app.setTimeOfDay(b.dataset.todKey || null);
  syncTod(b.dataset.todKey || null);
  (window.dataLayer = window.dataLayer || []).push({ event: 'time_of_day', tod: b.dataset.todKey || 'auto' });
});

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
  progress(0.02, 'Загружаем 3D-модель комплекса…');
  try {
    await download(document.querySelector('meta[name="x-3d"]'));
    await introDone();
    progress(0.34, 'Запускаем 3D-движок…');
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const { createApp3D } = await import('./scene/app3d.js');
    const a = await createApp3D(stage, { progress, lead: (ctx) => openLead(ctx), view: onView, navigate: (path) => router.go(asset(path)) });
    if (import.meta.env.DEV) window.__app = a;
    syncTod(a.timeOfDay);
    await hideLoader();
    app = a;
    app.start();
    if (last.track) app.setTrack(last.track[0], { fly: true }); // первый пролёт — вместе с исчезновением заставки
    app.setPaused(last.paused);
  } catch (e) {
    console.error('3D недоступно:', e);
    stage.classList.add('no3d');
    hideLoader(0);
  }
}

if (navigator.connection?.saveData) {
  // экономия трафика: вместо 3D остаётся проектная визуализация
  stage?.classList.add('no3d');
  hideLoader(0);
} else boot3D();
