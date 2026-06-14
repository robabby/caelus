"""astroengine.compiler -- synthesize a chart form from geometric constraints.

The forward direction of caelus is (time, place) -> chart. This is the inverse:
given a set of weighted geometric constraints (aspects between bodies, sign or
degree placements), find the body longitudes that best satisfy them, and report
how well they can be satisfied. If the best fit is still poor, the form is
geometrically impossible -- a valid result, not an error.

The loss and constraint evaluation are pure and reference-first (the TS port
reproduces them, pinned by the golden). The optimizer is a deterministic
coordinate descent with fixed low-discrepancy restarts; it is validated by
behaviour (a satisfiable form solves, an impossible one is flagged), not by a
cross-language golden.
"""
PHI = 0.6180339887498949  # low-discrepancy restart spread


def _ang_dist(a, b):
    return abs(((a - b + 180.0) % 360.0) - 180.0)


def _sign_loss(lon, sign):
    lo = (sign % 12) * 30.0
    d = (lon - lo) % 360.0
    if d < 30.0:
        return 0.0
    return min(d - 30.0, 360.0 - d)  # distance to the nearer band edge


def constraint_loss(lons, c):
    """Degrees by which a single constraint is unmet given the longitudes."""
    k = c["kind"]
    if k == "aspect":
        return abs(_ang_dist(lons[c["a"]], lons[c["b"]]) - c["angle"])
    if k == "sign":
        return _sign_loss(lons[c["body"]], c["sign"])
    if k == "degree":
        return _ang_dist(lons[c["body"]], c["degree"])
    raise ValueError(k)


def form_loss(lons, constraints):
    """Total weighted constraint loss for a set of body longitudes."""
    return sum(c.get("weight", 1.0) * constraint_loss(lons, c) for c in constraints)


def _bodies(constraints):
    s = set()
    for c in constraints:
        for key in ("a", "b", "body"):
            if c.get(key) is not None:
                s.add(c[key])
    return sorted(s)


def _body_loss(lons, body, constraints):
    total = 0.0
    for c in constraints:
        if body in (c.get("a"), c.get("b"), c.get("body")):
            total += c.get("weight", 1.0) * constraint_loss(lons, c)
    return total


def compile_form(constraints, restarts=12, iters=8, impossible_deg=5.0):
    """Find body longitudes minimizing the weighted constraint loss. Returns
    {longitudes, residual, max_constraint_loss, impossible, constraints}."""
    bodies = _bodies(constraints)
    n = max(len(bodies), 1)
    best = None
    for r in range(restarts):
        lons = {b: (((r * n + i + 1) * PHI) % 1.0) * 360.0
                for i, b in enumerate(bodies)}
        for _ in range(iters):
            for b in bodies:
                best_l = lons[b]
                best_e = _body_loss(lons, b, constraints)
                for i in range(360):  # coarse 1-degree sweep
                    lons[b] = float(i)
                    e = _body_loss(lons, b, constraints)
                    if e < best_e:
                        best_e = e
                        best_l = float(i)
                for k in range(-20, 21):  # refine +/-1 degree at 0.05
                    cand = (best_l + k * 0.05) % 360.0
                    lons[b] = cand
                    e = _body_loss(lons, b, constraints)
                    if e < best_e:
                        best_e = e
                        best_l = cand
                lons[b] = best_l
        e = form_loss(lons, constraints)
        if best is None or e < best[0]:
            best = (e, dict(lons))
    residual, lons = best
    max_loss = max((constraint_loss(lons, c) for c in constraints), default=0.0)
    return {
        "longitudes": lons,
        "residual": residual,
        "max_constraint_loss": max_loss,
        "impossible": max_loss > impossible_deg,
        "constraints": [{**{k: v for k, v in c.items() if k != "weight"},
                         "loss": constraint_loss(lons, c)} for c in constraints],
    }
