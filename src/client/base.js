// Базовый путь сайта: «/» на radian.kg, «/radian-kg/» на GitHub Pages.
// Подставляется сборкой (scripts/build.mjs, define __BASE__).
/* global __BASE__ */
export const BASE = typeof __BASE__ !== 'undefined' ? __BASE__ : '/';
export const asset = (p) => BASE + String(p).replace(/^\//, '');
// путь страницы без базы: «/radian-kg/planirovki/» → «/planirovki/»
export const route = (pathname) => '/' + pathname.slice(BASE.length).replace(/^\//, '');
