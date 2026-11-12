// Сборщик геометрии: всё одного материала складывается в один буфер (мало draw calls).
// UV у коробок — в метрах («мировые»), поэтому текстуры камня и панелей
// ложатся в реальном масштабе на любую деталь.
import * as THREE from 'three';

export class Builder {
  constructor() { this.parts = new Map(); }

  part(name) {
    let p = this.parts.get(name);
    if (!p) { p = { pos: [], nor: [], uv: [], idx: [], ex: [], n: 0 }; this.parts.set(name, p); }
    return p;
  }

  // четырёхугольник: a, b, c, d — против часовой стрелки, если смотреть снаружи
  quad(name, a, b, c, d, n, uvs, ex) {
    const p = this.part(name);
    const i = p.n;
    p.pos.push(...a, ...b, ...c, ...d);
    p.nor.push(...n, ...n, ...n, ...n);
    p.uv.push(...uvs);
    if (ex) p.ex.push(...ex, ...ex, ...ex, ...ex);
    p.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    p.n += 4;
  }

  // коробка по осям; faces — какие грани строить (по умолчанию все)
  box(name, x0, x1, y0, y1, z0, z1, faces = 'xXyYzZ') {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    const q = (a, b, c, d, n, u) => this.quad(name, a, b, c, d, n, u);
    if (faces.includes('X')) q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [-z1, y0, -z0, y0, -z0, y1, -z1, y1]);
    if (faces.includes('x')) q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [z0, y0, z1, y0, z1, y1, z0, y1]);
    if (faces.includes('Z')) q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [x0, y0, x1, y0, x1, y1, x0, y1]);
    if (faces.includes('z')) q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [-x1, y0, -x0, y0, -x0, y1, -x1, y1]);
    if (faces.includes('Y')) q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0, -z1, x1, -z1, x1, -z0, x0, -z0]);
    if (faces.includes('y')) q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [x0, z0, x1, z0, x1, z1, x0, z1]);
  }

  geometry(name) {
    const p = this.parts.get(name);
    if (!p || !p.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
    if (p.ex.length) g.setAttribute('aRoom', new THREE.Float32BufferAttribute(p.ex, 3));
    g.setIndex(p.n > 65535 ? new THREE.Uint32BufferAttribute(p.idx, 1) : new THREE.Uint16BufferAttribute(p.idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  // Меши по материалам; noShadow — материалы, которые не отбрасывают тень
  meshes(materials, { noShadow = [], parent } = {}) {
    const out = {};
    for (const name of this.parts.keys()) {
      const g = this.geometry(name);
      if (!g) continue;
      if (!materials[name]) throw new Error(`Нет материала «${name}»`);
      const m = new THREE.Mesh(g, materials[name]);
      m.castShadow = !noShadow.includes(name);
      m.receiveShadow = true;
      m.name = name;
      out[name] = m;
      parent?.add(m);
    }
    return out;
  }
}

// детерминированный генератор случайных чисел
export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Лента вдоль ломаной (дорога, тротуар, разметка); UV: u — поперёк (0..1), v — вдоль, в метрах
export function ribbon(pts, w, y, off = 0) {
  const pos = []; const uv = []; const idx = []; const nor = [];
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0]; let tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = -tz; const nz = tx;
    if (i > 0) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const cx = p[0] + nx * off; const cz = p[1] + nz * off;
    pos.push(cx + nx * w / 2, y, cz + nz * w / 2, cx - nx * w / 2, y, cz - nz * w / 2);
    uv.push(0, len, w, len);
    nor.push(0, 1, 0, 0, 1, 0);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function walk(pts, step, fn, start = step) {
  let d = start;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]; const [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (!len) continue;
    const dx = (bx - ax) / len; const dz = (bz - az) / len;
    while (d <= len) { fn(ax + dx * d, az + dz * d, dx, dz); d += step; }
    d -= len;
  }
}
