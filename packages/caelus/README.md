# caelus

Astrological ephemeris engine. MIT, no Swiss Ephemeris code, no AGPL, no
ephemeris files. 1:1 port of the Python reference, checked by golden fixtures.

## Verification chain

1. Python engine checked against Swiss Ephemeris 2.10 across 1900–2099:
   every planet ≤ 1″ (Sun–Saturn), Moon ≤ 2.5″, Chiron ≤ 1″, angles and
   Placidus cusps ≤ 3.2″ — all invisible at the arcminute display precision
   chart software uses.
2. TypeScript port verified against Python golden fixtures: **1,437 checks,
   0 failures, worst deviation 1.6 nano-arcseconds.** The two implementations
   are numerically identical.

Regenerate fixtures any time from the Python side; any future TS change must
keep this suite green.

## Browser bundle weights (gzipped)

| component                          | size    |
|------------------------------------|---------|
| engine code                        | 8 KB    |
| VSOP87 planets, embedded tier      | 65 KB   |
| Moon series + nutation + Pluto     | 2 KB    |
| Chiron (1850–2150)                 | 10 KB   |
| **core total**                     | **~85 KB** |
| VSOP micro tier (alt.)             | 25 KB   |
| precise Moon 1920–2080 (lazy-load) | 729 KB  |

The 85 KB core computes natal charts client-side — planets to sub-arcsecond,
Moon to ~10″ via the analytic series. The 729 KB tier (1920–2080 JPL-fit Moon,
0.1″-class) lazy-loads when present; the engine switches automatically.

## Usage

```ts
import { Engine, fmtLon } from "caelus";
import { loadNodeData } from "caelus"; // Node only

// Node: filesystem loader
const engine = new Engine(loadNodeData("./data", "embedded", "full"));

// Browser/edge: bundled embedded dataset (~85 KB gz)
// import { embeddedData } from "caelus/data-embedded";
// const engine = new Engine(embeddedData);

// Browser: inject data yourself (bundle or fetch the JSON)
// const engine = new Engine({ vsop, nutation, moonMeeus, pluto, chiron, moonCheb });

const chart = engine.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus");
console.log(fmtLon(chart.bodies.sun.lon));   // "19°27' Gemini"
console.log(chart.bodies.saturn.retrograde); // true
console.log(chart.angles, chart.cusps, chart.aspects);

// Single positions
engine.longitude("chiron", 2451545.0);
engine.position("mars", 2451545.0); // { lon, speed, retrograde, sign, signDeg }
```

Bodies: sun, moon, mercury…pluto, chiron, mean_node, true_node.
House systems: placidus, porphyry, equal, whole_sign.
Performance: ~2.4 ms per full chart (13 bodies × 3 evaluations + houses +
aspects) single-threaded in Node 22 — ~420 charts/sec, faster in hot loops.

## Layout

```
src/core.ts       timescales, VSOP87, Moon, Pluto, Chiron, nutation, frames
src/houses.ts     sidereal time, angles, four house systems
src/chart.ts      Engine class, aspects, formatting
src/node-loader.ts  fs convenience loader (core never touches fs)
data/             shared JSON coefficients (same files as Python package)
test/golden.test.ts  conformance suite vs Python fixtures
```

## Porting notes (for future maintainers/agents)

- `mod()` everywhere: JS `%` keeps the dividend's sign; Python's doesn't.
  Every angle reduction goes through `mod()`.
- Iteration order matters for bit-level agreement (e.g. the nutation table
  sums in reverse); keep orders identical to the Python reference.
- All data is injected via `EngineData` — the core has zero I/O, zero deps,
  and runs identically in browser, edge runtime, or Node.
