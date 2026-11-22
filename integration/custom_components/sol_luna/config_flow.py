"""Einrichtung über die Oberfläche."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_LATITUDE, CONF_LONGITUDE, CONF_NAME
from homeassistant.core import callback
import homeassistant.helpers.config_validation as cv

from .const import (
    CONF_AURORA,
    CONF_AURORA_THRESHOLD,
    CONF_BUILDING,
    CONF_CLOUDS,
    CONF_HORIZON,
    DEFAULT_AURORA_THRESHOLD,
    DOMAIN,
    NAME,
)


def _options_schema(defaults: dict[str, Any]) -> dict:
    return {
        vol.Optional(CONF_AURORA, default=defaults.get(CONF_AURORA, True)): bool,
        vol.Optional(CONF_CLOUDS, default=defaults.get(CONF_CLOUDS, True)): bool,
        vol.Optional(CONF_HORIZON, default=defaults.get(CONF_HORIZON, True)): bool,
        vol.Optional(CONF_BUILDING, default=defaults.get(CONF_BUILDING, False)): bool,
        vol.Optional(CONF_AURORA_THRESHOLD, default=defaults.get(CONF_AURORA_THRESHOLD, DEFAULT_AURORA_THRESHOLD)):
            vol.All(vol.Coerce(int), vol.Range(min=1, max=100)),
    }


class SolLunaConfigFlow(ConfigFlow, domain=DOMAIN):
    """Config-Flow für Sol & Luna."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            await self.async_set_unique_id(f"{user_input[CONF_LATITUDE]:.4f}_{user_input[CONF_LONGITUDE]:.4f}")
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title=user_input.get(CONF_NAME) or NAME, data=user_input)
        schema = vol.Schema({
            vol.Optional(CONF_NAME, default=NAME): str,
            vol.Required(CONF_LATITUDE, default=self.hass.config.latitude): cv.latitude,
            vol.Required(CONF_LONGITUDE, default=self.hass.config.longitude): cv.longitude,
            **_options_schema({}),
        })
        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return SolLunaOptionsFlow()


class SolLunaOptionsFlow(OptionsFlow):
    """Optionen nachträglich ändern."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        defaults = {**self.config_entry.data, **self.config_entry.options}
        return self.async_show_form(step_id="init", data_schema=vol.Schema(_options_schema(defaults)))
