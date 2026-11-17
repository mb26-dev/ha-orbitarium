# Changelog

## 1.1.0

### Added

- Satellite icons: original vector artwork for flat-panel broadband satellites (Starlink, OneWeb, Kuiper), the large stations (ISS, Tiangong) and all other satellites, turned along their direction of flight.
- Icons grow when you zoom in, carry a soft aura in their group colour and glow brighter when they are visible to the naked eye.
- Satellite picture in the info panel.
- Card option `satellite_icons` (default `true`), set it to `false` for the classic dots.

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
  - stars down to magnitude 6, constellation lines and names, Sun, Moon with phase, planets
  - all satellites in real time, highlighted when they are visible to the naked eye
  - tap for details, orbit track of the selected satellite
  - group filter, time travel (pause, fast forward, reverse), zoom, fullscreen
