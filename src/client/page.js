// Связка страницы и 3D. Секции-сцены (data-shot) задают кадры камеры —
// пользователь просто листает. Здесь же: навигация по главам справа,
// фильтр каталога и подсветка квартиры на плане этажа.
import { AREA_RANGES } from '../data/plans.js';

export function createPage(scene) {
  let main = null; let sections = []; let scenes = [];
  const chapters = document.querySelector('[data-chapters]');
  let raf = 0; let current = null;

  // какая глава сейчас на экране + закрыта ли сцена «листом» целиком
  function update() {
    raf = 0;
    const mid = innerHeight / 2; let cur = sections[0]; let covered = false;
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      if (r.top <= mid) cur = s;
      if (s.classList.contains('sheet') && r.top <= 0 && r.bottom >= innerHeight) covered = true;
    }
    const ftr = document.querySelector('.ftr');
    const atFoot = !!ftr && ftr.getBoundingClientRect().top < innerHeight - 80; // у подвала панели не нужны
    document.body.classList.toggle('covered', covered || atFoot);
    scene.setPaused(covered);
    if (cur !== current) {
      current = cur;
      chapters?.querySelectorAll('a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.i === String(sections.indexOf(cur)))));
    }
  }
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { scene.refresh(); onScroll(); });

  function buildChapters() {
    if (!chapters) return;
    const titled = sections.filter((s) => s.dataset.title);
    chapters.replaceChildren();
    if (titled.length < 3) return;
    for (const s of titled) {
      const a = document.createElement('a');
      a.textContent = s.dataset.title; a.dataset.i = String(sections.indexOf(s));
      a.href = `#${s.id || ''}`;
      a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); s.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      chapters.append(a);
    }
  }

  function hydrateCatalog() {
    const cards = [...main.querySelectorAll('[data-cards] [data-plan-card]')];
    const count = main.querySelector('[data-f-count]');
    const empty = main.querySelector('[data-empty]');
    if (!cards.length || !count) return;
    let area = 'all';
    const apply = () => {
      const r = AREA_RANGES.find((x) => x.id === area);
      let n = 0;
      for (const c of cards) { const ok = r.test(Number(c.dataset.area)); c.hidden = !ok; if (ok) n++; }
      count.textContent = `Найдено вариантов: ${n}`;
      if (empty) empty.hidden = n > 0;
      scene.refresh();
    };
    main.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f-area]');
      if (!b) return;
      area = b.dataset.fArea;
      main.querySelectorAll('[data-f-area]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      apply();
      (window.dataLayer = window.dataLayer || []).push({ event: 'filter_change', area });
    });
    apply();
  }
  function hydrateHover() {
    main.querySelectorAll('[data-plan-card]').forEach((c) => {
      const slug = c.dataset.planCard;
      c.addEventListener('pointerenter', () => scene.preview(slug));
      c.addEventListener('pointerleave', () => scene.preview(null));
      c.addEventListener('focusin', () => scene.preview(slug));
      c.addEventListener('focusout', () => scene.preview(null));
    });
  }

  function mount(m, { fly = true } = {}) {
    main = m;
    sections = [...main.querySelectorAll(':scope > section')];
    scenes = sections.filter((s) => s.dataset.shot);
    // страница без сцен (например, «Обработка данных») держит общий вид комплекса
    current = null;
    document.body.dataset.route = main.dataset.route;
    buildChapters();
    hydrateCatalog();
    hydrateHover();
    scene.setTrack(scenes, { fly });
    update();
    // картинки и шрифты меняют высоту секций — пересчитываем кадры
    main.querySelectorAll('img').forEach((img) => { if (!img.complete) img.addEventListener('load', () => scene.refresh(), { once: true }); });
    document.fonts?.ready.then(() => scene.refresh());
  }

  return { mount };
}
