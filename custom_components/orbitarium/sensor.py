"""Sensors for Orbitarium."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, SIGNAL_CATALOG_UPDATED
from .coordinator import OrbitariumCoordinator
from .entity import OrbitariumEntity, satellite_name
from .orbit import Pass, compass


def _dt(ts: float | None) -> datetime | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def _iso(ts: float | None) -> str | None:
    dt = _dt(ts)
    return dt.isoformat() if dt else None


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator: OrbitariumCoordinator = hass.data[DOMAIN][entry.entry_id]
    entities: list[SensorEntity] = [
        CatalogSensor(coordinator, entry),
        OverheadSensor(coordinator, entry),
        VisibleNowSensor(coordinator, entry),
    ]
    for norad in coordinator.sky_data.tracked:
        entities.append(PassSensor(coordinator, entry, norad))
    async_add_entities(entities)


class CatalogSensor(OrbitariumEntity, SensorEntity):
    """Number of satellites in the local catalogue."""

    _attr_translation_key = "catalog"
    _attr_icon = "mdi:satellite-variant"
    _attr_native_unit_of_measurement = "satellites"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: OrbitariumCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "catalog")

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL_CATALOG_UPDATED, self._on_catalog))

    @callback
    def _on_catalog(self) -> None:
        self.async_write_ha_state()

    @property
    def native_value(self) -> int:
        return len(self.coordinator.sky_data.rows)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = self.coordinator.sky_data
        return {
            "groups": data.group_counts(),
            "data_updated": _iso(data.catalog_updated or None),
            "last_attempt": _iso(data.last_attempt or None),
            "last_error": data.last_error,
            "next_download_attempt": _iso(data.retry_after) if data.in_backoff() else None,
            "stars_loaded": len(data.sky["stars"]) if data.sky else 0,
            "earth_imagery": data.earth_status(),
            "source": "CelesTrak",
        }


class OverheadSensor(OrbitariumEntity, SensorEntity):
    """Satellites currently above the horizon."""

    _attr_translation_key = "above_horizon"
    _attr_icon = "mdi:satellite-uplink"
    _attr_native_unit_of_measurement = "satellites"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: OrbitariumCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "above_horizon")

    @property
    def native_value(self) -> int:
        return self.coordinator.data.above_horizon

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        state = self.coordinator.data
        return {
            "sun_elevation": round(state.sun_elevation, 1),
            "computed_at": _iso(state.overhead_computed_at or None),
        }


class VisibleNowSensor(OrbitariumEntity, SensorEntity):
    """Sunlit satellites above 10 degrees while the sky is dark."""

    _attr_translation_key = "visible_now"
    _attr_icon = "mdi:star-shooting"
    _attr_native_unit_of_measurement = "satellites"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: OrbitariumCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "visible_now")

    @property
    def native_value(self) -> int:
        return self.coordinator.data.visible_now

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        state = self.coordinator.data
        return {
            "dark_sky": state.sun_elevation <= -6.0,
            "satellites": state.visible,
        }


class PassSensor(OrbitariumEntity, SensorEntity):
    """Start of the next naked-eye visible pass of a tracked satellite."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_icon = "mdi:space-station"
    _attr_translation_key = "next_visible_pass"

    def __init__(self, coordinator: OrbitariumCoordinator, entry: ConfigEntry, norad: int) -> None:
        super().__init__(coordinator, entry, f"pass_{norad}")
        self._norad = norad
        self._attr_translation_placeholders = {"satellite": satellite_name(coordinator, norad)}

    def _next_visible(self) -> Pass | None:
        for p in self.coordinator.data.passes.get(self._norad, []):
            if p.visible and (p.visible_end or p.end) > self.coordinator.data.computed_at:
                return p
        return None

    def _next_any(self) -> Pass | None:
        passes = self.coordinator.data.passes.get(self._norad, [])
        for p in passes:
            if p.end > self.coordinator.data.computed_at:
                return p
        return None

    @property
    def native_value(self) -> datetime | None:
        p = self._next_visible()
        return _dt(p.visible_start) if p else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        p = self._next_visible()
        attrs: dict[str, Any] = {
            "norad_id": self._norad,
            "satellite": self.coordinator.sky_data.name_of(self._norad),
        }
        if p is not None:
            attrs.update({
                "visible_start": _iso(p.visible_start),
                "visible_end": _iso(p.visible_end),
                "duration_seconds": round((p.visible_end or p.end) - (p.visible_start or p.start)),
                "max_elevation": round(p.max_elevation, 1),
                "max_time": _iso(p.max_time),
                "start_direction": compass(p.start_azimuth),
                "max_direction": compass(p.max_azimuth),
                "end_direction": compass(p.end_azimuth),
                "pass_start": _iso(p.start),
                "pass_end": _iso(p.end),
            })
        nxt = self._next_any()
        if nxt is not None:
            attrs["next_pass_any"] = _iso(nxt.start)
            attrs["next_pass_any_max_elevation"] = round(nxt.max_elevation, 1)
        attrs["upcoming_visible"] = [
            {
                "start": _iso(x.visible_start),
                "max_elevation": round(x.max_elevation, 1),
                "from": compass(x.start_azimuth),
                "to": compass(x.end_azimuth),
            }
            for x in self.coordinator.data.passes.get(self._norad, [])
            if x.visible
        ][:5]
        return attrs
