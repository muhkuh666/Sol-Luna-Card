"""Gemeinsame Basis-Entität."""
from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, NAME
from .coordinator import SolLunaCoordinator


class SolLunaEntity(CoordinatorEntity[SolLunaCoordinator]):
    """Basis für alle Sol-&-Luna-Entitäten."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: SolLunaCoordinator, key: str) -> None:
        super().__init__(coordinator)
        self.key = key
        self._attr_translation_key = key
        self._attr_unique_id = f"{coordinator.entry.entry_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, coordinator.entry.entry_id)},
            name=coordinator.entry.title or NAME,
            manufacturer="muhkuh666",
            model="Sol & Luna",
            entry_type=DeviceEntryType.SERVICE,
            configuration_url="https://github.com/muhkuh666/Sol-Luna-Card",
        )
