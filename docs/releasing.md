# Releasing

Publishing is automated; claiming names and the token are one-time manual
steps (they need npm account auth no CI runner should hold interactively).

## One-time setup

1. On npmjs.com: create/log into the publishing account.
2. Claim the @caelus org: npmjs.com → Add Organization → name `caelus`
   (free plan is fine for public packages).
3. Create an **automation** access token (Settings → Access Tokens →
   Generate → Automation; bypasses 2FA for CI).
4. Add it to the repo: GitHub → Settings → Secrets and variables →
   Actions → new secret `NPM_TOKEN`.

The unscoped names `caelus` and `caelus-mcp` are claimed by the first
publish itself (verified free 2026-06-10; re-check before tagging:
`npm view caelus` should still 404).

## Each release

1. Bump versions in the four package.json files (keep them in lockstep)
   and in `llms.txt` + `apps/web/public/llms.txt` —
   `node scripts/check-llms.mjs` verifies the sync, CI enforces it.
2. Update `caelus-mcp`'s dependency range on `caelus` if needed.
3. Commit, then tag and push:
   ```
   git tag v0.1.0 && git push origin v0.1.0
   ```
4. The release workflow runs the full verification chain (golden suite,
   MCP oracle suite, birth tzdb suite, wheel render suite, llms.txt sync)
   and publishes all four packages with `--provenance`. A red suite
   blocks the publish.

## What ships

`caelus` ships slim (~2.0 MB unpacked): embedded VSOP tiers, the
1920–2080 precise-Moon Chebyshev tier, Chiron, nutation, Pluto. The
full-range Moon tier (1850–2150, 3.1 MB, same precision) stays in the
repo; `loadNodeData(dir, level, "full")` falls back to the embedded tier
when the full file is absent. Outside 1920–2080 the engine uses the
analytic series (~10″) — documented on /validation.
