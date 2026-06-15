# Swiss Ephemeris gap analysis — 2026-06-12

What remains between Swiss Ephemeris 2.10 and Caelus 0.4.0, and what each
gap costs to close inside the current architecture. The Swiss Ephemeris
surface comes from `swephexp.h` and the official documentation. The Caelus
surface comes from the repo inventory. Scope decisions here drive the
roadmap in ARCHITECTURE.md.

## Method

Swiss Ephemeris exports roughly 110 functions, 59 body constants, 21
calculation flags, 47 sidereal modes, and 24 house systems. We mapped each
group against the Caelus public API and sorted the differences into three
tiers by cost to build, plus an out-of-scope list. Weighted by what
astrology software actually calls, Caelus covers the core today; the three
tiers reach practical parity.

## Where Caelus already matches

Sun through Pluto, Chiron, both lunar nodes: apparent geocentric ecliptic
positions with light time, aberration, FK5, IAU 1980 nutation. Speeds and
retrograde flags. ΔT from IERS 1955–2025 plus Espenak–Meeus polynomials.
Placidus, Porphyry, Equal, and Whole Sign houses with an explicit polar
fallback. Major aspects and transit search. Validated at ≤1″ vs Swiss
Ephemeris 2.10 for Sun–Saturn and ≤2.5″ for the precise Moon tier;
`accuracy.json` carries the per-body figures, and the suite holds 3,218
conformance checks.

Swiss Ephemeris agrees with JPL to about 0.001″. Caelus does not chase
that. The published contract is per-body arcsecond accuracy, below
astrological discrimination.

## Tier 1: pure math, no new data

Each item needs formulas the engine mostly has already: obliquity,
nutation, sidereal time.

| Feature | Swiss Ephemeris equivalent | Notes |
|---------|---------------------------|-------|
| Sidereal zodiac | `swe_set_sid_mode`, 47 ayanamsas | Each ayanamsa is an epoch offset plus precession. About 10 cover real usage: Lahiri, Fagan/Bradley, Krishnamurti, Raman, and the galactic modes. |
| More house systems | 24 codes in `swe_houses` | Koch, Regiomontanus, Campanus, Alcabitius, Morinus, Vehlow, Meridian, Polich-Page are closed-form or simple iterations. Placidus was the hard one and is done. |
| Equatorial RA/Dec | `SEFLG_EQUATORIAL` | One rotation by true obliquity. |
| Heliocentric output | `SEFLG_HELCTR` | Computed internally today (VSOP87D), not exposed. |
| Topocentric positions | `SEFLG_TOPOCTR` | Diurnal parallax. Material for the Moon only, up to ~1°. |
| Mean Lilith | `SE_MEAN_APOG` | Analytic series, same pattern as the mean node. |
| Vertex, East Point, co-ascendants | `SE_VERTEX` etc. | One-line formulas on ARMC and obliquity. |
| Moon phase, elongation, magnitude | `swe_pheno` | Meeus ch. 48 plus standard magnitude formulas. |
| Equation of time, az/alt, refraction | `swe_time_equ`, `swe_azalt`, `swe_refrac` | Standard formulas. |

Estimated effort: 1–2 weeks, including the Python reference and golden
fixtures for each item.

## Tier 2: new data through the existing fit pipeline

**Status (2026-06-13): complete.** Done: true/osculating Lilith
(`true_lilith`; ≤3′ vs SE-Moshier — the quantity amplifies lunar-theory
differences ~1/e, and SE's own Moshier-vs-DE spread dominates),
rise/set/meridian transits (≤0.5 s), crossings as engine API (≤4 s),
plus lunar phases and stations; all surfaced through the new `sky_events`
MCP tool. Deferred: the interpolated apogee (`SE_INTP_APOG`) — SE's
interpolation method is not reproducible from the documentation excerpt
we could verify against; revisit with a better source. Asteroids shipped 2026-06-12: `ceres`,
`pallas`, `juno`, `vesta`, `pholus` from locally-run Horizons fits
(`python/fit_smallbody.py`), wired through the Chiron pipeline.
Uranian bodies shipped 2026-06-12
(`fit_uranian.py`: Kepler element pack, ≤2.3″ geocentric). Fixed stars
shipped 2026-06-13 (318-star HYG catalog, ≤0.3″ under Vondrák; unlocks the
star-anchored ayanamsas `galcent_0sag` and `true_citra`) along with
Gauquelin sectors (SE method 3, exact). Tier 2 is closed.

The Chiron pattern (`python/fit_chiron.py`: JPL Horizons vectors →
Chebyshev fit → ~10 KB JSON) generalizes to each of these.

| Feature | Swiss Ephemeris equivalent | Notes |
|---------|---------------------------|-------|
| Ceres, Pallas, Juno, Vesta, Pholus | `SE_CERES`…`SE_PHOLUS` | Five pipeline runs, ~50 KB total, ≤1″ each. |
| Uranian and fictitious bodies | `SE_CUPIDO`…`SE_WALDEMATH` | Defined by published orbital elements. A small Kepler propagator reproduces them exactly. |
| True/osculating Lilith | `SE_OSCU_APOG`, `SE_INTP_APOG` | Derivable from the precise-Moon Chebyshev tier already shipped. |
| Fixed stars | `swe_fixstar2` | JSON catalog (RA/dec, proper motion) for the ~300 stars in astrological use, 20–30 KB. Precession, nutation, and aberration already exist. |
| Rise/set/meridian transit | `swe_rise_trans` | Root-find the altitude function; no data. Unlocks Gauquelin sectors. |
| Crossings | `swe_solcross`, `swe_mooncross` | `find_aspect_dates` already does the bisection; expose it as engine API. |

Estimated effort: ~2 weeks. Bundle budget: ship asteroid and star packs as
lazy data chunks like the precise Moon tier, so the embedded core keeps
its ~85 KB figure.

## Tier 3: eclipses

**Status (2026-06-13): shipped** — global circumstances (search, type,
gamma, magnitudes, contacts): types match Swiss Ephemeris exactly over
1990–2030 (92 lunar + 89 solar), maxima ≤9 s, lunar magnitudes ≤0.0013
via Danjon's parallax enlargement recovered empirically.

**Update (2026-06-15): ground paths + local circumstances shipped.**
`solarEclipseWhere` intersects the shadow axis with the IAU 1976 ellipsoid
for the sub-shadow geographic point (sample it across the eclipse to draw
the central line); `solarEclipseLocal` gives an observer's contact times
(C1–C4), magnitude, and obscuration from topocentric Sun/Moon disks;
`solarEclipseLimits` marches perpendicular to the ground track to the umbra
edge for the north/south limits of totality and the path width;
`lunarEclipseLocal` reports whether the Moon is above the horizon at a place
(a lunar eclipse is simultaneous worldwide, so visibility is the only local
question). All ride on the `sky_events` MCP tool (solar eclipses now report
the greatest-eclipse location and path width, lunar eclipses report Moon
altitude, and local circumstances come with a lat/lon). Validated in-repo
against the NASA GSFC five-millennium canon: the greatest-eclipse point
lands within ~2 km, totality duration within a few seconds, and the path
width within ~2 km for 2017-08-21 and 2024-04-08; the 2025-03-14 total lunar
eclipse reads as up over the Americas and below the horizon in East Asia.
The Swiss Ephemeris sweep (`validate_swiss.py`, against
`swe_sol_eclipse_where`/`_when_loc`) runs where pyswisseph is installed.

Solar and lunar eclipse search (when, where, how) via Besselian elements
from Meeus and the Explanatory Supplement. No new data. With a 2.5″ Moon,
contact times land within seconds and ground paths within a few km: fine
for charts, not for eclipse-chaser path maps. Lunar occultations of
planets fall out of the same machinery. Largest single feature by effort,
2–3 weeks.

## Out of scope

These conflict with embedded-JSON data and the edge runtime story, and are
recorded as non-goals:

- The ±13,000-year range. Swiss Ephemeris gets it from hundreds of MB of
  compressed DE431 files. Embedded tiers cap near 1700–2200; a lazy
  extended pack could reach roughly 1000–3000 CE if demand appears.
- The numbered-asteroid corpus (hundreds of thousands of bodies). The fit
  pipeline can mint a Chebyshev pack for any requested asteroid instead.
- Planetary moons and planetocentric positions.
- Heliacal phenomena (Schaefer visibility modeling): large effort, small
  audience.
- JPL-grade 0.001″ accuracy.

## Design decisions before v0.3

1. **Options object, not flags.** Swiss Ephemeris composes behavior from
   `SEFLG_` bits. Caelus should add one optional argument instead:
   `position(body, jdUt, opts)` and `chart(…, opts)` with `zodiac`,
   `frame` (`ecliptic` | `equatorial`), and `center` (`geo` | `helio` |
   `topo`). Decide the shape before any Tier 1 feature lands, so the
   signature changes once at 0.3.0 or never.
2. **Open body registry.** `BODIES` is a closed 13-item union type. Bodies
   arriving from data packs need a registry the type system tolerates:
   string ids plus a capability lookup on the injected `EngineData`.
3. **MCP stays at outcome level.** The seven-tool budget holds (six through
   v0.3; `sky_events` joined at 0.4.0). Sidereal modes and house systems
   arrive as parameters on existing tools. Eclipses extend `sky_events` in
   Tier 3 — no eighth tool.
4. **Data stays versioned artifacts.** New packs follow the precise-Moon
   pattern: separate lazy JSON with documented provenance, regenerated by
   the Python pipeline.

## Sequencing

1. ~~v0.3: Tier 1~~ (shipped 0.3.0).
2. ~~v0.4: Tier 2~~ (0.4.0 shipped asteroids, Uranians, true Lilith,
   event search; fixed stars, star-anchored ayanamsas, and Gauquelin
   sectors landed 2026-06-13 and close the tier).
3. ~~v0.5: Tier 3~~ (eclipse search shipped 2026-06-13; ground paths and
   local circumstances -- solar where/local/limits, lunar visibility --
   landed 2026-06-15 and close the tier).

Every item inherits the validation chain: Python reference first, golden
fixtures, then the TS port. Swiss Ephemeris remains the oracle, never the
source.
