// Пререндер всех страниц в статический HTML (SEO: весь текст доступен без JS).
// 3D-сцена — прогрессивное улучшение поверх этого HTML.
import {
  SITE, NAV, FACTS, COMPOSITION, GROUND_FLOOR, COMFORT, FAQ, DISCLAIMER,
} from '../data/site.js';
import {
  PLANS, ROOM_PAGES, AREA_RANGES, planTitle, planShort, fmtArea, ROOM_WORD,
} from '../data/plans.js';

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
  image: [`${SITE.origin}/assets/img/hero.jpg`, `${SITE.origin}/assets/img/front.jpg`],
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
<script>document.documentElement.classList.add('js')</script>
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
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&family=Golos+Text:wght@400;500;600&display=swap" rel="stylesheet">
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
  <div class="hdr-in">
    <a class="logo" href="/" aria-label="${SITE.brand} — на главную"><img src="/assets/brand/logo-h-white.svg" alt="${SITE.brand}" width="168" height="40"></a>
    <nav class="nav" aria-label="Основное меню">${links}<a href="/pokupka/"${active('/pokupka/')}>Покупка</a></nav>
    <div class="hdr-end">
      <details class="lang"><summary aria-label="Выбрать язык">RU</summary><div class="lang-list">${langs}</div></details>
      ${tel('hdr-tel')}
      <button type="button" class="menu-btn" aria-expanded="false" aria-controls="mmenu" data-menu>Меню</button>
    </div>
  </div>
  <nav class="mmenu" id="mmenu" aria-label="Меню" hidden>${links}<a href="/pokupka/">Покупка и вопросы</a>${tel('mtel')}</nav>
</header>`;
}

function stage(page) {
  const poster = page.poster || { src: '/assets/img/front.webp', alt: 'Проектная визуализация: фронтальный вид двух башен комплекса RADIAN GROUP со стороны Южной магистрали', w: 2000, h: 1119 };
  return `<div class="stage" id="stage" data-stage>
  <div class="stage-frame">
    <img class="stage-poster${poster.contain ? ' contain' : ''}" src="${poster.src}" alt="${esc(poster.alt)}" width="${poster.w}" height="${poster.h}" ${page.preload === poster.src ? 'fetchpriority="high"' : 'loading="eager"'} decoding="async">
    <div class="s-pre" data-pre role="status" aria-live="polite">
      <div class="s-pre-in">
        <p class="s-pre-k">3D-модель комплекса</p>
        <b data-pre-pct>0%</b>
        <span class="s-pre-bar"><i data-pre-bar></i></span>
        <p class="s-pre-t" data-pre-text>Загружаем 3D-движок…</p>
        <p class="s-pre-n">Страницу можно читать, пока модель готовится</p>
      </div>
    </div>
  </div>
  <div class="stage-ui" data-stage-ui></div>
</div>`;
}

function footer() {
  const links = [...NAV, { href: '/pokupka/', label: 'Покупка и вопросы' }, { href: '/konfidencialnost/', label: 'Обработка данных' }]
    .map((n) => `<a href="${n.href}">${n.label}</a>`).join('');
  const rooms = ROOM_PAGES.map((r) => `<a href="/planirovki/${r.slug}/">${r.rooms}-комнатные квартиры</a>`).join('');
  return `<footer class="ftr">
  <div class="ftr-in">
    <div class="ftr-brand"><img src="/assets/brand/logo-h-white.svg" alt="${SITE.brand}" width="160" height="38" loading="lazy"><p>${SITE.descriptor}</p><p class="tagline">${SITE.tagline}</p></div>
    <nav class="ftr-nav" aria-label="Разделы">${links}</nav>
    <nav class="ftr-nav" aria-label="Квартиры по числу комнат">${rooms}</nav>
    <div class="ftr-contact">${tel('ftr-tel')}<p>Объект по проекту: ${SITE.city}, ${SITE.district}, ${SITE.address}</p></div>
  </div>
  <p class="ftr-legal">${DISCLAIMER} 3D-модель — схематичная, построена по проектным визуализациям; размещение квартир по этажам на модели условное. Карта окружения: © участники OpenStreetMap (ODbL).</p>
  <p class="ftr-legal">© ${SITE.brand}, 2026</p>
</footer>`;
}

function leadDialog() {
  return `<dialog class="ldlg" id="lead" aria-labelledby="lead-t">
  <form method="dialog" class="ldlg-in">
    <button class="ldlg-x" value="close" aria-label="Закрыть">×</button>
    <p class="eyebrow">Запросить подбор</p>
    <h2 id="lead-t">Ответим по телефону</h2>
    <p>Онлайн-форма скоро заработает. Сейчас быстрее всего позвонить в отдел продаж — расскажем о наличии, стоимости и условиях.</p>
    <p class="ldlg-ctx" data-lead-ctx hidden>Ваш выбор: <b data-lead-ctx-text></b></p>
    ${tel('btn btn-gold')}
  </form>
</dialog>`;
}

export function renderPage(page, opts) {
  return `<!doctype html>
<html lang="ru" dir="ltr">
${head(page, opts)}
<body data-route="${page.route}" data-layout="${page.layout}">
<a class="skip" href="#main">Перейти к содержанию</a>
${header(page)}
${stage(page)}
<main id="main" tabindex="-1" data-route="${page.route}" data-layout="${page.layout}" data-view="${page.view}"${page.plan ? ` data-plan="${page.plan}"` : ''}${page.rooms ? ` data-rooms="${page.rooms}"` : ''} data-title="${esc(page.title)}" data-description="${esc(page.description)}">
${page.body}
</main>
${footer()}
${leadDialog()}
</body>
</html>`;
}

// ───────────────────────── блоки контента ─────────────────────────

const crumbs = (items) => `<nav class="crumbs" aria-label="Навигационная цепочка"><a href="/">Главная</a>${items.map(([n, h]) => h ? `<a href="${h}">${n}</a>` : `<span aria-current="page">${n}</span>`).join('')}</nav>`;

const dl = (rows, cls = 'facts') => `<dl class="${cls}">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

const btnLead = (label = 'Запросить подбор', ctx = '') =>
  `<button type="button" class="btn btn-gold" data-lead${ctx ? ` data-lead-ctx="${esc(ctx)}"` : ''}>${label}</button>`;

const sec = (view, inner, { id = '', cls = '', layout = 'split' } = {}) =>
  `<section class="sec ${cls}" data-view="${view}" data-layout="${layout}"${id ? ` id="${id}"` : ''}><div class="sec-in">${inner}</div></section>`;

function planCard(p, { h = 'h3' } = {}) {
  const ori = /L(2-77|2-85|3-73|4-|3T)/.test(p.code) ? 'tall' : 'wide';
  return `<li class="card" data-rooms="${p.rooms}" data-area="${p.area}" data-plan-card="${p.slug}">
  <a href="/planirovki/${p.slug}/">
    <img src="/assets/plans/${p.code}-s.webp" alt="Иллюстрация планировки: ${esc(planTitle(p))}" loading="lazy" decoding="async" class="${ori}">
    <${h} class="card-t">${p.rooms}-комнатная${p.terrace ? ' с террасой' : ''}</${h}>
    <span class="card-a">${fmtArea(p.area)} м²</span>
    ${p.kitchen ? '<span class="card-n">Отдельная кухня</span>' : ''}${p.terrace ? `<span class="card-n">Терраса ${fmtArea(p.terrace)} м² · ${p.floor} этаж</span>` : ''}
  </a>
</li>`;
}

function planFilters(active = 0) {
  const rooms = [['all', 'Все'], [1, '1'], [2, '2'], [3, '3'], [4, '4']];
  return `<div class="filters" data-filters>
  <fieldset><legend>Комнат</legend><div class="seg">${rooms.map(([v, l]) => {
    const href = v === 'all' ? '/planirovki/' : `/planirovki/${v}-komnatnye/`;
    const on = String(active || 'all') === String(v);
    return `<a href="${href}" data-f-rooms="${v}"${on ? ' aria-current="true"' : ''}>${l}</a>`;
  }).join('')}</div></fieldset>
  <fieldset><legend>Площадь</legend><div class="seg seg-sm">${AREA_RANGES.map((r, i) => `<button type="button" data-f-area="${r.id}"${i === 0 ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${r.label}</button>`).join('')}</div></fieldset>
  <p class="filters-count" data-f-count aria-live="polite"></p>
</div>`;
}

const contactsBlock = () => sec('contacts', `
  <p class="eyebrow">Контакты</p>
  <h2>Поговорите с отделом продаж</h2>
  <p>Расскажем о наличии, рассчитаем стоимость выбранной квартиры и условия рассрочки.</p>
  <p class="big-tel">${tel('')}</p>
  ${dl([['Объект по проекту', `${SITE.city}, ${SITE.district}, ${SITE.address}`], ['Сайт', 'radian.kg']])}
  <p class="note">Это адрес строящегося объекта, а не офиса продаж.</p>
  <div class="row">${btnLead()}<a class="btn btn-line" href="/raspolozhenie/">Подробнее о расположении</a></div>
`, { cls: 'dark', id: 'contacts' });

const devBlock = (h = 'h2') => sec('developer', `
  <p class="eyebrow">Застройщик и документы</p>
  <${h}>Строим на своей земле и на свои средства</${h}>
  <p>${SITE.brand} — девелопер жилой и коммерческой недвижимости премиум-класса. Мы говорим о проекте конкретно и показываем то, что можно проверить.</p>
  <ul class="ticks">
    <li><b>Собственный участок.</b> Компания строит комплекс на собственном земельном участке.</li>
    <li><b>Собственные средства.</b> Строительство финансируется за счёт собственных средств компании.</li>
    <li><b>ЕНИ-код участка — по запросу.</b> Менеджер сообщит ЕНИ-код, чтобы вы могли проверить сведения об участке самостоятельно.</li>
  </ul>
  <p class="note">Проект застройки опубликован Департаментом градостроительства и архитектуры ${SITE.dga.date}. <a href="${SITE.dga.url}" rel="noopener" target="_blank">Открыть публикацию ДГА</a></p>
  ${btnLead('Запросить информацию об участке', 'ЕНИ-код участка')}
`, { cls: 'paper' });

const faqList = (items, h = 'h3') => `<div class="faq">${items.map(([q, a]) => `<details><summary><${h}>${q}</${h}></summary><p>${a}</p></details>`).join('')}</div>`;

// ───────────────────────── страницы ─────────────────────────

export function pages() {
  const list = [];
  const add = (p) => list.push(p);

  // Главная — «скроллителлинг»: каждая секция задаёт ракурс 3D-модели
  add({
    path: '/', route: 'home', layout: 'hero', view: 'home',
    title: 'Квартиры в Бишкеке от застройщика — RADIAN GROUP, Южная магистраль',
    description: 'Квартиры RADIAN GROUP в ж/м Арча-Бешик на Южной магистрали: 1–4 комнаты от 39,49 м², потолки 3 м, закрытый двор. 3D-модель комплекса и планировок. От 2 000 $ за м², ориентир сдачи — 2029.',
    preload: '/assets/img/hero.webp',
    poster: { src: '/assets/img/hero.webp', alt: 'Проектная визуализация комплекса RADIAN GROUP: две башни со светлыми вертикалями фасада, вид со стороны Южной магистрали', w: 2000, h: 1119 },
    schema: [complexNode()],
    body: `
<section class="hero" data-view="home" data-layout="hero">
  <div class="hero-in">
    <p class="eyebrow">${SITE.city} · Южная магистраль</p>
    <h1>Квартиры ${SITE.brand} в&nbsp;Бишкеке</h1>
    <p class="lead">Большие окна, потолки 3 м и закрытый двор на первой линии Южной магистрали. Выберите квартиру прямо на 3D-модели комплекса.</p>
    <div class="row"><a class="btn btn-gold" href="/planirovki/">Выбрать квартиру</a><a class="btn btn-line" href="/pokupka/">Условия покупки</a></div>
    ${dl([['Цена', `от ${SITE.priceFromFmt} за м²`], ['Ориентир сдачи', `${SITE.handover} год`], ['Расположение', 'ж/м Арча-Бешик, ул. А. Масалиева']], 'facts facts-row')}
  </div>
  <p class="hero-hint" aria-hidden="true">Листайте — камера облетит комплекс</p>
</section>
${sec('about', `
  <p class="eyebrow">О комплексе</p>
  <h2>Многофункциональный комплекс высотой до 16 этажей</h2>
  <p>${SITE.brand} строит в ж/м Арча-Бешик комплекс, где жильё соединено с тем, что нужно каждый день: магазинами, ресторанами, фитнес-залом и офисами.</p>
  ${dl(FACTS)}
  <a class="more" href="/o-proekte/">Подробнее о проекте</a>
`, { id: 'about' })}
${sec('plans', `
  <p class="eyebrow">Планировки</p>
  <h2>Выберите квартиру прямо на фасаде</h2>
  <p>Двенадцать вариантов из проекта: от 39,49 до 136,67 м² и особый вариант с террасой. Наведите на окно — модель подскажет тип квартиры; нажмите — откроется планировка в 3D.</p>
  <ul class="rooms-links">${ROOM_PAGES.map((r) => `<li><a href="/planirovki/${r.slug}/" data-hl-rooms="${r.rooms}"><b>${r.rooms}</b><span>${['', 'комната', 'комнаты', 'комнаты', 'комнаты'][r.rooms]}</span><small>${PLANS.filter((p) => p.rooms === r.rooms).map((p) => fmtArea(p.area)).join(' · ')} м²</small></a></li>`).join('')}</ul>
  <a class="btn btn-gold" href="/planirovki/">Все планировки</a>
`, { id: 'plans' })}
${sec('facade', `
  <p class="eyebrow">Свет и высота</p>
  <h2>Большие окна и три метра до потолка</h2>
  <p>Высота потолков — 3 метра. Большие окна дают комнатам дневной свет и глубину.</p>
  <p>Вид на горы открывается из квартир соответствующих направлений. Скажите менеджеру, что вид для вас важен, — он покажет подходящие варианты.</p>
`)}
${sec('location', `
  <p class="eyebrow">Расположение</p>
  <h2>Первая линия Южной магистрали</h2>
  <p>Юго-западная часть Бишкека, ж/м Арча-Бешик, рядом с Джалом. Комплекс стоит в первой линии застройки вдоль улицы А. Масалиева — Южной магистрали.</p>
  ${dl([['Адрес объекта по проекту', SITE.address], ['Школы и детские сады', 'Рядом с комплексом'], ['Общественный транспорт', 'Хорошая обеспеченность']])}
  <a class="more" href="/raspolozhenie/">Карта и маршрут</a>
`, { cls: 'dark', id: 'location' })}
${sec('podium', `
  <p class="eyebrow">Жизнь в комплексе</p>
  <h2>Повседневное — на первом этаже</h2>
  <p>В проекте предусмотрены помещения для ежедневных дел. Комплекс строится: всё перечисленное запланировано, а не работает сегодня.</p>
  <ol class="numlist">${GROUND_FLOOR.map(([n, s]) => `<li><b>${n}</b><span>${s}</span></li>`).join('')}</ol>
`)}
${sec('courtyard', `
  <p class="eyebrow">Двор и парковка</p>
  <h2>Закрытый двор и 111 машино-мест</h2>
  <p>У комплекса закрытый двор. В проекте предусмотрено удобство для детей и родителей с колясками.</p>
  <ul class="stats"><li><b>466 м²</b>детская площадка по проекту</li><li><b>202 м²</b>озеленение по проекту</li><li><b>78</b>машино-мест в подземном паркинге</li><li><b>33</b>наземных машино-места</li></ul>
  <p class="note">111 машино-мест — общее число для комплекса по проекту. Условия приобретения места уточняйте у менеджера.</p>
`, { cls: 'dark' })}
${sec('progress', `
  <p class="eyebrow">Ход строительства · данные на ${SITE.stage.date}</p>
  <h2>${SITE.stage.title}</h2>
  <p>Это последняя подтверждённая стадия. На модели построенная часть показана плотным цветом, остальное — контуром проекта.</p>
  ${dl([['Сейчас', 'Уровень первого этажа'], ['Ориентир сдачи', `${SITE.handover} год — срок ориентировочный и может уточняться`]])}
  <a class="more" href="/hod-stroitelstva/">История обновлений</a>
`)}
${sec('purchase', `
  <p class="eyebrow">Покупка</p>
  <h2>От 2 000 $ за квадратный метр</h2>
  <p>Это стартовая цена квадратного метра, а не стоимость квартиры. Расчёт по выбранной планировке подготовит менеджер.</p>
  ${dl([['Оплата', 'Наличный расчёт или рассрочка'], ['Условия рассрочки', 'Менеджер рассчитает под вашу квартиру'], ['Состояние при передаче', 'Под самоотделку (ПСО)'], ['Ориентир сдачи', '2029 год']])}
  <div class="row">${btnLead('Получить расчёт у менеджера')}<a class="btn btn-line" href="/pokupka/">Вопросы и ответы</a></div>
`, { cls: 'dark' })}
${contactsBlock()}`,
  });

  // О проекте
  add({
    path: '/o-proekte/', route: 'about', layout: 'split', view: 'about',
    title: 'О комплексе RADIAN GROUP: до 16 этажей, потолки 3 м, закрытый двор — Бишкек, Арча-Бешик',
    description: 'Многофункциональный комплекс RADIAN GROUP на Южной магистрали: 116 квартир в двух жилых блоках, апарт-отель, магазины и рестораны на первом этаже, двор и 111 машино-мест.',
    crumbs: [['О проекте']],
    schema: [complexNode()],
    body: `
${sec('about', `
  ${crumbs([['О проекте']])}
  <p class="eyebrow">О комплексе</p>
  <h1>Многофункциональный комплекс ${SITE.brand} в Бишкеке</h1>
  <p class="lead">${SITE.brand} строит в ж/м Арча-Бешик комплекс высотой до 16 этажей, где жильё соединено с тем, что нужно каждый день: магазинами, ресторанами, фитнес-залом и офисами.</p>
  ${dl(FACTS)}
`)}
${sec('about-side', `
  <h2>Что входит в комплекс</h2>
  <ul class="ticks">${COMPOSITION.map(([k, v]) => `<li><b>${k}.</b> ${v}</li>`).join('')}</ul>
  <p class="note">Квартиры и апартаменты — разные форматы недвижимости с разным правовым статусом. Статус конкретного помещения и возможность его покупки уточняйте у менеджера.</p>
  <p class="note">Состав комплекса приведён по проекту, опубликованному Департаментом градостроительства и архитектуры ${SITE.dga.date}. Это не сведения о наличии квартир в продаже.</p>
`)}
${sec('facade', `
  <p class="eyebrow">Свет и высота</p>
  <h2>Большие окна и три метра до потолка</h2>
  <p>Высота потолков — 3 метра. Большие окна дают комнатам дневной свет и глубину. Вид на горы открывается из квартир соответствующих направлений — скажите менеджеру, что вид для вас важен.</p>
`)}
${sec('podium', `
  <p class="eyebrow">Первый этаж · по проекту</p>
  <h2>Повседневное — на первом этаже</h2>
  <ol class="numlist">${GROUND_FLOOR.map(([n, s]) => `<li><b>${n}</b><span>${s}</span></li>`).join('')}</ol>
  <p class="note">Комплекс строится: всё перечисленное запланировано, а не работает сегодня.</p>
`)}
${sec('courtyard', `
  <p class="eyebrow">Двор и парковка</p>
  <h2>Закрытый двор и 111 машино-мест</h2>
  <ul class="stats"><li><b>466 м²</b>детская площадка по проекту</li><li><b>202 м²</b>озеленение по проекту</li><li><b>78</b>машино-мест в подземном паркинге</li><li><b>33</b>наземных машино-места</li></ul>
`, { cls: 'dark' })}
${sec('about', `
  <p class="eyebrow">Комфорт и безопасность</p>
  <h2>Коротко о том, о чём спрашивают</h2>
  ${dl(COMFORT, 'facts facts-2')}
`)}
${devBlock()}
${contactsBlock()}`,
  });

  // Каталог планировок
  const catalog = (rp) => {
    const shown = rp ? PLANS.filter((p) => p.rooms === rp.rooms) : PLANS;
    const others = ROOM_PAGES.filter((r) => !rp || r.rooms !== rp.rooms);
    const path = rp ? `/planirovki/${rp.slug}/` : '/planirovki/';
    const title = rp ? rp.title : 'Планировки квартир в Бишкеке: 1–4 комнаты от 39,49 м² — RADIAN GROUP';
    const h1 = rp ? rp.h1 : 'Планировки квартир от 39,49 до 228,06 м²';
    add({
      path, route: rp ? 'rooms' : 'plans', layout: 'split', view: 'plans', rooms: rp?.rooms,
      title,
      description: rp ? rp.description : 'Планировки квартир RADIAN GROUP в Бишкеке: 12 вариантов от 39,49 до 136,67 м² и квартира с террасой. Выбор квартиры на 3D-модели, чертежи с площадями помещений.',
      crumbs: rp ? [['Планировки', '/planirovki/'], [rp.h1]] : [['Планировки']],
      schema: [{
        '@type': 'ItemList', name: h1,
        itemListElement: shown.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE.origin}/planirovki/${p.slug}/`, name: planTitle(p) })),
      }],
      body: `
${sec('plans', `
  ${crumbs(rp ? [['Планировки', '/planirovki/'], [rp.h1]] : [['Планировки']])}
  <p class="eyebrow">Планировки</p>
  <h1>${h1}</h1>
  <p class="lead">${rp ? rp.lead : 'Двенадцать вариантов из проекта: от 39,49 до 136,67 м² и особый вариант с террасой. Смотрите без регистрации; наличие и стоимость конкретной квартиры уточнит менеджер.'}</p>
  <p class="hint-3d" data-3d-only hidden>Подходящие квартиры подсвечены на модели золотым. Выберите этаж на модели, чтобы заглянуть внутрь.</p>
  ${planFilters(rp?.rooms)}
  <ul class="cards" data-cards>${shown.map((p) => planCard(p)).join('')}</ul>
  <div class="empty" data-empty hidden><h3>Таких вариантов в проекте нет</h3><p>Измените число комнат или диапазон площади — или попросите менеджера подобрать квартиру.</p>${btnLead()}</div>
  <p class="note">Мебель на иллюстрациях показана условно. Число комнат указано по проектной классификации: считаются жилые комнаты, кухня — отдельно. Цена «от» относится к квадратному метру, а не к квартире.</p>
  ${rp ? `<h2 class="h3">Другие варианты</h2><ul class="chips">${others.map((r) => `<li><a href="/planirovki/${r.slug}/">${r.h1}</a></li>`).join('')}<li><a href="/planirovki/">Все планировки</a></li></ul>` : ''}
`)}
${contactsBlock()}`,
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
    const rows = [
      ['Тип по проекту', `${p.rooms}-комнатная квартира${p.terrace ? ' с террасой' : ''}`],
      [p.terrace ? 'Подпись квартиры на плане' : 'Площадь по плану', `${fmtArea(p.area)} м²`],
      ...(p.terrace ? [['Открытая терраса', `${fmtArea(p.terrace)} м²`], ['Этаж', String(p.floor)]] : []),
      ...(p.kitchen ? [['Кухня', p.kitchen]] : []),
      ['Высота потолков', '3 м'], ['Окна', 'Большие'], ['Передача', 'Под самоотделку (ПСО)'], ['Цена', `от ${SITE.priceFromFmt} за м²`],
    ];
    add({
      path: `/planirovki/${p.slug}/`, route: 'plan', layout: 'stage', view: 'plan', plan: p.slug,
      title: `${t} в Бишкеке — 3D-планировка | ${SITE.brand}`,
      description: `Планировка: ${ROOM_WORD[p.rooms]}комнатная квартира${p.terrace ? ' с террасой' : ''} ${fmtArea(p.area)} м² в комплексе ${SITE.brand} на Южной магистрали. 3D-модель, чертёж с площадями помещений. Потолки 3 м, ПСО, от 2 000 $ за м².`,
      crumbs: [['Планировки', '/planirovki/'], [rp.h1, `/planirovki/${rp.slug}/`], [t]],
      ogImage: `/assets/plans/${p.code}.webp`,
      image: `/assets/plans/${p.code}.webp`,
      poster: { src: `/assets/plans/${p.code}.webp`, alt: `Иллюстрация планировки: ${t}`, w: 1800, h: 1800, contain: true },
      schema: [apartmentNode(p)],
      body: `
<section class="sec sec-wide" data-view="plan" data-layout="stage">
  <div class="sec-in">
    ${crumbs([['Планировки', '/planirovki/'], [rp.h1, `/planirovki/${rp.slug}/`], [t]])}
    <div class="plan-head">
      <div>
        <p class="eyebrow">Планировка</p>
        <h1>${t}</h1>
        ${p.note ? `<p class="lead">${p.note}</p>` : ''}
      </div>
      <div class="row">${btnLead('Уточнить наличие и стоимость', t)}${tel('btn btn-line')}</div>
    </div>
    <div class="plan-grid">
      <div>
        <h2 class="h3">Характеристики</h2>
        ${dl(rows, 'facts facts-list')}
        <p class="note">Стоимость этой квартиры рассчитает менеджер: цена «от» относится к квадратному метру, а не к квартире.</p>
        <p class="note">Число комнат указано по проектной классификации: считаются жилые комнаты, кухня — отдельно.</p>
        <p class="note" data-3d-only hidden>3D-модель построена по иллюстрации: стены выдавлены на высоту потолка 3 м, мебель показана условно. Точная геометрия и площади помещений — на проектном чертеже.</p>
      </div>
      <figure class="drawing">
        <a href="/assets/plans/${p.code}-draft.png" data-zoom><img src="/assets/plans/${p.code}-draft.png" alt="Проектный чертёж планировки с площадями помещений: ${esc(t)}" loading="lazy" decoding="async"></a>
        <figcaption>Проектный чертёж с площадями помещений. Нажмите, чтобы увеличить.</figcaption>
      </figure>
      <figure class="drawing">
        <a href="/assets/plans/${p.code}.webp" data-zoom><img src="/assets/plans/${p.code}.webp" alt="Иллюстрация планировки: ${esc(t)}" loading="lazy" decoding="async"></a>
        <figcaption>Иллюстрация выполнена по проектному чертежу; мебель и отделка показаны условно и в стоимость не входят.</figcaption>
      </figure>
    </div>
    ${same.length ? `<h2 class="h3">Ещё ${ROOM_WORD[p.rooms]}комнатные</h2><ul class="cards cards-sm">${same.map((q) => planCard(q, { h: 'h3' })).join('')}</ul>` : ''}
    <nav class="pager" aria-label="Соседние планировки">
      <a href="/planirovki/${prev.slug}/" rel="prev"><small>Предыдущий вариант</small>${planShort(prev)}</a>
      <a href="/planirovki/${next.slug}/" rel="next"><small>Следующий вариант</small>${planShort(next)}</a>
    </nav>
  </div>
</section>
${contactsBlock().replace('data-layout="split"', 'data-layout="stage"')}`,
    });
  });

  // Расположение
  add({
    path: '/raspolozhenie/', route: 'location', layout: 'split', view: 'location',
    title: 'Расположение: Арча-Бешик, первая линия Южной магистрали — RADIAN GROUP, Бишкек',
    description: 'Комплекс RADIAN GROUP на первой линии Южной магистрали (ул. А. Масалиева) в юго-западной части Бишкека, ж/м Арча-Бешик. Адрес по проекту, координаты, маршрут и 3D-карта окружения.',
    crumbs: [['Расположение']],
    schema: [complexNode()],
    body: `
${sec('location', `
  ${crumbs([['Расположение']])}
  <p class="eyebrow">Расположение</p>
  <h1>Арча-Бешик, первая линия Южной магистрали</h1>
  <p class="lead">Юго-западная часть Бишкека, ж/м Арча-Бешик, рядом с Джалом. Комплекс стоит в первой линии застройки вдоль улицы А. Масалиева — Южной магистрали.</p>
  ${dl([['Адрес объекта по проекту', SITE.address], ['Координаты объекта', `<span dir="ltr">${SITE.geo.lat}, ${SITE.geo.lng}</span>`], ['Школы и детские сады', 'Рядом с комплексом'], ['Общественный транспорт', 'Хорошая обеспеченность']])}
  <p class="note">Это адрес строящегося объекта, а не офиса продаж.</p>
  <div class="row"><a class="btn btn-gold" href="https://www.google.com/maps/dir/?api=1&amp;destination=${SITE.geo.lat}%2C${SITE.geo.lng}" rel="noopener" target="_blank" data-track="route_click">Построить маршрут</a><a class="btn btn-line" href="${SITE.twoGis}" rel="noopener" target="_blank">Объект в 2ГИС</a></div>
`, { cls: 'dark' })}
${sec('sun', `
  <p class="eyebrow">Солнце и вид</p>
  <h2>Как солнце обходит комплекс</h2>
  <p>Горы Ала-Тоо — на юге, Южная магистраль — на севере от комплекса. Передвиньте ползунок времени на модели: положение солнца рассчитано для координат объекта, тени — по проектной высоте башен.</p>
  <p>Вид на горы открывается из квартир соответствующих направлений. Скажите менеджеру, что вид для вас важен, — он покажет подходящие варианты.</p>
`)}
${sec('map', `
  <h2 class="h3">Карта</h2>
  <div class="map" data-map><p>Карта OpenStreetMap загрузится после нажатия.</p><button type="button" class="btn btn-line" data-map-load>Показать карту</button></div>
  <p class="note">Если карта не открылась, используйте координаты или <a href="https://www.google.com/maps/search/?api=1&amp;query=${SITE.geo.lat}%2C${SITE.geo.lng}" rel="noopener" target="_blank">ссылку на точку объекта</a>.</p>
`)}
${sec('podium', `
  <p class="eyebrow">Жизнь в комплексе</p>
  <h2>Повседневное — на первом этаже</h2>
  <ol class="numlist">${GROUND_FLOOR.map(([n, s]) => `<li><b>${n}</b><span>${s}</span></li>`).join('')}</ol>
  <p class="note">Комплекс строится: всё перечисленное запланировано, а не работает сегодня.</p>
`)}
${contactsBlock()}`,
  });

  // Ход строительства
  add({
    path: '/hod-stroitelstva/', route: 'progress', layout: 'split', view: 'progress',
    title: 'Ход строительства комплекса RADIAN GROUP в Бишкеке — данные на 16.09.2026',
    description: 'Текущая подтверждённая стадия строительства комплекса RADIAN GROUP на Южной магистрали — уровень первого этажа (16.09.2026). Ориентировочный срок сдачи — 2029 год.',
    crumbs: [['Ход строительства']],
    body: `
${sec('progress', `
  ${crumbs([['Ход строительства']])}
  <p class="eyebrow">Ход строительства · данные на ${SITE.stage.date}</p>
  <h1>${SITE.stage.title}</h1>
  <p class="lead">Это последняя подтверждённая стадия. Фотографии со стройплощадки будут появляться здесь по мере поступления — только фактические.</p>
  <p data-3d-only hidden>На модели построенная часть показана плотным цветом, остальное — контуром проекта.</p>
  ${dl([['Сейчас', `Уровень первого этажа · данные на ${SITE.stage.date}`], ['Ориентир', 'Сдача — 2029 год. Срок ориентировочный и может уточняться.']])}
  ${btnLead('Уточнить актуальную стадию', 'Ход строительства')}
`)}
${sec('progress', `
  <h2 class="h3">История обновлений</h2>
  <ol class="timeline"><li><time datetime="${SITE.stage.iso}">${SITE.stage.date}</time><p>Строительство на уровне первого этажа.</p></li></ol>
  <p class="note">Новые записи появятся вместе с подтверждёнными данными.</p>
`)}
${contactsBlock()}`,
  });

  // Покупка и вопросы
  add({
    path: '/pokupka/', route: 'purchase', layout: 'split', view: 'purchase',
    title: 'Цена и условия покупки: от 2 000 $ за м², рассрочка — квартиры RADIAN GROUP, Бишкек',
    description: 'Квартиры RADIAN GROUP от 2 000 $ за м². Наличный расчёт или рассрочка, передача под самоотделку, ориентир сдачи — 2029. Ответы на частые вопросы о покупке.',
    crumbs: [['Покупка и вопросы']],
    schema: [{
      '@type': 'FAQPage',
      mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    }],
    body: `
${sec('purchase', `
  ${crumbs([['Покупка и вопросы']])}
  <p class="eyebrow">Покупка</p>
  <h1>Цена и условия покупки</h1>
  <p class="lead">От 2 000 $ за квадратный метр. Это стартовая цена квадратного метра, а не стоимость квартиры. Расчёт по выбранной планировке подготовит менеджер.</p>
  ${dl([['Оплата', 'Наличный расчёт или рассрочка'], ['Условия рассрочки', 'Менеджер рассчитает под вашу квартиру'], ['Состояние при передаче', 'Под самоотделку (ПСО)'], ['Ориентир сдачи', '2029 год']])}
  ${btnLead('Получить расчёт у менеджера')}
`, { cls: 'dark' })}
${sec('purchase', `
  <p class="eyebrow">Вопросы и ответы</p>
  <h2>Частые вопросы</h2>
  ${faqList(FAQ)}
`)}
${devBlock()}
${contactsBlock()}`,
  });

  // Контакты
  add({
    path: '/kontakty/', route: 'contacts', layout: 'split', view: 'contacts',
    title: 'Контакты отдела продаж RADIAN GROUP — телефон +996 998 88 88 84',
    description: 'Телефон отдела продаж RADIAN GROUP: +996 998 88 88 84. Подбор квартиры, расчёт стоимости и условий рассрочки. Объект: Бишкек, ж/м Арча-Бешик, Южная магистраль.',
    crumbs: [['Контакты']],
    body: `
${sec('contacts', `
  ${crumbs([['Контакты']])}
  <p class="eyebrow">Контакты</p>
  <h1>Отдел продаж ${SITE.brand}</h1>
  <p class="lead">Расскажем о наличии, рассчитаем стоимость выбранной квартиры и условия рассрочки.</p>
  <p class="big-tel">${tel('')}</p>
  ${dl([['Объект по проекту', `${SITE.city}, ${SITE.district}, ${SITE.address}`], ['Сайт', 'radian.kg']])}
  <p class="note">Это адрес строящегося объекта, а не офиса продаж.</p>
  <div class="row">${btnLead()}<a class="btn btn-line" href="/raspolozhenie/">Как добраться</a></div>
`, { cls: 'dark' })}`,
  });

  // Обработка данных
  add({
    path: '/konfidencialnost/', route: 'privacy', layout: 'split', view: 'home',
    title: 'Обработка данных — RADIAN GROUP',
    description: 'Какие данные получает RADIAN GROUP при обращении через сайт, зачем и как ими пользуется.',
    crumbs: [['Обработка данных']],
    body: sec('home', `
  ${crumbs([['Обработка данных']])}
  <h1>Обработка данных</h1>
  <h2 class="h3">Какие данные мы получаем</h2><p>Номер телефона, имя — если вы его указали, выбранную планировку и язык общения.</p>
  <h2 class="h3">Зачем</h2><p>Чтобы перезвонить, ответить на вопросы о квартирах и условиях покупки. Для рассылок без вашего согласия данные не используются.</p>
  <h2 class="h3">Аналитика</h2><p>Мы учитываем обезличенные действия на сайте: просмотр планировок, нажатие на телефон, смену языка, действия с 3D-моделью. Имя, телефон и содержимое формы в аналитику не передаются.</p>
  <h2 class="h3">Ваши права</h2><p>Вы можете попросить уточнить или удалить свои данные, обратившись в отдел продаж.</p>
  <p class="note">Реквизиты оператора данных и срок хранения будут указаны перед запуском сайта.</p>
`),
  });

  return list;
}

export function notFoundPage() {
  return {
    path: '/404.html', route: 'notfound', layout: 'split', view: 'home', noindex: true,
    title: 'Страница не найдена — RADIAN GROUP',
    description: 'Такой страницы нет. Перейдите к планировкам или на главную.',
    body: sec('home', `<p class="eyebrow">Ошибка 404</p><h1>Такой страницы нет</h1><p class="lead">Возможно, ссылка устарела. Начните с планировок или главной.</p><div class="row"><a class="btn btn-gold" href="/planirovki/">Планировки</a><a class="btn btn-line" href="/">На главную</a></div>`),
  };
}
