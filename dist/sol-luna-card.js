/*!
 * Sol & Luna Card – Sonne, Mond & Himmel für Home Assistant
 * MIT © muhkuh666
 */
(() => {
'use strict';

const VERSION = '2.2.0';

/* ====================================================================== *
 *  ASTRONOMIE – Sonne, Mond (Meeus), Planeten (JPL), Finsternisse         *
 * ====================================================================== */
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MIN_MS = 60000;
const J1970 = 2440588;
const J2000 = 2451545;
const AU_KM = 149597870.7;
const SYNODIC = 29.530589;
const { sin, cos, tan, asin, acos, atan, atan2, sqrt, abs } = Math;

const toDays = (ms) => ms / DAY_MS - 0.5 + J1970 - J2000;
const norm360 = (x) => ((x % 360) + 360) % 360;
const wrap180 = (x) => ((x % 360) + 540) % 360 - 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------- Sonne (Meeus, Kap. 25, niedrige Genauigkeit ~0,01°) -------- */
function sunCore(d) {
  const T = d / 36525;
  const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const Mr = M * RAD;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(Mr) +
    (0.019993 - 0.000101 * T) * sin(2 * Mr) + 0.000289 * sin(3 * Mr);
  const v = M + C;
  const e = 0.016708634 - 0.000042037 * T;
  const R = 1.000001018 * (1 - e * e) / (1 + e * cos(v * RAD));
  const om = 125.04 - 1934.136 * T;
  const lon = norm360(L0 + C - 0.00569 - 0.00478 * sin(om * RAD));
  return { lon, R, T, om, M };
}
const obliq = (T, om) => (23.439291 - 0.0130042 * T + 0.00256 * cos(om * RAD)) * RAD;
const siderealDeg = (d) => 280.46061837 + 360.98564736629 * d + 0.000387933 * (d / 36525) ** 2;

function eclToEq(lonDeg, latDeg, eps) {
  const l = lonDeg * RAD, b = latDeg * RAD;
  return {
    ra: atan2(sin(l) * cos(eps) - tan(b) * sin(eps), cos(l)),
    dec: asin(sin(b) * cos(eps) + cos(b) * sin(eps) * sin(l)),
  };
}

function horizontal(ra, dec, d, lat, lng) {
  const phi = RAD * lat;
  const H = (siderealDeg(d) + lng) * RAD - ra;
  const alt = asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
  const az = atan2(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi)) + Math.PI;
  const q = atan2(sin(H), tan(phi) * cos(dec) - sin(dec) * cos(H));
  return { alt, az, H, q };
}

/* ---------- Mond (Meeus, Kap. 47, gekürzte Reihen) ---------------------- */
// D, M, M', F, Σl (1e-6°), Σr (1e-3 km)
const MOON_LR = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
];
// D, M, M', F, Σb (1e-6°)
const MOON_B = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335],
];
function moonEcl(d) {
  const T = d / 36525;
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T);
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T) * RAD;
  const M = norm360(357.5291092 + 35999.0502909 * T) * RAD;
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T) * RAD;
  const F = norm360(93.272095 + 483202.0175233 * T - 0.0036539 * T * T) * RAD;
  const A1 = (119.75 + 131.849 * T) * RAD, A2 = (53.09 + 479264.29 * T) * RAD, A3 = (313.45 + 481266.484 * T) * RAD;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const Lr = Lp * RAD;
  let sl = 0, sr = 0, sb = 0;
  for (const [a, b, c, f, l, r] of MOON_LR) {
    const arg = a * D + b * M + c * Mp + f * F;
    const e = b === 0 ? 1 : (abs(b) === 1 ? E : E * E);
    sl += l * e * sin(arg); sr += r * e * cos(arg);
  }
  for (const [a, b, c, f, s] of MOON_B) {
    const e = b === 0 ? 1 : (abs(b) === 1 ? E : E * E);
    sb += s * e * sin(a * D + b * M + c * Mp + f * F);
  }
  sl += 3958 * sin(A1) + 1962 * sin(Lr - F) + 318 * sin(A2);
  sb += -2235 * sin(Lr) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lr - Mp) - 115 * sin(Lr + Mp);
  const om = 125.04452 - 1934.136261 * T;
  return { lon: norm360(Lp + sl / 1e6 - 0.00478 * sin(om * RAD)), lat: sb / 1e6, dist: 385000.56 + sr / 1000, T, om };
}

/* ---------- Planeten (JPL „Approximate Positions of the Planets“) ------- */
// a, ȧ, e, ė, I, İ, L, L̇, ϖ, ϖ̇, Ω, Ω̇  (J2000, pro Jahrhundert)
const PLANET_EL = {
  mercury: [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.2503235, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
  venus: [0.72333566, 0.0000039, 0.00677672, -0.00004107, 3.39467605, -0.0007889, 181.9790995, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
  earth: [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0],
  mars: [1.52371034, 0.00001847, 0.0933941, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
  jupiter: [5.202887, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
  saturn: [9.53667594, -0.0012506, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794],
};
const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
const PLANET_COLORS = { mercury: '#c9b8a6', venus: '#fff6d8', mars: '#ff8a5c', jupiter: '#ffe2b0', saturn: '#f1d48a' };

function helio(name, T) {
  const el = PLANET_EL[name];
  const a = el[0] + el[1] * T, e = el[2] + el[3] * T, I = (el[4] + el[5] * T) * RAD;
  const L = el[6] + el[7] * T, w = el[8] + el[9] * T, O = (el[10] + el[11] * T) * RAD;
  const om = w * RAD - O;
  const M = wrap180(L - w) * RAD;
  let E = M + e * sin(M);
  for (let i = 0; i < 8; i++) E -= (E - e * sin(E) - M) / (1 - e * cos(E));
  const xp = a * (cos(E) - e), yp = a * sqrt(1 - e * e) * sin(E);
  const co = cos(om), sw = sin(om);
  const sO = sin(O), cO = cos(O), cI = cos(I), sI = sin(I);
  return {
    x: (co * cO - sw * sO * cI) * xp + (-sw * cO - co * sO * cI) * yp,
    y: (co * sO + sw * cO * cI) * xp + (-sw * sO + co * cO * cI) * yp,
    z: (sw * sI) * xp + (co * sI) * yp,
  };
}
function planetMag(name, r, D, i) {
  const l = 5 * Math.log10(r * D);
  switch (name) {
    case 'mercury': return -0.42 + l + 0.038 * i - 0.000273 * i * i + 0.000002 * i * i * i;
    case 'venus': return -4.4 + l + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i * i * i;
    case 'mars': return -1.52 + l + 0.016 * i;
    case 'jupiter': return -9.4 + l + 0.005 * i;
    default: return -8.88 + l + 0.044 * i;
  }
}

/* ---------- Helle Sterne (J2000, RA/Dec in Grad, Helligkeit) ----------- */
const STARS = {
  sirius: [101.287, -16.716, -1.46], arcturus: [213.915, 19.182, -0.05], vega: [279.234, 38.784, 0.03],
  capella: [79.172, 45.998, 0.08], rigel: [78.634, -8.202, 0.13], procyon: [114.825, 5.225, 0.34],
  betelgeuse: [88.793, 7.407, 0.5], altair: [297.696, 8.868, 0.77], aldebaran: [68.98, 16.509, 0.86],
  spica: [201.298, -11.161, 0.97], antares: [247.352, -26.432, 1.0], pollux: [116.329, 28.026, 1.14],
  fomalhaut: [344.413, -29.622, 1.16], deneb: [310.358, 45.28, 1.25], regulus: [152.093, 11.967, 1.35],
  castor: [113.65, 31.888, 1.58], bellatrix: [81.283, 6.35, 1.64], alnilam: [84.053, -1.202, 1.69],
  alnitak: [85.19, -1.943, 1.77], mintaka: [83.002, -0.299, 2.23], saiph: [86.939, -9.67, 2.09],
  polaris: [37.954, 89.264, 1.98], dubhe: [165.932, 61.751, 1.79], merak: [165.46, 56.383, 2.37],
  phecda: [178.458, 53.695, 2.44], megrez: [183.857, 57.033, 3.31], alioth: [193.507, 55.96, 1.77],
  mizar: [200.981, 54.925, 2.27], alkaid: [206.885, 49.313, 1.86], caph: [2.294, 59.15, 2.28],
  schedar: [10.127, 56.537, 2.24], gammacas: [14.177, 60.717, 2.15], ruchbah: [21.454, 60.235, 2.68],
  segin: [28.599, 63.67, 3.37],
};
const STAR_LINES = [
  ['dubhe', 'merak'], ['merak', 'phecda'], ['phecda', 'megrez'], ['megrez', 'dubhe'], ['megrez', 'alioth'], ['alioth', 'mizar'], ['mizar', 'alkaid'],
  ['caph', 'schedar'], ['schedar', 'gammacas'], ['gammacas', 'ruchbah'], ['ruchbah', 'segin'],
  ['betelgeuse', 'bellatrix'], ['bellatrix', 'mintaka'], ['betelgeuse', 'alnitak'], ['mintaka', 'alnilam'], ['alnilam', 'alnitak'],
  ['mintaka', 'rigel'], ['alnitak', 'saiph'],
  ['vega', 'deneb', 1], ['deneb', 'altair', 1], ['altair', 'vega', 1],
];
const STAR_LABELS = ['sirius', 'vega', 'capella', 'arcturus', 'deneb', 'altair', 'polaris', 'aldebaran', 'betelgeuse', 'rigel', 'antares', 'regulus', 'spica'];

/* ---------- API ---------------------------------------------------------- */
const Astro = {
  sun(ms, lat, lng) {
    const d = toDays(ms);
    const s = sunCore(d);
    const eq = eclToEq(s.lon, 0, obliq(s.T, s.om));
    const h = horizontal(eq.ra, eq.dec, d, lat, lng);
    return { alt: h.alt * DEG, az: norm360(h.az * DEG), lon: s.lon, ra: eq.ra, dec: eq.dec, R: s.R };
  },
  moon(ms, lat, lng) {
    const d = toDays(ms);
    const m = moonEcl(d), s = sunCore(d);
    const eps = obliq(m.T, m.om);
    const eq = eclToEq(m.lon, m.lat, eps);
    const seq = eclToEq(s.lon, 0, eps);
    const h = horizontal(eq.ra, eq.dec, d, lat, lng);
    const Rkm = s.R * AU_KM;
    const psi = acos(clamp(cos(m.lat * RAD) * cos((m.lon - s.lon) * RAD), -1, 1));
    const inc = atan2(Rkm * sin(psi), m.dist - Rkm * cos(psi));
    const k = (1 + cos(inc)) / 2;
    const elong = norm360(m.lon - s.lon);
    const chi = atan2(cos(seq.dec) * sin(seq.ra - eq.ra),
      sin(seq.dec) * cos(eq.dec) - cos(seq.dec) * sin(eq.dec) * cos(seq.ra - eq.ra));
    const par = asin(6378.14 / m.dist);
    const altTopo = h.alt - par * cos(h.alt);
    return {
      alt: h.alt * DEG, altTopo: altTopo * DEG, az: norm360(h.az * DEG), dist: m.dist, k, phase: elong / 360,
      elong, lon: m.lon, lat: m.lat, chi: chi * DEG, q: h.q * DEG,
    };
  },
  planet(name, ms, lat, lng) {
    const d = toDays(ms), T = d / 36525;
    const p = helio(name, T), e = helio('earth', T);
    const gx = p.x - e.x, gy = p.y - e.y, gz = p.z - e.z;
    const D = sqrt(gx * gx + gy * gy + gz * gz);
    const r = sqrt(p.x * p.x + p.y * p.y + p.z * p.z), R = sqrt(e.x * e.x + e.y * e.y + e.z * e.z);
    const lon = norm360(atan2(gy, gx) * DEG + 1.396971 * T);
    const latE = atan2(gz, sqrt(gx * gx + gy * gy)) * DEG;
    const s = sunCore(d);
    const eq = eclToEq(lon, latE, obliq(T, s.om));
    const h = horizontal(eq.ra, eq.dec, d, lat, lng);
    const i = acos(clamp((r * r + D * D - R * R) / (2 * r * D), -1, 1)) * DEG;
    const elong = acos(clamp((R * R + D * D - r * r) / (2 * R * D), -1, 1)) * DEG;
    const east = wrap180(lon - s.lon) > 0;
    return { alt: h.alt * DEG, az: norm360(h.az * DEG), mag: planetMag(name, r, D, i), dist: D, elong, east };
  },
  star(name, ms, lat, lng) {
    const [ra, dec, mag] = STARS[name];
    const h = horizontal(ra * RAD, dec * RAD, toDays(ms), lat, lng);
    return { alt: h.alt * DEG, az: norm360(h.az * DEG), mag };
  },
  elongation(ms) {
    const d = toDays(ms);
    return norm360(moonEcl(d).lon - sunCore(d).lon);
  },
  sunLon(ms) { return sunCore(toDays(ms)).lon; },
  /** erste Zeit >= t0, zu der fn(t) (monoton wachsend, mod 360) target überschreitet */
  findCross(fn, target, t0, stepMs, maxSteps) {
    const diff = (t) => wrap180(fn(t) - target);
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
  /** Sonnenaufgang/-untergang analytisch (für Jahreskurven, ±1 min) */
  sunTimesApprox(dayMidnightMs, lat, lng) {
    const noonGuess = dayMidnightMs + 12 * HOUR_MS;
    const d = toDays(noonGuess);
    const s = sunCore(d);
    const eps = obliq(s.T, s.om);
    const eq = eclToEq(s.lon, 0, eps);
    // Zeitgleichung
    const L0 = norm360(280.46646 + 36000.76983 * s.T);
    const eot = wrap180(L0 - 0.0057183 - eq.ra * DEG + 0.00478 * sin(s.om * RAD) * cos(eps)) * 4; // Minuten
    const utcMid = Math.floor(noonGuess / DAY_MS) * DAY_MS;
    let noon = utcMid + (720 - 4 * lng - eot) * MIN_MS;
    if (noon - noonGuess > 12 * HOUR_MS) noon -= DAY_MS;
    if (noonGuess - noon > 12 * HOUR_MS) noon += DAY_MS;
    const phi = lat * RAD;
    const cH = (sin(-0.833 * RAD) - sin(phi) * sin(eq.dec)) / (cos(phi) * cos(eq.dec));
    if (cH > 1) return { noon, rise: null, set: null, len: 0 };
    if (cH < -1) return { noon, rise: null, set: null, len: DAY_MS };
    const H0 = acos(cH) * DEG;
    const half = H0 / 360.9856 * DAY_MS;
    return { noon, rise: noon - half, set: noon + half, len: 2 * half, dec: eq.dec * DEG };
  },
};

/* ---------- Finsternisse -------------------------------------------------- */
function lunarState(ms) {
  const d = toDays(ms);
  const m = moonEcl(d), s = sunCore(d);
  const sep = acos(clamp(cos(m.lat * RAD) * cos((m.lon - s.lon - 180) * RAD), -1, 1)) * DEG;
  const pm = asin(6378.14 / m.dist) * DEG, ps = 8.794 / 3600 / s.R, ss = 0.266564 / s.R;
  const ru = 1.02 * (pm + ps - ss), rp = 1.02 * (pm + ps + ss), sm = 0.272481 * pm;
  return { sep, umag: (ru + sm - sep) / (2 * sm), pmag: (rp + sm - sep) / (2 * sm) };
}
function solarState(ms, lat, lng, elevM) {
  const d = toDays(ms);
  const s = sunCore(d);
  const eps = obliq(s.T, s.om);
  const se = eclToEq(s.lon, 0, eps);
  const m = moonEcl(d);
  const me = eclToEq(m.lon, m.lat, eps);
  const phi = lat * RAD;
  const H = (siderealDeg(d) + lng) * RAD - me.ra;
  const u = atan(0.99664719 * tan(phi));
  const rs = 0.99664719 * sin(u) + (elevM / 6378140) * sin(phi);
  const rc = cos(u) + (elevM / 6378140) * cos(phi);
  const sp = 6378.14 / m.dist;
  const dRa = atan2(-rc * sp * sin(H), cos(me.dec) - rc * sp * cos(H));
  const decT = atan2((sin(me.dec) - rs * sp) * cos(dRa), cos(me.dec) - rc * sp * cos(H));
  const raT = me.ra + dRa;
  const sep = acos(clamp(sin(se.dec) * sin(decT) + cos(se.dec) * cos(decT) * cos(se.ra - raT), -1, 1)) * DEG;
  const sunH = horizontal(se.ra, se.dec, d, lat, lng);
  const moonAlt = horizontal(me.ra, me.dec, d, lat, lng).alt;
  const ss = 0.266564 / s.R;
  const sm = 0.272481 * asin(sp) * DEG * (1 + sin(moonAlt) * sp);
  return { sep, ss, sm, sunAlt: sunH.alt * DEG };
}
function overlapFraction(R1, R2, dd) {
  if (dd >= R1 + R2) return 0;
  if (dd <= abs(R2 - R1)) return Math.min(1, (R2 / R1) ** 2);
  const a = R1 * R1 * acos(clamp((dd * dd + R1 * R1 - R2 * R2) / (2 * dd * R1), -1, 1));
  const b = R2 * R2 * acos(clamp((dd * dd + R2 * R2 - R1 * R1) / (2 * dd * R2), -1, 1));
  const c = 0.5 * sqrt(Math.max(0, (-dd + R1 + R2) * (dd + R1 - R2) * (dd - R1 + R2) * (dd + R1 + R2)));
  return (a + b - c) / (Math.PI * R1 * R1);
}

function findEclipses(fromMs, toMs, lat, lng, elevM) {
  const out = [];
  const step = 2 * MIN_MS;
  let tNew = Astro.findCross(Astro.elongation, 0, fromMs - 16 * DAY_MS, 6 * HOUR_MS, 160);
  let guard = 0;
  while (tNew != null && tNew < toMs && guard++ < 200) {
    // --- Sonnenfinsternis am Neumond
    if (abs(moonEcl(toDays(tNew)).lat) < 1.6) {
      let best = null, start = null, end = null, vStart = null, vEnd = null;
      for (let t = tNew - 5 * HOUR_MS; t <= tNew + 5 * HOUR_MS; t += step) {
        const st = solarState(t, lat, lng, elevM);
        const over = st.sep < st.ss + st.sm;
        if (over) {
          if (start == null) start = t;
          end = t;
          const vis = st.sunAlt > -0.6;
          if (vis) { if (vStart == null) vStart = t; vEnd = t; }
          const mag = (st.ss + st.sm - st.sep) / (2 * st.ss);
          const score = mag + (vis ? 10 : 0);
          if (!best || score > best.score) best = { t, st, mag, vis, score };
        }
      }
      if (best) {
        const { st } = best;
        let kind = 'partial';
        if (st.sep < st.sm - st.ss) kind = 'total';
        else if (st.sep < st.ss - st.sm) kind = 'annular';
        out.push({
          type: 'solar', kind, t: best.t, start, end, visible: best.vis, vStart, vEnd,
          mag: best.mag, obsc: overlapFraction(st.ss, st.sm, st.sep), sunAlt: st.sunAlt,
        });
      } else out.push({ type: 'solar', kind: 'elsewhere', t: tNew, visible: false });
    }
    // --- Mondfinsternis am Vollmond
    const tFull = Astro.findCross(Astro.elongation, 180, tNew + DAY_MS, 6 * HOUR_MS, 140);
    if (tFull != null && abs(moonEcl(toDays(tFull)).lat) < 1.6) {
      let best = null;
      const pts = [];
      for (let t = tFull - 5 * HOUR_MS; t <= tFull + 5 * HOUR_MS; t += step) {
        const st = lunarState(t);
        pts.push({ t, ...st });
        if (!best || st.pmag > best.pmag) best = { t, ...st };
      }
      if (best && best.pmag > 0) {
        const kind = best.umag >= 1 ? 'total' : best.umag > 0 ? 'partial' : 'penumbral';
        const key = kind === 'penumbral' ? 'pmag' : 'umag';
        const ph = pts.filter((p) => p[key] > 0);
        const start = ph[0].t, end = ph[ph.length - 1].t;
        const visPts = ph.filter((p) => Astro.moon(p.t, lat, lng).altTopo > 0);
        const visAtMax = Astro.moon(best.t, lat, lng).altTopo > 0;
        out.push({
          type: 'lunar', kind, t: best.t, start, end, mag: best[key],
          visible: visPts.length > 0, visAtMax,
          vStart: visPts.length ? visPts[0].t : null, vEnd: visPts.length ? visPts[visPts.length - 1].t : null,
        });
      }
    }
    tNew = Astro.findCross(Astro.elongation, 0, (tFull || tNew) + DAY_MS, 6 * HOUR_MS, 160);
  }
  return out.filter((e) => (e.end || e.t) >= fromMs).sort((a, b) => a.t - b.t);
}

/* ---------- Meteorströme (Höhepunkt Monat/Tag, aktiv von/bis, ZHR) ------ */
const METEORS = [
  { id: 0, peak: [1, 3], from: [12, 28], to: [1, 12], zhr: 110 },
  { id: 1, peak: [4, 22], from: [4, 14], to: [4, 30], zhr: 18 },
  { id: 2, peak: [5, 6], from: [4, 19], to: [5, 28], zhr: 50 },
  { id: 3, peak: [8, 12], from: [7, 17], to: [8, 24], zhr: 100 },
  { id: 4, peak: [10, 8], from: [10, 6], to: [10, 10], zhr: 10 },
  { id: 5, peak: [10, 21], from: [10, 2], to: [11, 7], zhr: 20 },
  { id: 6, peak: [11, 17], from: [11, 6], to: [11, 30], zhr: 15 },
  { id: 7, peak: [12, 14], from: [12, 4], to: [12, 20], zhr: 150 },
  { id: 8, peak: [12, 22], from: [12, 17], to: [12, 26], zhr: 10 },
];

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
/** NOAA-G-Skala aus Kp (G1 ab 5-, G2 ab 6-, G3 ab 7-, G4 ab 8-, G5 bei 9o) */
function kpGScale(kp) {
  return kp >= 9 ? 5 : kp >= 7.66 ? 4 : kp >= 6.66 ? 3 : kp >= 5.66 ? 2 : kp >= 4.66 ? 1 : 0;
}
function kpText(kp, t) {
  const g = kpGScale(kp);
  return String(t.levels[kpLevelKey(kp)] || '').toLowerCase() + (g ? ` · G${g}` : '');
}
function kpLevelKey(kp) {
  // Stufen wie im NOAA-Aurora-Dashboard: Kp 3 ruhig, 5 mäßig, 7 aktiv, 9 sehr aktiv
  // Kp-Drittel: 4- = 3,67 zählt bereits zu Kp 4
  return kp < 3.66 ? 'quiet' : kp < 6.66 ? 'moderate' : kp < 8.66 ? 'active' : 'very active';
}
/** Faustregel: benötigter Kp für Polarlicht am Horizont bei geogr. Breite (Europa) */
const kpNeeded = (lat) => clamp(Math.round((66 - Math.abs(lat)) / 2), 1, 9);

let _uid = 0;

/* ---------- Open-Meteo (Wolken in drei Schichten) ------------------------ */
const METEO = { slots: new Map() };
function meteoGet(lat, lng, maxAgeMs) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  let slot = METEO.slots.get(key);
  if (!slot) { slot = {}; METEO.slots.set(key, slot); }
  const fresh = slot.ts && Date.now() - slot.ts < maxAgeMs;
  if (!fresh && !slot.loading) {
    slot.loading = true;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
      '&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high&timeformat=unixtime&timezone=auto&past_days=1&forecast_days=3';
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((j) => {
        const h = j.hourly || {};
        slot.data = (h.time || []).map((t, i) => ({
          t: t * 1000, total: h.cloud_cover?.[i], low: h.cloud_cover_low?.[i], mid: h.cloud_cover_mid?.[i], high: h.cloud_cover_high?.[i],
        })).filter((x) => x.total != null);
        slot.ts = Date.now(); slot.error = null;
      })
      .catch((e) => { slot.error = String(e.message || e); slot.ts = Date.now() - maxAgeMs + 120000; })
      .finally(() => { slot.loading = false; NOAA.listeners.forEach((fn) => { try { fn(); } catch (e) { /* */ } }); });
  }
  return slot;
}
function cloudAt(hours, t) {
  if (!hours || !hours.length) return null;
  let best = null;
  for (const h of hours) if (!best || Math.abs(h.t - t) < Math.abs(best.t - t)) best = h;
  return best && Math.abs(best.t - t) <= 2 * HOUR_MS ? best : null;
}
/** Abendrot-/Morgenrot-Chance 0–100 aus Wolkenschichten */
function glowChance(h) {
  if (!h || h.total == null) return null;
  if (h.low == null || h.high == null) {
    return Math.round(clamp(1 - Math.abs(h.total - 45) / 45, 0, 1) * 60);
  }
  const hm = Math.max(h.high, (h.mid ?? 0) * 0.9);
  let s = clamp(1 - Math.abs(hm - 55) / 55, 0, 1);
  if (hm < 10) s *= 0.25;
  s *= Math.pow(1 - h.low / 100, 1.6);
  if (h.total > 95) s *= 0.4;
  return Math.round(s * 100);
}

/* ---------- Horizontprofil ------------------------------------------------ */
/** akzeptiert: "az:h, az:h …", [h0, h1, …] (gleichmäßig ab Nord), [[az,h],…], [{azimuth|A, elevation|H_hor}], PVGIS (0=S) */
function parseHorizon(src, pvgisSouth = false) {
  if (src == null || src === '') return null;
  let pts = [];
  if (typeof src === 'string') {
    const s = src.trim();
    if (s.startsWith('[')) { try { return parseHorizon(JSON.parse(s)); } catch (e) { return null; } }
    const parts = s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    if (parts.every((p) => p.includes(':'))) pts = parts.map((p) => p.split(':').map(Number));
    else { const v = parts.map(Number); pts = v.map((h, i) => [i * 360 / v.length, h]); }
  } else if (Array.isArray(src)) {
    if (src.every((x) => typeof x === 'number')) pts = src.map((h, i) => [i * 360 / src.length, h]);
    else pts = src.map((x) => Array.isArray(x) ? [Number(x[0]), Number(x[1])]
      : [Number(x.azimuth ?? x.az ?? x.A), Number(x.elevation ?? x.el ?? x.h ?? x.H_hor)]);
    if (src.length && !Array.isArray(src[0]) && typeof src[0] === 'object' && src[0].A !== undefined && src[0].azimuth === undefined) pvgisSouth = true;
  }
  pts = pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([a, h]) => [norm360(pvgisSouth ? a + 180 : a), h]).sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return null;
  const fn = (az) => {
    az = norm360(az);
    let i = pts.findIndex((p) => p[0] > az);
    const p1 = i <= 0 ? pts[pts.length - 1] : pts[i - 1];
    const p2 = i < 0 ? pts[0] : pts[i];
    let span = norm360(p2[0] - p1[0]); if (span === 0) span = 360;
    const f = norm360(az - p1[0]) / span;
    return p1[1] + (p2[1] - p1[1]) * f;
  };
  fn.points = pts;
  return fn;
}

/* ====================================================================== *
 *  TEXTE (Karte) – fehlende Schlüssel fallen auf Englisch zurück          *
 * ====================================================================== */
const STR = {
  de: {
    model3d: 'Himmelskuppel & Haus', hint3d: 'Ziehen zum Drehen · Regler = Uhrzeit',
    activity: 'Aktivität',
    title: 'Sonne & Mond',
    bands: ['Nacht', 'Dämmerung', 'Blaue Stunde', 'Goldene Stunde', 'Tag'],
    morning: 'Morgen', evening: 'Abend', sunrise: 'Aufgang', sunset: 'Untergang', noon: 'Mittag',
    dayLength: 'Tageslänge', vsYesterday: 'ggü. gestern', golden: 'Goldene Stunde', blue: 'Blaue Stunde',
    illum: 'beleuchtet', ageDays: 'Tage alt', distance: 'Entfernung', zodiac: 'Zeichen',
    moonrise: 'Mondaufgang', moonset: 'Monduntergang', sun: 'Sonne', moon: 'Mond',
    polarNight: 'Polarnacht', midnightSun: 'Mitternachtssonne',
    supermoon: 'Supermond', micromoon: 'Minimond', nextPhases: 'Nächste Phasen',
    today: 'heute', tomorrow: 'morgen', inDays: (n) => `in ${n} Tagen`, inX: (x) => `in ${x}`,
    notToday: 'heute nicht',
    phases: ['Neumond', 'Zunehmende Sichel', 'Erstes Viertel', 'Zunehmender Mond', 'Vollmond', 'Abnehmender Mond', 'Letztes Viertel', 'Abnehmende Sichel'],
    principal: ['Neumond', 'Erstes Viertel', 'Vollmond', 'Letztes Viertel'],
    seasons: ['Frühlingsanfang', 'Sommersonnenwende', 'Herbstanfang', 'Wintersonnenwende'],
    zodiac12: ['Widder', 'Stier', 'Zwillinge', 'Krebs', 'Löwe', 'Jungfrau', 'Waage', 'Skorpion', 'Schütze', 'Steinbock', 'Wassermann', 'Fische'],
    dirs: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'],
    aurora: 'Polarlicht', visibility: 'Sichtbarkeit', kp: 'Kp-Index', alert: 'Warnung', alertOn: 'Warnung aktiv',
    on: 'An', off: 'Aus', days3: ['Heute', 'Morgen', 'Übermorgen'],
    levels: { quiet: 'Ruhig', moderate: 'Mäßig', active: 'Aktiv', 'very active': 'Sehr aktiv', unsettled: 'Mäßig', 'minor storm': 'Mäßig', 'moderate storm': 'Aktiv', 'strong storm': 'Aktiv', 'severe storm': 'Sehr aktiv', 'extreme storm': 'Sehr aktiv', storm: 'Aktiv' },
    kpWords: ['ruhig', 'ruhig', 'ruhig', 'ruhig', 'mäßig', 'mäßig · G1', 'aktiv · G2', 'aktiv · G3', 'sehr aktiv · G4', 'sehr aktiv · G5'],
    maxKp: 'Max. Kp', chanceGood: 'Polarlicht am Nordhorizont möglich', chanceMaybe: 'evtl. mit Kamera sichtbar',
    chanceLow: (n) => `hier unwahrscheinlich (ab ca. Kp ${n})`, source: 'Quelle', loading: 'Lade Daten …',
    noaaError: 'NOAA-Daten nicht erreichbar', butCloudy: 'aber bewölkt',
    tabs: { today: 'Heute', night: 'Nacht', year: 'Jahr', sky3d: '3D' }, now: 'Jetzt',
    clouds: 'Wolken', skyTonight: 'Himmel heute Nacht', cloudClasses: ['Klar', 'Teils bewölkt', 'Bedeckt'],
    glowEvening: 'Abendrot', glowMorning: 'Morgenrot', overTerrain: 'über Gelände',
    astroNight: 'Astronomische Nacht', moonFree: 'mondfrei', noAstroNight: 'Keine astronomische Nacht', darkHours: 'Dunkelheit',
    planets: 'Planeten', planetNames: { mercury: 'Merkur', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' },
    planetWhen: { evening: 'abends', morning: 'morgens', allNight: 'ganze Nacht', night: 'nachts' },
    notVisibleTonight: 'heute Nacht nicht sichtbar', eveningStar: 'Abendstern', morningStar: 'Morgenstern', best: 'am besten',
    meteors: 'Sternschnuppen', meteorNames: ['Quadrantiden', 'Lyriden', 'Eta-Aquariiden', 'Perseiden', 'Draconiden', 'Orioniden', 'Leoniden', 'Geminiden', 'Ursiden'],
    peak: 'Höhepunkt', perHour: '/h', active: 'aktiv', moonDisturbs: (k) => `Mond stört (${k} %)`, moonOk: 'Mond stört kaum',
    eclipses: 'Finsternisse', solarEclipse: 'Sonnenfinsternis', lunarEclipse: 'Mondfinsternis',
    eclKinds: { total: 'Totale', partial: 'Partielle', annular: 'Ringförmige', penumbral: 'Halbschatten-' },
    eclHere: (p) => `${p} % der Sonne bedeckt`, eclMag: 'Größe', eclNotVisible: 'hier nicht sichtbar', eclPartlyVisible: 'teilweise sichtbar',
    noEclipses: 'Keine Finsternisse in Sicht', skyMap: 'Sternenhimmel', at: 'um',
    yearDayLength: 'Tageslänge im Jahresverlauf', sunPath: 'Sonnenbahn', upcoming: 'Kommende Termine',
    earliestSunrise: 'Frühester Aufgang', latestSunrise: 'Spätester Aufgang', earliestSunset: 'Frühester Untergang', latestSunset: 'Spätester Untergang',
    longestDay: 'Längster Tag', shortestDay: 'Kürzester Tag',
    months: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
    weatherSrc: 'Wetter', tonight: 'heute Nacht',
  },
  en: {
    model3d: 'Sky dome & house', hint3d: 'Drag to rotate · slider = time of day',
    activity: 'Activity',
    title: 'Sun & Moon',
    bands: ['Night', 'Twilight', 'Blue hour', 'Golden hour', 'Day'],
    morning: 'Morning', evening: 'Evening', sunrise: 'Sunrise', sunset: 'Sunset', noon: 'Solar noon',
    dayLength: 'Day length', vsYesterday: 'vs. yesterday', golden: 'Golden hour', blue: 'Blue hour',
    illum: 'illuminated', ageDays: 'days old', distance: 'Distance', zodiac: 'Sign',
    moonrise: 'Moonrise', moonset: 'Moonset', sun: 'Sun', moon: 'Moon',
    polarNight: 'Polar night', midnightSun: 'Midnight sun',
    supermoon: 'Supermoon', micromoon: 'Micromoon', nextPhases: 'Next phases',
    today: 'today', tomorrow: 'tomorrow', inDays: (n) => `in ${n} days`, inX: (x) => `in ${x}`,
    notToday: 'not today',
    phases: ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'],
    principal: ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'],
    seasons: ['March equinox', 'June solstice', 'September equinox', 'December solstice'],
    zodiac12: ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'],
    dirs: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    aurora: 'Aurora', visibility: 'Visibility', kp: 'Kp index', alert: 'Alert', alertOn: 'Alert active',
    on: 'On', off: 'Off', days3: ['Today', 'Tomorrow', 'Day after'],
    levels: { quiet: 'Quiet', moderate: 'Moderate', active: 'Active', 'very active': 'Very active', unsettled: 'Moderate', 'minor storm': 'Moderate', 'moderate storm': 'Active', 'strong storm': 'Active', 'severe storm': 'Very active', 'extreme storm': 'Very active', storm: 'Active' },
    kpWords: ['quiet', 'quiet', 'quiet', 'quiet', 'moderate', 'moderate · G1', 'active · G2', 'active · G3', 'very active · G4', 'very active · G5'],
    maxKp: 'Max Kp', chanceGood: 'aurora possible on the horizon', chanceMaybe: 'maybe visible on camera',
    chanceLow: (n) => `unlikely here (needs ~Kp ${n})`, source: 'Source', loading: 'Loading data …',
    noaaError: 'NOAA data unavailable', butCloudy: 'but cloudy',
    tabs: { today: 'Today', night: 'Night', year: 'Year', sky3d: '3D' }, now: 'Now',
    clouds: 'Clouds', skyTonight: 'Sky tonight', cloudClasses: ['Clear', 'Partly cloudy', 'Overcast'],
    glowEvening: 'Sunset glow', glowMorning: 'Sunrise glow', overTerrain: 'over terrain',
    astroNight: 'Astronomical night', moonFree: 'moon-free', noAstroNight: 'No astronomical night', darkHours: 'Darkness',
    planets: 'Planets', planetNames: { mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' },
    planetWhen: { evening: 'evening', morning: 'morning', allNight: 'all night', night: 'at night' },
    notVisibleTonight: 'not visible tonight', eveningStar: 'evening star', morningStar: 'morning star', best: 'best',
    meteors: 'Meteor showers', meteorNames: ['Quadrantids', 'Lyrids', 'Eta Aquariids', 'Perseids', 'Draconids', 'Orionids', 'Leonids', 'Geminids', 'Ursids'],
    peak: 'Peak', perHour: '/h', active: 'active', moonDisturbs: (k) => `moonlight (${k} %)`, moonOk: 'little moonlight',
    eclipses: 'Eclipses', solarEclipse: 'solar eclipse', lunarEclipse: 'lunar eclipse',
    eclKinds: { total: 'Total', partial: 'Partial', annular: 'Annular', penumbral: 'Penumbral' },
    eclHere: (p) => `${p} % of the sun covered`, eclMag: 'Magnitude', eclNotVisible: 'not visible here', eclPartlyVisible: 'partly visible',
    noEclipses: 'No eclipses ahead', skyMap: 'Night sky', at: 'at',
    yearDayLength: 'Day length through the year', sunPath: 'Sun path', upcoming: 'Upcoming',
    earliestSunrise: 'Earliest sunrise', latestSunrise: 'Latest sunrise', earliestSunset: 'Earliest sunset', latestSunset: 'Latest sunset',
    longestDay: 'Longest day', shortestDay: 'Shortest day',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    weatherSrc: 'Weather', tonight: 'tonight',
  },
  nl: {
    model3d: 'Hemelkoepel & huis', hint3d: 'Slepen om te draaien · schuif = tijd',
    activity: 'Activiteit',
    title: 'Zon & Maan',
    bands: ['Nacht', 'Schemering', 'Blauw uur', 'Gouden uur', 'Dag'],
    morning: 'Ochtend', evening: 'Avond', sunrise: 'Zonsopkomst', sunset: 'Zonsondergang', noon: 'Middag',
    dayLength: 'Daglengte', vsYesterday: 't.o.v. gisteren', golden: 'Gouden uur', blue: 'Blauw uur',
    illum: 'verlicht', ageDays: 'dagen oud', distance: 'Afstand', zodiac: 'Teken',
    moonrise: 'Maanopkomst', moonset: 'Maanondergang', sun: 'Zon', moon: 'Maan',
    polarNight: 'Poolnacht', midnightSun: 'Middernachtzon', supermoon: 'Supermaan', micromoon: 'Minimaan', nextPhases: 'Volgende fasen',
    today: 'vandaag', tomorrow: 'morgen', inDays: (n) => `over ${n} dagen`, inX: (x) => `over ${x}`, notToday: 'vandaag niet',
    phases: ['Nieuwe maan', 'Wassende sikkel', 'Eerste kwartier', 'Wassende maan', 'Volle maan', 'Afnemende maan', 'Laatste kwartier', 'Afnemende sikkel'],
    principal: ['Nieuwe maan', 'Eerste kwartier', 'Volle maan', 'Laatste kwartier'],
    seasons: ['Lentebegin', 'Zomerzonnewende', 'Herfstbegin', 'Winterzonnewende'],
    zodiac12: ['Ram', 'Stier', 'Tweelingen', 'Kreeft', 'Leeuw', 'Maagd', 'Weegschaal', 'Schorpioen', 'Boogschutter', 'Steenbok', 'Waterman', 'Vissen'],
    dirs: ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'],
    aurora: 'Noorderlicht', visibility: 'Zichtbaarheid', kp: 'Kp-index', alert: 'Waarschuwing', alertOn: 'Waarschuwing actief',
    on: 'Aan', off: 'Uit', days3: ['Vandaag', 'Morgen', 'Overmorgen'],
    levels: { quiet: 'Rustig', moderate: 'Matig', active: 'Actief', 'very active': 'Zeer actief', unsettled: 'Matig', 'minor storm': 'Matig', 'moderate storm': 'Actief', 'strong storm': 'Actief', 'severe storm': 'Zeer actief', 'extreme storm': 'Zeer actief', storm: 'Actief' },
    kpWords: ['rustig', 'rustig', 'rustig', 'rustig', 'matig', 'matig · G1', 'actief · G2', 'actief · G3', 'zeer actief · G4', 'zeer actief · G5'],
    maxKp: 'Max. Kp', chanceGood: 'noorderlicht aan de horizon mogelijk', chanceMaybe: 'mogelijk op camera zichtbaar',
    chanceLow: (n) => `hier onwaarschijnlijk (vanaf ca. Kp ${n})`, source: 'Bron', loading: 'Gegevens laden …', butCloudy: 'maar bewolkt',
    tabs: { today: 'Vandaag', night: 'Nacht', year: 'Jaar', sky3d: '3D' }, now: 'Nu',
    clouds: 'Bewolking', skyTonight: 'Hemel vannacht', cloudClasses: ['Helder', 'Half bewolkt', 'Bewolkt'],
    glowEvening: 'Avondrood', glowMorning: 'Ochtendrood', overTerrain: 'boven terrein',
    astroNight: 'Astronomische nacht', moonFree: 'maanloos', noAstroNight: 'Geen astronomische nacht', darkHours: 'Duisternis',
    planets: 'Planeten', planetNames: { mercury: 'Mercurius', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturnus' },
    planetWhen: { evening: "'s avonds", morning: "'s ochtends", allNight: 'hele nacht', night: "'s nachts" },
    notVisibleTonight: 'vannacht niet zichtbaar', eveningStar: 'avondster', morningStar: 'morgenster', best: 'best',
    meteors: 'Meteorenzwermen', meteorNames: ['Quadrantiden', 'Lyriden', 'Eta Aquariden', 'Perseïden', 'Draconiden', 'Orioniden', 'Leoniden', 'Geminiden', 'Ursiden'],
    peak: 'Maximum', moonDisturbs: (k) => `maanlicht stoort (${k} %)`, moonOk: 'weinig maanlicht', active: 'actief',
    eclipses: 'Verduisteringen', solarEclipse: 'zonsverduistering', lunarEclipse: 'maansverduistering',
    eclKinds: { total: 'Totale', partial: 'Gedeeltelijke', annular: 'Ringvormige', penumbral: 'Halfschaduw-' },
    eclHere: (p) => `${p} % van de zon bedekt`, eclNotVisible: 'hier niet zichtbaar', eclPartlyVisible: 'deels zichtbaar',
    noEclipses: 'Geen verduisteringen in zicht', skyMap: 'Sterrenhemel', at: 'om',
    yearDayLength: 'Daglengte door het jaar', sunPath: 'Zonnebaan', upcoming: 'Komende data',
    earliestSunrise: 'Vroegste zonsopkomst', latestSunrise: 'Laatste zonsopkomst', earliestSunset: 'Vroegste zonsondergang', latestSunset: 'Laatste zonsondergang',
    longestDay: 'Langste dag', shortestDay: 'Kortste dag',
    months: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'], tonight: 'vannacht',
  },
  fr: {
    model3d: 'Voûte céleste & maison', hint3d: 'Glisser pour pivoter · curseur = heure',
    activity: 'Activité',
    title: 'Soleil & Lune',
    bands: ['Nuit', 'Crépuscule', 'Heure bleue', 'Heure dorée', 'Jour'],
    morning: 'Matin', evening: 'Soir', sunrise: 'Lever', sunset: 'Coucher', noon: 'Midi solaire',
    dayLength: 'Durée du jour', vsYesterday: 'vs hier', golden: 'Heure dorée', blue: 'Heure bleue',
    illum: 'éclairée', ageDays: 'jours', distance: 'Distance', zodiac: 'Signe',
    moonrise: 'Lever de lune', moonset: 'Coucher de lune', sun: 'Soleil', moon: 'Lune',
    polarNight: 'Nuit polaire', midnightSun: 'Soleil de minuit', supermoon: 'Super lune', micromoon: 'Mini lune', nextPhases: 'Prochaines phases',
    today: "aujourd'hui", tomorrow: 'demain', inDays: (n) => `dans ${n} jours`, inX: (x) => `dans ${x}`, notToday: "pas aujourd'hui",
    phases: ['Nouvelle lune', 'Premier croissant', 'Premier quartier', 'Lune gibbeuse croissante', 'Pleine lune', 'Lune gibbeuse décroissante', 'Dernier quartier', 'Dernier croissant'],
    principal: ['Nouvelle lune', 'Premier quartier', 'Pleine lune', 'Dernier quartier'],
    seasons: ['Équinoxe de printemps', "Solstice d'été", "Équinoxe d'automne", "Solstice d'hiver"],
    zodiac12: ['Bélier', 'Taureau', 'Gémeaux', 'Cancer', 'Lion', 'Vierge', 'Balance', 'Scorpion', 'Sagittaire', 'Capricorne', 'Verseau', 'Poissons'],
    dirs: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
    aurora: 'Aurore boréale', visibility: 'Visibilité', kp: 'Indice Kp', alert: 'Alerte', alertOn: 'Alerte active',
    on: 'Oui', off: 'Non', days3: ["Aujourd'hui", 'Demain', 'Après-demain'],
    levels: { quiet: 'Calme', moderate: 'Modéré', active: 'Actif', 'very active': 'Très actif', unsettled: 'Modéré', 'minor storm': 'Modéré', 'moderate storm': 'Actif', 'strong storm': 'Actif', 'severe storm': 'Très actif', 'extreme storm': 'Très actif', storm: 'Actif' },
    kpWords: ['calme', 'calme', 'calme', 'calme', 'modéré', 'modéré · G1', 'actif · G2', 'actif · G3', 'très actif · G4', 'très actif · G5'],
    maxKp: 'Kp max', chanceGood: "aurore possible à l'horizon", chanceMaybe: 'peut-être visible en photo',
    chanceLow: (n) => `peu probable ici (Kp ~${n} requis)`, source: 'Source', loading: 'Chargement …', butCloudy: 'mais nuageux',
    tabs: { today: "Aujourd'hui", night: 'Nuit', year: 'Année', sky3d: '3D' }, now: 'Maintenant',
    clouds: 'Nuages', skyTonight: 'Ciel cette nuit', cloudClasses: ['Dégagé', 'Partiellement nuageux', 'Couvert'],
    glowEvening: 'Ciel rouge du soir', glowMorning: 'Ciel rouge du matin', overTerrain: 'au-dessus du relief',
    astroNight: 'Nuit astronomique', moonFree: 'sans lune', noAstroNight: 'Pas de nuit astronomique', darkHours: 'Obscurité',
    planets: 'Planètes', planetNames: { mercury: 'Mercure', venus: 'Vénus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturne' },
    planetWhen: { evening: 'le soir', morning: 'le matin', allNight: 'toute la nuit', night: 'la nuit' },
    notVisibleTonight: 'invisible cette nuit', eveningStar: 'étoile du soir', morningStar: 'étoile du matin', best: 'idéal',
    meteors: "Pluies d'étoiles filantes", meteorNames: ['Quadrantides', 'Lyrides', 'Êta Aquarides', 'Perséides', 'Draconides', 'Orionides', 'Léonides', 'Géminides', 'Ursides'],
    peak: 'Maximum', moonDisturbs: (k) => `gêne lunaire (${k} %)`, moonOk: 'peu de gêne lunaire', active: 'active',
    eclipses: 'Éclipses', solarEclipse: 'éclipse solaire', lunarEclipse: 'éclipse lunaire',
    eclKinds: { total: 'Totale', partial: 'Partielle', annular: 'Annulaire', penumbral: 'Pénombrale' },
    eclHere: (p) => `${p} % du soleil couvert`, eclNotVisible: 'invisible ici', eclPartlyVisible: 'partiellement visible',
    noEclipses: 'Aucune éclipse prévue', skyMap: 'Ciel nocturne', at: 'à',
    yearDayLength: "Durée du jour sur l'année", sunPath: 'Course du soleil', upcoming: 'À venir',
    earliestSunrise: 'Lever le plus tôt', latestSunrise: 'Lever le plus tard', earliestSunset: 'Coucher le plus tôt', latestSunset: 'Coucher le plus tard',
    longestDay: 'Jour le plus long', shortestDay: 'Jour le plus court',
    months: ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'], tonight: 'cette nuit',
  },
  sv: {
    model3d: 'Himlavalv & hus', hint3d: 'Dra för att rotera · reglage = tid',
    activity: 'Aktivitet',
    title: 'Sol & Måne',
    bands: ['Natt', 'Skymning', 'Blå timmen', 'Gyllene timmen', 'Dag'],
    morning: 'Morgon', evening: 'Kväll', sunrise: 'Soluppgång', sunset: 'Solnedgång', noon: 'Middag',
    dayLength: 'Dagslängd', vsYesterday: 'mot igår', golden: 'Gyllene timmen', blue: 'Blå timmen',
    illum: 'belyst', ageDays: 'dagar', distance: 'Avstånd', zodiac: 'Tecken',
    moonrise: 'Månuppgång', moonset: 'Månnedgång', sun: 'Sol', moon: 'Måne',
    polarNight: 'Polarnatt', midnightSun: 'Midnattssol', supermoon: 'Supermåne', micromoon: 'Minimåne', nextPhases: 'Nästa faser',
    today: 'idag', tomorrow: 'imorgon', inDays: (n) => `om ${n} dagar`, inX: (x) => `om ${x}`, notToday: 'inte idag',
    phases: ['Nymåne', 'Tilltagande skära', 'Första kvarteret', 'Tilltagande måne', 'Fullmåne', 'Avtagande måne', 'Sista kvarteret', 'Avtagande skära'],
    principal: ['Nymåne', 'Första kvarteret', 'Fullmåne', 'Sista kvarteret'],
    seasons: ['Vårdagjämning', 'Sommarsolstånd', 'Höstdagjämning', 'Vintersolstånd'],
    zodiac12: ['Väduren', 'Oxen', 'Tvillingarna', 'Kräftan', 'Lejonet', 'Jungfrun', 'Vågen', 'Skorpionen', 'Skytten', 'Stenbocken', 'Vattumannen', 'Fiskarna'],
    dirs: ['N', 'NO', 'O', 'SO', 'S', 'SV', 'V', 'NV'],
    aurora: 'Norrsken', visibility: 'Synlighet', kp: 'Kp-index', alert: 'Varning', alertOn: 'Varning aktiv',
    on: 'På', off: 'Av', days3: ['Idag', 'Imorgon', 'I övermorgon'],
    levels: { quiet: 'Lugnt', moderate: 'Måttligt', active: 'Aktivt', 'very active': 'Mycket aktivt', unsettled: 'Måttligt', 'minor storm': 'Måttligt', 'moderate storm': 'Aktivt', 'strong storm': 'Aktivt', 'severe storm': 'Mycket aktivt', 'extreme storm': 'Mycket aktivt', storm: 'Aktivt' },
    kpWords: ['lugnt', 'lugnt', 'lugnt', 'lugnt', 'måttligt', 'måttligt · G1', 'aktivt · G2', 'aktivt · G3', 'mycket aktivt · G4', 'mycket aktivt · G5'],
    maxKp: 'Max Kp', chanceGood: 'norrsken möjligt vid horisonten', chanceMaybe: 'kanske synligt med kamera',
    chanceLow: (n) => `osannolikt här (kräver ~Kp ${n})`, source: 'Källa', loading: 'Laddar …', butCloudy: 'men molnigt',
    tabs: { today: 'Idag', night: 'Natt', year: 'År', sky3d: '3D' }, now: 'Nu',
    clouds: 'Moln', skyTonight: 'Himlen i natt', cloudClasses: ['Klart', 'Halvklart', 'Mulet'],
    glowEvening: 'Kvällsrodnad', glowMorning: 'Morgonrodnad', overTerrain: 'över terrängen',
    astroNight: 'Astronomisk natt', moonFree: 'månfri', noAstroNight: 'Ingen astronomisk natt', darkHours: 'Mörker',
    planets: 'Planeter', planetNames: { mercury: 'Merkurius', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturnus' },
    planetWhen: { evening: 'kväll', morning: 'morgon', allNight: 'hela natten', night: 'natt' },
    notVisibleTonight: 'inte synlig i natt', eveningStar: 'aftonstjärna', morningStar: 'morgonstjärna', best: 'bäst',
    meteors: 'Meteorskurar', meteorNames: ['Kvadrantiderna', 'Lyriderna', 'Eta Akvariderna', 'Perseiderna', 'Drakoniderna', 'Orioniderna', 'Leoniderna', 'Geminiderna', 'Ursiderna'],
    peak: 'Maximum', moonDisturbs: (k) => `månljus stör (${k} %)`, moonOk: 'lite månljus', active: 'aktiv',
    eclipses: 'Förmörkelser', solarEclipse: 'solförmörkelse', lunarEclipse: 'månförmörkelse',
    eclKinds: { total: 'Total', partial: 'Partiell', annular: 'Ringformig', penumbral: 'Halvskugge-' },
    eclHere: (p) => `${p} % av solen täckt`, eclNotVisible: 'syns inte här', eclPartlyVisible: 'delvis synlig',
    noEclipses: 'Inga förmörkelser i sikte', skyMap: 'Natthimmel', at: 'kl.',
    yearDayLength: 'Dagslängd under året', sunPath: 'Solbana', upcoming: 'Kommande',
    earliestSunrise: 'Tidigaste soluppgång', latestSunrise: 'Senaste soluppgång', earliestSunset: 'Tidigaste solnedgång', latestSunset: 'Senaste solnedgång',
    longestDay: 'Längsta dagen', shortestDay: 'Kortaste dagen',
    months: ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'], tonight: 'i natt',
  },
  nb: {
    model3d: 'Himmelkuppel & hus', hint3d: 'Dra for å rotere · glidebryter = tid',
    activity: 'Aktivitet',
    title: 'Sol & Måne',
    bands: ['Natt', 'Skumring', 'Blåtime', 'Gyllen time', 'Dag'],
    morning: 'Morgen', evening: 'Kveld', sunrise: 'Soloppgang', sunset: 'Solnedgang', noon: 'Middag',
    dayLength: 'Daglengde', vsYesterday: 'mot i går', golden: 'Gyllen time', blue: 'Blåtime',
    illum: 'opplyst', ageDays: 'dager', distance: 'Avstand', zodiac: 'Tegn',
    moonrise: 'Måneoppgang', moonset: 'Månenedgang', sun: 'Sol', moon: 'Måne',
    polarNight: 'Mørketid', midnightSun: 'Midnattssol', supermoon: 'Supermåne', micromoon: 'Minimåne', nextPhases: 'Neste faser',
    today: 'i dag', tomorrow: 'i morgen', inDays: (n) => `om ${n} dager`, inX: (x) => `om ${x}`, notToday: 'ikke i dag',
    phases: ['Nymåne', 'Voksende sigd', 'Første kvarter', 'Voksende måne', 'Fullmåne', 'Minkende måne', 'Siste kvarter', 'Minkende sigd'],
    principal: ['Nymåne', 'Første kvarter', 'Fullmåne', 'Siste kvarter'],
    seasons: ['Vårjevndøgn', 'Sommersolverv', 'Høstjevndøgn', 'Vintersolverv'],
    zodiac12: ['Væren', 'Tyren', 'Tvillingene', 'Krepsen', 'Løven', 'Jomfruen', 'Vekten', 'Skorpionen', 'Skytten', 'Steinbukken', 'Vannmannen', 'Fiskene'],
    dirs: ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'],
    aurora: 'Nordlys', visibility: 'Synlighet', kp: 'Kp-indeks', alert: 'Varsel', alertOn: 'Varsel aktivt',
    on: 'På', off: 'Av', days3: ['I dag', 'I morgen', 'I overmorgen'],
    levels: { quiet: 'Rolig', moderate: 'Moderat', active: 'Aktiv', 'very active': 'Svært aktiv', unsettled: 'Moderat', 'minor storm': 'Moderat', 'moderate storm': 'Aktiv', 'strong storm': 'Aktiv', 'severe storm': 'Svært aktiv', 'extreme storm': 'Svært aktiv', storm: 'Aktiv' },
    kpWords: ['rolig', 'rolig', 'rolig', 'rolig', 'moderat', 'moderat · G1', 'aktiv · G2', 'aktiv · G3', 'svært aktiv · G4', 'svært aktiv · G5'],
    maxKp: 'Maks Kp', chanceGood: 'nordlys mulig i horisonten', chanceMaybe: 'kanskje synlig på kamera',
    chanceLow: (n) => `lite sannsynlig her (krever ~Kp ${n})`, source: 'Kilde', loading: 'Laster …', butCloudy: 'men skyet',
    tabs: { today: 'I dag', night: 'Natt', year: 'År', sky3d: '3D' }, now: 'Nå',
    clouds: 'Skyer', skyTonight: 'Himmelen i natt', cloudClasses: ['Klart', 'Delvis skyet', 'Overskyet'],
    glowEvening: 'Aftenrøde', glowMorning: 'Morgenrøde', overTerrain: 'over terrenget',
    astroNight: 'Astronomisk natt', moonFree: 'månefri', noAstroNight: 'Ingen astronomisk natt', darkHours: 'Mørke',
    planets: 'Planeter', planetNames: { mercury: 'Merkur', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' },
    planetWhen: { evening: 'kveld', morning: 'morgen', allNight: 'hele natten', night: 'natt' },
    notVisibleTonight: 'ikke synlig i natt', eveningStar: 'aftenstjerne', morningStar: 'morgenstjerne', best: 'best',
    meteors: 'Meteorsvermer', meteorNames: ['Kvadrantidene', 'Lyridene', 'Eta Akvaridene', 'Perseidene', 'Drakonidene', 'Orionidene', 'Leonidene', 'Geminidene', 'Ursidene'],
    peak: 'Maksimum', moonDisturbs: (k) => `månelys forstyrrer (${k} %)`, moonOk: 'lite månelys', active: 'aktiv',
    eclipses: 'Formørkelser', solarEclipse: 'solformørkelse', lunarEclipse: 'måneformørkelse',
    eclKinds: { total: 'Total', partial: 'Delvis', annular: 'Ringformet', penumbral: 'Halvskygge-' },
    eclHere: (p) => `${p} % av sola dekket`, eclNotVisible: 'ikke synlig her', eclPartlyVisible: 'delvis synlig',
    noEclipses: 'Ingen formørkelser i sikte', skyMap: 'Nattehimmel', at: 'kl.',
    yearDayLength: 'Daglengde gjennom året', sunPath: 'Solbane', upcoming: 'Kommende',
    earliestSunrise: 'Tidligste soloppgang', latestSunrise: 'Seneste soloppgang', earliestSunset: 'Tidligste solnedgang', latestSunset: 'Seneste solnedgang',
    longestDay: 'Lengste dag', shortestDay: 'Korteste dag',
    months: ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'], tonight: 'i natt',
  },
  da: {
    model3d: 'Himmelkuppel & hus', hint3d: 'Træk for at rotere · skyder = tid',
    activity: 'Aktivitet',
    title: 'Sol & Måne',
    bands: ['Nat', 'Tusmørke', 'Blå time', 'Gylden time', 'Dag'],
    morning: 'Morgen', evening: 'Aften', sunrise: 'Solopgang', sunset: 'Solnedgang', noon: 'Middag',
    dayLength: 'Daglængde', vsYesterday: 'ift. i går', golden: 'Gylden time', blue: 'Blå time',
    illum: 'oplyst', ageDays: 'dage', distance: 'Afstand', zodiac: 'Tegn',
    moonrise: 'Måneopgang', moonset: 'Månenedgang', sun: 'Sol', moon: 'Måne',
    polarNight: 'Polarnat', midnightSun: 'Midnatssol', supermoon: 'Supermåne', micromoon: 'Minimåne', nextPhases: 'Næste faser',
    today: 'i dag', tomorrow: 'i morgen', inDays: (n) => `om ${n} dage`, inX: (x) => `om ${x}`, notToday: 'ikke i dag',
    phases: ['Nymåne', 'Tiltagende segl', 'Første kvarter', 'Tiltagende måne', 'Fuldmåne', 'Aftagende måne', 'Sidste kvarter', 'Aftagende segl'],
    principal: ['Nymåne', 'Første kvarter', 'Fuldmåne', 'Sidste kvarter'],
    seasons: ['Forårsjævndøgn', 'Sommersolhverv', 'Efterårsjævndøgn', 'Vintersolhverv'],
    zodiac12: ['Vædderen', 'Tyren', 'Tvillingerne', 'Krebsen', 'Løven', 'Jomfruen', 'Vægten', 'Skorpionen', 'Skytten', 'Stenbukken', 'Vandbæreren', 'Fiskene'],
    dirs: ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'],
    aurora: 'Nordlys', visibility: 'Synlighed', kp: 'Kp-indeks', alert: 'Advarsel', alertOn: 'Advarsel aktiv',
    on: 'Til', off: 'Fra', days3: ['I dag', 'I morgen', 'I overmorgen'],
    levels: { quiet: 'Roligt', moderate: 'Moderat', active: 'Aktivt', 'very active': 'Meget aktivt', unsettled: 'Moderat', 'minor storm': 'Moderat', 'moderate storm': 'Aktivt', 'strong storm': 'Aktivt', 'severe storm': 'Meget aktivt', 'extreme storm': 'Meget aktivt', storm: 'Aktivt' },
    kpWords: ['roligt', 'roligt', 'roligt', 'roligt', 'moderat', 'moderat · G1', 'aktivt · G2', 'aktivt · G3', 'meget aktivt · G4', 'meget aktivt · G5'],
    maxKp: 'Maks Kp', chanceGood: 'nordlys muligt i horisonten', chanceMaybe: 'måske synligt på kamera',
    chanceLow: (n) => `usandsynligt her (kræver ~Kp ${n})`, source: 'Kilde', loading: 'Henter …', butCloudy: 'men skyet',
    tabs: { today: 'I dag', night: 'Nat', year: 'År', sky3d: '3D' }, now: 'Nu',
    clouds: 'Skyer', skyTonight: 'Himlen i nat', cloudClasses: ['Klart', 'Delvist skyet', 'Overskyet'],
    glowEvening: 'Aftenrøde', glowMorning: 'Morgenrøde', overTerrain: 'over terrænet',
    astroNight: 'Astronomisk nat', moonFree: 'månefri', noAstroNight: 'Ingen astronomisk nat', darkHours: 'Mørke',
    planets: 'Planeter', planetNames: { mercury: 'Merkur', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' },
    planetWhen: { evening: 'aften', morning: 'morgen', allNight: 'hele natten', night: 'nat' },
    notVisibleTonight: 'ikke synlig i nat', eveningStar: 'aftenstjerne', morningStar: 'morgenstjerne', best: 'bedst',
    meteors: 'Meteorsværme', meteorNames: ['Kvadrantiderne', 'Lyriderne', 'Eta Aquariderne', 'Perseiderne', 'Drakoniderne', 'Orioniderne', 'Leoniderne', 'Geminiderne', 'Ursiderne'],
    peak: 'Maksimum', moonDisturbs: (k) => `månelys forstyrrer (${k} %)`, moonOk: 'lidt månelys', active: 'aktiv',
    eclipses: 'Formørkelser', solarEclipse: 'solformørkelse', lunarEclipse: 'måneformørkelse',
    eclKinds: { total: 'Total', partial: 'Delvis', annular: 'Ringformet', penumbral: 'Halvskygge-' },
    eclHere: (p) => `${p} % af solen dækket`, eclNotVisible: 'ikke synlig her', eclPartlyVisible: 'delvist synlig',
    noEclipses: 'Ingen formørkelser i sigte', skyMap: 'Nattehimmel', at: 'kl.',
    yearDayLength: 'Daglængde gennem året', sunPath: 'Solbane', upcoming: 'Kommende',
    earliestSunrise: 'Tidligste solopgang', latestSunrise: 'Seneste solopgang', earliestSunset: 'Tidligste solnedgang', latestSunset: 'Seneste solnedgang',
    longestDay: 'Længste dag', shortestDay: 'Korteste dag',
    months: ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'], tonight: 'i nat',
  },
};
STR.no = STR.nb;
STR.nn = STR.nb;
const ZODIAC_SYM = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map((s) => s + '︎');
function langStrings(code) {
  const c = String(code || 'en').toLowerCase().slice(0, 2);
  const base = STR.en, l = STR[c] || {};
  return { ...base, ...l, levels: { ...base.levels, ...(l.levels || {}) }, tabs: { ...base.tabs, ...(l.tabs || {}) },
    planetNames: { ...base.planetNames, ...(l.planetNames || {}) }, planetWhen: { ...base.planetWhen, ...(l.planetWhen || {}) },
    eclKinds: { ...base.eclKinds, ...(l.eclKinds || {}) } };
}

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
  language: 'auto',           // auto | de | en | nl | fr | sv | nb | da
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
  aurora_activity_entity: '',
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
  // Layout & Tabs
  layout: 'full',              // full | compact
  show_tabs: true,
  default_tab: 'today',        // today | night | year
  show_night_tab: true,
  show_year_tab: true,
  scrub: true,                 // Zeitregler in der Grafik
  // Wolken & Abendrot
  show_clouds: true,
  cloud_source: 'auto',        // auto | weather | internet | off
  weather_entity: '',
  show_glow: true,
  cloud_update_minutes: 30,
  // Echter Horizont
  horizon_source: 'off',       // off | entity | manual
  horizon_entity: '',
  horizon_profile: '',         // z. B. "0:2, 90:4, 180:1, 270:6"
  // Nacht-Tab
  show_sky_map: true,
  show_sky_tonight: true,
  show_astro_window: true,
  show_planets: true,
  show_meteors: true,
  show_eclipses: true,
  eclipse_years: 3,
  // Jahr-Tab
  show_year_curve: true,
  show_sun_path: true,
  show_year_dates: true,
  // 3D-Tab
  show_3d_tab: true,
  show_house: true,
  house_source: 'generic',     // generic | entity (echtes LoD2-Modell aus der Sol-&-Luna-Integration)
  building_entity: '',
  roof_azimuth: 180,           // Richtung, in die die Hauptdachfläche zeigt (180 = Süd)
  house_width: 10,             // Meter quer zum First
  house_length: 12,            // Meter entlang des Firsts
  wall_height: 6,
  roof_pitch: 35,
  show_pv: true,
  pv_flat_roofs: false,         // PV auch auf Flachdächern (echtes Modell)
  wall_color: '#ece6da',
  roof_color: '#9a4433',
  pv_color: '#1d3557',
  auto_rotate_3d: false,
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
 *  KARTE                                                                  *
 * ====================================================================== */
class SolLunaCard extends HTMLElement {
  static getConfigElement() { return document.createElement('sol-luna-card-editor'); }
  static getStubConfig() { return { title: '', background: 'sky' }; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._timer = null;
    this._cache = new Map();
    this._tab = null;
    this._viewTime = null;
    this._skyTime = null;
    this._bindEvents();
  }

  setConfig(config) {
    if (!config) throw new Error('Invalid configuration');
    const old = this._config;
    this._config = { ...DEFAULTS, ...config };
    if (!old || old.default_tab !== this._config.default_tab) this._tab = null;
    this._cache.clear();
    this._render();
    this._restartTimer();
    this._syncWeatherSub();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    const c = this._config || {};
    const hz = c.horizon_source === 'entity' && c.horizon_entity ? hass?.states?.[c.horizon_entity]?.last_updated : '';
    const bm = c.house_source === 'entity' && c.building_entity ? hass?.states?.[c.building_entity]?.last_updated : '';
    const key = [hass?.config?.latitude, hass?.config?.longitude, hass?.config?.time_zone, hass?.config?.elevation,
      hass?.locale?.language || hass?.language, hass?.locale?.time_format, hz, bm].join('|');
    const ak = this._config ? this._auroraKey() : '';
    if (first || key !== this._hassKey || ak !== this._auroraK) {
      if (key !== this._hassKey) this._cache.clear();
      this._hassKey = key; this._auroraK = ak; this._render();
    }
    this._syncWeatherSub();
  }

  connectedCallback() {
    this._restartTimer();
    this._noaaListener = this._noaaListener || (() => { if ((this._usesInternet || this._usesMeteo) && !this._scrubbing) this._render(); });
    NOAA.listeners.add(this._noaaListener);
    this._syncWeatherSub();
  }
  disconnectedCallback() {
    clearInterval(this._timer); this._timer = null;
    NOAA.listeners.delete(this._noaaListener);
    this._unsubWeather();
  }

  _restartTimer() {
    clearInterval(this._timer);
    if (!this.isConnected || !this._config || this._config.now) return;
    const s = Math.max(5, Number(this._config.refresh_period) || 60);
    this._timer = setInterval(() => { if (!this._scrubbing) this._render(); }, s * 1000);
  }

  getCardSize() {
    const c = this._config || DEFAULTS;
    if (c.layout === 'compact') return 3;
    return 2 + (c.show_graph ? 3 : 0) + (c.show_sun_times ? 2 : 0) + (c.show_moon ? 3 : 0) + (c.show_season || c.show_position ? 1 : 0);
  }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  /* ---------- Ereignisse (Tabs, Zeitregler, Klicks) -------------------- */
  _bindEvents() {
    const root = this.shadowRoot;
    root.addEventListener('click', (e) => {
      const el = e.composedPath().find((n) => n.dataset && (n.dataset.tab || n.dataset.action || n.dataset.entity));
      if (!el) return;
      if (el.dataset.tab) { this._tab = el.dataset.tab; this._render(); return; }
      if (el.dataset.action === 'now') { this._viewTime = null; this._skyTime = null; clearTimeout(this._scrubReset); this._render(); return; }
      if (el.dataset.entity) {
        const id = el.dataset.entity;
        if (id.startsWith('noaa:')) {
          window.open(id === 'noaa:ov' ? 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast' : 'https://www.swpc.noaa.gov/products/planetary-k-index', '_blank', 'noopener');
          return;
        }
        this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: id }, bubbles: true, composed: true }));
      }
    });
    root.addEventListener('input', (e) => {
      const el = e.composedPath()[0];
      if (el?.dataset?.action === 'skytime') { this._skyTime = Number(el.value); this._updateSkyMap(); }
      if (el?.dataset?.action === 't3d') this._onT3d(el.value);
    });
    root.addEventListener('pointerdown', (e) => {
      const cv = e.composedPath().find((n) => n.classList && n.classList.contains('c3d'));
      if (cv) {
        this._rot3d = { x: e.clientX, y: e.clientY, yaw: this._yaw3d ?? 105, pitch: this._pitch3d ?? 30, id: e.pointerId };
        try { this.setPointerCapture(e.pointerId); } catch (x) { /* */ }
        e.preventDefault();
        return;
      }
      if (!this._config?.scrub || !this._graphMeta) return;
      const g = e.composedPath().find((n) => n.classList && n.classList.contains('graph'));
      if (!g) return;
      this._scrubbing = true; this._scrubPointer = e.pointerId;
      try { this.setPointerCapture(e.pointerId); } catch (x) { /* */ }
      this._scrubTo(e.clientX);
    });
    this.addEventListener('pointermove', (e) => {
      const R3 = this._rot3d;
      if (R3 && e.pointerId === R3.id) {
        this._yaw3d = (R3.yaw - (e.clientX - R3.x) * 0.5 + 360) % 360;
        this._pitch3d = clamp(R3.pitch + (e.clientY - R3.y) * 0.3, 4, 80);
        if (!this._raf3) this._raf3 = requestAnimationFrame(() => { this._raf3 = null; this._draw3d(); });
      }
    });
    const end3 = (e) => { if (this._rot3d && e.pointerId === this._rot3d.id) { this._rot3d = null; try { this.releasePointerCapture(e.pointerId); } catch (x) { /* */ } } };
    this.addEventListener('pointerup', end3);
    this.addEventListener('pointercancel', end3);
    this.addEventListener('pointermove', (e) => { if (this._scrubbing && e.pointerId === this._scrubPointer) this._scrubTo(e.clientX); });
    const end = (e) => {
      if (!this._scrubbing) return;
      this._scrubbing = false;
      try { this.releasePointerCapture(e.pointerId); } catch (x) { /* */ }
      clearTimeout(this._scrubReset);
      this._scrubReset = setTimeout(() => { this._viewTime = null; this._render(); }, 60000);
    };
    this.addEventListener('pointerup', end);
    this.addEventListener('pointercancel', end);
  }

  _scrubTo(clientX) {
    const svg = this.shadowRoot.querySelector('.graph svg');
    const M = this._graphMeta;
    if (!svg || !M) return;
    const r = svg.getBoundingClientRect();
    const vx = (clientX - r.left) / r.width * M.W;
    this._viewTime = M.start + clamp((vx - M.padX) / (M.W - 2 * M.padX), 0, 1) * M.span;
    if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = null; this._render(); });
  }

  /* ---------- Einstellungen ableiten ---------------------------------- */
  _lang() {
    const c = this._config;
    let l = c.language && c.language !== 'auto' ? c.language : (this._hass?.locale?.language || this._hass?.language || navigator.language || 'en');
    l = String(l).toLowerCase();
    return { code: l, t: langStrings(l) };
  }
  _hour12() {
    const f = this._config.time_format !== 'auto' ? this._config.time_format : this._hass?.locale?.time_format;
    if (f === '12' || f === 12) return true;
    if (f === '24' || f === 24) return false;
    return undefined;
  }
  _cached(key, fn) {
    if (!this._cache.has(key)) {
      if (this._cache.size > 60) this._cache.clear();
      this._cache.set(key, fn());
    }
    return this._cache.get(key);
  }

  _ctx() {
    const c = this._config, hc = this._hass?.config || {};
    const lat = Number(c.latitude ?? hc.latitude ?? 52.52);
    const lng = Number(c.longitude ?? hc.longitude ?? 13.405);
    const tz = c.time_zone || hc.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const elev = Number(hc.elevation) || 0;
    const live = c.now ? new Date(c.now).valueOf() : Date.now();
    const now = this._viewTime ?? live;
    return { lat, lng, tz, elev, now, live, horizon: this._horizon() };
  }

  _horizon() {
    const c = this._config;
    if (c.horizon_source === 'manual' && c.horizon_profile) {
      return this._cached('hz|m|' + c.horizon_profile, () => parseHorizon(c.horizon_profile));
    }
    if (c.horizon_source === 'entity' && c.horizon_entity) {
      const st = this._hass?.states?.[c.horizon_entity];
      const a = st?.attributes || {};
      const src = a.horizon ?? a.horizon_profile ?? a.profile ?? a.points;
      if (!src) return null;
      return this._cached('hz|e|' + c.horizon_entity + '|' + st.last_updated, () => parseHorizon(src));
    }
    return null;
  }

  /* ---------- Berechnung ---------------------------------------------- */
  _dayData(X, start) {
    const hk = X.horizon ? X.horizon.points.map((p) => p.join(':')).join(',') : '';
    return this._cached(`day|${start}|${X.lat}|${X.lng}|${hk}`, () => {
      const end = localMidnight(start + 30 * HOUR_MS, X.tz);
      const step = 2 * MIN_MS;
      const S = [];
      for (let t = start; t <= end + 1; t += step) {
        const s = Astro.sun(t, X.lat, X.lng);
        const m = Astro.moon(t, X.lat, X.lng);
        S.push({ t, s: s.alt, saz: s.az, m: m.alt, mt: m.altTopo, maz: m.az, sh: X.horizon ? s.alt - X.horizon(s.az) : null });
      }
      const cr = (thr) => crossings(S, 's', thr);
      const c083 = cr(-0.833), c6 = cr(6), c4 = cr(-4), c6n = cr(-6);
      let ni = 0;
      S.forEach((p, i) => { if (p.s > S[ni].s) ni = i; });
      let noon = S[ni].t;
      if (ni > 0 && ni < S.length - 1) {
        const a = S[ni - 1].s, b = S[ni].s, d = S[ni + 1].s, den = a - 2 * b + d;
        if (den !== 0) noon += clamp(0.5 * (a - d) / den, -1, 1) * step;
      }
      const sunrise = first(c083, true), sunset = first(c083, false);
      const maxAlt = S[ni].s, minAlt = Math.min(...S.map((p) => p.s));
      let dayLen = null;
      if (sunrise != null && sunset != null) dayLen = sunset - sunrise;
      else if (minAlt > -0.833) dayLen = DAY_MS;
      else if (maxAlt < -0.833) dayLen = 0;
      const ap = Astro.sunTimesApprox(start, X.lat, X.lng), ay = Astro.sunTimesApprox(localMidnight(start - 12 * HOUR_MS, X.tz), X.lat, X.lng);
      const yLen = dayLen != null && ap.len != null && ay.len != null ? dayLen - (ap.len - ay.len) : null;
      let realRise = null, realSet = null;
      if (X.horizon) {
        const ch = crossings(S, 'sh', -0.833);
        realRise = first(ch, true); realSet = first(ch, false);
      }
      const mr = crossings(S, 'm', 0.125);
      return {
        start, end, samples: S, sunrise, sunset, noon, maxAlt, minAlt, dayLen, yLen, realRise, realSet,
        blueStartM: first(c6n, true), blueEndM: first(c4, true), goldenEndM: first(c6, true),
        goldenStartE: first(c6, false), goldenEndE: first(c4, false), blueEndE: first(c6n, false),
        civilDawn: first(c6n, true), civilDusk: first(c6n, false),
        moonrise: first(mr, true), moonset: first(mr, false),
      };
    });
  }

  _compute() {
    const X = this._ctx();
    const start = localMidnight(X.now, X.tz);
    const day = this._dayData(X, start);
    const sunNow = Astro.sun(X.now, X.lat, X.lng);
    const moonNow = Astro.moon(X.now, X.lat, X.lng);
    const b0 = band(sunNow.alt);
    let nextBand = null, nextBandAt = null;
    for (let t = X.now + MIN_MS; t < X.now + 40 * HOUR_MS; t += MIN_MS) {
      const b = band(Astro.sun(t, X.lat, X.lng).alt);
      if (b !== b0) { nextBand = b; nextBandAt = t; break; }
    }
    const hourKey = Math.floor(X.now / HOUR_MS);
    const phases = this._cached(`ph|${hourKey}|${X.lat}|${X.lng}`, () => [0, 90, 180, 270].map((target, i) => {
      const t = Astro.findCross(Astro.elongation, target, X.now, 6 * HOUR_MS, 140);
      return t == null ? null : { i, t, dist: i === 2 || i === 0 ? Astro.moon(t, X.lat, X.lng).dist : null };
    }).filter(Boolean).sort((a, b) => a.t - b.t));
    const season = this._cached(`se|${Math.floor(X.now / DAY_MS)}`, () => [0, 90, 180, 270].map((target, i) => {
      const t = Astro.findCross(Astro.sunLon, target, X.now, DAY_MS, 372);
      return t == null ? null : { i, t };
    }).filter(Boolean).sort((a, b) => a.t - b.t));
    return { ...X, ...day, sunNow, moonNow, b0, nextBand, nextBandAt, phases, season: season[0], seasons: season };
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
    const compact = c.layout === 'compact';
    const moonRot = this._moonRotation(D);
    let A = null, CL = null;
    try { CL = this._clouds(D); } catch (e) { console.error('sol-luna-card clouds', e); }
    D.clouds = CL;
    try { A = this._auroraData(D, t, F); if (A) A.sky = this._skyTonight(D); } catch (e) { console.error('sol-luna-card aurora', e); }

    const tabsAvail = ['today', c.show_night_tab && 'night', c.show_year_tab && 'year', c.show_3d_tab && 'sky3d'].filter(Boolean);
    const tabsOn = !compact && c.show_tabs && tabsAvail.length > 1;
    let tab = tabsOn ? (this._tab || c.default_tab || 'today') : 'today';
    if (!tabsAvail.includes(tab)) tab = 'today';

    const nowChip = this._viewTime != null
      ? `<button class="nowchip" data-action="now" title="${esc(t.now)}"><ha-icon icon="mdi:clock-time-four-outline"></ha-icon>${F.time(D.now)} · ${esc(t.now)} ↺</button>` : '';
    const header = c.show_header ? `
      <div class="header">
        <div class="title">${c.icon ? `<ha-icon icon="${esc(c.icon)}"></ha-icon>` : ''}<span>${esc(c.title || t.title)}</span></div>
        <div class="hright">${nowChip}${c.show_status ? this._statusHtml(D, t, F) : ''}</div>
      </div>` : (nowChip ? `<div class="header"><span></span>${nowChip}</div>` : '');
    const tabs = tabsOn ? `<div class="tabs">${tabsAvail.map((k) =>
      `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${esc(t.tabs[k])}</button>`).join('')}</div>` : '';

    let body = '';
    this._graphMeta = null;
    if (compact) body = this._compactHtml(D, t, F, sky, moonRot, A);
    else if (tab === 'night') body = this._nightHtml(D, t, F, moonRot, A);
    else if (tab === 'year') body = this._yearHtml(D, t, F);
    else if (tab === 'sky3d') body = this._html3d(D, t, F);
    else {
      body = (c.show_graph ? this._graphHtml(D, t, F, sky, moonRot) : '') +
        (c.show_sun_times ? this._sunTimesHtml(D, t, F) : '') +
        (c.show_moon ? this._moonHtml(D, t, F, moonRot) : '') +
        (A ? this._auroraHtml(A, t, F) : '') +
        ((c.show_position || c.show_season) ? this._footerHtml(D, t, F) : '');
    }

    const cloudNow = CL ? cloudAt(CL.hours, D.now) : null;
    const cloudF = cloudNow ? 1 - cloudNow.total / 100 : 1;
    const auroraSky = A && (sky || mode === 'dark') && c.aurora_effect ? this._auroraSkyHtml(this._auroraIntensity(A) * (sky ? 1 : 0.7) * cloudF, night) : '';
    const stars = (sky || mode === 'dark') && c.stars && night > 0 ? this._starsHtml(night * (sky ? 1 : 0.5) * (0.25 + 0.75 * cloudF), anim) : '';
    const cloudVeil = sky && cloudNow && cloudNow.total > 20 ? `<div class="veil" style="opacity:${(cloudNow.total / 100 * 0.55).toFixed(2)}"></div>` : '';

    this.shadowRoot.innerHTML = `
      <style>${this._css()}</style>
      <ha-card class="${mode} ${anim ? 'anim' : ''} ${compact ? 'compact' : ''}" style="
        --slc-sun:${esc(c.sun_color)}; --slc-moon:${esc(c.moon_color)}; --slc-golden:${esc(c.golden_color)};
        --slc-blue:${esc(c.blue_color)}; --slc-curve:${esc(c.curve_color)}; --slc-aurora:${esc(c.aurora_color)};
        ${sky ? `--slc-sky-top:${skyTop}; --slc-sky-bottom:${skyBottom};` : ''}">
        ${sky ? '<div class="skybg"></div>' : ''}
        ${stars}
        ${cloudVeil}
        ${auroraSky}
        <div class="content">${header}${tabs}${body}</div>
      </ha-card>`;
    if (tab === 'sky3d' && !compact) this._after3d(D);
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
    res.activity = manual('aurora_activity_entity') || aur.find((id) => id.startsWith('sensor.') &&
      /activity|aktivit/.test(txt(id)) && !/today|heute|tomorrow|morgen|day_?[0-2]|day.after|forecast|vorhersage/.test(txt(id)) &&
      String(st[id].state).length <= 24) || null;
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
    const any = res.vis || res.alert || res.kp || res.activity || res.days.some((d) => d.level || d.text);
    return any ? res : null;
  }

  _auroraKey() {
    const e = this._config && this._auroraEntities();
    if (!e) return '';
    const st = this._hass.states;
    return [e.vis, e.alert, e.kp, e.activity, ...e.days.flatMap((d) => [d.level, d.text])].map((id) => (id ? st[id]?.state : '')).join('|');
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
      activity: e.activity ? st[e.activity]?.state : null,
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
      e: { vis: ov || c.aurora_ovation ? 'noaa:ov' : null, alert: 'noaa:alert', kp: 'noaa:kp', activity: kpNow != null ? 'noaa:kp' : null, days },
      vis, alert, kp: kpNow, activity: kpNow != null ? kpLevelKey(kpNow) : null, days, internet: true, loading,
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
        <div><div class="aval">${kp == null ? '—' : F.num(kp, 1)} <span class="kpw" style="color:${kp == null ? 'inherit' : kpColor(kp)}">${kp == null ? '' : esc(kpText(kp, t))}</span></div>
        <div class="kpbar">${segs}</div><div class="albl">${esc(t.kp)}</div></div></div>`);
    }
    if (A.e.activity) {
      const lvl = auroraLevel(A.activity);
      stats.push(`<div class="astat" data-entity="${esc(A.e.activity)}"><ha-icon icon="mdi:waveform" style="color:${AURORA_LEVEL_COLORS[lvl]}"></ha-icon>
        <div><div class="aval"><span class="chip" style="--chip:${AURORA_LEVEL_COLORS[lvl]}">${esc(tr(A.activity))}</span></div><div class="albl">${esc(t.activity)}</div></div></div>`);
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
        ${A.sky ? `<span class="skychip c${A.sky.cls}" title="${esc(t.skyTonight)}"><ha-icon icon="${['mdi:weather-night', 'mdi:weather-night-partly-cloudy', 'mdi:weather-cloudy'][A.sky.cls]}"></ha-icon>${esc(t.cloudClasses[A.sky.cls])} · ${Math.round(A.sky.avg)} %</span>` : ''}
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
    const above = { small: 52, normal: 80, large: 110 }[this._sizeOverride || c.graph_size] || 80;
    const below = Math.round(above * 0.42);
    const showCl = c.show_clouds && D.clouds && D.clouds.hours.length;
    const W = 400, padX = 6, top = showCl ? 24 : 16, H = top + above + below + 20;
    const hy = top + above;
    const span = D.end - D.start;
    const x = (ms) => padX + (ms - D.start) / span * (W - 2 * padX);
    this._graphMeta = { W, padX, start: D.start, span };
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
    const chartBg = sky || !c.graph_sky ? '' : `<rect x="0" y="${top - 8}" width="${W}" height="${hy + below - top + 8}" rx="10" fill="url(#bgsky)"/>`;
    // Wolkenstreifen (stündlich)
    let cloudStrip = '';
    if (showCl) {
      const hw = (W - 2 * padX) / (span / HOUR_MS);
      for (let tt = D.start; tt < D.end; tt += HOUR_MS) {
        const h = cloudAt(D.clouds.hours, tt + HOUR_MS / 2);
        if (!h) continue;
        cloudStrip += `<rect x="${x(tt).toFixed(1)}" y="4" width="${(hw - 0.6).toFixed(1)}" height="10" rx="2" class="cloudcell" style="opacity:${(0.08 + h.total / 100 * 0.82).toFixed(2)}"><title>${F.time(tt)} · ${Math.round(h.total)} %</title></rect>`;
      }
      cloudStrip = `<g>${cloudStrip}</g>`;
    }
    // Gelände-Silhouette (echter Horizont in Richtung Sonne)
    let terrain = '';
    if (D.horizon) {
      const tp = S.filter((_, i) => i % 3 === 0).map((p) => `L ${x(p.t).toFixed(1)},${Math.min(hy, y(Math.max(0, D.horizon(p.saz)))).toFixed(1)}`).join(' ');
      terrain = `<path d="M ${x(S[0].t).toFixed(1)},${hy} ${tp} L ${x(S[S.length - 1].t).toFixed(1)},${hy} Z" class="terrain"/>`;
    }
    const liveLine = D.now !== D.live && D.live >= D.start && D.live <= D.end
      ? `<line x1="${x(D.live)}" x2="${x(D.live)}" y1="${top - 6}" y2="${hy + below}" class="liveline"/>` : '';
    const handle = c.scrub ? `<g class="handle"><circle cx="${nowX}" cy="${hy + below}" r="5"/><path d="M ${nowX - 2} ${hy + below} h4" /></g>` : '';

    return `
    <div class="graph ${c.scrub ? 'scrub' : ''}">
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
        ${cloudStrip}
        ${bands}
        <rect x="0" y="${hy}" width="${W}" height="${below + 2}" class="below"/>
        <path d="${area}" fill="url(#pastfill)" clip-path="url(#past)"/>
        ${lines}
        ${c.show_moon_in_graph ? `<polyline points="${pts('mt')}" class="mooncurve" style="stroke:${esc(c.moon_curve_color)}"/>` : ''}
        <polyline points="${pts('s')}" class="suncurve"/>
        ${terrain}
        <line x1="0" x2="${W}" y1="${hy}" y2="${hy}" class="horizon"/>
        ${ticks}
        ${liveLine}
        <line x1="${nowX}" x2="${nowX}" y1="${top - 6}" y2="${hy + below}" class="nowline"/>
        ${handle}
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
    const c = this._config;
    const glow = (when, label) => {
      if (!c.show_glow || !D.clouds || when == null) return '';
      const g = glowChance(cloudAt(D.clouds.hours, when));
      if (g == null) return '';
      const cls = g >= 60 ? 'g-hi' : g >= 30 ? 'g-mid' : 'g-lo';
      return `<div class="glow ${cls}" title="${esc(label)}"><ha-icon icon="mdi:weather-sunset"></ha-icon>${esc(label)} ${g} %</div>`;
    };
    const real = (astro, realT) => (realT != null && astro != null && Math.abs(realT - astro) > 2 * MIN_MS)
      ? `<div class="realt" title="${esc(t.overTerrain)}"><ha-icon icon="mdi:image-filter-hdr"></ha-icon>${F.time(realT)}</div>` : '';
    return `
    <div class="suntimes">
      <div class="col">
        <div class="colhead">${esc(t.morning)}</div>
        ${row('mdi:circle-half-full', t.blue, range(D.blueStartM, D.blueEndM), 'blue', D.blueEndM)}
        ${row('mdi:camera-iris', t.golden, range(D.blueEndM, D.goldenEndM), 'golden', D.goldenEndM)}
        ${row('mdi:weather-sunset-up', t.sunrise, F.time(D.sunrise), 'strong', D.sunrise)}
        ${real(D.sunrise, D.realRise)}
        ${glow(D.sunrise, t.glowMorning)}
      </div>
      <div class="mid">
        <div class="colhead">${esc(t.dayLength)}</div>
        ${center}${delta}
        <div class="noon"><ha-icon icon="mdi:white-balance-sunny"></ha-icon>${esc(t.noon)} ${F.time(D.noon)} · ${F.num(D.maxAlt, 1)}°</div>
      </div>
      <div class="col right">
        <div class="colhead">${esc(t.evening)}</div>
        ${row('mdi:weather-sunset-down', t.sunset, F.time(D.sunset), 'strong', D.sunset)}
        ${real(D.sunset, D.realSet)}
        ${glow(D.sunset, t.glowEvening)}
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
    return this._css2() + `
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
    .suntimes { display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); gap:8px; align-items:stretch; }
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
 *  KARTE – Erweiterungen: Wolken, Nacht, Jahr, Kompakt                    *
 * ====================================================================== */
Object.assign(SolLunaCard.prototype, {

  /* ---------- Wolken ---------------------------------------------------- */
  _weatherEntity() {
    const c = this._config;
    if (c.weather_entity) return c.weather_entity;
    if (c.cloud_source === 'weather') return Object.keys(this._hass?.states || {}).find((id) => id.startsWith('weather.')) || null;
    return null;
  },
  _usesWeather() {
    const c = this._config;
    return c.show_clouds && (c.cloud_source === 'weather' || (c.cloud_source === 'auto' && !!c.weather_entity));
  },
  _syncWeatherSub() {
    const c = this._config;
    if (!c || !this._hass) return;
    const want = this._usesWeather() ? this._weatherEntity() : null;
    if (want === this._wxEntity && (this._wxUnsubP || !want)) return;
    this._unsubWeather();
    this._wxEntity = want;
    this._wx = null;
    if (!want || !this._hass.connection || !this.isConnected) return;
    try {
      this._wxUnsubP = this._hass.connection.subscribeMessage((msg) => {
        this._wx = (msg.forecast || []).map((f) => ({ t: Date.parse(f.datetime), total: f.cloud_coverage }))
          .filter((f) => Number.isFinite(f.t) && f.total != null);
        if (!this._scrubbing) this._render();
      }, { type: 'weather/subscribe_forecast', forecast_type: 'hourly', entity_id: want });
      this._wxUnsubP.catch?.((e) => { this._wxErr = String(e?.message || e); });
    } catch (e) { this._wxErr = String(e); }
  },
  _unsubWeather() {
    if (this._wxUnsubP) { Promise.resolve(this._wxUnsubP).then((u) => u && u()).catch(() => {}); this._wxUnsubP = null; }
    this._wxEntity = null;
  },
  _clouds(D) {
    const c = this._config;
    this._usesMeteo = false;
    if (!c.show_clouds || c.cloud_source === 'off') return null;
    if (this._usesWeather()) {
      let hours = this._wx || [];
      if (!hours.length) {
        const cc = this._hass?.states?.[this._weatherEntity()]?.attributes?.cloud_coverage;
        if (cc != null) hours = [{ t: D.live, total: Number(cc) }];
      }
      return hours.length ? { hours, source: t => t.weatherSrc, layers: false } : null;
    }
    this._usesMeteo = true;
    const slot = meteoGet(D.lat, D.lng, Math.max(10, Number(c.cloud_update_minutes) || 30) * MIN_MS);
    return slot.data && slot.data.length ? { hours: slot.data, source: () => 'Open-Meteo', layers: true } : null;
  },
  _skyTonight(D) {
    if (!D.clouds) return null;
    const N = this._nightData(D);
    let a = N.darkStart ?? (D.start + 20 * HOUR_MS);
    const b = N.darkEnd ?? (a + 8 * HOUR_MS);
    if (D.now > a && D.now < b) a = D.now;
    const hs = D.clouds.hours.filter((h) => h.t >= a - 30 * MIN_MS && h.t <= b + 30 * MIN_MS);
    if (!hs.length) {
      const one = cloudAt(D.clouds.hours, D.now);
      if (!one) return null;
      return { avg: one.total, cls: one.total < 25 ? 0 : one.total < 65 ? 1 : 2, hours: [one], a, b };
    }
    const avg = hs.reduce((s, h) => s + h.total, 0) / hs.length;
    return { avg, cls: avg < 25 ? 0 : avg < 65 ? 1 : 2, hours: hs, a, b };
  },

  /* ---------- Nacht-Daten ------------------------------------------------ */
  _nightData(D) {
    const base = D.now < D.start + 12 * HOUR_MS ? D.start - 12 * HOUR_MS : D.start + 12 * HOUR_MS;
    return this._cached(`night|${base}|${D.lat}|${D.lng}`, () => {
      const step = 5 * MIN_MS, S = [];
      for (let t = base; t <= base + 24 * HOUR_MS; t += step) {
        S.push({ t, s: Astro.sun(t, D.lat, D.lng).alt, m: Astro.moon(t, D.lat, D.lng).altTopo });
      }
      const seg = (pred) => {
        const out = []; let a = null;
        S.forEach((p, i) => {
          const ok = pred(p);
          if (ok && a == null) a = p.t;
          if ((!ok || i === S.length - 1) && a != null) { out.push([a, p.t]); a = null; }
        });
        return out;
      };
      const longest = (arr) => arr.reduce((b, x) => (!b || x[1] - x[0] > b[1] - b[0] ? x : b), null);
      const sum = (arr) => arr.reduce((s, x) => s + x[1] - x[0], 0);
      const astro = seg((p) => p.s < -18), moonFree = seg((p) => p.s < -18 && p.m < 0), dark = seg((p) => p.s < -4);
      const dk = longest(dark);
      const planets = PLANETS.map((name) => {
        if (!dk) return { name, visible: false };
        const vis = []; let best = null;
        for (let t = dk[0]; t <= dk[1]; t += 10 * MIN_MS) {
          const p = Astro.planet(name, t, D.lat, D.lng);
          if (p.alt > 5) { vis.push(t); if (!best || p.alt > best.alt) best = { ...p, t }; }
        }
        if (!vis.length) return { name, visible: false };
        const v1 = vis[0], v2 = vis[vis.length - 1];
        const nearA = v1 <= dk[0] + 40 * MIN_MS, nearB = v2 >= dk[1] - 40 * MIN_MS;
        const when = nearA && nearB ? 'allNight' : nearA ? 'evening' : nearB ? 'morning' : 'night';
        return { name, visible: true, from: v1, to: v2, best, when };
      });
      return {
        base, S, astro: longest(astro), astroTotal: sum(astro), moonFree: longest(moonFree), moonFreeTotal: sum(moonFree),
        darkStart: dk?.[0], darkEnd: dk?.[1], planets,
      };
    });
  },

  _events(D) {
    const c = this._config;
    const dayKey = Math.floor(D.live / DAY_MS);
    return this._cached(`ev|${dayKey}|${D.lat}|${D.lng}|${c.eclipse_years}|${c.show_eclipses}`, () => {
      const years = clamp(Number(c.eclipse_years) || 3, 1, 10);
      const eclipses = c.show_eclipses ? findEclipses(D.live - DAY_MS, D.live + years * 365.25 * DAY_MS, D.lat, D.lng, D.elev) : [];
      const y = tzParts(D.live, D.tz).y;
      const mk = (yy, md) => localMidnight(Date.UTC(yy, md[0] - 1, md[1], 12), D.tz);
      const all = [];
      for (const m of METEORS) {
        for (const yy of [y - 1, y, y + 1]) {
          const peak = mk(yy, m.peak);
          let from = mk(yy, m.from), to = mk(yy, m.to) + DAY_MS;
          if (from > peak) from = mk(yy - 1, m.from);
          if (to < peak) to = mk(yy + 1, m.to) + DAY_MS;
          if (to >= D.live) all.push({ ...m, peak, from, to });
        }
      }
      all.sort((a, b) => a.peak - b.peak);
      const seen = new Set();
      const meteors = all.filter((m) => !seen.has(m.id) && seen.add(m.id)).slice(0, 4);
      meteors.forEach((m) => {
        const mo = Astro.moon(m.peak + 2 * HOUR_MS, D.lat, D.lng);
        m.moonK = mo.k; m.moonUp = mo.altTopo > 0;
      });
      return { eclipses, meteors };
    });
  },

  _moonRotFor(m, lat) {
    if (this._config.moon_orientation === 'simple') {
      const south = lat < 0;
      return { lit: (m.phase < 0.5 ? 0 : 180) + (south ? 180 : 0), face: south ? 180 : 0 };
    }
    return { lit: -(m.chi - m.q) - 90, face: m.q };
  },

  /* ---------- Nacht-Tab -------------------------------------------------- */
  _skyRef(D, N) {
    if (this._skyTime != null && N.darkStart && this._skyTime >= N.base && this._skyTime <= N.base + 24 * HOUR_MS) return this._skyTime;
    if (D.sunNow.alt < -6) return D.now;
    if (N.darkStart) return Math.min(N.darkEnd, N.darkStart + 90 * MIN_MS);
    return D.now;
  },

  _nightHtml(D, t, F, rot, A) {
    const c = this._config;
    const N = this._nightData(D);
    const E = this._events(D);
    const tiles = [];
    if (c.show_sky_map) {
      const tSky = this._skyRef(D, N);
      const lo = N.darkStart ?? N.base, hi = N.darkEnd ?? N.base + 24 * HOUR_MS;
      tiles.push(`
        <div class="tile skymaptile wide">
          <div class="tilehead"><ha-icon icon="mdi:star-four-points-outline"></ha-icon>${esc(t.skyMap)} <span class="skytime">${F.time(tSky)}</span></div>
          <div class="skymap-holder">${this._skyMapSvg(D, tSky, t, A)}</div>
          <input type="range" class="skyrange" data-action="skytime" min="${lo}" max="${hi}" step="${10 * MIN_MS}" value="${clamp(tSky, lo, hi)}">
        </div>`);
    }
    const side = [];
    if (c.show_sky_tonight && D.clouds) {
      const sk = this._skyTonight(D);
      if (sk) {
        const bars = sk.hours.slice(0, 16).map((h) => `<div class="cbar" title="${F.time(h.t)} · ${Math.round(h.total)} %"><i style="height:${Math.max(4, h.total)}%"></i><span>${F.time(h.t).slice(0, 2)}</span></div>`).join('');
        side.push(`
          <div class="tile">
            <div class="tilehead"><ha-icon icon="${['mdi:weather-night', 'mdi:weather-night-partly-cloudy', 'mdi:weather-cloudy'][sk.cls]}"></ha-icon>${esc(t.skyTonight)}</div>
            <div class="bigline c${sk.cls}">${esc(t.cloudClasses[sk.cls])} <span>· ${Math.round(sk.avg)} % ${esc(t.clouds)}</span></div>
            <div class="cbars">${bars}</div>
            <div class="asrc">${esc(t.source)}: ${esc(D.clouds.source(t))}</div>
          </div>`);
      }
    }
    if (c.show_astro_window) {
      const body = N.astro
        ? `<div class="kv"><span>${esc(t.astroNight)}</span><b>${F.time(N.astro[0])}–${F.time(N.astro[1])}</b></div>
           <div class="kv"><span>${esc(t.moonFree)}</span><b>${N.moonFree ? `${F.time(N.moonFree[0])}–${F.time(N.moonFree[1])}` : '—'}</b></div>
           <div class="kv dim"><span>${esc(t.darkHours)}</span><b>${F.dur(N.moonFreeTotal)}</b></div>`
        : `<div class="kv"><span>${esc(t.noAstroNight)}</span></div>`;
      side.push(`<div class="tile"><div class="tilehead"><ha-icon icon="mdi:telescope"></ha-icon>${esc(t.astroNight)}</div>${body}</div>`);
    }
    if (side.length) tiles.push(`<div class="stack">${side.join('')}</div>`);

    if (c.show_planets) {
      const rows = N.planets.map((p) => {
        const name = t.planetNames[p.name];
        if (!p.visible) return `<div class="prow off"><span class="pdot" style="background:${PLANET_COLORS[p.name]}"></span><b>${esc(name)}</b><span class="pw">${esc(t.notVisibleTonight)}</span></div>`;
        let when = t.planetWhen[p.when];
        if (p.name === 'venus' && p.when === 'evening') when = t.eveningStar;
        if (p.name === 'venus' && p.when === 'morning') when = t.morningStar;
        const dir = t.dirs[Math.round(p.best.az / 45) % 8];
        return `<div class="prow"><span class="pdot" style="background:${PLANET_COLORS[p.name]};box-shadow:0 0 6px ${PLANET_COLORS[p.name]}"></span><b>${esc(name)}</b>
          <span class="pw">${esc(when)} · ${F.time(p.from)}–${F.time(p.to)}</span>
          <span class="pb">${esc(t.best)} ${F.time(p.best.t)} ${dir} ${F.num(p.best.alt)}° · ${F.num(p.best.mag, 1)} mag</span></div>`;
      }).join('');
      tiles.push(`<div class="tile wide"><div class="tilehead"><ha-icon icon="mdi:orbit"></ha-icon>${esc(t.planets)}</div><div class="plist">${rows}</div></div>`);
    }

    const evParts = [];
    const rel = (ms) => {
      const days = Math.round((localMidnight(ms, D.tz) - localMidnight(D.live, D.tz)) / DAY_MS);
      return days <= 0 ? t.today : days === 1 ? t.tomorrow : t.inDays(days);
    };
    if (c.show_meteors && E.meteors.length) {
      evParts.push(`<div class="evhead"><ha-icon icon="mdi:star-shooting-outline"></ha-icon>${esc(t.meteors)}</div>` + E.meteors.slice(0, 3).map((m) => {
        const active = D.live >= m.from && D.live <= m.to;
        const moonTxt = m.moonUp && m.moonK > 0.35 ? t.moonDisturbs(Math.round(m.moonK * 100)) : t.moonOk;
        return `<div class="ev ${active ? 'act' : ''}"><div class="evt"><b>${esc(t.meteorNames[m.id])}</b>${active ? `<span class="badge act">${esc(t.active)}</span>` : ''}</div>
          <span>${esc(t.peak)} ${esc(F.date(m.peak))} (${esc(rel(m.peak))}) · ~${m.zhr}${esc(t.perHour || '/h')} · ${esc(moonTxt)}</span></div>`;
      }).join(''));
    }
    if (c.show_eclipses) {
      const list = E.eclipses.filter((e) => e.kind !== 'elsewhere').slice(0, 4);
      const code = this._lang().code;
      const name = (e) => {
        const noun = e.type === 'solar' ? t.solarEclipse : t.lunarEclipse;
        const kind = t.eclKinds[e.kind] || '';
        if (code.startsWith('fr')) return noun.charAt(0).toUpperCase() + noun.slice(1) + ' ' + kind.toLowerCase();
        return kind.endsWith('-') ? kind + noun : `${kind} ${noun}`;
      };
      evParts.push(`<div class="evhead"><ha-icon icon="mdi:circle-half-full"></ha-icon>${esc(t.eclipses)}</div>` + (list.length ? list.map((e) => {
        const detail = e.type === 'solar' ? t.eclHere(Math.round(e.obsc * 100)) : `${t.eclMag} ${F.num(e.mag, 2)}`;
        const vis = !e.visible ? t.eclNotVisible
          : (e.vStart > e.start + 5 * MIN_MS || e.vEnd < e.end - 5 * MIN_MS) ? `${t.eclPartlyVisible} ${F.time(e.vStart)}–${F.time(e.vEnd)}` : `${F.time(e.start)}–${F.time(e.end)}`;
        return `<div class="ev ${e.visible ? '' : 'off'}"><b>${esc(name(e))}</b>
          <span>${esc(F.date(e.t))} ${F.time(e.t)} (${esc(rel(e.t))}) · ${e.visible ? esc(detail) + ' · ' : ''}${esc(vis)}</span></div>`;
      }).join('') : `<div class="ev off"><span>${esc(t.noEclipses)}</span></div>`));
    }
    if (evParts.length) tiles.push(`<div class="tile wide evtile">${evParts.join('')}</div>`);
    return `<div class="nightgrid">${tiles.join('')}</div>`;
  },

  _updateSkyMap() {
    const holder = this.shadowRoot.querySelector('.skymap-holder');
    if (!holder) return;
    const D = this._compute();
    D.clouds = this._clouds(D);
    const { t } = this._lang();
    const F = this._fmt(D);
    let A = null;
    try { A = this._auroraData(D, t, F); } catch (e) { /* */ }
    holder.innerHTML = this._skyMapSvg(D, this._skyTime, t, A);
    const lbl = this.shadowRoot.querySelector('.skytime');
    if (lbl) lbl.textContent = F.time(this._skyTime);
  },

  _skyMapSvg(D, tSky, t, A) {
    const c = this._config;
    const W = 300, cx = 150, cy = 150, R = 136;
    const pr = (alt, az) => {
      const rr = (90 - alt) / 90 * R;
      return [cx - rr * Math.sin(az * RAD), cy - rr * Math.cos(az * RAD)];
    };
    const sun = Astro.sun(tSky, D.lat, D.lng);
    const dark = clamp((-sun.alt - 4) / 12, 0.12, 1);
    const [g1, g2] = skyColors(sun.alt);
    let out = `<defs><radialGradient id="skg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${g1}"/><stop offset="1" stop-color="${g2}"/></radialGradient>
      <radialGradient id="aug" cx="50%" cy="100%" r="80%"><stop offset="0" stop-color="${esc(c.aurora_color)}" stop-opacity=".75"/><stop offset="1" stop-color="${esc(c.aurora_color)}" stop-opacity="0"/></radialGradient>
      <clipPath id="skc"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#skg)"/>`;
    // Polarlicht am Nordhorizont
    if (A) {
      const inten = this._auroraIntensity(A) * dark;
      if (inten > 0.05) {
        const north = D.lat >= 0 ? 0 : 180;
        const [ax, ay] = pr(4, north);
        out += `<g clip-path="url(#skc)"><ellipse cx="${ax}" cy="${ay}" rx="${R * 0.75}" ry="${R * 0.38}" fill="url(#aug)" opacity="${inten.toFixed(2)}" transform="rotate(${north === 0 ? 180 : 0} ${ax} ${ay})"/></g>`;
      }
    }
    // Raster
    out += `<g class="smgrid"><circle cx="${cx}" cy="${cy}" r="${R / 3}"/><circle cx="${cx}" cy="${cy}" r="${R * 2 / 3}"/>
      <line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}"/><line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}"/></g>`;
    // Sterne
    const sp = {};
    for (const name of Object.keys(STARS)) {
      const s = Astro.star(name, tSky, D.lat, D.lng);
      if (s.alt > -2) sp[name] = { ...s, xy: pr(Math.max(0, s.alt), s.az) };
    }
    out += '<g class="smlines">' + STAR_LINES.filter(([a, b]) => sp[a] && sp[b]).map(([a, b, dash]) =>
      `<line x1="${sp[a].xy[0].toFixed(1)}" y1="${sp[a].xy[1].toFixed(1)}" x2="${sp[b].xy[0].toFixed(1)}" y2="${sp[b].xy[1].toFixed(1)}" ${dash ? 'stroke-dasharray="2 3"' : ''} opacity="${(0.45 * dark).toFixed(2)}"/>`).join('') + '</g>';
    out += '<g class="smstars">' + Object.entries(sp).map(([n, s]) =>
      `<circle cx="${s.xy[0].toFixed(1)}" cy="${s.xy[1].toFixed(1)}" r="${Math.max(1.1, 3.4 - 0.75 * s.mag).toFixed(2)}" opacity="${dark.toFixed(2)}"/>` +
      (STAR_LABELS.includes(n) && s.alt > 8 ? `<text x="${(s.xy[0] + 4).toFixed(1)}" y="${(s.xy[1] - 3).toFixed(1)}" opacity="${(0.7 * dark).toFixed(2)}">${n.charAt(0).toUpperCase() + n.slice(1)}</text>` : '')).join('') + '</g>';
    // Planeten
    for (const name of PLANETS) {
      const p = Astro.planet(name, tSky, D.lat, D.lng);
      if (p.alt < 0) continue;
      const [x, y] = pr(p.alt, p.az);
      out += `<g class="smplanet"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${clamp(3.4 - 0.45 * p.mag, 2, 5).toFixed(1)}" fill="${PLANET_COLORS[name]}"/>
        <text x="${(x + 6).toFixed(1)}" y="${(y + 3).toFixed(1)}">${esc(t.planetNames[name])}</text></g>`;
    }
    // Mond
    const m = Astro.moon(tSky, D.lat, D.lng);
    if (m.altTopo > -1) {
      const [x, y] = pr(Math.max(0, m.altTopo), m.az);
      const rr = this._moonRotFor(m, D.lat);
      out += moonSvg(x, y, 9, m.k, rr.lit, rr.face, c.moon_color, { detail: false, glow: true });
    }
    // Sonne
    if (sun.alt > -1) {
      const [x, y] = pr(Math.max(0, sun.alt), sun.az);
      out += `<circle cx="${x}" cy="${y}" r="9" fill="${esc(c.sun_color)}" opacity=".9"/>`;
    }
    // Gelände
    if (D.horizon) {
      const ring = [];
      for (let az = 0; az <= 360; az += 5) ring.push(pr(Math.max(0, D.horizon(az)), az));
      out += `<path class="smterrain" fill-rule="evenodd" d="M ${cx - R} ${cy} a ${R} ${R} 0 1 0 ${2 * R} 0 a ${R} ${R} 0 1 0 ${-2 * R} 0 Z M ${ring.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(' L ')} Z"/>`;
    }
    out += `<circle cx="${cx}" cy="${cy}" r="${R}" class="smrim"/>`;
    const d = t.dirs;
    out += `<g class="smdirs"><text x="${cx}" y="${cy - R - 3}">${d[0]}</text><text x="${cx}" y="${cy + R + 11}">${d[4]}</text>
      <text x="${cx - R - 8}" y="${cy + 4}">${d[2]}</text><text x="${cx + R + 8}" y="${cy + 4}">${d[6]}</text></g>`;
    return `<svg viewBox="-14 -16 ${W + 28} ${W + 32}" class="skymap">${out}</svg>`;
  },

  /* ---------- Jahr-Tab --------------------------------------------------- */
  _yearData(D) {
    const y = tzParts(D.live, D.tz).y;
    return this._cached(`year|${y}|${D.lat}|${D.lng}`, () => {
      const days = [];
      const j1 = localMidnight(Date.UTC(y, 0, 1, 12), D.tz);
      for (let i = 0; i < 366; i++) {
        const mid = localMidnight(j1 + i * DAY_MS + 12 * HOUR_MS, D.tz);
        if (tzParts(mid, D.tz).y !== y) break;
        const a = Astro.sunTimesApprox(mid, D.lat, D.lng);
        days.push({ mid, ...a, riseTod: a.rise != null ? a.rise - mid : null, setTod: a.set != null ? a.set - mid : null });
      }
      const ext = (key, fnc) => days.filter((d) => d[key] != null).reduce((b, d) => (!b || fnc(d[key], b[key]) ? d : b), null);
      return {
        y, days,
        earliestRise: ext('riseTod', (a, b) => a < b), latestRise: ext('riseTod', (a, b) => a > b),
        earliestSet: ext('setTod', (a, b) => a < b), latestSet: ext('setTod', (a, b) => a > b),
        longest: ext('len', (a, b) => a > b), shortest: ext('len', (a, b) => a < b),
      };
    });
  },

  _yearHtml(D, t, F) {
    const c = this._config;
    const Y = this._yearData(D);
    const parts = [];
    if (c.show_year_curve) {
      const W = 400, H = 150, pl = 30, pr = 8, pt = 14, pb = 18;
      const n = Y.days.length;
      const lens = Y.days.map((d) => d.len / HOUR_MS);
      const lo = Math.floor(Math.min(...lens)) - 1, hi = Math.ceil(Math.max(...lens)) + 1;
      const x = (i) => pl + i / (n - 1) * (W - pl - pr);
      const y = (h) => pt + (hi - h) / (hi - lo) * (H - pt - pb);
      const path = lens.map((h, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(h).toFixed(1)}`).join(' ');
      const ti = Y.days.findIndex((d) => d.mid > D.live) - 1;
      const today = ti >= 0 ? ti : n - 1;
      let grid = '';
      for (let h = Math.ceil(lo); h <= hi; h += 2) grid += `<line x1="${pl}" x2="${W - pr}" y1="${y(h)}" y2="${y(h)}" class="ygrid"/><text x="${pl - 4}" y="${y(h) + 3}" class="yax" text-anchor="end">${h} h</text>`;
      Y.days.forEach((d, i) => {
        const p = tzParts(d.mid, D.tz);
        if (p.d === 1) grid += `<line x1="${x(i)}" x2="${x(i)}" y1="${pt}" y2="${H - pb}" class="ygrid"/><text x="${x(i) + 2}" y="${H - 5}" class="yax">${esc(t.months[p.m - 1])}</text>`;
      });
      const mk = (d, lbl) => {
        if (!d) return '';
        const i = Y.days.indexOf(d);
        return `<circle cx="${x(i)}" cy="${y(d.len / HOUR_MS)}" r="2.5" class="ymark"/><text x="${clamp(x(i), pl + 24, W - 30)}" y="${y(d.len / HOUR_MS) + (d === Y.longest ? -6 : 12)}" class="ylbl" text-anchor="middle">${F.dur(d.len)}</text>`;
      };
      parts.push(`
        <div class="tile wide">
          <div class="tilehead"><ha-icon icon="mdi:chart-bell-curve"></ha-icon>${esc(t.yearDayLength)} ${Y.y}</div>
          <svg viewBox="0 0 ${W} ${H}" class="ychart">
            ${grid}
            <path d="${path} L ${x(n - 1)} ${H - pb} L ${x(0)} ${H - pb} Z" class="yarea"/>
            <path d="${path}" class="yline"/>
            ${mk(Y.longest)}${mk(Y.shortest)}
            <line x1="${x(today)}" x2="${x(today)}" y1="${pt}" y2="${H - pb}" class="ytoday"/>
            <circle cx="${x(today)}" cy="${y(lens[today])}" r="4.5" class="ytodaydot"/>
            <text x="${clamp(x(today), pl + 30, W - 34)}" y="${pt - 3}" class="ylbl today" text-anchor="middle">${esc(t.today)} · ${F.dur(Y.days[today].len)}</text>
          </svg>
        </div>`);
    }
    const row2 = [];
    if (c.show_sun_path) row2.push(`<div class="tile"><div class="tilehead"><ha-icon icon="mdi:sun-compass"></ha-icon>${esc(t.sunPath)}</div>${this._sunPathSvg(D, t, F)}</div>`);
    if (c.show_year_dates) {
      const kv = (label, d, key) => d ? `<div class="kv"><span>${esc(label)}</span><b>${esc(F.date(d.mid))} · ${key === 'len' ? F.dur(d.len) : F.time(d[key])}</b></div>` : '';
      const seasons = (D.seasons || []).map((s) => {
        const idx = D.lat < 0 ? (s.i + 2) % 4 : s.i;
        const days = Math.round((localMidnight(s.t, D.tz) - localMidnight(D.live, D.tz)) / DAY_MS);
        return `<div class="kv"><span><ha-icon icon="${['mdi:flower', 'mdi:white-balance-sunny', 'mdi:leaf-maple', 'mdi:snowflake'][idx]}"></ha-icon>${esc(t.seasons[idx])}</span><b>${esc(F.date(s.t))} ${F.time(s.t)} <i>(${esc(days <= 0 ? t.today : days === 1 ? t.tomorrow : t.inDays(days))})</i></b></div>`;
      }).join('');
      row2.push(`<div class="tile"><div class="tilehead"><ha-icon icon="mdi:calendar-star"></ha-icon>${esc(t.upcoming)}</div>${seasons}
        <div class="sep"></div>
        ${kv(t.longestDay, Y.longest, 'len')}${kv(t.shortestDay, Y.shortest, 'len')}
        ${kv(t.earliestSunrise, Y.earliestRise, 'rise')}${kv(t.latestSunrise, Y.latestRise, 'rise')}
        ${kv(t.earliestSunset, Y.earliestSet, 'set')}${kv(t.latestSunset, Y.latestSet, 'set')}
      </div>`);
    }
    if (row2.length) parts.push(`<div class="yeargrid">${row2.join('')}</div>`);
    return parts.join('');
  },

  _sunPathSvg(D, t, F) {
    const c = this._config;
    const W = 300, cx = 150, cy = 150, R = 136;
    const pr = (alt, az) => {
      const rr = (90 - alt) / 90 * R;
      return [cx + rr * Math.sin(az * RAD), cy - rr * Math.cos(az * RAD)];
    };
    const y = tzParts(D.live, D.tz).y;
    const dayPath = (mid, step = 10 * MIN_MS) => {
      const pts = [];
      for (let tt = mid; tt <= mid + DAY_MS; tt += step) {
        const s = Astro.sun(tt, D.lat, D.lng);
        if (s.alt > 0) pts.push({ tt, ...s, xy: pr(s.alt, s.az) });
      }
      return pts;
    };
    const mk = (m, d) => localMidnight(Date.UTC(y, m - 1, d, 12), D.tz);
    const curves = [
      { mid: mk(6, 21), cls: 'summer' }, { mid: mk(3, 20), cls: 'equinox' }, { mid: mk(12, 21), cls: 'winter' },
    ].map((cv) => ({ ...cv, pts: dayPath(cv.mid) }));
    const today = dayPath(D.start, 5 * MIN_MS);
    const line = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'} ${p.xy[0].toFixed(1)} ${p.xy[1].toFixed(1)}`).join(' ');
    let out = `<circle cx="${cx}" cy="${cy}" r="${R}" class="sphorizon"/>
      <g class="smgrid"><circle cx="${cx}" cy="${cy}" r="${R / 3}"/><circle cx="${cx}" cy="${cy}" r="${R * 2 / 3}"/>
      <line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}"/><line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}"/></g>`;
    if (D.horizon) {
      const ring = [];
      for (let az = 0; az <= 360; az += 5) ring.push(pr(Math.max(0, D.horizon(az)), az));
      out += `<path class="smterrain" fill-rule="evenodd" d="M ${cx - R} ${cy} a ${R} ${R} 0 1 0 ${2 * R} 0 a ${R} ${R} 0 1 0 ${-2 * R} 0 Z M ${ring.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(' L ')} Z"/>`;
    }
    out += curves.filter((cv) => cv.pts.length > 1).map((cv) => `<path d="${line(cv.pts)}" class="spc ${cv.cls}"/>`).join('');
    if (today.length > 1) {
      out += `<path d="${line(today)}" class="spc today"/>`;
      today.filter((p) => tzParts(p.tt, D.tz).mi === 0 && tzParts(p.tt, D.tz).h % 2 === 0).forEach((p) => {
        out += `<circle cx="${p.xy[0].toFixed(1)}" cy="${p.xy[1].toFixed(1)}" r="2" class="sphour"/><text x="${p.xy[0].toFixed(1)}" y="${(p.xy[1] - 5).toFixed(1)}" class="sphourtxt">${tzParts(p.tt, D.tz).h}</text>`;
      });
    }
    if (D.sunNow.alt > 0) {
      const [sx, sy] = pr(D.sunNow.alt, D.sunNow.az);
      out += `<circle cx="${sx}" cy="${sy}" r="9" fill="${esc(c.sun_color)}" opacity=".35"/><circle cx="${sx}" cy="${sy}" r="5" fill="${esc(c.sun_color)}"/>`;
    }
    const d = t.dirs;
    out += `<g class="smdirs"><text x="${cx}" y="${cy - R - 3}">${d[0]}</text><text x="${cx}" y="${cy + R + 11}">${d[4]}</text>
      <text x="${cx + R + 8}" y="${cy + 4}">${d[2]}</text><text x="${cx - R - 8}" y="${cy + 4}">${d[6]}</text></g>`;
    const legend = `<div class="splegend"><span class="summer">21.06.</span><span class="equinox">20.03./23.09.</span><span class="winter">21.12.</span><span class="today">${esc(t.today)}</span></div>`;
    return `<svg viewBox="-14 -16 ${W + 28} ${W + 32}" class="skymap">${out}</svg>${legend}`;
  },

  /* ---------- Kompakt ---------------------------------------------------- */
  _compactHtml(D, t, F, sky, rot, A) {
    const c = this._config;
    this._sizeOverride = 'small';
    let graph = '';
    try { graph = c.show_graph ? this._graphHtml(D, t, F, sky, rot) : ''; } finally { this._sizeOverride = null; }
    const m = D.moonNow;
    const parts = [
      `<span><ha-icon icon="mdi:weather-sunset-up"></ha-icon>${F.time(D.sunrise)}</span>`,
      `<span><ha-icon icon="mdi:weather-sunset-down"></ha-icon>${F.time(D.sunset)}</span>`,
      `<span><ha-icon icon="mdi:timer-sand"></ha-icon>${D.dayLen != null ? F.dur(D.dayLen) : '—'}</span>`,
      `<span><svg viewBox="0 0 20 20" class="phaseicon">${moonSvg(10, 10, 8, m.k, rot.lit, rot.face, c.moon_color, { detail: false })}</svg>${F.num(m.k * 100)} %</span>`,
    ];
    if (D.clouds) {
      const now = cloudAt(D.clouds.hours, D.now);
      if (now) parts.push(`<span><ha-icon icon="mdi:weather-cloudy"></ha-icon>${Math.round(now.total)} %</span>`);
    }
    if (A && A.alert) parts.push(`<span class="alerttxt"><ha-icon icon="mdi:star-shooting"></ha-icon>${esc(t.alertOn)}</span>`);
    return `${graph}<div class="cline">${parts.join('')}</div>`;
  },

  /* ---------- Zusätzliches CSS ------------------------------------------ */
  _css2() {
    return `
    .hright { display:flex; align-items:center; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
    .nowchip { display:inline-flex; align-items:center; gap:5px; font:inherit; font-size:.78em; font-weight:600; cursor:pointer;
      color:var(--slc-text); background:var(--slc-tile); border:1px solid var(--slc-line); border-radius:999px; padding:5px 10px; }
    .nowchip ha-icon { --mdc-icon-size:14px; width:14px; height:14px; }
    .tabs { display:flex; gap:4px; padding:3px; border-radius:12px; background:var(--slc-tile); border:1px solid var(--slc-line); align-self:flex-start; }
    .tab { font:inherit; font-size:.8em; font-weight:600; color:var(--slc-sub); background:none; border:none; border-radius:9px; padding:5px 14px; cursor:pointer; }
    .tab.on { color:var(--slc-text); background:rgba(255,255,255,.16); box-shadow:0 1px 3px rgba(0,0,0,.15); }
    .light .tab.on, .theme .tab.on { background:rgba(127,127,127,.18); }
    .graph.scrub { touch-action:pan-y; cursor:ew-resize; user-select:none; -webkit-user-select:none; }
    .graph .handle circle { fill:var(--slc-text); opacity:.85; } .graph .handle path { stroke:var(--slc-sky-bottom, #333); stroke-width:1.2; }
    .light .graph .handle circle { fill:#1c2333; }
    .graph .liveline { stroke:var(--slc-sun); stroke-width:1; stroke-dasharray:1 2; opacity:.7; }
    .graph .cloudcell { fill:#d9dfec; }
    .light .graph .cloudcell { fill:#8e9ab3; }
    .graph .terrain { fill:rgba(10,14,30,.55); stroke:rgba(255,255,255,.25); stroke-width:.6; }
    .veil { position:absolute; inset:0; pointer-events:none; background:linear-gradient(180deg, #8c96a8 0%, #5d6577 100%); mix-blend-mode:soft-light; }
    .glow { display:inline-flex; align-items:center; gap:4px; margin-top:4px; white-space:nowrap; font-size:.7em; font-weight:600; padding:1px 7px; border-radius:999px; text-shadow:none; }
    .glow ha-icon { --mdc-icon-size:12px; width:12px; height:12px; }
    .glow.g-hi { background:linear-gradient(90deg,#ff7a59,#ffb35c); color:#2a1200; }
    .glow.g-mid { background:rgba(255,160,90,.35); color:var(--slc-text); }
    .glow.g-lo { background:var(--slc-tile); color:var(--slc-sub); }
    .col.right .glow, .col.right .realt { margin-left:auto; width:fit-content; }
    .col .glow { display:flex; width:fit-content; }
    .realt { display:flex; align-items:center; gap:4px; font-size:.72em; color:var(--slc-sub); margin-top:1px; }
    .realt ha-icon { --mdc-icon-size:12px; width:12px; height:12px; }
    .skychip { margin-left:auto; display:inline-flex; align-items:center; gap:4px; font-size:.72em; font-weight:600; padding:1px 8px; border-radius:999px; border:1px solid var(--slc-line); text-shadow:none; }
    .skychip ha-icon { --mdc-icon-size:13px; width:13px; height:13px; }
    .skychip.c0 { color:#8ef0a8; } .skychip.c1 { color:#ffd37a; } .skychip.c2 { color:#ff9b9b; }
    .light .skychip.c0, .theme .skychip.c0 { color:#2e9d4e; } .light .skychip.c1, .theme .skychip.c1 { color:#b37a00; } .light .skychip.c2, .theme .skychip.c2 { color:#c0392b; }
    .nightgrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .yeargrid { display:grid; grid-template-columns:1fr; gap:10px; }
    .tile { background:var(--slc-tile); border:1px solid var(--slc-line); border-radius:12px; padding:8px 10px; min-width:0; }
    .tile.wide { grid-column:1 / -1; }
    .stack { grid-column:1 / -1; display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px; min-width:0; }
    .tilehead { display:flex; align-items:center; gap:6px; font-weight:700; font-size:.88em; color:var(--slc-text); margin-bottom:6px; }
    .tilehead ha-icon { color:var(--slc-moon); }
    .skytime { margin-left:auto; font-weight:600; color:var(--slc-sub); font-variant-numeric:tabular-nums; }
    .skymap { width:100%; max-width:330px; margin:0 auto; display:block; }
    .skymaptile { display:flex; flex-direction:column; }
    .skyrange { width:100%; max-width:330px; margin:4px auto 0; display:block; accent-color:var(--slc-sun); }
    .smgrid circle, .smgrid line { fill:none; stroke:rgba(255,255,255,.14); stroke-width:.7; stroke-dasharray:2 3; }
    .light .smgrid circle, .light .smgrid line { stroke:rgba(30,50,90,.18); }
    .smrim, .sphorizon { fill:none; stroke:rgba(255,255,255,.35); stroke-width:1; }
    .light .sphorizon { stroke:rgba(30,50,90,.3); }
    .smlines line { stroke:#9fb3ff; stroke-width:.9; }
    .smstars circle { fill:#fff; } .smstars text { fill:#cdd6ff; font-size:9px; }
    .smplanet text { fill:#ffe7b0; font-size:10px; font-weight:700; }
    .smterrain { fill:rgba(8,12,24,.72); }
    .smdirs text { fill:var(--slc-sub); font-size:10px; font-weight:700; text-anchor:middle; }
    .bigline { font-size:1.15em; font-weight:700; color:var(--slc-text); }
    .bigline span { font-size:.7em; font-weight:500; color:var(--slc-sub); }
    .cbars { display:flex; align-items:flex-end; gap:2px; height:46px; margin-top:6px; }
    .cbar { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; min-width:0; }
    .cbar i { display:block; width:100%; background:rgba(210,218,235,.55); border-radius:2px 2px 0 0; }
    .light .cbar i { background:rgba(110,125,155,.45); }
    .cbar span { font-size:.55em; color:var(--slc-sub); margin-top:2px; }
    .kv { display:flex; justify-content:space-between; gap:8px; font-size:.8em; padding:2px 0; color:var(--slc-sub); }
    .kv span { display:inline-flex; align-items:center; gap:5px; }
    .kv span ha-icon { --mdc-icon-size:13px; width:13px; height:13px; }
    .kv b { color:var(--slc-text); font-weight:600; font-variant-numeric:tabular-nums; text-align:right; }
    .kv b i { font-style:normal; font-weight:400; color:var(--slc-sub); }
    .kv.dim b { font-weight:500; }
    .sep { height:1px; background:var(--slc-line); margin:6px 0; }
    .plist { display:flex; flex-direction:column; gap:4px; }
    .prow { display:grid; grid-template-columns:12px 72px 1fr; column-gap:8px; align-items:center; font-size:.8em; }
    .prow b { color:var(--slc-text); }
    .prow .pw { color:var(--slc-text); }
    .prow .pb { grid-column:3; color:var(--slc-sub); font-size:.92em; }
    .prow.off { opacity:.5; }
    .pdot { width:10px; height:10px; border-radius:50%; }
    .evhead { display:flex; align-items:center; gap:6px; font-weight:700; font-size:.85em; color:var(--slc-text); margin:2px 0 4px; }
    .evhead ha-icon { color:var(--slc-moon); }
    .evtile .evhead:not(:first-child) { margin-top:10px; padding-top:8px; border-top:1px solid var(--slc-line); }
    .ev { display:flex; flex-direction:column; font-size:.8em; padding:3px 0; }
    .ev b { color:var(--slc-text); }
    .ev span { color:var(--slc-sub); }
    .ev.off { opacity:.55; }
    .badge.act { background:#4DFFB0; color:#032; margin-left:6px; }
    .evt { display:flex; align-items:center; }
    .ychart { width:100%; display:block; }
    .ygrid { stroke:var(--slc-line); stroke-width:.6; }
    .yax { fill:var(--slc-sub); font-size:8px; }
    .yarea { fill:var(--slc-curve); opacity:.18; }
    .yline { fill:none; stroke:var(--slc-curve); stroke-width:2; }
    .ytoday { stroke:var(--slc-text); stroke-dasharray:2 3; opacity:.6; }
    .ytodaydot { fill:var(--slc-sun); stroke:#fff; stroke-width:1.5; }
    .ymark { fill:var(--slc-text); }
    .ylbl { fill:var(--slc-text); font-size:8.5px; font-weight:600; }
    .spc { fill:none; stroke-width:1.6; stroke-linecap:round; opacity:.75; }
    .spc.summer { stroke:#ff9f43; } .spc.equinox { stroke:#e8d44d; } .spc.winter { stroke:#6ea8ff; }
    .spc.today { stroke:var(--slc-text); stroke-width:2.4; opacity:1; }
    .sphorizon { fill:rgba(127,140,170,.06); }
    .sphour { fill:var(--slc-text); } .sphourtxt { fill:var(--slc-sub); font-size:7.5px; text-anchor:middle; }
    .splegend { display:flex; flex-wrap:wrap; gap:4px 10px; font-size:.7em; color:var(--slc-sub); margin-top:4px; }
    .splegend span::before { content:''; display:inline-block; width:10px; height:3px; border-radius:2px; margin-right:4px; vertical-align:middle; }
    .splegend .summer::before { background:#ff9f43; } .splegend .equinox::before { background:#e8d44d; }
    .splegend .winter::before { background:#6ea8ff; } .splegend .today::before { background:var(--slc-text); }
    .c3dwrap { border-radius:10px; overflow:hidden; }
    .c3d { width:100%; display:block; touch-action:none; cursor:grab; }
    .c3d:active { cursor:grabbing; }
    .c3dhint { font-size:.7em; color:var(--slc-sub); text-align:center; margin-top:4px; }
    .t3time { margin-left:auto; font-weight:600; color:var(--slc-sub); font-variant-numeric:tabular-nums; }
    .cline { display:flex; flex-wrap:wrap; gap:4px 14px; font-size:.82em; color:var(--slc-text); font-variant-numeric:tabular-nums; }
    .cline span { display:inline-flex; align-items:center; gap:5px; }
    .cline ha-icon { --mdc-icon-size:15px; width:15px; height:15px; color:var(--slc-sun); }
    .cline .phaseicon { width:16px; height:16px; }
    .cline .alerttxt { color:#ff8fa3; font-weight:700; } .cline .alerttxt ha-icon { color:#ff8fa3; }
    .compact .content { gap:8px; }
    @media (max-width: 520px) {
      .nightgrid, .yeargrid { grid-template-columns:1fr; }
    }
    `;
  },
});

/* ====================================================================== *
 *  KARTE – 3D-Ansicht: Haus unter der Himmelshalbkugel                    *
 * ====================================================================== */
const V3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  /** Richtung aus Höhe/Azimut (x = Ost, y = Nord, z = oben) */
  dir: (alt, az) => [Math.sin(az * RAD) * Math.cos(alt * RAD), Math.cos(az * RAD) * Math.cos(alt * RAD), Math.sin(alt * RAD)],
};
function shadeHex(hex, f) {
  const c = hex2rgb(hex);
  return rgb2hex(c.map((v) => clamp(v * f, 0, 255)));
}
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

Object.assign(SolLunaCard.prototype, {

  _buildingFaces() {
    const c = this._config;
    if (c.house_source !== 'entity' || !c.building_entity) return null;
    const st = this._hass?.states?.[c.building_entity];
    const faces = st?.attributes?.faces;
    if (!Array.isArray(faces) || !faces.length) return null;
    return this._cached('bld|' + c.building_entity + '|' + st.last_updated, () => {
      const out = [];
      const all = faces.flatMap((f) => f.p || []);
      const cxy = [all.reduce((s, p) => s + p[0], 0) / all.length, all.reduce((s, p) => s + p[1], 0) / all.length];
      for (const f of faces) {
        if (!Array.isArray(f.p) || f.p.length < 3 || f.t === 'g') continue;
        const pts = f.p.map((p) => [Number(p[0]), Number(p[1]), Number(p[2])]);
        // Normale nach Newell, nach außen gerichtet
        let n = [0, 0, 0];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
        }
        n = V3.norm(n);
        const cen = V3.mul(pts.reduce((s, p) => V3.add(s, p), [0, 0, 0]), 1 / pts.length);
        if (f.t === 'r') { if (n[2] < 0) n = V3.mul(n, -1); }
        else if (V3.dot(n, [cen[0] - cxy[0], cen[1] - cxy[1], 0]) < 0) n = V3.mul(n, -1);
        out.push({ kind: f.t === 'r' ? 'mroof' : 'mwall', pts, n });
      }
      const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]), zs = all.map((p) => p[2]);
      return { faces: out, ext: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), height: Math.max(...zs) };
    });
  },

  _t3(D) {
    return this._time3d != null && this._time3d >= D.start && this._time3d <= D.end ? this._time3d : D.now;
  },

  _html3d(D, t, F) {
    const t3 = this._t3(D);
    return `
      <div class="tile wide c3dtile">
        <div class="tilehead"><ha-icon icon="mdi:home-variant-outline"></ha-icon>${esc(t.model3d)} <span class="t3time">${esc(F.date(t3))} ${F.time(t3)}</span></div>
        <div class="c3dwrap"><canvas class="c3d"></canvas></div>
        <input type="range" class="skyrange t3range" data-action="t3d" min="${D.start}" max="${D.end}" step="${10 * MIN_MS}" value="${t3}">
        <div class="c3dhint">${esc(t.hint3d)}</div>
      </div>`;
  },

  _after3d(D) {
    this._D3 = D;
    this._draw3d();
    const c = this._config;
    if (c.auto_rotate_3d && c.animations && !this._spin) {
      this._spin = true;
      const loop = () => {
        if (!this._spin || !this.isConnected || !this.shadowRoot.querySelector('canvas.c3d')) { this._spin = false; return; }
        if (!this._rot3d) { this._yaw3d = ((this._yaw3d ?? 105) + 0.12) % 360; this._draw3d(); }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  },

  _onT3d(value) {
    this._time3d = Number(value);
    this._draw3d();
    const D = this._D3;
    const lbl = this.shadowRoot.querySelector('.t3time');
    if (lbl && D) { const F = this._fmt(D); lbl.textContent = `${F.date(this._time3d)} ${F.time(this._time3d)}`; }
  },

  _sunArcs3d(D) {
    const y = tzParts(D.live, D.tz).y;
    return this._cached(`arcs|${y}|${D.lat}|${D.lng}`, () => [[6, 21], [12, 21]].map(([m, d]) => {
      const mid = localMidnight(Date.UTC(y, m - 1, d, 12), D.tz);
      const pts = [];
      for (let tt = mid; tt <= mid + DAY_MS; tt += 10 * MIN_MS) {
        const s = Astro.sun(tt, D.lat, D.lng);
        if (s.alt > 0) pts.push([s.alt, s.az]);
      }
      return pts;
    }));
  },

  _draw3d() {
    const cv = this.shadowRoot.querySelector('canvas.c3d');
    const D = this._D3;
    if (!cv || !D) return;
    const c = this._config;
    const { t } = this._lang();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(200, cv.clientWidth || cv.parentElement?.clientWidth || 400);
    const H = Math.round(W * 0.74);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = `${H}px`;
    }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const time = this._t3(D);
    const sun = Astro.sun(time, D.lat, D.lng);
    const moon = Astro.moon(time, D.lat, D.lng);
    const day = clamp((sun.alt + 6) / 12, 0, 1);
    const dark = clamp((-sun.alt - 4) / 10, 0, 1);

    // ---- Haus-Maße
    const hw = Math.max(2, Number(c.house_width) || 10);
    const hl = Math.max(2, Number(c.house_length) || 12);
    const wh = Math.max(1, Number(c.wall_height) || 6);
    const pitch = clamp(Number(c.roof_pitch ?? 35), 0, 65);
    const rh = hw / 2 * Math.tan(pitch * RAD);
    const model = c.show_house === false ? null : this._buildingFaces();
    const R = model ? Math.max(model.ext * 1.6, model.height * 2.2, 14) : Math.max(hw, hl, wh + rh) * 2.2;

    // ---- Kamera
    const yaw = (this._yaw3d ?? 105) * RAD, pit = clamp(this._pitch3d ?? 30, 4, 80) * RAD;
    const dist = R * 3.1;
    const target = [0, 0, R * 0.28];
    const cam = [target[0] + dist * Math.sin(yaw) * Math.cos(pit), target[1] + dist * Math.cos(yaw) * Math.cos(pit), target[2] + dist * Math.sin(pit)];
    const f = V3.norm(V3.sub(target, cam));
    const r = V3.norm(V3.cross(f, [0, 0, 1]));
    const u = V3.cross(r, f);
    const fl = W * 1.38;
    const P = (p) => {
      const v = V3.sub(p, cam);
      const z = V3.dot(v, f);
      return [W / 2 + V3.dot(v, r) * fl / z, H * 0.57 - V3.dot(v, u) * fl / z, z];
    };
    const poly = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
    const line3 = (pts3, close) => { poly(pts3.map(P)); if (close) g.closePath(); };

    // ---- Hintergrund
    const [st, sb] = skyColors(sun.alt);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, st); bg.addColorStop(1, sb);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    // ---- Sterne
    if (dark > 0 && c.stars) {
      g.fillStyle = '#ffffff';
      for (const name of Object.keys(STARS)) {
        const s = Astro.star(name, time, D.lat, D.lng);
        if (s.alt <= 0) continue;
        const p = P(V3.mul(V3.dir(s.alt, s.az), R));
        g.globalAlpha = dark * clamp(1.1 - s.mag * 0.25, 0.25, 1);
        g.beginPath(); g.arc(p[0], p[1], Math.max(0.6, 1.9 - 0.4 * s.mag), 0, 2 * Math.PI); g.fill();
      }
      g.globalAlpha = 1;
    }

    // ---- Kuppel-Raster
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,.16)';
    for (const alt of [30, 60]) {
      const ring = []; for (let az = 0; az <= 360; az += 6) ring.push(V3.mul(V3.dir(alt, az), R));
      line3(ring); g.stroke();
    }
    for (let az = 0; az < 360; az += 30) {
      const m = []; for (let alt = 0; alt <= 90; alt += 5) m.push(V3.mul(V3.dir(alt, az), R));
      line3(m); g.stroke();
    }

    // ---- Boden
    const groundPts = []; for (let a = 0; a < 360; a += 5) groundPts.push([R * Math.sin(a * RAD), R * Math.cos(a * RAD), 0]);
    const gp = groundPts.map(P);
    poly(gp); g.closePath();
    const gcol = lerpColor('#141a26', '#5f7f4c', day);
    const gg = g.createRadialGradient(W / 2, H * 0.62, 10, W / 2, H * 0.62, W * 0.55);
    gg.addColorStop(0, shadeHex(gcol, 1.12)); gg.addColorStop(1, shadeHex(gcol, 0.8));
    g.fillStyle = gg; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke();

    // ---- Gelände-Silhouette
    if (D.horizon) {
      g.fillStyle = `rgba(${Math.round(30 + 40 * day)},${Math.round(40 + 50 * day)},${Math.round(45 + 30 * day)},.85)`;
      for (let az = 0; az < 360; az += 4) {
        const h1 = Math.max(0, D.horizon(az)), h2 = Math.max(0, D.horizon(az + 4));
        if (h1 < 0.05 && h2 < 0.05) continue;
        const q = [V3.mul(V3.dir(0, az), R), V3.mul(V3.dir(0, az + 4), R), V3.mul(V3.dir(h2, az + 4), R), V3.mul(V3.dir(h1, az), R)].map(P);
        poly(q); g.closePath(); g.fill();
      }
    }

    // ---- Himmelsrichtungen
    g.font = `700 ${Math.round(W / 34)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    t.dirs.forEach((lbl, i) => {
      if (i % 2) return;
      const p = P([R * 1.09 * Math.sin(i * 45 * RAD), R * 1.09 * Math.cos(i * 45 * RAD), 0]);
      g.fillStyle = i === 0 ? '#ff8a8a' : 'rgba(255,255,255,.85)';
      g.fillText(lbl, p[0], p[1]);
    });

    // ---- Sonnenbahnen
    const arcs = this._sunArcs3d(D);
    g.setLineDash([3, 4]); g.lineWidth = 1.2;
    [['#ff9f43', arcs[0]], ['#6ea8ff', arcs[1]]].forEach(([col, pts]) => {
      if (pts.length < 2) return;
      g.strokeStyle = col; g.globalAlpha = 0.6;
      line3(pts.map(([al, az]) => V3.mul(V3.dir(al, az), R))); g.stroke();
    });
    g.setLineDash([]); g.globalAlpha = 1;
    const today = D.samples.filter((p, i) => i % 3 === 0 && p.s > 0).map((p) => V3.mul(V3.dir(p.s, p.saz), R));
    if (today.length > 1) { g.strokeStyle = c.curve_color; g.lineWidth = 2.2; line3(today); g.stroke(); }

    // ---- Haus-Geometrie
    const A = Number(c.roof_azimuth ?? 180);
    const ax = [Math.sin(A * RAD), Math.cos(A * RAD), 0];
    const bx = [Math.cos(A * RAD), -Math.sin(A * RAD), 0];
    const L = (s, l, z) => V3.add(V3.add(V3.mul(ax, s), V3.mul(bx, l)), [0, 0, z]);
    const s2 = hw / 2, l2 = hl / 2, top = wh + rh;
    const sinP = Math.sin(pitch * RAD), cosP = Math.cos(pitch * RAD);
    const faces = c.show_house === false ? [] : model ? model.faces : [
      { kind: 'wall', side: 1, pts: [L(s2, -l2, 0), L(s2, l2, 0), L(s2, l2, wh), L(s2, -l2, wh)], n: ax },
      { kind: 'wall', side: -1, pts: [L(-s2, l2, 0), L(-s2, -l2, 0), L(-s2, -l2, wh), L(-s2, l2, wh)], n: V3.mul(ax, -1) },
      { kind: 'gable', pts: [L(-s2, l2, 0), L(s2, l2, 0), L(s2, l2, wh), L(0, l2, top), L(-s2, l2, wh)], n: bx },
      { kind: 'gable', pts: [L(s2, -l2, 0), L(-s2, -l2, 0), L(-s2, -l2, wh), L(0, -l2, top), L(s2, -l2, wh)], n: V3.mul(bx, -1) },
      { kind: 'roof', main: true, pts: [L(s2, -l2, wh), L(s2, l2, wh), L(0, l2, top), L(0, -l2, top)], n: V3.norm(V3.add(V3.mul(ax, sinP), [0, 0, cosP])) },
      { kind: 'roof', pts: [L(-s2, l2, wh), L(-s2, -l2, wh), L(0, -l2, top), L(0, l2, top)], n: V3.norm(V3.add(V3.mul(ax, -sinP), [0, 0, cosP])) },
    ];
    const sunDir = V3.dir(sun.alt, sun.az);
    const light = (n) => sun.alt > -1 ? Math.max(0, V3.dot(n, sunDir)) * clamp((sun.alt + 1) / 6, 0, 1) : 0;
    const houseDepth = P([0, 0, model ? model.height / 2 : wh / 2])[2];

    // ---- Schatten
    if (faces.length && sun.alt > 0.5) {
      const tanA = Math.tan(Math.max(sun.alt, 1.5) * RAD);
      const sx = -Math.sin(sun.az * RAD), sy = -Math.cos(sun.az * RAD);
      const pts = [];
      faces.forEach((fc) => fc.pts.forEach((p) => {
        const d = p[2] / tanA;
        pts.push([p[0] + sx * d, p[1] + sy * d]);
      }));
      const hull = convexHull(pts);
      g.save();
      poly(gp); g.closePath(); g.clip();
      poly(hull.map(([x, y]) => P([x, y, 0]))); g.closePath();
      g.fillStyle = `rgba(0,0,0,${(0.18 + 0.22 * day).toFixed(2)})`; g.fill();
      g.restore();
    }

    // ---- Himmelskörper
    const bodies = [];
    if (sun.alt > -1) bodies.push({ type: 'sun', p: P(V3.mul(V3.dir(sun.alt, sun.az), R)) });
    if (moon.altTopo > -1) bodies.push({ type: 'moon', p: P(V3.mul(V3.dir(moon.altTopo, moon.az), R)) });
    for (const name of PLANETS) {
      const pl = Astro.planet(name, time, D.lat, D.lng);
      if (pl.alt > 0 && (sun.alt < -2 || pl.mag < -3)) bodies.push({ type: 'planet', name, mag: pl.mag, p: P(V3.mul(V3.dir(pl.alt, pl.az), R)) });
    }
    const drawBody = (b) => {
      const [x, y] = b.p;
      if (b.type === 'sun') {
        const rg = g.createRadialGradient(x, y, 0, x, y, 26);
        rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.25, c.sun_color); rg.addColorStop(1, 'rgba(255,200,60,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, 26, 0, 2 * Math.PI); g.fill();
        g.fillStyle = c.sun_color; g.beginPath(); g.arc(x, y, 8, 0, 2 * Math.PI); g.fill();
      } else if (b.type === 'moon') {
        const rot = this._moonRotFor(moon, D.lat);
        const rr = 9, k = moon.k;
        g.save(); g.translate(x, y);
        const glow = g.createRadialGradient(0, 0, 0, 0, 0, rr * 2.2);
        glow.addColorStop(0, `rgba(230,236,250,${(0.25 + 0.4 * k).toFixed(2)})`); glow.addColorStop(1, 'rgba(230,236,250,0)');
        g.fillStyle = glow; g.beginPath(); g.arc(0, 0, rr * 2.2, 0, 2 * Math.PI); g.fill();
        g.fillStyle = lerpColor(c.moon_color, '#1b2033', 0.8); g.beginPath(); g.arc(0, 0, rr, 0, 2 * Math.PI); g.fill();
        if (k > 0.005) {
          g.rotate(rot.lit * RAD);
          const rx = Math.abs(1 - 2 * k) * rr;
          const path = k > 0.995 ? `M 0 ${-rr} A ${rr} ${rr} 0 1 1 0 ${rr} A ${rr} ${rr} 0 1 1 0 ${-rr} Z`
            : `M 0 ${-rr} A ${rr} ${rr} 0 0 1 0 ${rr} A ${rx} ${rr} 0 0 ${k < 0.5 ? 0 : 1} 0 ${-rr} Z`;
          g.fillStyle = c.moon_color; g.fill(new Path2D(path));
        }
        g.restore();
      } else {
        const col = PLANET_COLORS[b.name];
        g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 8;
        g.beginPath(); g.arc(x, y, clamp(3.2 - 0.4 * b.mag, 1.8, 4.5), 0, 2 * Math.PI); g.fill();
        g.shadowBlur = 0;
        g.font = `600 ${Math.round(W / 42)}px system-ui, sans-serif`; g.textAlign = 'left';
        g.fillStyle = 'rgba(255,240,210,.95)'; g.fillText(t.planetNames[b.name], x + 7, y - 6);
      }
    };
    bodies.filter((b) => b.p[2] > houseDepth).forEach(drawBody);

    // ---- Haus zeichnen
    const vis = faces.map((fc) => {
      const cen = V3.mul(fc.pts.reduce((a, p) => V3.add(a, p), [0, 0, 0]), 1 / fc.pts.length);
      return { ...fc, cen, depth: P(cen)[2], facing: V3.dot(fc.n, V3.sub(cam, cen)) > 0 };
    }).filter((fc) => fc.facing).sort((a, b) => b.depth - a.depth);
    const amb = 0.3 + 0.32 * day;
    for (const fc of vis) {
      const isRoof = fc.kind === 'roof' || fc.kind === 'mroof';
      const base = isRoof ? (c.roof_color || '#9a4433') : (c.wall_color || '#ece6da');
      g.fillStyle = shadeHex(base, amb + 0.75 * light(fc.n));
      line3(fc.pts, true); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 0.8; g.stroke();
      // PV-Module auf der Hauptdachfläche
      if (fc.kind === 'roof' && fc.main && c.show_pv) {
        const lerp3 = (a, b, x) => V3.add(a, V3.mul(V3.sub(b, a), x));
        const e1 = L(s2, -l2 * 0.86, wh), e2 = L(s2, l2 * 0.86, wh), r1 = L(0, -l2 * 0.86, top), r2 = L(0, l2 * 0.86, top);
        const q = [lerp3(e1, r1, 0.12), lerp3(e2, r2, 0.12), lerp3(e2, r2, 0.88), lerp3(e1, r1, 0.88)];
        const lt = light(fc.n);
        g.fillStyle = shadeHex(c.pv_color || '#1d3557', 0.6 + 0.9 * lt);
        line3(q, true); g.fill();
        g.strokeStyle = 'rgba(180,200,230,.35)'; g.lineWidth = 0.6;
        for (let i = 1; i < 6; i++) { line3([lerp3(q[0], q[1], i / 6), lerp3(q[3], q[2], i / 6)]); g.stroke(); }
        line3([lerp3(q[0], q[3], 0.5), lerp3(q[1], q[2], 0.5)]); g.stroke();
      }
      // PV auf echten Dachflächen: alle Flächen, die ungefähr in Richtung roof_azimuth zeigen
      if (fc.kind === 'mroof' && c.show_pv) {
        const tilt = Math.acos(clamp(fc.n[2], -1, 1)) * DEG;
        const naz = norm360(Math.atan2(fc.n[0], fc.n[1]) * DEG);
        if ((tilt > 8 && Math.abs(wrap180(naz - Number(c.roof_azimuth ?? 180))) <= 50) || (tilt <= 8 && c.pv_flat_roofs)) {
          const cen = V3.mul(fc.pts.reduce((s, p) => V3.add(s, p), [0, 0, 0]), 1 / fc.pts.length);
          const q = fc.pts.map((p) => V3.add(cen, V3.mul(V3.sub(p, cen), 0.78)));
          g.fillStyle = shadeHex(c.pv_color || '#1d3557', 0.6 + 0.9 * light(fc.n));
          line3(q, true); g.fill();
          g.strokeStyle = 'rgba(180,200,230,.4)'; g.lineWidth = 0.6; g.stroke();
        }
      }
      // Fenster (nachts beleuchtet)
      if (fc.kind === 'wall') {
        const s = fc.side * s2 * 1.001;
        for (const lc of [-l2 / 2, l2 / 2]) {
          const w2 = hl * 0.07, z1 = wh * 0.28, z2 = wh * 0.58;
          const q = [L(s, lc - w2, z1), L(s, lc + w2, z1), L(s, lc + w2, z2), L(s, lc - w2, z2)];
          g.fillStyle = sun.alt < -4 ? '#ffd98a' : shadeHex('#5d7896', 0.7 + 0.5 * light(fc.n));
          if (sun.alt < -4) { g.shadowColor = '#ffcc66'; g.shadowBlur = 10; }
          line3(q, true); g.fill(); g.shadowBlur = 0;
        }
      }
    }
    bodies.filter((b) => b.p[2] <= houseDepth).forEach(drawBody);

    // ---- Info
    g.font = `600 ${Math.round(W / 38)}px system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.fillText(`☀ ${Math.round(sun.az)}° · ${sun.alt.toFixed(1)}°`, 10, 10);
    g.fillText(`☾ ${Math.round(moon.az)}° · ${moon.altTopo.toFixed(1)}°`, 10, 10 + W / 30);
  },
});

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
    aurora_visibility_entity: 'Sichtbarkeit (%)', aurora_alert_entity: 'Sichtbarkeitswarnung', aurora_kp_entity: 'Planetary K-Index', aurora_activity_entity: 'Aktivitätsstufe (z. B. Aurora Activity Level)',
    aurora_today_entity: 'Heute – Stufe', aurora_today_text_entity: 'Heute – Text',
    aurora_tomorrow_entity: 'Morgen – Stufe', aurora_tomorrow_text_entity: 'Morgen – Text',
    aurora_day_after_entity: 'Übermorgen – Stufe', aurora_day_after_text_entity: 'Übermorgen – Text',
    sec3d: '3D-Modell', show_3d_tab: 'Tab „3D“', show_house: 'Haus anzeigen', house_source: 'Hausform', hs_generic: 'Standardhaus (Maße unten)', hs_entity: 'Echtes Gebäudemodell (Entität)', building_entity: 'Gebäudemodell-Entität', roof_azimuth: 'Ausrichtung Hauptdach (°, 180 = Süd)',
    house_width: 'Hausbreite quer zum First (m)', house_length: 'Hauslänge entlang First (m)', wall_height: 'Wandhöhe (m)', roof_pitch: 'Dachneigung (°)',
    show_pv: 'PV-Module auf dem Hauptdach', pv_flat_roofs: 'PV auch auf Flachdächern (z. B. Garage)', wall_color: 'Wände', roof_color: 'Dach', pv_color: 'PV-Module', auto_rotate_3d: 'Automatisch drehen', tab_3d: '3D',
    layoutSec: 'Layout & Tabs', layout: 'Layout', ly_full: 'Vollständig', ly_compact: 'Kompakt (Kachel)', default_tab: 'Start-Tab',
    tab_today: 'Heute', tab_night: 'Nacht', tab_year: 'Jahr', show_tabs: 'Tabs anzeigen', show_night_tab: 'Tab „Nacht“', show_year_tab: 'Tab „Jahr“',
    scrub: 'Zeitregler (in der Grafik ziehen)',
    cloudsSec: 'Wolken & Abendrot', cloud_source: 'Wolken-Quelle', cs_auto: 'Automatisch (Wetter-Entität, sonst Internet)', cs_internet: 'Internet (Open-Meteo, 3 Schichten)',
    cs_weather: 'Home-Assistant-Wetter', cs_off: 'Aus', weather_entity: 'Wetter-Entität', show_clouds: 'Wolken anzeigen', show_glow: 'Abendrot-/Morgenrot-Chance',
    cloud_update_minutes: 'Internet-Abruf alle (Minuten)',
    nightSec: 'Nacht-Tab', show_sky_map: 'Sternenkarte', show_sky_tonight: 'Himmel heute Nacht (Wolken)', show_astro_window: 'Astro-Fenster',
    show_planets: 'Planeten', show_meteors: 'Sternschnuppen', show_eclipses: 'Finsternisse', eclipse_years: 'Finsternisse vorausberechnen (Jahre)',
    yearSec: 'Jahr-Tab', show_year_curve: 'Tageslänge im Jahresverlauf', show_sun_path: 'Sonnenbahn-Diagramm', show_year_dates: 'Termine & Rekorde',
    horizonSec: 'Echter Horizont', horizon_source: 'Horizontprofil', hz_off: 'Aus (flacher Horizont)', hz_entity: 'Aus Entität (z. B. Sol & Luna Integration)',
    hz_manual: 'Manuell', horizon_entity: 'Horizont-Entität', horizon_profile: 'Profil (Azimut:Höhe, Grad)',
    hzHint: 'Azimut 0 = Nord, 90 = Ost. Die Sol-&-Luna-Integration liefert das Geländeprofil automatisch (PVGIS).',
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
    aurora_visibility_entity: 'Visibility (%)', aurora_alert_entity: 'Visibility alert', aurora_kp_entity: 'Planetary K-index', aurora_activity_entity: 'Activity level (e.g. Aurora Activity Level)',
    aurora_today_entity: 'Today – level', aurora_today_text_entity: 'Today – text',
    aurora_tomorrow_entity: 'Tomorrow – level', aurora_tomorrow_text_entity: 'Tomorrow – text',
    aurora_day_after_entity: 'Day after – level', aurora_day_after_text_entity: 'Day after – text',
    sec3d: '3D model', show_3d_tab: '“3D” tab', show_house: 'Show house', house_source: 'House shape', hs_generic: 'Generic house (sizes below)', hs_entity: 'Real building model (entity)', building_entity: 'Building model entity', roof_azimuth: 'Main roof orientation (°, 180 = south)',
    house_width: 'House width across ridge (m)', house_length: 'House length along ridge (m)', wall_height: 'Wall height (m)', roof_pitch: 'Roof pitch (°)',
    show_pv: 'PV modules on main roof', pv_flat_roofs: 'PV on flat roofs too (e.g. garage)', wall_color: 'Walls', roof_color: 'Roof', pv_color: 'PV modules', auto_rotate_3d: 'Auto rotate', tab_3d: '3D',
    layoutSec: 'Layout & tabs', layout: 'Layout', ly_full: 'Full', ly_compact: 'Compact (tile)', default_tab: 'Start tab',
    tab_today: 'Today', tab_night: 'Night', tab_year: 'Year', show_tabs: 'Show tabs', show_night_tab: '“Night” tab', show_year_tab: '“Year” tab',
    scrub: 'Time scrubber (drag the graph)',
    cloudsSec: 'Clouds & sunset glow', cloud_source: 'Cloud source', cs_auto: 'Automatic (weather entity, else internet)', cs_internet: 'Internet (Open-Meteo, 3 layers)',
    cs_weather: 'Home Assistant weather', cs_off: 'Off', weather_entity: 'Weather entity', show_clouds: 'Show clouds', show_glow: 'Sunset/sunrise glow chance',
    cloud_update_minutes: 'Internet refresh every (minutes)',
    nightSec: 'Night tab', show_sky_map: 'Sky map', show_sky_tonight: 'Sky tonight (clouds)', show_astro_window: 'Astro window',
    show_planets: 'Planets', show_meteors: 'Meteor showers', show_eclipses: 'Eclipses', eclipse_years: 'Eclipse look-ahead (years)',
    yearSec: 'Year tab', show_year_curve: 'Day length through the year', show_sun_path: 'Sun path diagram', show_year_dates: 'Dates & records',
    horizonSec: 'Real horizon', horizon_source: 'Horizon profile', hz_off: 'Off (flat horizon)', hz_entity: 'From entity (e.g. Sol & Luna integration)',
    hz_manual: 'Manual', horizon_entity: 'Horizon entity', horizon_profile: 'Profile (azimuth:elevation, degrees)',
    hzHint: 'Azimuth 0 = north, 90 = east. The Sol & Luna integration provides the terrain profile automatically (PVGIS).',
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
    const AUR = ['aurora_visibility_entity', 'aurora_alert_entity', 'aurora_kp_entity', 'aurora_activity_entity', 'aurora_today_entity', 'aurora_today_text_entity',
      'aurora_tomorrow_entity', 'aurora_tomorrow_text_entity', 'aurora_day_after_entity', 'aurora_day_after_text_entity'];
    const ha = this._hass?.config || {};
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        details { border:1px solid var(--divider-color, #ddd); border-radius:10px; margin:0 0 10px; background:var(--card-background-color); }
        summary { cursor:pointer; padding:10px 12px; font-weight:600; }
        .body { padding:4px 12px 12px; display:grid; grid-template-columns:1fr 1fr; gap:10px 14px; }
        .f { display:flex; flex-direction:column; gap:4px; font-size:.85em; color:var(--secondary-text-color); }
        .f.wide { grid-column:span 2; }
        .f textarea { font:inherit; font-size:.95em; color:var(--primary-text-color); background:var(--secondary-background-color, #f3f3f3);
          border:1px solid var(--divider-color, #ccc); border-radius:8px; padding:8px; box-sizing:border-box; width:100%; resize:vertical; }
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
        sel('language', [['auto', T.auto], ['de', 'Deutsch'], ['en', 'English'], ['nl', 'Nederlands'], ['fr', 'Français'], ['sv', 'Svenska'], ['nb', 'Norsk'], ['da', 'Dansk']]) +
        sel('time_format', [['auto', T.auto], ['24', '24 h'], ['12', '12 h']]) +
        num('refresh_period', '1', '60'), true)}
      ${sec(T.layoutSec, sel('layout', [['full', T.ly_full], ['compact', T.ly_compact]]) +
        sel('default_tab', [['today', T.tab_today], ['night', T.tab_night], ['year', T.tab_year], ['sky3d', T.tab_3d]]) +
        sw('show_tabs') + sw('show_night_tab') + sw('show_year_tab') + sw('scrub'))}
      ${sec(T.display, ['show_header', 'show_status', 'show_graph', 'show_moon_in_graph', 'show_hour_bands', 'show_sun_times', 'show_moon', 'show_next_phases', 'show_position', 'show_season'].map(sw).join(''))}
      ${sec(T.design, sel('background', [['sky', T.bg_sky], ['light', T.bg_light], ['dark', T.bg_dark], ['theme', T.bg_theme]]) +
        sel('graph_size', [['small', T.gs_small], ['normal', T.gs_normal], ['large', T.gs_large]]) +
        sel('moon_orientation', [['sky', T.mo_sky], ['simple', T.mo_simple]]) + `<span></span>` +
        sw('graph_sky') + sw('show_rise_lines') + sw('stars') + sw('animations'))}
      ${sec(T.cloudsSec, sel('cloud_source', [['auto', T.cs_auto], ['internet', T.cs_internet], ['weather', T.cs_weather], ['off', T.cs_off]]) +
        `<label class="f"><span>${esc(T.weather_entity)}</span><input data-k="weather_entity" type="text" list="wxlist" placeholder="weather.…"></label>` +
        sw('show_clouds') + sw('show_glow') + num('cloud_update_minutes', '1', '30'))}
      ${sec(T.nightSec, ['show_sky_map', 'show_sky_tonight', 'show_astro_window', 'show_planets', 'show_meteors', 'show_eclipses'].map(sw).join('') + num('eclipse_years', '1', '3'))}
      ${sec(T.sec3d, sw('show_3d_tab') + sw('show_house') + sel('house_source', [['generic', T.hs_generic], ['entity', T.hs_entity]]) +
        `<label class="f"><span>${esc(T.building_entity)}</span><input data-k="building_entity" type="text" list="entlist" placeholder="sensor.sol_luna_gebaudemodell"></label>` + num('roof_azimuth', '1', '180') + num('roof_pitch', '1', '35') +
        num('house_width', '0.5', '10') + num('house_length', '0.5', '12') + num('wall_height', '0.5', '6') + '<span></span>' +
        sw('show_pv') + sw('pv_flat_roofs') + sw('auto_rotate_3d') + ['wall_color', 'roof_color', 'pv_color'].map(col).join(''))}
      ${sec(T.yearSec, ['show_year_curve', 'show_sun_path', 'show_year_dates'].map(sw).join(''))}
      ${sec(T.horizonSec, sel('horizon_source', [['off', T.hz_off], ['entity', T.hz_entity], ['manual', T.hz_manual]]) +
        `<label class="f"><span>${esc(T.horizon_entity)}</span><input data-k="horizon_entity" type="text" list="entlist" placeholder="sensor.sol_luna_horizon"></label>` +
        `<label class="f wide"><span>${esc(T.horizon_profile)}</span><textarea data-k="horizon_profile" rows="2" placeholder="0:2, 45:3, 90:5, 135:2, 180:1, 225:4, 270:6, 315:3"></textarea></label>` +
        `<div class="hint">${esc(T.hzHint)}</div>`)}
      ${sec(T.aurora, sw('show_aurora') + sw('aurora_effect') +
        sel('aurora_source', [['auto', T.as_auto], ['entities', T.as_entities], ['internet', T.as_internet]]) +
        num('aurora_threshold', '1', '50') + num('aurora_update_minutes', '1', '15') + sw('aurora_ovation') + AUR.map(ent).join('') + `<div class="hint">${esc(T.auroraHint)}</div>`)}
      ${sec(T.colors, ['sun_color', 'moon_color', 'golden_color', 'blue_color', 'curve_color', 'moon_curve_color', 'aurora_color'].map(col).join(''))}
      <datalist id="entlist"></datalist><datalist id="wxlist"></datalist>
      ${sec(T.location, num('latitude', 'any', ha.latitude ?? '') + num('longitude', 'any', ha.longitude ?? '') + text('time_zone', ha.time_zone || '') + `<div class="hint">${esc(T.locHint)}</div>`)}
      <div class="ver">Sol &amp; Luna Card v${VERSION}</div>`;
    this.shadowRoot.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k;
      const ev = el.type === 'text' || el.type === 'number' || el.tagName === 'TEXTAREA' ? 'change' : 'input';
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
    const wl = this.shadowRoot.getElementById('wxlist');
    if (wl) wl.innerHTML = Object.keys(this._hass.states).filter((id) => id.startsWith('weather.')).map((id) => `<option value="${esc(id)}"></option>`).join('');
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
    description: /^de/i.test(document.documentElement.lang || navigator.language || '')
      ? 'Sonne, Mond & Himmel: Bahnen, Mondphasen, Goldene/Blaue Stunde, Wolken, Planeten, Finsternisse, Polarlicht.'
      : 'Sun, moon & sky: paths, moon phases, golden/blue hour, clouds, planets, eclipses, aurora.',
    preview: true,
    documentationURL: 'https://github.com/muhkuh666/sol-luna-card',
  });
}
window.SolLunaAstro = Astro;
console.info(`%c SOL & LUNA CARD %c v${VERSION} `, 'background:#1f2c63;color:#FFC531;font-weight:700;border-radius:4px 0 0 4px;padding:2px 4px', 'background:#FFC531;color:#1f2c63;border-radius:0 4px 4px 0;padding:2px 4px');
})();
