# Releasing

Publishing is automated; claiming names and the token are one-time manual
steps (they need npm account auth no CI runner should hold interactively).

## One-time setup

### npm (token)

1. On npmjs.com: create/log into the publishing account.
2. Create an **automation** access token (Settings → Access Tokens →
   Generate → Automation; bypasses 2FA for CI).
3. Add it to the repo: GitHub → Settings → Secrets and variables →
   Actions → new secret `NPM_TOKEN`.

### PyPI (no token — Trusted Publishing)

`caelus-engine` publishes from CI via PyPI **Trusted Publishing** (OIDC), so
there is no PyPI token to create, paste, or rotate. Configure it once:

1. GitHub → repo Settings → Environments → create an environment named `pypi`.
2. PyPI → Your projects → `caelus-engine` → Manage → Settings → Publishing →
   under **GitHub Actions**, **Add a new publisher** (the project already
   exists, so this is a publisher on the live project, not a "pending"
   publisher — pending publishers are only for projects that don't exist yet):
   - Owner: `heavyblotto` · Repository: `caelus`
   - Workflow filename: `release.yml`
   - Environment: `pypi`

After that, every tagged release publishes the Python package automatically
alongside the npm packages. (The legacy manual path — `python -m build` then
`twine upload` with a `pypi-…` token — is no longer needed; it's what let the
PyPI version silently lag the npm versions.)

All four names are unscoped (`caelus`, `caelus-mcp`, `caelus-birth`,
`caelus-wheel` — the `@caelus` scope is claimed/reserved on npm) and are
registered by the first publish itself. Re-check before tagging:
`npm view caelus` should still 404.

## Each release

1. Bump the version everywhere it lives, in lockstep on feature releases
   (a metadata-only patch may bump a single package — see MCP Registry below):
   the four `package.json` files, `python/pyproject.toml`,
   `packages/caelus-mcp/server.json` (both the top-level `version` and the
   `packages[].version`), and `llms.txt` + `apps/web/public/llms.txt`.
2. Update `caelus-mcp`'s and `caelus-birth`'s dependency range on `caelus`
   (`^X.Y.Z`) to match.
3. Run `npm run check:versions` — it asserts npm × PyPI × `server.json` all
   agree and the `caelus` dep ranges match, so a half-bumped release fails
   locally instead of shipping. `node scripts/check-llms.mjs` verifies the
   `llms.txt` sync. Both run in CI (`check:versions` also gates `release`).
4. Commit, then tag and push:
   ```
   git tag v0.1.0 && git push origin v0.1.0
   ```
   Remote-execution sessions cannot push tags (the git proxy rejects tag
   refs); from those, dispatch the `release` workflow on `main` instead
   (Actions → release → Run workflow) and push the tag afterward from a
   local clone. The published versions come from package.json /
   pyproject.toml either way.
5. The release workflow runs the version gate and the full verification chain
   (golden suite, MCP oracle suite, birth tzdb suite, wheel render suite,
   llms.txt sync), publishes all four npm packages with `--provenance`, and
   publishes `caelus-engine` to PyPI via Trusted Publishing (no token). A red
   suite blocks the publish.

**Never `npm publish` by hand.** All four packages set
`publishConfig.provenance: true`, so every publish must carry an npm provenance
attestation — which can only be minted from a supported CI runner with OIDC
(this workflow has `id-token: write`). A local `npm publish` fails by design:
provenance can't be generated off a laptop. The tag workflow is the
only path that publishes, and it always publishes with provenance. Do not work
around this with a token; if a release went out without provenance, the fix is
a new patch version through CI, not a manual upload (npm versions are
immutable, so the attestation can never be backfilled onto the bad version).

Publishes are idempotent: `scripts/publish-if-missing.sh` skips any npm
package whose version is already on the registry, and the PyPI step uses
`skip-existing`, so pushing a tag after a dispatch release (or re-running a
partially failed workflow) is safe.

The only thing not yet wired into the tag is the MCP Registry push (it needs
interactive GitHub device-code auth); see below.

## MCP Registry (`caelus-mcp`)

`caelus-mcp` is listed on the official MCP Registry as
`io.github.heavyblotto/caelus-mcp`. This is the upstream that downstream
directories (mcp.so, Glama, Smithery) sync from. The Registry hosts metadata
only and **verifies it against the published npm artifact**, so two invariants
must hold:

1. `packages/caelus-mcp/package.json` carries
   `"mcpName": "io.github.heavyblotto/caelus-mcp"` (committed since 0.12.1).
2. `packages/caelus-mcp/server.json` `version` and `packages[].version` match a
   version of `caelus-mcp` that is **already published to npm** and contains
   `mcpName`. npm versions are immutable, so a new Registry listing always needs
   a newly published version that carries the field — that is why 0.12.1 was
   cut (a metadata-only `caelus-mcp` patch, the other three stayed at 0.12.0).

To push a new version to the Registry, **after** `caelus-mcp@X.Y.Z` is live on
npm: bump `server.json` to `X.Y.Z`, then from `packages/caelus-mcp/`:

```
# one-time per machine — grab the CLI
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher

./mcp-publisher validate        # server.json vs the registry schema
./mcp-publisher login github     # device-code auth as the heavyblotto account (the io.github.heavyblotto namespace owner); token persists
./mcp-publisher publish
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.heavyblotto/caelus-mcp"  # verify (status: active)
```

The hand-curated lists are separate one-time submissions, not synced from the
Registry: the marketplace issues live at `chatmcp/mcpso` (mcp.so) and
`lobehub/lobehub` (LobeHub), and a PR to `punkpeye/awesome-mcp-servers`.

## What ships

`caelus` ships slim (~2.0 MB unpacked): embedded VSOP tiers, the
1920–2080 precise-Moon Chebyshev tier, Chiron, nutation, Pluto. The
full-range Moon tier (1850–2150, 3.1 MB, same precision) stays in the
repo; `loadNodeData(dir, level, "full")` falls back to the embedded tier
when the full file is absent. Outside 1920–2080 the engine uses the
analytic series (~10″) — documented on /validation.
