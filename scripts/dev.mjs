// Локальный сервер: собирает dist/ (dev-режим), следит за src/ и public/,
// пересобирает и перезагружает страницу в браузере.
//   npm run dev               → http://localhost:5173
//   npm run preview           → продакшн-сборка без слежения
//   PORT=5175 OUT=.preview node scripts/dev.mjs  → вторая копия в другой папке
import http from 'node:http';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || 'dist';
const DIST = path.join(ROOT, OUT);
const PORT = Number(process.env.PORT || 5173);
const WATCH = !process.argv.includes('--no-watch');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};
const clients = new Set();
const RELOAD = `<script>new EventSource('/__reload').onmessage=()=>location.reload()</script>`;

async function serve(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  let file = path.join(DIST, p);
  if (!file.startsWith(DIST)) return res.writeHead(403).end();
  try {
    const s = await stat(file);
    if (s.isDirectory()) {
      res.writeHead(301, { Location: url.pathname + '/' });
      return res.end();
    }
  } catch {
    // как nginx: /planirovki → /planirovki/
    try {
      if ((await stat(path.join(DIST, p, 'index.html'))).isFile()) {
        res.writeHead(301, { Location: url.pathname + '/' + url.search });
        return res.end();
      }
    } catch { /* нет */ }
    file = path.join(DIST, '404.html');
    res.statusCode = 404;
  }
  const ext = path.extname(file);
  let body = await readFile(file);
  if (ext === '.html' && WATCH) body = body.toString().replace('</body>', `${RELOAD}</body>`);
  res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.end(body);
}

await buildSite({ dev: WATCH, out: OUT });
http.createServer((q, s) => serve(q, s).catch((e) => { console.error(e); s.writeHead(500).end(); }))
  .listen(PORT, () => console.log(`→ http://localhost:${PORT}${WATCH ? '  (слежу за изменениями)' : ''}`));

if (WATCH) {
  let timer = null;
  let busy = false;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (busy) return rebuild();
      busy = true;
      try {
        await buildSite({ dev: true, out: OUT });
        for (const c of clients) c.write('data: reload\n\n');
      } catch (e) {
        console.error('Ошибка сборки:', e.message);
      }
      busy = false;
    }, 120);
  };
  for (const dir of ['src', 'public']) watch(path.join(ROOT, dir), { recursive: true }, rebuild);
}
