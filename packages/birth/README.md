# caelus-birth

Local birth time + place → UT, correctly. The timezone layer for
[caelus](https://github.com/heavyblotto/caelus) charts.

## The trap this package exists for

caelus takes UT. Users state local wall-clock time. The naive conversion
uses the *runtime's* timezone and is the single most common cause of wrong
charts in amateur astrology software:

```ts
// WRONG — interprets "14:30" in whatever zone the server/browser runs in
const d = new Date("1990-06-10T14:30:00");
engine.chart(d.getUTCFullYear(), /* ... */);
// Tampa birth computed on a UTC server: Asc 10°54' Leo  ← wrong by ~2 signs

// RIGHT — resolve the zone from the birthplace, apply historical tzdb rules
import { toUT } from "caelus-birth";
const t = toUT({ year: 1990, month: 6, day: 10, hour: 14, minute: 30,
                 lat: 27.95, lon: -82.46 });
// zone "America/New_York", EDT, 18:30 UT → Asc 3°26' Libra  ← correct
```

Four hours of error moves the Ascendant ~60°, every house cusp with it,
and (here) the Moon by 2°.

## Usage

```bash
npm install caelus-birth
```

```ts
import { toUT, localToChart } from "caelus-birth";

const t = toUT({
  year: 1955, month: 6, day: 10, hour: 12, minute: 0,
  lat: 51.5, lon: -0.12,          // east-positive longitude
  // zone: "Europe/London"        // optional IANA override
});
t.utc;            // { year: 1955, month: 6, day: 10, hour: 11, ... } (BST +1)
t.jdUt;           // ready for engine.chart() / engine.position()
t.zone;           // "Europe/London" — resolved offline from coordinates
t.offsetMinutes;  // 60
t.dst;            // true
t.status;         // "ok" | "ambiguous" | "nonexistent"

// or in one call:
const { chart, status } = localToChart(input, engine, "placidus");
```

### DST edge cases are reported, never guessed silently

- **`"ambiguous"`** — the fall-back hour happens twice (e.g. 01:30 on the
  night US DST ends). Both readings are returned in `candidates`
  (earliest first) and the earlier instant is chosen by default. Surface
  this to the user: "clocks changed that night — we used the earlier
  01:30; switch?"
- **`"nonexistent"`** — the spring-forward gap (e.g. 02:30 the night US
  DST starts never existed). Shifted forward per tzdb convention
  (02:30 EST → 03:30 EDT) and flagged.

Historical rules come from the runtime's IANA database (via Luxon /
`Intl`): half-hour and 45-minute zones, southern-hemisphere DST, pre-1970
rules, and wartime offsets (British Double Summer Time, US War Time) all
resolve correctly — see the golden tests.

## Geocoding (optional, separate entry point)

Place-name search needs a network service, so the core stays offline-pure
and adapters live behind `caelus-birth/geocode`:

```ts
import { openMeteoGeocoder } from "caelus-birth/geocode";
const places = await openMeteoGeocoder.search("Tampa");
// [{ name: "Tampa, Florida, United States", lat: 27.95, lon: -82.46, ... }]
```

The shipped adapter uses the free, keyless
[Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
(data: [GeoNames](https://www.geonames.org/), CC-BY 4.0 — attribution
required). Implement the one-method `Geocoder` interface to use any other
service.

## Scope

Coordinates → zone is offline (`tz-lookup`, ~70 KB embedded map, CC0).
Zone → offset uses the runtime's Intl tzdb (Luxon, MIT). This package has
runtime dependencies by design; caelus core stays at zero.

## The caelus packages

- [caelus](https://www.npmjs.com/package/caelus) — the engine
- caelus-birth — this package
- [caelus-wheel](https://www.npmjs.com/package/caelus-wheel) — React SVG chart wheel
- [caelus-mcp](https://www.npmjs.com/package/caelus-mcp) — MCP server, twenty-seven chart tools over stdio
