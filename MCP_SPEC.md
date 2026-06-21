# caelus-mcp — MCP Specification v0.9

Chart computation only. The server returns positions and aspects; the model
interprets. No interpretive text — smaller payloads, tradition-neutral,
composable with a separate KG/corpus server (see ARCHITECTURE.md).

## Design principles

1. **Outcome-level tools, not API wrappers.** `transits` returns natal +
   transiting aspects in one call.
2. **Token frugality.** Full natal chart ~3 KB: terse keys, 0.01° positions,
   compact aspect objects (`{"a":"moon","b":"venus","aspect":"trine","orb":2.09,"phase":"separating"}`;
   transits add `t`/`n` and an `applying` flag).
3. **Render-ready output.** Chart aspects pass the engine's `Aspect` objects
   through unchanged, so a `natal_chart` / `current_sky` response feeds
   caelus-wheel's `<ChartWheel chart={payload} />` with no adapter.
4. **Determinism + provenance.** Same input → same output. Tool descriptions
   state per-body accuracy vs Swiss Ephemeris — never a blanket figure
   (1850–2150: Sun–Saturn ≤1″, Uranus ≤1.9″, Neptune ≤4.6″, Moon ≤2.5″,
   Pluto ≤3.4″ with Chebyshev pack, Chiron ≤1″, mean node ≤1″,
   true node ≤ 1′ vs SE's built-in ephemeris).

## Tools

### natal_chart(date, lat, lon, house_system?)
13 bodies (sun..pluto, chiron, both nodes): sign, degree, house, retrograde,
speed; ASC/MC; 12 cusps; major aspects with orbs.

### current_sky(date?, lat?, lon?, house_system?)
Same shape as natal_chart. Defaults to now.

### sky_view(date?, lat, lon, azimuth, altitude?, lens?, width?, height?, elevation_m?, include_stars?, max_star_mag?)
Where the visible bodies land in a framed photo of the sky, for an image
prompt. Aim is a compass direction (azimuth, "W" or degrees) and altitude;
lens is a preset (ultrawide is fisheye, the rest rectilinear); width/height set
the frame. Returns each in-frame body's pixel position, apparent size, and
magnitude, the Moon's phase orientation, a sky-state summary (twilight,
limiting magnitude, horizon row), the bright bodies just out of frame, and a
serialized prompt. Caelus computes the geometry and photometry; it does not
render the image. For "at sunset", resolve the set time with sky_events first.
`bortle` (1-9) sets the dark-sky class (night limit, star density, Milky Way
visibility); `deep_field` pins the complete naked-eye field (thousands of stars
at exact pixels); `overlays` projects reference frames (`ecliptic`, `signs`,
`houses`, `constellations`) as exact-pixel annotation layers. Output also carries
`pole`, `starfield`, `milkyWay`, and `overlays`.

### sky_view_sequence(date?, lat, lon, azimuth, altitude?, lens?, frames, step_minutes, bortle?)
The animation timeline: the same place, aim, and lens stepped through time.
Returns the celestial pole, the sidereal rotation per frame, and a compact
per-frame array (instant, twilight, Sun/Moon altitude, Moon bright-limb,
Milky-Way-in-frame). Each frame's full pixel spec comes from sky_view at that
instant; this plans the sequence. 2-60 frames.

### transits(date, lat, lon, transit_date?, orb?, house_system?)
Natal chart + transiting positions + transit-to-natal aspects within orb
(applying/separating), plus natal house per transiting body.

### synastry(a, b, orb?)
Two charts, inter-chart aspects, house overlays both ways.

### find_aspect_dates(body, aspect, target_lon|target_body, start, end)
Exact aspect dates in a range (bisection to ~1 minute), including retrograde
re-hits. Saturn square natal Moon across 2026–2027 returns direct/retrograde/
direct passes. Used for electional timing and inverse transit queries.

### rectification_grid(date, lat, lon, window?, step_minutes?)
Sweeps a day or window: ASC/MC per step, ASC sign-change boundaries.
Pairs with find_aspect_dates to check candidate times against dated events.

### sky_events(start, end, kinds, body?, lat?, lon?, target_lon?, zodiac?)
Event search in a date range (≤370 days): rise/set/meridian transits
(body + place), lunar phases, stations (retrograde/direct), zodiac degree
crossings, and solar/lunar eclipses (global circumstances: type,
magnitude, gamma; types match Swiss Ephemeris exactly). Times agree with
Swiss Ephemeris to the second; stations to ~1 minute (ill-conditioned by
nature).

### planetary_hours(date?, lat, lon)
The planetary hour in effect at the moment: ruler, day/night, hour number
(1–24), start/end (UTC), the planetary-day ruler, and the full 24-hour ruler
sequence (Chaldean order from the day ruler). Returns `available:false` above
the polar circles when the Sun neither rises nor sets that day.

### void_of_course(date?, zodiac?)
Whether the Moon makes no further Ptolemaic aspect to a traditional planet
(Sun..Saturn) before leaving its current sign: the sign, the sign-exit time
(UTC), and the next perfecting aspect (null when void).

### returns(date, lat, lon, body, search_start, search_end, return_lat?, return_lon?, house_system?, zodiac?)
Solar or lunar return: the instants a body (`sun` ~yearly, `moon` ~monthly)
returns to its natal longitude within a window (≤2 years), plus the full return
chart (same shape as `natal_chart`) for the first one, cast at
`return_lat`/`return_lon` (defaulting to the birthplace).

### progressions(date, target_date, zodiac?)
Secondary progressions (day-for-a-year) and solar-arc directions to a target
date. Per body: the secondary-progressed and solar-arc-directed longitude, plus
the solar arc. Longitudes only — no birthplace needed.

### composite(a, b, house_system?, zodiac?)
Two relationship charts: the midpoint composite (shorter-arc midpoint of each
body and angle) and the Davison chart (a real `natal_chart`-shaped chart cast
for the temporal and geographic midpoint).

### dignities(date, lat, lon, zodiac?)
Essential dignity and sect for the seven traditional planets: per planet its
sign, any dignity (domicile/exaltation/detriment/fall), planetary sect
(diurnal/nocturnal, null for Mercury), and whether it is in sect given the
chart's day/night status (Sun above the horizon).

### lots(date, lat, lon, zodiac?)
The seven Hermetic lots (Arabic parts) — Fortune, Spirit, Eros, Necessity,
Courage, Victory, Nemesis — cast from the Ascendant and reversing by sect (day
chart = Sun above the horizon). Per lot: its longitude and zodiacal position.
Anchored to the Ascendant, so an exact time and lat+lon are required.

### profections(date, lat, lon, target_date, zodiac?)
Annual and monthly profections to `target_date`. The natal Ascendant advances
one whole sign per year of life; the profected sign's traditional ruler is the
lord of the year. Returns the age, the month within the profection year, and the
annual and monthly profected sign (whole-sign house from the Ascendant + lord).
Needs the birth time and place for the Ascendant.

### firdaria(date, lat, lon, target_date?)
The Persian/medieval planetary time-lord periods: nine major periods totalling
75 years (the seven planets by sect, then the two nodes), each planetary period
split into seven sub-periods. Returns the full timeline (UTC start/end per period
and sub-period) and, when `target_date` is given, the major and sub lord active
then. Sect from the birth chart; pure time arithmetic, no zodiac.

### releasing(date, lat, lon, target_date?, lot?, max_level?, horizon_years?, zodiac?)
Zodiacal releasing (aphesis) from a Lot — Spirit (default) or Fortune. Periods
release sign by sign from the Lot's sign on the 360-day-year convention; each
level is a twelfth of the one above (L1..L4), and a loop back to the start sign
looses the bond, jumping once to the opposite sign. Returns the timeline down to
`max_level` over `horizon_years` (each period: level, sign, lord, UTC start/end,
loosing-of-the-bond flag) and, when `target_date` is given, the L1..L4 lords
active then. Anchored to the natal Lot, so an exact time and lat+lon are required.

### directions(date, lat, lon, key?, max_years?)
Primary (mundane) directions of the seven traditional planets to the four angles
(MC, IC, Ascendant, Descendant). The diurnal rotation carries each body to an
angle; the arc, converted by a time key (`naibod` 0.9856473°/yr default, or
`ptolemy` 1°/yr), gives the age. Returns the directions reached within
`max_years`, sorted by age, each with arc, age in years, and UTC date.
Circumpolar bodies have no Ascendant/Descendant directions. Equatorial, so
zodiac is irrelevant; needs the birth time and place.

### synthetic_validate(system)
Check an authored synthetic celestial system for ill-defined inputs: duplicate
body ids, non-positive periods, out-of-range eccentricity, or an observer that
is not a body in the system. Returns `impossible` and a list of `problems`, the
same honesty pattern as the compiler. No instant or place needed.

### synthetic_positions(system, date?, t_days?)
Positions of every body in an authored system at one instant. Three body modes:
`placement` (a fixed longitude), `periodic` (uniform motion, one cycle per
`periodDays`), and `kepler` (constant orbital elements). With `observer` set on
the system the positions are geocentric and apparent from that body, so outer
bodies can show retrograde. Pass `t_days` for the abstract world frame, or
`date` (UT ISO) when body `epoch` values are Julian Days. Returns longitude,
latitude, distance, speed, and a retrograde flag per body, plus the validation
diagnosis.

### synthetic_sky_view(system, lat, lon, azimuth, altitude?, date?, lens?, width?, height?, elevation_m?, bortle?, bodies?, include_stars?)
Sky View for a mix of real and synthetic bodies. The authored system is
registered on an ephemeral engine, then the visible sky is framed exactly like
`sky_view`. Synthetic bodies carry render attributes (`sizeDeg`, `magnitude`,
`color`) that flow into the pixel spec and the image prompt. Real Sun, Moon, and
planets stay for twilight and context unless `bodies` omits them; stars are off
by default for fictional skies.

## Resources (shipped)
- `caelus://glossary`: machine-readable definitions; aspect angles and default
  orbs, signs, bodies, the twelve house systems, and essential dignities
  (domicile/exaltation/detriment/fall).
- `caelus://accuracy`: the validation table, vs Swiss Ephemeris (`swiss`) and
  JPL Horizons apparent positions (`jpl`).

## Prompts
- `rectification_session` (shipped): a multi-turn script around
  `rectification_grid` and `find_aspect_dates`.
- `natal_reading` (future): template wiring `natal_chart` + corpus citations,
  once a KG/corpus server exists.

## Transports & deployment
- **stdio** (shipped): `npx caelus-mcp` for Claude Desktop / local agents.
- **Streamable HTTP** (shipped): `buildServer()` is mounted at `/api/mcp` on
  ephemengine.com (Vercel), stateless and with no per-user state. The hosted
  server injects an embedded-tier engine; positions are identical to stdio.

## v0.3 surface (shipped)
`natal_chart`, `current_sky`, `transits`, and `synastry` take `zodiac`
(`tropical` default, or `sidereal:<ayanamsa>`: lahiri, fagan_bradley,
krishnamurti, raman, yukteshwar; star-anchored galcent_0sag and true_citra
since the fixed-star catalog); `find_aspect_dates` searches in either
zodiac. `house_system` widened to 12: placidus, whole_sign, equal, porphyry,
koch, regiomontanus, campanus, alcabitius, morinus, meridian, polich_page,
vehlow (Placidus and Koch fall back to whole_sign above the polar circles,
reported as before). Payloads gain a `zodiac` key only when sidereal.

## v0.4 surface (shipped)
`sky_events`: rise/set/transits, phases, stations, crossings.

## v0.5 surface (shipped)
`sky_events` gains `solar_eclipse` and `lunar_eclipse` kinds — the
Tier 3 extension.

## v0.9 surface (shipped)
Electional layer: `planetary_hours` and `void_of_course` tools; `natal_chart`
and `current_sky` tag each body with solar phase (cazimi/combust/under-the-beams)
and each aspect with an applying/separating phase. `caelus://glossary` gains an
`electional` block (solar-phase thresholds, Chaldean order and day rulers, the
void-of-course and aspect-phase definitions). Built on the validated electional
primitives in `caelus`, golden-pinned to the Python reference.

## v0.13 surface (shipped)
Derived-chart harvest: `returns`, `progressions`, `composite`, and `dignities`
surface engine functions (solar/lunar returns, secondary progressions and
solar arc, midpoint composite and Davison, essential dignity and sect) that
were already suite-pinned in `caelus` but not yet exposed over MCP. No engine
change; the new tools gain `verify_tools` engine-oracle checks and frozen
`golden-mcp` payloads. Thirteen tools total.

## v0.14 surface (shipped)
Hellenistic time-lords harvest (Roadmap Phase 1): `lots`, `profections`,
`firdaria`, and `releasing` surface the engine's sect-aware Hermetic lots,
annual/monthly profections (lord of the year), the firdaria planetary time-lord
periods, and zodiacal releasing (aphesis) over MCP. No engine change; each tool
gains `verify_tools` engine-oracle checks — including the Fortune/Spirit symmetry
invariant for lots, the 75-year-total and sub-period-tiling invariants for
firdaria, the +6 loosing-of-the-bond and L2-tiling invariants for releasing, and
the IC = MC + 180 and time-key invariants for directions — and a frozen
`golden-mcp` payload. The `directions` tool completes the Phase 1 surface.
Eighteen tools total.

## Vedic harvest (Roadmap Phase 2, shipped in caelus-mcp 0.14.0)
Vedic/Jyotish layer: `nakshatras` (the 27 lunar mansions, padas, and lords of
each planet and the Ascendant), `dasha` (Vimshottari, Yogini, or Ashtottari
periods from the Moon's nakshatra), `vargas` (the Parashari divisional charts
D1/D2/D3/D9/D10/D12/D30), and `yogas` (Pancha Mahapurusha, Gajakesari,
Budha-Aditya, Chandra-Mangala, Kemadruma, plus raja/dhana yogas and yogakarakas)
surface the engine's sidereal layer over MCP; `directions` gains an optional
inter-planetary (mundane, promissor → significator) block. These tools default
to the sidereal Lahiri zodiac. No engine change; each gains `verify_tools`
engine-oracle checks — nakshatra/pada/lord exactness, dasha timeline contiguity
and active-lord agreement with the engine, the D1 = rasi reduction and navamsa
match for vargas, and the conjunction/aspect/exchange association invariant for
raja/dhana yogas — and a frozen `golden-mcp` payload. Twenty-two tools total.

## Synthesis + search harvest (Roadmap Phase 4, shipped in caelus-mcp 0.16.0)
Analytic synthesis and mundane/search layer: `aspect_patterns` (the classical
configurations as maximal structured objects), `chart_signature` (element,
modality, quadrant, and hemisphere distributions, the dominant facets and the
classical chart ruler), `similar_skies` (cosine-similarity search for when the
sky most resembled a reference moment), `electional_search` (rank moments in a
window for a set of wanted aspects, void-of-course-aware), and `cosmic_weather`
(the day's active configurations with no birth chart needed). No engine change;
each gains `verify_tools` engine-oracle checks and a frozen `golden-mcp`
payload. Twenty-seven tools total.

## Interpretation harvest (shipped in caelus-mcp 0.18.0)
`chart_facts` exposes the interpretation seam: a chart's validated facts as
ranked, citable fact atoms plus a ready-to-interpret `brief`, so an LLM host
writes a reading grounded in correct math and cites the `[id]` each statement
rests on instead of re-deriving (and hallucinating) positions. The atoms span
placements, aspects, configurations, the structural signature, dispositors and
receptions, a body's tight conjunction with a bright fixed star
(`star:jupiter:Sirius`), and the Part of Fortune and Spirit (`lot:fortune`). The
engine ships the facts and the contract, never the interpretation content.
Twenty-nine tools total.
