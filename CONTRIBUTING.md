# Contributing to Caelus

Thanks for your interest. Caelus is a clean-room astrology computation suite,
and the standard for changes is correctness you can demonstrate.

## Branching

`dev` is the canonical work branch; all changes land there first. `main` is
release-only. The maintainer promotes `dev` → `main` (or explicitly asks for
it). Contributors and agents do not commit, push, or reset `main` directly,
and do not open pull requests unless asked. A local `pre-push` hook enforces
this; promotion is a deliberate `CAELUS_ALLOW_MAIN_PUSH=1 git push origin main`.

## The one rule: the conformance suite is the contract

Every change must keep the golden conformance suite green. The suite
(`packages/caelus/test/golden.json`, 3,218+ checks) pins the TypeScript
engine to the Python reference, and CI blocks merges that break it.

New engine behavior lands reference-first:

1. Implement and validate it in the Python reference (`python/astroengine/`),
   checked against Swiss Ephemeris (`python/validate_swiss.py`) and, where
   relevant, JPL Horizons (`python/validate_horizons.py`).
2. Generate golden fixtures from the reference (`python/export_golden.py`,
   `python/export_query_golden.py`).
3. Port to TypeScript so the suite reproduces the fixtures.

A feature that exists only in TypeScript, with no reference and no fixtures,
will not be merged: there is nothing to check it against.

## Development

```sh
npm install
npm run build          # build all packages
npm test               # the golden conformance suite (caelus)
npm run lint:prose     # Vale prose checks (requires vale installed)
npm run lint:claims    # prose numbers must match measured stats
```

The Python reference is not a runtime dependency of the packages; it mints
the coefficient data and golden fixtures. Regenerate fixtures with the
`export_*` scripts after a reference change, and review the diff.

## Pull requests

- Open a pull request against the default branch. CI (conformance, prose,
  and claims) must pass.
- Keep accuracy figures honest. Numbers in prose and docs are checked against
  measured stats by the claims linter; regenerate them rather than editing by
  hand.
- Match the surrounding voice: dry and technical, facts over adjectives (see
  `docs/editorial-voice.md`).
- One coherent change per pull request.

## Provenance and licensing

Caelus is written from published sources (VSOP87, ELP/DE, IAU models, JPL
Horizons fits), not ported from Swiss Ephemeris or any other licensed
ephemeris. Do not introduce GPL or AGPL code, or bundled ephemeris files. New
data packs need documented provenance.

By contributing, you agree that your contributions are licensed under the MIT
License (see `LICENSE`).
