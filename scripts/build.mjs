// Сборка статического сайта:
//   • JS (esbuild, code-splitting: 3D-движок — отдельный чанк, грузится с прогрессом),
//   • CSS, копия public/,
//   • пререндер всех страниц, sitemap.xml (+ картинки), robots.txt, llms.txt.
//
//   node scripts/build.mjs                       — продакшн в dist/
//   node scripts/build.mjs --dev                 — без минификации, с sourcemap
//   node scripts/build.mjs --noindex             — для стенда: noindex + Disallow
//   node scripts/build.mjs --base=/radian-kg/ --out=.deploy --origin=https://user.github.io/radian-kg --noindex
//                                                — для GitHub Pages (подпапка)
//   SITE_ORIGIN=https://staging.example node scripts/build.mjs --noindex
import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile, readdir } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function buildSite({ dev = false, noindex = false, base = '/', out = 'dist', origin = process.env.SITE_ORIGIN } = {}) {
  const t0 = Date.now();
  const DIST = path.join(ROOT, out);
  base = `/${base.replace(/^\/|\/$/g, '')}/`.replace('//', '/');
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(path.join(ROOT, 'public'), DIST, { recursive: true });

  const js = await build({
    entryPoints: { app: path.join(ROOT, 'src/client/main.js') },
    bundle: true, splitting: true, format: 'esm', target: 'es2020',
    outdir: path.join(DIST, 'assets/js'), entryNames: '[name]-[hash]', chunkNames: 'c/[name]-[hash]',
    minify: !dev, sourcemap: dev, metafile: true, legalComments: 'none', logLevel: 'warning',
    define: { 'import.meta.env.DEV': JSON.stringify(dev), __BASE__: JSON.stringify(base) },
  });
  const css = await build({
    entryPoints: { app: path.join(ROOT, 'src/styles/main.css') },
    bundle: true, outdir: path.join(DIST, 'assets/css'), entryNames: '[name]-[hash]',
    minify: !dev, metafile: true, logLevel: 'warning', external: ['/assets/*'],
  });
  const rel = (o) => '/' + path.relative(DIST, path.join(ROOT, o)).split(path.sep).join('/');
  const entry = (meta, ext) => rel(Object.keys(meta.outputs).find((o) => o.endsWith(ext) && meta.outputs[o].entryPoint));
  const sceneOut = Object.keys(js.metafile.outputs).find((o) => /app3d-[^/]+\.js$/.test(o));
  const assets = {
    js: entry(js.metafile, '.js'),
    css: entry(css.metafile, '.css'),
    scene: sceneOut ? { url: rel(sceneOut), size: js.metafile.outputs[sceneOut].bytes } : null,
  };

  const res = await new Promise((resolve, reject) => {
    const w = new Worker(new URL('./render-worker.mjs', import.meta.url), { workerData: { origin, base, assets, noindex } });
    w.once('message', resolve);
    w.once('error', reject);
  });
  for (const { path: p, html } of res.pages) {
    const file = p.endsWith('.html') ? path.join(DIST, p) : path.join(DIST, p, 'index.html');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, html);
  }
  await writeFile(path.join(DIST, 'sitemap.xml'), res.sitemap);
  await writeFile(path.join(DIST, 'robots.txt'), res.robots);
  await writeFile(path.join(DIST, 'llms.txt'), res.llms);
  await writeFile(path.join(DIST, '.nojekyll'), ''); // GitHub Pages: отдавать файлы как есть

  const files = await count(DIST);
  console.log(`✓ ${out}/ — ${res.count + 1} страниц, ${files} файлов, ${Date.now() - t0} мс  (база: ${base}${noindex ? ', noindex' : ''})`);
  return { assets };
}

async function count(dir) {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) n += e.isDirectory() ? await count(path.join(dir, e.name)) : 1;
  return n;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  buildSite({ dev: args.includes('--dev'), noindex: args.includes('--noindex'), base: opt('base') || '/', out: opt('out') || 'dist', origin: opt('origin') || process.env.SITE_ORIGIN }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
