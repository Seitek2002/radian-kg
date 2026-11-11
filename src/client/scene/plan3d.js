// 3D-планировка из иллюстрации radian.kg: пол — сама иллюстрация с прозрачным
// фоном (готовится заранее скриптом scripts/extract-walls.py → {код}-floor.webp),
// стены — извлечённые полигоны, выдавленные на высоту потолка (3 м).
// Картинка декодируется вне главного потока (ImageBitmap) — без рывков.
import * as THREE from 'three';
import WALLS from '../../data/walls.json';
import { asset } from '../base.js';

export const WALL_H = 3.0;

const bitmapLoader = new THREE.ImageBitmapLoader();
bitmapLoader.setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' });
const loadBitmap = (url) => new Promise((res, rej) => bitmapLoader.load(url, res, undefined, rej));

// Общие материалы: один раз компилируются на этапе загрузки, дальше переиспользуются
export function planMaterials() {
  return {
    floor: new THREE.MeshStandardMaterial({ emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.3, roughness: 0.95, envMapIntensity: 0.2, alphaTest: 0.5, transparent: true }),
    cap: new THREE.MeshStandardMaterial({ color: '#23262C', roughness: 0.8, transparent: true }),
    side: new THREE.MeshStandardMaterial({ color: '#F4F0E9', roughness: 0.9, envMapIntensity: 0.4, transparent: true }),
  };
}

export async function buildPlan(code, renderer) {
  const W = WALLS[code];
  if (!W) throw new Error(`Нет стен для ${code}`);
  const bitmap = await loadBitmap(asset(`assets/plans/${code}-floor.webp`));
  const s = W.mPerPx;
  const cx = (W.bbox[0] + W.bbox[2]) / 2;
  const cy = (W.bbox[1] + W.bbox[3]) / 2;

  const group = new THREE.Group();
  group.name = `plan-${code}`;

  const tex = new THREE.Texture(bitmap);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.flipY = false; // уже перевёрнуто при декодировании
  tex.needsUpdate = true;
  const M = planMaterials();
  M.floor.map = tex;
  M.floor.emissiveMap = tex;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W.w * s, W.h * s).rotateX(-Math.PI / 2), M.floor);
  floor.position.set((W.w / 2 - cx) * s, 0.03, (W.h / 2 - cy) * s);
  floor.receiveShadow = true;
  group.add(floor);

  const wallsGroup = new THREE.Group();
  wallsGroup.scale.y = 0.001;
  group.add(wallsGroup);
  const toV = ([x, y]) => new THREE.Vector2((x - cx) * s, -(y - cy) * s);
  for (const poly of W.polys) {
    const shape = new THREE.Shape(poly[0].map(toV));
    for (const hole of poly.slice(1)) shape.holes.push(new THREE.Path(hole.map(toV)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_H, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, [M.cap, M.side]);
    m.castShadow = true;
    m.receiveShadow = true;
    wallsGroup.add(m);
  }

  const size = { w: (W.bbox[2] - W.bbox[0]) * s, d: (W.bbox[3] - W.bbox[1]) * s };
  let wallH = 1;
  const mats = [M.floor, M.cap, M.side];

  return {
    group, size, code,
    // загрузить текстуру в видеопамять заранее, до анимации
    upload() { renderer.initTexture(tex); },
    setWalls(k) { wallsGroup.scale.y = Math.max(0.001, k * wallH); },
    setWallHeight(h) { wallH = h / WALL_H; },
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const m of mats) m.dispose();
      tex.dispose();
      bitmap.close?.();
    },
  };
}
