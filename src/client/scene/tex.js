// Процедурные текстуры (рисуются на canvas при загрузке — ничего не скачивается).
// Каждая текстура бесшовная и привязана к реальному размеру в метрах.
import * as THREE from 'three';

let ANISO = 4;
export const setAnisotropy = (a) => { ANISO = a; };

// бесшовный шум значений с периодом
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, per, s) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  const xf = x - xi; const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
  const w = (a) => ((a % per) + per) % per;
  const a = hash(w(xi), w(yi), s); const b = hash(w(xi + 1), w(yi), s);
  const c = hash(w(xi), w(yi + 1), s); const d = hash(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, per, oct = 4, s = 1) {
  let f = 0; let amp = 0.5; let fr = 1; let n = 0;
  for (let i = 0; i < oct; i++) { f += vnoise(x * fr, y * fr, per * fr, s + i * 17) * amp; n += amp; amp *= 0.5; fr *= 2; }
  return f / n;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// fn(u, v) → [r, g, b] 0..255 (или [r, g, b, a])
function paint(w, h, fn) {
  const c = canvas(w, h); const g = c.getContext('2d');
  const im = g.createImageData(w, h); const d = im.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = fn(x / w, y / h, x, y); const i = (y * w + x) * 4;
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = p[3] ?? 255;
    }
  }
  g.putImageData(im, 0, 0);
  return c;
}
function texture(c, mx, my, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / mx, 1 / my); // UV в метрах → плитка mx × my метров
  t.anisotropy = ANISO;
  return t;
}
const mix = (a, b, k) => a + (b - a) * k;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Облицовка: камень или панели с швами. tile — размер плиты в метрах.
export function panels({ color, tw = 1.2, th = 3.3, cols = 2, rows = 1, vein = 0, mottle = 0.05, seam = 0.82, seed = 1, res = 256 }) {
  const base = hex(color);
  const W = res * cols; const H = Math.round(res * (th / tw)) * rows;
  const c = paint(W, H, (u, v, x, y) => {
    const m = fbm(u * 6 * cols, v * 6 * rows * (th / tw), 6 * cols, 4, seed) - 0.5;
    const big = fbm(u * 2 * cols, v * 2 * rows, 2 * cols, 2, seed + 9) - 0.5;
    let k = 1 + m * mottle * 2 + big * mottle;
    if (vein) {
      const r = Math.abs(fbm(u * 1.5 * cols + big * 1.5, v * 1.5 * rows * (th / tw), 3 * cols, 3, seed + 31) - 0.5);
      k -= vein * Math.max(0, 1 - r * 40);
    }
    // плита у каждой панели чуть своего оттенка
    const pi = Math.floor(u * cols) + Math.floor(v * rows) * 7;
    k += (hash(pi, seed, 5) - 0.5) * mottle * 0.8;
    const px = (x % res); const py = (y % (H / rows));
    if (px < 1.2 || py < 1.2) k *= seam;
    return shade(base, k);
  });
  return texture(c, tw * cols, th * rows);
}

// Перфорированная панель: ряды отверстий
export function perforated({ color, hole = 0.35, size = 0.08, seed = 3 }) {
  const base = hex(color); const R = 32;
  const c = paint(R, R, (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5);
    const k = d < hole ? 0.35 : 1 - 0.06 * hash(Math.floor(u * R), Math.floor(v * R), seed);
    return shade(base, k);
  });
  return texture(c, size, size);
}

export function asphalt() {
  const c = paint(512, 512, (u, v, x, y) => {
    const g = fbm(u * 64, v * 64, 64, 3, 7); const big = fbm(u * 5, v * 5, 5, 3, 11);
    const sp = hash(x, y, 3) > 0.985 ? 30 : 0;
    const k = 74 + (g - 0.5) * 24 + (big - 0.5) * 20 + sp;
    return [k + 2, k + 1, k];
  });
  return texture(c, 7, 7);
}

// Плитка мощения: серые «доски» вразбежку
export function pavers() {
  const cols = ['#99968f', '#87847e', '#a9a69f', '#7a7772', '#9e9b94'].map(hex);
  const c = paint(512, 512, (u, v) => {
    const row = Math.floor(v * 16); const off = hash(row, 1, 2);
    const cx = u * 5 + off; const col = Math.floor(cx);
    const fx = cx - col; const fy = v * 16 - row;
    const base = cols[Math.floor(hash(col % 5, row, 9) * cols.length)];
    const edge = fx < 0.012 || fy < 0.07 ? 0.72 : 1;
    const n = 1 + (fbm(u * 40, v * 40, 40, 2, 5) - 0.5) * 0.12;
    return shade(base, edge * n);
  });
  return texture(c, 4, 4);
}

export function grass() {
  const a = hex('#5f7a3c'); const b = hex('#7d8c4a'); const d = hex('#8a8255');
  const c = paint(512, 512, (u, v, x, y) => {
    const n = fbm(u * 8, v * 8, 8, 4, 2); const f = fbm(u * 96, v * 96, 96, 2, 8);
    const dry = Math.max(0, fbm(u * 3, v * 3, 3, 3, 21) - 0.55) * 2.2;
    const k = 0.78 + f * 0.44;
    const col = [mix(mix(a[0], b[0], n), d[0], dry), mix(mix(a[1], b[1], n), d[1], dry), mix(mix(a[2], b[2], n), d[2], dry)];
    void x; void y;
    return shade(col, k);
  });
  return texture(c, 18, 18);
}

export function hedge() {
  const a = hex('#35562a'); const b = hex('#5c8238');
  const c = paint(256, 256, (u, v) => {
    const n = fbm(u * 64, v * 64, 64, 3, 4);
    const k = 0.62 + n * 0.62;
    return [mix(a[0], b[0], n) * k, mix(a[1], b[1], n) * k, mix(a[2], b[2], n) * k];
  });
  return texture(c, 1.6, 1.6);
}

export function wood(color = '#8a6a4c') {
  const base = hex(color);
  const c = paint(256, 256, (u, v) => {
    const plank = Math.floor(u * 8);
    const g = fbm(u * 8 + hash(plank, 1, 1) * 9, v * 60, 60, 3, 6);
    const k = 0.8 + g * 0.38 + (hash(plank, 3, 2) - 0.5) * 0.16;
    return shade(base, (u * 8 - plank) < 0.04 ? k * 0.6 : k);
  });
  return texture(c, 1.2, 1.2);
}

// Листва: «карточки» с пучками листьев на прозрачном фоне
export function leaves({ dark = '#2f5a25', light = '#7fae4a', needles = false, seed = 5 }) {
  const S = 256; const c = canvas(S, S); const g = c.getContext('2d');
  const a = hex(dark); const b = hex(light);
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const n = needles ? 900 : 260;
  for (let i = 0; i < n; i++) {
    // гуще к центру, прозрачные края — карточка не читается квадратом
    const ang = r() * 6.283; const rad = Math.pow(r(), 0.7) * S * 0.47;
    const x = S / 2 + Math.cos(ang) * rad; const y = S / 2 + Math.sin(ang) * rad;
    const k = r(); const lit = 0.55 + 0.45 * (1 - y / S) * (0.6 + 0.4 * r());
    g.fillStyle = `rgb(${mix(a[0], b[0], k) * lit | 0},${mix(a[1], b[1], k) * lit | 0},${mix(a[2], b[2], k) * lit | 0})`;
    g.save(); g.translate(x, y); g.rotate(r() * 6.283);
    g.beginPath();
    if (needles) g.ellipse(0, 0, 1.3, 9 + r() * 7, 0, 0, 6.283); else g.ellipse(0, 0, 5 + r() * 5, 9 + r() * 8, 0, 0, 6.283);
    g.fill(); g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

// Фасад соседней многоэтажки: окна по сетке (этаж 3 м, шаг 3,2 м); night — карта свечения
export function towerFacade(night = false, seed = 11) {
  const W = 256; const H = 256; const c = canvas(W, H); const g = c.getContext('2d');
  g.fillStyle = night ? '#000' : '#d9d3c7'; g.fillRect(0, 0, W, H);
  for (let fy = 0; fy < 4; fy++) {
    for (let fx = 0; fx < 4; fx++) {
      const k = hash(fx, fy, seed);
      if (night) {
        if (k > 0.42) continue;
        g.fillStyle = k < 0.2 ? '#ffd9a0' : '#ffe9c8'; g.globalAlpha = 0.5 + k * 1.2;
      } else {
        g.fillStyle = k > 0.5 ? '#5d6f80' : '#6f8194'; g.globalAlpha = 1;
      }
      g.fillRect(fx * 64 + 14, fy * 64 + 16, 36, 30);
      if (!night) { g.fillStyle = '#c9c2b4'; g.fillRect(fx * 64, fy * 64 + 58, 64, 3); }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 12.8, 1 / 12);
  t.anisotropy = ANISO;
  return t;
}

// Вывеска: светлые буквы на прозрачном фоне
export function signText(text, { font = '600 96px Montserrat, Arial, sans-serif', color = '#fff4dc', pad = 24 } = {}) {
  const probe = canvas(8, 8).getContext('2d');
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + pad * 2;
  const h = 150;
  const c = canvas(w, h); const g = c.getContext('2d');
  g.font = font; g.fillStyle = color; g.textBaseline = 'middle';
  g.fillText(text, pad, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return { texture: t, aspect: w / h };
}

// Мягкое световое пятно
export function glow() {
  const c = canvas(128, 128); const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
