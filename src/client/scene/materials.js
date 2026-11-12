// Материалы комплекса. Главный приём реализма — «комнаты за стеклом»
// (interior mapping): в шейдере стекла луч взгляда трассируется внутрь
// воображаемой комнаты, поэтому в каждом окне видны стены, потолок, шторы,
// а ночью — свет. Геометрии комнат нет, это стоит как одна текстура.
import * as THREE from 'three';
import * as T from './tex.js';

const C = (h) => new THREE.Color(h);

const ROOM_PARS = /* glsl */`
uniform float uNight; uniform float uDay; uniform float uDepth; uniform float uLit; uniform float uShop;
varying vec2 vGUv; varying vec3 vRoom; varying vec3 vWPos; varying vec3 vWNor; varying float vHand;
float rh(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
vec3 roomColor(vec2 uv, vec3 room, vec3 wpos, vec3 wnor, float hand) {
  vec3 V = normalize(wpos - cameraPosition);
  vec3 N = normalize(wnor);
  vec3 Tn = normalize(cross(vec3(0.0, 1.0, 0.0), N)) * hand;
  vec3 d = vec3(dot(V, Tn), V.y, -dot(V, N));
  d.z = max(d.z, 0.03);
  float w = room.y; float h = room.z; float D = uDepth;
  vec3 p = vec3((uv.x - 0.5) * w, (uv.y - 0.5) * h, 0.0);
  vec3 inv = 1.0 / d;
  float tx = (sign(d.x) * w * 0.5 - p.x) * inv.x;
  float ty = (sign(d.y) * h * 0.5 - p.y) * inv.y;
  float tz = D * inv.z;
  float t = min(tz, min(tx, ty));
  vec3 hit = p + d * t;
  float s = room.x;
  vec3 wall = mix(vec3(0.86, 0.82, 0.76), vec3(0.70, 0.74, 0.78), rh(s));
  wall = mix(wall, vec3(0.80, 0.70, 0.58), step(0.8, rh(s + 4.0)));
  vec3 col;
  if (t == tz) {
    col = wall * 0.92;
    // дверь или шкаф на дальней стене
    float fx = hit.x / w + 0.5; float fy = hit.y / h + 0.5;
    float door = step(0.18 + 0.4 * rh(s + 5.0), fx) * step(fx, 0.42 + 0.4 * rh(s + 5.0)) * step(fy, 0.72);
    col = mix(col, vec3(0.36, 0.27, 0.20), door * 0.8);
  } else if (t == tx) {
    col = wall * 0.74;
  } else {
    col = hit.y > 0.0 ? vec3(0.93, 0.92, 0.90) : mix(vec3(0.42, 0.32, 0.24), vec3(0.55, 0.52, 0.48), step(0.5, rh(s + 6.0)));
  }
  float fall = exp(-hit.z * (0.9 / D) * 2.2);
  // шторы у окна
  float cw = 0.12 + 0.2 * rh(s + 1.0);
  float side = step(0.5, rh(s + 7.0));
  float cu = mix(uv.x, 1.0 - uv.x, side);
  float curtain = step(cu, cw) * (1.0 - uShop) * step(0.25, rh(s + 8.0));
  vec3 fabric = mix(vec3(0.90, 0.87, 0.80), vec3(0.72, 0.70, 0.72), rh(s + 9.0)) * (0.82 + 0.18 * sin(uv.x * w * 34.0));
  // свет
  float lit = max(step(rh(s + 2.0), uLit), uShop);
  vec3 lamp = mix(vec3(1.0, 0.76, 0.48), vec3(1.0, 0.90, 0.74), rh(s + 3.0));
  vec3 day = col * (0.07 + 0.3 * fall) * uDay * (1.0 + uShop * 1.2);
  vec3 night = col * lamp * lit * (0.18 + 0.75 * fall) * (0.45 + 0.9 * rh(s + 11.0)) * uNight * (1.0 + uShop * 0.9);
  vec3 c = day + night;
  vec3 cf = fabric * (0.26 * uDay + lamp * lit * uNight * 0.5);
  return mix(c, cf, curtain);
}`;

function glass(shared, { depth = 4.5, lit = 0.55, shop = 0, clip }) {
  const m = new THREE.MeshStandardMaterial({ color: C('#56606b'), metalness: 1, roughness: 0.03, envMapIntensity: 1.15, ...clip });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, { uDepth: { value: depth }, uLit: { value: lit }, uShop: { value: shop } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRoom;\nvarying vec2 vGUv; varying vec3 vRoom; varying vec3 vWPos; varying vec3 vWNor; varying float vHand;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vGUv = uv; vRoom = aRoom;
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vWNor = normalize(mat3(modelMatrix) * objectNormal);
  vHand = sign(determinant(mat3(modelMatrix)));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${ROOM_PARS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    vec3 Vg = normalize(vWPos - cameraPosition);
    float fr = pow(1.0 - abs(dot(Vg, normalize(vWNor))), 3.0);
    totalEmissiveRadiance += roomColor(vGUv, vRoom, vWPos, vWNor, vHand) * (0.82 - 0.7 * fr);
  }`);
  };
  m.customProgramCacheKey = () => `room-${shop}`;
  return m;
}

export function createMaterials(shared, cut) {
  const clip = { clippingPlanes: [cut], clipShadows: true };
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, envMapIntensity: 0.55, ...clip, ...o });
  const M = {
    // белый камень с прожилками: панели 1,2 × 3,3 м
    stone: std({ map: T.panels({ color: '#d3d1cb', tw: 1.2, th: 3.3, cols: 2, vein: 0.035, mottle: 0.03, seam: 0.9, seed: 3 }), roughness: 0.62 }),
    // стилобат: тот же камень, плиты крупнее
    stoneBase: std({ map: T.panels({ color: '#cfcdc7', tw: 1.4, th: 2.1, cols: 2, rows: 2, vein: 0.045, mottle: 0.035, seam: 0.88, seed: 8 }), roughness: 0.55 }),
    // коричневые фиброцементные панели
    brown: std({ map: T.panels({ color: '#7b6a63', tw: 1.5, th: 3.3, cols: 2, mottle: 0.045, seam: 0.84, seed: 5 }), roughness: 0.9 }),
    brownDark: std({ map: T.perforated({ color: '#5e4a42', size: 0.09 }), roughness: 0.8 }),
    // тёмно-серый камень стопки балконов
    slate: std({ map: T.panels({ color: '#6c6e6d', tw: 1.4, th: 3.3, cols: 2, vein: 0.12, mottle: 0.1, seam: 0.9, seed: 12 }), roughness: 0.7 }),
    perf: std({ map: T.perforated({ color: '#c3c5c4', size: 0.07 }), roughness: 0.6, metalness: 0.3 }),
    frame: std({ color: C('#23262a'), roughness: 0.45, metalness: 0.7, envMapIntensity: 0.9 }),
    spandrel: std({ color: C('#3a4047'), roughness: 0.22, metalness: 0.7, envMapIntensity: 1 }),
    slab: std({ color: C('#d9d6cf'), roughness: 0.8 }),
    roof: std({ color: C('#5d6062'), roughness: 0.95 }),
    band: std({ color: C('#9a7b6c'), roughness: 0.85 }),
    metal: std({ color: C('#b9bdc1'), roughness: 0.32, metalness: 0.9, envMapIntensity: 1.1 }),
    hedge: std({ map: T.hedge(), roughness: 1, envMapIntensity: 0.3 }),
    deck: std({ map: T.wood('#8d745e'), roughness: 0.8 }),
    door: std({ color: C('#2b2d30'), roughness: 0.5, metalness: 0.5 }),
    rail: new THREE.MeshStandardMaterial({ color: C('#cfe1e8'), roughness: 0.04, metalness: 0.85, transparent: true, opacity: 0.3, depthWrite: false, envMapIntensity: 1.3, ...clip }),
    glass: glass(shared, { depth: 4.6, lit: 0.42, clip }),
    glassShop: glass(shared, { depth: 9, lit: 1, shop: 1, clip }),
  };
  return M;
}
