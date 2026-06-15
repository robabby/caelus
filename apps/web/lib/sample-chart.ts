import { Engine, julianDay } from "caelus";
import { embeddedData } from "caelus/data-embedded";

/**
 * One shared engine and one canonical sample natal for the docs illustrations.
 *
 * Every figure on the guide pages is server-rendered at build time from this
 * single instant, so the numbers in the prose, the code samples, and the
 * rendered output all agree, and the page is deterministic (no client compute,
 * no hydration mismatch). The instant is the same one the code samples use
 * throughout the docs: 1990-06-10 14:30 UT, Tampa, Florida.
 */
export const sampleEngine = new Engine(embeddedData);

export const SAMPLE = {
  y: 1990, mo: 6, d: 10, h: 14, mi: 30,
  lat: 27.95, lon: -82.46,
  place: "Tampa, FL",
  label: "10 Jun 1990, 14:30 UT",
} as const;

/** Natal Julian Day (UT) of the sample chart. */
export const SAMPLE_JD = julianDay(SAMPLE.y, SAMPLE.mo, SAMPLE.d, SAMPLE.h, SAMPLE.mi);

/** A fixed "today" used by the time-lord and derived figures, so the active
 *  period a figure highlights never drifts as the site is rebuilt. */
export const TARGET = { y: 2026, mo: 6, d: 13 } as const;
export const TARGET_JD = julianDay(TARGET.y, TARGET.mo, TARGET.d);

/** The sample natal chart, tropical / Placidus. */
export const sampleChart = sampleEngine.chartAt(SAMPLE_JD, SAMPLE.lat, SAMPLE.lon, "placidus");

/** UT calendar date (YYYY-MM-DD) of a Julian Day. */
export function jdToDate(jd: number): string {
  return new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 10);
}

/** UT date and minute (YYYY-MM-DD HH:MM) of a Julian Day. */
export function jdToMinute(jd: number): string {
  return new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 16).replace("T", " ");
}
