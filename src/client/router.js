// Переходы между страницами без перезагрузки: подгружаем готовый HTML страницы,
// плавно гасим текст, меняем <main> и метаданные, проявляем новый текст. 3D-сцена
// живёт непрерывно — камера перелетает к новому ракурсу. Без JS работают обычные ссылки.
const META_SEL = 'meta[name="description"],link[rel="canonical"],link[rel="alternate"],meta[property^="og:"],meta[name="robots"],script[type="application/ld+json"]';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createRouter({ onPage }) {
  const cache = new Map();
  const load = (path) => {
    if (!cache.has(path)) {
      cache.set(path, fetch(path, { credentials: 'same-origin' }).then((r) => {
        if (!r.ok && r.status !== 404) throw new Error(String(r.status));
        return r.text();
      }).catch((e) => { cache.delete(path); throw e; }));
    }
    return cache.get(path);
  };

  const eligible = (a, e) => {
    if (!a || !a.href || a.target || a.hasAttribute('download') || a.hasAttribute('data-external') || a.hasAttribute('data-zoom')) return false;
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return false;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return false;
    if (/\.[a-z0-9]{2,5}$/i.test(u.pathname) && !u.pathname.endsWith('.html')) return false;
    return true;
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!eligible(a, e)) return;
    e.preventDefault();
    go(a.href);
  });
  const prefetchLink = (e) => {
    const a = e.target.closest?.('a');
    if (eligible(a)) load(new URL(a.href).pathname).catch(() => {});
  };
  document.addEventListener('pointerover', prefetchLink, { passive: true });
  document.addEventListener('touchstart', prefetchLink, { passive: true });
  window.addEventListener('popstate', () => go(location.href, { push: false }));

  // разделы из меню — заранее, в простое браузера
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  idle(() => document.querySelectorAll('.nav a').forEach((a) => load(new URL(a.href).pathname).catch(() => {})), { timeout: 4000 });

  let navId = 0;
  async function go(href, { push = true } = {}) {
    const url = new URL(href, location.href);
    const samePage = url.pathname === location.pathname && url.search === location.search;
    if (samePage && url.hash) {
      if (push) history.pushState({}, '', url);
      document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const id = ++navId;
    document.body.classList.remove('nav-enter');
    document.body.classList.add('nav-leave');
    let html;
    try {
      [html] = await Promise.all([load(url.pathname), wait(reduced ? 0 : 180)]);
    } catch { location.href = url.href; return; }
    if (id !== navId) return;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const main = doc.querySelector('main');
    if (!main) { location.href = url.href; return; }

    document.title = doc.title;
    document.head.querySelectorAll(META_SEL).forEach((n) => n.remove());
    const anchor = document.head.querySelector('link[rel="stylesheet"]');
    doc.head.querySelectorAll(META_SEL).forEach((n) => document.head.insertBefore(document.importNode(n, true), anchor));
    const nav = doc.querySelector('[data-hdr]');
    const hdr = document.querySelector('[data-hdr]');
    if (nav && hdr) {
      hdr.querySelector('.nav').innerHTML = nav.querySelector('.nav').innerHTML;
      hdr.querySelector('.lang-list').innerHTML = nav.querySelector('.lang-list').innerHTML;
      hdr.querySelector('.mmenu').hidden = true;
      hdr.querySelector('[data-menu]')?.setAttribute('aria-expanded', 'false');
    }
    const fresh = document.adoptNode(main);
    document.querySelector('main').replaceWith(fresh);
    document.body.dataset.route = fresh.dataset.route;
    if (push) history.pushState({}, '', url);
    if (url.hash) document.getElementById(url.hash.slice(1))?.scrollIntoView();
    else window.scrollTo({ top: 0, behavior: 'instant' });
    onPage(fresh, url);
    document.body.classList.remove('nav-leave');
    document.body.classList.add('nav-enter');
    setTimeout(() => { if (id === navId) document.body.classList.remove('nav-enter'); }, 600);
    fresh.focus({ preventScroll: true });
    (window.dataLayer = window.dataLayer || []).push({ event: 'page_view', page_path: url.pathname, page_title: document.title });
  }

  return { go, prefetch: (p) => load(p).catch(() => {}) };
}
