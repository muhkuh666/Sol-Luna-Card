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
