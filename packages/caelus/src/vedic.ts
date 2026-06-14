/**
 * astroengine vedic -- the Vedic/Jyotish layer: nakshatras and the Vimshottari
 * dasha, built on the already-validated sidereal longitudes.
 *
 * A nakshatra is one of 27 equal lunar mansions of 13 deg 20' in the sidereal
 * zodiac, each with four padas and a ruling planet cycling Ketu, Venus, Sun,
 * Moon, Mars, Rahu, Jupiter, Saturn, Mercury. The Vimshottari dasha is a
 * 120-year sequence of planetary periods in that order; the starting dasha is
 * the lord of the Moon's birth nakshatra, with the elapsed portion set by how
 * far the Moon has moved through it. Mahadashas subdivide into antardashas and
 * pratyantardashas of the nine lords, proportional to their years. Nakshatra
 * placement is exact division of the sidereal longitude; the dasha year is a
 * fixed 365.25 days by default (the common Jyotish convention). Mirrors the
 * Python reference (astroengine/vedic.py); the golden fixtures pin the two.
 */
import { Engine, BodyId, Zodiac } from "./chart.js";

export const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
  "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
  "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha",
  "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
  "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
] as const;

/** The Vimshottari order and each lord's period in years (totalling 120). */
export const VIMSHOTTARI_ORDER = [
  "ketu", "venus", "sun", "moon", "mars", "rahu", "jupiter", "saturn", "mercury",
] as const;
export const VIMSHOTTARI_YEARS: Record<(typeof VIMSHOTTARI_ORDER)[number], number> = {
  ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17,
};

export const NAK_SPAN = 360 / 27; // 13 deg 20'
const VIMSHOTTARI_TOTAL = 120;
export const DASHA_YEAR = 365.25; // days per dasha-year (common Jyotish convention)

function mod360(x: number): number {
  return ((x % 360) + 360) % 360;
}

export interface Nakshatra {
  index: number;
  name: string;
  pada: number;
  lord: string;
  /** Degrees into the nakshatra, 0..13.333. */
  pos: number;
}

/** The nakshatra of a sidereal longitude. */
export function nakshatra(siderealLon: number): Nakshatra {
  const lon = mod360(siderealLon);
  const i = Math.floor(lon / NAK_SPAN) % 27;
  const pos = lon - i * NAK_SPAN;
  const pada = Math.floor(pos / (NAK_SPAN / 4)) + 1;
  return { index: i, name: NAKSHATRAS[i], pada, lord: VIMSHOTTARI_ORDER[i % 9], pos };
}

/** The nakshatra of a body (default the Moon) at jd, in a sidereal zodiac. */
export function nakshatraAt(
  engine: Engine, jdUt: number, body: BodyId = "moon", zodiac: Zodiac = "sidereal:lahiri",
): Nakshatra {
  return nakshatra(engine.longitude(body, jdUt, { zodiac }));
}

export interface DashaSub { lord: string; start: number; end: number; }
export interface Dasha { level: number; lord: string; start: number; end: number; sub: DashaSub[]; }
export interface DashaTimeline { start_lord: string; balance_years: number; dashas: Dasha[]; }

/** The Vimshottari dasha timeline from the Moon's sidereal longitude. */
export function vimshottariDashas(
  moonLon: number, natalJd: number, levels = 2, yearLength = DASHA_YEAR, count = 9,
): DashaTimeline {
  const lon = mod360(moonLon);
  const nakI = Math.floor(lon / NAK_SPAN) % 27;
  const pos = lon - nakI * NAK_SPAN;
  const startLord = VIMSHOTTARI_ORDER[nakI % 9];
  const elapsed = pos / NAK_SPAN;
  const y0 = VIMSHOTTARI_YEARS[startLord];
  const li = (VIMSHOTTARI_ORDER as readonly string[]).indexOf(startLord);
  let t = natalJd - elapsed * y0 * yearLength;
  const dashas: Dasha[] = [];
  for (let k = 0; k < count; k++) {
    const lord = VIMSHOTTARI_ORDER[(li + k) % 9];
    const years = VIMSHOTTARI_YEARS[lord];
    const span = years * yearLength;
    const maha: Dasha = { level: 1, lord, start: t, end: t + span, sub: [] };
    if (levels >= 2) {
      const sli = (VIMSHOTTARI_ORDER as readonly string[]).indexOf(lord);
      let st = t;
      for (let j = 0; j < 9; j++) {
        const sl = VIMSHOTTARI_ORDER[(sli + j) % 9];
        const subSpan = (years * VIMSHOTTARI_YEARS[sl] / VIMSHOTTARI_TOTAL) * yearLength;
        maha.sub.push({ lord: sl, start: st, end: st + subSpan });
        st += subSpan;
      }
    }
    dashas.push(maha);
    t += span;
  }
  return { start_lord: startLord, balance_years: (1 - elapsed) * y0, dashas };
}

function activeIn<T extends { start: number; end: number }>(periods: T[], target: number): T | null {
  return periods.find((p) => p.start <= target && target < p.end) ?? null;
}

export interface DashaActive { maha: string; antar: string | null; pratyantar: string | null; }

/** The mahadasha, antardasha, and pratyantardasha lords active at targetJd. */
export function vimshottariActive(
  moonLon: number, natalJd: number, targetJd: number, yearLength = DASHA_YEAR,
): DashaActive | null {
  const timeline = vimshottariDashas(moonLon, natalJd, 2, yearLength, 10).dashas;
  const maha = activeIn(timeline, targetJd);
  if (maha === null) return null;
  const antar = activeIn(maha.sub, targetJd);
  if (antar === null) return { maha: maha.lord, antar: null, pratyantar: null };
  const ay = VIMSHOTTARI_YEARS[maha.lord as keyof typeof VIMSHOTTARI_YEARS]
    * VIMSHOTTARI_YEARS[antar.lord as keyof typeof VIMSHOTTARI_YEARS] / VIMSHOTTARI_TOTAL;
  const sli = (VIMSHOTTARI_ORDER as readonly string[]).indexOf(antar.lord);
  let st = antar.start;
  let pratyantar: string | null = null;
  for (let j = 0; j < 9; j++) {
    const sl = VIMSHOTTARI_ORDER[(sli + j) % 9];
    const span = (ay * VIMSHOTTARI_YEARS[sl] / VIMSHOTTARI_TOTAL) * yearLength;
    if (st <= targetJd && targetJd < st + span) { pratyantar = sl; break; }
    st += span;
  }
  return { maha: maha.lord, antar: antar.lord, pratyantar };
}

/** Vimshottari dasha active at targetJd, from the natal Moon's nakshatra. */
export function vimshottariAt(
  engine: Engine, natalJd: number, targetJd: number,
  zodiac: Zodiac = "sidereal:lahiri", yearLength = DASHA_YEAR,
): { moon_nakshatra: string; moon_pada: number; start_lord: string } & Partial<DashaActive> {
  const moonLon = engine.longitude("moon", natalJd, { zodiac });
  const nak = nakshatra(moonLon);
  const active = vimshottariActive(moonLon, natalJd, targetJd, yearLength) ?? {};
  return {
    moon_nakshatra: nak.name, moon_pada: nak.pada,
    start_lord: VIMSHOTTARI_ORDER[nak.index % 9], ...active,
  };
}
