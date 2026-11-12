// Общие элементы страницы: меню, диалог «Запросить подбор», увеличение
// чертежей, карта по клику, события аналитики. Делегирование на document —
// работает и после смены <main> роутером.
import { SITE } from '../../data/site.js';

const push = (event, params = {}) => (window.dataLayer = window.dataLayer || []).push({ event, ...params });

export function openLead(ctx = '') {
  const d = document.getElementById('lead');
  if (!d) return;
  const p = d.querySelector('[data-lead-ctx]');
  p.hidden = !ctx;
  d.querySelector('[data-lead-ctx-text]').textContent = ctx;
  d.showModal();
  push('lead_open', { context: ctx || undefined });
}

let zoom = null;
function openZoom(src, alt) {
  if (!zoom) {
    zoom = document.createElement('dialog');
    zoom.className = 'zoom';
    zoom.innerHTML = '<button class="zoom-x" type="button" aria-label="Закрыть">×</button><div class="zoom-in"><img alt=""></div>';
    document.body.append(zoom);
    zoom.querySelector('.zoom-x').addEventListener('click', () => zoom.close());
    zoom.querySelector('.zoom-in').addEventListener('click', () => zoom.classList.toggle('big'));
    zoom.addEventListener('close', () => zoom.classList.remove('big'));
  }
  const img = zoom.querySelector('img');
  img.src = src;
  img.alt = alt || '';
  zoom.showModal();
}

export function initDom() {
  document.addEventListener('click', (e) => {
    const t = e.target;
    const menu = t.closest('[data-menu]');
    if (menu) {
      const m = document.getElementById('mmenu');
      m.hidden = !m.hidden;
      menu.setAttribute('aria-expanded', String(!m.hidden));
      return;
    }
    if (t.closest('.mmenu a')) { document.getElementById('mmenu').hidden = true; }
    const lead = t.closest('[data-lead]');
    if (lead) { e.preventDefault(); openLead(lead.dataset.leadCtx || ''); return; }
    const z = t.closest('[data-zoom]');
    if (z) { e.preventDefault(); openZoom(z.getAttribute('href'), z.querySelector('img')?.alt); return; }
    const map = t.closest('[data-map-load]');
    if (map) {
      const { lat, lng } = SITE.geo;
      const d = 0.012;
      const box = map.closest('[data-map]');
      box.innerHTML = `<iframe title="Карта: расположение комплекса" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d / 1.6}%2C${lng + d}%2C${lat + d / 1.6}&amp;layer=mapnik&amp;marker=${lat}%2C${lng}"></iframe>`;
      push('map_open');
      return;
    }
    const tr = t.closest('[data-track]');
    if (tr) push(tr.dataset.track, { layout_id: document.querySelector('main')?.dataset.plan });
    const lang = document.querySelector('.lang[open]');
    if (lang && !t.closest('.lang')) lang.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const m = document.getElementById('mmenu'); if (m && !m.hidden) m.hidden = true; }
  });
}
