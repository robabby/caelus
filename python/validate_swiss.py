"""Measure the v0.3 feature set against Swiss Ephemeris 2.10 (pyswisseph,
Moshier mode). Swiss Ephemeris is the oracle here, never the source: every
formula in astroengine comes from published references (Meeus, IAU, Mallama
2018) and this script reports the agreement.

Usage: python3 validate_swiss.py            # table to stdout
"""
import json
import math
import random
import sys

sys.path.insert(0, ".")
import swisseph as swe
from astroengine import core, houses as H, pheno as PH
from astroengine.chart import Engine
from astroengine.core import DEG, J2000, julian_day, jd_tt

TWO_PI = 2 * math.pi
FLG = swe.FLG_MOSEPH
random.seed(42)
N = 120
JDS = [julian_day(1900, 1, 1) + random.random() * 73000 for _ in range(N)]  # 1900-2099
LATS = (0.01, 27.95, 40.7, 51.5, -33.9, 64.1, -55.0, 10.2, -8.05, 78.2)
eng = Engine("full")
rows = []


def arc(a, b):
    return abs(((a - b + 180) % 360 - 180)) * 3600


def report(name, worst, unit='"', n=N):
    rows.append((name, worst, unit, n))
    print(f"{name:34s} worst {worst:10.4f} {unit}  (n={n})")


# ---- sidereal longitudes ------------------------------------------------
for mode, sid in [("lahiri", swe.SIDM_LAHIRI), ("fagan_bradley", swe.SIDM_FAGAN_BRADLEY),
                  ("krishnamurti", swe.SIDM_KRISHNAMURTI), ("raman", swe.SIDM_RAMAN),
                  ("yukteshwar", swe.SIDM_YUKTESHWAR)]:
    swe.set_sid_mode(sid, 0, 0)
    worst = 0.0
    for jd in JDS:
        jde = jd_tt(jd)
        ours = eng.longitude("sun", jd, zodiac=f"sidereal:{mode}")
        ref, _ = swe.calc(jde, swe.SUN, FLG | swe.FLG_SIDEREAL)
        worst = max(worst, arc(ours, ref[0]))
    report(f"sun sidereal ({mode})", worst)

# ---- equatorial ----------------------------------------------------------
for body, sb in [("venus", swe.VENUS), ("mars", swe.MARS), ("moon", swe.MOON)]:
    wra = wdec = 0.0
    for jd in JDS:
        jde = jd_tt(jd)
        p = eng.position(body, jd)
        ref, _ = swe.calc(jde, sb, FLG | swe.FLG_EQUATORIAL)
        wra = max(wra, arc(p["ra"], ref[0]))
        wdec = max(wdec, arc(p["dec"], ref[1]))
    report(f"{body} RA", wra)
    report(f"{body} Dec", wdec)

# ---- topocentric ---------------------------------------------------------
swe.set_topo(-82.46, 27.95, 10.0)
for body, sb in [("moon", swe.MOON), ("mars", swe.MARS)]:
    worst = 0.0
    for jd in JDS:
        jde = jd_tt(jd)
        p = eng.position(body, jd, topocentric=True, observer=(27.95, -82.46, 10.0))
        ref, _ = swe.calc(jde, sb, FLG | swe.FLG_TOPOCTR)
        worst = max(worst, arc(p["lon"], ref[0]))
    report(f"{body} topocentric lon", worst)

# ---- mean lilith ----------------------------------------------------------
wl = wb = 0.0
for jd in JDS:
    jde = jd_tt(jd)
    p = eng.position("mean_lilith", jd)
    ref, _ = swe.calc(jde, swe.MEAN_APOG, FLG)
    wl = max(wl, arc(p["lon"], ref[0]))
    wb = max(wb, arc(p["lat"], ref[1]))
report("mean lilith lon", wl)
report("mean lilith lat", wb)

# ---- heliocentric ----------------------------------------------------------
for body, sb in [("mars", swe.MARS), ("jupiter", swe.JUPITER), ("pluto", swe.PLUTO)]:
    worst = 0.0
    for jd in JDS:
        jde = jd_tt(jd)
        hp = eng.heliocentric(body, jd)
        ref, _ = swe.calc(jde, sb, FLG | swe.FLG_HELCTR | swe.FLG_TRUEPOS | swe.FLG_NONUT)
        worst = max(worst, arc(hp["lon"], ref[0]))
    report(f"{body} heliocentric lon", worst)

# ---- houses (isolated geometry via houses_armc) ---------------------------
HOUSE_CODES = {"koch": b'K', "regiomontanus": b'R', "campanus": b'C',
               "alcabitius": b'B', "morinus": b'M', "meridian": b'X',
               "polich_page": b'T', "vehlow": b'V'}
HOUSE_FNS = {"koch": H.houses_koch, "regiomontanus": H.houses_regiomontanus,
             "campanus": H.houses_campanus, "alcabitius": H.houses_alcabitius,
             "morinus": H.houses_morinus, "meridian": H.houses_meridian,
             "polich_page": H.houses_polich_page, "vehlow": H.houses_vehlow}
random.seed(7)
ARMCS = [(random.uniform(0, 360), lat, random.uniform(23.40, 23.46))
         for lat in LATS for _ in range(20)]
for name, code in HOUSE_CODES.items():
    worst = 0.0
    n = undef_ours = undef_swe = 0
    for armc, lat, eps in ARMCS:
        ours = ref = None
        try:
            ours = HOUSE_FNS[name](armc * DEG, lat * DEG, eps * DEG)
        except ValueError:
            undef_ours += 1
        try:
            ref, _ = swe.houses_armc(armc, lat, eps, code)
        except swe.Error:
            undef_swe += 1
        if ours is None or ref is None:
            continue
        n += 1
        for i in range(12):
            worst = max(worst, arc(ours[i] / DEG, ref[i]))
    report(f"houses {name}", worst, n=n)
    if undef_ours != undef_swe:
        print(f"  !! definedness mismatch: ours {undef_ours} vs swe {undef_swe}")

# ---- angles: asc convention, vertex, east point ---------------------------
wa = wv = we = 0.0
for armc, lat, eps in ARMCS:
    a, f, e = armc * DEG, lat * DEG, eps * DEG
    ref, ascmc = swe.houses_armc(armc, lat, eps, b'W')
    asc = H._asc_of(a, f, e)
    vtx, east = H.vertex_east_point(a, f, e)
    wa = max(wa, arc(asc / DEG, ascmc[0]))
    wv = max(wv, arc(vtx / DEG, ascmc[3]))
    we = max(we, arc(east / DEG, ascmc[4]))
report("ascendant (incl. polar)", wa, n=len(ARMCS))
report("vertex", wv, n=len(ARMCS))
report("east point", we, n=len(ARMCS))

# ---- pheno -----------------------------------------------------------------
SB = {"sun": swe.SUN, "moon": swe.MOON, "mercury": swe.MERCURY, "venus": swe.VENUS,
      "mars": swe.MARS, "jupiter": swe.JUPITER, "saturn": swe.SATURN,
      "uranus": swe.URANUS, "neptune": swe.NEPTUNE, "pluto": swe.PLUTO}
wpa = wph = wel = wdi = 0.0
wmag = {b: 0.0 for b in SB}
nmag = 0
for jd in JDS[:60]:
    jde = jd_tt(jd)
    for body, sb in SB.items():
        ours = PH.pheno(eng, body, jd)
        ref = swe.pheno(jde, sb, FLG)
        if body != "sun":  # swe zeroes the sun's phase fields; we report 1.0
            wpa = max(wpa, abs(ours["phase_angle"] - ref[0]) * 3600)
            wph = max(wph, abs(ours["phase"] - ref[1]))
            wel = max(wel, abs(ours["elongation"] - ref[2]) * 3600)
        wdi = max(wdi, abs(ours["diameter"] - ref[3]) * 3600)
        if not (body == "moon" and ref[0] > 140):
            wmag[body] = max(wmag[body], abs(ours["magnitude"] - ref[4]))
report("pheno phase angle", wpa, n=600)
report("pheno illum fraction", wph, unit=" ", n=600)
report("pheno elongation", wel, n=600)
report("pheno apparent diameter", wdi, n=600)
report("magnitude (worst body: %s)" % max(wmag, key=wmag.get),
       max(wmag.values()), unit=" mag", n=600)

# ---- equation of time, az/alt, refraction ----------------------------------
worst = 0.0
for jd in JDS:
    worst = max(worst, abs(PH.equation_of_time(eng, jd) - swe.time_equ(jd) * 1440))
report("equation of time", worst, unit=" min")
worst = 0.0
for jd in JDS[:40]:
    p = eng.position("mars", jd)
    ref = swe.azalt(jd, swe.ECL2HOR, (-82.46, 27.95, 10.0), 1013.25, 15.0,
                    (p["lon"], p["lat"], p["dist"]))
    az, alt = PH.az_alt(p["lon"], p["lat"], jd, 27.95, -82.46)
    worst = max(worst, arc((az - 180.0) % 360, ref[0]), arc(alt, ref[1]))
report("az/alt (mars)", worst, n=40)
worst = 0.0
for alt in (-1.0, 0.0, 1.0, 5.0, 10.0, 25.0, 45.0, 80.0):
    worst = max(worst, abs(PH.refract_true_to_apparent(alt) -
                           swe.refrac(alt, 1013.25, 15.0, swe.TRUE_TO_APP)) * 3600)
report("refraction true->apparent", worst, n=8)

# ---- events: rise/set/transit, crossings, phases, true lilith -------------
from astroengine import events as EV

random.seed(5)
RKINDS = [("rise", swe.CALC_RISE), ("set", swe.CALC_SET),
          ("mtransit", swe.CALC_MTRANSIT), ("itransit", swe.CALC_ITRANSIT)]
for body, sb in [("sun", swe.SUN), ("moon", swe.MOON), ("mars", swe.MARS)]:
    worst = 0.0
    nn = 0
    mismatch = 0
    for glon, glat in [(-82.46, 27.95), (-0.12, 51.5), (151.21, -33.87), (-21.9, 64.1)]:
        for _ in range(3):
            jd0 = julian_day(1955, 1, 1) + random.random() * 23000
            for kind, flag in RKINDS:
                try:
                    res = swe.rise_trans(jd0, sb, flag, (glon, glat, 0.0), 1013.25, 15.0, FLG)
                    t_swe = res[1][0] if res[0] == 0 else None
                except swe.Error:
                    t_swe = None
                t_us = EV.rise_set(eng, body, jd0, glat, glon, kind=kind)
                if (t_swe is None) != (t_us is None):
                    mismatch += 1
                elif t_swe is not None:
                    nn += 1
                    worst = max(worst, abs(t_us - t_swe) * 86400)
    report(f"{body} rise/set/transit", worst, unit=" s", n=nn)
    if mismatch:
        print(f"  !! polar no-event mismatch x{mismatch}")

worst = 0.0
for _ in range(8):
    jd0 = jd_tt(julian_day(1950, 1, 1) + random.random() * 40000)
    target = random.uniform(0, 360)
    t_swe = swe.solcross(target, jd0, FLG)
    hits = [jd_tt(h) for h in EV.crossings(eng, "sun", target, jd0 - 0.1, jd0 + 400)]
    worst = max(worst, min(abs(h - t_swe) for h in hits) * 86400)
    t_swe = swe.mooncross(target, jd0, FLG)
    hits = [jd_tt(h) for h in EV.crossings(eng, "moon", target, jd0 - 0.1, jd0 + 40)]
    worst = max(worst, min(abs(h - t_swe) for h in hits) * 86400)
report("crossings (sun+moon)", worst, unit=" s", n=16)

worst = 0.0
jd0 = julian_day(1988, 2, 1)
phases = EV.lunar_phases(eng, jd0, jd0 + 60)
for t, name in phases:
    angle = {"new": 0, "first_quarter": 90, "full": 180, "last_quarter": 270}[name]
    jde = jd_tt(t)

    def f(x):
        m = swe.calc(x, swe.MOON, FLG)[0][0]
        s = swe.calc(x, swe.SUN, FLG)[0][0]
        return (m - s - angle + 180) % 360 - 180
    a, b = jde - 0.2, jde + 0.2
    for _ in range(50):
        m_ = (a + b) / 2
        if f(a) * f(m_) <= 0:
            b = m_
        else:
            a = m_
    worst = max(worst, abs(jde - (a + b) / 2) * 86400)
report("lunar phases", worst, unit=" s", n=len(phases))

# stations are ill-conditioned (speed-zero slope ~0.01 deg/day^2): minutes
# of timing noise from sub-arcsecond model differences is expected
worst = 0.0
nst = 0
for body, sb in [("mercury", swe.MERCURY), ("saturn", swe.SATURN)]:
    jd0 = julian_day(1975, 1, 1)
    for t, _d in EV.stations(eng, body, jd0, jd0 + 700):
        nst += 1
        jde = jd_tt(t)

        def spd(x):
            return swe.calc(x, sb, FLG | swe.FLG_SPEED)[0][3]
        a, b = jde - 1.5, jde + 1.5
        for _ in range(50):
            m_ = (a + b) / 2
            if spd(a) * spd(m_) <= 0:
                b = m_
            else:
                a = m_
        worst = max(worst, abs(jde - (a + b) / 2) * 86400)
report("stations", worst, unit=" s", n=nst)

# true lilith: hypersensitive to the lunar theory; SE-Moshier vs our DE423
# fit dominates the difference (see core._osc_apogee_from_state)
worst = 0.0
for jd in JDS[:60]:
    jde = jd_tt(jd)
    p = eng.position("true_lilith", jd)
    ref, _ = swe.calc(jde, swe.OSCU_APOG, FLG)
    worst = max(worst, arc(p["lon"], ref[0]))
report("true lilith (osc apogee)", worst, n=60)

# ---- fixed stars (oracle fed our own catalog rows via a minted sefstars) --
import tempfile
from astroengine import stars as ST

cat = ST.catalog()["stars"]
STAR_TEST = ["Aldebaran", "Sirius", "Regulus", "Spica", "Algol", "Polaris",
             "Antares", "Fomalhaut", "Betelgeuse", "Vega"]
tmp = tempfile.mkdtemp()
import os as _os
with open(_os.path.join(tmp, "sefstars.txt"), "w") as f:
    for n in STAR_TEST:
        s = cat[n]
        rah = s["ra"] / 15.0
        hh = int(rah); mm = int((rah - hh) * 60); ss = ((rah - hh) * 60 - mm) * 60
        dd = s["dec"]; sg = "+" if dd >= 0 else "-"
        ad = abs(dd); D = int(ad); M = int((ad - D) * 60); S = ((ad - D) * 60 - M) * 60
        f.write(f"{n:<20s},xx ,ICRS,{hh:02d},{mm:02d},{ss:09.6f},{sg}{D:02d},{M:02d},{S:08.5f},"
                f"{s['pmra']},{s['pmdec']},{s['rv']},{s['plx']},{s['mag']},0.0\n")
swe.set_ephe_path(tmp)
worst = 0.0
for n in STAR_TEST:
    for y in (1900, 1950, 2000, 2050, 2099):
        jde = jd_tt(julian_day(y, 6, 1))
        lon, lat = ST.star_apparent(eng.vsop, cat[n], jde)
        ref = swe.fixstar(n, jde, FLG)[0]
        worst = max(worst, arc(lon / DEG, ref[0]), arc(lat / DEG, ref[1]))
report("fixed stars (10 stars)", worst, n=50)

for mode, sid in [("galcent_0sag", swe.SIDM_GALCENT_0SAG),
                  ("true_citra", swe.SIDM_TRUE_CITRA)]:
    swe.set_sid_mode(sid, 0, 0)
    worst = 0.0
    for jd in JDS[:40]:
        jde = jd_tt(jd)
        ours = eng.longitude("sun", jd, zodiac=f"sidereal:{mode}")
        ref, _ = swe.calc(jde, swe.SUN, FLG | swe.FLG_SIDEREAL)
        worst = max(worst, arc(ours, ref[0]))
    report(f"sun sidereal ({mode})", worst, n=40)

worst = 0.0
ng = 0
for body, sb in [("sun", swe.SUN), ("moon", swe.MOON), ("mars", swe.MARS)]:
    for glon, glat in ((-82.46, 27.95), (151.21, -33.87)):
        for k in range(3):
            jd = julian_day(1980, 1, 1) + 1234.5 * (k + 1) + 17.3 * ng
            g = EV.gauquelin_sector(eng, body, jd, glat, glon)
            ref = swe.gauquelin_sector(jd, sb, 3, (glon, glat, 0.0), 1013.25, 15.0, FLG)
            rv = ref[1] if isinstance(ref, tuple) else ref
            if g is None:
                continue
            ng += 1
            d = abs(g - rv)
            worst = max(worst, min(d, 36 - d))
report("gauquelin sectors", worst, unit=" sec.", n=ng)

# ---- eclipses ---------------------------------------------------------------
from astroengine import eclipses as EC

jd0e, jd1e = julian_day(2000, 1, 1), julian_day(2020, 1, 1)
le = EC.lunar_eclipses(eng, jd0e, jd1e)
ses = []
t = jd0e - 5
while True:
    ret, tret = swe.lun_eclipse_when(t, FLG, 0)
    if tret[0] > jd1e:
        break
    ses.append((tret[0], {4: "total", 16: "partial", 64: "penumbral"}[ret & 84]))
    t = tret[0] + 20
bad = sum(1 for o, s in zip(le, ses) if o["type"] != s[1])
wt = max(abs(o["t_max"] - s[0]) * 86400 for o, s in zip(le, ses)) if le else 1e9
report("lunar eclipses (type+max)", wt if len(le) == len(ses) and not bad else 1e9,
       unit=" s", n=len(le))
se2 = []
t = jd0e - 5
while True:
    ret, tret = swe.sol_eclipse_when_glob(t, FLG, 0)
    if tret[0] > jd1e:
        break
    se2.append((tret[0], "total" if ret & 4 else "annular" if ret & 8 else
                "hybrid" if ret & 32 else "partial"))
    t = tret[0] + 25
solar = EC.solar_eclipses(eng, jd0e, jd1e)
bad = sum(1 for o, s in zip(solar, se2) if o["type"] != s[1])
wt = max(abs(o["t_max"] - s[0]) * 86400 for o, s in zip(solar, se2)) if solar else 1e9
report("solar eclipses (type+max)", wt if len(solar) == len(se2) and not bad else 1e9,
       unit=" s", n=len(solar))

# where (greatest-eclipse geographic point) and local contact times vs SE,
# for the central (non-partial) eclipses in the window.
worst_km = 0.0
worst_loc = 0.0
n_central = 0
for o, s in zip(solar, se2):
    if o["type"] == "partial":
        continue
    _, wpos, _ = swe.sol_eclipse_where(s[0], FLG)  # SE central point at SE's max
    w = EC.solar_eclipse_where(eng, o["t_max"])
    if w is None:
        continue
    n_central += 1
    lat_o, lon_o = w
    dlat = lat_o - wpos[1]
    dlon = (lon_o - wpos[0] + 180) % 360 - 180
    worst_km = max(worst_km, math.hypot(
        dlat * 111.195, dlon * 111.195 * math.cos(math.radians(wpos[1]))))
    geopos = [wpos[0], wpos[1], 0.0]
    _, tret, _ = swe.sol_eclipse_when_loc(o["t_max"] - 0.5, geopos, FLG, 0)
    loc = EC.solar_eclipse_local(eng, o["t_max"], wpos[1], wpos[0], 0.0)
    pairs = [(loc["c1"], tret[1]), (loc["c4"], tret[4])]
    if loc["c2"] is not None:
        pairs += [(loc["c2"], tret[2]), (loc["c3"], tret[3])]
    for a, b in pairs:
        if a is not None and b:
            worst_loc = max(worst_loc, abs(a - b) * 86400)
report("solar eclipse where", worst_km, unit=" km", n=n_central)
report("solar eclipse contacts (loc)", worst_loc, unit=" s", n=n_central)

print()
# az/alt and pheno phase angle carry ΔT-model and sun-moon-distance noise;
# they get wider tolerances than positions.
TOL = {"az/alt (mars)": 30.0, "pheno phase angle": 300.0,
       "pheno elongation": 10.0, "true lilith (osc apogee)": 200.0}
TOL_SEC = {"gauquelin sectors": 0.001}
TOL_S = {"sun rise/set/transit": 1.0, "moon rise/set/transit": 2.0,
         "mars rise/set/transit": 1.0, "crossings (sun+moon)": 10.0,
         "lunar phases": 10.0, "stations": 180.0,
         "lunar eclipses (type+max)": 15.0, "solar eclipses (type+max)": 15.0,
         "solar eclipse contacts (loc)": 60.0}
TOL_KM = {"solar eclipse where": 10.0}
fails = [r for r in rows if (r[2] == '"' and r[1] > TOL.get(r[0], 5.0))
         or (r[2] == " s" and r[1] > TOL_S.get(r[0], 10.0))
         or (r[2] == " sec." and r[1] > TOL_SEC.get(r[0], 0.001))
         or (r[2] == " mag" and r[1] > 0.1)
         or (r[2] == " min" and r[1] > 0.05)
         or (r[2] == " km" and r[1] > TOL_KM.get(r[0], 10.0))
         or (r[2] == " " and r[1] > 0.001)]
if fails:
    print("OVER TOLERANCE:", [f[0] for f in fails])
    sys.exit(1)
print("all measurements within tolerance "
      "(5\" positions/houses, 0.1 mag, 0.05 min EoT; az/alt 30\" and "
      "phase angle 300\" carry ΔT/distance-model noise)")
