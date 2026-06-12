# caelus-engine (Python)

Reference implementation and data-fitting toolchain. Checked against Swiss
Ephemeris; writes Chebyshev JSON for the TypeScript engine.

## Chiron re-fit (JPL Horizons)

```bash
pip install -r requirements.txt
python fit_chiron.py          # downloads Horizons cache, fits, writes chiron_cheb.json
python export_golden.py       # regenerate TS golden fixtures
```

Provenance: `chiron_horizons_cache.json` stores raw Horizons samples;
`fit_chiron.py` writes to `packages/caelus/data/chiron_cheb.json`.
