# Third party notices

## SGP4 propagator

`custom_components/orbitarium/orbit.py` and `custom_components/orbitarium/frontend/orbitarium-core.js`
contain a port of the SGP4 near-earth propagator from [satellite.js](https://github.com/shashwatak/satellite-js),
which itself is based on the reference implementation by David Vallado (Revisiting Spacetrack Report #3, 2006).

```
MIT License

Copyright (C) 2013 Shashwat Kandadai, UCSC Jack Baskin School of Engineering

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Star catalogue and constellations (downloaded at runtime, not redistributed)

Stars, star names, constellation lines and names are downloaded once from
[d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn (BSD 3-Clause License),
pinned to commit `7e720a3de062059d4c5400a379146a601d9010e0`. The star data is derived from the
Hipparcos / HYG catalogues.

## Land outlines (downloaded at runtime, not redistributed)

Land polygons for the globe view are downloaded once from
[Natural Earth](https://www.naturalearthdata.com) (1:110m land, public domain) via
[natural-earth-vector](https://github.com/nvkelso/natural-earth-vector), pinned to release `v5.1.2`.

## Earth imagery (downloaded at runtime, not redistributed)

The globe view uses NASA Earth Observatory imagery, downloaded once by the integration:

- Blue Marble: Next Generation with topography and bathymetry (Reto Stöckli, NASA Earth Observatory),
  one image per month, 5400 x 2700 pixels
- Black Marble 2016 city lights (NASA Earth Observatory, Suomi NPP VIIRS data), 3600 x 1800 pixels

NASA imagery is free of licensing fees; credit: "NASA Earth Observatory",
https://science.nasa.gov/earth/earth-observatory/

## Artwork

The satellite, Sun, Moon and planet pictures are original drawings rendered by the card at runtime.
No photographs or third party images are included.

## Planet positions

Approximate Keplerian elements for the planets from E. M. Standish, JPL Solar System Dynamics,
"Keplerian Elements for Approximate Positions of the Major Planets".

## Satellite data

Orbital elements (General Perturbations, OMM format) are provided by
[CelesTrak](https://celestrak.org) (Dr. T.S. Kelso). Please keep the default refresh interval
to respect their service.
