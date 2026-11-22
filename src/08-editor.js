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
    aurora_visibility_entity: 'Visibility (%)', aurora_alert_entity: 'Visibility alert', aurora_kp_entity: 'Planetary K-index',
    aurora_today_entity: 'Today – level', aurora_today_text_entity: 'Today – text',
    aurora_tomorrow_entity: 'Tomorrow – level', aurora_tomorrow_text_entity: 'Tomorrow – text',
    aurora_day_after_entity: 'Day after – level', aurora_day_after_text_entity: 'Day after – text',
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
        sel('default_tab', [['today', T.tab_today], ['night', T.tab_night], ['year', T.tab_year]]) +
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
