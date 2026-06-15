"""JPL Horizons client for sampling small-body heliocentric state vectors.

Fetches geometric (no light-time) positions in heliocentric ecliptic J2000,
matching the Swiss Ephemeris flags used by the original fit_chiron sampler:
  HELCTR | J2000 | XYZ | NONUT | TRUEPOS
"""
import json
import math
import re
import time
import urllib.parse
import urllib.request

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
CHIRON = "2060"
RANGE_CHUNK = 1000  # days per Horizons range query


def _parse_vector_block(text):
    """Extract JDTDB + X,Y,Z rows from a Horizons vector table."""
    if "$$SOE" not in text:
        raise RuntimeError(f"Horizons error:\n{text[:2000]}")
    block = text.split("$$SOE")[1].split("$$EOE")[0]
    jds, xs, ys, zs = [], [], [], []
    pending_jd = None
    for line in block.splitlines():
        mjd = re.match(r"^\s*(\d+\.\d+)\s*=", line)
        if mjd:
            pending_jd = float(mjd.group(1))
            continue
        m = re.match(
            r"^\s*X\s*=\s*([+-]?\d+\.\d+E[+-]\d+)\s+"
            r"Y\s*=\s*([+-]?\d+\.\d+E[+-]\d+)\s+"
            r"Z\s*=\s*([+-]?\d+\.\d+E[+-]\d+)",
            line,
        )
        if m and pending_jd is not None:
            jds.append(pending_jd)
            xs.append(float(m.group(1)))
            ys.append(float(m.group(2)))
            zs.append(float(m.group(3)))
            pending_jd = None
    return jds, xs, ys, zs


def _step_size_str(step_days):
    """Horizons STEP_SIZE: integer days as 'Nd'; sub-day as whole hours ('6 h')."""
    if step_days == int(step_days):
        return f"'{int(step_days)}d'"
    hours = round(step_days * 24)
    if hours >= 1 and abs(hours / 24 - step_days) < 1e-9:
        return f"'{hours} h'"
    raise ValueError(f"unsupported Horizons step {step_days} days (use whole days or whole hours)")


def _fetch_range(jd0, jd1, step_days=1.0, command=CHIRON, center="@sun"):
    """Download a JD range via START_TIME/STOP_TIME (one API call)."""
    params = {
        "format": "text",
        "COMMAND": f"'{command}'",
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "VECTOR",
        "CENTER": f"'{center}'",
        "REF_PLANE": "'ECLIPTIC'",
        "START_TIME": f"'JD{jd0:.9f}'",
        "STOP_TIME": f"'JD{jd1:.9f}'",
        "STEP_SIZE": _step_size_str(step_days),
        "VEC_TABLE": "2",
        "VEC_CORR": "'NONE'",
        "OUT_UNITS": "'AU-D'",
        "CAL_FORMAT": "JD",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=180) as resp:
        text = resp.read().decode()
    return _parse_vector_block(text)


def _fetch_vectors(jds, command=CHIRON):
    """Return (x, y, z) AU arrays for specific JDs (small batches via TLIST)."""
    import numpy as np

    jds = np.atleast_1d(jds).astype(float)
    tlist = ",".join(f"{jd:.9f}" for jd in jds)
    params = {
        "format": "text",
        "COMMAND": f"'{command}'",
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "VECTOR",
        "CENTER": "'@sun'",
        "REF_PLANE": "'ECLIPTIC'",
        "TLIST": tlist,
        "TLIST_TYPE": "JD",
        "VEC_TABLE": "2",
        "VEC_CORR": "'NONE'",
        "OUT_UNITS": "'AU-D'",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=120) as resp:
        text = resp.read().decode()
    _, xs, ys, zs = _parse_vector_block(text)
    if len(xs) != len(jds):
        raise RuntimeError(
            f"Horizons returned {len(xs)} vectors for {len(jds)} JDs"
        )
    return np.array(xs), np.array(ys), np.array(zs)


class HorizonsCache:
    """Daily heliocentric small-body cache with linear interpolation.
    command: Horizons COMMAND (e.g. "2060" Chiron, "1;" Ceres -- the
    semicolon marks a small-body record number); label: provenance name."""

    def __init__(self, path, command=CHIRON, label="2060 Chiron", center="@sun"):
        self.path = path
        self.command = command
        self.label = label
        self.center = center
        self._jds = None
        self._xs = None
        self._ys = None
        self._zs = None

    def ensure(self, jd0, jd1, step=1.0, pad_days=0.0):
        import numpy as np

        need_hi = jd1 + pad_days
        if self._jds is not None:
            if self._jds[-1] >= need_hi:
                return
            self._jds = self._xs = self._ys = self._zs = None

        try:
            with open(self.path) as f:
                data = json.load(f)
            # Reuse only if the cache is the same body AND covers the span; the
            # JD range alone is not enough -- a stale wrong-body cache (e.g. a
            # 999-vs-barycenter Pluto run) would otherwise be used silently.
            if (
                data.get("body") == self.label
                and data["jd0"] <= jd0
                and data["jd1"] >= need_hi
            ):
                self._jds = np.array(data["jds"])
                self._xs = np.array(data["x"])
                self._ys = np.array(data["y"])
                self._zs = np.array(data["z"])
                print(f"loaded Horizons cache: {self.path} ({len(self._jds)} samples)")
                return
        except (FileNotFoundError, KeyError, json.JSONDecodeError):
            pass

        hi = jd1 + pad_days
        print(f"downloading {self.label} from JPL Horizons: JD {jd0} .. {hi} (step {step}d)")
        jds_all, xs_all, ys_all, zs_all = [], [], [], []
        chunk = RANGE_CHUNK * step
        nchunks = int(math.ceil((hi - jd0) / chunk))
        t = jd0
        for i in range(nchunks):
            t1 = min(t + chunk, hi)
            print(f"  range {i + 1}/{nchunks}: JD {t:.1f} .. {t1:.1f}")
            jds, xs, ys, zs = _fetch_range(t, t1, step, command=self.command, center=self.center)
            jds_all.extend(jds)
            xs_all.extend(xs)
            ys_all.extend(ys)
            zs_all.extend(zs)
            t = t1
            time.sleep(0.15)

        data = {
            "source": "JPL Horizons",
            "body": self.label,
            "center": "@sun",
            "frame": "heliocentric ecliptic J2000",
            "correction": "geometric (VEC_CORR=NONE)",
            "units": "AU",
            "jd0": float(jds_all[0]),
            "jd1": float(jds_all[-1]),
            "step": step,
            "jds": [float(v) for v in jds_all],
            "x": [float(v) for v in xs_all],
            "y": [float(v) for v in ys_all],
            "z": [float(v) for v in zs_all],
        }
        # drop duplicate epochs from overlapping range chunks
        uniq = {}
        for j, x, y, z in zip(jds_all, xs_all, ys_all, zs_all):
            uniq[j] = (x, y, z)
        jds_all = sorted(uniq)
        xs_all = [uniq[j][0] for j in jds_all]
        ys_all = [uniq[j][1] for j in jds_all]
        zs_all = [uniq[j][2] for j in jds_all]
        data["jds"] = [float(v) for v in jds_all]
        data["x"] = [float(v) for v in xs_all]
        data["y"] = [float(v) for v in ys_all]
        data["z"] = [float(v) for v in zs_all]
        data["jd1"] = float(jds_all[-1])

        with open(self.path, "w") as f:
            json.dump(data, f, separators=(",", ":"))
        print(f"wrote cache: {self.path} ({len(jds_all)} samples, "
              f"{len(json.dumps(data)) / 1024:.0f} KB)")

        self._jds = np.array(jds_all)
        self._xs = np.array(xs_all)
        self._ys = np.array(ys_all)
        self._zs = np.array(zs_all)

    def sample(self, jds):
        import numpy as np

        jds = np.atleast_1d(jds).astype(float)
        if np.any(jds < self._jds[0]) or np.any(jds > self._jds[-1]):
            raise ValueError(
                f"JD outside cache range {self._jds[0]}..{self._jds[-1]} "
                f"(requested {jds.min()}..{jds.max()})"
            )
        return (
            np.interp(jds, self._jds, self._xs),
            np.interp(jds, self._jds, self._ys),
            np.interp(jds, self._jds, self._zs),
        )


class ChironHorizonsCache(HorizonsCache):
    """Backward-compatible alias used by fit_chiron.py."""

    def __init__(self, path):
        super().__init__(path, command=CHIRON, label="2060 Chiron")
