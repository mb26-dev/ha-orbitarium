# Changelog

## 1.2.1

### Fixed

- **No more event loop stalls on slow hardware:** the CelesTrak responses (Starlink alone is several megabytes of JSON) and the star catalogue files are now parsed in the executor instead of on the Home Assistant event loop.
- The catalogue and star catalogue API views no longer decompress data on the event loop for clients without gzip support; a plain copy is prepared in the executor next to the gzip copy.
- Group counts and satellite names for the sensors come from a prepared index instead of scanning the whole catalogue on every update.

### Changed

- Constellation names now use their Latin names throughout (Cetus, Taurus, Sagittarius instead of a mix of English and Latin). The star catalogue is downloaded again once after the update.

## 1.2.0

### Added

- **Real Earth imagery in the globe view:** NASA Blue Marble Next Generation on the day side (the image of the current month, so snow and vegetation follow the seasons) and NASA Black Marble city lights on the night side, with a soft terminator and a thin atmosphere at the limb.
- Sensor attribute `earth_imagery` on *Satellites tracked* shows whether the images are downloaded.

### Changed

- The integration downloads the two NASA images once (about 3 MB) and serves them locally. The day image is renewed when the month changes. Without the images the globe falls back to the outline style.

## 1.1.0

### Added

- **Satellite icons:** original vector artwork for flat-panel broadband satellites (Starlink, OneWeb, Kuiper), the ISS, Tiangong and all other satellites, turned along their direction of flight. Icons grow when you zoom in, carry a soft aura in their group colour and glow brighter when they are visible to the naked eye. Card option `satellite_icons` (default `true`).
- **Globe view:** Earth from space with faint land masses, graticule, day and night side, your home location and every satellite in orbit around it. Drag to turn the globe, zoom out to see the geostationary ring. Selecting a satellite draws ±50 minutes of its orbit.
- **Night sky switch:** moon button in the toolbar (or `night_sky: true`) draws a dark sky in daylight, so the satellites stand out. Counts and visibility still follow the real sun.
- **Sun, Moon and planet cards:** a rendered portrait, live elevation, azimuth, distance, light time, brightness, rise, set and culmination for today, plus key facts. The Moon card shows the current phase.
- Satellite picture in the info panel.

### Changed

- The star catalogue now also contains land outlines (Natural Earth, public domain). It is downloaded again once after the update.

## 1.0.1

### Fixed

- Card fills the whole screen when it is the only card of a panel view (unless `height` is set).
- Planet, Sun and Moon labels no longer overlap each other or neighbouring bodies.
- Tracked satellites (ISS, Tiangong by default) now stay in the **Tracked** group with their gold marker, even when another selected group lists them too. The Tracked chip count is correct again.

## 1.0.0

### Added

- Integration `orbitarium` with UI setup: choose satellite groups from CelesTrak (Starlink, space stations, brightest, OneWeb, Kuiper, Iridium, GNSS, geostationary, weather, amateur radio).
- Local SGP4 propagation, no external Python dependencies.
- Sensors: satellites tracked, satellites above horizon, satellites visible now, next visible pass per tracked satellite (ISS and Tiangong by default).
- Lovelace card `custom:orbitarium-card`, registered automatically:
  - planetarium style dome and horizon views with atmosphere, twilight glow and ground
  - stars down to magnitude 6, constellation lines and names, Sun, Moon with its current phase, planets
  - all satellites in real time, highlighted when they are visible to the naked eye
  - tap for details, orbit track of the selected satellite
  - group filter, time travel (pause, fast forward, reverse), zoom, fullscreen
