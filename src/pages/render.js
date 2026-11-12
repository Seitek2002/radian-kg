// Пререндер всех страниц в статический HTML (SEO: весь текст доступен без JS).
// 3D-сцена — прогрессивное улучшение поверх этого HTML.
import {
  SITE, NAV, FACTS, COMPOSITION, GROUND_FLOOR, COMFORT, FAQ, DISCLAIMER,
} from '../data/site.js';
import {
  PLANS, ROOM_PAGES, AREA_RANGES, planTitle, planShort, fmtArea, ROOM_WORD,
} from '../data/plans.js';
import { loaderMarkup } from './loader.js';
import { LAYOUT, SIDE_LABEL, floorsLabel } from '../data/building.js';

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Соответствие RU-страниц существующим языковым версиям radian.kg (для hreflang)
const ALT = {
  '/': { ky: '/ky/', en: '/en/', ar: '/ar/' },
  '/planirovki/': { ky: '/ky/planirovkalar/', en: '/en/floor-plans/', ar: '/ar/floor-plans/' },
  '/raspolozhenie/': { ky: '/ky/jaigashuusu/', en: '/en/location/', ar: '/ar/location/' },
  '/hod-stroitelstva/': { ky: '/ky/kurulush-jurushu/', en: '/en/construction-progress/', ar: '/ar/construction-progress/' },
  '/kontakty/': { ky: '/ky/bailanysh/', en: '/en/contacts/', ar: '/ar/contacts/' },
  '/pokupka/': { ky: '/ky/satyp-aluu/', en: '/en/buying/', ar: '/ar/buying/' },
  '/konfidencialnost/': { ky: '/ky/kupuyaluuluk/', en: '/en/privacy/', ar: '/ar/privacy/' },
};
for (const p of PLANS) {
  ALT[`/planirovki/${p.slug}/`] = {
    ky: `/ky/planirovkalar/${p.slug}/`, en: `/en/floor-plans/${p.slug}/`, ar: `/ar/floor-plans/${p.slug}/`,
  };
}
const LANGS = [['ru', 'Русский'], ['ky', 'Кыргызча'], ['en', 'English'], ['ar', 'العربية']];

const tel = (cls = '', label = SITE.phoneFmt) =>
  `<a class="${cls}" href="tel:${SITE.phone}" data-track="phone_click" dir="ltr">${label}</a>`;

const ID = {
  org: `${SITE.origin}/#org`,
  site: `${SITE.origin}/#website`,
  complex: `${SITE.origin}/#complex`,
};

function baseGraph(page) {
  const crumbs = page.crumbs || [];
  const graph = [
    {
      '@type': 'Organization', '@id': ID.org, name: SITE.brand, legalName: SITE.legalName,
      url: `${SITE.origin}/`, logo: `${SITE.origin}/assets/brand/logo-gold.svg`,
      contactPoint: { '@type': 'ContactPoint', contactType: 'sales', telephone: SITE.phone, availableLanguage: ['ru', 'ky', 'en', 'ar'] },
    },
    { '@type': 'WebSite', '@id': ID.site, url: `${SITE.origin}/`, name: SITE.brand, publisher: { '@id': ID.org }, inLanguage: 'ru' },
    {
      '@type': 'WebPage', '@id': `${SITE.origin}${page.path}#webpage`, url: `${SITE.origin}${page.path}`,
      name: page.title, description: page.description, inLanguage: 'ru',
      isPartOf: { '@id': ID.site }, about: { '@id': ID.complex }, dateModified: SITE.updated,
      ...(page.image ? { primaryImageOfPage: `${SITE.origin}${page.image}` } : {}),
    },
  ];
  if (crumbs.length) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [['Главная', '/'], ...crumbs].map(([name, href], i, arr) => ({
        '@type': 'ListItem', position: i + 1, name,
        ...(i < arr.length - 1 || href ? { item: `${SITE.origin}${href}` } : {}),
      })),
    });
  }
  return graph;
}

export const complexNode = () => ({
  '@type': 'ApartmentComplex', '@id': ID.complex, name: `Комплекс ${SITE.brand}`, url: `${SITE.origin}/`,
  description: 'Многофункциональный комплекс высотой до 16 этажей в ж/м Арча-Бешик на первой линии Южной магистрали: квартиры от 1 до 4 комнат, потолки 3 м, закрытый двор, 111 машино-мест.',
  image: [`${SITE.origin}/assets/img/og.jpg`, `${SITE.origin}/assets/renders/front-day.webp`, `${SITE.origin}/assets/renders/aerial-north.webp`],
  numberOfAccommodationUnits: SITE.apartmentsTotal,
  address: { '@type': 'PostalAddress', streetAddress: SITE.address, addressLocality: SITE.city, addressRegion: 'Бишкек', addressCountry: 'KG' },
  geo: { '@type': 'GeoCoordinates', latitude: SITE.geo.lat, longitude: SITE.geo.lng },
  hasMap: `https://www.google.com/maps/search/?api=1&query=${SITE.geo.lat}%2C${SITE.geo.lng}`,
  amenityFeature: [
    'Закрытый двор', '111 машино-мест (78 подземных, 33 наземных)', '466 м² — детская площадка по проекту',
    'Потолки 3 м', 'По два лифта в каждой жилой секции', 'Охрана и видеонаблюдение',
  ].map((name) => ({ '@type': 'LocationFeatureSpecification', name, value: true })),
  containedInPlace: { '@type': 'Place', name: 'ж/м Арча-Бешик, Бишкек' },
});

const priceSpec = () => ({
  '@type': 'Offer', priceCurrency: 'USD', seller: { '@id': ID.org },
  priceSpecification: {
    '@type': 'UnitPriceSpecification', price: SITE.priceFrom, priceCurrency: 'USD', unitCode: 'MTK',
    description: 'Стартовая цена за квадратный метр. Стоимость конкретной квартиры рассчитывает менеджер.',
  },
});

const apartmentNode = (p) => ({
  '@type': 'Apartment', '@id': `${SITE.origin}/planirovki/${p.slug}/#apartment`, name: planTitle(p),
  url: `${SITE.origin}/planirovki/${p.slug}/`,
  image: [`${SITE.origin}/assets/plans/${p.code}.webp`, `${SITE.origin}/assets/plans/${p.code}-draft.png`],
  numberOfRooms: p.rooms,
  floorSize: { '@type': 'QuantitativeValue', value: p.area, unitCode: 'MTK' },
  ...(p.floor ? { floorLevel: String(p.floor) } : {}),
  containedInPlace: { '@id': ID.complex },
  offers: priceSpec(),
});

// ───────────────────────── каркас страницы ─────────────────────────

function head(page, opts) {
  const url = `${SITE.origin}${page.path}`;
  const alt = ALT[page.path];
  const og = `${SITE.origin}${page.ogImage || '/assets/img/og.jpg'}`;
  const graph = [...baseGraph(page), ...(page.schema || [])];
  const robots = opts.noindex || page.noindex ? '<meta name="robots" content="noindex,nofollow">' : '';
  const scene = opts.assets.scene ? `<meta name="x-3d" content="${opts.assets.scene.url}" data-size="${opts.assets.scene.size}">` : '';
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<script>document.documentElement.classList.add('js','pl-on');setTimeout(function(){document.documentElement.classList.add('pl-timeout')},20000)</script>
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
${robots}${page.noindex ? '' : `<link rel="canonical" href="${url}">`}
${alt && !page.noindex && !opts.noindex ? [`<link rel="alternate" hreflang="ru" href="${url}">`, ...Object.entries(alt).map(([l, h]) => `<link rel="alternate" hreflang="${l}" href="${SITE.origin}${h}">`), `<link rel="alternate" hreflang="x-default" href="${url}">`].join('') : ''}
<meta property="og:type" content="website"><meta property="og:site_name" content="${SITE.brand}">
<meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(page.description)}">
<meta property="og:locale" content="ru_RU"><meta property="og:url" content="${url}"><meta property="og:image" content="${og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#14181F">
<link rel="icon" href="/assets/brand/mark-gold.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600&family=Golos+Text:wght@400;600&display=swap" rel="stylesheet">
${page.preload ? `<link rel="preload" as="image" href="${page.preload}" fetchpriority="high">` : ''}
<link rel="stylesheet" href="${opts.assets.css}">
${scene}
<script type="module" src="${opts.assets.js}"></script>
${analytics()}
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>
</head>`;
}

function analytics() {
  const { gtm, yandexMetrika } = SITE.analytics;
  let s = '<script>window.dataLayer=window.dataLayer||[];</script>';
  if (gtm) s += `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':Date.now(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');</script>`;
  if (yandexMetrika) s += `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');ym(${yandexMetrika},'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});</script>`;
  return s;
}

function header(page) {
  const active = (href) => (page.path === href || (href !== '/' && page.path.startsWith(href)) ? ' aria-current="page"' : '');
  const links = NAV.map((n) => `<a href="${n.href}"${active(n.href)}>${n.label}</a>`).join('');
  const alt = ALT[page.path] || { ky: '/ky/', en: '/en/', ar: '/ar/' };
  const langs = LANGS.map(([l, name]) => l === 'ru'
    ? `<a href="${page.path}" lang="ru" aria-current="true">${name}</a>`
    : `<a href="${SITE.prodOrigin}${alt[l]}" lang="${l}" hreflang="${l}"${l === 'ar' ? ' dir="rtl"' : ''} data-external>${name}</a>`).join('');
  return `<header class="hdr" data-hdr>
  <div class="container hdr-in">
    <a class="logo" href="/" aria-label="${SITE.brand}, на главную"><img src="/assets/brand/logo-h-white.svg" alt="${SITE.brand}" width="168" height="40"></a>
    <nav class="nav" aria-label="Основное меню">${links}<a href="/pokupka/"${active('/pokupka/')}>Покупка</a></nav>
    <div class="hdr-end">
      <details class="lang"><summary aria-label="Выбрать язык">Русский</summary><div class="lang-list">${langs}</div></details>
      ${tel('hdr-tel')}
      <button type="button" class="menu-btn" aria-expanded="false" aria-controls="mmenu" data-menu>Меню</button>
    </div>
  </div>
  <nav class="mmenu" id="mmenu" aria-label="Меню" hidden>${links}<a href="/pokupka/">Покупка и вопросы</a>${tel('mtel')}</nav>
</header>`;
}

// Неподвижный фон: 3D-сцена. Пока её нет (или WebGL недоступен) — проектная визуализация.
function stage() {
  return `<div class="stage" id="stage" data-stage aria-hidden="true">
  <img class="stage-poster" src="/assets/renders/front-day.webp" alt="" width="2200" height="1426" decoding="async">
  <div class="labels" data-labels></div>
</div>
<div class="tod" data-tod role="group" aria-label="Время суток на модели">
  <button type="button" data-tod-key="" aria-pressed="true">Авто</button><button type="button" data-tod-key="front" aria-pressed="false">День</button><button type="button" data-tod-key="dusk" aria-pressed="false">Вечер</button><button type="button" data-tod-key="night" aria-pressed="false">Ночь</button>
</div>
<nav class="chapters" data-chapters aria-label="Разделы страницы"></nav>`;
}

function footer() {
  const links = [...NAV, { href: '/pokupka/', label: 'Покупка и вопросы' }, { href: '/konfidencialnost/', label: 'Обработка данных' }]
    .map((n) => `<a href="${n.href}">${n.label}</a>`).join('');
  const rooms = ROOM_PAGES.map((r) => `<a href="/planirovki/${r.slug}/">${r.rooms}-комнатные квартиры</a>`).join('');
  return `<footer class="ftr">
  <div class="container">
    <div class="ftr-top">
      <div class="ftr-brand"><img src="/assets/brand/logo-h-white.svg" alt="${SITE.brand}" width="320" height="76" loading="lazy"><p class="lead">${SITE.tagline}</p>${tel('big-tel')}</div>
      <nav class="ftr-nav" aria-label="Разделы">${links}</nav>
      <nav class="ftr-nav" aria-label="Квартиры по числу комнат">${rooms}<p class="muted">Объект по проекту: ${SITE.city}, ${SITE.district}, ${SITE.address}</p></nav>
    </div>
    <p class="ftr-legal">${DISCLAIMER}</p>
    <p class="ftr-legal">3D-модель построена по проектным чертежам и визуализациям. Размещение магазинов и ресторанов на первом этаже, благоустройство двора и интерьер офиса продаж показаны условно. Улицы и дома вокруг: © участники OpenStreetMap (ODbL).</p>
    <p class="ftr-legal">© ${SITE.brand}, 2026</p>
  </div>
</footer>`;
}

function leadDialog() {
  return `<dialog class="ldlg" id="lead" aria-labelledby="lead-t">
  <form method="dialog" class="ldlg-in">
    <button class="ldlg-x" value="close" aria-label="Закрыть">×</button>
    <h2 id="lead-t">Ответим по телефону</h2>
    <p>Онлайн-форма скоро заработает. Сейчас быстрее всего позвонить в отдел продаж: расскажем о наличии, стоимости и условиях.</p>
    <p class="ldlg-ctx" data-lead-ctx hidden>Ваш выбор: <b data-lead-ctx-text></b></p>
    ${tel('btn btn-primary')}
  </form>
</dialog>`;
}

export function renderPage(page, opts) {
  return `<!doctype html>
<html lang="ru" dir="ltr">
${head(page, opts)}
<body data-route="${page.route}">
${loaderMarkup()}
<a class="skip" href="#main">Перейти к содержанию</a>
${header(page)}
${stage()}
<main id="main" tabindex="-1" data-route="${page.route}"${page.plan ? ` data-plan="${page.plan}"` : ''}${page.rooms ? ` data-rooms="${page.rooms}"` : ''}>
${page.body}
</main>
${footer()}
${leadDialog()}
</body>
</html>`;
}

// ───────────────────────── блоки ─────────────────────────
// Сцена: 3D видно, текст сбоку. shot — кадр камеры (src/client/scene/app3d.js), side — где текст.
const scene = (shot, side, title, inner, { id = '', plan = '' } = {}) =>
  `<section class="scene" data-shot="${shot}" data-side="${side}" data-title="${title}"${id ? ` id="${id}"` : ''}${plan ? ` data-plan="${plan}"` : ''}><div class="container"><div class="scene-body">${inner}</div></div></section>`;
// Лист: плотный фон, содержимое во всю ширину контейнера.
const sheet = (inner, { alt = false, title = '', id = '', bleed = '' } = {}) =>
  `<section class="sheet${alt ? ' alt' : ''}"${title ? ` data-title="${title}"` : ''}${id ? ` id="${id}"` : ''}><div class="container">${inner}</div>${bleed}</section>`;
const crumbs = (items) => `<nav class="crumbs" aria-label="Навигационная цепочка"><a href="/">Главная</a>${items.map(([n, h]) => (h ? `<a href="${h}">${n}</a>` : `<span aria-current="page">${n}</span>`)).join('')}</nav>`;
const facts = (rows, cls = '') => `<dl class="facts ${cls}">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
const btnLead = (label = 'Запросить подбор', ctx = '', cls = 'btn-primary') => `<button type="button" class="btn ${cls}" data-lead${ctx ? ` data-lead-ctx="${esc(ctx)}"` : ''}>${label}</button>`;
const tenants = () => `<ul class="tenants">${GROUND_FLOOR.map(([n, s]) => `<li><b>${n}</b><span>${s}</span></li>`).join('')}</ul>`;
const yardFigures = () => `<div class="figures"><div><b>466 м²</b><span>детская площадка по проекту</span></div><div><b>202 м²</b><span>озеленение по проекту</span></div><div><b>78</b><span>машино-мест в подземном паркинге</span></div><div><b>33</b><span>наземных машино-места</span></div></div>`;

const planCard = (p) => `<li class="card" data-area="${p.area}" data-plan-card="${p.slug}"><a href="/planirovki/${p.slug}/">
  <img src="/assets/plans/${p.code}-s.webp" alt="Иллюстрация планировки: ${esc(planTitle(p))}" width="720" height="540" loading="lazy" decoding="async">
  <h3>${p.rooms}-комнатная${p.terrace ? ' с террасой' : ''}</h3><span>${fmtArea(p.area)} м², этаж${LAYOUT[p.slug].floors[0] === LAYOUT[p.slug].floors[1] ? '' : 'и'} ${floorsLabel(p.slug)}</span></a></li>`;

const RENDERS = [
  ['front-day', 'Вид со стороны Южной магистрали'], ['aerial-north', 'Комплекс с высоты: первая линия магистрали'], ['yard-sunset', 'Двор на закате: беседки и сосны'],
  ['podium', 'Первые этажи: витрины и порталы'], ['yard-pergolas', 'Зона отдыха и детская площадка во дворе'],
];
const rendersRail = () => `<div class="rail" tabindex="0" aria-label="Проектные визуализации">${RENDERS.map(([f, c]) => `<figure><img src="/assets/renders/${f}.webp" alt="Проектная визуализация. ${c}" width="2200" height="1426" loading="lazy" decoding="async"><figcaption>${c}. Проектная визуализация.</figcaption></figure>`).join('')}</div>`;

const contactsScene = (h = 'h2') => scene('office', 'left', 'Контакты', `
  <${h}>Поговорите с отделом продаж</${h}>
  <p class="lead">Расскажем о наличии, рассчитаем стоимость выбранной квартиры и условия рассрочки.</p>
  ${tel('big-tel')}
  <div class="actions">${btnLead()}<a class="btn btn-quiet" href="/raspolozhenie/">Как добраться</a></div>
  <p class="muted">Объект по проекту: ${SITE.city}, ${SITE.district}, ${SITE.address}. Это адрес строящегося объекта, а не офиса продаж.</p>
`, { id: 'contacts' });

const developerSheet = () => sheet(`
  <div class="split">
    <div class="sheet-head"><h2>Строим на своей земле и на свои средства</h2><p class="lead">${SITE.brand}: девелопер жилой и коммерческой недвижимости премиум-класса. Мы говорим о проекте конкретно и показываем то, что можно проверить.</p>${btnLead('Запросить информацию об участке', 'ЕНИ-код участка', 'btn-quiet')}</div>
    <ul class="rows">
      <li><h3>Собственный участок</h3><p>Компания строит комплекс на собственном земельном участке.</p></li>
      <li><h3>Собственные средства</h3><p>Строительство финансируется за счёт собственных средств компании.</p></li>
      <li><h3>ЕНИ-код по запросу</h3><p>Менеджер сообщит ЕНИ-код, чтобы вы могли проверить сведения об участке самостоятельно.</p></li>
      <li><h3>Публикация ДГА</h3><p>Проект застройки опубликован Департаментом градостроительства и архитектуры ${SITE.dga.date}. <a class="link" href="${SITE.dga.url}" rel="noopener" target="_blank">Открыть публикацию</a></p></li>
    </ul>
  </div>`, { alt: true, title: 'Застройщик' });

// ───────────────────────── страницы ─────────────────────────
export function pages() {
  const list = [];
  const add = (p) => list.push(p);

  // Главная: фильм по скроллу, каждая секция — свой кадр
  add({
    path: '/', route: 'home',
    title: 'Квартиры в Бишкеке от застройщика — RADIAN GROUP, Южная магистраль',
    description: 'Квартиры RADIAN GROUP в ж/м Арча-Бешик на Южной магистрали: 1–4 комнаты от 39,49 м², потолки 3 м, закрытый двор. 3D-модель комплекса и планировок. От 2 000 $ за м², ориентир сдачи — 2029.',
    schema: [complexNode()],
    body: `
${scene('hero', 'left', 'Комплекс', `
  <h1>Квартиры RADIAN&nbsp;GROUP в&nbsp;Бишкеке</h1>
  <p class="lead">Большие окна, потолки 3 м и закрытый двор на первой линии Южной магистрали.</p>
  <div class="actions"><a class="btn btn-primary" href="/planirovki/">Выбрать планировку</a><a class="btn btn-quiet" href="/pokupka/">Условия покупки</a></div>
  ${facts([['Цена', `от ${SITE.priceFromFmt} за м²`], ['Ориентир сдачи', `${SITE.handover} год`]], 'hero-facts')}
`)}
${scene('front', 'right', 'О проекте', `
  <h2>Два корпуса высотой до 16 этажей</h2>
  <p class="lead">${SITE.brand} строит в ж/м Арча-Бешик комплекс, где жильё соединено с тем, что нужно каждый день: магазинами, ресторанами, фитнес-залом и офисами.</p>
  ${facts(FACTS)}
  <a class="link" href="/o-proekte/">Подробнее о проекте</a>
`, { id: 'about' })}
${scene('podium', 'left', 'Первый этаж', `
  <h2>Повседневное на первом этаже</h2>
  <p class="lead">В проекте предусмотрены помещения для ежедневных дел. Комплекс строится: всё перечисленное запланировано, а не работает сегодня.</p>
  ${tenants()}
`)}
${scene('yard', 'right', 'Двор и парковка', `
  <h2>Закрытый двор и 111 машино-мест</h2>
  <p class="lead">У комплекса закрытый двор. В проекте предусмотрено удобство для детей и родителей с колясками.</p>
  ${yardFigures()}
`)}
${sheet(`<div class="sheet-head"><h2>Таким комплекс увидят с улицы</h2><p class="lead">Проектные визуализации архитекторов. По ним и по чертежам построена 3D-модель на этом сайте.</p></div>`, { title: 'Визуализации', bleed: rendersRail() })}
${scene('location', 'left', 'Расположение', `
  <h2>Первая линия Южной магистрали</h2>
  <p class="lead">Юго-западная часть Бишкека, ж/м Арча-Бешик, рядом с Джалом. Комплекс стоит в первой линии застройки вдоль улицы А. Масалиева.</p>
  ${facts([['Адрес объекта по проекту', SITE.address], ['Школы и детские сады', 'Рядом с комплексом'], ['Общественный транспорт', 'Хорошая обеспеченность'], ['Вид на горы', 'Из квартир соответствующих направлений']])}
  <a class="link" href="/raspolozhenie/">Карта и маршрут</a>
`, { id: 'location' })}
${scene('plans', 'right', 'Планировки', `
  <h2>Двенадцать планировок от 39,49 м²</h2>
  <p class="lead">От одной до четырёх комнат и особый вариант с террасой. На модели открыт типовой этаж: так квартиры расположены на самом деле.</p>
  <div class="rooms">${ROOM_PAGES.map((r) => `<a href="/planirovki/${r.slug}/"><b>${r.rooms}-комнатные</b><span>${PLANS.filter((p) => p.rooms === r.rooms).map((p) => fmtArea(p.area)).join(', ')} м²</span></a>`).join('')}</div>
  <div class="actions"><a class="btn btn-primary" href="/planirovki/">Все планировки</a></div>
`, { id: 'plans' })}
${scene('night', 'left', 'Покупка', `
  <h2>От 2 000 $ за квадратный метр</h2>
  <p class="lead">Это стартовая цена квадратного метра, а не стоимость квартиры. Расчёт по выбранной планировке подготовит менеджер.</p>
  ${facts([['Оплата', 'Наличный расчёт или рассрочка'], ['Состояние при передаче', 'Под самоотделку (ПСО)'], ['Стадия на ' + SITE.stage.date, 'Уровень первого этажа'], ['Ориентир сдачи', '2029 год']])}
  <div class="actions">${btnLead('Получить расчёт')}<a class="btn btn-quiet" href="/hod-stroitelstva/">Ход строительства</a></div>
`, { id: 'purchase' })}
${contactsScene()}`,
  });

  // О проекте
  add({
    path: '/o-proekte/', route: 'about',
    title: 'О комплексе RADIAN GROUP: до 16 этажей, потолки 3 м, закрытый двор — Бишкек, Арча-Бешик',
    description: 'Многофункциональный комплекс RADIAN GROUP на Южной магистрали: 116 квартир в двух жилых блоках, апарт-отель, магазины и рестораны на первом этаже, двор и 111 машино-мест.',
    crumbs: [['О проекте']],
    schema: [complexNode()],
    body: `
${scene('front', 'left', 'О комплексе', `
  ${crumbs([['О проекте']])}
  <h1>Комплекс ${SITE.brand} в Бишкеке</h1>
  <p class="lead">Многофункциональный комплекс высотой до 16 этажей в ж/м Арча-Бешик: жильё соединено с магазинами, ресторанами, фитнес-залом и офисами.</p>
  ${facts(FACTS)}
`)}
${sheet(`<div class="split"><div class="sheet-head"><h2>Что входит в комплекс</h2><p class="muted">Квартиры и апартаменты: разные форматы недвижимости с разным правовым статусом. Статус конкретного помещения уточняйте у менеджера. Состав приведён по проекту, опубликованному ДГА ${SITE.dga.date}; это не сведения о наличии квартир в продаже.</p></div><ul class="rows">${COMPOSITION.map(([k, v]) => `<li><h3>${k}</h3><p>${v}</p></li>`).join('')}</ul></div>`, { title: 'Состав' })}
${scene('facade', 'right', 'Свет и высота', `
  <h2>Большие окна и три метра до потолка</h2>
  <p class="lead">Высота потолков 3 метра. Большие окна дают комнатам дневной свет и глубину.</p>
  <p class="muted">Вид на горы открывается из квартир соответствующих направлений. Скажите менеджеру, что вид для вас важен, и он покажет подходящие варианты.</p>
`)}
${scene('podium', 'left', 'Первый этаж', `<h2>Повседневное на первом этаже</h2><p class="lead">Комплекс строится: всё перечисленное запланировано, а не работает сегодня.</p>${tenants()}`)}
${scene('yard', 'right', 'Двор и парковка', `<h2>Закрытый двор и 111 машино-мест</h2><p class="lead">111 машино-мест: общее число для комплекса по проекту. Условия приобретения места уточняйте у менеджера.</p>${yardFigures()}`)}
${sheet(`<div class="sheet-head"><h2>Коротко о том, о чём спрашивают</h2></div>${facts(COMFORT, 'wide')}`, { title: 'Комфорт' })}
${developerSheet()}
${contactsScene()}`,
  });

  // Каталог планировок и страницы по числу комнат
  const catalog = (rp) => {
    const shown = rp ? PLANS.filter((p) => p.rooms === rp.rooms) : PLANS;
    const h1 = rp ? rp.h1 : 'Планировки квартир от 39,49 м²';
    const rooms = [['all', 'Все', '/planirovki/'], ...[1, 2, 3, 4].map((n) => [n, String(n), `/planirovki/${n}-komnatnye/`])];
    add({
      path: rp ? `/planirovki/${rp.slug}/` : '/planirovki/', route: rp ? 'rooms' : 'plans', rooms: rp?.rooms,
      title: rp ? rp.title : 'Планировки квартир в Бишкеке: 1–4 комнаты от 39,49 м² — RADIAN GROUP',
      description: rp ? rp.description : 'Планировки квартир RADIAN GROUP в Бишкеке: 12 вариантов от 39,49 до 136,67 м² и квартира с террасой. Расположение на этаже по проектному чертежу, площади помещений.',
      crumbs: rp ? [['Планировки', '/planirovki/'], [rp.h1]] : [['Планировки']],
      schema: [{ '@type': 'ItemList', name: h1, itemListElement: shown.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE.origin}/planirovki/${p.slug}/`, name: planTitle(p) })) }],
      body: `
${scene('plans', 'left', 'Этаж', `
  ${crumbs(rp ? [['Планировки', '/planirovki/'], [rp.h1]] : [['Планировки']])}
  <h1>${h1}</h1>
  <p class="lead">${rp ? rp.lead : 'Двенадцать вариантов из проекта и особый вариант с террасой. На модели открыт типовой этаж: наведите на планировку ниже, и она подсветится на плане.'}</p>
  <div class="filters" data-filters>
    <fieldset><legend>Комнат</legend><div class="seg">${rooms.map(([v, l, href]) => `<a href="${href}"${String(rp?.rooms || 'all') === String(v) ? ' aria-current="true"' : ''}>${l}</a>`).join('')}</div></fieldset>
  </div>
`)}
${sheet(`
  <div class="sheet-head"><h2>${rp ? 'Варианты из проекта' : 'Все планировки'}</h2>
    <div class="filters" data-filters><fieldset><legend>Площадь</legend><div class="seg">${AREA_RANGES.map((r, i) => `<button type="button" data-f-area="${r.id}" aria-pressed="${i === 0}">${r.label}</button>`).join('')}</div></fieldset></div>
    <p class="count" data-f-count aria-live="polite"></p></div>
  <ul class="cards" data-cards>${shown.map(planCard).join('')}</ul>
  <div class="empty" data-empty hidden><h3>Таких вариантов в проекте нет</h3><p>Измените диапазон площади или попросите менеджера подобрать квартиру.</p>${btnLead()}</div>
  <p class="muted">Мебель на иллюстрациях показана условно. Число комнат указано по проектной классификации: считаются жилые комнаты, кухня отдельно. Цена «от» относится к квадратному метру, а не к квартире.</p>
`, { title: 'Планировки' })}
${contactsScene()}`,
    });
  };
  catalog(null);
  ROOM_PAGES.forEach((rp) => catalog(rp));

  // Страницы планировок
  PLANS.forEach((p, i) => {
    const prev = PLANS[(i - 1 + PLANS.length) % PLANS.length];
    const next = PLANS[(i + 1) % PLANS.length];
    const same = PLANS.filter((q) => q.rooms === p.rooms && q.slug !== p.slug);
    const t = planTitle(p);
    const rp = ROOM_PAGES.find((r) => r.rooms === p.rooms);
    const L = LAYOUT[p.slug];
    const one = L.floors[0] === L.floors[1];
    const sides = L.side.map((s) => SIDE_LABEL[s]).join('; ');
    const rows = [
      ['Тип по проекту', `${p.rooms}-комнатная квартира${p.terrace ? ' с террасой' : ''}`],
      [p.terrace ? 'Подпись квартиры на плане' : 'Площадь по плану', `${fmtArea(p.area)} м²`],
      ...(p.terrace ? [['Открытая терраса', `${fmtArea(p.terrace)} м²`]] : []),
      [one ? 'Этаж' : 'Этажи', floorsLabel(p.slug)], ['Секция', L.section], ['Окна выходят', sides],
      ...(p.kitchen ? [['Кухня', p.kitchen]] : []),
      ['Высота потолков', '3 м'], ['Передача', 'Под самоотделку (ПСО)'], ['Цена', `от ${SITE.priceFromFmt} за м²`],
    ];
    add({
      path: `/planirovki/${p.slug}/`, route: 'plan', plan: p.slug,
      title: `${t} в Бишкеке — 3D-планировка | ${SITE.brand}`,
      description: `Планировка: ${ROOM_WORD[p.rooms]}комнатная квартира${p.terrace ? ' с террасой' : ''} ${fmtArea(p.area)} м² в комплексе ${SITE.brand} на Южной магистрали. Расположение на этаже, чертёж с площадями помещений. Потолки 3 м, ПСО, от 2 000 $ за м².`,
      crumbs: [['Планировки', '/planirovki/'], [rp.h1, `/planirovki/${rp.slug}/`], [t]],
      ogImage: `/assets/plans/${p.code}.webp`, image: `/assets/plans/${p.code}.webp`,
      schema: [apartmentNode(p)],
      body: `
${scene('apartment', 'left', 'На этаже', `
  ${crumbs([['Планировки', '/planirovki/'], [rp.h1, `/planirovki/${rp.slug}/`], [t]])}
  <h1>${t}</h1>
  <p class="lead">${p.note || `Золотом на плане отмечено место квартиры на этаже. Окна: ${sides}.`}</p>
  ${facts([[one ? 'Этаж' : 'Этажи', floorsLabel(p.slug)], ['Секция', L.section], ['Потолки', '3 м'], ['Цена', `от ${SITE.priceFromFmt} за м²`]])}
  <div class="actions">${btnLead('Уточнить наличие и стоимость', t)}</div>
`, { plan: p.slug })}
${sheet(`
  <div class="drawings">
    <div class="specs"><h2>Характеристики</h2>${facts(rows, 'list')}
      <p class="muted">Стоимость этой квартиры рассчитает менеджер: цена «от» относится к квадратному метру, а не к квартире. Число комнат указано по проектной классификации: считаются жилые комнаты, кухня отдельно.</p></div>
    <div class="specs">
      <figure class="drawing"><a href="/assets/plans/${p.code}.webp" data-zoom><img src="/assets/plans/${p.code}.webp" alt="Иллюстрация планировки: ${esc(t)}" width="1800" height="1350" loading="lazy" decoding="async"></a><figcaption>Иллюстрация выполнена по проектному чертежу; мебель и отделка показаны условно и в стоимость не входят.</figcaption></figure>
      <figure class="drawing"><a href="/assets/plans/${p.code}-draft.png" data-zoom><img src="/assets/plans/${p.code}-draft.png" alt="Проектный чертёж планировки с площадями помещений: ${esc(t)}" width="1400" height="1050" loading="lazy" decoding="async"></a><figcaption>Проектный чертёж с площадями помещений. Нажмите, чтобы увеличить.</figcaption></figure>
    </div>
  </div>
  <nav class="pager" aria-label="Соседние планировки">
    <a href="/planirovki/${prev.slug}/" rel="prev"><small>Предыдущий вариант</small>${planShort(prev)}</a>
    <a href="/planirovki/${next.slug}/" rel="next"><small>Следующий вариант</small>${planShort(next)}</a>
  </nav>`, { title: 'Чертежи' })}
${same.length ? sheet(`<div class="sheet-head"><h2>Ещё ${ROOM_WORD[p.rooms]}комнатные</h2></div><ul class="cards">${same.map(planCard).join('')}</ul>`, { alt: true, title: 'Похожие' }) : ''}
${contactsScene()}`,
    });
  });

  // Расположение
  add({
    path: '/raspolozhenie/', route: 'location',
    title: 'Расположение: Арча-Бешик, первая линия Южной магистрали — RADIAN GROUP, Бишкек',
    description: 'Комплекс RADIAN GROUP на первой линии Южной магистрали (ул. А. Масалиева) в юго-западной части Бишкека, ж/м Арча-Бешик. Адрес по проекту, координаты, маршрут и 3D-карта окружения.',
    crumbs: [['Расположение']],
    schema: [complexNode()],
    body: `
${scene('location', 'left', 'На карте', `
  ${crumbs([['Расположение']])}
  <h1>Первая линия Южной магистрали</h1>
  <p class="lead">Юго-западная часть Бишкека, ж/м Арча-Бешик, рядом с Джалом. Улицы и дома на модели взяты с карты района.</p>
  ${facts([['Адрес объекта по проекту', SITE.address], ['Координаты', `<span dir="ltr">${SITE.geo.lat}, ${SITE.geo.lng}</span>`]], 'list')}
  <div class="actions"><a class="btn btn-primary" href="https://www.google.com/maps/dir/?api=1&amp;destination=${SITE.geo.lat}%2C${SITE.geo.lng}" rel="noopener" target="_blank" data-track="route_click">Построить маршрут</a><a class="btn btn-quiet" href="${SITE.twoGis}" rel="noopener" target="_blank">Объект в 2ГИС</a></div>
`)}
${scene('mountains', 'right', 'Вид на горы', `
  <h2>Ала-Тоо на юге</h2>
  <p class="lead">Вид на горы открывается из квартир соответствующих направлений. Скажите менеджеру, что вид для вас важен, и он покажет подходящие варианты.</p>
  ${facts([['Школы и детские сады', 'Рядом с комплексом'], ['Общественный транспорт', 'Хорошая обеспеченность']])}
`)}
${sheet(`<div class="split"><div class="sheet-head"><h2>Карта</h2><p class="muted">Это адрес строящегося объекта, а не офиса продаж. Если карта не открылась, используйте координаты или <a class="link" href="https://www.google.com/maps/search/?api=1&amp;query=${SITE.geo.lat}%2C${SITE.geo.lng}" rel="noopener" target="_blank">ссылку на точку объекта</a>.</p></div><div class="map" data-map><p>Карта OpenStreetMap загрузится после нажатия.</p><button type="button" class="btn btn-quiet" data-map-load>Показать карту</button></div></div>`, { title: 'Карта' })}
${contactsScene()}`,
  });

  // Ход строительства
  add({
    path: '/hod-stroitelstva/', route: 'progress',
    title: 'Ход строительства комплекса RADIAN GROUP в Бишкеке — данные на 16.09.2026',
    description: 'Текущая подтверждённая стадия строительства комплекса RADIAN GROUP на Южной магистрали — уровень первого этажа (16.09.2026). Ориентировочный срок сдачи — 2029 год.',
    crumbs: [['Ход строительства']],
    body: `
${scene('progress', 'left', 'Стадия', `
  ${crumbs([['Ход строительства']])}
  <h1>${SITE.stage.title}</h1>
  <p class="lead">Это последняя подтверждённая стадия, данные на ${SITE.stage.date}. На модели построенная часть показана целиком, остальное: золотым контуром проекта.</p>
  ${facts([['Сейчас', 'Уровень первого этажа'], ['Ориентир сдачи', '2029 год']])}
  <div class="actions">${btnLead('Уточнить актуальную стадию', 'Ход строительства')}</div>
`)}
${sheet(`<div class="split"><div class="sheet-head"><h2>История обновлений</h2><p class="muted">Фотографии со стройплощадки будут появляться здесь по мере поступления, только фактические. Срок сдачи ориентировочный и может уточняться.</p></div><ol class="timeline"><li><time datetime="${SITE.stage.iso}">${SITE.stage.date}</time><p>Строительство на уровне первого этажа.</p></li></ol></div>`, { title: 'История' })}
${contactsScene()}`,
  });

  // Покупка и вопросы
  add({
    path: '/pokupka/', route: 'purchase',
    title: 'Цена и условия покупки: от 2 000 $ за м², рассрочка — квартиры RADIAN GROUP, Бишкек',
    description: 'Квартиры RADIAN GROUP от 2 000 $ за м². Наличный расчёт или рассрочка, передача под самоотделку, ориентир сдачи — 2029. Ответы на частые вопросы о покупке.',
    crumbs: [['Покупка и вопросы']],
    schema: [{ '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }],
    body: `
${scene('night', 'left', 'Цена', `
  ${crumbs([['Покупка и вопросы']])}
  <h1>Цена и условия покупки</h1>
  <p class="lead">От 2 000 $ за квадратный метр. Это стартовая цена метра, а не стоимость квартиры: расчёт подготовит менеджер.</p>
  ${facts([['Оплата', 'Наличный расчёт или рассрочка'], ['Условия рассрочки', 'Менеджер рассчитает под вашу квартиру'], ['Состояние при передаче', 'Под самоотделку (ПСО)'], ['Ориентир сдачи', '2029 год']])}
  <div class="actions">${btnLead('Получить расчёт')}</div>
`)}
${sheet(`<div class="split"><div class="sheet-head"><h2>Частые вопросы</h2><p class="muted">Не нашли ответ? Позвоните в отдел продаж: ${tel('link')}.</p></div><div class="faq">${FAQ.map(([q, a]) => `<details><summary><h3>${q}</h3></summary><p>${a}</p></details>`).join('')}</div></div>`, { title: 'Вопросы' })}
${developerSheet()}
${contactsScene()}`,
  });

  // Контакты: камера заходит в офис продаж
  add({
    path: '/kontakty/', route: 'contacts',
    title: 'Контакты отдела продаж RADIAN GROUP — телефон +996 998 88 88 84',
    description: 'Телефон отдела продаж RADIAN GROUP: +996 998 88 88 84. Подбор квартиры, расчёт стоимости и условий рассрочки. Объект: Бишкек, ж/м Арча-Бешик, Южная магистраль.',
    crumbs: [['Контакты']],
    body: scene('office', 'left', 'Контакты', `
  ${crumbs([['Контакты']])}
  <h1>Отдел продаж ${SITE.brand}</h1>
  <p class="lead">Расскажем о наличии, рассчитаем стоимость выбранной квартиры и условия рассрочки.</p>
  ${tel('big-tel')}
  ${facts([['Объект по проекту', `${SITE.city}, ${SITE.district}, ${SITE.address}`], ['Сайт', 'radian.kg']], 'list')}
  <div class="actions">${btnLead()}<a class="btn btn-quiet" href="/raspolozhenie/">Как добраться</a></div>
  <p class="muted">Это адрес строящегося объекта, а не офиса продаж. Интерьер офиса на модели показан условно.</p>
`),
  });

  // Обработка данных
  add({
    path: '/konfidencialnost/', route: 'privacy',
    title: 'Обработка данных — RADIAN GROUP',
    description: 'Какие данные получает RADIAN GROUP при обращении через сайт, зачем и как ими пользуется.',
    crumbs: [['Обработка данных']],
    body: sheet(`<div class="prose">
  ${crumbs([['Обработка данных']])}
  <h1>Обработка данных</h1>
  <h2>Какие данные мы получаем</h2><p>Номер телефона, имя — если вы его указали, выбранную планировку и язык общения.</p>
  <h2>Зачем</h2><p>Чтобы перезвонить, ответить на вопросы о квартирах и условиях покупки. Для рассылок без вашего согласия данные не используются.</p>
  <h2>Аналитика</h2><p>Мы учитываем обезличенные действия на сайте: просмотр планировок, нажатие на телефон, смену языка. Имя, телефон и содержимое формы в аналитику не передаются.</p>
  <h2>Ваши права</h2><p>Вы можете попросить уточнить или удалить свои данные, обратившись в отдел продаж.</p>
  <p class="muted">Реквизиты оператора данных и срок хранения будут указаны перед запуском сайта.</p></div>`),
  });

  return list;
}

export function notFoundPage() {
  return {
    path: '/404.html', route: 'notfound', noindex: true,
    title: 'Страница не найдена — RADIAN GROUP',
    description: 'Такой страницы нет. Перейдите к планировкам или на главную.',
    body: scene('hero', 'left', 'Комплекс', `<h1>Такой страницы нет</h1><p class="lead">Возможно, ссылка устарела. Начните с планировок или главной.</p><div class="actions"><a class="btn btn-primary" href="/planirovki/">Планировки</a><a class="btn btn-quiet" href="/">На главную</a></div>`),
  };
}
