# Date-range expansion (Tier A)

Tracking the work to widen Caelus's supported date range beyond the former
1900-2099 headline (now **1850-2150**, landed — see below), from the Swiss
Ephemeris feasibility analysis. The lever:
the published ceiling is not a theory limit (VSOP87 holds to about 1 arcsec
across +-4000 years for the inner planets, +-2000 years for Jupiter/Saturn),
it is set by two analytic shortcuts and by what we have measured.

This is "validated, not asserted": the headline range only moves once the
edge accuracy is measured against JPL Horizons, never on the strength of a
theory's published envelope alone.

## What bounds the range today

| Body group | Source | Range |
|---|---|---|
| Sun, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune | VSOP87D | theory good well past 2099; now measured over 1850-2150 |
| Pluto | Chebyshev pack (Horizons barycenter) | 1700-2212; superseded the Meeus ch.37 series (hard 1885-2099) |
| Moon (precise tier) | Chebyshev fit to DE | embedded 1920-2080, full 1850-2150 |
| Moon (fallback) | Meeus ch.47 abridged | book precision over the historical span |
| Chiron, Ceres, Pallas, Juno, Vesta, Pholus | Chebyshev fit to Horizons | 1850-2150 |
| Uranian bodies | Kepler element pack | validated 1800-2149 |
| Nodes, mean Lilith | analytic | no range limit |

Pluto was the one hard cliff inside an otherwise much wider envelope; the
Chebyshev pack removed it.

## Landed (network-free, this change)

The engine half is wired and inert until data arrives, the same pattern as the
Moon's full precise tier:

- **Pluto prefers a Chebyshev pack when present, else the Meeus series.** In
  `chart.ts` (`ecliptic` and `heliocentric`) Pluto routes through the generic
  packed-body pipeline when `chebPacks.pluto` is loaded, otherwise it uses
  Meeus ch.37 exactly as before. Mirrored in the Python reference
  (`chart.py`, `_has_pluto_pack`). No behaviour change without a pack: the
  full 27-suite golden run stays at 0 failures.
- **`node-loader.ts` pre-wired.** `pluto_cheb.json` is loaded into
  `chebPacks.pluto` when the file exists (`existsSync`-guarded), so dropping
  the pack into the data dir is all the Node tier needs. The browser tier
  imports JSON statically and cannot pre-wire a missing file, so the wide
  Pluto pack is a Node-tier artifact (like the full Moon tier and the
  asteroids); the playground keeps Meeus until/unless an embedded tier is
  added.
- **`fit_pluto.py`** mints the pack from Horizons vectors (Pluto body 999,
  heliocentric ecliptic J2000, geometric), scanning segment length and degree
  for the smallest pack under a 5e-6 AU residual. Default window 1700-2200.

## Landed (the data-plus-claims half, with Horizons egress)

All five remaining steps ran locally against `ssd.jpl.nasa.gov` and shipped:

1. `python fit_pluto.py` minted `pluto_cheb.json` from the Pluto **barycenter**
   (Horizons body 9, not body 999): body 999 carries Charon's ~6.4-day wobble
   (~1.4e-5 AU) that floors any smooth Chebyshev fit, while the barycenter is
   smooth and has no 1800/2199 Horizons cliff. Window 1700-2212, fit residual
   4.1e-6 AU (~0.03″). Pack written to both data dirs.
2. The pack is a Node-tier artifact, loaded via `node-loader.ts`
   (`existsSync`-guarded); the browser playground keeps Meeus.
3. Golden suite regenerated (`export_golden.py`) and the TS replay re-pinned;
   full 27-suite + birth/wheel green. A `1 - 1e-9` edge guard was added to both
   astrocartography implementations to skip degenerate near-tangent points
   (`acos(±1)`) that otherwise diverged ~2e-7° across languages.
4. `validate_horizons.py` now measures banded edges (core 1900-2099, extended
   1850-2150, edges 1800/2200) and writes per-band bounds to
   `horizons-accuracy.json`. The engine holds across 1850-2150; majors and
   Pluto run wider still.
5. Headline widened to the measured **1850-2150** band: `accuracy.json`
   (range + Pluto ≤3.4″, Mean Lilith ≤1.6″, and the per-body maxes from a
   `validate_swiss.py` re-run over 1851-2149), the validation/provenance pages,
   the MCP spec + server prose, both `llms.txt` copies, and the package READMEs.

## Notes and non-goals

- When a Pluto pack is loaded, Pluto behaves like the other Chebyshev bodies:
  outside the pack's fitted range it is reported in `Chart.unavailable` rather
  than computed. Whether to also move Pluto from `AlwaysBody` to `PackedBody`
  in the type model is deferred; today it stays `AlwaysBody` (without a pack it
  always resolves via Meeus).
- Tier B (a lazy DE-direct pack reaching roughly 1000-3000 CE) stays demand-
  gated, as recorded in `gap-analysis.md`.
- Full Swiss Ephemeris parity (the +-13,000-year range and 0.001 arcsec
  accuracy) remains a non-goal: arcsecond is already below astrological
  resolution, and for ancient dates the uncertainty in delta T dominates any
  position-theory error, so the input time is fuzzier than the engine.
