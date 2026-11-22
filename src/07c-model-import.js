/* ====================================================================== *
 *  3D-Hausmodell importieren: CityJSON (LoD2), OBJ, einfaches JSON        *
 * ====================================================================== */
const MODELS = new Map();   // url -> { state: 'loading'|'ok'|'error', text, error, listeners }

function loadModelText(url, onDone) {
  let slot = MODELS.get(url);
  if (!slot) {
    slot = { state: 'loading', listeners: new Set() };
    MODELS.set(url, slot);
    fetch(url, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then((txt) => { slot.text = txt; slot.state = 'ok'; })
      .catch((e) => { slot.error = String(e.message || e); slot.state = 'error'; })
      .finally(() => { slot.listeners.forEach((fn) => { try { fn(); } catch (e) { /* */ } }); slot.listeners.clear(); });
  }
  if (slot.state === 'loading' && onDone) slot.listeners.add(onDone);
  return slot;
}

/** Geografische Koordinaten → UTM (ETRS89 ≈ WGS84) */
function latLonToUtm(lat, lon, zone) {
  const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), k0 = 0.9996;
  const lon0 = (zone * 6 - 183) * RAD, phi = lat * RAD, lam = lon * RAD;
  const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), t = Math.tan(phi) ** 2, ep2 = e2 / (1 - e2);
  const c = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lon0);
  const m = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  const x = k0 * n * (A + (1 - t + c) * A ** 3 / 6 + (5 - 18 * t + t * t + 72 * c - 58 * ep2) * A ** 5 / 120) + 500000;
  const y = k0 * (m + n * Math.tan(phi) * (A * A / 2 + (5 - t + 9 * c + 4 * c * c) * A ** 4 / 24 + (61 - 58 * t + t * t + 600 * c - 330 * ep2) * A ** 6 / 720));
  return [x, y];
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/* ---------- CityJSON / CityJSONSeq (LoD2) -------------------------------- */
function cityjsonSurfaces(geom) {
  const out = [];
  const b = geom.boundaries || [], sem = geom.semantics || {}, types = (sem.surfaces || []).map((s) => s.type || ''), vals = sem.values;
  const kind = (i) => (Number.isInteger(i) && types[i]) || '';
  if (geom.type === 'MultiSurface' || geom.type === 'CompositeSurface') b.forEach((s, i) => out.push([s[0], kind(vals ? vals[i] : null)]));
  else if (geom.type === 'Solid') b.forEach((sh, si) => sh.forEach((s, i) => out.push([s[0], kind(vals ? vals[si][i] : null)])));
  else if (geom.type === 'MultiSolid' || geom.type === 'CompositeSolid') {
    b.forEach((so, oi) => so.forEach((sh, si) => sh.forEach((s, i) => out.push([s[0], kind(vals ? vals[oi][si][i] : null)]))));
  }
  return out;
}

function parseCityJSON(text, lat, lon) {
  const t = text.trim();
  let docs;
  try { docs = [JSON.parse(t)]; } catch (e) { docs = t.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l)); }
  let baseTr = null, crsHint = '';
  const buildings = [];
  for (const doc of docs) {
    if (doc.type === 'CityJSON' && doc.transform) baseTr = doc.transform;
    crsHint += JSON.stringify(doc.metadata?.referenceSystem || '');
    const tr = doc.transform || baseTr || { scale: [1, 1, 1], translate: [0, 0, 0] };
    const V = (doc.vertices || []).map((v) => [v[0] * tr.scale[0] + tr.translate[0], v[1] * tr.scale[1] + tr.translate[1], v[2] * tr.scale[2] + tr.translate[2]]);
    const objs = doc.CityObjects || {};
    for (const [id, obj] of Object.entries(objs)) {
      if (!/^Building/.test(obj.type) || obj.type === 'BuildingPart' || (obj.parents && obj.parents.length)) continue;
      const surfs = [];
      for (const cid of [id, ...(obj.children || [])]) {
        const geoms = objs[cid]?.geometry || [];
        const lod2 = geoms.filter((g) => String(g.lod || '').startsWith('2'));
        for (const g of (lod2.length ? lod2 : geoms)) {
          for (const [ring, k] of cityjsonSurfaces(g)) {
            const pts = ring.map((i) => V[i]).filter(Boolean);
            if (pts.length >= 3) surfs.push([pts, k]);
          }
        }
      }
      if (surfs.length) buildings.push({ id, surfs });
    }
  }
  if (!buildings.length) throw new Error('Kein Gebäude in der CityJSON-Datei');
  const s0 = buildings[0].surfs[0][0][0];
  const deg = Math.abs(s0[0]) <= 180 && Math.abs(s0[1]) <= 90;
  const kLon = 111320 * Math.cos(lat * RAD), kLat = 111320;
  const xy = (p) => (deg ? [(p[0] - lon) * kLon, (p[1] - lat) * kLat] : [p[0], p[1]]);
  let home = [0, 0];
  if (!deg) {
    const zone = /25833|5556|3045|zone\s*33/i.test(crsHint) ? 33 : /25831|zone\s*31/i.test(crsHint) ? 31 : Math.floor((lon + 180) / 6) + 1;
    home = latLonToUtm(lat, lon, zone);
  }
  const footprint = (b) => {
    const g = b.surfs.find(([, k]) => k === 'GroundSurface');
    if (g) return g[0].map(xy);
    const all = b.surfs.flatMap(([p]) => p.map(xy));
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]];
  };
  const cen = (poly) => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  let chosen = buildings.find((b) => pointInPoly(home[0], home[1], footprint(b)));
  if (!chosen) {
    chosen = buildings.reduce((best, b) => {
      const c = cen(footprint(b)), d = (c[0] - home[0]) ** 2 + (c[1] - home[1]) ** 2;
      return !best || d < best.d ? { b, d } : best;
    }, null).b;
  }
  const [cx, cy] = cen(footprint(chosen));
  const zmin = Math.min(...chosen.surfs.flatMap(([p]) => p.map((q) => q[2])));
  return chosen.surfs.map(([pts, k]) => ({
    t: k === 'RoofSurface' ? 'r' : k === 'GroundSurface' ? 'g' : 'w',
    p: pts.map((p) => { const [x, y] = xy(p); return [x - cx, y - cy, p[2] - zmin]; }),
  }));
}

/* ---------- OBJ -------------------------------------------------------------- */
function parseOBJ(text, up) {
  const V = [];
  const faces = [];
  let group = '', mtl = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const parts = line.split(/\s+/);
    const key = parts[0];
    if (key === 'v') V.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    else if (key === 'g' || key === 'o') group = parts.slice(1).join(' ');
    else if (key === 'usemtl') mtl = parts.slice(1).join(' ');
    else if (key === 'f') {
      const idx = parts.slice(1).map((p) => { const i = parseInt(p.split('/')[0], 10); return i < 0 ? V.length + i : i - 1; });
      if (idx.length >= 3) faces.push({ idx, name: `${group} ${mtl}`.toLowerCase() });
    }
  }
  if (!faces.length) throw new Error('Keine Flächen in der OBJ-Datei');
  // Achsen: Y-oben (Blender-Standard: x Ost, -z Nord) oder Z-oben (x Ost, y Nord)
  let mode = up;
  if (mode !== 'y' && mode !== 'z') {
    const ys = V.map((v) => v[1]), zs = V.map((v) => v[2]);
    const minY = Math.min(...ys), minZ = Math.min(...zs);
    // Boden meist bei 0 bzw. kleinster Wert; wählt die Achse, deren Unterseite die meisten Punkte teilt
    const atMin = (arr, mn) => arr.filter((x) => Math.abs(x - mn) < 0.05 * (Math.max(...arr) - mn || 1)).length;
    mode = atMin(zs, minZ) > atMin(ys, minY) ? 'z' : 'y';
  }
  const P = V.map((v) => (mode === 'z' ? [v[0], v[1], v[2]] : [v[0], -v[2], v[1]]));
  return faces.map((f) => {
    const pts = f.idx.map((i) => P[i]).filter(Boolean);
    let t = '';
    if (/pv|solar|panel|modul/.test(f.name)) t = 'pv';
    else if (/roof|dach/.test(f.name)) t = 'r';
    else if (/ground|boden|floor/.test(f.name)) t = 'g';
    return { t, p: pts };
  }).filter((f) => f.p.length >= 3);
}

/** Text → Flächenliste {t:'r'|'w'|'g'|'pv'|'', p:[[x,y,z]…]} in lokalen Metern */
function parseHouseModel(text, url, opts) {
  const head = text.slice(0, 2000).trim();
  let faces;
  if (/\.obj(\?|$)/i.test(url) || /^(#|v |o |g |mtllib)/m.test(head) && !head.startsWith('{') && !head.startsWith('[')) {
    faces = parseOBJ(text, opts.up);
  } else {
    const first = head.startsWith('[') ? null : (() => { try { return JSON.parse(text); } catch (e) { return null; } })();
    if (Array.isArray(first) || (head.startsWith('[') && Array.isArray(JSON.parse(text)))) faces = JSON.parse(text);
    else if (first && Array.isArray(first.faces)) faces = first.faces;
    else faces = parseCityJSON(text, opts.lat, opts.lon);
  }
  // Skalierung, Drehung, Zentrierung, Boden auf 0
  const sc = Number(opts.scale) || 1, rot = (Number(opts.rotation) || 0) * RAD;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  faces.forEach((f) => { f.p = f.p.map(([x, y, z]) => [(x * cr + y * sr) * sc, (-x * sr + y * cr) * sc, z * sc]); });
  const all = faces.flatMap((f) => f.p);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]), zs = all.map((p) => p[2]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, z0 = Math.min(...zs);
  faces.forEach((f) => { f.p = f.p.map(([x, y, z]) => [x - cx, y - cy, z - z0]); });
  return faces;
}
