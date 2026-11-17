"""Binary sensors for Orbitarium: tracked satellites visible to the naked eye."""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import OrbitariumCoordinator
from .entity import OrbitariumEntity, satellite_name


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator: OrbitariumCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(TrackedVisibleSensor(coordinator, entry, norad) for norad in coordinator.sky_data.tracked)


class TrackedVisibleSensor(OrbitariumEntity, BinarySensorEntity):
    """On while a tracked satellite is up, sunlit and the sky at home is dark."""

    _attr_translation_key = "tracked_visible"
    _attr_icon = "mdi:eye-outline"

    def __init__(self, coordinator: OrbitariumCoordinator, entry: ConfigEntry, norad: int) -> None:
        super().__init__(coordinator, entry, f"visible_{norad}")
        self._norad = norad
        self._attr_translation_placeholders = {"satellite": satellite_name(coordinator, norad)}

    @property
    def _live(self) -> dict[str, Any] | None:
        return self.coordinator.data.tracked_now.get(self._norad)

    @property
    def available(self) -> bool:
        return super().available and self._live is not None

    @property
    def is_on(self) -> bool | None:
        live = self._live
        return None if live is None else live["visible"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        live = self._live
        if live is None:
            return {"norad_id": self._norad}
        return {
            "norad_id": self._norad,
            "elevation": live["elevation"],
            "azimuth": live["azimuth"],
            "direction": live["direction"],
            "range_km": live["range_km"],
            "sunlit": live["sunlit"],
            "dark_sky": live["dark_sky"],
            "sun_elevation": live["sun_elevation"],
            "min_elevation": self.coordinator.min_el,
        }
