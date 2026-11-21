# 🌗 Sol & Luna Card

Eine Home-Assistant-Karte für **Sonne, Mond und Himmel**: Tagesbahn von Sonne und Mond, realistische Mondphase, goldene und blaue Stunde, Tageslänge, Jahreszeiten und **Polarlicht** – mit einem Hintergrund, der sich mit dem echten Himmel verändert.

![Vorschau](images/preview.png)

## Funktionen

- **Dynamischer Himmel** – Hintergrundfarbe folgt der Sonnenhöhe (Tag → goldene Stunde → blaue Stunde → Nacht), nachts mit funkelnden Sternen und gelegentlicher Sternschnuppe
- **Himmelsbahn-Grafik** – Sonnen- und Mondbahn über 24 h, aktuelle Position, goldene/blaue Stunde als farbige Bänder
- **Status mit Countdown** – z. B. „Goldene Stunde · Blaue Stunde in 12 min“
- **Sonnenzeiten** – blaue Stunde, goldene Stunde, Auf-/Untergang, Mittag mit maximaler Höhe
- **Tageslänge** inkl. Veränderung gegenüber gestern
- **Mond** – realistisch gezeichnete Phase (wie am Himmel gedreht), Beleuchtung in %, Mondalter, Mondauf-/-untergang, Entfernung, Tierkreiszeichen
- **Nächste Mondphasen** mit Datum, Uhrzeit und **Supermond-/Minimond-Kennzeichnung**
- **Jahreszeiten** – Countdown zur nächsten Sonnenwende bzw. Tagundnachtgleiche (Südhalbkugel wird berücksichtigt)
- **Polarlicht** – Sichtbarkeit, Kp-Index (Skala 0–9), Warnung und 3-Tage-Vorhersage; bei hoher Aktivität erscheint nachts ein animiertes Nordlicht im Kartenhimmel
- **Grafischer Editor** – alle Optionen inkl. Farben und Entitäten ohne YAML einstellbar
- Deutsch & Englisch, 12/24 h, keine externen Abhängigkeiten, alle Berechnungen lokal im Browser

## Installation

### HACS (benutzerdefiniertes Repository)

1. HACS → ⋮ → **Benutzerdefinierte Repositories**
2. URL `https://github.com/muhkuh666/sol-luna-card`, Typ **Dashboard** hinzufügen
3. „Sol & Luna Card“ installieren und den Browser-Cache leeren

### Manuell

1. `dist/sol-luna-card.js` nach `/config/www/` kopieren
2. Einstellungen → Dashboards → ⋮ → Ressourcen → `/local/sol-luna-card.js` als **JavaScript-Modul** hinzufügen

## Konfiguration

Minimal:

```yaml
type: custom:sol-luna-card
```

Standort und Zeitzone kommen automatisch aus Home Assistant.

Vollständiges Beispiel:

```yaml
type: custom:sol-luna-card
title: Sonne & Mond
icon: mdi:weather-sunset
background: sky            # sky | theme
moon_orientation: sky      # sky (wie am Himmel gedreht) | simple
stars: true
animations: true
show_graph: true
show_moon_in_graph: true
show_hour_bands: true
show_sun_times: true
show_moon: true
show_next_phases: true
show_aurora: true
aurora_effect: true
show_position: true
show_season: true
refresh_period: 60
```

### Alle Optionen

| Option | Standard | Beschreibung |
|---|---|---|
| `title` | „Sonne & Mond“ | Titel |
| `icon` | `mdi:weather-sunset` | Icon vor dem Titel |
| `show_header` / `show_status` | `true` | Kopfzeile / Status-Badge mit Countdown |
| `show_graph` | `true` | Himmelsbahn-Grafik |
| `show_moon_in_graph` | `true` | Mondbahn in der Grafik |
| `show_hour_bands` | `true` | Goldene/blaue Stunde in der Grafik markieren |
| `show_sun_times` | `true` | Sonnenzeiten & Tageslänge |
| `show_moon` / `show_next_phases` | `true` | Mond-Details / nächste Phasen |
| `show_aurora` | `true` | Polarlicht-Bereich (erscheint nur, wenn Entitäten gefunden werden) |
| `aurora_effect` | `true` | Animiertes Nordlicht im Nachthimmel bei Aktivität |
| `show_position` / `show_season` | `true` | Azimut & Höhe / nächste Sonnenwende |
| `background` | `sky` | `sky` = dynamischer Himmel, `theme` = Theme-Hintergrund |
| `moon_orientation` | `sky` | `sky` = so gedreht wie am Himmel, `simple` = links/rechts |
| `stars` / `animations` | `true` | Sterne / Animationen |
| `language` | `auto` | `auto`, `de`, `en` |
| `time_format` | `auto` | `auto`, `24`, `12` |
| `refresh_period` | `60` | Aktualisierung in Sekunden |
| `sun_color`, `moon_color`, `golden_color`, `blue_color`, `curve_color`, `moon_curve_color`, `aurora_color` | – | Farben (Hex) |
| `latitude`, `longitude`, `time_zone` | aus HA | Standort überschreiben |

### Polarlicht-Entitäten

Ohne Angabe sucht die Karte automatisch nach Entitäten mit „aurora“ (Sichtbarkeit in %, Warnung als `binary_sensor`, Vorhersagen für heute/morgen/übermorgen) und nach einem Kp-Index-Sensor („k_index“ / „kp_index“). Wenn etwas nicht erkannt wird, trägst du die Entitäten im Editor unter **Polarlicht** ein:

```yaml
aurora_visibility_entity: sensor.aurora_visibility_visibility
aurora_alert_entity: binary_sensor.aurora_visibility_visibility_alert
aurora_kp_entity: sensor.planetary_k_index
aurora_today_entity: sensor.aurora_heute
aurora_today_text_entity: sensor.aurora_forecast_heute
aurora_tomorrow_entity: sensor.aurora_morgen
aurora_tomorrow_text_entity: sensor.aurora_forecast_morgen
aurora_day_after_entity: sensor.aurora_ubermorgen
aurora_day_after_text_entity: sensor.aurora_forecast_ubermorgen
```

Ein Klick auf einen Polarlicht-Wert öffnet die Detailansicht der Entität.

## Genauigkeit

Sonne und Mond werden mit gekürzten Reihen nach Meeus berechnet. Die Sonnenzeiten liegen typischerweise innerhalb von 1–2 Minuten, die Mondphasen-Termine innerhalb von etwa 10 Minuten der veröffentlichten Werte – mehr als genug für ein Dashboard.

## Unterstützen

Wenn dir die Karte gefällt: [☕ Buy Me a Coffee](https://buymeacoffee.com/muhkuh666)

## Lizenz

MIT © muhkuh666
