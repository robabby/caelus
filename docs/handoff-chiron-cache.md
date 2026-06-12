# Handoff: commit the Chiron Horizons cache (provenance closure)

**For: Cursor agent. Status: ready to execute. Needs network access to
`ssd.jpl.nasa.gov` (JPL Horizons API). Everything else is done.**

## Context

caelus's brand is verifiability: every shipped data byte traces to a public
source. The shipped `chiron_cheb.json` (both copies: `packages/caelus/data/`
and `python/astroengine/data/`) was fitted from JPL Horizons geometric
vectors, but the raw Horizons sample cache (`python/chiron_horizons_cache.json`)
is gitignored — so the fit is not reproducible from the repo alone. External
review flagged this; decision made: **commit the cache** (it is public-domain
JPL output). This was blocked in the previous session only because that
environment's network policy did not allow `ssd.jpl.nasa.gov`.

## Ground rules (do not skip)

- The conformance suite is the contract: `packages/caelus/test/golden.test.ts`
  vs `golden.json`, currently **1,438 checks, 0 failures**. Never loosen
  tolerances. If a number moves, it must be because the data legitimately
  changed, and goldens must be regenerated from the Python reference
  (`python/export_golden.py`) — never hand-edited.
- Never hand-edit anything under `data/`; only the pipeline writes it.
- Horizons queries must request **geometric** vectors (`VEC_CORR='NONE'`).
  `python/horizons.py` already does this — do not change it. (Light-time
  baked into samples double-counts downstream: ~9″ bias. See /notes.)

## Steps

1. From repo root: `pip install numpy` (only dep), then
   `python3 python/fit_chiron.py`.
   This downloads ~116k daily heliocentric samples (JD range 1850–2150 plus
   16-year Chebyshev padding) to `python/chiron_horizons_cache.json` in ~120
   chunked API calls, then re-fits and overwrites both `chiron_cheb.json`
   copies.
2. Check whether the re-fit reproduced the committed artifact:
   `git diff --stat -- packages/caelus/data/chiron_cheb.json python/astroengine/data/chiron_cheb.json`
   - **No diff (expected):** Horizons' orbit solution for 2060 Chiron is
     unchanged since the original fit; the committed artifact is now
     reproducible from the committed cache. Proceed.
   - **Diff:** Horizons updated its solution. Keep the new fit (the cache
     must reproduce the shipped artifact — that is the whole point), then
     regenerate goldens: `python3 python/export_golden.py`. Chiron golden
     values will move slightly; everything else must not.
3. Remove the `python/chiron_horizons_cache.json` line from `.gitignore`
   (keep the comment accurate — it currently says the cache is ignored).
   Sanity-check the cache size first; expect roughly 10–25 MB. If it is
   somehow over 50 MB, stop and ask instead of committing.
4. Run the full verification chain; all must pass:
   ```
   npm install
   npm run build -w caelus && node packages/caelus/dist/test/golden.test.js   # 1,438 / 0
   npm run build -w caelus-mcp && node packages/caelus-mcp/smoke.mjs
   node packages/caelus-mcp/verify_tools.mjs                                   # 166 / 0
   npm run build -w web
   npm run lint:prose    # needs vale; binary at github.com/errata-ai/vale releases
   ```
5. Commit the cache + `.gitignore` change (+ regenerated files if step 2 hit
   the diff case) with a message explaining the provenance closure. Push.
6. Optional polish: on `apps/web/app/provenance/page.tsx`, the Chiron row can
   note that the raw Horizons samples are committed in-repo. Match the
   existing voice (terse, evidence-first — see `docs/editorial-voice.md`);
   prose lint is blocking in CI.

## Verification of done

- `python/chiron_horizons_cache.json` is tracked, and a fresh
  `python3 python/fit_chiron.py` run (which will then load the committed
  cache instead of downloading) reproduces both `chiron_cheb.json` files
  byte-for-byte.
- Full chain green. Delete this file in the same PR/commit that completes it.
