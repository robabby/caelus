# Engine API for v0.3 — design

The two decisions gap-analysis.md says must land before Tier 1 code:
the options object and the open body registry. This doc proposes exact
signatures. Everything here is additive; 0.3.0 ships with zero breaking
changes to the 0.2.0 surface.

## 1. Options object

One optional bag per call. No Swiss-style bit flags.

```ts
export type Ayanamsa =
  | "lahiri" | "fagan_bradley" | "krishnamurti" | "raman"
  | "yukteshwar" | "galactic_center_0sag" | "true_citra";

export type Zodiac = "tropical" | `sidereal:${Ayanamsa}`;

export interface CalcOptions {
  zodiac?: Zodiac;            // default "tropical"
  topocentric?: boolean;      // default false; needs observer
  observer?: { lat: number; lonEast: number; altM?: number };
}

position(body: BodyId, jdUt: number, opts?: CalcOptions): Position
longitude(body: BodyId, jdUt: number, opts?: CalcOptions): number
```

The `Zodiac` string form (`"sidereal:lahiri"`) is JSON-safe and matches
the planned MCP parameter, so the value passes from tool argument to
engine call unchanged. The seven ayanamsas above cover real usage;
adding one later is a constant and a union member.

`chart()` keeps its 0.2.0 signature. The ninth argument widens from
`HouseSystem` to `HouseSystem | ChartOptions`; a bare string still means
a house system.

```ts
export interface ChartOptions extends CalcOptions {
  houseSystem?: HouseSystem;  // default "placidus"
  bodies?: BodyId[];          // extra bodies beyond the core 13
  orbs?: Record<string, number>;
}

chart(y, mo, d, h, mi, s, lat, lonEast,
      opts?: HouseSystem | ChartOptions): Chart
```

In `chart()`, `topocentric: true` reuses the chart's own lat/lon as the
observer; `observer` overrides it. Sidereal mode shifts longitudes,
signs, cusps, and angles by the ayanamsa; speeds come out of the same
finite difference, so the ayanamsa rate is included for free. `Chart`
gains a `zodiac` field reporting the mode used.

### No frame option

`SEFLG_EQUATORIAL` becomes two new `Position` fields instead of a mode.
The rotation costs one matrix per body, so the engine always fills:

```ts
export interface Position {
  lon: number; speed: number; retrograde: boolean;
  sign: string; signDeg: number;
  lat: number;      // ecliptic latitude, deg (0 for nodes)
  dist: number | null;  // AU; km for the Moon; null for nodes
  ra: number; dec: number;  // equatorial, true equinox of date, deg
}
```

The engine already computes `lat` and `dist` and discards them. Callers
who want RA/Dec read two fields; nobody passes a flag. MCP payloads stay
terse because the server selects fields, not the engine.

Heliocentric output is a query, not a mode. A `Position` with a sign and
a house makes no sense heliocentrically:

```ts
heliocentric(body: BodyId, jdUt: number): { lon: number; lat: number; dist: number }
```

## 2. Open body registry

`BODIES` stays the core 13 and stays `as const`: it is the default chart
set, not the universe. Two changes open the universe:

```ts
// Autocomplete keeps the core names; any string is accepted.
export type BodyId = Body | (string & {});

// EngineData grows two optional pack slots.
interface EngineData {
  // existing fields unchanged
  chebPacks?: Record<string, ChebData>;      // ceres, pallas, juno, vesta, pholus, …
  keplerPacks?: Record<string, KeplerElements>;  // cupido … waldemath
}

// What can this engine compute, given the data it was handed?
engine.bodies(): BodyId[]
```

Dispatch order in `longitude()`: core if/else chain first, then
`chebPacks`, then `keplerPacks`, then
`throw new Error("no data loaded for body 'ceres'")`. The Chiron special
case migrates into `chebPacks` internally; the `"chiron"` id and its
position in `BODIES` do not move.

The aspect filter (`!b.endsWith("_node")`) becomes a property of the
registry entry (`aspectable: boolean`) instead of a name convention,
so Lilith and asteroid packs declare themselves.

## 3. House systems and angles

`HouseSystem` widens:

```ts
export type HouseSystem =
  | "placidus" | "porphyry" | "equal" | "whole_sign"        // 0.2.0
  | "koch" | "regiomontanus" | "campanus" | "alcabitius"
  | "morinus" | "vehlow" | "meridian" | "polich_page";
```

Koch and Polich-Page are undefined above the polar circles and reuse the
existing fallback: `houseSystem` reports `whole_sign`,
`houseSystemRequested` keeps the ask. `Chart.angles` gains `vertex` and
`eastPoint` (additive).

## 4. Compatibility and validation

- 0.2.0 call sites compile and return identical values under 0.3.0;
  the conformance suite proves it because existing fixtures do not change.
- New behavior gets new fixtures: sidereal longitudes (Lahiri and
  Fagan/Bradley vs `swe_set_sid_mode`), topocentric Moon, RA/Dec, each
  new house system at the six standard locations, polar fallbacks for
  Koch. Python reference first, golden fixtures, then the TS port,
  Swiss Ephemeris as oracle.
- One soft break to document: `Chart.houseSystem` widens, so an
  exhaustive `switch` on it in consumer code gains cases. Release notes
  item, not a semver break at 0.x.

## Decisions (2026-06-12)

1. `Position.dist` is AU for every body, Moon included. The km value
   stays internal to `moonApparent*`; a `distKm` convenience ships only
   if someone asks.
2. No `{ jdUt }` overload on `chart()` for now. `julianDay()` is
   exported and one line; revisit if MCP call sites accumulate.
