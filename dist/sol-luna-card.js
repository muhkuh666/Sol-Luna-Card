/*!
 * Sol & Luna Card – Sonne, Mond & Himmel für Home Assistant
 * MIT © muhkuh666
 */
(() => {
'use strict';

const VERSION = '1.2.1';

/* ====================================================================== *
 *  ASTRONOMIE                                                             *
 * ====================================================================== */
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const AU_KM = 149598000;
const SYNODIC = 29.530589;

const toDays = (ms) => ms / DAY_MS - 0.5 + J1970 - J2000;
const norm360 = (x) => ((x % 360) + 360) % 360;
const { sin, cos, tan, asin, atan2 } = Math;

function obliquity(d) { return RAD * (23.4393 - 0.0000004 * d); }

function eclToEq(l, b, d) {
  const e = obliquity(d);
  return {
    ra: atan2(sin(l) * cos(e) - tan(b) * sin(e), cos(l)),
    dec: asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l)),
  };
}

function siderealTime(d, lw) { return RAD * (280.16 + 360.9856235 * d) - lw; }

function sunEcliptic(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M));
  // Länge des Perihels inkl. Präzession → Länge bezogen auf das Äquinoktium des Datums, minus Aberration
  return { L: M + C + RAD * (102.93735 + 0.0000470684 * d - 0.00569) + Math.PI, M };
}

function moonEcliptic(d) {
  const Lp = RAD * (218.316 + 13.176396 * d);
  const Mp = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const D = RAD * (297.85 + 12.190749 * d);
  const M = RAD * (357.529 + 0.98560028 * d);
  const l = Lp + RAD * (
    6.289 * sin(Mp) + 1.274 * sin(2 * D - Mp) + 0.658 * sin(2 * D) +
    0.214 * sin(2 * Mp) - 0.186 * sin(M) - 0.114 * sin(2 * F) +
    0.059 * sin(2 * D - 2 * Mp) + 0.057 * sin(2 * D - M - Mp) +
    0.053 * sin(2 * D + Mp) + 0.046 * sin(2 * D - M) - 0.041 * sin(M - Mp) -
    0.035 * sin(D) - 0.031 * sin(M + Mp));
  const b = RAD * (5.128 * sin(F) + 0.281 * sin(Mp + F) + 0.278 * sin(Mp - F) + 0.173 * sin(2 * D - F));
  const dist = 385001 - 20905 * cos(Mp) - 3699 * cos(2 * D - Mp) - 2956 * cos(2 * D) - 570 * cos(2 * Mp);
  return { l, b, dist };
}

function horizontal(ra, dec, d, lat, lng) {
  const phi = RAD * lat;
  const H = siderealTime(d, -RAD * lng) - ra;
  const alt = asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
  const az = atan2(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi)) + Math.PI;
  const q = atan2(sin(H), tan(phi) * cos(dec) - sin(dec) * cos(H));
  return { alt, az, H, q };
}

const Astro = {
  sun(ms, lat, lng) {
    const d = toDays(ms);
    const { L } = sunEcliptic(d);
    const eq = eclToEq(L, 0, d);
    const h = horizontal(eq.ra, eq.dec, d, lat, lng);
    return { alt: h.alt * DEG, az: norm360(h.az * DEG), lon: norm360(L * DEG) };
  },
  moon(ms, lat, lng) {
    const d = toDays(ms);
    const m = moonEcliptic(d);
    const eq = eclToEq(m.l, m.b, d);
    const h = horizontal(eq.ra, eq.dec, d, lat, lng);
    const s = sunEcliptic(d);
    const seq = eclToEq(s.L, 0, d);
    // illumination
    const psi = Math.acos(cos(m.b) * cos(m.l - s.L));
    const inc = atan2(AU_KM * sin(psi), m.dist - AU_KM * cos(psi));
    const k = (1 + cos(inc)) / 2;
    const elong = norm360((m.l - s.L) * DEG);
    // position angle of bright limb
    const chi = atan2(cos(seq.dec) * sin(seq.ra - eq.ra),
      sin(seq.dec) * cos(eq.dec) - cos(seq.dec) * sin(eq.dec) * cos(seq.ra - eq.ra));
    const par = asin(6378.14 / m.dist);
    const altTopo = h.alt - par * cos(h.alt);
    return {
      alt: h.alt * DEG, altTopo: altTopo * DEG, az: norm360(h.az * DEG),
      dist: m.dist, k, phase: elong / 360, elong, lon: norm360(m.l * DEG),
      chi: chi * DEG, q: h.q * DEG,
    };
  },
  elongation(ms) {
    const d = toDays(ms);
    return norm360((moonEcliptic(d).l - sunEcliptic(d).L) * DEG);
  },
  sunLon(ms) { return norm360(sunEcliptic(toDays(ms)).L * DEG); },
  /** erste Zeit >= t0, zu der fn(t) (monoton wachsend, mod 360) target überschreitet */
  findCross(fn, target, t0, stepMs, maxSteps) {
    const diff = (t) => ((fn(t) - target + 540) % 360) - 180;
    let a = t0, da = diff(a);
    for (let i = 0; i < maxSteps; i++) {
      const b = a + stepMs, db = diff(b);
      if (da < 0 && db >= 0 && db - da < 120) {
        let lo = a, hi = b;
        for (let j = 0; j < 40; j++) {
          const mid = (lo + hi) / 2;
          if (diff(mid) < 0) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
      }
      a = b; da = db;
    }
    return null;
  },
};

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
 *  TEXTE                                                                  *
 * ====================================================================== */
const STR = {
  de: {
    title: 'Sonne & Mond',
    bands: ['Nacht', 'Dämmerung', 'Blaue Stunde', 'Goldene Stunde', 'Tag'],
    morning: 'Morgen', evening: 'Abend', sunrise: 'Aufgang', sunset: 'Untergang', noon: 'Mittag',
    dayLength: 'Tageslänge', vsYesterday: 'ggü. gestern', golden: 'Goldene Stunde', blue: 'Blaue Stunde',
    illum: 'beleuchtet', ageDays: 'Tage alt', distance: 'Entfernung', zodiac: 'Zeichen',
    moonrise: 'Mondaufgang', moonset: 'Monduntergang', sun: 'Sonne', moon: 'Mond',
    polarNight: 'Polarnacht', midnightSun: 'Mitternachtssonne',
    supermoon: 'Supermond', micromoon: 'Minimond', nextPhases: 'Nächste Phasen',
    longer: 'Tage werden länger', shorter: 'Tage werden kürzer',
    today: 'heute', tomorrow: 'morgen', inDays: (n) => `in ${n} Tagen`, inX: (x) => `in ${x}`,
    notToday: 'heute nicht',
    phases: ['Neumond', 'Zunehmende Sichel', 'Erstes Viertel', 'Zunehmender Mond', 'Vollmond', 'Abnehmender Mond', 'Letztes Viertel', 'Abnehmende Sichel'],
    principal: ['Neumond', 'Erstes Viertel', 'Vollmond', 'Letztes Viertel'],
    seasons: ['Frühlingsanfang', 'Sommersonnenwende', 'Herbstanfang', 'Wintersonnenwende'],
    zodiac12: ['Widder', 'Stier', 'Zwillinge', 'Krebs', 'Löwe', 'Jungfrau', 'Waage', 'Skorpion', 'Schütze', 'Steinbock', 'Wassermann', 'Fische'],
    dirs: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'],
    azimuth: 'Azimut', elevation: 'Höhe',
    aurora: 'Polarlicht', visibility: 'Sichtbarkeit', kp: 'Kp-Index', alert: 'Warnung', alertOn: 'Warnung aktiv',
    on: 'An', off: 'Aus', days3: ['Heute', 'Morgen', 'Übermorgen'],
    maxKp: 'Max. Kp', chanceGood: 'Polarlicht am Nordhorizont möglich', chanceMaybe: 'evtl. mit Kamera sichtbar',
    chanceLow: (n) => `hier unwahrscheinlich (ab ca. Kp ${n})`, source: 'Quelle', loading: 'Lade NOAA-Daten …',
    noaaError: 'NOAA-Daten nicht erreichbar',
    levels: { quiet: 'Ruhig', unsettled: 'Unruhig', active: 'Aktiv', 'minor storm': 'Schwacher Sturm', 'moderate storm': 'Mäßiger Sturm', 'strong storm': 'Starker Sturm', 'severe storm': 'Schwerer Sturm', 'extreme storm': 'Extremer Sturm', storm: 'Sturm' },
    kpWords: ['ruhig', 'ruhig', 'ruhig', 'unruhig', 'aktiv', 'Sturm G1', 'Sturm G2', 'Sturm G3', 'Sturm G4', 'Sturm G5'],
  },
  en: {
    title: 'Sun & Moon',
    bands: ['Night', 'Twilight', 'Blue hour', 'Golden hour', 'Day'],
    morning: 'Morning', evening: 'Evening', sunrise: 'Sunrise', sunset: 'Sunset', noon: 'Solar noon',
    dayLength: 'Day length', vsYesterday: 'vs. yesterday', golden: 'Golden hour', blue: 'Blue hour',
    illum: 'illuminated', ageDays: 'days old', distance: 'Distance', zodiac: 'Sign',
    moonrise: 'Moonrise', moonset: 'Moonset', sun: 'Sun', moon: 'Moon',
    polarNight: 'Polar night', midnightSun: 'Midnight sun',
    supermoon: 'Supermoon', micromoon: 'Micromoon', nextPhases: 'Next phases',
    longer: 'Days are getting longer', shorter: 'Days are getting shorter',
    today: 'today', tomorrow: 'tomorrow', inDays: (n) => `in ${n} days`, inX: (x) => `in ${x}`,
    notToday: 'not today',
    phases: ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'],
    principal: ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'],
    seasons: ['March equinox', 'June solstice', 'September equinox', 'December solstice'],
    zodiac12: ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'],
    dirs: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    azimuth: 'Azimuth', elevation: 'Elevation',
    aurora: 'Aurora', visibility: 'Visibility', kp: 'Kp index', alert: 'Alert', alertOn: 'Alert active',
    on: 'On', off: 'Off', days3: ['Today', 'Tomorrow', 'Day after'],
    maxKp: 'Max Kp', chanceGood: 'aurora possible on the horizon', chanceMaybe: 'maybe visible on camera',
    chanceLow: (n) => `unlikely here (needs ~Kp ${n})`, source: 'Source', loading: 'Loading NOAA data …',
    noaaError: 'NOAA data unavailable',
    levels: { quiet: 'Quiet', unsettled: 'Unsettled', active: 'Active', 'minor storm': 'Minor storm', 'moderate storm': 'Moderate storm', 'strong storm': 'Strong storm', 'severe storm': 'Severe storm', 'extreme storm': 'Extreme storm' },
    kpWords: ['quiet', 'quiet', 'quiet', 'unsettled', 'active', 'storm G1', 'storm G2', 'storm G3', 'storm G4', 'storm G5'],
  },
};
const ZODIAC_SYM = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map((s) => s + '︎');

/* ====================================================================== *
 *  KONFIGURATION                                                          *
 * ====================================================================== */
const DEFAULTS = {
  title: '',
  icon: 'mdi:weather-sunset',
  show_header: true,
  show_status: true,
  show_graph: true,
  show_moon_in_graph: true,
  show_hour_bands: true,
  show_sun_times: true,
  show_moon: true,
  show_next_phases: true,
  show_position: true,
  show_season: true,
  background: 'sky',          // sky | theme | light | dark
  graph_size: 'normal',       // small | normal | large
  graph_sky: true,            // Himmelsverlauf in der Grafik (bei theme/light/dark)
  show_rise_lines: true,
  stars: true,
  animations: true,
  moon_orientation: 'sky',    // sky | simple
  language: 'auto',           // auto | de | en
  time_format: 'auto',        // auto | 24 | 12
  refresh_period: 60,
  sun_color: '#FFC531',
  moon_color: '#E8ECF4',
  golden_color: '#FFA94D',
  blue_color: '#5C7CFA',
  curve_color: '#FFD580',
  moon_curve_color: '#B8C4E0',
  show_aurora: true,
  aurora_effect: true,
  aurora_color: '#4DFFB0',
  aurora_visibility_entity: '',
  aurora_alert_entity: '',
  aurora_kp_entity: '',
  aurora_today_entity: '',
  aurora_today_text_entity: '',
  aurora_tomorrow_entity: '',
  aurora_tomorrow_text_entity: '',
  aurora_day_after_entity: '',
  aurora_day_after_text_entity: '',
  aurora_source: 'auto',       // auto | entities | internet
  aurora_ovation: true,        // Sichtbarkeit aus NOAA-OVATION-Modell laden (~0,9 MB)
  aurora_threshold: 50,        // Warnung ab dieser Sichtbarkeit (%)
  aurora_update_minutes: 15,
  latitude: undefined,
  longitude: undefined,
  time_zone: undefined,
  now: undefined,
};

const SKY = [
  [-18, '#03050d', '#0a1029'],
  [-12, '#060a20', '#161f47'],
  [-6, '#121a46', '#3a3c78'],
  [-3, '#1d295e', '#9a5672'],
  [0, '#2a3c78', '#e08358'],
  [4, '#3b5fa6', '#f2ae66'],
  [8, '#3576c4', '#87bde6'],
  [20, '#2a70c6', '#69b0ea'],
  [60, '#1f6ccf', '#5badef'],
];

/* ====================================================================== *
 *  HILFSFUNKTIONEN                                                        *
 * ====================================================================== */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
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
  const x = String(s || '').toLowerCase();
  if (/extreme|severe|strong|g[345]\b|stark|schwer|extrem/.test(x)) return 4;
  if (/storm|sturm|g[12]\b|minor|moderate/.test(x)) return 3;
  if (/active|aktiv|high|hoch/.test(x) && !/inactive|inaktiv/.test(x)) return 2;
  if (/unsettled|unruhig|elevated|erhöht|mittel/.test(x)) return 1;
  return 0;
}
const AURORA_LEVEL_COLORS = ['var(--slc-sub)', '#e8d44d', '#4DFFB0', '#ff9f43', '#ff5c7a'];
function kpColor(kp) { return kp >= 7 ? '#ff5c7a' : kp >= 5 ? '#ff9f43' : kp >= 4 ? '#e8d44d' : '#4DFFB0'; }

/* ---------- NOAA SWPC (Polarlicht aus dem Internet) ------------------ */
const NOAA_URLS = {
  kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
  ov: 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
};
const NOAA = { kp: {}, ov: {}, listeners: new Set() };
/** Normalisiert alte (Kopfzeile + Arrays) und neue (Objekte) Kp-Formate */
function parseKpRows(json) {
  if (!Array.isArray(json) || !json.length) return [];
  let rows = json;
  if (Array.isArray(json[0])) {
    const head = json[0].map((h) => String(h).toLowerCase());
    rows = json.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
  }
  return rows.map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) o[String(k).toLowerCase()] = v;
    const kpKey = ['kp', 'kp_index', 'estimated_kp', 'kp_value'].find((k) => o[k] != null);
    let tt = String(o.time_tag || o.time || '').trim();
    if (tt && !/([zZ]|[+-]\d\d:?\d\d)$/.test(tt)) tt = tt.replace(' ', 'T') + 'Z';
    return { t: Date.parse(tt), kp: parseFloat(o[kpKey]), type: String(o.observed || o.type || '').toLowerCase() };
  }).filter((r) => Number.isFinite(r.t) && Number.isFinite(r.kp)).sort((a, b) => a.t - b.t);
}
function noaaGet(key, maxAgeMs) {
  const slot = NOAA[key];
  const fresh = slot.ts && Date.now() - slot.ts < maxAgeMs;
  if (fresh || slot.loading) return;
  slot.loading = true;
  fetch(NOAA_URLS[key], { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((json) => {
      if (key === 'kp') slot.data = parseKpRows(json);
      else {
        const grid = new Map();
        for (const c of json.coordinates || []) grid.set(`${Math.round(c[0]) % 360},${Math.round(c[1])}`, c[2]);
        slot.data = { grid, time: Date.parse(json['Forecast Time'] || json['Observation Time'] || '') };
      }
      slot.ts = Date.now(); slot.error = null;
    })
    .catch((e) => { slot.error = String(e.message || e); slot.ts = Date.now() - maxAgeMs + 120000; })
    .finally(() => { slot.loading = false; NOAA.listeners.forEach((fn) => { try { fn(); } catch (e) { /* */ } }); });
}
function kpLevelKey(kp) {
  return kp < 3 ? 'quiet' : kp < 4 ? 'unsettled' : kp < 5 ? 'active' : kp < 6 ? 'minor storm' : kp < 7 ? 'moderate storm' : kp < 8 ? 'strong storm' : kp < 9 ? 'severe storm' : 'extreme storm';
}
/** Faustregel: benötigter Kp für Polarlicht am Horizont bei geogr. Breite (Europa) */
const kpNeeded = (lat) => clamp(Math.round((66 - Math.abs(lat)) / 2), 1, 9);

let _uid = 0;
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

/* ====================================================================== *
 *  KARTE                                                                  *
 * ====================================================================== */
class SolLunaCard extends HTMLElement {
  static getConfigElement() { return document.createElement('sol-luna-card-editor'); }
  static getStubConfig() { return { title: '', background: 'sky' }; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._timer = null;
  }

  setConfig(config) {
    if (!config) throw new Error('Invalid configuration');
    this._config = { ...DEFAULTS, ...config };
    this._render();
    this._restartTimer();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    const key = [hass?.config?.latitude, hass?.config?.longitude, hass?.config?.time_zone,
      hass?.locale?.language || hass?.language, hass?.locale?.time_format].join('|');
    const ak = this._auroraKey();
    if (first || key !== this._hassKey || ak !== this._auroraK) { this._hassKey = key; this._auroraK = ak; this._render(); }
  }

  connectedCallback() {
    this._restartTimer();
    this._noaaListener = this._noaaListener || (() => { if (this._usesInternet) this._render(); });
    NOAA.listeners.add(this._noaaListener);
  }
  disconnectedCallback() { clearInterval(this._timer); this._timer = null; NOAA.listeners.delete(this._noaaListener); }

  _restartTimer() {
    clearInterval(this._timer);
    if (!this.isConnected || !this._config || this._config.now) return;
    const s = Math.max(5, Number(this._config.refresh_period) || 60);
    this._timer = setInterval(() => this._render(), s * 1000);
  }

  getCardSize() {
    const c = this._config || DEFAULTS;
    return 2 + (c.show_graph ? 3 : 0) + (c.show_sun_times ? 2 : 0) + (c.show_moon ? 3 : 0) + (c.show_season || c.show_position ? 1 : 0);
  }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  /* ---------- Einstellungen ableiten ---------------------------------- */
  _lang() {
    const c = this._config;
    let l = c.language && c.language !== 'auto' ? c.language : (this._hass?.locale?.language || this._hass?.language || navigator.language || 'en');
    l = String(l).toLowerCase();
    return { code: l, t: STR[l.slice(0, 2)] || STR.en };
  }
  _hour12() {
    const f = this._config.time_format !== 'auto' ? this._config.time_format : this._hass?.locale?.time_format;
    if (f === '12' || f === 12) return true;
    if (f === '24' || f === 24) return false;
    return undefined;
  }

  /* ---------- Berechnung ---------------------------------------------- */
  _compute() {
    const c = this._config;
    const lat = Number(c.latitude ?? this._hass?.config?.latitude ?? 52.52);
    const lng = Number(c.longitude ?? this._hass?.config?.longitude ?? 13.405);
    const tz = c.time_zone || this._hass?.config?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = c.now ? new Date(c.now).valueOf() : Date.now();

    const start = localMidnight(now, tz);
    const end = localMidnight(start + 30 * 3600000, tz);
    const step = 2 * 60000;
    const samples = [];
    for (let t = start; t <= end + 1; t += step) {
      const s = Astro.sun(t, lat, lng);
      const m = Astro.moon(t, lat, lng);
      samples.push({ t, s: s.alt, m: m.alt, mt: m.altTopo });
    }
    // gestern (nur Sonne) für Tageslängen-Vergleich
    const yStart = localMidnight(start - 12 * 3600000, tz);
    const ySamples = [];
    for (let t = yStart; t <= start + 1; t += step) ySamples.push({ t, s: Astro.sun(t, lat, lng).alt });

    const cr = (thr) => crossings(samples, 's', thr);
    const c083 = cr(-0.833), c6 = cr(6), c4 = cr(-4), c6n = cr(-6);
    let noonIdx = 0;
    samples.forEach((p, i) => { if (p.s > samples[noonIdx].s) noonIdx = i; });
    // parabolische Verfeinerung des Mittags
    let noon = samples[noonIdx].t;
    if (noonIdx > 0 && noonIdx < samples.length - 1) {
      const a = samples[noonIdx - 1].s, b = samples[noonIdx].s, d = samples[noonIdx + 1].s;
      const den = a - 2 * b + d;
      if (den !== 0) noon += clamp(0.5 * (a - d) / den, -1, 1) * step;
    }
    const sunrise = first(c083, true), sunset = first(c083, false);
    const ys = crossings(ySamples, 's', -0.833);
    const yRise = first(ys, true), ySet = first(ys, false);
    const maxAlt = samples[noonIdx].s;
    const minAlt = Math.min(...samples.map((p) => p.s));
    let dayLen = null;
    if (sunrise != null && sunset != null) dayLen = sunset - sunrise;
    else if (minAlt > -0.833) dayLen = DAY_MS;
    else if (maxAlt < -0.833) dayLen = 0;
    let yLen = null;
    if (yRise != null && ySet != null) yLen = ySet - yRise;

    const sunNow = Astro.sun(now, lat, lng);
    const moonNow = Astro.moon(now, lat, lng);

    // Status + Countdown
    const b0 = band(sunNow.alt);
    let nextBand = null, nextBandAt = null;
    for (let t = now + 60000; t < now + 40 * 3600000; t += 60000) {
      const b = band(Astro.sun(t, lat, lng).alt);
      if (b !== b0) { nextBand = b; nextBandAt = t; break; }
    }

    // Mond
    const mr = crossings(samples, 'm', 0.125);
    const moonrise = first(mr, true), moonset = first(mr, false);
    const phases = [0, 90, 180, 270].map((target, i) => {
      const t = Astro.findCross(Astro.elongation, target, now, 6 * 3600000, 140);
      return t == null ? null : { i, t, dist: i === 2 || i === 0 ? Astro.moon(t, lat, lng).dist : null };
    }).filter(Boolean).sort((a, b) => a.t - b.t);
    const seasons = [0, 90, 180, 270].map((target, i) => {
      const t = Astro.findCross(Astro.sunLon, target, now, DAY_MS, 372);
      return t == null ? null : { i, t };
    }).filter(Boolean).sort((a, b) => a.t - b.t);

    return {
      lat, lng, tz, now, start, end, samples, sunrise, sunset, noon, maxAlt, minAlt, dayLen, yLen,
      civilDawn: first(c6n, true), civilDusk: first(c6n, false),
      blueStartM: first(c6n, true), blueEndM: first(c4, true), goldenEndM: first(c6, true),
      goldenStartE: first(c6, false), goldenEndE: first(c4, false), blueEndE: first(c6n, false),
      sunNow, moonNow, b0, nextBand, nextBandAt, moonrise, moonset, phases, season: seasons[0],
    };
  }

  /* ---------- Formatierung -------------------------------------------- */
  _fmt(D) {
    const { code } = this._lang();
    const tz = D.tz, h12 = this._hour12();
    const time = (ms) => ms == null ? '—' : dtf(code, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: h12 }).format(new Date(ms));
    const date = (ms) => dtf(code, { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(ms));
    const num = (x, d = 0) => new Intl.NumberFormat(code, { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
    const dur = (ms) => {
      const m = Math.round(Math.abs(ms) / 60000);
      const h = Math.floor(m / 60), mm = m % 60;
      if (h >= 48) return `${Math.round(h / 24)} d`;
      return h ? `${h} h ${String(mm).padStart(2, '0')} min` : `${mm} min`;
    };
    const delta = (ms) => {
      const s = Math.round(ms / 1000), a = Math.abs(s);
      const sign = s > 0 ? '+' : s < 0 ? '−' : '±';
      const m = Math.floor(a / 60), ss = a % 60;
      return m ? `${sign}${m} min ${String(ss).padStart(2, '0')} s` : `${sign}${ss} s`;
    };
    return { time, date, num, dur, delta };
  }

  /* ---------- Rendering ----------------------------------------------- */
  _render() {
    if (!this._config) return;
    let D;
    try { D = this._compute(); } catch (e) { console.error('sol-luna-card', e); return; }
    const c = this._config;
    const { t } = this._lang();
    const F = this._fmt(D);
    const mode = ['sky', 'theme', 'light', 'dark'].includes(c.background) ? c.background : 'sky';
    const sky = mode === 'sky';
    const [skyTop, skyBottom] = skyColors(D.sunNow.alt);
    const night = clamp((-D.sunNow.alt - 3) / 9, 0, 1);
    const anim = c.animations;

    const moonRot = this._moonRotation(D);

    const header = c.show_header ? `
      <div class="header">
        <div class="title">${c.icon ? `<ha-icon icon="${esc(c.icon)}"></ha-icon>` : ''}<span>${esc(c.title || t.title)}</span></div>
        ${c.show_status ? this._statusHtml(D, t, F) : ''}
      </div>` : '';

    const graph = c.show_graph ? this._graphHtml(D, t, F, sky, moonRot) : '';
    const sunTimes = c.show_sun_times ? this._sunTimesHtml(D, t, F) : '';
    const moon = c.show_moon ? this._moonHtml(D, t, F, moonRot) : '';
    const footer = (c.show_position || c.show_season) ? this._footerHtml(D, t, F) : '';
    const A = this._auroraData(D, t, F);
    const aurora = A ? this._auroraHtml(A, t, F) : '';
    const auroraSky = A && (sky || mode === 'dark') && c.aurora_effect ? this._auroraSkyHtml(this._auroraIntensity(A) * (sky ? 1 : 0.7), night) : '';

    const stars = (sky || mode === 'dark') && c.stars && night > 0 ? this._starsHtml(night * (sky ? 1 : 0.5), anim) : '';

    this.shadowRoot.innerHTML = `
      <style>${this._css()}</style>
      <ha-card class="${mode} ${anim ? 'anim' : ''}" style="
        --slc-sun:${esc(c.sun_color)}; --slc-moon:${esc(c.moon_color)}; --slc-golden:${esc(c.golden_color)};
        --slc-blue:${esc(c.blue_color)}; --slc-curve:${esc(c.curve_color)}; --slc-aurora:${esc(c.aurora_color)};
        ${sky ? `--slc-sky-top:${skyTop}; --slc-sky-bottom:${skyBottom};` : ''}">
        ${sky ? '<div class="skybg"></div>' : ''}
        ${stars}
        ${auroraSky}
        <div class="content">${header}${graph}${sunTimes}${moon}${aurora}${footer}</div>
      </ha-card>`;
    this.shadowRoot.querySelectorAll('[data-entity]').forEach((el) => el.addEventListener('click', () => {
      if (el.dataset.entity.startsWith('noaa:')) {
        window.open(el.dataset.entity === 'noaa:ov' ? 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast' : 'https://www.swpc.noaa.gov/products/planetary-k-index', '_blank', 'noopener');
        return;
      }
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: el.dataset.entity }, bubbles: true, composed: true }));
    }));
  }

  _moonRotation(D) {
    const m = D.moonNow;
    if (this._config.moon_orientation === 'simple') {
      const south = D.lat < 0;
      const waxing = m.phase < 0.5;
      const lit = (waxing ? 0 : 180) + (south ? 180 : 0);
      return { lit, face: south ? 180 : 0 };
    }
    // Himmelsansicht: heller Rand zeigt zur Sonne, Mondgesicht nach parallaktischem Winkel gedreht
    return { lit: -(m.chi - m.q) - 90, face: m.q };
  }

  /* ---------- Polarlicht ---------------------------------------------- */
  _auroraEntities() {
    const c = this._config, st = this._hass?.states;
    if (!st || !c.show_aurora) return null;
    const txt = (id) => (id + ' ' + (st[id]?.attributes?.friendly_name || '')).toLowerCase();
    const all = Object.keys(st);
    const aur = all.filter((id) => /^(sensor|binary_sensor)\./.test(id) && /aurora|polarlicht|nordlicht/.test(txt(id)));
    const manual = (k) => (c[k] && st[c[k]] ? c[k] : null);
    const res = {};
    res.vis = manual('aurora_visibility_entity') || aur.find((id) => id.startsWith('sensor.') &&
      /visib|sichtbar/.test(txt(id)) && st[id].attributes?.unit_of_measurement === '%') || null;
    res.alert = manual('aurora_alert_entity') || aur.find((id) => id.startsWith('binary_sensor.')) || null;
    res.kp = manual('aurora_kp_entity') || all.find((id) => id.startsWith('sensor.') && /(^|[^a-z])kp?[\s_-]?index/.test(txt(id))) || null;
    const dayRe = [
      (x) => /today|heute|day_?0/.test(x),
      (x) => (/tomorrow|morgen|day_?1/.test(x)) && !/übermorgen|uebermorgen|ubermorgen|day_after|day after/.test(x),
      (x) => /übermorgen|uebermorgen|ubermorgen|day_after|day after|day_?2/.test(x),
    ];
    const keys = ['today', 'tomorrow', 'day_after'];
    res.days = keys.map((k, i) => {
      const cand = aur.filter((id) => id.startsWith('sensor.') && dayRe[i](txt(id)));
      const short = cand.filter((id) => String(st[id].state).length <= 24 && !/forecast_text|description|beschreibung/.test(id));
      const long = cand.filter((id) => !short.includes(id));
      return {
        level: manual(`aurora_${k}_entity`) || short[0] || null,
        text: manual(`aurora_${k}_text_entity`) || long[0] || null,
      };
    });
    const any = res.vis || res.alert || res.kp || res.days.some((d) => d.level || d.text);
    return any ? res : null;
  }

  _auroraKey() {
    const e = this._config && this._auroraEntities();
    if (!e) return '';
    const st = this._hass.states;
    return [e.vis, e.alert, e.kp, ...e.days.flatMap((d) => [d.level, d.text])].map((id) => (id ? st[id]?.state : '')).join('|');
  }

  _auroraData(D, t, F) {
    const c = this._config;
    this._usesInternet = false;
    if (!c.show_aurora) return null;
    const ents = c.aurora_source === 'internet' ? null : this._auroraEntities();
    if (!ents && c.aurora_source !== 'entities') { this._usesInternet = true; return this._auroraInternet(D, t, F); }
    const e = ents;
    if (!e) return null;
    const st = this._hass.states;
    const n = (id) => { const v = parseFloat(id ? st[id]?.state : NaN); return Number.isFinite(v) ? v : null; };
    return {
      e,
      vis: n(e.vis),
      alert: e.alert ? st[e.alert]?.state === 'on' : null,
      kp: n(e.kp),
      days: e.days.map((d) => ({ ...d, levelState: d.level ? st[d.level]?.state : null, textState: d.text ? st[d.text]?.state : null })),
    };
  }

  _auroraInternet(D, t, F) {
    const c = this._config;
    const maxAge = Math.max(5, Number(c.aurora_update_minutes) || 15) * 60000;
    noaaGet('kp', maxAge);
    if (c.aurora_ovation) noaaGet('ov', maxAge);
    const kpRows = NOAA.kp.data || [];
    const ov = c.aurora_ovation ? NOAA.ov.data : null;
    const need = kpNeeded(D.lat);
    // aktueller Kp: letzter beobachteter/geschätzter Wert vor jetzt
    const past = kpRows.filter((r) => r.t <= D.now && r.type !== 'predicted');
    const kpNow = past.length ? past[past.length - 1].kp : (kpRows.filter((r) => r.t <= D.now).pop()?.kp ?? null);
    // Sichtbarkeit am Standort (OVATION, nächster Gitterpunkt)
    let vis = null;
    if (ov) {
      const lon = ((Math.round(D.lng) % 360) + 360) % 360, lat = Math.round(D.lat);
      const v = ov.grid.get(`${lon},${lat}`);
      vis = v == null ? 0 : v;
    }
    const alert = (vis != null && vis >= (Number(c.aurora_threshold) || 50)) || (kpNow != null && kpNow >= need);
    // 3-Tage-Vorhersage: maximaler Kp pro Kalendertag (lokale Zeit)
    const d0 = localMidnight(D.now, D.tz);
    const days = [0, 1, 2].map((i) => {
      const a = localMidnight(d0 + i * DAY_MS + 3 * 3600000, D.tz), b = localMidnight(a + 27 * 3600000, D.tz);
      const r = kpRows.filter((x) => x.t >= a && x.t < b);
      if (!r.length) return { level: null, text: null };
      const mx = Math.max(...r.map((x) => x.kp));
      const chance = mx >= need ? t.chanceGood : mx >= need - 1.5 ? t.chanceMaybe : t.chanceLow(need);
      return { level: 'noaa:kp', text: 'noaa:kp', levelState: kpLevelKey(mx), textState: `${t.maxKp} ${F.num(mx, 1)} · ${chance}` };
    });
    const loading = !NOAA.kp.data && !NOAA.kp.error;
    return {
      e: { vis: ov || c.aurora_ovation ? 'noaa:ov' : null, alert: 'noaa:alert', kp: 'noaa:kp', days },
      vis, alert, kp: kpNow, days, internet: true, loading,
      error: NOAA.kp.error && !NOAA.kp.data ? NOAA.kp.error : null,
      updated: NOAA.kp.ts || null,
    };
  }

  _auroraIntensity(A) {
    if (!A) return 0;
    let a = 0;
    if (A.vis != null) a = Math.max(a, A.vis / 35);
    if (A.alert) a = Math.max(a, 0.8);
    if (A.kp != null && A.kp >= 5) a = Math.max(a, (A.kp - 4) / 4);
    return clamp(a, 0, 1);
  }

  _auroraHtml(A, t, F) {
    const c = this._config;
    const tr = (s) => {
      if (s == null || s === 'unknown' || s === 'unavailable') return '—';
      return t.levels[String(s).toLowerCase()] || s;
    };
    const stats = [];
    if (A.e.vis) {
      const v = clamp(A.vis ?? 0, 0, 100);
      const R = 15, C = 2 * Math.PI * R;
      stats.push(`<div class="astat" data-entity="${esc(A.e.vis)}">
        <svg viewBox="0 0 40 40" class="ring"><circle cx="20" cy="20" r="${R}" class="ringbg"/>
          <circle cx="20" cy="20" r="${R}" class="ringfg" stroke-dasharray="${(C * v / 100).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 20 20)"/></svg>
        <div><div class="aval">${A.vis == null ? '—' : F.num(A.vis) + ' %'}</div><div class="albl">${esc(t.visibility)}</div></div></div>`);
    }
    if (A.e.kp) {
      const kp = A.kp;
      const segs = Array.from({ length: 9 }, (_, i) => `<span class="seg" style="${kp != null && kp >= i + 0.5 ? `background:${kpColor(i + 1)}` : ''}"></span>`).join('');
      stats.push(`<div class="astat kpstat" data-entity="${esc(A.e.kp)}">
        <div><div class="aval">${kp == null ? '—' : F.num(kp, 1)} <span class="kpw" style="color:${kp == null ? 'inherit' : kpColor(kp)}">${kp == null ? '' : esc(t.kpWords[clamp(Math.round(kp), 0, 9)])}</span></div>
        <div class="kpbar">${segs}</div><div class="albl">${esc(t.kp)}</div></div></div>`);
    }
    if (A.e.alert) {
      stats.push(`<div class="astat" data-entity="${esc(A.e.alert)}"><ha-icon icon="${A.alert ? 'mdi:alert' : 'mdi:shield-check-outline'}" class="${A.alert ? 'alerton' : ''}"></ha-icon>
        <div><div class="aval">${A.alert ? esc(t.on) : esc(t.off)}</div><div class="albl">${esc(t.alert)}</div></div></div>`);
    }
    const hasDays = A.days.some((d) => d.level || d.text);
    const days = hasDays ? `<div class="adays">${A.days.map((d, i) => {
      if (!d.level && !d.text) return '';
      const lvl = auroraLevel(d.levelState || d.textState);
      const col = AURORA_LEVEL_COLORS[lvl];
      return `<div class="aday" data-entity="${esc(d.level || d.text)}">
        <div class="adayh">${esc(t.days3[i])}</div>
        ${d.level ? `<span class="chip" style="--chip:${col}">${esc(tr(d.levelState))}</span>` : ''}
        ${d.text ? `<div class="atext" title="${esc(d.textState)}">${esc(tr(d.textState))}</div>` : ''}
      </div>`;
    }).join('')}</div>` : '';
    const src = A.internet ? `<div class="asrc">${A.error ? `⚠ ${esc(t.noaaError)}` : A.loading ? esc(t.loading) : `${esc(t.source)}: NOAA SWPC${A.updated ? ` · ${F.time(A.updated)}` : ''}`}</div>` : '';
    return `
    <div class="aurorabox">
      <div class="ahead"><ha-icon icon="mdi:star-shooting"></ha-icon><span>${esc(t.aurora)}</span>
        ${A.alert ? `<span class="badge alertbadge">${esc(t.alertOn)}</span>` : ''}</div>
      ${stats.length ? `<div class="astats">${stats.join('')}</div>` : ''}
      ${days}
      ${src}
    </div>`;
  }

  _auroraSkyHtml(intensity, night) {
    const o = clamp(intensity * Math.max(night, 0), 0, 1);
    if (o < 0.04) return '';
    return `<div class="aurorasky" style="opacity:${o.toFixed(2)}"><i></i><i></i><i></i></div>`;
  }

  _statusHtml(D, t, F) {
    const icons = ['mdi:weather-night', 'mdi:weather-night-partly-cloudy', 'mdi:circle-half-full', 'mdi:camera-iris', 'mdi:white-balance-sunny'];
    const next = D.nextBandAt ? `<span class="sub">${esc(t.bands[D.nextBand])} ${esc(t.inX(F.dur(D.nextBandAt - D.now)))}</span>` : '';
    return `<div class="status b${D.b0}"><ha-icon icon="${icons[D.b0]}"></ha-icon><div><span class="main">${esc(t.bands[D.b0])}</span>${next}</div></div>`;
  }

  _graphHtml(D, t, F, sky, rot) {
    const c = this._config;
    const above = { small: 52, normal: 80, large: 110 }[c.graph_size] || 80;
    const below = Math.round(above * 0.42);
    const W = 400, padX = 6, top = 16, H = top + above + below + 20;
    const hy = top + above;
    const span = D.end - D.start;
    const x = (ms) => padX + (ms - D.start) / span * (W - 2 * padX);
    const moonVals = c.show_moon_in_graph ? D.samples.map((p) => p.mt) : [];
    const yMax = Math.max(15, D.maxAlt, ...moonVals) + 4;
    const yMin = Math.max(15, -D.minAlt, ...moonVals.map((v) => -v)) + 2;
    const y = (alt) => alt >= 0 ? hy - alt / yMax * above : hy - alt / yMin * below;
    const S = D.samples;
    const pts = (key) => S.filter((_, i) => i % 3 === 0 || i === S.length - 1).map((p) => `${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');

    // Bänder (goldene / blaue Stunde)
    let bands = '';
    if (c.show_hour_bands) {
      const runs = (lo, hi) => {
        const r = []; let s0 = null;
        S.forEach((p, i) => {
          const inside = p.s >= lo && p.s < hi;
          if (inside && s0 == null) s0 = p.t;
          if ((!inside || i === S.length - 1) && s0 != null) { r.push([s0, p.t]); s0 = null; }
        });
        return r;
      };
      const rect = (a, b, col, op) => `<rect x="${x(a).toFixed(1)}" y="${top - 6}" width="${Math.max(0.5, x(b) - x(a)).toFixed(1)}" height="${above + below + 6}" fill="${col}" opacity="${op}" rx="2"/>`;
      bands = runs(-4, 6).map(([a, b]) => rect(a, b, 'var(--slc-golden)', 0.22)).join('') +
              runs(-6, -4).map(([a, b]) => rect(a, b, 'var(--slc-blue)', 0.3)).join('');
    }

    // Vergangenheits-Fläche der Sonne
    const nowX = x(D.now);
    const area = `M ${x(S[0].t).toFixed(1)},${hy} ` + S.filter((_, i) => i % 3 === 0).map((p) => `L ${x(p.t).toFixed(1)},${Math.min(hy, y(p.s)).toFixed(1)}`).join(' ') + ` L ${x(S[S.length - 1].t).toFixed(1)},${hy} Z`;

    // Achsen
    let ticks = '';
    const hourMs = 3600000;
    for (let i = 0; i <= 24; i += 1) {
      const tt = D.start + i * hourMs;
      if (tt > D.end) break;
      const major = i % 6 === 0;
      ticks += `<line x1="${x(tt)}" x2="${x(tt)}" y1="${hy - (major ? 4 : 2)}" y2="${hy + (major ? 4 : 2)}" class="tick"/>`;
      if (major) ticks += `<text x="${clamp(x(tt), 10, W - 10)}" y="${H - 1}" class="axis">${F.time(tt)}</text>`;
    }

    const sx = nowX, syv = y(D.sunNow.alt);
    const sunUp = D.sunNow.alt > -0.833;
    const mx = nowX, myv = y(D.moonNow.altTopo);
    const lines = !c.show_rise_lines ? '' : [D.sunrise, D.sunset].filter((v) => v != null).map((v) =>
      `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${hy}" class="riseline"/>`).join('');

    const [st, sb] = skyColors(D.sunNow.alt);
    const chartBg = sky || !c.graph_sky ? '' : `<rect x="0" y="0" width="${W}" height="${hy + below}" rx="10" fill="url(#bgsky)"/>`;

    return `
    <div class="graph">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(t.sun)} / ${esc(t.moon)}">
        <defs>
          <linearGradient id="bgsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${st}"/><stop offset="1" stop-color="${sb}"/></linearGradient>
          <linearGradient id="pastfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--slc-curve)" stop-opacity=".55"/><stop offset="1" stop-color="var(--slc-curve)" stop-opacity=".05"/></linearGradient>
          <clipPath id="past"><rect x="0" y="0" width="${nowX}" height="${hy}"/></clipPath>
          <filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="5"/></filter>
          <radialGradient id="sungrad"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="var(--slc-sun)"/><stop offset="1" stop-color="var(--slc-sun)"/></radialGradient>
        </defs>
        ${chartBg}
        ${bands}
        <rect x="0" y="${hy}" width="${W}" height="${below + 2}" class="below"/>
        <path d="${area}" fill="url(#pastfill)" clip-path="url(#past)"/>
        ${lines}
        ${c.show_moon_in_graph ? `<polyline points="${pts('mt')}" class="mooncurve" style="stroke:${esc(c.moon_curve_color)}"/>` : ''}
        <polyline points="${pts('s')}" class="suncurve"/>
        <line x1="0" x2="${W}" y1="${hy}" y2="${hy}" class="horizon"/>
        ${ticks}
        <line x1="${nowX}" x2="${nowX}" y1="${top - 6}" y2="${hy + below}" class="nowline"/>
        ${c.show_moon_in_graph ? `<g opacity="${D.moonNow.altTopo > 0 ? 1 : 0.55}">${moonSvg(mx, myv, 7, D.moonNow.k, rot.lit, rot.face, c.moon_color, { detail: false, glow: true })}</g>` : ''}
        <g opacity="${sunUp ? 1 : 0.6}" class="sunmark">
          <circle cx="${sx}" cy="${syv}" r="13" fill="var(--slc-sun)" filter="url(#glow)" opacity=".9" class="sunglow"/>
          <circle cx="${sx}" cy="${syv}" r="7" fill="url(#sungrad)"/>
        </g>
      </svg>
    </div>`;
  }

  _sunTimesHtml(D, t, F) {
    const range = (a, b) => (a == null && b == null) ? '—' : `${F.time(a)}–${F.time(b)}`;
    const row = (icon, label, val, cls = '', when = null) => {
      const past = when != null && when < D.now ? ' past' : '';
      return `<div class="row ${cls}${past}"><ha-icon icon="${icon}"></ha-icon><span class="lbl">${esc(label)}</span><span class="val">${val}</span></div>`;
    };
    let center;
    if (D.dayLen === DAY_MS) center = `<div class="big">${esc(t.midnightSun)}</div>`;
    else if (D.dayLen === 0) center = `<div class="big">${esc(t.polarNight)}</div>`;
    else center = `<div class="big">${F.dur(D.dayLen || 0)}</div>`;
    const deltaMs = D.dayLen != null && D.yLen != null ? D.dayLen - D.yLen : null;
    const delta = deltaMs != null ? `<div class="delta ${deltaMs >= 0 ? 'up' : 'down'}">${F.delta(deltaMs)} ${esc(t.vsYesterday)}</div>` : '';
    return `
    <div class="suntimes">
      <div class="col">
        <div class="colhead">${esc(t.morning)}</div>
        ${row('mdi:circle-half-full', t.blue, range(D.blueStartM, D.blueEndM), 'blue', D.blueEndM)}
        ${row('mdi:camera-iris', t.golden, range(D.blueEndM, D.goldenEndM), 'golden', D.goldenEndM)}
        ${row('mdi:weather-sunset-up', t.sunrise, F.time(D.sunrise), 'strong', D.sunrise)}
      </div>
      <div class="mid">
        <div class="colhead">${esc(t.dayLength)}</div>
        ${center}${delta}
        <div class="noon"><ha-icon icon="mdi:white-balance-sunny"></ha-icon>${esc(t.noon)} ${F.time(D.noon)} · ${F.num(D.maxAlt, 1)}°</div>
      </div>
      <div class="col right">
        <div class="colhead">${esc(t.evening)}</div>
        ${row('mdi:weather-sunset-down', t.sunset, F.time(D.sunset), 'strong', D.sunset)}
        ${row('mdi:camera-iris', t.golden, range(D.goldenStartE, D.goldenEndE), 'golden', D.goldenEndE)}
        ${row('mdi:circle-half-full', t.blue, range(D.goldenEndE, D.blueEndE), 'blue', D.blueEndE)}
      </div>
    </div>`;
  }

  _moonHtml(D, t, F, rot) {
    const c = this._config;
    const m = D.moonNow;
    const p = m.phase;
    const idx = p < 0.0339 || p > 0.9661 ? 0 : p < 0.2161 ? 1 : p < 0.2839 ? 2 : p < 0.4661 ? 3 : p < 0.5339 ? 4 : p < 0.7161 ? 5 : p < 0.7839 ? 6 : 7;
    const age = p * SYNODIC;
    const z = Math.floor(m.lon / 30) % 12;
    const moonBig = `<svg viewBox="0 0 100 100" class="bigmoon">${moonSvg(50, 50, 36, m.k, rot.lit, rot.face, c.moon_color, { glow: true })}</svg>`;
    const south = D.lat < 0;
    const phaseIcon = (i) => {
      const k = [0, 0.5, 1, 0.5][i];
      const lit = (i === 3 ? 180 : 0) + (south ? 180 : 0);
      return `<svg viewBox="0 0 20 20" class="phaseicon">${moonSvg(10, 10, 8, k, lit, 0, c.moon_color, { detail: false })}</svg>`;
    };
    const rel = (ms) => {
      const d0 = localMidnight(D.now, D.tz), d1 = localMidnight(ms, D.tz);
      const days = Math.round((d1 - d0) / DAY_MS);
      return days === 0 ? t.today : days === 1 ? t.tomorrow : t.inDays(days);
    };
    const next = c.show_next_phases ? `
      <div class="phases">
        ${D.phases.map((ph) => {
          let badge = '';
          if (ph.i === 2 && ph.dist < 361000) badge = `<span class="badge super">${esc(t.supermoon)}</span>`;
          if (ph.i === 2 && ph.dist > 404000) badge = `<span class="badge micro">${esc(t.micromoon)}</span>`;
          return `<div class="ph">${phaseIcon(ph.i)}<div><div class="phn">${esc(t.principal[ph.i])}${badge}</div>
            <div class="phd">${esc(F.date(ph.t))} · ${F.time(ph.t)} <span class="rel">(${esc(rel(ph.t))})</span></div></div></div>`;
        }).join('')}
      </div>` : '';
    const riseSet = (ms) => ms == null ? `<span class="dim">${esc(t.notToday)}</span>` : F.time(ms);
    return `
    <div class="moonbox">
      <div class="moonrow">
        ${moonBig}
        <div class="moontext">
          <div class="phasename">${esc(t.phases[idx])}</div>
          <div class="illum"><b>${F.num(m.k * 100)} %</b> ${esc(t.illum)} · ${F.num(age, 1)} ${esc(t.ageDays)}</div>
          <div class="grid2">
            <div><ha-icon icon="mdi:arrow-up-thin"></ha-icon>${esc(t.moonrise)}</div><div class="v">${riseSet(D.moonrise)}</div>
            <div><ha-icon icon="mdi:arrow-down-thin"></ha-icon>${esc(t.moonset)}</div><div class="v">${riseSet(D.moonset)}</div>
            <div><ha-icon icon="mdi:map-marker-distance"></ha-icon>${esc(t.distance)}</div><div class="v">${F.num(Math.round(m.dist / 100) * 100)} km</div>
            <div><ha-icon icon="mdi:zodiac-${['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'][z]}"></ha-icon>${esc(t.zodiac)}</div><div class="v">${ZODIAC_SYM[z]} ${esc(t.zodiac12[z])}</div>
          </div>
        </div>
      </div>
      ${next}
    </div>`;
  }

  _footerHtml(D, t, F) {
    const c = this._config;
    const dir = (az) => t.dirs[Math.round(az / 45) % 8];
    const parts = [];
    if (c.show_position) {
      parts.push(`<span><ha-icon icon="mdi:white-balance-sunny"></ha-icon>${F.num(D.sunNow.az)}° ${dir(D.sunNow.az)} · ${F.num(D.sunNow.alt, 1)}°</span>`);
      parts.push(`<span><ha-icon icon="mdi:moon-waning-crescent"></ha-icon>${F.num(D.moonNow.az)}° ${dir(D.moonNow.az)} · ${F.num(D.moonNow.altTopo, 1)}°</span>`);
    }
    if (c.show_season && D.season) {
      const idx = D.lat < 0 ? (D.season.i + 2) % 4 : D.season.i;
      const days = Math.round((localMidnight(D.season.t, D.tz) - localMidnight(D.now, D.tz)) / DAY_MS);
      const when = days === 0 ? t.today : days === 1 ? t.tomorrow : t.inDays(days);
      const icon = ['mdi:flower', 'mdi:white-balance-sunny', 'mdi:leaf-maple', 'mdi:snowflake'][idx];
      parts.push(`<span class="season" title="${esc(F.date(D.season.t))} ${F.time(D.season.t)}"><ha-icon icon="${icon}"></ha-icon>${esc(t.seasons[idx])} ${esc(when)}</span>`);
    }
    return `<div class="footer">${parts.join('')}</div>`;
  }

  _starsHtml(night, anim) {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let s = '';
    for (let i = 0; i < 70; i++) {
      const x = rnd() * 100, y = rnd() * 100, r = 0.3 + rnd() * 0.9, d = (rnd() * 4).toFixed(2);
      s += `<circle cx="${x.toFixed(2)}%" cy="${y.toFixed(2)}%" r="${r.toFixed(2)}" style="animation-delay:-${d}s"/>`;
    }
    const shoot = anim && night > 0.7 ? '<div class="shoot"></div>' : '';
    return `<svg class="stars" style="opacity:${night.toFixed(2)}" width="100%" height="100%">${s}</svg>${shoot}`;
  }

  _css() {
    return `
    :host { display:block; }
    ha-card { display:block; position:relative; overflow:hidden; padding:14px 14px 12px; border-radius:var(--ha-card-border-radius, 16px); }
    ha-card.sky { color:#fff; --slc-text:#fff; --slc-sub:rgba(255,255,255,.75); --slc-tile:rgba(8,14,40,.24); --slc-line:rgba(255,255,255,.16);
      text-shadow:0 1px 2px rgba(0,0,20,.35); border:none; background:transparent; }
    ha-card.theme { --slc-text:var(--primary-text-color); --slc-sub:var(--secondary-text-color); --slc-tile:rgba(127,127,127,.09); --slc-line:var(--divider-color, rgba(127,127,127,.25)); }
    ha-card.light { --slc-text:#1c2333; --slc-sub:#5d6678; --slc-tile:rgba(30,50,90,.05); --slc-line:rgba(30,50,90,.11);
      background:#f6f8fc; color:#1c2333; border:1px solid rgba(30,50,90,.08); }
    ha-card.dark { --slc-text:#eef1f8; --slc-sub:#9aa3b8; --slc-tile:rgba(255,255,255,.045); --slc-line:rgba(255,255,255,.09);
      background:#131722; color:#eef1f8; border:1px solid rgba(255,255,255,.05); }
    .light .graph .horizon, .light .graph .tick { stroke:rgba(30,50,90,.35); }
    .light .graph .nowline { stroke:rgba(30,50,90,.45); }
    .light .graph .riseline { stroke:rgba(30,50,90,.25); }
    .skybg { position:absolute; inset:0; background:linear-gradient(180deg, var(--slc-sky-top) 0%, var(--slc-sky-bottom) 100%); transition:background 2s; }
    .stars { position:absolute; inset:0; pointer-events:none; }
    .stars circle { fill:#fff; }
    .anim .stars circle { animation:twinkle 4s ease-in-out infinite; }
    @keyframes twinkle { 0%,100%{opacity:.9} 50%{opacity:.25} }
    .shoot { position:absolute; top:12%; left:70%; width:90px; height:1.5px; background:linear-gradient(90deg,#fff,transparent);
      transform:rotate(-25deg); opacity:0; animation:shoot 11s linear infinite 3s; pointer-events:none; }
    @keyframes shoot { 0%{opacity:0; transform:translate(0,0) rotate(-25deg)} 2%{opacity:1} 6%{opacity:0; transform:translate(-260px,120px) rotate(-25deg)} 100%{opacity:0} }
    .content { position:relative; display:flex; flex-direction:column; gap:12px; }
    ha-icon { --mdc-icon-size:16px; width:16px; height:16px; flex:none; }
    .header { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .title { display:flex; align-items:center; gap:8px; font-size:1.15em; font-weight:600; letter-spacing:.2px; color:var(--slc-text); }
    .title ha-icon { --mdc-icon-size:22px; width:22px; height:22px; color:var(--slc-sun); }
    .status { display:flex; align-items:center; gap:8px; padding:5px 11px 5px 9px; border-radius:999px; background:var(--slc-tile);
      border:1px solid var(--slc-line); font-size:.85em; line-height:1.15; }
    .status ha-icon { --mdc-icon-size:18px; width:18px; height:18px; }
    .status .main { display:block; font-weight:600; color:var(--slc-text); }
    .status .sub { display:block; font-size:.85em; color:var(--slc-sub); }
    .status.b3 ha-icon { color:var(--slc-golden); } .status.b2 ha-icon { color:var(--slc-blue); }
    .status.b4 ha-icon { color:var(--slc-sun); } .status.b0 ha-icon, .status.b1 ha-icon { color:var(--slc-moon); }
    .anim .status.b3 { animation:pulse 3s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,169,77,.0)} 50%{box-shadow:0 0 14px 2px rgba(255,169,77,.45)} }
    .graph svg { width:100%; display:block; overflow:visible; }
    .graph .below { fill:rgba(0,0,20,.18); }
    .theme .graph .below, .dark .graph .below { fill:rgba(0,0,20,.25); } .light .graph .below { fill:rgba(30,50,90,.06); }
    .graph .horizon { stroke:rgba(255,255,255,.55); stroke-width:1; }
    .graph .tick { stroke:rgba(255,255,255,.55); stroke-width:1; }
    .graph .axis { fill:var(--slc-sub); font-size:9px; text-anchor:middle; }
    .theme .graph .axis { fill:var(--slc-sub); }
    .graph .suncurve { fill:none; stroke:var(--slc-curve); stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }
    .graph .mooncurve { fill:none; stroke-width:1.4; stroke-dasharray:3 3; opacity:.85; }
    .graph .nowline { stroke:rgba(255,255,255,.55); stroke-width:1; stroke-dasharray:2 3; }
    .graph .riseline { stroke:rgba(255,255,255,.28); stroke-width:1; stroke-dasharray:1 3; }
    .anim .sunglow { animation:sunpulse 4s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
    @keyframes sunpulse { 0%,100%{transform:scale(1); opacity:.85} 50%{transform:scale(1.25); opacity:.55} }
    .suntimes { display:grid; grid-template-columns:1fr auto 1fr; gap:8px; align-items:stretch; }
    .suntimes .col, .suntimes .mid, .moonbox { background:var(--slc-tile); border:1px solid var(--slc-line); border-radius:12px; padding:8px 10px; }
    .colhead { font-size:.72em; text-transform:uppercase; letter-spacing:.8px; color:var(--slc-sub); margin-bottom:4px; }
    .row { display:grid; grid-template-columns:16px 1fr; column-gap:6px; align-items:center; font-size:.82em; padding:2px 0; color:var(--slc-text); }
    .row .lbl { color:var(--slc-sub); font-size:.92em; }
    .row .val { grid-column:2; font-variant-numeric:tabular-nums; font-weight:500; }
    .row ha-icon { grid-row:span 2; }
    .row.golden ha-icon { color:var(--slc-golden); } .row.blue ha-icon { color:var(--slc-blue); } .row.strong ha-icon { color:var(--slc-sun); }
    .row.strong .val { font-weight:700; font-size:1.1em; }
    .row.past { opacity:.55; }
    .col.right .colhead { text-align:right; }
    .mid { display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; min-width:104px; }
    .mid .big { font-size:1.25em; font-weight:700; color:var(--slc-text); white-space:nowrap; }
    .mid .delta { font-size:.75em; margin-top:2px; white-space:nowrap; }
    .mid .delta.up { color:#8ef0a8; } .mid .delta.down { color:#ffb199; }
    .theme .mid .delta.up, .light .mid .delta.up { color:var(--success-color, #2e9d4e); } .theme .mid .delta.down, .light .mid .delta.down { color:var(--warning-color, #d9822b); }
    .light .badge.micro { background:rgba(30,50,90,.15); }
    .light .kpw, .light .ringfg, .light .ahead ha-icon { filter:brightness(.62) saturate(1.3); }
    .mid .noon { display:flex; align-items:center; gap:4px; font-size:.75em; color:var(--slc-sub); margin-top:6px; white-space:nowrap; }
    .mid .noon ha-icon { --mdc-icon-size:13px; width:13px; height:13px; color:var(--slc-sun); }
    .moonrow { display:flex; gap:12px; align-items:center; }
    .bigmoon { width:96px; height:96px; flex:none; overflow:visible; }
    .anim .bigmoon .moon { animation:float 8s ease-in-out infinite; }
    @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }
    .moontext { flex:1; min-width:0; }
    .phasename { font-size:1.1em; font-weight:700; color:var(--slc-text); }
    .illum { font-size:.82em; color:var(--slc-sub); margin:1px 0 6px; }
    .illum b { color:var(--slc-text); }
    .grid2 { display:grid; grid-template-columns:auto 1fr; gap:2px 10px; font-size:.8em; }
    .grid2 > div:nth-child(odd) { display:flex; align-items:center; gap:5px; color:var(--slc-sub); }
    .grid2 .v { font-variant-numeric:tabular-nums; font-weight:500; color:var(--slc-text); }
    .grid2 ha-icon { --mdc-icon-size:14px; width:14px; height:14px; color:var(--slc-moon); }
    .theme .grid2 ha-icon { color:var(--secondary-text-color); } .light .grid2 ha-icon { color:#7a86a0; }
    .light .phaseicon circle:first-of-type, .light .bigmoon { filter:drop-shadow(0 1px 2px rgba(0,0,0,.25)); }
    .dim { opacity:.6; font-weight:400; }
    .phases { display:grid; grid-template-columns:1fr 1fr; gap:6px 10px; margin-top:10px; padding-top:8px; border-top:1px solid var(--slc-line); }
    .ph { display:flex; align-items:center; gap:8px; font-size:.78em; min-width:0; }
    .phaseicon { width:22px; height:22px; flex:none; }
    .phn { font-weight:600; color:var(--slc-text); display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
    .phd { color:var(--slc-sub); font-variant-numeric:tabular-nums; }
    .phd .rel { opacity:.8; }
    .badge { font-size:.8em; font-weight:700; padding:0 6px; border-radius:999px; text-shadow:none; }
    .badge.super { background:var(--slc-golden); color:#2b1600; } .badge.micro { background:rgba(180,190,220,.5); color:#111; }
    .footer { display:flex; flex-wrap:wrap; gap:6px 14px; font-size:.78em; color:var(--slc-sub); }
    .footer span { display:inline-flex; align-items:center; gap:5px; }
    .footer ha-icon { --mdc-icon-size:14px; width:14px; height:14px; }
    .footer .season { margin-left:auto; color:var(--slc-text); }
    .aurorabox { background:var(--slc-tile); border:1px solid var(--slc-line); border-radius:12px; padding:8px 10px; }
    .ahead { display:flex; align-items:center; gap:6px; font-weight:700; color:var(--slc-text); margin-bottom:8px; }
    .ahead ha-icon { color:var(--slc-aurora); }
    .astats { display:flex; flex-wrap:wrap; gap:8px 18px; }
    .astat { display:flex; align-items:center; gap:8px; cursor:pointer; min-width:0; }
    .astat ha-icon { --mdc-icon-size:24px; width:24px; height:24px; color:var(--slc-aurora); }
    .astat ha-icon.alerton { color:#ff5c7a; }
    .ring { width:38px; height:38px; flex:none; }
    .ringbg { fill:none; stroke:var(--slc-line); stroke-width:4.5; }
    .ringfg { fill:none; stroke:var(--slc-aurora); stroke-width:4.5; stroke-linecap:round; }
    .aval { font-weight:700; color:var(--slc-text); font-size:.95em; font-variant-numeric:tabular-nums; }
    .albl { font-size:.72em; color:var(--slc-sub); text-transform:uppercase; letter-spacing:.6px; }
    .kpw { font-weight:600; font-size:.8em; }
    .kpbar { display:flex; gap:2px; margin:3px 0 2px; }
    .kpbar .seg { width:9px; height:6px; border-radius:2px; background:var(--slc-line); }
    .adays { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-top:10px; padding-top:8px; border-top:1px solid var(--slc-line); }
    .aday { cursor:pointer; min-width:0; }
    .adayh { font-size:.72em; text-transform:uppercase; letter-spacing:.6px; color:var(--slc-sub); margin-bottom:3px; }
    .chip { display:inline-block; font-size:.78em; font-weight:700; padding:1px 8px; border-radius:999px; text-shadow:none;
      color:var(--chip); background:color-mix(in srgb, var(--chip) 20%, transparent); border:1px solid color-mix(in srgb, var(--chip) 55%, transparent); }
    .atext { font-size:.74em; color:var(--slc-sub); margin-top:4px; line-height:1.3; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
    .alertbadge { background:#ff5c7a; color:#fff; margin-left:auto; }
    .asrc { font-size:.68em; color:var(--slc-sub); text-align:right; margin-top:6px; opacity:.85; }
    .aurorasky { position:absolute; left:-10%; right:-10%; top:0; height:55%; pointer-events:none; mix-blend-mode:screen; filter:blur(14px); }
    .aurorasky i { position:absolute; left:0; right:0; height:60%; border-radius:50%;
      background:linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--slc-aurora) 70%, transparent) 45%, transparent 100%); }
    .aurorasky i:nth-child(1) { top:5%; transform:skewY(-6deg); }
    .aurorasky i:nth-child(2) { top:18%; transform:skewY(4deg); opacity:.7; background:linear-gradient(180deg, transparent, color-mix(in srgb, #8a5cff 60%, transparent) 50%, transparent); }
    .aurorasky i:nth-child(3) { top:28%; transform:skewY(-3deg); opacity:.55; }
    .anim .aurorasky i { animation:aurora 14s ease-in-out infinite alternate; }
    .anim .aurorasky i:nth-child(2) { animation-duration:19s; animation-delay:-5s; }
    .anim .aurorasky i:nth-child(3) { animation-duration:23s; animation-delay:-9s; }
    @keyframes aurora { 0%{transform:translateX(-6%) skewY(-6deg) scaleY(.9)} 50%{transform:translateX(4%) skewY(3deg) scaleY(1.15)} 100%{transform:translateX(-2%) skewY(-2deg) scaleY(1)} }
    @media (max-width: 420px) {
      .adays { grid-template-columns:1fr; }
      .suntimes { grid-template-columns:1fr 1fr; }
      .suntimes .mid { grid-column:1 / -1; grid-row:1; flex-direction:row; gap:10px; flex-wrap:wrap; }
      .phases { grid-template-columns:1fr; }
    }
    `;
  }
}

/* ====================================================================== *
 *  GRAFISCHER EDITOR                                                      *
 * ====================================================================== */
const ED_STR = {
  de: {
    general: 'Allgemein', display: 'Anzeige', design: 'Design', colors: 'Farben', location: 'Standort (optional)',
    title: 'Titel', icon: 'Icon', language: 'Sprache', time_format: 'Zeitformat', refresh_period: 'Aktualisierung (Sekunden)',
    show_header: 'Kopfzeile', show_status: 'Status (Goldene Stunde …)', show_graph: 'Himmelsbahn-Grafik',
    show_moon_in_graph: 'Mondbahn in der Grafik', show_hour_bands: 'Goldene/Blaue Stunde markieren',
    show_sun_times: 'Sonnenzeiten & Tageslänge', show_moon: 'Mond-Details', show_next_phases: 'Nächste Mondphasen',
    show_position: 'Azimut & Höhe', show_season: 'Nächste Sonnenwende/Tagundnachtgleiche',
    background: 'Hintergrund', bg_sky: 'Dynamischer Himmel', bg_theme: 'Theme-Hintergrund', bg_light: 'Hell (Light Mode)', bg_dark: 'Dunkel (Dark Mode)',
    graph_size: 'Grafik-Größe', gs_small: 'Klein', gs_normal: 'Normal', gs_large: 'Groß',
    graph_sky: 'Himmelsverlauf in der Grafik (bei Theme/Hell/Dunkel)', show_rise_lines: 'Linien bei Auf-/Untergang',
    stars: 'Sterne bei Nacht', animations: 'Animationen', moon_orientation: 'Mond-Ausrichtung',
    mo_sky: 'Wie am Himmel (gedreht)', mo_simple: 'Einfach (links/rechts)',
    sun_color: 'Sonne', moon_color: 'Mond', golden_color: 'Goldene Stunde', blue_color: 'Blaue Stunde',
    curve_color: 'Sonnenbahn', moon_curve_color: 'Mondbahn',
    latitude: 'Breitengrad', longitude: 'Längengrad', time_zone: 'Zeitzone', locHint: 'Leer lassen = Werte aus Home Assistant',
    auto: 'Automatisch', reset: 'Zurücksetzen',
    aurora: 'Polarlicht', show_aurora: 'Polarlicht-Bereich anzeigen', aurora_effect: 'Nordlicht-Effekt im Nachthimmel', aurora_color: 'Polarlicht',
    aurora_visibility_entity: 'Sichtbarkeit (%)', aurora_alert_entity: 'Sichtbarkeitswarnung', aurora_kp_entity: 'Planetary K-Index',
    aurora_today_entity: 'Heute – Stufe', aurora_today_text_entity: 'Heute – Text',
    aurora_tomorrow_entity: 'Morgen – Stufe', aurora_tomorrow_text_entity: 'Morgen – Text',
    aurora_day_after_entity: 'Übermorgen – Stufe', aurora_day_after_text_entity: 'Übermorgen – Text',
    auroraHint: 'Leer lassen = automatisch erkennen (Entitäten mit „aurora“ bzw. „k_index“ im Namen).',
    aurora_source: 'Datenquelle', as_auto: 'Automatisch (Entitäten, sonst Internet)', as_entities: 'Nur Home-Assistant-Entitäten', as_internet: 'Internet (NOAA SWPC)',
    aurora_ovation: 'Sichtbarkeit aus NOAA-OVATION-Modell laden (~0,9 MB)', aurora_threshold: 'Warnung ab Sichtbarkeit (%)', aurora_update_minutes: 'Internet-Abruf alle (Minuten)',
  },
  en: {
    general: 'General', display: 'Display', design: 'Design', colors: 'Colors', location: 'Location (optional)',
    title: 'Title', icon: 'Icon', language: 'Language', time_format: 'Time format', refresh_period: 'Refresh (seconds)',
    show_header: 'Header', show_status: 'Status (golden hour …)', show_graph: 'Sky path graph',
    show_moon_in_graph: 'Moon path in graph', show_hour_bands: 'Highlight golden/blue hour',
    show_sun_times: 'Sun times & day length', show_moon: 'Moon details', show_next_phases: 'Next moon phases',
    show_position: 'Azimuth & elevation', show_season: 'Next solstice/equinox',
    background: 'Background', bg_sky: 'Dynamic sky', bg_theme: 'Theme background', bg_light: 'Light mode', bg_dark: 'Dark mode',
    graph_size: 'Graph size', gs_small: 'Small', gs_normal: 'Normal', gs_large: 'Large',
    graph_sky: 'Sky gradient in graph (theme/light/dark)', show_rise_lines: 'Sunrise/sunset lines',
    stars: 'Stars at night', animations: 'Animations', moon_orientation: 'Moon orientation',
    mo_sky: 'As seen in the sky (rotated)', mo_simple: 'Simple (left/right)',
    sun_color: 'Sun', moon_color: 'Moon', golden_color: 'Golden hour', blue_color: 'Blue hour',
    curve_color: 'Sun path', moon_curve_color: 'Moon path',
    latitude: 'Latitude', longitude: 'Longitude', time_zone: 'Time zone', locHint: 'Leave empty = Home Assistant values',
    auto: 'Automatic', reset: 'Reset',
    aurora: 'Aurora', show_aurora: 'Show aurora section', aurora_effect: 'Aurora effect in night sky', aurora_color: 'Aurora',
    aurora_visibility_entity: 'Visibility (%)', aurora_alert_entity: 'Visibility alert', aurora_kp_entity: 'Planetary K-index',
    aurora_today_entity: 'Today – level', aurora_today_text_entity: 'Today – text',
    aurora_tomorrow_entity: 'Tomorrow – level', aurora_tomorrow_text_entity: 'Tomorrow – text',
    aurora_day_after_entity: 'Day after – level', aurora_day_after_text_entity: 'Day after – text',
    auroraHint: 'Leave empty = auto-detect (entities with “aurora” or “k_index” in their name).',
    aurora_source: 'Data source', as_auto: 'Automatic (entities, else internet)', as_entities: 'Home Assistant entities only', as_internet: 'Internet (NOAA SWPC)',
    aurora_ovation: 'Load visibility from NOAA OVATION model (~0.9 MB)', aurora_threshold: 'Alert from visibility (%)', aurora_update_minutes: 'Internet refresh every (minutes)',
  },
};

class SolLunaCardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  set hass(h) { const first = !this._hass; this._hass = h; if (first && this._config) this._build(); else this._fillList?.(); }
  setConfig(config) {
    this._config = { ...config };
    if (!this._built) this._build(); else this._sync();
  }
  _t() {
    const l = String(this._hass?.locale?.language || this._hass?.language || navigator.language || 'en').slice(0, 2);
    return ED_STR[l] || ED_STR.en;
  }
  _val(k) { return this._config[k] !== undefined ? this._config[k] : DEFAULTS[k]; }
  _emit() {
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
  }
  _set(k, v) {
    const cfg = { ...this._config };
    if (v === '' || v === undefined || v === null || v === DEFAULTS[k]) delete cfg[k]; else cfg[k] = v;
    if (!cfg.type) cfg.type = 'custom:sol-luna-card';
    this._config = cfg;
    this._emit();
  }
  _build() {
    if (!this._config) return;
    const T = this._t();
    const sec = (title, body, open = false) => `<details ${open ? 'open' : ''}><summary>${esc(title)}</summary><div class="body">${body}</div></details>`;
    const text = (k, ph = '') => `<label class="f"><span>${esc(T[k])}</span><input data-k="${k}" type="text" placeholder="${esc(ph)}"></label>`;
    const num = (k, step = 'any', ph = '') => `<label class="f"><span>${esc(T[k])}</span><input data-k="${k}" data-num="1" type="number" step="${step}" placeholder="${esc(ph)}"></label>`;
    const sel = (k, opts) => `<label class="f"><span>${esc(T[k])}</span><select data-k="${k}">${opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>`;
    const sw = (k) => `<label class="s"><input data-k="${k}" type="checkbox"><span class="track"></span><span>${esc(T[k])}</span></label>`;
    const col = (k) => `<label class="c"><input data-k="${k}" type="color"><span>${esc(T[k])}</span><button data-reset="${k}" title="${esc(T.reset)}">↺</button></label>`;
    const ent = (k) => `<label class="f"><span>${esc(T[k])}</span><input data-k="${k}" type="text" list="entlist" placeholder="${esc(T.auto)}"></label>`;
    const AUR = ['aurora_visibility_entity', 'aurora_alert_entity', 'aurora_kp_entity', 'aurora_today_entity', 'aurora_today_text_entity',
      'aurora_tomorrow_entity', 'aurora_tomorrow_text_entity', 'aurora_day_after_entity', 'aurora_day_after_text_entity'];
    const ha = this._hass?.config || {};
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        details { border:1px solid var(--divider-color, #ddd); border-radius:10px; margin:0 0 10px; background:var(--card-background-color); }
        summary { cursor:pointer; padding:10px 12px; font-weight:600; }
        .body { padding:4px 12px 12px; display:grid; grid-template-columns:1fr 1fr; gap:10px 14px; }
        .f { display:flex; flex-direction:column; gap:4px; font-size:.85em; color:var(--secondary-text-color); }
        .f input, .f select { font:inherit; font-size:1.05em; color:var(--primary-text-color); background:var(--secondary-background-color, #f3f3f3);
          border:1px solid var(--divider-color, #ccc); border-radius:8px; padding:8px; box-sizing:border-box; width:100%; min-width:0; }
        .s { display:flex; align-items:center; gap:10px; cursor:pointer; font-size:.92em; grid-column:span 2; }
        .s input { display:none; }
        .s .track { width:34px; height:18px; border-radius:9px; background:var(--disabled-color, #bbb); position:relative; flex:none; transition:.2s; }
        .s .track::after { content:''; position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%; background:#fff; transition:.2s; }
        .s input:checked + .track { background:var(--primary-color, #03a9f4); }
        .s input:checked + .track::after { left:18px; }
        .c { display:flex; align-items:center; gap:8px; font-size:.92em; }
        .c input { width:38px; height:28px; border:none; padding:0; background:none; cursor:pointer; }
        .c button { margin-left:auto; border:none; background:none; color:var(--secondary-text-color); cursor:pointer; font-size:1.1em; }
        .hint { grid-column:span 2; font-size:.8em; color:var(--secondary-text-color); }
        .ver { font-size:.75em; color:var(--secondary-text-color); text-align:right; }
      </style>
      ${sec(T.general, text('title', STR[(this._hass?.locale?.language || 'de').slice(0, 2)]?.title || 'Sonne & Mond') + text('icon', 'mdi:weather-sunset') +
        sel('language', [['auto', T.auto], ['de', 'Deutsch'], ['en', 'English']]) +
        sel('time_format', [['auto', T.auto], ['24', '24 h'], ['12', '12 h']]) +
        num('refresh_period', '1', '60'), true)}
      ${sec(T.display, ['show_header', 'show_status', 'show_graph', 'show_moon_in_graph', 'show_hour_bands', 'show_sun_times', 'show_moon', 'show_next_phases', 'show_position', 'show_season'].map(sw).join(''))}
      ${sec(T.design, sel('background', [['sky', T.bg_sky], ['light', T.bg_light], ['dark', T.bg_dark], ['theme', T.bg_theme]]) +
        sel('graph_size', [['small', T.gs_small], ['normal', T.gs_normal], ['large', T.gs_large]]) +
        sel('moon_orientation', [['sky', T.mo_sky], ['simple', T.mo_simple]]) + `<span></span>` +
        sw('graph_sky') + sw('show_rise_lines') + sw('stars') + sw('animations'))}
      ${sec(T.aurora, sw('show_aurora') + sw('aurora_effect') +
        sel('aurora_source', [['auto', T.as_auto], ['entities', T.as_entities], ['internet', T.as_internet]]) +
        num('aurora_threshold', '1', '50') + num('aurora_update_minutes', '1', '15') + sw('aurora_ovation') + AUR.map(ent).join('') + `<div class="hint">${esc(T.auroraHint)}</div>`)}
      ${sec(T.colors, ['sun_color', 'moon_color', 'golden_color', 'blue_color', 'curve_color', 'moon_curve_color', 'aurora_color'].map(col).join(''))}
      <datalist id="entlist"></datalist>
      ${sec(T.location, num('latitude', 'any', ha.latitude ?? '') + num('longitude', 'any', ha.longitude ?? '') + text('time_zone', ha.time_zone || '') + `<div class="hint">${esc(T.locHint)}</div>`)}
      <div class="ver">Sol &amp; Luna Card v${VERSION}</div>`;
    this.shadowRoot.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k;
      const ev = el.type === 'text' || el.type === 'number' ? 'change' : 'input';
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : ev, () => {
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else if (el.dataset.num) v = el.value === '' ? undefined : Number(el.value);
        else v = el.value.trim();
        this._set(k, v);
      });
    });
    this.shadowRoot.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault(); this._set(b.dataset.reset, undefined); this._sync();
    }));
    this._built = true;
    this._sync();
  }
  _fillList() {
    const dl = this.shadowRoot.getElementById('entlist');
    if (!dl || !this._hass || this._listFilled) return;
    const ids = Object.keys(this._hass.states).filter((id) => /^(sensor|binary_sensor)\./.test(id));
    const rel = (id) => /aurora|polarlicht|nordlicht|k_?index|kp/.test(id) ? 0 : 1;
    ids.sort((a, b) => rel(a) - rel(b) || a.localeCompare(b));
    dl.innerHTML = ids.map((id) => `<option value="${esc(id)}">${esc(this._hass.states[id].attributes?.friendly_name || '')}</option>`).join('');
    this._listFilled = true;
  }
  _sync() {
    this._fillList();
    this.shadowRoot.querySelectorAll('[data-k]').forEach((el) => {
      if (this.shadowRoot.activeElement === el) return;
      const k = el.dataset.k;
      const v = this._val(k);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v ?? '';
    });
  }
}

if (!customElements.get('sol-luna-card')) customElements.define('sol-luna-card', SolLunaCard);
if (!customElements.get('sol-luna-card-editor')) customElements.define('sol-luna-card-editor', SolLunaCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'sol-luna-card')) {
  window.customCards.push({
    type: 'sol-luna-card',
    name: 'Sol & Luna Card',
    description: 'Sonne, Mond & Himmel: Bahnen, Mondphasen, Goldene/Blaue Stunde, Tageslänge, Jahreszeiten.',
    preview: true,
    documentationURL: 'https://github.com/muhkuh666/sol-luna-card',
  });
}
window.SolLunaAstro = Astro;
console.info(`%c SOL & LUNA CARD %c v${VERSION} `, 'background:#1f2c63;color:#FFC531;font-weight:700;border-radius:4px 0 0 4px;padding:2px 4px', 'background:#FFC531;color:#1f2c63;border-radius:0 4px 4px 0;padding:2px 4px');
})();
