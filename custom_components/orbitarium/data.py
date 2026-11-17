"""Data handling for Orbitarium: CelesTrak GP data and the star catalogue."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import gzip
import json
import logging
from pathlib import Path
import time
from typing import Any

import aiohttp

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    CELESTRAK_CATNR_URL,
    CELESTRAK_GROUP_URL,
    D3C_BASE,
    EARTH_DAY_FALLBACK_MONTH,
    EARTH_DAY_URL,
    EARTH_DIR,
    EARTH_NIGHT_URL,
    LAND_URL,
    SATELLITE_GROUPS,
    SIGNAL_CATALOG_UPDATED,
    SKY_DATA_VERSION,
    SKY_FILES,
    STAR_NAME_MAX_MAG,
    STORAGE_KEY_CATALOG,
    STORAGE_KEY_SKY,
    STORAGE_VERSION,
    TLE_REFRESH_HOURS,
    TRACKED_GROUP,
    VERSION,
)
from .orbit import SatRec

_LOGGER = logging.getLogger(__name__)

USER_AGENT = f"HomeAssistant-Orbitarium/{VERSION}"
HTTP_TIMEOUT = aiohttp.ClientTimeout(total=90)
IMAGE_TIMEOUT = aiohttp.ClientTimeout(total=180)
MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]


def _epoch_to_jd(epoch: str) -> float:
    dt = datetime.fromisoformat(epoch.replace("Z", ""))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp() / 86400.0 + 2440587.5


def omm_to_row(omm: dict[str, Any]) -> list[Any] | None:
    """Convert one CelesTrak OMM JSON record into a compact row.

    Row: [norad, name, epoch_jd, mean_motion, ecc, inc, raan, argp, mean_anomaly, bstar]
    """
    try:
        return [
            int(omm["NORAD_CAT_ID"]),
            str(omm.get("OBJECT_NAME", "")).strip(),
            round(_epoch_to_jd(str(omm["EPOCH"])), 8),
            float(omm["MEAN_MOTION"]),
            float(omm["ECCENTRICITY"]),
            float(omm["INCLINATION"]),
            float(omm["RA_OF_ASC_NODE"]),
            float(omm["ARG_OF_PERICENTER"]),
            float(omm["MEAN_ANOMALY"]),
            float(omm.get("BSTAR", 0.0) or 0.0),
        ]
    except (KeyError, TypeError, ValueError):
        return None


def build_satrec(row: list[Any]) -> SatRec | None:
    try:
        return SatRec(row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9])
    except (ValueError, ZeroDivisionError, OverflowError):
        return None


def parse_omm_text(text: str) -> list[list[Any]]:
    """Parse a CelesTrak OMM JSON response into compact rows.

    Runs in the executor: the Starlink group alone is several megabytes of JSON.
    Raises ValueError when the text is not JSON and TypeError when it is not a list.
    """
    data = json.loads(text)
    if not isinstance(data, list):
        raise TypeError("unexpected response")
    return [r for r in (omm_to_row(o) for o in data) if r is not None]


def parse_sky_texts(texts: dict[str, str]) -> dict[str, Any]:
    """Parse the downloaded star catalogue files and build the compact catalogue (executor)."""
    return process_sky_files({key: json.loads(text) for key, text in texts.items()})


def _ra(lon: float) -> float:
    return round(lon + 360.0 if lon < 0 else lon, 3)


def _num(value: Any) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out


def process_sky_files(raw: dict[str, Any]) -> dict[str, Any]:
    """Turn the d3-celestial GeoJSON files into a compact catalogue."""
    stars: list[list[Any]] = []
    star_index: dict[int, int] = {}
    for feat in raw["stars"].get("features", []):
        coords = feat.get("geometry", {}).get("coordinates")
        props = feat.get("properties", {})
        mag = _num(props.get("mag"))
        if not coords or mag is None:
            continue
        bv = _num(props.get("bv"))
        hip = feat.get("id")
        stars.append([_ra(coords[0]), round(coords[1], 3), round(mag, 2), None if bv is None else round(bv, 2)])
        try:
            star_index[int(hip)] = len(stars) - 1
        except (TypeError, ValueError):
            pass

    names: list[list[Any]] = []
    for hip, info in raw["starnames"].items():
        try:
            idx = star_index.get(int(hip))
        except (TypeError, ValueError):
            continue
        if idx is None:
            continue
        name = (info or {}).get("name") or ""
        if name and stars[idx][2] <= STAR_NAME_MAX_MAG:
            names.append([idx, name])

    lines: list[list[Any]] = []
    for feat in raw["lines"].get("features", []):
        geom = feat.get("geometry", {})
        for line in geom.get("coordinates", []):
            lines.append([feat.get("id", ""), [[_ra(p[0]), round(p[1], 3)] for p in line]])

    constellations: list[list[Any]] = []
    for feat in raw["constellations"].get("features", []):
        coords = feat.get("geometry", {}).get("coordinates")
        props = feat.get("properties", {})
        if not coords:
            continue
        constellations.append([
            feat.get("id", ""),
            props.get("name") or props.get("la") or props.get("en") or feat.get("id", ""),
            _ra(coords[0]),
            round(coords[1], 3),
            int(_num(props.get("rank")) or 3),
        ])

    land: list[list[list[float]]] = []
    for feat in (raw.get("land") or {}).get("features", []):
        geom = feat.get("geometry") or {}
        if geom.get("type") == "Polygon":
            polys = [geom.get("coordinates", [])]
        elif geom.get("type") == "MultiPolygon":
            polys = geom.get("coordinates", [])
        else:
            continue
        for poly in polys:
            rings: list[list[float]] = []
            for ring in poly:
                flat: list[float] = []
                for pt in ring:
                    flat.append(round(pt[0], 2))
                    flat.append(round(pt[1], 2))
                if len(flat) >= 6:
                    rings.append(flat)
            if rings:
                land.append(rings)

    return {
        "version": SKY_DATA_VERSION,
        "stars": stars,
        "names": names,
        "lines": lines,
        "constellations": constellations,
        "land": land,
    }


class OrbitariumData:
    """Holds and refreshes the satellite catalogue and the sky catalogue."""

    def __init__(self, hass: HomeAssistant, groups: list[str], tracked: list[int]) -> None:
        self.hass = hass
        self.groups = [g for g, _, _ in SATELLITE_GROUPS if g in groups]
        self.tracked = tracked
        self._store_catalog: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY_CATALOG)
        self._store_sky: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY_SKY)
        self.group_rows: dict[str, list[list[Any]]] = {}
        self.group_updated: dict[str, float] = {}
        self.last_attempt: float = 0.0
        self.last_error: str | None = None
        self.sky: dict[str, Any] | None = None
        self.rows: list[list[Any]] = []  # merged rows incl. group index at [10]
        self.satrecs: dict[int, SatRec] = {}
        self.catalog_gzip: bytes | None = None
        self.catalog_json: bytes | None = None
        self.sky_gzip: bytes | None = None
        self.sky_json: bytes | None = None
        self._names: dict[int, str] = {}
        self._counts: dict[str, int] = {}
        self.catalog_updated: float = 0.0
        self._lock = asyncio.Lock()
        self.earth_dir = Path(hass.config.path(".storage", EARTH_DIR))
        self._earth_lock = asyncio.Lock()
        self._earth_retry: float = 0.0
        self.earth_day_file: Path | None = None
        self.earth_night_file: Path | None = None

    # ------------------------------------------------------------------ load

    async def async_load(self) -> None:
        stored = await self._store_catalog.async_load()
        if isinstance(stored, dict):
            self.group_rows = stored.get("groups", {}) or {}
            self.group_updated = {k: float(v) for k, v in (stored.get("updated", {}) or {}).items()}
        sky = await self._store_sky.async_load()
        if isinstance(sky, dict) and sky.get("version") == SKY_DATA_VERSION:
            self.sky = sky
        await self.hass.async_add_executor_job(self._rebuild)

    # ------------------------------------------------------------- refreshing

    def _tracked_changed(self) -> bool:
        have = {row[0] for row in self.group_rows.get("tracked", [])}
        return any(t not in have for t in self.tracked)

    def needs_refresh(self) -> bool:
        now = time.time()
        wanted = list(self.groups) + (["tracked"] if self.tracked else [])
        for key in wanted:
            if now - self.group_updated.get(key, 0.0) > TLE_REFRESH_HOURS * 3600:
                return True
        return bool(self.tracked) and self._tracked_changed()

    async def async_refresh_catalog(self, force: bool = False) -> bool:
        """Download stale groups. Returns True when something changed."""
        async with self._lock:
            now = time.time()
            self.last_attempt = now
            session = async_get_clientsession(self.hass)
            changed = False
            errors: list[str] = []
            for group in self.groups:
                if not force and now - self.group_updated.get(group, 0.0) <= TLE_REFRESH_HOURS * 3600:
                    continue
                url = CELESTRAK_GROUP_URL.format(group=group)
                rows = await self._fetch_omm(session, url, errors, group)
                if rows is not None:
                    self.group_rows[group] = rows
                    self.group_updated[group] = now
                    changed = True
            tracked_stale = now - self.group_updated.get("tracked", 0.0) > TLE_REFRESH_HOURS * 3600
            if self.tracked and (force or tracked_stale or self._tracked_changed()):
                tracked_rows: list[list[Any]] = []
                ok = True
                for catnr in self.tracked:
                    rows = await self._fetch_omm(session, CELESTRAK_CATNR_URL.format(catnr=catnr), errors, f"CATNR {catnr}")
                    if rows is None:
                        ok = False
                        continue
                    tracked_rows.extend(rows)
                if ok or tracked_rows:
                    self.group_rows["tracked"] = tracked_rows
                    self.group_updated["tracked"] = now
                    changed = True
            self.last_error = "; ".join(errors) if errors else None
            if changed:
                await self._store_catalog.async_save({"groups": self.group_rows, "updated": self.group_updated})
                await self.hass.async_add_executor_job(self._rebuild)
                async_dispatcher_send(self.hass, SIGNAL_CATALOG_UPDATED)
            return changed

    async def _fetch_omm(self, session: aiohttp.ClientSession, url: str, errors: list[str], label: str) -> list[list[Any]] | None:
        try:
            async with session.get(url, timeout=HTTP_TIMEOUT, headers={"User-Agent": USER_AGENT}) as resp:
                text = await resp.text()
                if resp.status != 200:
                    errors.append(f"{label}: HTTP {resp.status}")
                    _LOGGER.warning("CelesTrak returned HTTP %s for %s: %s", resp.status, label, text[:200])
                    return None
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            errors.append(f"{label}: {err}")
            _LOGGER.warning("Could not download %s from CelesTrak: %s", label, err)
            return None
        try:
            rows = await self.hass.async_add_executor_job(parse_omm_text, text)
        except ValueError:
            errors.append(f"{label}: {text.strip()[:80]}")
            _LOGGER.warning("CelesTrak returned no JSON for %s: %s", label, text.strip()[:200])
            return None
        except TypeError:
            errors.append(f"{label}: unexpected response")
            return None
        _LOGGER.debug("Loaded %s objects for %s", len(rows), label)
        return rows

    async def async_ensure_sky(self) -> None:
        """Download and cache the star catalogue once."""
        if self.sky is not None:
            return
        session = async_get_clientsession(self.hass)
        texts: dict[str, str] = {}
        try:
            for key, filename in SKY_FILES.items():
                async with session.get(D3C_BASE + filename, timeout=HTTP_TIMEOUT, headers={"User-Agent": USER_AGENT}) as resp:
                    resp.raise_for_status()
                    texts[key] = await resp.text()
            async with session.get(LAND_URL, timeout=HTTP_TIMEOUT, headers={"User-Agent": USER_AGENT}) as resp:
                resp.raise_for_status()
                texts["land"] = await resp.text()
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            _LOGGER.warning("Could not download star catalogue (will retry later): %s", err)
            return
        try:
            sky = await self.hass.async_add_executor_job(parse_sky_texts, texts)
        except (ValueError, TypeError, KeyError, IndexError) as err:
            _LOGGER.warning("Star catalogue could not be read (will retry later): %s", err)
            return
        self.sky = sky
        await self._store_sky.async_save(sky)
        await self.hass.async_add_executor_job(self._rebuild_sky_gzip)
        _LOGGER.info(
            "Sky catalogue ready: %s stars, %s constellation lines, %s land polygons",
            len(sky["stars"]),
            len(sky["lines"]),
            len(sky["land"]),
        )

    # ----------------------------------------------------------- earth imagery

    def _scan_earth(self) -> None:
        """Look up the downloaded Earth images (runs in the executor)."""
        night = self.earth_dir / "earth_night.jpg"
        self.earth_night_file = night if night.is_file() else None
        current = self.earth_dir / f"earth_day_{dt_util.now().month:02d}.jpg"
        if current.is_file():
            self.earth_day_file = current
        else:
            files = sorted(self.earth_dir.glob("earth_day_*.jpg")) if self.earth_dir.is_dir() else []
            self.earth_day_file = files[-1] if files else None

    def earth_path(self, kind: str) -> Path | None:
        """Path of a downloaded Earth image ("day" or "night")."""
        if kind == "day":
            return self.earth_day_file
        if kind == "night":
            return self.earth_night_file
        return None

    def earth_status(self) -> str:
        day = self.earth_path("day")
        night = self.earth_path("night")
        if day and night:
            return f"ready ({day.stem[-2:]})"
        if day or night:
            return "partial"
        return "missing"

    async def async_ensure_earth(self) -> None:
        """Download the NASA day and night images once (day image per month)."""
        if time.time() < self._earth_retry or self._earth_lock.locked():
            return
        async with self._earth_lock:
            await self.hass.async_add_executor_job(self._scan_earth)
            month = dt_util.now().month
            day_file = self.earth_dir / f"earth_day_{month:02d}.jpg"
            night_file = self.earth_dir / "earth_night.jpg"
            have_day = await self.hass.async_add_executor_job(day_file.is_file)
            have_night = await self.hass.async_add_executor_job(night_file.is_file)
            if have_day and have_night:
                return
            await self.hass.async_add_executor_job(lambda: self.earth_dir.mkdir(parents=True, exist_ok=True))
            session = async_get_clientsession(self.hass)
            ok = True
            if not have_day:
                image = None
                for m in (month, EARTH_DAY_FALLBACK_MONTH):
                    url = EARTH_DAY_URL.format(month_name=MONTH_NAMES[m - 1], month=m)
                    image = await self._fetch_image(session, url)
                    if image:
                        break
                if image:
                    await self.hass.async_add_executor_job(self._store_day_image, day_file, image)
                    _LOGGER.info("Earth day image for month %s ready (%s kB)", month, len(image) // 1024)
                else:
                    ok = False
            if not have_night:
                image = await self._fetch_image(session, EARTH_NIGHT_URL)
                if image:
                    await self.hass.async_add_executor_job(night_file.write_bytes, image)
                    _LOGGER.info("Earth night image ready (%s kB)", len(image) // 1024)
                else:
                    ok = False
            await self.hass.async_add_executor_job(self._scan_earth)
            if not ok:
                # NASA servers are sometimes slow; try again in a few hours
                self._earth_retry = time.time() + 6 * 3600

    def _store_day_image(self, path: Path, image: bytes) -> None:
        path.write_bytes(image)
        for old in self.earth_dir.glob("earth_day_*.jpg"):
            if old != path:
                old.unlink(missing_ok=True)

    async def _fetch_image(self, session: aiohttp.ClientSession, url: str) -> bytes | None:
        try:
            async with session.get(url, timeout=IMAGE_TIMEOUT, headers={"User-Agent": USER_AGENT}) as resp:
                if resp.status != 200:
                    _LOGGER.debug("Earth image %s returned HTTP %s", url, resp.status)
                    return None
                body = await resp.read()
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            _LOGGER.warning("Could not download Earth image %s: %s", url, err)
            return None
        if len(body) < 50_000 or not body.startswith(b"\xff\xd8"):
            _LOGGER.warning("Earth image %s is not a JPEG, ignoring it", url)
            return None
        return body

    # ---------------------------------------------------------------- building

    def _rebuild(self) -> None:
        group_keys = [g for g, _, _ in SATELLITE_GROUPS if g in self.groups]
        if self.tracked:
            group_keys.append("tracked")
        seen: dict[int, int] = {}
        rows: list[list[Any]] = []
        # tracked satellites claim their rows first, so they keep the tracked
        # group (gold marker, own chip) even when another group also lists them
        order = sorted(range(len(group_keys)), key=lambda i: group_keys[i] != "tracked")
        for gi in order:
            key = group_keys[gi]
            for row in self.group_rows.get(key, []):
                if row[0] in seen:
                    continue
                if key == "tracked" and row[0] not in self.tracked:
                    continue
                seen[row[0]] = len(rows)
                rows.append(list(row[:10]) + [gi])
        satrecs: dict[int, SatRec] = {}
        for row in rows:
            rec = build_satrec(row)
            if rec is not None:
                satrecs[row[0]] = rec
        labels = {g: (lbl, col) for g, lbl, col in SATELLITE_GROUPS}
        labels[TRACKED_GROUP[0]] = (TRACKED_GROUP[1], TRACKED_GROUP[2])
        updated = max([self.group_updated.get(k, 0.0) for k in group_keys] or [0.0])
        payload = {
            "version": VERSION,
            "updated": updated,
            "groups": [{"key": k, "name": labels[k][0], "color": labels[k][1]} for k in group_keys],
            "tracked": self.tracked,
            "sats": rows,
        }
        counts = {k: 0 for k in group_keys}
        for row in rows:
            counts[group_keys[row[10]]] += 1
        catalog_json = json.dumps(payload, separators=(",", ":")).encode()
        self.rows = rows
        self.satrecs = satrecs
        self.catalog_updated = updated
        self._names = {row[0]: row[1] for row in rows}
        self._counts = counts
        # plain and gzip copy, so the API views never compress or decompress on the event loop
        self.catalog_json = catalog_json
        self.catalog_gzip = gzip.compress(catalog_json, 6)
        self._rebuild_sky_gzip()

    def _rebuild_sky_gzip(self) -> None:
        if self.sky is not None:
            sky_json = json.dumps(self.sky, separators=(",", ":")).encode()
            self.sky_json = sky_json
            self.sky_gzip = gzip.compress(sky_json, 6)

    def group_counts(self) -> dict[str, int]:
        """Satellites per group, prepared by _rebuild (cheap on the event loop)."""
        return dict(self._counts)

    def name_of(self, norad: int) -> str | None:
        return self._names.get(norad)
