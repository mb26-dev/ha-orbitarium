# Changelog

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
