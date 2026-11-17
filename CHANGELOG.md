# Changelog

## 1.5.0 (in testing)

### Added

- **Recent launches:** new satellite group with everything launched in the last 30 days (CelesTrak `last-30-days`), in its own mint colour. Fresh Starlink batches show up here within about a day of a Falcon 9 launch. Off by default.
- **Satellite train visible** binary sensor (with Recent launches on): on while at least 5 recently launched satellites are visible to the naked eye close together on the sky, the famous "string of pearls" after a Starlink launch. Attributes with count, direction, elevation and names. Updates every 10 seconds while a train is up.
- **Icons for rocket bodies and debris:** a spent upper stage with its engine bell and a torn metal fragment, also in the info panel. Rocket bodies in other groups (the *Brightest* list has many) get the rocket icon too.

### Changed

- Rocket bodies and debris have their own icon budget: with up to 700 of them on screen they are drawn as icons, beyond that as dots, without ever taking the icons away from the satellites.

## 1.4.0

### Added

- **Rocket bodies and Debris:** two new satellite groups in the options. *Rocket bodies* (about 2,200 spent upper stages, some from the 1950s) and *Debris* (about 10,000 fragments, for example from the 2007 Fengyun 1C test and the 2009 Iridium 33 / Cosmos 2251 collision). Both are off by default.
- They are drawn as small dots (bronze for rocket bodies, red for debris) so they do not hide the satellite icons, each with its own chip to show or hide them. Tap one for name, orbit, altitude and status.
- Rocket bodies are often bright and count as visible to the naked eye like satellites. Debris is far too small to be seen and never counts as visible, neither in the card nor in the *Satellites visible now* sensor.

### Changed

- The automatic switch from icons to dots on crowded screens only counts icon groups, so turning on debris does not turn off the satellite icons.
- CelesTrak has no group for rocket bodies or debris; Orbitarium uses the CelesTrak name search (`R/B` and `DEB`) for them, with the same 12 hour refresh and 6 hour backoff as all other groups.

## 1.3.1

### Changed

- **Space stations means space stations:** the CelesTrak stations list also contains docked and visiting spacecraft (Soyuz, Progress, Dragon, Shenzhou, Tianzhou) and small satellites released from the ISS. These now have their own group **Station traffic** with its own chip, so *Space stations* only shows the ISS and Tiangong with their modules. Nothing is downloaded twice; the group is split locally.

## 1.3.0

### Added

- **Visible now binary sensor** for every tracked satellite (ISS and Tiangong by default): on while the satellite is above the minimum pass elevation, sunlit and your sky is dark. Attributes with elevation, azimuth, compass direction, range, sunlit state and sun elevation.
- **Faster updates during a pass:** while a tracked satellite is up or about to rise, the tracked satellites are recalculated every 10 seconds instead of every 2 minutes. The scan over the whole catalogue stays at 2 minutes.
- **Repair notice** when CelesTrak no longer lists a tracked satellite for more than a day (re-entered, retired or a wrong NORAD id). It clears itself when the satellite is listed again.
- **German translation** of the setup, the options, the entity names and the repair notice.
- Attribute `next_download_attempt` on *Satellites tracked* while downloads are paused.

### Changed

- **Kinder to CelesTrak:** after a failed download (server error, rate limit, unexpected answer) CelesTrak is not asked again for 6 hours instead of every hour. The pause is saved, so restarting Home Assistant does not cause extra requests.
- A tracked satellite that CelesTrak does not know any more no longer counts as a failed download; the elements of the other tracked satellites are still refreshed.
- Pass sensor names now come from the translations (same entity ids as before).

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
