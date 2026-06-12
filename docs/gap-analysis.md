# Swiss Ephemeris gap analysis — 2026-06-12

What remains between Swiss Ephemeris 2.10 and Caelus 0.2.0, and what each
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
`accuracy.json` carries the per-body figures, and the suite holds 1,438
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
3. **MCP stays at outcome level.** The six-tool budget holds. Sidereal
   modes and house systems arrive as parameters on existing tools.
   Eclipses, rise/set, phases, and stations share one new
   `sky_events(range, kinds, lat?, lon?)` tool: seven tools total.
4. **Data stays versioned artifacts.** New packs follow the precise-Moon
   pattern: separate lazy JSON with documented provenance, regenerated by
   the Python pipeline.

## Sequencing

1. v0.3: Tier 1, plus the options-object and body-registry decisions.
   Sidereal and house systems are the two most requested Swiss Ephemeris
   features per effort spent.
2. v0.4: Tier 2 (new bodies, fixed stars, rise/set).
3. v0.5: Tier 3 (eclipses).

Every item inherits the validation chain: Python reference first, golden
fixtures, then the TS port. Swiss Ephemeris remains the oracle, never the
source.
