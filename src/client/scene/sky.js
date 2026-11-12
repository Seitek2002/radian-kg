// Небо с облаками, солнце/луна, свет и хребет Ала-Тоо на юге.
// Отражения в стекле берутся из этого же неба: для каждого «кадра» сценария
// карта окружения считается заранее (при загрузке), а не во время движения.
import * as THREE from 'three';

const C = (h) => new THREE.Color(h);
const RAD = Math.PI / 180;

const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;
const SKY_FS = /* glsl */`
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform vec3 uCloudLit; uniform vec3 uCloudDark; uniform float uCover; uniform float uStars;
varying vec3 vDir;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 17.0; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSunCol * (pow(s, 1400.0) * 6.0 + pow(s, 60.0) * 0.35 + pow(s, 6.0) * 0.16);
  // слой облаков на высоте: проекция на плоскость
  if (h > 0.01) {
    vec2 uv = d.xz / (h + 0.12) * 1.1;
    float f = fbm(uv * 0.9 + vec2(3.1, 1.7));
    float m = smoothstep(1.0 - uCover, 1.0 - uCover + 0.32, f + 0.25 * fbm(uv * 3.1));
    float shade = fbm(uv * 0.9 + normalize(uSunDir).xz * 0.25 + vec2(3.1, 1.7));
    vec3 cl = mix(uCloudLit, uCloudDark, smoothstep(0.35, 0.8, shade));
    cl += uSunCol * pow(s, 8.0) * 0.5;
    c = mix(c, cl, m * smoothstep(0.01, 0.16, h) * 0.92);
    // звёзды
    vec2 sp = d.xz / (h + 0.4) * 190.0;
    float st = step(0.9965, h2(floor(sp))) * (0.4 + 0.6 * h2(floor(sp) + 3.0));
    c += vec3(1.0, 0.96, 0.9) * st * uStars * (1.0 - m);
  }
  c = mix(c, uGround, smoothstep(0.0, -0.06, h));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Палитры по высоте солнца над горизонтом
const PAL = {
  night: { zenith: '#050a14', horizon: '#18233a', ground: '#11151c', sun: '#2a3a66', cloudLit: '#1c2538', cloudDark: '#0c111c', hemiSky: '#5d78a8', hemiGround: '#1c2027', hemi: 0.75, light: 0 },
  dusk: { zenith: '#2b3f6e', horizon: '#e79f78', ground: '#5d564f', sun: '#ff9052', cloudLit: '#f2b392', cloudDark: '#56506a', hemiSky: '#9aa6c8', hemiGround: '#6a5a4c', hemi: 0.55, light: 1.0 },
  golden: { zenith: '#3f6cab', horizon: '#ecd9bf', ground: '#7f786a', sun: '#fff0dc', cloudLit: '#fff4e6', cloudDark: '#b4b6c0', hemiSky: '#c6d2e6', hemiGround: '#7f7a70', hemi: 0.6, light: 2.3 },
  day: { zenith: '#2f66b5', horizon: '#c9dcee', ground: '#8f8c7e', sun: '#fff8ee', cloudLit: '#ffffff', cloudDark: '#aab4c4', hemiSky: '#d4e3f6', hemiGround: '#8a7f6c', hemi: 0.7, light: 2.5 },
};
const ss = THREE.MathUtils.smoothstep;
function palette(el) {
  const stops = [[-8, PAL.night], [-1, PAL.dusk], [9, PAL.golden], [32, PAL.day]];
  let i = 0;
  while (i < stops.length - 2 && el > stops[i + 1][0]) i++;
  const [e0, a] = stops[i]; const [e1, b] = stops[i + 1];
  const k = ss(el, e0, e1);
  const out = {};
  for (const key of Object.keys(a)) out[key] = typeof a[key] === 'number' ? a[key] + (b[key] - a[key]) * k : C(a[key]).lerp(C(b[key]), k);
  return out;
}
// 0 — день, 1 — ночь (окна, фонари, звёзды)
export const nightFactor = (el) => 1 - ss(el, -7, 7);
// азимут от севера по часовой, высота над горизонтом → направление НА светило (x — восток, z — юг)
export const sunDir = (az, el) => new THREE.Vector3(Math.sin(az * RAD) * Math.cos(el * RAD), Math.sin(el * RAD), -Math.cos(az * RAD) * Math.cos(el * RAD));

function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x); const yi = Math.floor(y); const xf = x - xi; const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi); const b = hash(xi + 1, yi); const c = hash(xi, yi + 1); const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function ridged(x, y) {
  let f = 0; let amp = 0.55; let fr = 1;
  for (let i = 0; i < 5; i++) { const n = 1 - Math.abs(vnoise(x * fr, y * fr) * 2 - 1); f += n * n * amp; amp *= 0.5; fr *= 2.03; }
  return f;
}
function mountains(detail) {
  const W = 110000; const D = 18000;
  const geo = new THREE.PlaneGeometry(W, D, detail ? 420 : 240, detail ? 72 : 44);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const rock = C('#6b7b8e'); const rock2 = C('#5a6a7e'); const foot = C('#8a8a6e'); const snow = C('#f6f8fb'); const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const z = pos.getZ(i) + D / 2;
    const env = ss(z, 0, D * 0.55);
    const big = 0.6 + 0.4 * vnoise(x / 9000 + 3.1, 1.7);
    let h = ridged(x / 6400, z / 6400) * 4700 * env * big;
    h += vnoise(x / 1400, z / 1400) * 170 * env;
    pos.setY(i, h);
    const sn = ss(h + vnoise(x / 700, z / 700) * 520, 2100, 2650);
    tmp.copy(foot).lerp(rock, ss(h, 120, 900)).lerp(rock2, hash(x, z) * 0.35).lerp(snow, sn);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.position.set(0, -2, 20000 + D / 2); // хребет: ~20–38 км к югу от объекта
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  return mesh;
}

export function createSky(engine, shared, { detail = true } = {}) {
  const { scene, renderer } = engine;
  const U = {
    uZenith: { value: C('#000') }, uHorizon: { value: C('#000') }, uGround: { value: C('#000') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: C('#fff') },
    uCloudLit: { value: C('#fff') }, uCloudDark: { value: C('#999') }, uCover: { value: 0.5 }, uStars: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 40, 20), skyMat);
  dome.frustumCulled = false; dome.renderOrder = -10;
  scene.add(dome);
  scene.fog = new THREE.Fog(C('#c9dcee'), 2400, 60000);

  const hemi = new THREE.HemisphereLight(C('#fff'), C('#888'), 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(C('#fff'), 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.12;
  scene.add(sun, sun.target);
  scene.add(mountains(detail));

  // карты окружения — по одной на ключевое состояние неба
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
  const envs = new Map();
  let envKey = null;

  const focus = new THREE.Vector3(); let radius = 110; const dir = new THREE.Vector3(0, 1, 0);
  function placeSun(shadows = true) {
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(dir, 900);
    const c = sun.shadow.camera;
    c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
    c.near = Math.max(1, 900 - radius * 3.2); c.far = 900 + radius * 3.2;
    c.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
    if (shadows) engine.updateShadows(); else engine.invalidate();
  }

  const state = { az: 300, el: 20, cover: 0.5, night: 0, exposure: 1 };
  function applyUniforms(s) {
    const p = palette(s.el);
    const moon = s.el < -1.5;
    const d = moon ? sunDir(150, 40) : sunDir(s.az, Math.max(s.el, 1.5));
    U.uZenith.value.copy(p.zenith); U.uHorizon.value.copy(p.horizon); U.uGround.value.copy(p.ground);
    U.uSunCol.value.copy(p.sun).multiplyScalar(moon ? 0.5 : 1);
    U.uSunDir.value.copy(moon ? sunDir(150, 40) : sunDir(s.az, s.el));
    U.uCloudLit.value.copy(p.cloudLit); U.uCloudDark.value.copy(p.cloudDark);
    U.uCover.value = s.cover; U.uStars.value = ss(nightFactor(s.el), 0.6, 1);
    return { p, moon, d };
  }
  // s: { az, el, cover?, exposure? }; key — заранее посчитанная карта окружения
  // shadows: false — не пересчитывать тени в этом кадре (плавная смена времени суток)
  function set(s, key, shadows = true) {
    Object.assign(state, s);
    const { p, moon, d } = applyUniforms(state);
    state.night = nightFactor(state.el);
    dir.copy(d).normalize();
    scene.fog.color.copy(p.horizon);
    hemi.color.copy(p.hemiSky); hemi.groundColor.copy(p.hemiGround); hemi.intensity = p.hemi;
    if (moon) { sun.color.set('#9fb4ff'); sun.intensity = 0.5 * ss(-state.el, 1.5, 7); } else { sun.color.copy(p.sun); sun.intensity = p.light * ss(state.el, -1, 5); }
    renderer.toneMappingExposure = (state.exposure || 1) * (1 + 0.35 * state.night);
    shared.uNight.value = state.night; shared.uDay.value = 1 - 0.75 * state.night;
    if (key && key !== envKey && envs.has(key)) { envKey = key; scene.environment = envs.get(key).texture; }
    placeSun(shadows);
  }

  return {
    sun, hemi, set,
    get state() { return state; },
    get night() { return state.night; },
    setShadowFocus(v, r) { if (focus.distanceToSquared(v) < 1 && Math.abs(r - radius) < 1) return; focus.copy(v); radius = r; placeSun(); },
    setShadowSize(size) { if (sun.shadow.mapSize.x === size) return; sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; engine.updateShadows(); },
    // предрасчёт отражений: skies — { ключ: { az, el, cover } }
    prepare(skies) {
      for (const [k, s] of Object.entries(skies)) {
        applyUniforms({ ...state, ...s });
        envs.set(k, pmrem.fromScene(envScene, 0.015, 0.1, 1000));
      }
      applyUniforms(state);
    },
  };
}
