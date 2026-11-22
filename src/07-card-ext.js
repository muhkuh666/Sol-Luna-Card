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
