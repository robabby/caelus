# caelus-engine

The Python reference implementation of the Caelus astrological ephemeris
engine. Clean-room, MIT-licensed, written from published sources (VSOP87D,
ELP/Meeus, IAU models, JPL Horizons fits). No Swiss Ephemeris code, no
bundled third-party ephemeris files.

The engine reads pre-built Chebyshev and series packs shipped with the
package and runs on the Python standard library alone. It is also the
reference that the TypeScript engine (`caelus` on npm) is pinned to by a
golden conformance suite.

## Install

```bash
pip install caelus-engine
```

The import package is `astroengine`:

```python
from astroengine import Engine, BODIES

eng = Engine("full")
jd = 2451545.0  # 2000-01-01 12:00 UT
for body in BODIES:
    print(f"{body:10s} {eng.longitude(body, jd):10.5f}")
```

## What it computes

- Planetary and lunar apparent geocentric ecliptic longitudes (VSOP87D for
  the planets, Meeus Ch. 47 for the Moon, Meeus Ch. 37 series for Pluto),
  with light-time, annual aberration, FK5 frame correction, and IAU 1980
  nutation.
- 12 house systems; tropical and sidereal (7 ayanamsas).
- Aspects with configurable orbs.
- Events: rise/set/transit, longitude crossings, lunar phases, stations,
  Gauquelin sectors, solar and lunar eclipses.
- Fixed stars and topocentric positions.
- Derived charts: returns, secondary progressions, solar arc, composite and
  Davison, harmonics, antiscia, declination aspects and parallels,
  out-of-bounds, dignities, sect.
- A declarative `when()` query engine over celestial predicates.
- A turbo tier (`Turbo`): segmented Chebyshev longitude packs fit to the
  engine for bulk scans.

## Accuracy

Accuracy is calibrated against Swiss Ephemeris and validated against JPL
Horizons, stated per body rather than as a blanket figure. See the
validation tables at https://ephemengine.com.

## Optional: the fitting toolchain

The engine runs without any third-party dependency. The data-fitting tools
that regenerate the coefficient packs need numpy:

```bash
pip install "caelus-engine[fit]"
```

## License

MIT. See `LICENSE`. Project home: https://ephemengine.com. Source:
https://github.com/heavyblotto/caelus.
