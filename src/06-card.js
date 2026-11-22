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
      if (el.dataset.tab) {
        this._tab = el.dataset.tab;
        if (el.dataset.tab === 'sky3d') { this._time3d = null; this._viewTime = null; }
        if (el.dataset.tab === 'night') this._skyTime = null;
        this._render();
        return;
      }
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

