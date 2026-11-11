// Положение солнца (упрощённый алгоритм NOAA, точность ~0,5°) — для теней
// и инсоляции на модели. Время — бишкекское (UTC+6).
const RAD = Math.PI / 180;
export const BISHKEK_UTC = 6;

export function sunPosition(date, lat, lon) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const g = ((357.529 + 0.98560028 * d) % 360) * RAD;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  const H = ((gmst * 15 + lon) * RAD - ra);
  const la = lat * RAD;
  const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
  let az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H));
  az = (az / RAD + 360) % 360;
  return { azimuth: az, elevation: el / RAD };
}

// Направление НА солнце в координатах сцены (x — восток, z — юг, y — вверх)
export function sunDirection({ azimuth, elevation }) {
  const a = azimuth * RAD;
  const e = elevation * RAD;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}

export function localDate(month, day, hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return new Date(Date.UTC(2026, month, day, h - BISHKEK_UTC, m));
}
