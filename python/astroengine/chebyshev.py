"""astroengine.chebyshev -- segmented Chebyshev fit/eval for ephemeris data.

The 'fit once, ship coefficients' recipe: sample any high-precision source
(JPL DE, Horizons, ...) for a body's rectangular coordinates, fit Chebyshev
polynomials per fixed-length time segment, store compactly as JSON. Runtime
evaluation is a few dozen multiply-adds; derivatives are analytic.
"""
import json, math, os


def _clenshaw(coeffs, x):
    b0 = b1 = 0.0
    for c in reversed(coeffs[1:]):
        b0, b1 = 2.0 * x * b0 - b1 + c, b0
    return x * b0 - b1 + coeffs[0]


def cheb_eval_deriv(coeffs, x, half_span_days):
    """Series value and time-derivative (per day) via derivative coefficients."""
    n = len(coeffs)
    d = [0.0] * n
    for k in range(n - 1, 0, -1):
        d[k - 1] = (d[k + 1] if k + 1 < n else 0.0) + 2.0 * k * coeffs[k]
    d[0] *= 0.5
    return _clenshaw(coeffs, x), _clenshaw(d[:max(n - 1, 1)], x) / half_span_days


class ChebSeries:
    """Runtime container: jd0, seg_days, segments[ [cx],[cy],[cz] ]."""

    def __init__(self, data):
        self.jd0 = data["jd0"]
        self.seg = data["seg_days"]
        self.segments = data["segments"]
        self.jd1 = self.jd0 + self.seg * len(self.segments)
        self.scale = data.get("scale", 1.0)

    @classmethod
    def load(cls, path):
        with open(path) as f:
            return cls(json.load(f))

    def _locate(self, jd):
        if not (self.jd0 <= jd <= self.jd1):
            raise ValueError(f"jd {jd} outside fitted range {self.jd0}-{self.jd1}")
        i = min(int((jd - self.jd0) / self.seg), len(self.segments) - 1)
        x = 2.0 * (jd - (self.jd0 + i * self.seg)) / self.seg - 1.0
        return i, x

    def xyz(self, jd):
        i, x = self._locate(jd)
        s = self.segments[i]
        return tuple(_clenshaw(c, x) * self.scale for c in s)

    def xyz_vel(self, jd):
        """Position and velocity (units/day)."""
        i, x = self._locate(jd)
        s = self.segments[i]
        half = self.seg / 2.0
        pos, vel = [], []
        for c in s:
            p, v = cheb_eval_deriv(c, x, half)
            pos.append(p * self.scale)
            vel.append(v * self.scale)
        return tuple(pos), tuple(vel)


def fit(sample_fn, jd0, jd1, seg_days, degree, scale=1.0, samples_per_seg=None,
        sig=9):
    """Fit segmented Chebyshev series.

    sample_fn(jd_array) -> (x, y, z) arrays in source units.
    scale: divide stored coefficients by this (runtime multiplies back).
    Returns (data_dict, max_residual_in_source_units).
    """
    import numpy as np
    nseg = int(math.ceil((jd1 - jd0) / seg_days))
    m = samples_per_seg or (2 * degree + 2)
    segments, max_resid = [], 0.0
    # Chebyshev-Gauss-Lobatto sample points within each segment
    xs = np.cos(np.pi * np.arange(m) / (m - 1))[::-1]  # [-1, 1]
    for i in range(nseg):
        a = jd0 + i * seg_days
        jds = a + (xs + 1.0) * seg_days / 2.0
        X, Y, Z = sample_fn(jds)
        seg = []
        for arr in (X, Y, Z):
            c = np.polynomial.chebyshev.chebfit(xs, arr, degree)
            resid = np.max(np.abs(np.polynomial.chebyshev.chebval(xs, c) - arr))
            max_resid = max(max_resid, float(resid))
            seg.append([float(f"%.{sig}g" % (v / scale)) for v in c])
        segments.append(seg)
    return {"jd0": jd0, "seg_days": seg_days, "scale": scale,
            "segments": segments}, max_resid
