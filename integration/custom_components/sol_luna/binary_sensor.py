"""Binärsensoren für Sol & Luna."""
from __future__ import annotations

from dataclasses import dataclass

from homeassistant.components.binary_sensor import BinarySensorEntity, BinarySensorEntityDescription
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import SolLunaConfigEntry
from .const import CONF_AURORA, CONF_CLOUDS
from .entity import SolLunaEntity


@dataclass(frozen=True, kw_only=True)
class SolLunaBinaryDescription(BinarySensorEntityDescription):
    """Beschreibung eines Binärsensors."""

    requires: str | None = None


BINARY: tuple[SolLunaBinaryDescription, ...] = (
    SolLunaBinaryDescription(key="golden_hour", icon="mdi:camera-iris"),
    SolLunaBinaryDescription(key="blue_hour", icon="mdi:circle-half-full"),
    SolLunaBinaryDescription(key="astronomical_darkness", icon="mdi:telescope"),
    SolLunaBinaryDescription(key="moon_free_dark", icon="mdi:weather-night"),
    SolLunaBinaryDescription(key="clear_sky_tonight", icon="mdi:weather-night", requires=CONF_CLOUDS),
    SolLunaBinaryDescription(key="aurora_alert", icon="mdi:star-shooting", requires=CONF_AURORA),
)


async def async_setup_entry(hass: HomeAssistant, entry: SolLunaConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    """Binärsensoren anlegen."""
    coordinator = entry.runtime_data
    async_add_entities(
        SolLunaBinary(coordinator, d) for d in BINARY if d.requires is None or coordinator.opt(d.requires, True)
    )


class SolLunaBinary(SolLunaEntity, BinarySensorEntity):
    """Ein Sol-&-Luna-Binärsensor."""

    entity_description: SolLunaBinaryDescription

    def __init__(self, coordinator, description: SolLunaBinaryDescription) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def is_on(self) -> bool | None:
        return bool((self.coordinator.data or {}).get(self.entity_description.key))
