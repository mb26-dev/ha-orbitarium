"""Config flow for Orbitarium."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
)

from .const import (
    CONF_GROUPS,
    CONF_MIN_ELEVATION,
    CONF_TRACKED,
    DEFAULT_GROUPS,
    DEFAULT_MIN_ELEVATION,
    DEFAULT_TRACKED,
    DOMAIN,
    SATELLITE_GROUPS,
)


def _schema(defaults: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(CONF_GROUPS, default=defaults.get(CONF_GROUPS, DEFAULT_GROUPS)): SelectSelector(
                SelectSelectorConfig(
                    options=[SelectOptionDict(value=key, label=label) for key, label, _ in SATELLITE_GROUPS],
                    multiple=True,
                    mode=SelectSelectorMode.LIST,
                )
            ),
            vol.Optional(CONF_TRACKED, default=defaults.get(CONF_TRACKED, DEFAULT_TRACKED)): TextSelector(),
            vol.Required(
                CONF_MIN_ELEVATION, default=defaults.get(CONF_MIN_ELEVATION, DEFAULT_MIN_ELEVATION)
            ): NumberSelector(
                NumberSelectorConfig(min=0, max=60, step=1, unit_of_measurement="°", mode=NumberSelectorMode.SLIDER)
            ),
        }
    )


def _validate(user_input: dict[str, Any]) -> dict[str, str]:
    errors: dict[str, str] = {}
    if not user_input.get(CONF_GROUPS):
        errors[CONF_GROUPS] = "no_groups"
    tracked = str(user_input.get(CONF_TRACKED, "")).replace(";", ",")
    for item in tracked.split(","):
        item = item.strip()
        if item and not item.isdigit():
            errors[CONF_TRACKED] = "invalid_norad"
    return errors


class OrbitariumConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle the initial setup."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = _validate(user_input)
            if not errors:
                return self.async_create_entry(title="Orbitarium", data=user_input)
        return self.async_show_form(step_id="user", data_schema=_schema(user_input or {}), errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return OrbitariumOptionsFlow()


class OrbitariumOptionsFlow(OptionsFlow):
    """Change groups and tracked satellites."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = _validate(user_input)
            if not errors:
                return self.async_create_entry(data=user_input)
        current = {**self.config_entry.data, **self.config_entry.options}
        return self.async_show_form(step_id="init", data_schema=_schema(user_input or current), errors=errors)
