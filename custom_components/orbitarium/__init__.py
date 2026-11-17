"""Orbitarium - live satellites, stars and constellations for Home Assistant."""

from __future__ import annotations

import asyncio
from datetime import timedelta
import logging
from pathlib import Path

from aiohttp import web

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.http import KEY_HASS
from homeassistant.helpers.typing import ConfigType

from .const import (
    CARD_FILE,
    CONF_GROUPS,
    CONF_MIN_ELEVATION,
    CONF_TRACKED,
    DEFAULT_GROUPS,
    DEFAULT_MIN_ELEVATION,
    DEFAULT_TRACKED,
    DOMAIN,
    TLE_RETRY_MINUTES,
    URL_CATALOG,
    URL_EARTH,
    URL_FRONTEND,
    URL_SKY,
    VERSION,
)
from .coordinator import OrbitariumCoordinator
from .data import OrbitariumData

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SENSOR]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


def parse_tracked(value: str | list | None) -> list[int]:
    """Parse '25544, 48274' into a list of NORAD ids."""
    if value is None:
        return []
    items = value if isinstance(value, list) else str(value).replace(";", ",").split(",")
    out: list[int] = []
    for item in items:
        item = str(item).strip()
        if item.isdigit() and int(item) not in out:
            out.append(int(item))
    return out


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the frontend card and the API views once."""
    hass.data.setdefault(DOMAIN, {})
    frontend_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(URL_FRONTEND, str(frontend_dir), False)]
    )
    add_extra_js_url(hass, f"{URL_FRONTEND}/{CARD_FILE}?v={VERSION}")
    hass.http.register_view(OrbitariumCatalogView())
    hass.http.register_view(OrbitariumSkyView())
    hass.http.register_view(OrbitariumEarthView())
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Orbitarium from a config entry."""
    options = {**entry.data, **entry.options}
    groups = options.get(CONF_GROUPS, DEFAULT_GROUPS)
    tracked = parse_tracked(options.get(CONF_TRACKED, DEFAULT_TRACKED))
    min_el = float(options.get(CONF_MIN_ELEVATION, DEFAULT_MIN_ELEVATION))

    data = OrbitariumData(hass, groups, tracked)
    await data.async_load()

    coordinator = OrbitariumCoordinator(hass, entry, data, min_el)
    hass.data[DOMAIN]["data"] = data
    hass.data[DOMAIN][entry.entry_id] = coordinator

    async def _refresh(_now=None) -> None:
        if data.needs_refresh():
            await data.async_refresh_catalog()
        await data.async_ensure_sky()
        await data.async_ensure_earth()

    if not data.rows:
        # very first start: get the satellite data before the sensors are created
        try:
            async with asyncio.timeout(60):
                await data.async_refresh_catalog()
        except TimeoutError:
            _LOGGER.warning("Initial CelesTrak download timed out, retrying in the background")

    # further downloads in the background so startup is not blocked
    entry.async_create_background_task(hass, _refresh(), f"{DOMAIN}_initial_refresh")
    entry.async_on_unload(
        async_track_time_interval(hass, _refresh, timedelta(minutes=TLE_RETRY_MINUTES))
    )

    await coordinator.async_config_entry_first_refresh()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        hass.data[DOMAIN].pop("data", None)
    return unloaded


def _gzip_response(request: web.Request, payload: bytes | None, missing: str) -> web.Response:
    if payload is None:
        return web.json_response({"error": missing}, status=503)
    headers = {"Cache-Control": "no-cache", "Content-Type": "application/json"}
    if "gzip" in request.headers.get("Accept-Encoding", ""):
        headers["Content-Encoding"] = "gzip"
        return web.Response(body=payload, headers=headers)
    import gzip  # local import, rarely used path

    return web.Response(body=gzip.decompress(payload), headers=headers)


class OrbitariumCatalogView(HomeAssistantView):
    """Serve the merged satellite element catalogue to the card."""

    url = URL_CATALOG
    name = "api:orbitarium:catalog"
    requires_auth = True

    @callback
    def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app[KEY_HASS]
        data: OrbitariumData | None = hass.data.get(DOMAIN, {}).get("data")
        if data is None:
            return web.json_response({"error": "Orbitarium is not configured"}, status=404)
        return _gzip_response(request, data.catalog_gzip, "Satellite data not loaded yet")


class OrbitariumSkyView(HomeAssistantView):
    """Serve the star catalogue to the card."""

    url = URL_SKY
    name = "api:orbitarium:sky"
    requires_auth = True

    @callback
    def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app[KEY_HASS]
        data: OrbitariumData | None = hass.data.get(DOMAIN, {}).get("data")
        if data is None:
            return web.json_response({"error": "Orbitarium is not configured"}, status=404)
        return _gzip_response(request, data.sky_gzip, "Star catalogue not loaded yet")


class OrbitariumEarthView(HomeAssistantView):
    """Serve the NASA Earth images (day and night) for the globe view."""

    url = URL_EARTH
    name = "api:orbitarium:earth"
    requires_auth = True

    async def get(self, request: web.Request, kind: str) -> web.StreamResponse:
        hass: HomeAssistant = request.app[KEY_HASS]
        data: OrbitariumData | None = hass.data.get(DOMAIN, {}).get("data")
        if data is None:
            return web.json_response({"error": "Orbitarium is not configured"}, status=404)
        path = data.earth_path(kind)
        if path is None:
            return web.json_response({"error": "Earth image not downloaded yet"}, status=503)
        return web.FileResponse(path, headers={"Cache-Control": "private, max-age=86400"})
