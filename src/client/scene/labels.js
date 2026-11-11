// HTML-подписи, привязанные к точкам сцены (улицы, блоки, «горы — юг» и т. п.).
import * as THREE from 'three';

export function createLabels(engine, layer) {
  const items = [];
  const v = new THREE.Vector3();
  let active = new Set();
  let lastKey = '';

  function add(text, pos, { group = 'default', cls = '' } = {}) {
    const el = document.createElement('div');
    el.className = `lbl off ${cls}`;
    el.textContent = text;
    layer.appendChild(el);
    const it = { el, pos: pos.clone(), group, on: false };
    items.push(it);
    lastKey = '';
    return it;
  }
  function remove(group) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].group === group) { items[i].el.remove(); items.splice(i, 1); }
    }
  }
  function show(groups) {
    active = new Set(groups);
    lastKey = '';
    engine.invalidate();
  }

  engine.onLate(() => {
    const cam = engine.camera;
    const { width, height } = engine.size;
    const key = `${cam.position.x.toFixed(2)},${cam.position.y.toFixed(2)},${cam.position.z.toFixed(2)},${cam.quaternion.x.toFixed(4)},${cam.quaternion.y.toFixed(4)},${width},${height},${cam.view ? `${cam.view.offsetX}:${cam.view.offsetY}` : 0},${cam.fov.toFixed(1)},${items.length},${active.size}`;
    if (key === lastKey) return false;
    lastKey = key;
    cam.updateMatrixWorld();
    for (const it of items) {
      const want = active.has(it.group);
      if (!want) { if (it.on) { it.el.classList.add('off'); it.on = false; } continue; }
      v.copy(it.pos).project(cam);
      const visible = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      if (visible !== it.on) { it.el.classList.toggle('off', !visible); it.on = visible; }
      if (visible) it.el.style.transform = `translate(${((v.x + 1) / 2) * width}px, ${((1 - v.y) / 2) * height}px) translate(-50%, -100%)`;
    }
  });

  return { add, remove, show };
}
