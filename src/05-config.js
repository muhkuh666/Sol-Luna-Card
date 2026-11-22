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

