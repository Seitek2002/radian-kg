// Участок комплекса: парковки, проезды, закрытый двор с детской площадкой,
// беседками и садом, вывески первого этажа и интерьер офиса продаж.
// Состав — по проекту (radian.kg) и визуализациям; точное размещение условное.
import * as THREE from 'three';
import { Builder, rng } from './geo.js';
import * as T from './tex.js';
import { TENANTS, PLAN, MIRROR_X, SITE as S, LV } from '../../data/building.js';
import { asset } from '../base.js';

const C = (h) => new THREE.Color(h);
const wx = (px, mirror) => S.axisX + (mirror ? -1 : 1) * (px - MIRROR_X);
const FRONT = S.frontZ - 0.3; // плоскость порталов (z)

export function buildSite(engine, world, shared) {
  const group = new THREE.Group(); group.name = 'site'; engine.scene.add(group);
  const rnd = rng(11);
  const b = new Builder();
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, envMapIntensity: 0.4, ...o });
  const po = { polygonOffset: true, polygonOffsetFactor: -4 };
  const M = {
    pavers: std({ map: T.pavers(), ...po }), asphalt: std({ map: T.asphalt(), roughness: 0.95, ...po }),
    lawn: std({ map: T.grass(), color: C('#b4c692'), roughness: 1, ...po }), hedge: std({ map: T.hedge(), roughness: 1 }),
    line: new THREE.MeshBasicMaterial({ color: C('#e6e2d6'), polygonOffset: true, polygonOffsetFactor: -6 }),
    yellow: new THREE.MeshBasicMaterial({ color: C('#d9b23c'), polygonOffset: true, polygonOffsetFactor: -6 }),
    wood: std({ map: T.wood('#8f6c4b'), roughness: 0.8 }), woodDark: std({ map: T.wood('#5a4434'), roughness: 0.8 }),
    steel: std({ color: C('#3a3d42'), roughness: 0.5, metalness: 0.7 }), bollard: std({ color: C('#9a9da1'), roughness: 0.35, metalness: 0.9 }),
    rubberBlue: std({ color: C('#3f72b8'), roughness: 0.95, ...po }), rubberOrange: std({ color: C('#d98c4a'), roughness: 0.95, ...po }), rubberGreen: std({ color: C('#7fae4f'), roughness: 0.95, ...po }),
    sand: std({ color: C('#e3d2a8'), roughness: 1, ...po }), slide: std({ color: C('#8fb04a'), roughness: 0.5 }), roofTile: std({ color: C('#c9b44a'), roughness: 0.8 }),
    flower: std({ color: C('#a8648a'), roughness: 1 }), flower2: std({ color: C('#e8e2ee'), roughness: 1 }), cushion: std({ color: C('#d8d4cc'), roughness: 1 }),
    stone: std({ color: C('#d2d0ca'), roughness: 0.6 }), light: new THREE.MeshStandardMaterial({ color: C('#fff'), emissive: C('#ffd9a0'), emissiveIntensity: 0.4 }),
  };
  const flat = (name, x0, x1, z0, z1, y = 0.05) => b.box(name, x0, x1, y - 0.05, y, z0, z1, 'Y');
  const labels = [];
  const L = (text, x, y, z, kind) => labels.push({ text, pos: new THREE.Vector3(x, y, z), kind });

  const W0 = wx(PLAN.podium.x0); const E1 = wx(PLAN.podium.x0, true); // крайние грани стилобатов: −48,7 и +32,7
  const backA = S.frontZ + (PLAN.B.y1 - PLAN.A.bay.y0); // южный торец крыльев: z ≈ 29,7
  const backB = S.frontZ + (PLAN.B.y1 - PLAN.B.y0); // дворовый фасад башен: z ≈ 14,8
  const wingW = wx(PLAN.A.xe); const wingE = wx(PLAN.A.xe, true); // внутренние грани крыльев: −30,5 и +14,5

  // ── мощение вокруг и перед фасадом, боллары
  flat('pavers', W0 - 2.6, E1 + 2.6, -9.6, FRONT, 0.06);
  flat('pavers', W0 - 2.6, W0, FRONT, backA + 1, 0.06); flat('pavers', E1, E1 + 2.6, FRONT, backA + 1, 0.06);
  for (let x = W0 + 1; x < E1; x += 3.77) { b.box('bollard', x - 0.07, x + 0.07, 0.06, 0.95, -9.3, -9.16); }
  for (let x = W0 + 4; x < E1; x += 7.5) { b.box('light', x - 0.12, x + 0.12, 0.06, 0.42, -9.2, -8.96); world.addGlow(x, -8.6, 5); }
  // ели в партере перед фасадом
  // низкие кусты в кадках вдоль фасада (витрины остаются открытыми)
  for (let x = W0 + 5.7; x < E1; x += 7.54) if (Math.abs(x - S.axisX) > 5) { b.box('stone', x - 0.45, x + 0.45, 0.06, 0.5, -8.6, -7.7); b.box('hedge', x - 0.4, x + 0.4, 0.5, 1.15, -8.55, -7.75); }

  // ── наземные парковки: по 11 мест с запада и востока, 11 — у южного проезда (33 по проекту)
  const lot = (x0, x1, z0, n, dir) => { // места вдоль z, машины носом по оси x
    flat('asphalt', Math.min(x0, x1), Math.max(x0, x1), z0 - 0.2, z0 + n * 2.6 + 0.2, 0.05);
    for (let i = 0; i <= n; i++) flat('line', Math.min(x0, x1), Math.max(x0, x1), z0 + i * 2.6 - 0.06, z0 + i * 2.6 + 0.06, 0.07);
    for (let i = 0; i < n; i++) if (rnd() < 0.72) world.addCar((x0 + x1) / 2 + (rnd() - 0.5) * 0.3, z0 + i * 2.6 + 1.3, dir);
  };
  flat('asphalt', W0 - 16, W0 - 8.1, -9.6, 50, 0.05); flat('asphalt', E1 + 8.1, E1 + 13.2, -9.6, 50, 0.05); // проезды
  lot(W0 - 8.1, W0 - 2.6, -1.5, 11, Math.PI / 2); lot(E1 + 2.6, E1 + 8.1, -1.5, 11, -Math.PI / 2);
  flat('asphalt', W0 - 16, E1 + 13.2, 44, 50, 0.05); // южный проезд
  flat('yellow', W0 - 8, E1 + 8, 43.85, 44.0, 0.07);
  { const x0 = -40; flat('asphalt', x0 - 0.2, x0 + 11 * 2.6 + 0.2, 50, 55.6, 0.05); for (let i = 0; i <= 11; i++) flat('line', x0 + i * 2.6 - 0.06, x0 + i * 2.6 + 0.06, 50.2, 55.6, 0.07); for (let i = 0; i < 11; i++) if (rnd() < 0.65) world.addCar(x0 + i * 2.6 + 1.3, 52.9, 0); }
  L('Наземная парковка: 33 места по проекту', W0 - 5.4, 3, 13, 'pin');
  L('Въезд в подземный паркинг: 78 мест', wx(PLAN.podium.x0 + 1.9), 5.2, FRONT - 0.3, 'pin');

  // ── закрытый двор
  flat('pavers', wingW, wingE, backB, 44, 0.06); flat('pavers', W0 - 2.6, wingW, backA, 44, 0.06); flat('pavers', wingE, E1 + 2.6, backA, 44, 0.06);
  flat('pavers', S.axisX - 3, S.axisX + 3, FRONT, backB, 0.06); // проход между корпусами
  for (const x of [-2.2, -0.75, 0.75, 2.2]) b.box('bollard', S.axisX + x - 0.06, S.axisX + x + 0.06, 0.06, 0.9, FRONT + 0.6, FRONT + 0.72);
  // детская площадка (466 м² по проекту): резиновое покрытие, «замок» с горкой, песочница, качели
  const px = S.axisX; const pz = 24.5;
  flat('rubberGreen', px - 12, px + 12, backB + 1.2, 35.5, 0.08);
  flat('rubberBlue', px - 9.5, px - 0.5, 18.2, 27, 0.09); flat('rubberOrange', px + 0.5, px + 9.5, 21, 33.5, 0.09); flat('sand', px - 8.5, px - 3.2, 28.5, 33.6, 0.1);
  b.box('wood', px - 8.9, px - 2.8, 0.06, 0.3, 28.2, 28.5); b.box('wood', px - 8.9, px - 2.8, 0.06, 0.3, 33.6, 33.9); b.box('wood', px - 8.9, px - 8.6, 0.06, 0.3, 28.2, 33.9); b.box('wood', px - 3.1, px - 2.8, 0.06, 0.3, 28.2, 33.9);
  { // замок
    const x = px + 3.2; const z = pz;
    for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) b.box('woodDark', x + dx - 0.09, x + dx + 0.09, 0.06, 4.6, z + dz - 0.09, z + dz + 0.09);
    b.box('wood', x - 1.2, x + 1.2, 1.5, 1.62, z - 1.2, z + 1.2); b.box('wood', x - 1.2, x + 1.2, 1.62, 3.3, z + 1.1, z + 1.2); b.box('wood', x + 1.1, x + 1.2, 1.62, 3.3, z - 1.2, z + 1.2);
    b.box('wood', x - 1.2, x - 1.1, 1.62, 2.5, z - 1.2, z + 1.2); b.box('wood', x - 1.2, x + 1.2, 3.3, 3.42, z - 1.2, z + 1.2);
    b.box('woodDark', x - 4.0, x - 1.2, 1.0, 1.12, z - 0.6, z + 0.6); b.box('woodDark', x - 4.1, x - 4.0, 0.06, 2.0, z - 0.7, z + 0.7); // мостик
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.9, 4).rotateY(Math.PI / 4).translate(x, 4.4, z), M.roofTile); roof.castShadow = true; group.add(roof);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 4.6, 14, 1, true).rotateZ(Math.PI / 2.9).translate(x + 3.0, 1.25, z - 0.2), M.slide); tube.castShadow = true; tube.material.side = THREE.DoubleSide; group.add(tube);
    // качели
    const sx = px - 5; const sz = 20.5;
    b.box('steel', sx - 1.8, sx - 1.72, 0.06, 2.4, sz - 0.04, sz + 0.04); b.box('steel', sx + 1.72, sx + 1.8, 0.06, 2.4, sz - 0.04, sz + 0.04); b.box('steel', sx - 1.8, sx + 1.8, 2.36, 2.44, sz - 0.04, sz + 0.04);
    for (const dx of [-0.8, 0.8]) { b.box('woodDark', sx + dx - 0.25, sx + dx + 0.25, 0.55, 0.6, sz - 0.12, sz + 0.12); b.box('steel', sx + dx - 0.24, sx + dx - 0.22, 0.6, 2.36, sz - 0.01, sz + 0.01); b.box('steel', sx + dx + 0.22, sx + dx + 0.24, 0.6, 2.36, sz - 0.01, sz + 0.01); }
  }
  L('Детская площадка: 466 м² по проекту', px + 3.2, 6.4, pz, 'pin');
  // беседки: две круглые с цветами и прямоугольная с ламелями — как на визуализациях
  const round = (cx, cz) => {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; const x = cx + Math.cos(a) * 2.5; const z = cz + Math.sin(a) * 2.5; b.box('steel', x - 0.05, x + 0.05, 0.06, 2.7, z - 0.05, z + 0.05); }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.5, 20).translate(cx, 2.95, cz), M.flower); top.castShadow = true; group.add(top);
    const seat = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.36, 6, 20, Math.PI * 1.5).rotateX(Math.PI / 2).translate(cx, 0.45, cz), M.cushion); seat.castShadow = true; group.add(seat);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16).translate(cx, 0.6, cz), M.steel); group.add(table);
    flat('sand', cx - 3.3, cx + 3.3, cz - 3.3, cz + 3.3, 0.08); world.addGlow(cx, cz, 7);
  };
  round(px - 15.5, 38.4); round(px + 15.5, 38.4);
  { const x0 = px - 4.2; const x1 = px + 4.2; const z0 = 37; const z1 = 40.4;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [px, z0], [px, z1]]) b.box('steel', x - 0.06, x + 0.06, 0.06, 2.6, z - 0.06, z + 0.06);
    for (let x = x0; x <= x1 + 0.01; x += 0.28) b.box('wood', x - 0.05, x + 0.05, 2.6, 2.72, z0 - 0.3, z1 + 0.3);
    for (let y = 0.5; y < 2.5; y += 0.26) b.box('wood', x0 - 0.02, x0 + 0.04, y, y + 0.1, z0, z1);
    b.box('wood', x0 + 0.5, px - 0.5, 0.42, 0.5, z1 - 0.7, z1 - 0.2); b.box('wood', px + 0.5, x1 - 0.5, 0.42, 0.5, z1 - 0.7, z1 - 0.2);
    world.addGlow(px, 38.7, 8); }
  L('Беседки и зона отдыха', px, 4.6, 38.7, 'pin');
  // внутренний сад: газон, цветники, дорожка, скамьи, деревья (202 м² озеленения по проекту)
  flat('lawn', -8, E1 + 8, 50.4, 62, 0.06); flat('pavers', -8, E1 + 8, 55.4, 57, 0.08);
  for (let x = -5; x < E1 + 6; x += 6.2) { b.box(rnd() < 0.5 ? 'flower' : 'flower2', x, x + 2.6, 0.06, 0.4, 51.2, 52.4); b.box('hedge', x + 3, x + 5.4, 0.06, 0.7, 51.2, 52.3); if (rnd() < 0.7) { b.box('wood', x + 0.3, x + 2.1, 0.42, 0.5, 57.3, 57.8); b.box('steel', x + 0.4, x + 0.46, 0.06, 0.42, 57.3, 57.8); b.box('steel', x + 1.94, x + 2.0, 0.06, 0.42, 57.3, 57.8); } }
  for (const [x, z, k, s] of [[-2, 59.5, 0, 0.9], [8, 60, 0, 1.05], [18, 59.2, 1, 0.8], [27, 60.2, 0, 0.95], [36, 59.4, 0, 1], [3, 53.6, 1, 0.5], [22, 53.6, 1, 0.55], [-26, 17.5, 1, 0.9], [10, 17.5, 1, 0.95], [-27.5, 41, 0, 0.8], [11.5, 41.5, 0, 0.85], [W0 - 1.2, 33, 0, 0.7], [E1 + 1.2, 33, 0, 0.75]]) world.addTree(x, z, k, s);
  L('Внутренний сад: 202 м² озеленения по проекту', 16, 3.4, 56, 'pin');
  // цветники у стен во дворе и живая изгородь по границе
  for (const [x0, x1] of [[wingW + 0.6, px - 13], [px + 13, wingE - 0.6]]) { b.box('hedge', x0, x1, 0.06, 0.6, backB + 0.3, backB + 1.1); b.box('flower', x0 + 1, x0 + 4, 0.06, 0.45, backB + 1.2, backB + 1.9); }
  b.box('hedge', W0 - 16, E1 + 13.2, 0.0, 1.5, 62.2, 63.0); b.box('steel', W0 - 16.4, W0 - 16.3, 0, 1.7, -9, 63); b.box('steel', E1 + 13.5, E1 + 13.6, 0, 1.7, -9, 63);

  b.meshes(M, { parent: group, noShadow: ['pavers', 'asphalt', 'lawn', 'line', 'yellow', 'rubberBlue', 'rubberOrange', 'rubberGreen', 'sand'] });

  // ── вывески первого этажа (состав — по проекту)
  const signMat = []; const pitch = (PLAN.podium.x1 - PLAN.podium.x0) / 10;
  for (const t of TENANTS) {
    const mirror = t.block === 'east';
    const c = wx(PLAN.podium.x0 + ((t.from + t.to + 1) / 2) * pitch, mirror);
    const { texture, aspect } = T.signText(t.name);
    const h = 0.6; const w = Math.min(h * aspect, (t.to - t.from + 1) * pitch - 1.6);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, color: C('#cdbb96') });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / aspect).rotateY(Math.PI), mat);
    m.position.set(c, 3.98, FRONT + 0.42 - 0.13); m.renderOrder = 4; group.add(m); signMat.push(mat);
    L(t.name, c, 8.9, FRONT - 0.4, 'tenant');
  }

  // ════════════════ офис продаж: интерьер за двумя витринами ════════════════
  const o = new Builder();
  const OX0 = wx(PLAN.podium.x0 + 8 * pitch) + 0.05; const OX1 = wx(PLAN.B.x1) - 0.4; const OZ0 = FRONT + 0.5; const OZ1 = OZ0 + 7.6; const OH = 4.02;
  const OM = {
    floor: std({ map: T.wood('#b89a78'), roughness: 0.55, envMapIntensity: 0.6 }), wall: std({ color: C('#ece7dd'), roughness: 0.95 }), dark: std({ color: C('#1b2029'), roughness: 0.7 }),
    ceil: std({ color: C('#f4f1ea'), roughness: 1 }), oak: std({ map: T.wood('#a8845c'), roughness: 0.6 }), walnut: std({ map: T.wood('#5b4332'), roughness: 0.55 }),
    stone: std({ color: C('#dcd8cf'), roughness: 0.4 }), black: std({ color: C('#191b1f'), roughness: 0.45, metalness: 0.4 }), fabric: std({ color: C('#8a8377'), roughness: 1 }), fabric2: std({ color: C('#b7a888'), roughness: 1 }),
    paper: std({ color: C('#f7f5ef'), roughness: 0.9 }), gold: std({ color: C('#c9a25f'), roughness: 0.35, metalness: 0.85 }), white: std({ color: C('#f2f0eb'), roughness: 0.5 }),
    folderA: std({ color: C('#23364d'), roughness: 0.8 }), folderB: std({ color: C('#7a5a2c'), roughness: 0.8 }), folderC: std({ color: C('#6d2e2a'), roughness: 0.8 }),
    leaf: std({ map: T.hedge(), color: C('#9fc48a'), roughness: 1 }), pot: std({ color: C('#d9d4ca'), roughness: 0.8 }), lamp: new THREE.MeshStandardMaterial({ color: C('#fff'), emissive: C('#ffdcae'), emissiveIntensity: 2.2 }),
    screen: new THREE.MeshStandardMaterial({ color: C('#0c0d10'), emissive: C('#9db8d8'), emissiveIntensity: 0.7, roughness: 0.3 }), glass: new THREE.MeshStandardMaterial({ color: C('#dfeaf0'), roughness: 0.03, metalness: 0.9, transparent: true, opacity: 0.14, depthWrite: false }),
  };
  o.box('floor', OX0, OX1, 0.02, 0.05, OZ0, OZ1, 'Y'); o.box('ceil', OX0, OX1, OH, OH + 0.1, OZ0, OZ1, 'y');
  o.box('wall', OX0 - 0.1, OX0, 0, OH, OZ0, OZ1, 'X'); o.box('wall', OX0, OX1, 0, OH, OZ1, OZ1 + 0.1, 'z'); o.box('dark', OX1, OX1 + 0.1, 0, OH, OZ0, OZ1, 'x');
  for (const z of [OZ0 + 1.6, OZ0 + 3.8, OZ0 + 6.0]) o.box('lamp', OX0 + 0.8, OX1 - 0.8, OH - 0.03, OH - 0.01, z - 0.05, z + 0.05, 'y'); // световые линии
  // стол переговоров
  const tx = (OX0 + OX1) / 2 - 0.5; const tz = OZ0 + 3.9; const th = 0.75;
  o.box('walnut', tx - 1.35, tx + 1.35, th - 0.05, th, tz - 0.6, tz + 0.6); o.box('black', tx - 1.1, tx - 1.0, 0.05, th - 0.05, tz - 0.4, tz + 0.4); o.box('black', tx + 1.0, tx + 1.1, 0.05, th - 0.05, tz - 0.4, tz + 0.4);
  const chair = (x, z, rot) => { const g = new Builder(); g.box('fabric', -0.25, 0.25, 0.42, 0.5, -0.25, 0.25); g.box('fabric', -0.25, 0.25, 0.5, 0.95, 0.2, 0.26); for (const [a, c2] of [[-0.22, -0.22], [0.2, -0.22], [-0.22, 0.2], [0.2, 0.2]]) g.box('black', a, a + 0.03, 0.05, 0.42, c2, c2 + 0.03); const grp = new THREE.Group(); g.meshes(OM, { parent: grp }); grp.position.set(x, 0, z); grp.rotation.y = rot; office.add(grp); };
  // бумаги, папки, ноутбук, чашки, ручки — «по мелочам»
  const sheet = (x, z, rot, w = 0.21, h = 0.297, y = th + 0.003) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2).rotateY(rot).translate(x, y, z), paperMats[Math.floor(rnd() * paperMats.length)]); g.receiveShadow = true; office.add(g); };
  const office = new THREE.Group(); office.name = 'office'; group.add(office);
  const paperTex = (kind) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 362; const g = c.getContext('2d');
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, 256, 362); g.fillStyle = '#1b2029';
    if (kind === 0) { g.font = '600 15px Montserrat, Arial'; g.fillText('RADIAN GROUP', 24, 40); g.fillStyle = '#c9a25f'; g.fillRect(24, 50, 60, 2); g.fillStyle = '#8b8b88'; for (let y = 78; y < 330; y += 13) g.fillRect(24, y, 150 + ((y * 37) % 58), 3); } else if (kind === 1) { g.font = '600 13px Montserrat, Arial'; g.fillText('Условия покупки', 24, 38); g.strokeStyle = '#b9b6ae'; for (let y = 60; y < 320; y += 26) { g.strokeRect(24, y, 208, 26); g.fillStyle = '#8b8b88'; g.fillRect(32, y + 11, 70, 3); g.fillRect(150, y + 11, 50, 3); } } else { g.strokeStyle = '#23262a'; g.lineWidth = 2; g.strokeRect(30, 60, 196, 230); g.beginPath(); g.moveTo(30, 150); g.lineTo(150, 150); g.moveTo(150, 60); g.lineTo(150, 290); g.moveTo(150, 210); g.lineTo(226, 210); g.moveTo(90, 150); g.lineTo(90, 290); g.stroke(); g.font = '600 12px Montserrat, Arial'; g.fillText('2-комнатная, 56,75 м²', 30, 40); g.fillStyle = '#e8dcc0'; g.fillRect(34, 64, 112, 82); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  };
  const paperMats = [0, 1, 2].map((k) => std({ map: paperTex(k), roughness: 0.9, ...po }));
  sheet(tx - 0.75, tz - 0.12, 0.2); sheet(tx - 0.5, tz + 0.1, -0.25); sheet(tx - 0.62, tz - 0.02, 0.05); sheet(tx + 0.72, tz + 0.2, 2.9); sheet(tx + 0.25, tz - 0.3, 0.6); sheet(tx + 0.9, tz - 0.22, -0.4);
  { const g = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.44).rotateX(-Math.PI / 2).rotateY(0.12).translate(tx - 0.05, th + 0.006, tz + 0.18), std({ color: C('#fff'), roughness: 0.9, ...po })); new THREE.TextureLoader().load(asset('assets/floors/typical-paper.webp'), (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; g.material.map = t; g.material.needsUpdate = true; engine.invalidate(); }); g.receiveShadow = true; office.add(g); }
  o.box('folderA', tx + 0.45, tx + 0.78, th, th + 0.05, tz - 0.05, tz + 0.2); o.box('folderB', tx + 0.47, tx + 0.8, th + 0.05, th + 0.09, tz - 0.03, tz + 0.22);
  o.box('black', tx - 1.2, tx - 0.86, th, th + 0.015, tz - 0.42, tz - 0.18); o.box('screen', tx - 1.2, tx - 0.86, th + 0.015, th + 0.24, tz - 0.44, tz - 0.425); // ноутбук
  for (const [x, z] of [[tx - 0.2, tz - 0.38], [tx + 1.05, tz + 0.05]]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 12).translate(x, th + 0.045, z), OM.white); cup.castShadow = true; office.add(cup); }
  o.box('gold', tx - 0.35, tx - 0.2, th, th + 0.012, tz + 0.36, tz + 0.372); o.box('black', tx + 0.1, tx + 0.25, th, th + 0.012, tz + 0.4, tz + 0.412); // ручки
  o.box('paper', tx + 0.95, tx + 1.2, th, th + 0.06, tz + 0.3, tz + 0.48); // стопка буклетов
  for (const dx of [-0.85, 0, 0.85]) { chair(tx + dx, tz - 1.0, Math.PI); chair(tx + dx, tz + 1.0, 0); }
  // подвесы над столом
  for (const dx of [-0.8, 0, 0.8]) { const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10).translate(tx + dx, 2.25, tz), OM.lamp); office.add(bulb); o.box('black', tx + dx - 0.004, tx + dx + 0.004, 2.36, OH, tz - 0.004, tz + 0.004); }
  // тёмная стена с логотипом, комод с папками и буклетами
  { const logo = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.7).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, opacity: 0 })); logo.position.set(OX1 - 0.02, 2.35, OZ0 + 4.6); new THREE.TextureLoader().load(asset('assets/brand/logo-gold.svg'), (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; logo.material.map = t; logo.material.opacity = 1; logo.material.needsUpdate = true; engine.invalidate(); }); office.add(logo); }
  o.box('walnut', OX1 - 0.5, OX1 - 0.02, 0.1, 0.78, OZ0 + 3.2, OZ0 + 6.0); o.box('black', OX1 - 0.46, OX1 - 0.06, 0.05, 0.1, OZ0 + 3.3, OZ0 + 5.9);
  { let z = OZ0 + 3.4; const fm = ['folderA', 'folderB', 'folderC', 'paper', 'folderA', 'folderC', 'folderB']; for (let i = 0; i < 7; i++) { const w = 0.05 + rnd() * 0.03; o.box(fm[i], OX1 - 0.4, OX1 - 0.12, 0.78, 1.08 + rnd() * 0.04, z, z + w); z += w + 0.004; } o.box('paper', OX1 - 0.42, OX1 - 0.16, 0.78, 0.86, OZ0 + 5.0, OZ0 + 5.32); o.box('gold', OX1 - 0.36, OX1 - 0.22, 0.86, 0.865, OZ0 + 5.06, OZ0 + 5.26); }
  // экран с визуализацией комплекса
  { const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.3).rotateY(Math.PI), new THREE.MeshBasicMaterial({ color: C('#222'), toneMapped: false })); scr.position.set(OX0 + 2.2, 2.1, OZ1 - 0.06); new THREE.TextureLoader().load(asset('assets/renders/front-day-s.webp'), (t) => { t.colorSpace = THREE.SRGBColorSpace; scr.material.map = t; scr.material.color.set('#fff'); scr.material.needsUpdate = true; engine.invalidate(); }); office.add(scr); o.box('black', OX0 + 1.0, OX0 + 3.4, 1.4, 2.8, OZ1 - 0.05, OZ1 - 0.0); }
  // макет комплекса на подиуме под стеклом
  { const mx = OX1 - 1.5; const mz = OZ0 + 1.7; o.box('stone', mx - 0.75, mx + 0.75, 0.05, 0.92, mz - 0.5, mz + 0.5); o.box('glass', mx - 0.72, mx + 0.72, 0.92, 1.62, mz - 0.47, mz + 0.47);
    const k = 1 / 62; const mm = (x0, x1, y0, y1, z0, z1, mat = 'white') => o.box(mat, mx + (x0 - S.axisX) * k, mx + (x1 - S.axisX) * k, 0.93 + y0 * k, 0.93 + y1 * k, mz + (z0 - 13) * k, mz + (z1 - 13) * k);
    for (const mir of [false, true]) { const X = (a, c2) => [wx(a, mir), wx(c2, mir)].sort((p, q2) => p - q2); mm(...X(PLAN.B.x0, PLAN.B.x1), 0, LV.parapetB, S.frontZ, backB); mm(...X(PLAN.A.x0, PLAN.A.xe), 0, LV.roofA, S.frontZ + 3.8, backA, 'gold'); mm(...X(PLAN.podium.x0, PLAN.B.x1), 0, LV.podium, FRONT, S.frontZ + 6); }
    o.box('oak', mx - 0.7, mx + 0.7, 0.92, 0.93, mz - 0.45, mz + 0.45); }
  // стойка администратора у входа, диван, растения
  o.box('stone', OX0 + 0.5, OX0 + 2.5, 0.05, 1.05, OZ0 + 1.2, OZ0 + 1.75); o.box('oak', OX0 + 0.45, OX0 + 2.55, 1.05, 1.1, OZ0 + 1.15, OZ0 + 1.8); o.box('screen', OX0 + 1.2, OX0 + 1.75, 1.2, 1.55, OZ0 + 1.62, OZ0 + 1.64); o.box('black', OX0 + 1.44, OX0 + 1.5, 1.1, 1.2, OZ0 + 1.6, OZ0 + 1.66);
  o.box('paper', OX0 + 2.0, OX0 + 2.3, 1.1, 1.14, OZ0 + 1.3, OZ0 + 1.52); o.box('gold', OX0 + 0.7, OX0 + 0.74, 1.1, 1.25, OZ0 + 1.4, OZ0 + 1.44);
  o.box('fabric2', OX0 + 0.3, OX0 + 1.2, 0.2, 0.45, OZ0 + 5.0, OZ0 + 7.2); o.box('fabric2', OX0 + 0.3, OX0 + 0.5, 0.45, 0.85, OZ0 + 5.0, OZ0 + 7.2); o.box('black', OX0 + 1.5, OX0 + 2.1, 0.38, 0.42, OZ0 + 5.7, OZ0 + 6.5); o.box('paper', OX0 + 1.6, OX0 + 1.9, 0.42, 0.44, OZ0 + 5.9, OZ0 + 6.3);
  for (const [x, z, s] of [[OX1 - 0.7, OZ0 + 6.9, 1], [OX0 + 0.6, OZ0 + 0.5, 0.8]]) { o.box('pot', x - 0.2 * s, x + 0.2 * s, 0.05, 0.5 * s, z - 0.2 * s, z + 0.2 * s); const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 * s, 1).scale(1, 1.35, 1).translate(x, 0.5 * s + 0.7 * s, z), OM.leaf); l.castShadow = true; office.add(l); }
  o.meshes(OM, { parent: office, noShadow: ['glass', 'lamp', 'screen', 'ceil'] });
  const lamp1 = new THREE.PointLight('#ffdcb0', 26, 14, 1.6); lamp1.position.set(tx, 2.6, tz); office.add(lamp1);
  const lamp2 = new THREE.PointLight('#fff1dd', 14, 12, 1.6); lamp2.position.set(OX0 + 1.6, 3.2, OZ0 + 1.6); office.add(lamp2);
  L('Офис продаж', (OX0 + OX1) / 2, 8.9, FRONT - 0.4, 'tenant');

  function setNight(n) {
    for (const m of signMat) m.color.set('#cdbb96').lerp(C('#fff0d0'), n).multiplyScalar(1 + n * 0.5);
    M.light.emissiveIntensity = 0.4 + 3 * n;
    lamp1.intensity = 20 + 14 * n; lamp2.intensity = 10 + 8 * n;
    void shared;
  }

  return { group, office, labels, setNight, officeView: { eye: [OX0 + 0.7, 1.62, OZ1 - 0.6], target: [tx + 1.5, 1.0, tz - 0.4], door: [(OX0 + OX1) / 2, 1.9, FRONT - 3.2] } };
}
