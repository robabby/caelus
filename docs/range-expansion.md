# Date-range expansion (Tier A)

Tracking the work to widen Caelus's supported date range beyond the current
1900-2099 headline, from the Swiss Ephemeris feasibility analysis. The lever:
the published ceiling is not a theory limit (VSOP87 holds to about 1 arcsec
across +-4000 years for the inner planets, +-2000 years for Jupiter/Saturn),
it is set by two analytic shortcuts and by what we have measured.

This is "validated, not asserted": the headline range only moves once the
edge accuracy is measured against JPL Horizons, never on the strength of a
theory's published envelope alone.

## What bounds the range today

| Body group | Source | Range |
|---|---|---|
| Sun, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune | VSOP87D | theory good well past 2099; measured only over 1900-2099 |
| Pluto | Meeus ch.37 series | hard 1885-2099; diverges outside |
| Moon (precise tier) | Chebyshev fit to DE | embedded 1920-2080, full 1850-2150 |
| Moon (fallback) | Meeus ch.47 abridged | book precision over the historical span |
| Chiron, Ceres, Pallas, Juno, Vesta, Pholus | Chebyshev fit to Horizons | 1850-2150 |
| Uranian bodies | Kepler element pack | validated 1800-2149 |
| Nodes, mean Lilith | analytic | no range limit |

Pluto is the one hard cliff inside an otherwise much wider envelope.

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

## Remaining (needs Horizons egress + numpy)

These cannot run in a sandbox without outbound access to `ssd.jpl.nasa.gov`.
Run them locally or in CI with egress:

1. `python fit_pluto.py` -> writes `pluto_cheb.json` to both data dirs.
   Confirm the residual prints under 5e-6 AU and the pack is a few tens of KB.
2. Add `pluto_cheb.json` to the maintained data manifest and, if wanted, an
   embedded browser tier (static import in `data-embedded.ts`, size budget
   permitting).
3. Regenerate the golden suite (`export_golden.py`). The longitudes table
   samples Pluto out to about 2140; with a pack covering that span those
   points now route through the pack, so the golden values for Pluto change
   and must be regenerated, then the TS replay re-pinned.
4. Extend `validate_horizons.py` to sample the new edges (e.g. add 1800 and
   2200 epochs) and measure the VSOP outer planets and the Moon there. Write
   the per-band bounds into `horizons-accuracy.json` / `accuracy.json`.
5. Only if the measured arcsec holds at the edges: widen the published
   headline (playground "1900-2099", the validation page, and the
   claims-registry render forms + prose) to the measured band.

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
