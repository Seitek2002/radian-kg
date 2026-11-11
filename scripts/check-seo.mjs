// Проверка собранного dist/: мета-теги, H1, JSON-LD, внутренние ссылки, alt у картинок.
//   node scripts/check-seo.mjs
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', process.argv[2] || 'dist');
const files = [];
async function walk(d) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) await walk(p); else if (e.name.endsWith('.html')) files.push(p);
  }
}
await walk(DIST);
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const pick = (html, re) => (html.match(re) || [])[1];
let problems = 0;
const titles = new Map(); const descs = new Map();
for (const f of files) {
  const html = await readFile(f, 'utf8');
  const rel = '/' + path.relative(DIST, f).split(path.sep).join('/').replace(/index\.html$/, '');
  const issues = [];
  const title = pick(html, /<title>([^<]*)<\/title>/);
  const desc = pick(html, /<meta name="description" content="([^"]*)"/);
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  const noindex = html.includes('content="noindex');
  if (!title) issues.push('нет title'); else if (title.length > 90) issues.push(`title длинный (${title.length})`);
  if (!desc) issues.push('нет description'); else if (!noindex && (desc.length < 70 || desc.length > 200)) issues.push(`description ${desc.length} симв.`);
  if (h1 !== 1) issues.push(`H1: ${h1}`);
  if (!noindex && !html.includes('rel="canonical"')) issues.push('нет canonical');
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { issues.push('JSON-LD невалиден: ' + e.message); }
  }
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(m[0])) issues.push('img без alt');
  for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) {
    const h = m[1];
    const target = h.endsWith('/') ? path.join(DIST, h, 'index.html') : path.join(DIST, h);
    if (!(await exists(target))) issues.push('битая ссылка ' + h);
  }
  if (!noindex) {
    if (titles.has(title)) issues.push('дубль title с ' + titles.get(title)); else titles.set(title, rel);
    if (descs.has(desc)) issues.push('дубль description с ' + descs.get(desc)); else descs.set(desc, rel);
  }
  const words = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  console.log(`${issues.length ? '✗' : '✓'} ${rel.padEnd(34)} ${String(words).padStart(5)} слов  ${title?.slice(0, 70)}`);
  for (const i of [...new Set(issues)]) { console.log('    · ' + i); problems++; }
}
const sm = await readFile(path.join(DIST, 'sitemap.xml'), 'utf8');
console.log(`\nsitemap.xml: ${(sm.match(/<loc>/g) || []).length} URL, ${(sm.match(/<image:loc>/g) || []).length} картинок`);
console.log(problems ? `Проблем: ${problems}` : 'Проблем не найдено');
process.exit(problems ? 1 : 0);
