/**
 * astroengine lots -- Hellenistic lots (Arabic parts), sect-aware.
 *
 * A lot is an arc cast from the Ascendant equal to the arc between two chart
 * points, reversing direction between a day and a night chart. Arithmetic on
 * apparent longitudes already checked against Swiss Ephemeris. Mirrors the
 * Python reference (astroengine/lots.py); the golden fixtures pin the two
 * together. Fortune and Spirit are symmetric about the Ascendant, so
 * `(fortune + spirit) === 2 * asc` (mod 360).
 */
import { mod } from "./core.js";
import { Engine, BodyId, Zodiac } from "./chart.js";
import { isDayChart } from "./derived.js";

/** The seven Hermetic lots, in their conventional order. */
export const HERMETIC_LOTS = [
  "fortune", "spirit", "eros", "necessity", "courage", "victory", "nemesis",
] as const;
export type HermeticLot = (typeof HERMETIC_LOTS)[number];

/** Asc + (a - b) by day, Asc + (b - a) by night, wrapped to [0, 360). */
function lot(asc: number, a: number, b: number, day: boolean): number {
  return mod(asc + (day ? a - b : b - a), 360);
}

/** Lot of Fortune: Asc + Moon - Sun by day, Asc + Sun - Moon by night. */
export function lotFortune(asc: number, sun: number, moon: number, day: boolean): number {
  return lot(asc, moon, sun, day);
}

/** Lot of Spirit (the reverse of Fortune): Asc + Sun - Moon by day. */
export function lotSpirit(asc: number, sun: number, moon: number, day: boolean): number {
  return lot(asc, sun, moon, day);
}

/** The seven Hermetic lots from the Ascendant, sect, and the seven planets'
 *  longitudes (degrees). Pure arithmetic. */
export function hermeticLots(
  asc: number, day: boolean,
  sun: number, moon: number, mercury: number, venus: number,
  mars: number, jupiter: number, saturn: number,
): Record<HermeticLot, number> {
  const fortune = lotFortune(asc, sun, moon, day);
  const spirit = lotSpirit(asc, sun, moon, day);
  return {
    fortune,
    spirit,
    eros: lot(asc, venus, spirit, day),
    necessity: lot(asc, fortune, mercury, day),
    courage: lot(asc, fortune, mars, day),
    victory: lot(asc, jupiter, spirit, day),
    nemesis: lot(asc, fortune, saturn, day),
  };
}

export interface ChartLots extends Record<HermeticLot, number> {
  /** True when the Sun is above the horizon (a diurnal chart). */
  day: boolean;
}

/** The seven Hermetic lots of a chart: compute the Ascendant and sect, then the
 *  lots from the seven planets' longitudes. */
export function lots(
  engine: Engine, jdUt: number, lat: number, lonEast: number,
  zodiac: Zodiac = "tropical",
): ChartLots {
  const asc = engine.chartAt(jdUt, lat, lonEast, { zodiac }).angles.asc;
  const day = isDayChart(engine, jdUt, lat, lonEast);
  const lon = (b: BodyId) => engine.longitude(b, jdUt, { zodiac });
  const h = hermeticLots(
    asc, day, lon("sun"), lon("moon"), lon("mercury"), lon("venus"),
    lon("mars"), lon("jupiter"), lon("saturn"),
  );
  return { day, ...h };
}
