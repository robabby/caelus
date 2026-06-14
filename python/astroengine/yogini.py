"""astroengine.yogini -- the Yogini dasha, a 36-year nakshatra-based dasha cycle.

Eight yoginis rule in a fixed order, with periods 1..8 years (totalling 36):
Mangala (Moon) 1, Pingala (Sun) 2, Dhanya (Jupiter) 3, Bhramari (Mars) 4,
Bhadrika (Mercury) 5, Ulka (Saturn) 6, Siddha (Venus) 7, Sankata (Rahu) 8. The
starting yogini comes from the Moon's birth nakshatra: add 3 to the nakshatra
number and take it modulo 8 (a remainder of 0 means the 8th, Sankata). As in
Vimshottari, the elapsed portion of the first period is the fraction of the
nakshatra the Moon has traversed, and each period subdivides into eight
proportional sub-periods of the eight yoginis from the period's own yogini.

Deterministic time arithmetic on the Moon's nakshatra (a 365.25-day dasha year
by default). The TS port (yogini.ts) reproduces every value and the golden
fixtures pin the two together.
"""
from .vedic import nakshatra, NAK_SPAN, DASHA_YEAR

YOGINIS = ["Mangala", "Pingala", "Dhanya", "Bhramari", "Bhadrika", "Ulka",
           "Siddha", "Sankata"]
YOGINI_LORDS = {"Mangala": "moon", "Pingala": "sun", "Dhanya": "jupiter",
                "Bhramari": "mars", "Bhadrika": "mercury", "Ulka": "saturn",
                "Siddha": "venus", "Sankata": "rahu"}
# Period in years by yogini index (Mangala..Sankata), totalling 36.
YOGINI_YEARS = [1, 2, 3, 4, 5, 6, 7, 8]
YOGINI_TOTAL = 36


def starting_yogini(nak_index):
    """0-based starting yogini index from the Moon's nakshatra index (0-based):
    (nakshatra_number + 3) mod 8, with a remainder of 0 mapping to the 8th."""
    y = (nak_index + 1 + 3) % 8     # nakshatra number is 1-based
    return (y - 1) % 8              # remainder 0 -> 8th (index 7)


def yogini_dashas(moon_lon, natal_jd, levels=2, year_length=DASHA_YEAR, count=8):
    """The Yogini dasha timeline from the Moon's sidereal longitude. Returns
    {start_yogini, balance_years, dashas} of `count` periods (the first starting
    before birth), each with sub-periods when levels >= 2."""
    nak = nakshatra(moon_lon)
    start = starting_yogini(nak["index"])
    elapsed = nak["pos"] / NAK_SPAN
    y0 = YOGINI_YEARS[start]
    t = natal_jd - elapsed * y0 * year_length
    dashas = []
    for k in range(count):
        yi = (start + k) % 8
        years = YOGINI_YEARS[yi]
        span = years * year_length
        maha = {"level": 1, "yogini": YOGINIS[yi], "lord": YOGINI_LORDS[YOGINIS[yi]],
                "years": years, "start": t, "end": t + span, "sub": []}
        if levels >= 2:
            st = t
            for j in range(8):
                sj = (yi + j) % 8
                sub_span = (years * YOGINI_YEARS[sj] / YOGINI_TOTAL) * year_length
                maha["sub"].append({"yogini": YOGINIS[sj], "lord": YOGINI_LORDS[YOGINIS[sj]],
                                    "start": st, "end": st + sub_span})
                st += sub_span
        dashas.append(maha)
        t += span
    return {"start_yogini": YOGINIS[start], "balance_years": (1.0 - elapsed) * y0,
            "dashas": dashas}


def yogini_active(moon_lon, natal_jd, target_jd, year_length=DASHA_YEAR):
    """The maha and antar yogini active at target_jd. None before the first
    period begins."""
    timeline = yogini_dashas(moon_lon, natal_jd, levels=2,
                             year_length=year_length, count=24)["dashas"]
    maha = next((p for p in timeline if p["start"] <= target_jd < p["end"]), None)
    if maha is None:
        return None
    antar = next((s for s in maha["sub"] if s["start"] <= target_jd < s["end"]), None)
    return {"maha": maha["yogini"], "antar": antar["yogini"] if antar else None}


def yogini_at(engine, natal_jd, target_jd, zodiac="sidereal:lahiri",
              year_length=DASHA_YEAR):
    """Yogini dasha active at target_jd, from the natal Moon's nakshatra.
    Returns {moon_nakshatra, start_yogini, maha, antar}."""
    moon_lon = engine.longitude("moon", natal_jd, zodiac=zodiac)
    nak = nakshatra(moon_lon)
    active = yogini_active(moon_lon, natal_jd, target_jd, year_length) or {}
    return {"moon_nakshatra": nak["name"],
            "start_yogini": YOGINIS[starting_yogini(nak["index"])], **active}
