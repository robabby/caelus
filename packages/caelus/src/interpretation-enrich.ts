/**
 * Enrich an {@link interpretationContext} with diachronic and Vedic facts at a
 * target instant — transits, time-lords, nakshatras, vargas, yogas.
 */
import { BODIES, type BodyId, type Chart, type Engine, type Zodiac } from "./chart.js";
import type { ContextOptions } from "./interpretation.js";
import { firdariaAt } from "./firdaria.js";
import { profectionAt } from "./profections.js";
import { zrAt } from "./releasing.js";
import {
  compositePlacements, synastryAspects, synastryOverlays, transitAspects,
} from "./relational.js";
import { vimshottariAt } from "./vedic.js";
import { yogasAt } from "./yogas.js";

export interface EnrichTarget {
  jd: number;
  lat: number;
  lonEast: number;
  zodiac?: Zodiac;
}

export interface EnrichFlags {
  /** Project transit-to-natal aspects. Default true. */
  transits?: boolean;
  /** Project profection, ZR, firdaria, dasha. Default true. */
  timelords?: boolean;
  /** Project nakshatras, D9, yogas. Default true when chart zodiac is sidereal. */
  vedic?: boolean;
  /** Max orb for transit aspects. Default 3. */
  transitOrb?: number;
}

/**
 * Build {@link ContextOptions} extras for a natal chart evaluated at `target`.
 * Merge the result into `interpretationContext(chart, { ...base, ...extras })`.
 */
export function enrichContextOptions(
  engine: Engine, chart: Chart, target: EnrichTarget,
  flags: EnrichFlags = {},
): Pick<ContextOptions, "transits" | "timelords" | "vedic"> {
  const zodiac = target.zodiac ?? chart.zodiac;
  const { lat, lonEast } = target;
  const out: Pick<ContextOptions, "transits" | "timelords" | "vedic"> = {};

  if (flags.transits !== false) {
    out.transits = transitAspects(chart, engine, target.jd, {
      maxOrb: flags.transitOrb ?? 3, zodiac,
    });
  }

  if (flags.timelords !== false) {
    const prof = profectionAt(engine, chart.jdUt, target.jd, lat, lonEast, zodiac);
    const zr = zrAt(engine, chart.jdUt, target.jd, lat, lonEast);
    const fir = firdariaAt(engine, chart.jdUt, target.jd, lat, lonEast);
    const dasha = vimshottariAt(engine, chart.jdUt, target.jd, "sidereal:lahiri");
    out.timelords = {
      profection: prof,
      zr: {
        l1: zr.l1!, l2: zr.l2!, l3: zr.l3!, l4: zr.l4!, lot: zr.lot,
      },
      firdaria: { major: fir.major, sub: fir.sub, day: fir.day },
      dasha: {
        maha: dasha.maha!, antar: dasha.antar ?? null,
        pratyantar: dasha.pratyantar ?? null, moon_nakshatra: dasha.moon_nakshatra,
      },
    };
  }

  const wantVedic = flags.vedic ?? zodiac.startsWith("sidereal");
  if (wantVedic) {
    out.vedic = {
      nakshatraBodies: ["moon", "sun", "mars", "mercury", "jupiter", "venus", "saturn"],
      vargas: [9],
      yogas: yogasAt(engine, chart.jdUt, lat, lonEast, "sidereal:lahiri"),
    };
  }

  return out;
}

/** Synastry and composite atoms for two natal charts (A is the projection base). */
export function enrichSynastryOptions(
  engine: Engine, chartA: Chart, chartB: Chart,
  opts: { orb?: number; zodiac?: Zodiac } = {},
): Pick<ContextOptions, "synastry" | "composite"> {
  const orb = opts.orb ?? 4;
  const zodiac = opts.zodiac ?? chartA.zodiac;
  return {
    synastry: {
      aspects: synastryAspects(chartA, chartB, orb),
      overlays: synastryOverlays(chartA, chartB),
    },
    composite: compositePlacements(
      engine, chartA.jdUt, chartB.jdUt, BODIES as unknown as BodyId[], zodiac,
    ),
  };
}
