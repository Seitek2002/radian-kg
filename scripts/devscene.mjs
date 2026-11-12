// Сборка отладочной сцены (.preview-dev): node scripts/devscene.mjs
import { build } from 'esbuild';
await build({ entryPoints: ['src/client/scene/_dev.js'], bundle: true, format: 'esm', outfile: '.preview-dev/dev.js', define: { 'import.meta.env.DEV': 'true', __BASE__: '"/"' }, logLevel: 'warning', sourcemap: 'inline' });
console.log('built');
