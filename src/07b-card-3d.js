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

  _rawHouseFaces() {
    const c = this._config;
    this._modelStatus = null;
    if (c.house_source === 'entity' && c.building_entity) {
      const st = this._hass?.states?.[c.building_entity];
      const faces = st?.attributes?.faces;
      return Array.isArray(faces) && faces.length ? { key: 'e|' + c.building_entity + '|' + st.last_updated, faces: () => faces } : null;
    }
    if (c.house_source === 'file' && c.house_model) {
      const url = String(c.house_model).trim();
      const slot = loadModelText(url, () => { if (this.isConnected) this._render(); });
      if (slot.state === 'loading') { this._modelStatus = 'loading'; return null; }
      if (slot.state === 'error') { this._modelStatus = slot.error; return null; }
      const X = this._ctx();
      const key = ['f', url, c.model_up, c.model_scale, c.model_rotation, X.lat, X.lng].join('|');
      return {
        key, faces: () => {
          try { return parseHouseModel(slot.text, url, { up: c.model_up, scale: c.model_scale, rotation: c.model_rotation, lat: X.lat, lon: X.lng }); }
          catch (e) { console.error('sol-luna-card model', e); return { error: String(e.message || e) }; }
        },
      };
    }
    return null;
  },

  _buildingFaces() {
    const src = this._rawHouseFaces();
    if (!src) return null;
    const res = this._cached('bld|' + src.key, () => {
      const faces = src.faces();
      if (!Array.isArray(faces)) return faces;
      const out = [];
      const all = faces.flatMap((f) => f.p || []);
      if (!all.length) return { error: 'leer' };
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
        if (Math.hypot(n[0], n[1], n[2]) < 1e-9) continue;
        n = V3.norm(n);
        const cen = V3.mul(pts.reduce((s, p) => V3.add(s, p), [0, 0, 0]), 1 / pts.length);
        let t = f.t;
        if (!t) {
          if (Math.abs(n[2]) > 0.25 && cen[2] > 0.8) t = 'r';
          else if (n[2] < -0.7 && cen[2] < 0.3) continue;
          else t = 'w';
        }
        if (t === 'r' || t === 'pv') { if (n[2] < 0) n = V3.mul(n, -1); }
        else if (V3.dot(n, [cen[0] - cxy[0], cen[1] - cxy[1], 0]) < 0) n = V3.mul(n, -1);
        out.push({ kind: t === 'pv' ? 'mpv' : t === 'r' ? 'mroof' : 'mwall', pts, n });
      }
      if (!out.length) return { error: 'keine Flächen' };
      const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]), zs = all.map((p) => p[2]);
      return { hasPv: out.some((f) => f.kind === 'mpv'), faces: out, ext: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), height: Math.max(...zs) };
    });
    if (res && res.error) { this._modelStatus = res.error; return null; }
    return res;
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
        <div class="c3dhint">${esc(t.hint3d)}${this._modelStatusHtml(t)}</div>
      </div>`;
  },

  _modelStatusHtml(t) {
    this._buildingFaces();
    const st = this._modelStatus;
    if (!st) return '';
    return st === 'loading' ? ` · ${esc(t.modelLoading)}` : `<br><span class="merr">⚠ ${esc(t.modelError)}: ${esc(st)}</span>`;
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
    const R = model ? Math.max(model.ext * 1.8, model.height * 2.4, 18) : Math.max(hw, hl, wh + rh) * 2.2;

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
      return { ...fc, cen, depth: P(cen)[2] - (fc.kind === 'mpv' ? R * 0.05 : 0), facing: V3.dot(fc.n, V3.sub(cam, cen)) > 0 };
    }).filter((fc) => fc.facing).sort((a, b) => b.depth - a.depth);
    const amb = 0.3 + 0.32 * day;
    for (const fc of vis) {
      const isRoof = fc.kind === 'roof' || fc.kind === 'mroof';
      const base = fc.kind === 'mpv' ? (c.pv_color || '#1d3557') : isRoof ? (c.roof_color || '#9a4433') : (c.wall_color || '#ece6da');
      g.fillStyle = shadeHex(base, amb + 0.75 * light(fc.n));
      line3(fc.pts, true); g.fill();
      if (fc.pts.length > 3 && vis.length < 400) { g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 0.8; g.stroke(); }
      else { g.strokeStyle = g.fillStyle; g.lineWidth = 0.7; g.stroke(); }
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
      if (fc.kind === 'mroof' && c.show_pv && !model.hasPv) {
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
