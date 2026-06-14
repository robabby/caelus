"""astroengine.lots -- Hellenistic lots (Arabic parts), sect-aware.

A lot is an arc cast from the Ascendant equal to the arc between two chart
points, in a direction that reverses between a day chart and a night chart.
This is arithmetic on apparent longitudes already checked against Swiss
Ephemeris; no new ephemeris. The TS port (lots.ts) reproduces every value and
the golden fixtures pin the two together.

Conventions:
- A chart is diurnal when the Sun is above the horizon (``is_day_chart``).
- Every lot reverses by sect: the night formula swaps the two measured points.
- Fortune is the arc from the Ascendant equal to the Sun->Moon arc by day
  (Asc + Moon - Sun) and its mirror by night; Spirit is its reverse. The five
  further Hermetic lots are built from Fortune or Spirit and one planet, each
  likewise sect-reversed. A consequence worth checking: Fortune and Spirit are
  symmetric about the Ascendant, so (Fortune + Spirit) == 2*Asc (mod 360).
"""
from .derived import is_day_chart

# The seven Hermetic lots, in their conventional order.
HERMETIC_LOTS = ["fortune", "spirit", "eros", "necessity", "courage",
                 "victory", "nemesis"]


def _lot(asc, a, b, day):
    """Asc + (a - b) by day, Asc + (b - a) by night, wrapped to [0, 360)."""
    return (asc + (a - b if day else b - a)) % 360.0


def lot_fortune(asc, sun, moon, day):
    """Lot of Fortune: Asc + Moon - Sun by day, Asc + Sun - Moon by night."""
    return _lot(asc, moon, sun, day)


def lot_spirit(asc, sun, moon, day):
    """Lot of Spirit (the reverse of Fortune): Asc + Sun - Moon by day."""
    return _lot(asc, sun, moon, day)


def hermetic_lots(asc, day, sun, moon, mercury, venus, mars, jupiter, saturn):
    """The seven Hermetic lots from the Ascendant, sect, and the seven planets'
    longitudes (degrees). Pure arithmetic; returns a dict keyed by
    ``HERMETIC_LOTS``."""
    fortune = lot_fortune(asc, sun, moon, day)
    spirit = lot_spirit(asc, sun, moon, day)
    return {
        "fortune": fortune,
        "spirit": spirit,
        "eros": _lot(asc, venus, spirit, day),
        "necessity": _lot(asc, fortune, mercury, day),
        "courage": _lot(asc, fortune, mars, day),
        "victory": _lot(asc, jupiter, spirit, day),
        "nemesis": _lot(asc, fortune, saturn, day),
    }


def lots(engine, jd_ut, lat, lon_east, zodiac="tropical"):
    """The seven Hermetic lots of a chart: compute the Ascendant and sect, then
    the lots from the seven planets' longitudes. Returns ``{day, <lot>: lon}``."""
    asc = engine.chart_at(jd_ut, lat, lon_east, zodiac=zodiac)["angles"]["asc"]
    day = is_day_chart(engine, jd_ut, lat, lon_east)

    def lon(body):
        return engine.longitude(body, jd_ut, zodiac=zodiac)

    out = hermetic_lots(asc, day, lon("sun"), lon("moon"), lon("mercury"),
                        lon("venus"), lon("mars"), lon("jupiter"), lon("saturn"))
    return {"day": day, **out}
