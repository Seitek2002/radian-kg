// Полноэкранный предзагрузчик с анимированным логотипом RADIAN GROUP
// (по мотивам LoadingOverlay из проекта avangard).
//
// Почему логотип разобран на HTML-слои, а не анимируется внутри одного SVG:
// анимации clip-path и transform у элементов SVG браузер считает в главном потоке,
// а он в это время занят подготовкой 3D — анимация дёргается. Здесь каждая
// деталь — отдельный слой, и двигаются только transform/opacity: такие анимации
// идут в потоке композитора и остаются плавными, даже когда JS занят.
// Эффект «шторки» — два встречных сдвига: рамка едет в одну сторону,
// содержимое — в другую, видна только движущаяся граница.
//
// Сценарий: 4 колонны знака «вырастают» слоями цвета (как строящиеся башни) →
// дуга-горизонт прорисовывается → знак уменьшается и уезжает влево, надпись
// RADIAN GROUP проявляется по буквам → раскрывается линия горизонта и слоган →
// пока идёт загрузка, по линии горизонта бежит блик.
// Работает только в Node (сборка страниц).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../public/assets/brand/logo-h-white.svg', import.meta.url));

// Габариты подконтура по абсолютным командам M/L/H/V/C/Z
function bbox(d) {
  const t = d.match(/[MLHVCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  let x = 0; let y = 0; let cmd = 'M';
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const add = (px, py) => { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); };
  for (let i = 0; i < t.length;) {
    if (/[A-Z]/i.test(t[i])) { cmd = t[i++].toUpperCase(); if (cmd === 'Z') continue; }
    const n = () => Number(t[i++]);
    if (cmd === 'M' || cmd === 'L') { x = n(); y = n(); add(x, y); } else if (cmd === 'H') { x = n(); add(x, y); } else if (cmd === 'V') { y = n(); add(x, y); } else if (cmd === 'C') { for (let k = 0; k < 3; k++) { x = n(); y = n(); add(x, y); } } else i++;
  }
  return { x0, y0, x1, y1 };
}

// Делим надпись на буквы: всё, что по горизонтали перекрывает букву больше чем
// наполовину (дырки в A, D, O; ножка у R), — часть этой буквы
function letters(d) {
  const subs = d.split(/(?=M)/).map((s) => s.trim()).filter(Boolean).map((s) => ({ d: s, b: bbox(s) }));
  subs.sort((a, b) => (b.b.x1 - b.b.x0) - (a.b.x1 - a.b.x0));
  const out = [];
  for (const s of subs) {
    const w = s.b.x1 - s.b.x0;
    const host = out.find((l) => Math.min(l.b.x1, s.b.x1) - Math.max(l.b.x0, s.b.x0) > w * 0.5);
    if (host) {
      host.d += s.d;
      host.b = { x0: Math.min(host.b.x0, s.b.x0), y0: Math.min(host.b.y0, s.b.y0), x1: Math.max(host.b.x1, s.b.x1), y1: Math.max(host.b.y1, s.b.y1) };
    } else out.push({ d: s.d, b: { ...s.b } });
  }
  return out.sort((a, b) => a.b.x0 - b.b.x0);
}

const r2 = (v) => Math.round(v * 1000) / 1000;

let cache = null;
export function loaderLogo() {
  if (cache) return cache;
  const svg = readFileSync(SRC, 'utf8');
  const [vx, vy, vw, vh] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  // в файле две соседние группы: знак (дуга + 4 колонны) и надпись
  const groups = [...svg.matchAll(/<g transform="([^"]+)">([\s\S]*?)<\/g>/g)];
  const paths = (s) => [...s.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  const markT = groups[0][1];
  const [mtx, mty] = markT.match(/-?\d*\.?\d+/g).map(Number);
  const [swoosh, ...bars] = paths(groups[0][2]);
  const wordT = groups[1][1];
  const [wtx, wty, ws] = wordT.match(/-?\d*\.?\d+/g).map(Number);
  const word = letters(paths(groups[1][2])[0]);

  // деталь логотипа: свой <svg> в своей рамке; позиция — в % от всего логотипа
  const PAD = 3;
  const part = (cls, style, d, T, b, wrap) => {
    const x0 = b.x0 - PAD; const y0 = b.y0 - PAD; const w = b.x1 - b.x0 + PAD * 2; const h = b.y1 - b.y0 + PAD * 2;
    const pos = `left:${r2(((x0 - vx) / vw) * 100)}%;top:${r2(((y0 - vy) / vh) * 100)}%;width:${r2((w / vw) * 100)}%;height:${r2((h / vh) * 100)}%`;
    const inner = `<svg viewBox="${r2(x0)} ${r2(y0)} ${r2(w)} ${r2(h)}" preserveAspectRatio="none"><g transform="${T}"><path d="${d}"/></g></svg>`;
    return `<span class="pl-p ${cls}" style="${pos};${style}">${wrap ? `<span class="pl-in">${inner}</span>` : inner}</span>`;
  };
  const inMark = (b) => ({ x0: b.x0 + mtx, y0: b.y0 + mty, x1: b.x1 + mtx, y1: b.y1 + mty });
  const inWord = (b) => ({ x0: wtx + b.x0 * ws, y0: wty + b.y0 * ws, x1: wtx + b.x1 * ws, y1: wty + b.y1 * ws });

  // колонны «строятся» слева направо, каждая — тремя слоями цвета
  const COLORS = ['#E6CB96', '#A8834B', '#D2AB67']; // светлое золото → бронза → золото
  const barBoxes = bars.map((d) => inMark(bbox(d)));
  const sorted = [...barBoxes].sort((p, q) => p.x0 - q.x0);
  const barEls = bars.map((d, i) => COLORS.map((c, k) => part('pl-bar', `--i:${sorted.indexOf(barBoxes[i])};--k:${k};color:${c}`, d, markT, barBoxes[i], true)).join('')).join('');
  const swooshBox = inMark(bbox(swoosh));
  const markBox = [swooshBox, ...barBoxes].reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
  // насколько сдвинуть знак, чтобы он стоял по центру логотипа (в % ширины логотипа)
  const shift = r2((((vx + vw / 2) - (markBox.x0 + markBox.x1) / 2) / vw) * 100);
  // центр знака — точка, вокруг которой он масштабируется
  const ox = r2((((markBox.x0 + markBox.x1) / 2 - vx) / vw) * 100);
  const oy = r2((((markBox.y0 + markBox.y1) / 2 - vy) / vh) * 100);
  const letterEls = word.map((l, i) => part('pl-l', `--i:${i}`, l.d, wordT, inWord(l.b), false)).join('');

  cache = `<div class="pl-logo" style="aspect-ratio:${vw}/${vh}" aria-hidden="true">
  <span class="pl-mark" data-shift="${shift}" style="transform-origin:${ox}% ${oy}%">${part('pl-sw', 'color:#D2AB67', swoosh, markT, swooshBox, true)}${barEls}</span>
  <span class="pl-word">${letterEls}</span>
</div>`;
  return cache;
}

export function loaderMarkup() {
  return `<div class="pl" id="pl" data-pl role="status" aria-live="polite" aria-label="Загрузка 3D-модели">
  <div class="pl-c">
    ${loaderLogo()}
    <span class="pl-horizon" aria-hidden="true"><i></i></span>
    <p class="pl-tag">Живите шире горизонта</p>
  </div>
  <div class="pl-foot">
    <b class="pl-pct" data-pre-pct>0%</b>
    <p class="pl-t" data-pre-text>Загружаем 3D-модель комплекса…</p>
  </div>
  <span class="pl-bar-line" aria-hidden="true"><i data-pre-bar></i></span>
</div>`;
}
