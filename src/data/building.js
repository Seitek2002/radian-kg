// Геометрия комплекса и размещение квартир («шахматка») для 3D-модели.
//
// ВАЖНО: размещение квартир по этажам — ДЕМОНСТРАЦИОННОЕ. Реальной шахматки на
// radian.kg нет, поэтому типы планировок расставлены условно по стоякам.
// Чтобы подключить реальные данные, замените RISERS / TOP_FLOORS (или весь
// массив UNITS — например, загрузкой из CRM). Демо-данные не попадают в
// индексируемый HTML: они используются только в 3D.
//
// Размеры — оценка по проектным визуализациям (фронтальный вид, 2 башни,
// 2-этажный стилобат). Оси: x — восток, z — юг (север = −z), y — вверх, метры.
// Начало — центр комплекса; ORIGIN — его смещение от точки объекта на карте.

export const DEMO_LAYOUT = true;

export const ORIGIN = [-6, 0, 0];

export const GEO = {
  podium: { x0: -39.5, x1: 39.5, z0: -16.5, z1: 8, floors: 2, fh: 3.6 },
  fh: 3.3, // высота жилого этажа (потолок 3 м + перекрытие)
  firstRes: 3,
  topRes: 16,
  // Башня 1 (западная). Башня 2 — зеркально по x.
  white: { x0: -22.5, x1: -3.5, z0: -16.5, z1: 4 }, // белый объём с пилонами
  strip: { x0: -26, x1: -22.5, z0: -15.5, z1: 3 }, // полоса балконов
  dark: { x0: -39.5, x1: -26, z0: -14.5, z1: 6, topFloor: 14 }, // тёмный объём
  crown: 4.6, // высота «короны» из пилонов над кровлей
  bridge: { x0: -3.5, x1: 3.5, z0: -9, z1: -1 }, // стеклянный переход на 2-м этаже
};

export function floorY(f) {
  const { fh: pfh } = GEO.podium;
  if (f <= 2) return (f - 1) * pfh;
  return 2 * pfh + (f - GEO.firstRes) * GEO.fh;
}
export const floorH = (f) => (f <= 2 ? GEO.podium.fh : GEO.fh);
export const roofY = floorY(GEO.topRes + 1);
export const darkRoofY = floorY(GEO.dark.topFloor + 1);

// Жилая секция = белый объём + полоса балконов. Делим на 4 квадранта.
const SEC = { x0: GEO.strip.x0, x1: GEO.white.x1, z0: GEO.white.z0, z1: GEO.white.z1 };
const XM = (SEC.x0 + SEC.x1) / 2;
const ZM = (SEC.z0 + SEC.z1) / 2;

const QUAD = {
  NO: { x0: SEC.x0, x1: XM, z0: SEC.z0, z1: ZM }, // север, наружная сторона
  NI: { x0: XM, x1: SEC.x1, z0: SEC.z0, z1: ZM }, // север, к переходу
  SO: { x0: SEC.x0, x1: XM, z0: ZM, z1: SEC.z1 },
  SI: { x0: XM, x1: SEC.x1, z0: ZM, z1: SEC.z1 },
  N: { x0: SEC.x0, x1: SEC.x1, z0: SEC.z0, z1: ZM },
  S: { x0: SEC.x0, x1: SEC.x1, z0: ZM, z1: SEC.z1 },
  ALL: { ...SEC },
};

// Стояки: [позиция, [этажи 3–8], [этажи 9–14]] — slug планировки
const RISERS = {
  1: [
    ['NO', '1k-39-49', '1k-40-52'],
    ['NI', '2k-77-87', '2k-85-92'],
    ['SO', '1k-48-16', '2k-56-75'],
    ['SI', '3k-73-09', '3k-104-10'],
  ],
  2: [
    ['NO', '1k-48-34', '1k-48-16'],
    ['NI', '2k-56-75', '2k-77-87'],
    ['SO', '1k-40-52', '2k-85-92'],
    ['SI', '3k-104-10', '3k-73-09'],
  ],
};
// Верхние этажи: [башня, этаж, позиция, slug]
const TOP_FLOORS = [
  [1, 15, 'ALL', '3k-terrace-228-06'], // терраса — на кровле тёмного объёма
  [1, 16, 'N', '4k-128-34'],
  [1, 16, 'S', '4k-136-67'],
  [2, 15, 'N', '4k-136-67'],
  [2, 15, 'S', '4k-128-34'],
  [2, 16, 'N', '4k-128-34'],
  [2, 16, 'S', '4k-136-67'],
];

function mirror(b, tower) {
  return tower === 1 ? { ...b } : { x0: -b.x1, x1: -b.x0, z0: b.z0, z1: b.z1 };
}

function orient(pos, tower) {
  const o = [];
  if (pos.startsWith('N')) o.push('N');
  if (pos.startsWith('S')) o.push('S');
  if (pos === 'ALL') o.push('N', 'S');
  if (pos.endsWith('O') || pos === 'N' || pos === 'S' || pos === 'ALL') o.push(tower === 1 ? 'W' : 'E');
  return o;
}

function make(tower, floor, pos, plan) {
  return {
    id: `${tower}-${floor}-${pos}`,
    tower,
    floor,
    pos,
    plan,
    box: mirror(QUAD[pos], tower),
    orient: orient(pos, tower),
  };
}

export const UNITS = [];
for (const tower of [1, 2]) {
  for (let f = GEO.firstRes; f <= 14; f++) {
    for (const [pos, low, high] of RISERS[tower]) UNITS.push(make(tower, f, pos, f <= 8 ? low : high));
  }
}
for (const [t, f, pos, plan] of TOP_FLOORS) UNITS.push(make(t, f, pos, plan));

export const unitById = Object.fromEntries(UNITS.map((u) => [u.id, u]));
export const unitsByPlan = (slug) => UNITS.filter((u) => u.plan === slug);

export const ORIENT_LABEL = { N: 'север', S: 'юг', W: 'запад', E: 'восток' };
export const towerLabel = (t) => `Блок ${t}`;
