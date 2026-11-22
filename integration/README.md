# 🌗 Sol & Luna – Integration

**🇬🇧 English** · [🇩🇪 Deutsch](README.de.md)

Companion integration for the [Sol & Luna Card](https://github.com/muhkuh666/Sol-Luna-Card). It provides sun, moon, clouds and aurora as **entities** for your **automations** – for example “lights on at blue hour” or “push notification when there is aurora and a clear sky”. It also provides the **real terrain horizon** for the card.

## Installation

1. Copy the folder [`custom_components/sol_luna`](custom_components/sol_luna) from this directory to `/config/custom_components/` in Home Assistant (e.g. with the File editor or Samba add-on).
2. Restart Home Assistant.
3. Settings → Devices & services → **Add integration** → “Sol & Luna”.

The integration currently lives inside the card repository, so it cannot be installed through HACS yet.

## Setup

Choose the location (prefilled from Home Assistant) and the internet sources:

| Option | Source | Default |
|---|---|---|
| Aurora | NOAA SWPC – Kp forecast and OVATION model | on |
| Clouds | Open-Meteo – cloud cover in three layers | on |
| Terrain horizon | PVGIS (European Commission) – horizon profile | on |
| 3D building model | Geobasis NRW – LoD2 building (North Rhine-Westphalia only) | off |
| Aurora alert from visibility | – | 50 % |

All astronomy values are calculated locally. The internet sources can be switched off at any time under **Configure**.

## Entities

### Sensors

| Entity | Description |
|---|---|
| Sky phase | `night`, `twilight`, `blue_hour`, `golden_hour`, `day` |
| Next golden / blue hour | Timestamp of the next start |
| Day length | Minutes |
| Sunrise over terrain / sunset behind terrain | With the real horizon (PVGIS) |
| Moon phase, moon illumination | 8 phases, percent |
| Next full moon / new moon | Timestamp |
| Astronomical night begins / ends | Sun lower than −18° |
| Moon-free darkness tonight | Minutes |
| Cloud cover, cloud cover tonight | Percent |
| Sunset glow chance, sunrise glow chance | Percent, from high/mid/low clouds |
| Kp index, max Kp next 24 h | NOAA |
| Aurora visibility | OVATION probability at your location |
| Aurora chance | `unlikely`, `possible`, `likely` (rule of thumb: needed Kp ≈ (66 − latitude) / 2) |
| Terrain horizon | State = highest horizon elevation; attribute `horizon` = profile `[[azimuth, elevation], …]` |
| Building model | State = building height; attribute `faces` = roof/wall polygons in metres for the card's 3D tab |

Sun/moon elevation, azimuth and moon distance are available but disabled by default.

### Binary sensors

Golden hour · Blue hour · Astronomical darkness · Moon-free darkness · Clear sky tonight · **Aurora alert** (chance “likely”, dark enough and not overcast)

## Together with the card

```yaml
type: custom:sol-luna-card
horizon_source: entity
horizon_entity: sensor.sol_luna_terrain_horizon
house_source: entity
building_entity: sensor.sol_luna_building_model
```

## Example automations

```yaml
- alias: Lights at blue hour
  triggers:
    - trigger: state
      entity_id: binary_sensor.sol_luna_blue_hour
      to: "on"
  actions:
    - action: light.turn_on
      target:
        entity_id: light.living_room

- alias: Aurora alert
  triggers:
    - trigger: state
      entity_id: binary_sensor.sol_luna_aurora_alert
      to: "on"
  actions:
    - action: notify.notify
      data:
        message: "Aurora possible – the sky is clear enough!"
```

Entity IDs depend on the language used during setup – check Settings → Entities if in doubt.

## Data sources

- NOAA Space Weather Prediction Center – Kp index and OVATION aurora model
- Open-Meteo – cloud forecast (CC BY 4.0)
- PVGIS © European Union – horizon profile
- 3D building model: © Geobasis NRW, Datenlizenz Deutschland – Zero – 2.0

## Support

[☕ Buy Me a Coffee](https://buymeacoffee.com/muhkuh666)

## License

MIT © muhkuh666
