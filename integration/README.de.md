# 🌗 Sol & Luna – Integration

[🇬🇧 English](README.md) · **🇩🇪 Deutsch**

Begleit-Integration zur [Sol & Luna Card](https://github.com/muhkuh666/Sol-Luna-Card). Sie stellt Sonne, Mond, Wolken und Polarlicht als **Entitäten** bereit, damit du sie in **Automationen** nutzen kannst – zum Beispiel „Licht an zur blauen Stunde“ oder „Push-Nachricht bei Polarlicht und klarem Himmel“. Außerdem liefert sie das **echte Geländeprofil** (Horizont) für die Karte.

## Installation

1. Den Ordner [`custom_components/sol_luna`](custom_components/sol_luna) aus diesem Verzeichnis nach `/config/custom_components/` in Home Assistant kopieren (z. B. mit dem File-Editor- oder Samba-Add-on).
2. Home Assistant neu starten.
3. Einstellungen → Geräte & Dienste → **Integration hinzufügen** → „Sol & Luna“.

Die Integration liegt im Repository der Karte und lässt sich deshalb noch nicht über HACS installieren.

## Einrichtung

Standort (vorbelegt aus Home Assistant) und die Internet-Quellen wählen:

| Option | Quelle | Standard |
|---|---|---|
| Polarlicht | NOAA SWPC – Kp-Vorhersage und OVATION-Modell | an |
| Wolken | Open-Meteo – Bewölkung in drei Schichten | an |
| Geländehorizont | PVGIS (EU-Kommission) – Horizontprofil | an |
| 3D-Gebäudemodell | Geobasis NRW – LoD2-Gebäude (nur Nordrhein-Westfalen) | aus |
| Polarlicht-Warnung ab Sichtbarkeit | – | 50 % |

Alle Astronomie-Werte werden lokal berechnet. Die Internet-Quellen kannst du jederzeit unter **Konfigurieren** abschalten.

## Entitäten

### Sensoren

| Entität | Beschreibung |
|---|---|
| Himmelsphase | `night`, `twilight`, `blue_hour`, `golden_hour`, `day` |
| Nächste goldene / blaue Stunde | Zeitstempel des nächsten Beginns |
| Tageslänge | Minuten |
| Sonnenaufgang über Gelände / Sonnenuntergang hinter Gelände | mit echtem Horizont (PVGIS) |
| Mondphase, Mondbeleuchtung | 8 Phasen, Prozent |
| Nächster Vollmond / Neumond | Zeitstempel |
| Astronomische Nacht beginnt / endet | Sonne tiefer als −18° |
| Mondfreie Dunkelheit heute Nacht | Minuten |
| Bewölkung, Bewölkung heute Nacht | Prozent |
| Abendrot-Chance, Morgenrot-Chance | Prozent, aus hohen/mittleren/tiefen Wolken |
| Kp-Index, Max. Kp nächste 24 h | NOAA |
| Polarlicht-Sichtbarkeit | OVATION-Wahrscheinlichkeit am Standort |
| Polarlicht-Chance | `unlikely`, `possible`, `likely` (Faustregel: benötigter Kp ≈ (66 − Breitengrad) / 2) |
| Geländehorizont | Zustand = höchste Horizonthöhe; Attribut `horizon` = Profil `[[Azimut, Höhe], …]` |
| Gebäudemodell | Zustand = Gebäudehöhe; Attribut `faces` = Dach-/Wandflächen in Metern für den 3D-Tab der Karte |

Sonnen-/Mondhöhe, Azimut und Mondentfernung sind vorhanden, aber standardmäßig deaktiviert.

### Binärsensoren

Goldene Stunde · Blaue Stunde · Astronomische Dunkelheit · Mondfreie Dunkelheit · Klarer Himmel heute Nacht · **Polarlicht-Alarm** (Chance „wahrscheinlich“, dunkel genug und nicht bedeckt)

## Zusammen mit der Karte

```yaml
type: custom:sol-luna-card
horizon_source: entity
horizon_entity: sensor.sol_luna_gelandehorizont
house_source: entity
building_entity: sensor.sol_luna_gebaudemodell
```

## Beispiel-Automationen

```yaml
- alias: Licht zur blauen Stunde
  triggers:
    - trigger: state
      entity_id: binary_sensor.sol_luna_blaue_stunde
      to: "on"
  actions:
    - action: light.turn_on
      target:
        entity_id: light.wohnzimmer

- alias: Polarlicht-Alarm
  triggers:
    - trigger: state
      entity_id: binary_sensor.sol_luna_polarlicht_alarm
      to: "on"
  actions:
    - action: notify.notify
      data:
        message: "Polarlicht möglich – Himmel ist klar genug!"
```

Die Entitäts-IDs hängen von der Sprache bei der Einrichtung ab – im Zweifel unter Einstellungen → Entitäten nachsehen.

## Datenquellen

- NOAA Space Weather Prediction Center – Kp-Index und OVATION-Polarlichtmodell
- Open-Meteo – Wolkenvorhersage (CC BY 4.0)
- PVGIS © Europäische Union – Horizontprofil
- 3D-Gebäudemodell: © Geobasis NRW, Datenlizenz Deutschland – Zero – 2.0

## Unterstützen

[☕ Buy Me a Coffee](https://buymeacoffee.com/muhkuh666)

## Lizenz

MIT © muhkuh666
