// Отладочная сцена (не входит в сборку сайта): node scripts/devscene.mjs
import * as THREE from 'three';
import { createEngine } from './engine.js';
import { createSky } from './sky.js';
import { createComplex } from './complex.js';
import { buildWorld } from './world.js';
import { buildSite } from './site.js';
import { setAnisotropy } from './tex.js';

const stage = document.getElementById('stage');
const engine = createEngine(stage);
setAnisotropy(engine.renderer.capabilities.getMaxAnisotropy());
const shared = { uNight: { value: 0 }, uDay: { value: 1 } };
const sky = createSky(engine, shared);
const world = await buildWorld(engine);
const cx = createComplex(engine, shared);
engine.scene.add(cx.group);
const site = buildSite(engine, world, shared);
world.finish();
const SK = { day: { az: 215, el: 48, cover: 0.42 }, golden: { az: 283, el: 16, cover: 0.5 }, dusk: { az: 300, el: 1.5, cover: 0.45 }, night: { az: 330, el: -14, cover: 0.3 } };
sky.prepare(SK);
const sun = (k) => { sky.set(SK[k], k); world.setNight(sky.night); site.setNight(sky.night); engine.invalidate(); return k; };
sky.setShadowFocus(new THREE.Vector3(-8, 0, 18), 100);
sky.setShadowSize(4096);
engine.buildComposer();
sun('golden');
window.T = { THREE, engine, sky, cx, world, site, sun,
  cam(px, py, pz, tx, ty, tz, fov) { engine.camera.position.set(px, py, pz); engine.camera.lookAt(tx, ty, tz); if (fov) { engine.camera.fov = fov; engine.camera.updateProjectionMatrix(); } engine.invalidate(); return 'ok'; } };
window.T.cam(-105, 9, -78, -10, 27, 8, 34);
