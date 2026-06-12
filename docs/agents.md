# caelus for coding agents

Written for AI coding assistants building on caelus. Five mistakes agents
make, each with the wrong and right version. `llms.txt` (repo root and
ephemengine.com/llms.txt) has the API map.

## 1. Local birth time via `new Date()`

The engine takes UT. `new Date("1990-06-10T14:30:00")` parses in the
*runtime's* timezone — a Tampa birth computed on a UTC server comes out
~4 hours wrong (Asc 10° Leo instead of 3° Libra).

```ts
// WRONG
const d = new Date("1990-06-10T14:30:00");
engine.chart(d.getUTCFullYear(), d.getUTCMonth() + 1, /* ... */);

// RIGHT — @caelus/birth resolves the zone from the birthplace
import { toUT } from "@caelus/birth";
const t = toUT({ year: 1990, month: 6, day: 10, hour: 14, minute: 30,
                 lat: 27.95, lon: -82.46 });
const { year, month, day, hour, minute, second } = t.utc;
engine.chart(year, month, day, hour, minute, second, 27.95, -82.46, "placidus");
```

Check `t.status`: `"ambiguous"` and `"nonexistent"` mark DST-transition
births that need user confirmation.

## 2. Raw `%` on angles

JS `%` keeps the dividend's sign: `(-30) % 360 === -30`, not `330`. Every
angle reduction must go through `mod()` from caelus (Python semantics).

```ts
// WRONG
const sep = (lonA - lonB) % 360;

// RIGHT
import { mod } from "caelus";
const sep = mod(lonA - lonB, 360);
const signedSep = mod(lonA - lonB + 180, 360) - 180;  // [-180, 180)
```

## 3. Swiss Ephemeris idioms that don't apply

caelus has no ephemeris files, no `set_ephe_path`, no data downloads, no
process-global state. Data is a JSON object injected at construction.

```ts
// WRONG — inventing swisseph patterns
swe.set_ephe_path("./ephe");           // no such thing
await downloadEphemerisFiles();        // no such thing

// RIGHT — inject data, construct, done
import { embeddedData } from "caelus/data-embedded";  // browser/edge
const engine = new Engine(embeddedData);
// Node alternative: new Engine(loadNodeData(dir, "embedded", "full"))
```

## 4. Longitude sign convention

caelus is EAST-positive everywhere (engine, @caelus/birth, caelus-mcp).
Tampa is `lon: -82.46`. Astrology sources that quote "82W46" mean
`-82.77` here. There is no `lonWest` parameter; if a chart's houses look
mirrored, this is the first thing to check.

## 5. Calling `chart()` per body

`engine.chart()` computes all 13 bodies, angles, cusps, and aspects in
one call (~2 ms). Calling it in a loop to read one body each time is
13× the work; use `engine.position(body, jdUt)` for single bodies.

```ts
// WRONG
for (const b of BODIES) {
  const c = engine.chart(/* same instant every time */);
  use(c.bodies[b]);
}

// RIGHT
const c = engine.chart(/* once */);
for (const b of BODIES) use(c.bodies[b]);
// single body at an arbitrary instant:
const p = engine.position("mars", jdUt);
```

## Also worth knowing

- `houseSystem` vs `houseSystemRequested` on the Chart: Placidus is
  undefined above |lat| ≥ 66° and falls back to whole_sign — the fallback
  is reported, never silent. Don't hide it from users.
- Non-axial aspects (sextile/square/trine) are exact at BOTH +angle and
  −angle separation. Any aspect-date search must root-find both offsets
  (caelus-mcp's `find_aspect_dates` already does).
- Supported range is 1800–2149; out-of-range dates throw. Don't catch and
  substitute silently.
