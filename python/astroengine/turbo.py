"""astroengine.turbo -- a fast-evaluation tier fit to the engine's own output.

The full engine evaluates VSOP/ELP series (hundreds of terms) per body. The
turbo tier replaces that with a segmented Chebyshev representation of the
engine's apparent ecliptic longitude, so a longitude costs a couple of dozen
multiply-adds. A century-scale transit scan that calls longitude() tens of
thousands of times then runs in milliseconds, in the browser.

The pack is fit to the *engine* (not an external source), so the only claim is
that turbo reproduces the engine to the fit tolerance; the engine's own
accuracy vs Swiss Ephemeris / JPL is unchanged. Each segment fits the
longitude unwrapped relative to the segment centre, so a segment that straddles
0/360 has no jump.

Segment lengths must resolve the ~13.7-day semi-monthly nutation term (shared
by every body), so even the slow planets use ~24-day segments. At degree 12
that reproduces the planets to <0.01" and the Moon to ~0.03".

The fit is pure Python (Chebyshev-Gauss-Lobatto interpolation, no numpy), so
the pack is reproducible anywhere the engine runs.
"""
import json
import math
import os

from .chebyshev import _clenshaw

DEG = math.pi / 180.0


def cheb_coeffs_cgl(samples):
    """Chebyshev coefficients (degree N) interpolating `samples`, which are a
    function sampled at the N+1 Chebyshev-Gauss-Lobatto nodes x_k = cos(k*pi/N),
    k = 0..N. Pure-Python discrete cosine transform."""
    n = len(samples) - 1
    coeffs = []
    for j in range(n + 1):
        s = 0.5 * samples[0] + 0.5 * samples[n] * math.cos(math.pi * j)
        for k in range(1, n):
            s += samples[k] * math.cos(math.pi * j * k / n)
        coeffs.append((2.0 / n) * s)
    coeffs[0] *= 0.5
    coeffs[n] *= 0.5
    return coeffs


def _wrap180(d):
    return ((d + 180.0) % 360.0) - 180.0


def _fit_segment(engine, body, a, seg, degree, zodiac):
    """Chebyshev coefficients for `body`'s longitude over [a, a+seg]. The
    samples are unwrapped relative to the segment centre, so a segment that
    straddles 0/360 has no jump; the body only has to stay within 180 deg of
    the centre value across the segment (true for every body at a sane segment
    length)."""
    ref = engine.longitude(body, a + seg / 2.0, zodiac=zodiac)
    samples = []
    for k in range(degree + 1):
        x = math.cos(math.pi * k / degree)          # CGL node in [-1, 1]
        t = a + (x + 1.0) * seg / 2.0
        lon = engine.longitude(body, t, zodiac=zodiac)
        samples.append(ref + _wrap180(lon - ref))
    return cheb_coeffs_cgl(samples)


def fit(engine, bodies, jd0, jd1, seg_days, degree=12, zodiac="tropical"):
    """Fit a turbo pack: per body, segmented Chebyshev of (unwrapped) longitude.
    `seg_days` is a dict body -> segment length (days)."""
    pack = {"jd0": jd0, "jd1": jd1, "degree": degree, "zodiac": zodiac,
            "bodies": {}}
    for body in bodies:
        seg = seg_days[body]
        nseg = int(math.ceil((jd1 - jd0) / seg))
        segs = [_fit_segment(engine, body, jd0 + i * seg, seg, degree, zodiac)
                for i in range(nseg)]
        pack["bodies"][body] = {"seg_days": seg, "segments": segs}
    return pack


class Turbo:
    """Runtime evaluator for a turbo pack."""

    def __init__(self, pack):
        self.jd0 = pack["jd0"]
        self.jd1 = pack["jd1"]
        self.bodies = pack["bodies"]

    @classmethod
    def load(cls, path):
        with open(path) as f:
            return cls(json.load(f))

    def has(self, body):
        return body in self.bodies

    def longitude(self, body, jd):
        """Apparent ecliptic longitude (degrees) from the turbo pack."""
        b = self.bodies[body]
        seg = b["seg_days"]
        if not (self.jd0 <= jd <= self.jd1):
            raise ValueError(f"jd {jd} outside turbo range {self.jd0}-{self.jd1}")
        i = min(int((jd - self.jd0) / seg), len(b["segments"]) - 1)
        x = 2.0 * (jd - (self.jd0 + i * seg)) / seg - 1.0
        return _clenshaw(b["segments"][i], x) % 360.0
