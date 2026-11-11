// Полноэкранный предзагрузчик с анимированным логотипом RADIAN GROUP.
// Логотип берётся из public/assets/brand/logo-h-white.svg и раскладывается
// на детали для анимации (по мотивам LoadingOverlay из проекта avangard):
//   • 4 колонны знака «вырастают» снизу вверх — слоями цвета, как строящиеся башни;
//   • дуга-горизонт прорисовывается слева направо;
//   • знак отъезжает влево, надпись RADIAN GROUP проявляется по буквам;
//   • раскрывается линия горизонта и слоган; пока идёт загрузка — по знаку бежит блик.
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
    if (host) host.d += s.d; else out.push({ d: s.d, b: { ...s.b } });
  }
  return out.sort((a, b) => a.b.x0 - b.b.x0);
}

let cache = null;
export function loaderLogo() {
  if (cache) return cache;
  const svg = readFileSync(SRC, 'utf8');
  const view = svg.match(/viewBox="([^"]+)"/)[1];
  const groups = [...svg.matchAll(/<g transform="([^"]+)">([\s\S]*?)<\/g>/g)];
  const paths = (s) => [...s.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  // группа 1 — знак (дуга + 4 колонны), группа 2 (соседняя) — надпись
  const [markT, markInner] = [groups[0][1], groups[0][2]];
  const mark = paths(markInner);
  const wordG = svg.match(/<g transform="(translate\([^)]+\) scale\([^)]+\))">\s*(<path[\s\S]*?)<\/g>/);
  const word = letters(paths(wordG[2])[0]);
  const [swoosh, ...bars] = mark;
  const COLORS = ['#E6CB96', '#A8834B', '#D2AB67']; // светлое золото → бронза → золото
  // колонны «строятся» слева направо
  const order = bars.map((d) => bbox(d).x0).map((x, _, all) => [...all].sort((a, b) => a - b).indexOf(x));
  const barEls = bars.map((d, i) => COLORS.map((c, k) => `<path d="${d}" fill="${c}" class="pl-bar" style="--i:${order[i]};--k:${k}"/>`).join('')).join('');
  const letterEls = word.map((l, i) => `<path d="${l.d}" class="pl-l" style="--i:${i}"/>`).join('');
  cache = `<svg class="pl-logo" viewBox="${view}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
<defs>
  <clipPath id="pl-clip"><g transform="${markT}">${mark.map((d) => `<path d="${d}"/>`).join('')}</g></clipPath>
  <linearGradient id="pl-shine" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<g class="pl-mark">
  <g transform="${markT}">
    <path d="${swoosh}" fill="#D2AB67" class="pl-swoosh"/>
    ${barEls}
  </g>
</g>
<g clip-path="url(#pl-clip)"><rect class="pl-shine" x="-260" y="-20" width="220" height="460" fill="url(#pl-shine)"/></g>
<g transform="${wordG[1]}" fill="#F7F3EB" class="pl-word">${letterEls}</g>
</svg>`;
  return cache;
}

export function loaderMarkup() {
  return `<div class="pl" id="pl" data-pl role="status" aria-live="polite" aria-label="Загрузка 3D-модели">
  <div class="pl-c">
    ${loaderLogo()}
    <i class="pl-horizon" aria-hidden="true"></i>
    <p class="pl-tag">Живите шире горизонта</p>
  </div>
  <div class="pl-foot">
    <b class="pl-pct" data-pre-pct>0%</b>
    <p class="pl-t" data-pre-text>Загружаем 3D-модель комплекса…</p>
  </div>
  <span class="pl-bar-line" aria-hidden="true"><i data-pre-bar></i></span>
</div>`;
}
