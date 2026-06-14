"""astroengine.firdaria -- firdaria (firdariyyat), the Persian/medieval system
of planetary time-lord periods.

Life is divided into nine periods totalling 75 years: the seven planets in the
firdaria order, then the two lunar nodes. A day chart begins with the Sun, a
night chart with the Moon; both then follow the same cycle
(Sun, Venus, Mercury, Moon, Saturn, Jupiter, Mars) and close with the North and
South Nodes. Each planetary period is divided into seven equal sub-periods led
by the seven planets from that period's lord; the node periods have no
sub-divisions. Pure time arithmetic on the natal moment and the chart's sect --
no ephemeris beyond the day/night determination. The TS port (firdaria.ts)
reproduces every value and the golden fixtures pin the two together.

The period year is a fixed length (the tropical year by default).
"""
from .derived import TROPICAL_YEAR, is_day_chart

# The firdaria cycle of the seven planets, and their period lengths in years.
FIRDARIA_ORDER = ["sun", "venus", "mercury", "moon", "saturn", "jupiter", "mars"]
FIRDARIA_YEARS = {"sun": 10, "venus": 8, "mercury": 13, "moon": 9,
                  "saturn": 11, "jupiter": 12, "mars": 7}
# The two nodes close the sequence; no sub-periods. Totals 70 + 5 = 75 years.
NODE_PERIODS = [("north_node", 3), ("south_node", 2)]


def firdaria_sequence(day):
    """The nine major firdaria periods in order, as ``(lord, years)`` pairs. A
    day chart starts at the Sun, a night chart at the Moon; both follow the
    firdaria cycle, then the two nodes."""
    start = 0 if day else FIRDARIA_ORDER.index("moon")
    planets = [(FIRDARIA_ORDER[(start + i) % 7],
                FIRDARIA_YEARS[FIRDARIA_ORDER[(start + i) % 7]]) for i in range(7)]
    return planets + list(NODE_PERIODS)


def firdaria(day, natal_jd, year_length=TROPICAL_YEAR):
    """The full firdaria timeline from birth. Each planetary period is split into
    seven equal sub-periods led by the seven planets from that period's lord;
    node periods have no sub-periods. Returns a list of
    ``{lord, years, start, end, sub: [{lord, start, end}]}``."""
    out = []
    t = natal_jd
    for lord, years in firdaria_sequence(day):
        span = years * year_length
        major = {"lord": lord, "years": years, "start": t, "end": t + span, "sub": []}
        if lord in FIRDARIA_YEARS:
            sub_span = span / 7.0
            li = FIRDARIA_ORDER.index(lord)
            st = t
            for k in range(7):
                sl = FIRDARIA_ORDER[(li + k) % 7]
                major["sub"].append({"lord": sl, "start": st, "end": st + sub_span})
                st += sub_span
        out.append(major)
        t += span
    return out


def firdaria_active(day, natal_jd, target_jd, year_length=TROPICAL_YEAR):
    """The major and sub firdar lord active at ``target_jd``. Both are None
    before birth or after the 75-year span."""
    for major in firdaria(day, natal_jd, year_length):
        if major["start"] <= target_jd < major["end"]:
            sub = next((s["lord"] for s in major["sub"]
                        if s["start"] <= target_jd < s["end"]), None)
            return {"major": major["lord"], "sub": sub}
    return {"major": None, "sub": None}


def firdaria_at(engine, natal_jd, target_jd, lat, lon_east,
                year_length=TROPICAL_YEAR):
    """The active firdar at ``target_jd``, taking the chart's sect from the natal
    moment and place. Returns ``{day, major, sub}``."""
    day = is_day_chart(engine, natal_jd, lat, lon_east)
    return {"day": day, **firdaria_active(day, natal_jd, target_jd, year_length)}
