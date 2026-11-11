// Камера: OrbitControls + плавные перелёты по дуге между ракурсами.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { tween, ease, reducedMotion } from './engine.js';

export function createRig(engine) {
  const { camera, renderer } = engine;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.enablePan = false;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.autoRotateSpeed = 0.35;
  controls.addEventListener('change', () => engine.invalidate());

  let flying = false;
  let userTouched = false;
  controls.addEventListener('start', () => {
    userTouched = true;
    controls.autoRotate = false;
  });
  engine.onFrame(() => (flying ? false : controls.update() || controls.autoRotate));

  let flight = 0;
  async function flyTo(pos, target, { duration = 1.6, arc = 0.25, easing = ease.inOut } = {}) {
    const id = ++flight;
    flying = true;
    controls.enabled = false;
    const p0 = camera.position.clone();
    const t0 = controls.target.clone();
    const p1 = new THREE.Vector3(...pos);
    const t1 = new THREE.Vector3(...target);
    const dist = p0.distanceTo(p1);
    const mid = p0.clone().lerp(p1, 0.5);
    mid.y += dist * arc;
    // если пролетаем сквозь объект — поднимаемся выше
    const d = reducedMotion ? 0 : Math.min(2.6, Math.max(0.6, duration * (0.6 + Math.min(1, dist / 400) * 0.6)));
    const p = new THREE.Vector3();
    await tween(engine, {
      duration: d, easing,
      onUpdate: (k) => {
        if (id !== flight) return;
        const a = (1 - k) * (1 - k); const b = 2 * (1 - k) * k; const c = k * k;
        p.set(a * p0.x + b * mid.x + c * p1.x, a * p0.y + b * mid.y + c * p1.y, a * p0.z + b * mid.z + c * p1.z);
        camera.position.copy(p);
        controls.target.lerpVectors(t0, t1, k);
        camera.lookAt(controls.target);
      },
    });
    if (id === flight) {
      flying = false;
      controls.enabled = true;
      controls.update();
    }
    return id === flight;
  }

  function setLimits({ minDistance = 20, maxDistance = 900, minPolar = 0.15, maxPolar = 1.45, pan = false, autoRotate = false } = {}) {
    controls.minDistance = minDistance;
    controls.maxDistance = maxDistance;
    controls.minPolarAngle = minPolar;
    controls.maxPolarAngle = maxPolar;
    controls.enablePan = pan;
    controls.autoRotate = autoRotate && !userTouched && !reducedMotion;
  }

  return { controls, flyTo, setLimits, get flying() { return flying; }, resetTouched() { userTouched = false; } };
}
