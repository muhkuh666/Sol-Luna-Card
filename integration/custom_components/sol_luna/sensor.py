"""Sensoren für Sol & Luna."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import DEGREE, PERCENTAGE, UnitOfLength, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import SolLunaConfigEntry
from .astro import PHASE_KEYS, SKY_PHASES
from .const import AURORA_CHANCES, CONF_AURORA, CONF_BUILDING, CONF_CLOUDS, CONF_HORIZON
from .entity import SolLunaEntity


@dataclass(frozen=True, kw_only=True)
class SolLunaSensorDescription(SensorEntityDescription):
    """Beschreibung eines Sensors."""

    requires: str | None = None


SENSORS: tuple[SolLunaSensorDescription, ...] = (
    SolLunaSensorDescription(key="sky_phase", device_class=SensorDeviceClass.ENUM, options=SKY_PHASES, icon="mdi:weather-sunset"),
    SolLunaSensorDescription(key="sun_elevation", native_unit_of_measurement=DEGREE, state_class=SensorStateClass.MEASUREMENT, icon="mdi:angle-acute", entity_registry_enabled_default=False),
    SolLunaSensorDescription(key="sun_azimuth", native_unit_of_measurement=DEGREE, state_class=SensorStateClass.MEASUREMENT, icon="mdi:compass-outline", entity_registry_enabled_default=False),
    SolLunaSensorDescription(key="next_golden_hour", device_class=SensorDeviceClass.TIMESTAMP, icon="mdi:camera-iris"),
    SolLunaSensorDescription(key="next_blue_hour", device_class=SensorDeviceClass.TIMESTAMP, icon="mdi:circle-half-full"),
    SolLunaSensorDescription(key="day_length", device_class=SensorDeviceClass.DURATION, native_unit_of_measurement=UnitOfTime.MINUTES, icon="mdi:timer-sand"),
    SolLunaSensorDescription(key="sunrise_over_terrain", device_class=SensorDeviceClass.TIMESTAMP, icon="mdi:image-filter-hdr", requires=CONF_HORIZON),
    SolLunaSensorDescription(key="sunset_over_terrain", device_class=SensorDeviceClass.TIMESTAMP, icon="mdi:image-filter-hdr", requires=CONF_HORIZON),
    SolLunaSensorDescription(key="moon_phase", device_class=SensorDeviceClass.ENUM, options=PHASE_KEYS, icon="mdi:moon-waxing-gibbous"),
    SolLunaSensorDescription(key="moon_illumination", native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT, icon="mdi:brightness-6"),
    SolLunaSensorDescription(key="moon_elevation", native_unit_of_measurement=DEGREE, state_class=SensorStateClass.MEASUREMENT, icon="mdi:angle-acute", entity_registry_enabled_default=False),
    SolLunaSensorDescription(key="moon_distance", device_class=SensorDeviceClass.DISTANCE, native_unit_of_measurement=UnitOfLength.KILOMETERS, icon="mdi:map-marker-distance", entity_registry_enabled_default=False),
    SolLunaSensorDescription(key="next_full_moon", device_class=SensorDeviceClass.TIMESTAMP, icon="mdi:moon-full"),
    SolLunaSensorDescription(key="next_new_moon", device_class=SensorDeviceClass.TIMESTAMP, icon="mdi:moon-new"),
    SolLunaSensorDescription(key="astronomical_dusk", device_class=SensorDeviceClass.TIMESTAMP, icon="mdi:telescope"),
    SolLunaSensorDescription(key="astronomical_dawn", device_class=SensorDeviceClass.TIMESTAMP, icon="mdi:telescope"),
    SolLunaSensorDescription(key="moon_free_darkness", device_class=SensorDeviceClass.DURATION, native_unit_of_measurement=UnitOfTime.MINUTES, icon="mdi:weather-night"),
    SolLunaSensorDescription(key="cloud_cover_now", native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT, icon="mdi:weather-cloudy", requires=CONF_CLOUDS),
    SolLunaSensorDescription(key="cloud_cover_tonight", native_unit_of_measurement=PERCENTAGE, icon="mdi:weather-night-partly-cloudy", requires=CONF_CLOUDS),
    SolLunaSensorDescription(key="sunset_glow_chance", native_unit_of_measurement=PERCENTAGE, icon="mdi:weather-sunset-down", requires=CONF_CLOUDS),
    SolLunaSensorDescription(key="sunrise_glow_chance", native_unit_of_measurement=PERCENTAGE, icon="mdi:weather-sunset-up", requires=CONF_CLOUDS),
    SolLunaSensorDescription(key="kp_index", state_class=SensorStateClass.MEASUREMENT, suggested_display_precision=1, icon="mdi:magnet", requires=CONF_AURORA),
    SolLunaSensorDescription(key="kp_max_24h", suggested_display_precision=1, icon="mdi:magnet-on", requires=CONF_AURORA),
    SolLunaSensorDescription(key="aurora_visibility", native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT, icon="mdi:star-shooting", requires=CONF_AURORA),
    SolLunaSensorDescription(key="aurora_chance", device_class=SensorDeviceClass.ENUM, options=AURORA_CHANCES, icon="mdi:star-shooting-outline", requires=CONF_AURORA),
    SolLunaSensorDescription(key="building", native_unit_of_measurement="m", icon="mdi:home-modern", requires=CONF_BUILDING),
    SolLunaSensorDescription(key="horizon", native_unit_of_measurement=DEGREE, icon="mdi:image-filter-hdr", requires=CONF_HORIZON),
)


async def async_setup_entry(hass: HomeAssistant, entry: SolLunaConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    """Sensoren anlegen."""
    coordinator = entry.runtime_data
    async_add_entities(
        SolLunaSensor(coordinator, desc) for desc in SENSORS
        if desc.requires is None or coordinator.opt(desc.requires, True)
    )


class SolLunaSensor(SolLunaEntity, SensorEntity):
    """Ein Sol-&-Luna-Sensor."""

    entity_description: SolLunaSensorDescription
    _unrecorded_attributes = frozenset({"horizon", "faces"})

    def __init__(self, coordinator, description: SolLunaSensorDescription) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> Any:
        key = self.entity_description.key
        data = self.coordinator.data or {}
        if key == "horizon":
            return data.get("horizon_max")
        if key == "building":
            b = data.get("building")
            return b.get("height") if b else None
        return data.get(key)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        data = self.coordinator.data or {}
        key = self.entity_description.key
        if key == "horizon":
            return {"horizon": data.get("horizon", []), "azimuth_reference": "north_clockwise", "source": "PVGIS"}
        if key == "building":
            b = data.get("building") or {}
            return {"faces": b.get("faces", []), "roof_type": b.get("roof_type"), "building_id": b.get("id"), "source": b.get("source")}
        if key == "aurora_chance":
            return {"kp_needed": data.get("kp_needed"), "kp_index": data.get("kp_index")}
        if key == "sky_phase":
            return {"sun_elevation": data.get("sun_elevation"), "sun_azimuth": data.get("sun_azimuth")}
        return None
