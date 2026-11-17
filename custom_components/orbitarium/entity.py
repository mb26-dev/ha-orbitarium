"""Base entity for Orbitarium."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, VERSION
from .coordinator import OrbitariumCoordinator

KNOWN_NAMES = {25544: "ISS", 48274: "Tiangong", 20580: "Hubble"}


def short_name(name: str) -> str:
    base = name.split(" (")[0].strip()
    return base or name


def satellite_name(coordinator: OrbitariumCoordinator, norad: int) -> str:
    """Friendly name of a tracked satellite for entity names."""
    name = KNOWN_NAMES.get(norad)
    if name is None:
        catalog_name = coordinator.sky_data.name_of(norad)
        name = short_name(catalog_name) if catalog_name else f"NORAD {norad}"
    return name


class OrbitariumEntity(CoordinatorEntity[OrbitariumCoordinator]):
    """Base entity."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: OrbitariumCoordinator, entry: ConfigEntry, key: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="Orbitarium",
            manufacturer="Orbitarium",
            model="CelesTrak GP data",
            sw_version=VERSION,
            entry_type=DeviceEntryType.SERVICE,
        )
