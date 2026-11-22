/* ====================================================================== *
 *  ZEITZONEN-HILFEN                                                       *
 * ====================================================================== */
const _dtfCache = new Map();
function dtf(locale, opts) {
  const key = locale + JSON.stringify(opts);
  if (!_dtfCache.has(key)) {
    try { _dtfCache.set(key, new Intl.DateTimeFormat(locale, opts)); }
    catch (e) { _dtfCache.set(key, new Intl.DateTimeFormat('en', { ...opts, timeZone: undefined })); }
  }
  return _dtfCache.get(key);
}
function tzParts(ms, tz) {
  const p = {};
  for (const x of dtf('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: (+p.hour) % 24, mi: +p.minute, s: +p.second };
}
function tzOffset(ms, tz) {
  const p = tzParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}
function localMidnight(ms, tz) {
  const p = tzParts(ms, tz);
  const base = Date.UTC(p.y, p.m - 1, p.d);
  let guess = base - tzOffset(ms, tz);
  guess = base - tzOffset(guess, tz);
  return guess;
}

/* ====================================================================== *
 *  HILFSFUNKTIONEN                                                        *
 * ====================================================================== */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function hex2rgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgb2hex = (r) => '#' + r.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
function lerpColor(a, b, f) { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * f)); }
function skyColors(alt) {
  if (alt <= SKY[0][0]) return [SKY[0][1], SKY[0][2]];
  for (let i = 1; i < SKY.length; i++) {
    if (alt <= SKY[i][0]) {
      const f = (alt - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]);
      return [lerpColor(SKY[i - 1][1], SKY[i][1], f), lerpColor(SKY[i - 1][2], SKY[i][2], f)];
    }
  }
  const l = SKY[SKY.length - 1];
  return [l[1], l[2]];
}
function band(alt) {
  if (alt < -12) return 0;
  if (alt < -6) return 1;
  if (alt < -4) return 2;
  if (alt < 6) return 3;
  return 4;
}
function crossings(samples, key, thr) {
  const r = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1][key] - thr, b = samples[i][key] - thr;
    if ((a < 0 && b >= 0) || (a >= 0 && b < 0)) {
      const f = a / (a - b);
      r.push({ t: samples[i - 1].t + f * (samples[i].t - samples[i - 1].t), rising: a < 0 });
    }
  }
  return r;
}
const first = (arr, rising) => (arr.find((c) => c.rising === rising) || {}).t;

function auroraLevel(s) {
  // 0 ruhig · 2 mäßig · 3 aktiv · 4 sehr aktiv (Stufen wie im NOAA-Aurora-Dashboard)
  const x = String(s || '').toLowerCase();
  if (/very active|sehr aktiv|zeer actief|très actif|mycket aktiv|svært aktiv|meget aktiv|extreme|severe|extrem|schwer|g[45]\b/.test(x)) return 4;
  if (/strong|stark|moderate storm|g[23]\b/.test(x)) return 3;
  if (/(^|[^a-z])(active|aktiv|actief|actif|aktivt)/.test(x) && !/inactive|inaktiv/.test(x)) return 3;
  if (/moderate|mäßig|matig|modéré|måttlig|moderat|unsettled|unruhig|minor|elevated|erhöht|g1\b/.test(x)) return 2;
  return 0;
}
const AURORA_LEVEL_COLORS = ['var(--slc-sub)', '#e8d44d', '#4DFFB0', '#ff9f43', '#ff5c7a'];
function kpColor(kp) { return kp >= 7 ? '#ff5c7a' : kp >= 5 ? '#ff9f43' : kp >= 4 ? '#e8d44d' : '#4DFFB0'; }

const ICON_PATHS = {};

/* ---------- Mond-Grafik ------------------------------------------------ */
const MARIA = [
  [0.62, -0.30, 0.13, 0.11], [0.50, 0.12, 0.13, 0.16], [0.30, -0.05, 0.17, 0.15],
  [0.18, -0.38, 0.15, 0.14], [-0.25, -0.45, 0.26, 0.22], [-0.55, 0.02, 0.24, 0.36],
  [-0.15, 0.40, 0.17, 0.14], [0.05, 0.12, 0.10, 0.09], [0.32, 0.45, 0.10, 0.08],
];
function moonSvg(cx, cy, r, k, litRot, faceRot, color, opts = {}) {
  const id = 'm' + (++_uid);
  const rx = Math.abs(1 - 2 * k) * r;
  const lit = k < 0.005 ? '' : (k > 0.995
    ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`
    : `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} A ${rx} ${r} 0 0 ${k < 0.5 ? 0 : 1} ${cx} ${cy - r} Z`);
  const dark = lerpColor(color, '#1b2033', 0.82);
  const detail = opts.detail !== false && r >= 10;
  const maria = detail ? MARIA.map(([x, y, a, b]) =>
    `<ellipse cx="${cx + x * r}" cy="${cy + y * r}" rx="${a * r}" ry="${b * r}" />`).join('') : '';
  const tycho = detail ? `<circle cx="${cx - 0.12 * r}" cy="${cy + 0.74 * r}" r="${0.05 * r}" fill="#fff" opacity=".55"/>` : '';
  const glow = opts.glow ? `<circle cx="${cx}" cy="${cy}" r="${r * 1.55}" fill="url(#${id}g)" opacity="${0.25 + 0.6 * k}"/>` : '';
  return `
  <g class="moon">
    <defs>
      <radialGradient id="${id}l" cx="40%" cy="35%" r="75%">
        <stop offset="0%" stop-color="#ffffff"/><stop offset="55%" stop-color="${color}"/>
        <stop offset="100%" stop-color="${lerpColor(color, '#8a93a8', 0.45)}"/>
      </radialGradient>
      <radialGradient id="${id}g"><stop offset="0%" stop-color="${color}" stop-opacity=".55"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/></radialGradient>
      <clipPath id="${id}c"><path d="${lit}" transform="rotate(${litRot} ${cx} ${cy})"/></clipPath>
    </defs>
    ${glow}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${dark}"/>
    ${detail ? `<g transform="rotate(${faceRot} ${cx} ${cy})" fill="#000" opacity=".10">${maria}</g>` : ''}
    ${lit ? `<path d="${lit}" transform="rotate(${litRot} ${cx} ${cy})" fill="url(#${id}l)"/>` : ''}
    ${detail && lit ? `<g clip-path="url(#${id}c)"><g transform="rotate(${faceRot} ${cx} ${cy})" fill="#5c6478" opacity=".28">${maria}</g><g transform="rotate(${faceRot} ${cx} ${cy})">${tycho}</g></g>` : ''}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="${Math.max(0.5, r / 40)}"/>
  </g>`;
}

