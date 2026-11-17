<p align="center">
  <img src="custom_components/orbitarium/brand/logo@2x.png" alt="Orbitarium" width="100%">
</p>

<p align="center">
  <a href="https://github.com/hacs/integration"><img src="https://img.shields.io/badge/HACS-Default-41BDF5.svg" alt="HACS Default"></a>
  <img src="https://img.shields.io/github/v/release/mb26-dev/ha-orbitarium" alt="Release">
  <img src="https://img.shields.io/badge/Home%20Assistant-2025.1%2B-blue" alt="Home Assistant">
  <img src="https://img.shields.io/github/license/mb26-dev/ha-orbitarium" alt="License">
  <a href="https://ko-fi.com/mb26dev"><img src="https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-FF5E5B?logo=ko-fi&logoColor=white" alt="Buy me a coffee on Ko-fi"></a>
</p>

# Orbitarium

A live planetarium for Home Assistant. Orbitarium shows **every Starlink and thousands of other satellites in real time** above your home, together with stars, constellations, the Sun, the Moon and the planets. It tells you which satellites you can actually see with your own eyes right now, and when the ISS passes over next.

Everything is calculated locally in Home Assistant and in your browser. No API key, no account, no cloud service besides the public orbital data from CelesTrak.

<p align="center">
  <img src="docs/images/globe-debris.jpg" alt="Globe view with more than 10,000 pieces of space debris around the Earth and the info card of a Long March 6A debris fragment" width="100%">
  <br><em>Debris switched on: more than 10,000 tracked fragments around the Earth, here a piece of a Long March 6A upper stage</em>
</p>

## Screenshots

<p align="center">
  <img src="docs/images/globe-timelapse.gif" alt="Globe view time lapse: the Earth with NASA imagery and thousands of satellites in orbit" width="80%">
  <br><em>Globe view at 600x speed: day and night side from NASA imagery, every satellite in orbit around your home</em>
</p>

<p align="center">
  <img src="docs/images/dome.png" alt="Orbitarium dome view: the whole night sky with constellations, planets, the Moon and Starlink satellites" width="100%">
  <br><em>Dome view: the whole night sky with constellations, planets, the Moon and Starlink satellites</em>
</p>

| | |
| --- | --- |
| <img src="docs/images/horizon.png" alt="Horizon view at dusk"> | <img src="docs/images/globe-night.jpg" alt="Globe at night with city lights"> |
| **Horizon view** at dusk: twilight glow, sunlit Starlink satellites | **Globe at night:** city lights from NASA Black Marble |
| <img src="docs/images/planet-card.png" alt="Saturn info card"> | <img src="docs/images/night-switch.png" alt="Night sky switch in daylight with the ISS selected"> |
| **Planet cards:** position, distance, rise and set times, key facts | **Night sky switch:** dark sky in daylight, ISS selected with its orbit track |
| <img src="docs/images/globe-day.jpg" alt="Globe with the day and night terminator"> | <img src="docs/images/phone.png" alt="Phone view" width="49%"> <img src="docs/images/phone-moon.png" alt="Moon card on a phone" width="49%"> |
| **Globe by day** with the terminator over Asia | **On a phone:** full sky and the Moon card with its current phase |

All screenshots use real orbital data from CelesTrak, seen from Ao Nang, Thailand.

## Features

**Lovelace card** `custom:orbitarium-card` (installed and registered automatically)

- Planetarium view of the whole sky (dome) or towards the horizon, with atmosphere, twilight glow and ground
- Globe view: Earth from space with real NASA imagery (Blue Marble by day, city lights by night) and all satellites in orbit
- Night sky switch: a dark sky even in daylight, so every satellite stands out
- Stars down to magnitude 6 with real colours, constellation lines and names, bright star names
- Sun, Moon with its current phase, Mercury to Neptune, each with an info card: portrait, position, distance, rise and set times and key facts
- All satellites of the selected groups, moving in real time (SGP4 propagation, 30 fps by default)
- Optional rocket bodies and space debris as small dots: see how crowded low Earth orbit really is
- Optional *Recent launches* group: watch fresh Starlink trains a day after a launch
- Satellite icons turned along their direction of flight: flat-panel Starlink style, ISS / Tiangong and a classic satellite for all others
- Satellites that are **visible to the naked eye** (sunlit while your sky is dark) glow in their group colour, satellites in Earth's shadow are dimmed
- Tap a satellite for name, NORAD id, elevation, azimuth, range, altitude, speed and status, plus its orbit track
- Group filter with counts, "visible only" mode, labels on/off
- Time travel: pause, fast forward up to 600x, reverse, back to live
- Drag to look around, zoom buttons, pinch / mouse wheel zoom, fullscreen
- Works on phones and wall tablets, pauses itself when it is not on screen

**Sensors**

| Sensor | State | Attributes |
| --- | --- | --- |
| Satellites tracked | number of satellites in the catalogue | count per group, data age, last error |
| Satellites above horizon | satellites above your horizon right now | sun elevation |
| Satellites visible now | sunlit satellites above 10° while the sky is dark | list of the 15 highest ones |
| `<name>` next visible pass | start of the next naked-eye visible pass (timestamp) | max elevation, directions, duration, next 5 visible passes |
| `<name>` visible now (binary sensor) | on while the satellite is above the minimum pass elevation, sunlit and your sky is dark | elevation, azimuth, direction, range, sunlit, sun elevation |
| Satellite train visible (binary sensor, with *Recent launches* on) | on while at least 5 recently launched satellites are visible close together, like a Starlink train after a launch | count, direction, elevation, satellite names |

Pass sensors and visible now binary sensors are created for every NORAD id you enter (default: ISS `25544` and Tiangong `48274`). While one of them is up or about to rise, Orbitarium updates every 10 seconds instead of every 2 minutes, so automations react right when the pass starts.

If CelesTrak no longer lists a tracked satellite for more than a day (re-entered, retired or a wrong id), Home Assistant shows a repair notice. It disappears by itself when the satellite is listed again.

The integration is translated into English and German.

## Installation

### HACS (recommended)

Orbitarium is part of the default HACS catalog.

1. Open **HACS** in Home Assistant, search for **Orbitarium** and download it, or use this button:

   [![Open your Home Assistant instance and open Orbitarium in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=mb26-dev&repository=ha-orbitarium&category=integration)

2. Restart Home Assistant
3. **Settings → Devices & services → Add integration → Orbitarium**, or use this button:

   [![Open your Home Assistant instance and start setting up Orbitarium.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=orbitarium)

<details>
<summary>Fallback: add it as a custom repository</summary>

If Orbitarium does not show up in your HACS search yet, add it manually:

1. HACS → three dots → **Custom repositories** → add `https://github.com/mb26-dev/ha-orbitarium` as **Integration**
2. Install **Orbitarium** and restart Home Assistant
3. **Settings → Devices & services → Add integration → Orbitarium**

</details>

### Manual

Copy `custom_components/orbitarium` into your `config/custom_components` folder and restart Home Assistant.

## Configuration

All settings are done in the UI and can be changed later under **Configure**:

| Option | Default | Description |
| --- | --- | --- |
| Satellite groups | Space stations, Brightest, Starlink | CelesTrak groups to load. Starlink alone has more than 11,000 satellites. Space stations also brings a separate **Station traffic** group: docked and visiting spacecraft and small satellites released from the ISS. **Rocket bodies** (about 2,200) and **Debris** (about 10,000) are off by default; debris never counts as visible. |
| Pass predictions for | `25544, 48274` | NORAD ids that get a "next visible pass" sensor and a "visible now" binary sensor |
| Minimum pass elevation | 10° | Lower passes are ignored |

Orbital data is refreshed every 12 hours and cached, so restarts do not download anything again. After a failed download (server error or rate limit) CelesTrak is not asked again for 6 hours, also across restarts; the attribute `next_download_attempt` on *Satellites tracked* shows when. The star catalogue and the NASA Earth images (about 3 MB) are downloaded once and then kept locally; the day image is renewed once a month.

The observer location is your Home Assistant home location.

## The card

```yaml
type: custom:orbitarium-card
```

All options are optional:

```yaml
type: custom:orbitarium-card
title: Orbitarium
view: dome              # dome (whole sky), horizon or globe
azimuth: 180            # initial viewing direction in degrees
height: 440             # height in px on wide screens; leave it out in a panel view to fill the screen
fps: 30                 # lower it on weak tablets
star_limit: 6           # faintest star magnitude
show_constellations: true
show_labels: true
show_planets: true
show_ground: true       # false shows objects below the horizon too
visible_only: false     # only satellites that are visible to the naked eye
satellite_icons: true   # false draws small dots instead of icons
night_sky: false        # true starts with a dark sky in daylight
groups:                 # groups shown when the card opens (default: all loaded groups)
  - stations
  - starlink
latitude: 8.03          # optional override of the home location
longitude: 98.82
```

## Performance tips

Orbitarium draws every satellite of the selected groups in every frame. Starlink alone is more than 11,000 objects, so slow devices need a little help:

| Device | Recommendation |
| --- | --- |
| Desktop browser, recent phone or tablet | Defaults are fine (`fps: 30`, icons on) |
| Older tablet, Fire tablet, wall panel | `fps: 15`, show only the groups you care about |
| Very weak hardware | `fps: 10`, `satellite_icons: false` (small dots), Starlink group switched off |

```yaml
type: custom:orbitarium-card
fps: 15
satellite_icons: false
groups:
  - stations
  - visual
```

- The card pauses itself when it is not on screen or the browser tab is hidden, so a dashboard in the background costs nothing.
- Fewer groups in the integration options also means a smaller download for every browser that opens the card.
- With more than 1,800 satellites on screen the card switches from icons to dots automatically.

## Pass alerts (blueprint)

The easiest way to never miss the ISS: import the blueprint, pick the satellite and your phone, done.

[![Open your Home Assistant instance and show the blueprint import dialog with a specific blueprint pre-filled.](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Fmb26-dev%2Fha-orbitarium%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Forbitarium%2Fvisible_pass_alert.yaml)

| Setting | Default |
| --- | --- |
| Satellite | any *next visible pass* sensor |
| Phone | any device with the Companion app |
| Minutes before the pass | 10 |
| Minimum height of the pass | 30° |
| Weather entity and maximum cloud coverage | optional, 50 % |
| Second alert when it rises | on |

Orbitarium only counts passes while your sky is dark and the satellite is sunlit, so the alerts only come at dusk, at night and at dawn. Example: *"ISS in 10 min: visible from SW to NE, up to 64° in the SE, about 4 min. Clouds 20 %."*

## Automation example

Turn on the garden lights while the ISS is visible:

```yaml
alias: ISS visible, garden lights on
triggers:
  - trigger: state
    entity_id: binary_sensor.orbitarium_iss_visible_now
    to: "on"
actions:
  - action: light.turn_on
    target:
      entity_id: light.garden
mode: single
```

Get a notification when a Starlink train is visible (needs the *Recent launches* group):

```yaml
alias: Satellite train overhead
triggers:
  - trigger: state
    entity_id: binary_sensor.orbitarium_satellite_train_visible
    to: "on"
actions:
  - action: notify.notify
    data:
      title: Satellite train visible
      message: >-
        {{ state_attr('binary_sensor.orbitarium_satellite_train_visible', 'count') }} satellites in a row,
        look {{ state_attr('binary_sensor.orbitarium_satellite_train_visible', 'direction') }}
        at {{ state_attr('binary_sensor.orbitarium_satellite_train_visible', 'elevation') }}° elevation.
mode: single
```

Get a notification 10 minutes before the ISS is visible:

```yaml
alias: ISS visible pass reminder
triggers:
  - trigger: template
    value_template: >-
      {% set t = states('sensor.orbitarium_iss_next_visible_pass') %}
      {{ t not in ['unknown', 'unavailable'] and
         (as_timestamp(t) - as_timestamp(now())) | int(-1) in range(0, 600) }}
actions:
  - action: notify.notify
    data:
      title: ISS overhead soon
      message: >-
        The ISS will be visible at
        {{ as_timestamp(states('sensor.orbitarium_iss_next_visible_pass')) | timestamp_custom('%H:%M') }},
        from {{ state_attr('sensor.orbitarium_iss_next_visible_pass', 'start_direction') }}
        to {{ state_attr('sensor.orbitarium_iss_next_visible_pass', 'end_direction') }},
        max {{ state_attr('sensor.orbitarium_iss_next_visible_pass', 'max_elevation') }}° high.
mode: single
```

## How "visible" is decided

A satellite counts as visible to the naked eye when it is at least 10° above the horizon, lit by the Sun, less than 2,000 km above the Earth, and the Sun is at least 6° below your horizon. Brightness (magnitude) is not modelled, so faint satellites can be counted as well. Starlink trains shortly after a launch are very bright, older Starlinks are often hard to see.

## Accuracy

Satellite positions use SGP4 with the newest CelesTrak elements, which is accurate to roughly a kilometre for fresh data. Geostationary and navigation satellites use a simplified model without lunar-solar perturbations, which is more than enough for a sky view. Sun, Moon and planets use low precision formulas (well below 1° for this purpose).

## Support

If Orbitarium brightens your dashboard, a coffee keeps the satellites flying. ☕🛰️

<a href="https://ko-fi.com/mb26dev"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support me on Ko-fi"></a>

A star on GitHub, a bug report or a screenshot of your dashboard helps just as much. Thank you!

## Credits

- Orbital elements: [CelesTrak](https://celestrak.org)
- Stars and constellations: [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn (BSD-3-Clause)
- Land outlines: [Natural Earth](https://www.naturalearthdata.com) (public domain)
- Earth imagery: NASA Earth Observatory, [Blue Marble Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/) by Reto Stöckli and [Black Marble 2016](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps)
- Satellite, Sun, Moon and planet pictures are original drawings rendered in the card
- SGP4: port of [satellite.js](https://github.com/shashwatak/satellite-js) (MIT), based on the work of David Vallado

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the licence texts.
