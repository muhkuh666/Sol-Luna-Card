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
