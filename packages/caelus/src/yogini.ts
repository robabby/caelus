/**
 * astroengine yogini -- the Yogini dasha, a 36-year nakshatra-based dasha cycle.
 *
 * Eight yoginis rule in a fixed order with periods 1..8 years (totalling 36):
 * Mangala (Moon) 1, Pingala (Sun) 2, Dhanya (Jupiter) 3, Bhramari (Mars) 4,
 * Bhadrika (Mercury) 5, Ulka (Saturn) 6, Siddha (Venus) 7, Sankata (Rahu) 8.
 * The starting yogini comes from the Moon's birth nakshatra: (nakshatra number
 * + 3) mod 8, a remainder of 0 meaning the 8th. As in Vimshottari, the elapsed
 * portion of the first period is the fraction of the nakshatra the Moon has
 * traversed, and each period subdivides into eight proportional sub-periods.
 * Mirrors the Python reference (astroengine/yogini.py); the golden fixtures pin
 * the two together.
 */
import { Engine, Zodiac } from "./chart.js";
import { nakshatra, NAK_SPAN, DASHA_YEAR } from "./vedic.js";

export const YOGINIS = [
  "Mangala", "Pingala", "Dhanya", "Bhramari", "Bhadrika", "Ulka", "Siddha", "Sankata",
] as const;
export const YOGINI_LORDS: Record<(typeof YOGINIS)[number], string> = {
  Mangala: "moon", Pingala: "sun", Dhanya: "jupiter", Bhramari: "mars",
  Bhadrika: "mercury", Ulka: "saturn", Siddha: "venus", Sankata: "rahu",
};
/** Period in years by yogini index (Mangala..Sankata), totalling 36. */
export const YOGINI_YEARS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const YOGINI_TOTAL = 36;

/** 0-based starting yogini index from the Moon's nakshatra index (0-based):
 *  (nakshatra number + 3) mod 8, a remainder of 0 mapping to the 8th. */
export function startingYogini(nakIndex: number): number {
  const y = (nakIndex + 1 + 3) % 8; // nakshatra number is 1-based
  return ((y - 1) % 8 + 8) % 8;     // remainder 0 -> 8th (index 7)
}

export interface YoginiSub { yogini: string; lord: string; start: number; end: number; }
export interface YoginiPeriod {
  level: number; yogini: string; lord: string; years: number;
  start: number; end: number; sub: YoginiSub[];
}
export interface YoginiTimeline { start_yogini: string; balance_years: number; dashas: YoginiPeriod[]; }

/** The Yogini dasha timeline from the Moon's sidereal longitude. */
export function yoginiDashas(
  moonLon: number, natalJd: number, levels = 2, yearLength = DASHA_YEAR, count = 8,
): YoginiTimeline {
  const nak = nakshatra(moonLon);
  const start = startingYogini(nak.index);
  const elapsed = nak.pos / NAK_SPAN;
  const y0 = YOGINI_YEARS[start];
  let t = natalJd - elapsed * y0 * yearLength;
  const dashas: YoginiPeriod[] = [];
  for (let k = 0; k < count; k++) {
    const yi = (start + k) % 8;
    const years = YOGINI_YEARS[yi];
    const span = years * yearLength;
    const maha: YoginiPeriod = {
      level: 1, yogini: YOGINIS[yi], lord: YOGINI_LORDS[YOGINIS[yi]],
      years, start: t, end: t + span, sub: [],
    };
    if (levels >= 2) {
      let st = t;
      for (let j = 0; j < 8; j++) {
        const sj = (yi + j) % 8;
        const subSpan = (years * YOGINI_YEARS[sj] / YOGINI_TOTAL) * yearLength;
        maha.sub.push({ yogini: YOGINIS[sj], lord: YOGINI_LORDS[YOGINIS[sj]], start: st, end: st + subSpan });
        st += subSpan;
      }
    }
    dashas.push(maha);
    t += span;
  }
  return { start_yogini: YOGINIS[start], balance_years: (1 - elapsed) * y0, dashas };
}

export interface YoginiActive { maha: string; antar: string | null; }

/** The maha and antar yogini active at targetJd; null before the first period. */
export function yoginiActive(
  moonLon: number, natalJd: number, targetJd: number, yearLength = DASHA_YEAR,
): YoginiActive | null {
  const timeline = yoginiDashas(moonLon, natalJd, 2, yearLength, 24).dashas;
  const maha = timeline.find((p) => p.start <= targetJd && targetJd < p.end);
  if (!maha) return null;
  const antar = maha.sub.find((s) => s.start <= targetJd && targetJd < s.end);
  return { maha: maha.yogini, antar: antar ? antar.yogini : null };
}

/** Yogini dasha active at targetJd, from the natal Moon's nakshatra. */
export function yoginiAt(
  engine: Engine, natalJd: number, targetJd: number,
  zodiac: Zodiac = "sidereal:lahiri", yearLength = DASHA_YEAR,
): { moon_nakshatra: string; start_yogini: string } & Partial<YoginiActive> {
  const moonLon = engine.longitude("moon", natalJd, { zodiac });
  const nak = nakshatra(moonLon);
  const active = yoginiActive(moonLon, natalJd, targetJd, yearLength) ?? {};
  return { moon_nakshatra: nak.name, start_yogini: YOGINIS[startingYogini(nak.index)], ...active };
}
