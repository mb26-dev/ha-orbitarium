"""Constants for Orbitarium."""

from __future__ import annotations

DOMAIN = "orbitarium"
VERSION = "1.1.0"

CONF_GROUPS = "groups"
CONF_TRACKED = "tracked_satellites"
CONF_MIN_ELEVATION = "min_elevation"

DEFAULT_GROUPS = ["stations", "visual", "starlink"]
DEFAULT_TRACKED = "25544, 48274"
DEFAULT_MIN_ELEVATION = 10

# key, label, colour (card), in priority order for de-duplication
SATELLITE_GROUPS: list[tuple[str, str, str]] = [
    ("stations", "Space stations", "#ffd166"),
    ("visual", "Brightest", "#ffffff"),
    ("starlink", "Starlink", "#7fdcff"),
    ("oneweb", "OneWeb", "#b388ff"),
    ("kuiper", "Amazon Kuiper", "#ff9e80"),
    ("iridium-NEXT", "Iridium", "#a5d6a7"),
    ("gnss", "GNSS", "#80cbc4"),
    ("geo", "Geostationary", "#ef9a9a"),
    ("weather", "Weather", "#90caf9"),
    ("amateur", "Amateur radio", "#f48fb1"),
]
TRACKED_GROUP = ("tracked", "Tracked", "#ffd166")

CELESTRAK_GROUP_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=json"
CELESTRAK_CATNR_URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR={catnr}&FORMAT=json"

# CelesTrak updates GP data a few times per day and blocks clients that
# download unchanged data too often - keep this conservative.
TLE_REFRESH_HOURS = 12
TLE_RETRY_MINUTES = 60

# Star catalogue, constellation lines and names from d3-celestial (BSD-3-Clause),
# pinned to a fixed commit so the data never changes underneath us.
D3C_COMMIT = "7e720a3de062059d4c5400a379146a601d9010e0"
D3C_BASE = f"https://raw.githubusercontent.com/ofrohn/d3-celestial/{D3C_COMMIT}/data/"
SKY_FILES = {
    "stars": "stars.6.json",
    "lines": "constellations.lines.json",
    "constellations": "constellations.json",
    "starnames": "starnames.json",
}
# Land outlines for the globe view: Natural Earth 1:110m (public domain),
# pinned to a release tag.
LAND_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_land.geojson"
SKY_DATA_VERSION = 2
STAR_NAME_MAX_MAG = 2.6

STORAGE_VERSION = 1
STORAGE_KEY_CATALOG = f"{DOMAIN}.catalog"
STORAGE_KEY_SKY = f"{DOMAIN}.sky"

URL_CATALOG = "/api/orbitarium/catalog"
URL_SKY = "/api/orbitarium/sky"
URL_FRONTEND = "/orbitarium/frontend"
CARD_FILE = "orbitarium-card.js"

SIGNAL_CATALOG_UPDATED = f"{DOMAIN}_catalog_updated"

OVERHEAD_SCAN_SECONDS = 120
PASS_REFRESH_MINUTES = 15
PASS_HORIZON_HOURS = 72
