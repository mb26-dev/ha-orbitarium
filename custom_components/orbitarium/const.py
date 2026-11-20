"""Constants for Orbitarium."""

from __future__ import annotations

DOMAIN = "orbitarium"
VERSION = "1.6.0b1"

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
    ("last-30-days", "Recent launches", "#7dffb6"),
    ("starlink", "Starlink", "#7fdcff"),
    ("oneweb", "OneWeb", "#b388ff"),
    ("kuiper", "Amazon Kuiper", "#ff9e80"),
    ("iridium-NEXT", "Iridium", "#a5d6a7"),
    ("gnss", "GNSS", "#80cbc4"),
    ("geo", "Geostationary", "#ef9a9a"),
    ("weather", "Weather", "#90caf9"),
    ("amateur", "Amateur radio", "#f48fb1"),
    ("rocket-bodies", "Rocket bodies", "#c9a27e"),
    ("debris", "Debris", "#ef7070"),
]
# groups without their own CelesTrak group: loaded with a name search instead
# (CelesTrak appends "R/B" to rocket bodies and "DEB" to debris)
GROUP_QUERIES = {"rocket-bodies": "NAME=R/B", "debris": "NAME=DEB"}
GROUP_NAME_PATTERNS = {"rocket-bodies": r"\bR/B\b", "debris": r"\bDEB\b"}
# drawn as small dots in the card instead of satellite icons
DOT_GROUPS = {"rocket-bodies", "debris"}
# far too small to be seen with the naked eye: never counted as visible
NOT_VISIBLE_GROUPS = {"debris"}
TRACKED_GROUP = ("tracked", "Tracked", "#ffd166")
# The CelesTrak "stations" group also lists docked and visiting spacecraft and
# small satellites released from the ISS. Only the stations themselves stay in
# "Space stations", everything else goes to this derived group.
STATION_TRAFFIC_GROUP = ("station_traffic", "Station traffic", "#ffb38a")
STATION_NAME_PREFIXES = ("ISS (", "CSS (")
# ISS, Tiangong core module (Tianhe) and the ISS module Poisk (listed without prefix)
STATION_NORADS = {25544, 48274, 36086}

CELESTRAK_GROUP_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=json"
CELESTRAK_CATNR_URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR={catnr}&FORMAT=json"
CELESTRAK_QUERY_URL = "https://celestrak.org/NORAD/elements/gp.php?{query}&FORMAT=json"

# CelesTrak updates GP data a few times per day and blocks clients that
# download unchanged data too often - keep this conservative.
TLE_REFRESH_HOURS = 12
TLE_RETRY_MINUTES = 60
# after a failed download (error, rate limit, server problem) CelesTrak is not
# asked again for this long, also across restarts
CELESTRAK_BACKOFF_HOURS = 6
# a tracked satellite missing from CelesTrak for this long raises a repair issue
SATELLITE_LOST_HOURS = 24

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
SKY_DATA_VERSION = 3

# Earth imagery for the globe view, NASA Earth Observatory (free of licensing
# fees, credit "NASA Earth Observatory"). Downloaded at runtime, not shipped.
# Day side: Blue Marble Next Generation with topography and bathymetry, one
# image per month of the year. Night side: Black Marble 2016 city lights.
EARTH_DAY_URL = (
    "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/"
    "bmng-topography-bathymetry/{month_name}/world.topo.bathy.2004{month:02d}.3x5400x2700.jpg"
)
EARTH_DAY_FALLBACK_MONTH = 9
EARTH_NIGHT_URL = (
    "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/"
    "144000/144898/BlackMarble_2016_01deg.jpg"
)
EARTH_DIR = "orbitarium"
STAR_NAME_MAX_MAG = 2.6

STORAGE_VERSION = 1
STORAGE_KEY_CATALOG = f"{DOMAIN}.catalog"
STORAGE_KEY_SKY = f"{DOMAIN}.sky"

URL_CATALOG = "/api/orbitarium/catalog"
URL_SKY = "/api/orbitarium/sky"
URL_EARTH = "/api/orbitarium/earth/{kind}"
URL_FRONTEND = "/orbitarium/frontend"
CARD_FILE = "orbitarium-card.js"

SIGNAL_CATALOG_UPDATED = f"{DOMAIN}_catalog_updated"

OVERHEAD_SCAN_SECONDS = 120
# update interval while a tracked satellite is up or about to rise
PASS_SCAN_SECONDS = 10
# satellite trains: at least this many recently launched satellites visible
# within this angle of each other on the sky
RECENT_GROUP = "last-30-days"
TRAIN_MIN_SATELLITES = 5
TRAIN_RADIUS_DEG = 25.0
PASS_REFRESH_MINUTES = 15
PASS_HORIZON_HOURS = 72
