// Рендер страниц в отдельном потоке: у каждого worker свой кэш модулей,
// поэтому при dev-пересборке подхватываются свежие данные и шаблоны.
import { parentPort, workerData } from 'node:worker_threads';

const { origin, base, assets, noindex } = workerData;
if (origin) globalThis.__SITE_ORIGIN__ = origin;

const { pages, notFoundPage, renderPage } = await import('../src/pages/render.js');
const { SITE } = await import('../src/data/site.js');
const { PLANS, planTitle } = await import('../src/data/plans.js');

// Базовый путь (GitHub Pages: /radian-kg/): все корневые ссылки и пути к файлам
const withBase = (html) => (base === '/' ? html : html.replace(/(\s(?:href|src|content|srcset|poster))="\/(?!\/)/g, `$1="${base}`));

const list = pages();
const out = [...list, notFoundPage()].map((page) => ({ path: page.path, html: withBase(renderPage(page, { assets, noindex })) }));

const imgFor = (p) => {
  const m = p.path.match(/^\/planirovki\/([^/]+)\/$/);
  const plan = m && PLANS.find((x) => x.slug === m[1]);
  if (plan) {
    return [[`/assets/plans/${plan.code}.webp`, `Иллюстрация планировки: ${planTitle(plan)}`],
      [`/assets/plans/${plan.code}-draft.png`, `Проектный чертёж: ${planTitle(plan)}`]];
  }
  if (p.path === '/') return [['/assets/renders/front-day.webp', 'Проектная визуализация комплекса RADIAN GROUP со стороны Южной магистрали'], ['/assets/renders/aerial-north.webp', 'Комплекс RADIAN GROUP с высоты'], ['/assets/renders/yard-sunset.webp', 'Двор комплекса RADIAN GROUP']];
  return [];
};
const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${list.map((p) => `<url><loc>${SITE.origin}${p.path}</loc><lastmod>${SITE.updated}</lastmod>${imgFor(p).map(([src, cap]) => `<image:image><image:loc>${SITE.origin}${src}</image:loc><image:title>${xmlEsc(cap)}</image:title></image:image>`).join('')}</url>`).join('\n')}
</urlset>
`;
const robots = noindex
  ? 'User-agent: *\nDisallow: /\n'
  : `User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: Yandex\nAllow: /\nClean-param: u /planirovki/\n\nSitemap: ${SITE.origin}/sitemap.xml\n`;
const llms = `# ${SITE.brand} — квартиры в Бишкеке от застройщика

> Многофункциональный комплекс до 16 этажей в ж/м Арча-Бешик, первая линия Южной магистрали (ул. А. Масалиева), Бишкек. Квартиры 1–4 комнаты от 39,49 м², потолки 3 м, закрытый двор, 111 машино-мест. Цена от ${SITE.priceFromFmt} за м². Ориентир сдачи — ${SITE.handover}. Передача под самоотделку (ПСО). Оплата: наличные или рассрочка. Стадия на ${SITE.stage.date}: ${SITE.stage.title.toLowerCase()}. Отдел продаж: ${SITE.phoneFmt}.

## Страницы
${list.filter((p) => !p.path.includes('konfid')).map((p) => `- [${p.title}](${SITE.origin}${p.path}): ${p.description}`).join('\n')}
`;

parentPort.postMessage({ pages: out, sitemap, robots, llms, count: list.length });
