// 12 планировок из проекта (radian.kg/planirovki/). code — имя файлов в /assets/plans/.
// Изображения: {code}.webp — иллюстрация (по ней же выдавливаются 3D-стены),
// {code}-s.webp — превью, {code}-draft.png — проектный чертёж с площадями помещений.

export const PLANS = [
  { slug: '1k-39-49', code: 'L1-3949', rooms: 1, area: 39.49, kitchen: 'Отдельная' },
  { slug: '1k-40-52', code: 'L1-4052', rooms: 1, area: 40.52, kitchen: 'Отдельная' },
  { slug: '1k-48-16', code: 'L1-4816', rooms: 1, area: 48.16, kitchen: 'Отдельная' },
  { slug: '1k-48-34', code: 'L1-4834', rooms: 1, area: 48.34, kitchen: 'Отдельная' },
  { slug: '2k-56-75', code: 'L2-5675', rooms: 2, area: 56.75 },
  { slug: '2k-77-87', code: 'L2-7787', rooms: 2, area: 77.87 },
  { slug: '2k-85-92', code: 'L2-8592', rooms: 2, area: 85.92 },
  { slug: '3k-73-09', code: 'L3-7309', rooms: 3, area: 73.09 },
  { slug: '3k-104-10', code: 'L3-10410', rooms: 3, area: 104.10 },
  { slug: '4k-128-34', code: 'L4-12834', rooms: 4, area: 128.34 },
  { slug: '4k-136-67', code: 'L4-13667', rooms: 4, area: 136.67 },
  {
    slug: '3k-terrace-228-06', code: 'L3T-22806', rooms: 3, area: 228.06,
    terrace: 114.3, floor: 15, special: true,
    note: 'Особый вариант на 15-м этаже. На плане подписаны квартира — 228,06 м² и открытая терраса — 114,3 м². Эти числа не суммируются; что входит в площадь и на каких условиях передаётся терраса, уточняйте у менеджера.',
  },
];

export const ROOM_WORD = { 1: 'одно', 2: 'двух', 3: 'трёх', 4: 'четырёх' };

export const fmtArea = (a) => a.toFixed(2).replace('.', ',');

export function planTitle(p) {
  return `${p.rooms}-комнатная квартира${p.terrace ? ' с террасой' : ''}, ${fmtArea(p.area)} м²`;
}

export function planShort(p) {
  return `${p.rooms}-комн.${p.terrace ? ' с террасой' : ''} · ${fmtArea(p.area)} м²`;
}

export const planBySlug = Object.fromEntries(PLANS.map((p) => [p.slug, p]));
export const planByCode = Object.fromEntries(PLANS.map((p) => [p.code, p]));

// Диапазоны площади — как в фильтре на radian.kg
export const AREA_RANGES = [
  { id: 'all', label: 'Все', test: () => true },
  { id: 'lt50', label: 'до 50 м²', test: (a) => a < 50 },
  { id: '50-90', label: '50–90 м²', test: (a) => a >= 50 && a < 90 },
  { id: '90-140', label: '90–140 м²', test: (a) => a >= 90 && a < 140 },
  { id: 'gt140', label: 'от 140 м²', test: (a) => a >= 140 },
];

// Посадочные страницы по числу комнат (SEO). Тексты — только из фактов проекта.
export const ROOM_PAGES = [1, 2, 3, 4].map((rooms) => {
  const list = PLANS.filter((p) => p.rooms === rooms);
  const areas = list.map((p) => fmtArea(p.area) + ' м²');
  const word = ROOM_WORD[rooms];
  return {
    rooms,
    slug: `${rooms}-komnatnye`,
    h1: `${word[0].toUpperCase() + word.slice(1)}комнатные квартиры в Бишкеке`,
    title: `${rooms}-комнатные квартиры в Бишкеке от застройщика — планировки RADIAN GROUP`,
    description: `${word[0].toUpperCase() + word.slice(1)}комнатные квартиры RADIAN GROUP на Южной магистрали: ${areas.join(', ')}. Потолки 3 м, большие окна, ПСО. От 2 000 $ за м².`,
    lead: `${list.length === 1 ? 'Вариант' : 'Варианты'} из проекта: ${areas.join(', ')}. Потолки 3 м, большие окна, передача под самоотделку. Цена — от 2 000 $ за м²; стоимость конкретной квартиры, наличие и этаж уточнит менеджер.`,
  };
});
