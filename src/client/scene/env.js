// Небо, свет, земля и горы Ала-Тоо на юге (в реальном направлении от объекта).
import * as THREE from 'three';
import { isMobile } from './engine.js';
import { sunDirection, sunPosition, localDate } from './sun.js';

const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = vec4(mat3(viewMatrix) * position, 1.0); // небо «приклеено» к камере
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // всегда на дальней плоскости
}`;
const SKY_FS = /* glsl */`
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunCol;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  c = mix(c, uGround, smoothstep(0.0, -0.08, h));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSunCol * (pow(s, 900.0) * 1.6 + pow(s, 24.0) * 0.22 + pow(s, 4.0) * 0.08 * (1.0 - clamp(h * 3.0, 0.0, 1.0)));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Палитры по высоте солнца
const PAL = {
  night: { zenith: '#070d18', horizon: '#1d2a40', ground: '#151a22', sun: '#1c2740', hemiSky: '#3b5478', hemiGround: '#151820', hemi: 0.42, light: 0 },
  golden: { zenith: '#4a6c9e', horizon: '#efc79b', ground: '#7d7464', sun: '#ffae63', hemiSky: '#c9d3e2', hemiGround: '#7a6a55', hemi: 0.75, light: 2.1 },
  day: { zenith: '#3b6db3', horizon: '#d3e1ee', ground: '#8f8c7c', sun: '#fff3e2', hemiSky: '#d6e4f5', hemiGround: '#857a66', hemi: 0.95, light: 2.6 },
};
const C = (h) => new THREE.Color(h);
function mixPal(el) {
  const a = el < 4 ? PAL.night : PAL.golden;
  const b = el < 4 ? PAL.golden : PAL.day;
  const k = el < 4 ? THREE.MathUtils.smoothstep(el, -5, 4) : THREE.MathUtils.smoothstep(el, 4, 24);
  const out = {};
  for (const key of Object.keys(a)) {
    out[key] = typeof a[key] === 'number' ? a[key] + (b[key] - a[key]) * k : C(a[key]).lerp(C(b[key]), k);
  }
  return out;
}

// детерминированный шум
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  const xf = x - xi; const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi); const b = hash(xi + 1, yi); const c = hash(xi, yi + 1); const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function ridged(x, y) {
  let f = 0; let amp = 0.55; let fr = 1;
  for (let i = 0; i < 5; i++) {
    const n = 1 - Math.abs(vnoise(x * fr, y * fr) * 2 - 1);
    f += n * n * amp;
    amp *= 0.5;
    fr *= 2.03;
  }
  return f;
}

function mountains() {
  const W = 90000; const D = 16000;
  const geo = new THREE.PlaneGeometry(W, D, isMobile ? 220 : 360, isMobile ? 40 : 64);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const rock = C('#66778b'); const rock2 = C('#56657a'); const foot = C('#8b8a6c'); const snow = C('#f4f7fa');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + D / 2; // 0 — северный край хребта, D — южный
    const env = THREE.MathUtils.smoothstep(z, 0, D * 0.55);
    const big = 0.65 + 0.35 * vnoise(x / 9000 + 3.1, 1.7);
    let h = ridged(x / 6400, z / 6400) * 4500 * env * big;
    h += vnoise(x / 1400, z / 1400) * 160 * env;
    pos.setY(i, h);
    const sn = THREE.MathUtils.smoothstep(h + vnoise(x / 700, z / 700) * 500, 2150, 2600);
    tmp.copy(foot).lerp(rock, THREE.MathUtils.smoothstep(h, 120, 900)).lerp(rock2, hash(x, z) * 0.35).lerp(snow, sn);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.position.set(0, -2, 21000 + D / 2); // хребет: ~21–37 км к югу от объекта
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.name = 'mountains';
  return mesh;
}

// Время суток: реальное положение солнца для 21 июня в Бишкеке (UTC+6)
export const TOD = {
  day: { label: 'День', month: 5, hours: 10.5 },
  evening: { label: 'Вечер', month: 5, hours: 19.9 },
  night: { label: 'Ночь', month: 5, hours: 23.5 },
};
// 0 — день, 1 — ночь (окна, фонари, звёзды)
export const nightFactor = (el) => 1 - THREE.MathUtils.smoothstep(el, -8, 10);

const STAR_VS = /* glsl */`
attribute float aSize;
uniform float uOpacity;
varying float vA;
void main() {
  vec4 p = vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
  gl_PointSize = aSize;
  vA = uOpacity * clamp(normalize(position).y * 6.0, 0.0, 1.0);
}`;
const STAR_FS = /* glsl */`
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.92), vA * smoothstep(0.5, 0.1, d));
}`;

export function createEnvironment(engine, geo) {
  const { scene, renderer } = engine;

  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: C(PAL.day.zenith) }, uHorizon: { value: C(PAL.day.horizon) }, uGround: { value: C(PAL.day.ground) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: C(PAL.day.sun) },
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // звёзды (видны ночью)
  {
    const N = 1600; const pos = new Float32Array(N * 3); const size = new Float32Array(N);
    let seed = 7;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < N; i++) {
      const u = r() * Math.PI * 2; const v = Math.acos(1 - r() * 0.95);
      pos.set([Math.sin(v) * Math.cos(u) * 900, Math.cos(v) * 900, Math.sin(v) * Math.sin(u) * 900], i * 3);
      size[i] = 1 + r() * r() * 2.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    var starMat = new THREE.ShaderMaterial({ vertexShader: STAR_VS, fragmentShader: STAR_FS, uniforms: { uOpacity: { value: 0 } }, transparent: true, depthWrite: false, fog: false });
    const stars = new THREE.Points(g, starMat);
    stars.frustumCulled = false;
    stars.renderOrder = -9;
    scene.add(stars);
  }

  scene.fog = new THREE.Fog(C(PAL.day.horizon), 2600, 52000);

  const hemi = new THREE.HemisphereLight(C(PAL.day.hemiSky), C(PAL.day.hemiGround), 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(C(PAL.day.sun), 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.35;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60000, 64).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: C('#9da383') }),
  );
  ground.receiveShadow = true;
  ground.position.y = -0.02;
  ground.name = 'ground';
  scene.add(ground);

  scene.add(mountains());

  // Отражения в стекле — из того же неба. Для дня/вечера/ночи считаются заранее.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
  const envCache = new Map();
  let customRT = null;
  let envTimer = 0;
  const buildEnv = () => pmrem.fromScene(envScene, 0.02, 0.1, 1000);

  // Рамка теней: куда смотрим — там и чёткие тени
  const focus = new THREE.Vector3();
  let radius = 120;
  const dir = new THREE.Vector3(0, 1, 0);
  const MOON = sunDirection({ azimuth: 152, elevation: 38 });
  function placeSun() {
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(dir, 900);
    const cam = sun.shadow.camera;
    cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
    cam.near = Math.max(1, 900 - radius * 3); cam.far = 900 + radius * 3;
    cam.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
    engine.updateShadows();
  }

  const state = { azimuth: 105, elevation: 52, night: 0 };
  function applySky(pos) {
    const el = pos.elevation;
    const p = mixPal(el);
    const moon = el < -1;
    const d = moon ? MOON : sunDirection(pos);
    dir.set(d[0], d[1], d[2]).normalize();
    skyMat.uniforms.uZenith.value.copy(p.zenith);
    skyMat.uniforms.uHorizon.value.copy(p.horizon);
    skyMat.uniforms.uGround.value.copy(p.ground);
    skyMat.uniforms.uSunCol.value.copy(p.sun);
    skyMat.uniforms.uSunDir.value.copy(dir);
    return { p, moon, el };
  }
  // pos — {azimuth, elevation}; envKey — готовые отражения ('day'|'evening'|'night'),
  // 'keep' — не трогать (во время плавной смены), иначе — пересчёт с задержкой
  function setSun(pos, envKey) {
    state.azimuth = pos.azimuth; state.elevation = pos.elevation;
    const { p, moon, el } = applySky(pos);
    state.night = nightFactor(el);
    starMat.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(state.night, 0.55, 1);
    scene.fog.color.copy(p.horizon);
    hemi.color.copy(p.hemiSky);
    hemi.groundColor.copy(p.hemiGround);
    hemi.intensity = p.hemi;
    if (moon) {
      sun.color.set('#a9bcff');
      sun.intensity = 0.55 * THREE.MathUtils.smoothstep(-el, 1, 7);
    } else {
      sun.color.copy(p.sun);
      sun.intensity = p.light * THREE.MathUtils.smoothstep(el, -1, 6);
    }
    // castShadow не переключаем: смена числа теневых источников перекомпилирует все шейдеры
    renderer.toneMappingExposure = 1.12 + 0.28 * state.night;
    placeSun();
    if (envKey === 'keep') return;
    clearTimeout(envTimer);
    if (envKey && envCache.has(envKey)) { scene.environment = envCache.get(envKey).texture; engine.invalidate(); return; }
    envTimer = setTimeout(() => {
      const prev = customRT;
      customRT = buildEnv();
      scene.environment = customRT.texture;
      prev?.dispose();
      engine.invalidate();
    }, 80);
  }

  const todPos = (key) => sunPosition(localDate(TOD[key].month, 21, TOD[key].hours), geo.lat, geo.lng);

  return {
    sun, hemi, ground,
    setSun, todPos,
    get sunState() { return { ...state }; },
    get night() { return state.night; },
    setShadowFocus(v, r) { focus.copy(v); radius = r; placeSun(); },
    setShadowSize(size) {
      if (sun.shadow.mapSize.x === size) return;
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      engine.updateShadows();
    },
    // предрасчёт отражений для дня/вечера/ночи (на этапе загрузки)
    prepareEnv() {
      for (const key of Object.keys(TOD)) {
        applySky(todPos(key));
        envCache.set(key, buildEnv());
      }
      applySky(state);
    },
  };
}
