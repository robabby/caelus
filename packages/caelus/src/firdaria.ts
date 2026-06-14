/**
 * astroengine firdaria -- the Persian/medieval system of planetary time-lord
 * periods (firdariyyat).
 *
 * Life divides into nine periods totalling 75 years: the seven planets in the
 * firdaria order, then the two lunar nodes. A day chart begins with the Sun, a
 * night chart with the Moon; both follow the same cycle (Sun, Venus, Mercury,
 * Moon, Saturn, Jupiter, Mars) and close with the North and South Nodes. Each
 * planetary period splits into seven equal sub-periods led by the seven planets
 * from that period's lord; node periods have no sub-divisions. Pure time
 * arithmetic on the natal moment and the chart's sect. Mirrors the Python
 * reference (astroengine/firdaria.py); the golden fixtures pin the two together.
 */
import { Engine } from "./chart.js";
import { TROPICAL_YEAR, isDayChart } from "./derived.js";

/** The firdaria cycle of the seven planets. */
export const FIRDARIA_ORDER = [
  "sun", "venus", "mercury", "moon", "saturn", "jupiter", "mars",
] as const;

/** Period length in years for each of the seven planets. */
export const FIRDARIA_YEARS: Record<(typeof FIRDARIA_ORDER)[number], number> = {
  sun: 10, venus: 8, mercury: 13, moon: 9, saturn: 11, jupiter: 12, mars: 7,
};

/** The two nodes close the sequence with no sub-periods (70 + 5 = 75 years). */
export const NODE_PERIODS: ReadonlyArray<readonly [string, number]> = [
  ["north_node", 3], ["south_node", 2],
];

/** The nine major firdaria periods in order, as `[lord, years]` pairs. */
export function firdariaSequence(day: boolean): Array<[string, number]> {
  const start = day ? 0 : FIRDARIA_ORDER.indexOf("moon");
  const planets: Array<[string, number]> = [];
  for (let i = 0; i < 7; i++) {
    const lord = FIRDARIA_ORDER[(start + i) % 7];
    planets.push([lord, FIRDARIA_YEARS[lord]]);
  }
  return [...planets, ...NODE_PERIODS.map((p) => [p[0], p[1]] as [string, number])];
}

export interface FirdariaSub { lord: string; start: number; end: number; }
export interface FirdariaPeriod {
  lord: string;
  years: number;
  start: number;
  end: number;
  sub: FirdariaSub[];
}

/** The full firdaria timeline from birth. */
export function firdaria(
  day: boolean, natalJd: number, yearLength = TROPICAL_YEAR,
): FirdariaPeriod[] {
  const out: FirdariaPeriod[] = [];
  let t = natalJd;
  for (const [lord, years] of firdariaSequence(day)) {
    const span = years * yearLength;
    const major: FirdariaPeriod = { lord, years, start: t, end: t + span, sub: [] };
    const li = (FIRDARIA_ORDER as readonly string[]).indexOf(lord);
    if (li >= 0) {
      const subSpan = span / 7;
      let st = t;
      for (let k = 0; k < 7; k++) {
        const sl = FIRDARIA_ORDER[(li + k) % 7];
        major.sub.push({ lord: sl, start: st, end: st + subSpan });
        st += subSpan;
      }
    }
    out.push(major);
    t += span;
  }
  return out;
}

/** The major and sub firdar lord active at `targetJd`; both null outside the
 *  75-year span. */
export function firdariaActive(
  day: boolean, natalJd: number, targetJd: number, yearLength = TROPICAL_YEAR,
): { major: string | null; sub: string | null } {
  for (const major of firdaria(day, natalJd, yearLength)) {
    if (major.start <= targetJd && targetJd < major.end) {
      const sub = major.sub.find((s) => s.start <= targetJd && targetJd < s.end);
      return { major: major.lord, sub: sub ? sub.lord : null };
    }
  }
  return { major: null, sub: null };
}

/** The active firdar at `targetJd`, taking the chart's sect from the natal
 *  moment and place. */
export function firdariaAt(
  engine: Engine, natalJd: number, targetJd: number, lat: number, lonEast: number,
  yearLength = TROPICAL_YEAR,
): { day: boolean; major: string | null; sub: string | null } {
  const day = isDayChart(engine, natalJd, lat, lonEast);
  return { day, ...firdariaActive(day, natalJd, targetJd, yearLength) };
}
