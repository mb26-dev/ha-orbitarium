"""Coordinator computing overhead satellites and visible passes."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
import logging
import math
import time
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import (
    DOMAIN,
    OVERHEAD_SCAN_SECONDS,
    PASS_HORIZON_HOURS,
    PASS_SCAN_SECONDS,
    PASS_REFRESH_MINUTES,
    SIGNAL_CATALOG_UPDATED,
)
from .data import OrbitariumData
from .orbit import (
    Observer,
    Pass,
    compass,
    find_passes,
    is_sunlit,
    jd_from_unix,
    look_angles,
    sun_direction,
    sun_elevation,
)

_LOGGER = logging.getLogger(__name__)


@dataclass
class SkyState:
    """Result of one computation round."""

    computed_at: float = 0.0
    sun_elevation: float = 0.0
    above_horizon: int = 0
    visible_now: int = 0
    visible: list[dict[str, Any]] = field(default_factory=list)
    passes: dict[int, list[Pass]] = field(default_factory=dict)
    passes_computed_at: float = 0.0
    overhead_computed_at: float = 0.0
    # live position and visibility of every tracked satellite
    tracked_now: dict[int, dict[str, Any]] = field(default_factory=dict)


def compute_overhead(data: OrbitariumData, obs: Observer, now: float) -> tuple[int, int, float, list[dict[str, Any]]]:
    """Count satellites above the horizon and those visible to the naked eye."""
    jd = jd_from_unix(now)
    frame = obs.frame(jd)
    sun = sun_direction(jd)
    sun_el = sun_elevation(frame, sun)
    dark = sun_el <= -6.0
    group_names = [g for g in data.group_counts()]
    names = {row[0]: (row[1], group_names[row[10]]) for row in data.rows}
    above = 0
    visible: list[dict[str, Any]] = []
    for norad, rec in data.satrecs.items():
        r = rec.position_at_jd(jd)
        if r is None:
            continue
        el, az, rng = look_angles(frame, r)
        if el <= 0:
            continue
        above += 1
        if dark and el >= 10.0 and is_sunlit(r, sun) and math.sqrt(r[0] ** 2 + r[1] ** 2 + r[2] ** 2) < 6371.0 + 2000.0:
            name, group = names.get(norad, (str(norad), ""))
            visible.append({
                "name": name,
                "norad": norad,
                "group": group,
                "elevation": round(el, 1),
                "azimuth": round(az, 1),
                "range_km": round(rng),
            })
    visible.sort(key=lambda v: v["elevation"], reverse=True)
    return above, len(visible), sun_el, visible


def compute_tracked(data: OrbitariumData, obs: Observer, now: float, min_el: float) -> dict[int, dict[str, Any]]:
    """Live position and naked-eye visibility of the tracked satellites."""
    jd = jd_from_unix(now)
    frame = obs.frame(jd)
    sun = sun_direction(jd)
    sun_el = sun_elevation(frame, sun)
    out: dict[int, dict[str, Any]] = {}
    for norad in data.tracked:
        rec = data.satrecs.get(norad)
        if rec is None:
            continue
        r = rec.position_at_jd(jd)
        if r is None:
            continue
        el, az, rng = look_angles(frame, r)
        lit = is_sunlit(r, sun)
        out[norad] = {
            "elevation": round(el, 1),
            "azimuth": round(az, 1),
            "direction": compass(az),
            "range_km": round(rng) if el > 0 else None,
            "sunlit": lit,
            "sun_elevation": round(sun_el, 1),
            "dark_sky": sun_el <= -6.0,
            "visible": el >= min_el and lit and sun_el <= -6.0,
        }
    return out


def compute_passes(data: OrbitariumData, obs: Observer, now: float, min_el: float) -> dict[int, list[Pass]]:
    out: dict[int, list[Pass]] = {}
    for norad in data.tracked:
        rec = data.satrecs.get(norad)
        if rec is None:
            continue
        out[norad] = find_passes(rec, obs, now, hours=PASS_HORIZON_HOURS, min_el=min_el)
    return out


class OrbitariumCoordinator(DataUpdateCoordinator[SkyState]):
    """Periodically evaluates the sky above the Home Assistant location."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, data: OrbitariumData, min_el: float) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            config_entry=entry,
            update_interval=timedelta(seconds=OVERHEAD_SCAN_SECONDS),
        )
        self.sky_data = data
        self.min_el = min_el
        self._state = SkyState()
        self._force_passes = True
        entry.async_on_unload(
            async_dispatcher_connect(hass, SIGNAL_CATALOG_UPDATED, self._catalog_updated)
        )

    @callback
    def _catalog_updated(self) -> None:
        self._force_passes = True
        self.hass.async_create_task(self.async_request_refresh())

    @property
    def observer(self) -> Observer:
        cfg = self.hass.config
        return Observer(cfg.latitude, cfg.longitude, (cfg.elevation or 0) / 1000.0)

    def _passes_stale(self, now: float) -> bool:
        if self._force_passes:
            return True
        if now - self._state.passes_computed_at > PASS_REFRESH_MINUTES * 60:
            return True
        for passes in self._state.passes.values():
            if passes and passes[0].end < now:
                return True
        return False

    def _pass_close(self, state: SkyState, now: float) -> bool:
        """A tracked satellite is up or rises before the next regular scan."""
        if any(t["elevation"] > -1.0 for t in state.tracked_now.values()):
            return True
        horizon = now + OVERHEAD_SCAN_SECONDS + PASS_SCAN_SECONDS
        for passes in state.passes.values():
            for p in passes:
                if p.end >= now and p.start <= horizon:
                    return True
        return False

    async def _async_update_data(self) -> SkyState:
        now = time.time()
        obs = self.observer
        prev = self._state
        state = SkyState(
            passes=prev.passes,
            passes_computed_at=prev.passes_computed_at,
            above_horizon=prev.above_horizon,
            visible_now=prev.visible_now,
            sun_elevation=prev.sun_elevation,
            visible=prev.visible,
            overhead_computed_at=prev.overhead_computed_at,
        )
        if self.sky_data.satrecs:
            # the scan over the whole catalogue only every OVERHEAD_SCAN_SECONDS,
            # the tracked satellites on every (faster) update during a pass
            if now - prev.overhead_computed_at >= OVERHEAD_SCAN_SECONDS - 1 or self._force_passes:
                above, visible_count, sun_el, visible = await self.hass.async_add_executor_job(
                    compute_overhead, self.sky_data, obs, now
                )
                state.above_horizon = above
                state.visible_now = visible_count
                state.sun_elevation = sun_el
                state.visible = visible[:15]
                state.overhead_computed_at = now
            if self._passes_stale(now):
                state.passes = await self.hass.async_add_executor_job(
                    compute_passes, self.sky_data, obs, now, self.min_el
                )
                state.passes_computed_at = now
                self._force_passes = False
            state.tracked_now = await self.hass.async_add_executor_job(
                compute_tracked, self.sky_data, obs, now, self.min_el
            )
        state.computed_at = now
        self._state = state
        seconds = PASS_SCAN_SECONDS if self._pass_close(state, now) else OVERHEAD_SCAN_SECONDS
        if self.update_interval != timedelta(seconds=seconds):
            self.update_interval = timedelta(seconds=seconds)
        return state
