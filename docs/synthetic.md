# Synthetic ephemeris: imaginary bodies that move

## What this is

`compileForm` places authored bodies at one static longitude — a snapshot.
A sky that never moves is dead: no transits, no returns, no seasons.

The synthetic module gives imaginary bodies **motion over time** from authored
parameters. Every derived computation built on `Engine.position` — transits,
returns, retrograde, phases, SkyView — works on them unchanged.

Determinism is non-negotiable: every export is a pure function of `(system, t)`.

## Body modes

| Mode | Parameters | Motion |
|------|------------|--------|
| `placement` | `lonDeg` | Fixed longitude (parity with `compileForm`) |
| `periodic` | `periodDays`, `phaseDeg`, `epoch?` | `lon(t) = phaseDeg + 360·(t − epoch)/periodDays` |
| `kepler` | `a`, `e`, `i`, `node`, `peri`, `M0`, `periodDays`, `epoch?` | Constant Keplerian elements via `KeplerOrbit` |

Angles in the Kepler tier are **degrees**; `a` is in arbitrary length units
(consistent within one system); `e` is in `[0, 1)`.

## Two consumption paths

### 1. World frame (self-contained)

```ts
import { syntheticPositions, syntheticEphemeris } from "caelus";

const sys = {
  id: "twin-moons",
  bodies: [
    { id: "fast", mode: "periodic", periodDays: 20, phaseDeg: 0 },
    { id: "slow", mode: "periodic", periodDays: 80, phaseDeg: 0 },
  ],
  observer: "fast", // optional vantage point
};

syntheticPositions(sys, 5).fast.lonDeg; // 90 (quarter period)

const eph = syntheticEphemeris(sys);
eph.position("slow", t).retrograde; // apparent retrograde from the observer
```

When `observer` is set, positions are geocentric/apparent from that body.
When unset, positions are heliocentric.

Time `t` is in the same day units as each body's `periodDays` and `epoch`
(abstract world frame — not necessarily a Julian Day).

### 2. Engine integration (real sky)

```ts
import { Engine, registerSyntheticSystem, julianDay } from "caelus";
import { embeddedData } from "caelus/data-embedded";

const engine = new Engine(embeddedData);
registerSyntheticSystem(engine, {
  id: "nemesis",
  bodies: [{
    id: "nemesis", mode: "kepler",
    a: 520, e: 0.1, i: 5, node: 0, peri: 0, M0: 0,
    periodDays: 4_300_000, epoch: julianDay(2000, 1, 1),
  }],
  render: { nemesis: { sizeDeg: 0.3, magnitude: -0.5, color: "pale gold" } },
});

engine.position("nemesis", julianDay(2025, 6, 21)).retrograde; // apparent from Earth
returns(engine, "nemesis", natalJd, jdStart, jdEnd); // works unchanged
```

Bodies register through `Engine.registerSource` (heliocentric xyz at TT Julian
Day, same contract as Chiron). Render attrs register through
`Engine.registerRender` and flow into SkyView.

The synthetic `observer` does **not** apply on the real engine path — that is
Earth's sky. Use `syntheticPositions` for a self-contained fictional world.

## SkyView wiring

Pass synthetic body ids in `bodies` (any string id works). Appearance comes from
`Engine.registerRender` and/or `opts.render`:

```ts
skyView(engine, jd, view, {
  bodies: ["sun", "moon", "nemesis"],
  render: { nemesis: { sizeDeg: 0.4, magnitude: -1.2, color: "pale gold" } },
});
```

Authored `sizeDeg`, `magnitude`, and `color` land on each `SkyBody` and in the
serialized prompt so `skyViewSequence` frames stay visually consistent.

## Validation

`validateSyntheticSystem(sys)` reports duplicate ids, bad periods, invalid
eccentricity, and dangling observers — the same `impossible` / `problems`
honesty pattern as `compileForm`. `syntheticEphemeris` carries the diagnosis
on every result.

## MCP

Three tools on `caelus-mcp`:

- `synthetic_validate` — check a system JSON
- `synthetic_positions` — world-frame positions at `t_days` or a UT `date`
- `synthetic_sky_view` — register on an ephemeral engine and run Sky View

See [MCP setup](/docs/mcp) for client wiring.
