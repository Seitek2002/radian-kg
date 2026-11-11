// Связка страницы и 3D: секция, которая сейчас в зоне чтения, задаёт ракурс
// камеры и раскладку (hero / split / stage). Здесь же — какая часть экрана
// отдана сцене (прямоугольники для маски и кадра) и фильтры каталога ↔ подсветка.
import { AREA_RANGES } from '../data/plans.js';

const desktop = matchMedia('(min-width: 900px)');

export function createPage(scene) {
  let sections = [];
  let active = null;
  let main = null;
  let url = null;
  let raf = 0;
  let vars = null;
  let layoutNow = document.body.dataset.layout;

  // CSS-переменные раскладки: меряем один раз и при ресайзе (не на каждый кадр)
  function measure() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;top:0;left:0';
    document.body.append(probe);
    const px = (v) => { probe.style.height = `var(${v})`; return probe.getBoundingClientRect().height; };
    vars = { hdr: px('--hdr'), stageM: px('--stage-m'), stageH: px('--stage-h') };
    probe.style.height = '0'; probe.style.width = 'var(--col)';
    vars.col = probe.getBoundingClientRect().width;
    probe.remove();
  }

  // Видимая область сцены для раскладки (координаты окна)
  function rects(layout) {
    const W = document.documentElement.clientWidth; const H = innerHeight;
    const { hdr, col, stageM, stageH } = vars;
    const d = desktop.matches;
    if (layout === 'hero') {
      const all = { x: 0, y: 0, w: W, h: H };
      // текст первого экрана — слева (десктоп) / снизу (телефон): кадр центрируем в свободной части
      return { frame: d ? { x: W * 0.34, y: hdr, w: W * 0.66, h: H - hdr } : { x: 0, y: hdr, w: W, h: H * 0.46 }, clip: all, ui: { x: 0, y: hdr, w: W, h: H - hdr } };
    }
    if (layout === 'stage') {
      const r = { x: 0, y: hdr, w: W, h: stageH };
      return { frame: r, clip: { ...r, h: Math.max(0, stageH - scrollY) }, ui: r };
    }
    const r = d ? { x: col, y: hdr, w: W - col, h: H - hdr } : { x: 0, y: hdr, w: W, h: stageM };
    return { frame: r, clip: r, ui: r };
  }

  function viewOpts(sec) {
    if (sec.dataset.view !== 'plan') return {};
    return { plan: main.dataset.plan, unit: url.searchParams.get('u') };
  }

  function setLayout(l, animate) {
    const changed = layoutNow !== l;
    layoutNow = l;
    if (document.body.dataset.layout !== l) document.body.dataset.layout = l;
    if (changed) scene.setLayout(l);
    scene.setRects(rects(l), changed && animate ? 0.85 : 0);
  }

  function pickActive(animate = true) {
    raf = 0;
    if (!sections.length) return;
    const vh = innerHeight;
    const th = !desktop.matches && layoutNow === 'split' ? vars.hdr + vars.stageM + (vh - vars.hdr - vars.stageM) * 0.3 : vh * 0.55;
    let cur = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= th) cur = s;
    const l = cur.dataset.layout || main.dataset.layout;
    if (cur !== active) {
      active = cur;
      setLayout(l, animate);
      scene.setView(cur.dataset.view, viewOpts(cur));
    } else if (l === 'stage') {
      scene.setRects(rects(l), 0); // планировка «уезжает» под текст при прокрутке
    }
    if (l === 'stage') scene.setPaused(scrollY > vars.stageH + 20);
    else scene.setPaused(false);
  }
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => pickActive(true)); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { measure(); scene.setRects(rects(layoutNow), 0); onScroll(); });

  function hydrateCatalog() {
    const box = main.querySelector('[data-filters]');
    if (!box) return;
    const cards = [...main.querySelectorAll('[data-plan-card]')];
    const count = box.querySelector('[data-f-count]');
    const empty = main.querySelector('[data-empty]');
    const rooms = main.dataset.rooms ? Number(main.dataset.rooms) : null;
    let area = 'all';
    const apply = () => {
      const r = AREA_RANGES.find((x) => x.id === area);
      let n = 0;
      for (const c of cards) {
        const ok = r.test(Number(c.dataset.area));
        c.hidden = !ok;
        if (ok) n++;
      }
      count.textContent = `Найдено вариантов: ${n}`;
      if (empty) empty.hidden = n > 0;
      scene.setFilter({ rooms, area });
    };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f-area]');
      if (!b) return;
      area = b.dataset.fArea;
      box.querySelectorAll('[data-f-area]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      apply();
      (window.dataLayer = window.dataLayer || []).push({ event: 'filter_change', rooms: rooms || 'all', area });
    });
    apply();
  }

  function hydrateHover() {
    main.querySelectorAll('[data-plan-card]').forEach((c) => {
      const slug = c.dataset.planCard;
      c.addEventListener('pointerenter', () => { scene.previewPlan(slug); scene.prefetchPlan(slug); });
      c.addEventListener('pointerleave', () => scene.previewPlan(null));
      c.addEventListener('focusin', () => scene.previewPlan(slug));
      c.addEventListener('focusout', () => scene.previewPlan(null));
      c.addEventListener('touchstart', () => scene.prefetchPlan(slug), { passive: true });
    });
    main.querySelectorAll('[data-hl-rooms]').forEach((a) => {
      const n = Number(a.dataset.hlRooms);
      a.addEventListener('pointerenter', () => scene.previewRooms(n));
      a.addEventListener('pointerleave', () => scene.previewRooms(null));
    });
  }

  function mount(m, u) {
    main = m;
    url = new URL(u.href || u, location.href);
    sections = [...main.querySelectorAll('[data-view]')].filter((s) => s !== main);
    if (!sections.length) sections = [main];
    active = null;
    if (!vars) measure();
    document.body.dataset.route = main.dataset.route;
    scene.closeCard();
    if (main.dataset.route !== 'plans' && main.dataset.route !== 'rooms') scene.setFilter({ rooms: null, area: 'all' });
    if (window.__3d) main.querySelectorAll('[data-3d-only]').forEach((el) => { el.hidden = false; });
    hydrateCatalog();
    hydrateHover();
    pickActive(true);
  }

  measure();
  return { mount, refresh: () => pickActive(true), rects: () => rects(layoutNow), get vars() { return vars; } };
}
