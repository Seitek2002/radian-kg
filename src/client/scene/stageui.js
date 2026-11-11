// Интерфейс поверх 3D-сцены. Только DOM — никакой логики сцены.
import { GEO } from '../../data/building.js';

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};
const ICON = {
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  day: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg>',
  evening: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 18a5 5 0 0 0-10 0"/><path d="M12 9V3M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M8 6l4-4 4 4"/></svg>',
  night: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

export function createStageUI(stage, tod) {
  const root = stage.querySelector('[data-stage-ui]');
  root.replaceChildren();

  // предзагрузчик — уже есть в HTML страницы (виден до загрузки JS)
  const pre = {
    pct: stage.querySelector('[data-pre-pct]'),
    bar: stage.querySelector('[data-pre-bar]'),
    text: stage.querySelector('[data-pre-text]'),
  };

  const labels = h('div', 's-labels');
  stage.querySelector('.stage-frame')?.after(labels); // подписи — на весь холст
  const badge = h('div', 's-badge', 'Схематичная модель<span class="s-badge-t">Модель построена по проектным визуализациям и упрощена. Размещение квартир по этажам — условное, для демонстрации: точное расположение, наличие и стоимость уточнит менеджер.</span>');
  badge.tabIndex = 0;
  const tip = h('div', 's-tip');
  const hint = h('div', 's-hint off');
  const busy = h('div', 's-busy off', 'Готовим планировку…');
  const tools = h('div', 's-tools');
  const compass = h('button', 's-compass', '<i></i>');
  compass.type = 'button';
  compass.setAttribute('aria-label', 'Компас: север');
  compass.hidden = true;
  const floors = h('div', 's-floors');
  floors.hidden = true;
  const sun = h('div', 's-sun');
  sun.hidden = true;
  const planbar = h('div', 's-planbar');
  planbar.hidden = true;
  const where = h('div', 's-where');
  where.hidden = true;
  const legend = h('div', 's-legend');
  legend.hidden = true;
  const img2d = h('div', 's-img2d');
  root.append(img2d, badge, hint, busy, legend, planbar, floors, tools, where, sun, compass, tip);

  // карточка квартиры — отдельный слой поверх страницы
  const card = h('div', 's-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Квартира');
  document.body.append(card);

  // ── инструменты: ракурс, время суток, развернуть
  const btn = (label, icon, title) => {
    const b = h('button', 's-btn', `${icon || ''}${label ? `<span>${label}</span>` : ''}`);
    b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    return b;
  };
  const bReset = btn('', ICON.reset, 'Вернуть ракурс');
  const bFull = btn('', ICON.expand, 'Развернуть модель');
  const todBox = h('div', 's-seg s-tod');
  todBox.setAttribute('role', 'group');
  todBox.setAttribute('aria-label', 'Время суток');
  const todBtns = {};
  for (const [key, t] of Object.entries(tod)) {
    const b = btn(t.label, ICON[key], `${t.label} — ${t.hint}`);
    b.dataset.tod = key;
    b.setAttribute('aria-pressed', 'false');
    todBtns[key] = b;
    todBox.append(b);
  }
  const bClock = btn('', ICON.clock, 'Точное время и месяц');
  bClock.setAttribute('aria-pressed', 'false');
  tools.append(bReset, todBox, bClock, bFull);
  let todCb = null;
  todBox.addEventListener('click', (e) => { const b = e.target.closest('[data-tod]'); if (b) todCb?.(b.dataset.tod); });

  // ── подсказка у курсора (координаты окна)
  let tipOn = false;
  function showTip(x, y, html) {
    tip.innerHTML = html;
    const r = root.getBoundingClientRect();
    const tx = Math.min(x - r.left, r.width - tip.offsetWidth - 24);
    const ty = Math.min(y - r.top, r.height - tip.offsetHeight - 24);
    tip.style.left = `${tx}px`;
    tip.style.top = `${ty}px`;
    if (!tipOn) { tip.classList.add('on'); tipOn = true; }
  }
  function hideTip() { if (tipOn) { tip.classList.remove('on'); tipOn = false; } }

  // ── карточка квартиры
  let onCardClose = null;
  function showCard({ img, title, meta, actions }) {
    card.innerHTML = `<button class="s-card-x" type="button" aria-label="Закрыть">×</button>
      <img src="${img}" alt="">
      <div class="s-card-b"><h3>${title}</h3><p class="s-card-m">${meta}</p><div class="row"></div></div>`;
    const row = card.querySelector('.row');
    for (const a of actions) {
      const el = a.href ? h('a', `btn ${a.primary ? 'btn-gold' : 'btn-line'}`, a.label) : h('button', `btn ${a.primary ? 'btn-gold' : 'btn-line'}`, a.label);
      if (a.href) el.href = a.href; else el.type = 'button';
      if (a.onClick) el.addEventListener('click', a.onClick);
      row.append(el);
    }
    card.querySelector('.s-card-x').addEventListener('click', () => { hideCard(); onCardClose?.(); });
    card.classList.add('on');
  }
  function hideCard() { card.classList.remove('on'); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card.classList.contains('on')) { hideCard(); onCardClose?.(); } });

  // ── выбор этажа
  let floorCb = null;
  let towerSel = 0;
  let floorSel = null;
  function renderFloors() {
    const tw = `<p>Блок</p><div class="s-tw"><button type="button" data-tw="0" aria-pressed="${towerSel === 0}" aria-label="Оба блока">1+2</button><button type="button" data-tw="1" aria-pressed="${towerSel === 1}" aria-label="Блок 1">1</button><button type="button" data-tw="2" aria-pressed="${towerSel === 2}" aria-label="Блок 2">2</button></div>`;
    let list = '';
    for (let f = GEO.topRes; f >= GEO.firstRes; f--) list += `<button type="button" data-floor="${f}" aria-pressed="${floorSel === f}" aria-label="${f} этаж">${f}</button>`;
    floors.innerHTML = `${tw}<p>Этаж</p>${list}`;
  }
  floors.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tw != null) { towerSel = Number(b.dataset.tw); renderFloors(); if (floorSel) floorCb?.(floorSel, towerSel || null); return; }
    const f = Number(b.dataset.floor);
    floorSel = floorSel === f ? null : f;
    renderFloors();
    floorCb?.(floorSel, towerSel || null);
  });

  // ── точное время (ползунок) — для инсоляции
  let sunCb = null;
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  sun.innerHTML = `<label for="s-sun-t">Время</label><input id="s-sun-t" type="range" min="0" max="23.75" step="0.25" value="10.5"><output>10:30</output>
    <select aria-label="Месяц">${MONTHS.map((m, i) => `<option value="${i}"${i === 5 ? ' selected' : ''}>21 ${m}</option>`).join('')}</select>`;
  const sunT = sun.querySelector('input'); const sunO = sun.querySelector('output'); const sunM = sun.querySelector('select');
  const fmtT = (v) => `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`;
  const sunChange = () => { sunO.textContent = fmtT(Number(sunT.value)); sunCb?.(Number(sunM.value), Number(sunT.value)); };
  sunT.addEventListener('input', sunChange);
  sunM.addEventListener('change', sunChange);
  const showSun = (on) => { sun.hidden = !on; bClock.setAttribute('aria-pressed', String(on)); };
  bClock.addEventListener('click', () => showSun(sun.hidden));

  // ── панель планировки
  let planCb = null;
  function showPlanbar(state) {
    planbar.innerHTML = `<div class="s-seg" role="group" aria-label="Вид планировки">
      <button class="s-btn" type="button" data-pv="3d" aria-pressed="${state.mode === '3d'}">3D</button>
      <button class="s-btn" type="button" data-pv="img" aria-pressed="${state.mode === 'img'}">Иллюстрация</button>
      <button class="s-btn" type="button" data-pv="draft" aria-pressed="${state.mode === 'draft'}">Чертёж</button></div>
      <button class="s-btn" type="button" data-walls aria-pressed="${state.low}" ${state.mode !== '3d' ? 'hidden' : ''}>Срез стен</button>
      <button class="s-btn" type="button" data-out>← К дому</button>`;
    planbar.hidden = false;
  }
  planbar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pv) planCb?.({ mode: b.dataset.pv });
    else if (b.hasAttribute('data-walls')) planCb?.({ toggleWalls: true });
    else if (b.hasAttribute('data-out')) planCb?.({ out: true });
  });

  let whereCb = null;
  function showWhere(items, activeId) {
    where.innerHTML = `<span>Где в доме</span>${items.map((u) => `<button class="s-btn" type="button" data-u="${u.id}" aria-pressed="${u.id === activeId}">${u.label}</button>`).join('')}`;
    where.hidden = false;
  }
  where.addEventListener('click', (e) => {
    const b = e.target.closest('[data-u]');
    if (b) whereCb?.(b.dataset.u);
  });

  function show2D(src, alt) {
    if (!src) { img2d.classList.remove('on'); return; }
    img2d.innerHTML = `<img src="${src}" alt="${alt || ''}">`;
    img2d.classList.add('on');
  }

  let hintTimer = 0;
  function showHint(text, ms = 5000) {
    hint.textContent = text;
    hint.classList.remove('off');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.add('off'), ms);
  }

  return {
    root, labels,
    progress(p, text) {
      const v = Math.max(0, Math.min(100, Math.round(p * 100)));
      if (pre.pct) pre.pct.textContent = `${v}%`;
      if (pre.bar) pre.bar.style.width = `${v}%`;
      if (text && pre.text) pre.text.textContent = text;
    },
    showTip, hideTip, showCard, hideCard, showHint,
    hideHint() { hint.classList.add('off'); },
    busy(on) { busy.classList.toggle('off', !on); },
    set onCardClose(fn) { onCardClose = fn; },
    get cardOpen() { return card.classList.contains('on'); },
    tools: { reset: bReset, full: bFull, icons: ICON },
    tod: {
      set onPick(fn) { todCb = fn; },
      set(key) { for (const [k, b] of Object.entries(todBtns)) b.setAttribute('aria-pressed', String(k === key)); },
    },
    compass,
    floors: {
      show(on) { floors.hidden = !on; if (on) renderFloors(); },
      set onSelect(fn) { floorCb = fn; },
      reset() { floorSel = null; renderFloors(); },
      get value() { return floorSel; },
    },
    sun: {
      show: showSun,
      get visible() { return !sun.hidden; },
      set onChange(fn) { sunCb = fn; },
      set(month, hours) { sunM.value = String(month); sunT.value = String(hours); sunO.textContent = fmtT(hours); },
    },
    planbar: { show: showPlanbar, hide() { planbar.hidden = true; }, set onAction(fn) { planCb = fn; } },
    where: { show: showWhere, hide() { where.hidden = true; }, set onPick(fn) { whereCb = fn; } },
    legend: {
      show(html) { legend.innerHTML = html; legend.hidden = false; },
      hide() { legend.hidden = true; },
    },
    show2D,
  };
}
