/**
 * astroengine counterfactual -- a real chart, perturbed, and what changed.
 *
 * The `counterfactual` realm: take a resolved chart and ask "what if". Shift the
 * instant ("born an hour later") or the place -- a real ephemeris recompute --
 * or splice a body to a new longitude ("Mars in the next sign") -- a geometry
 * what-if that keeps everything else and recomputes the aspects it touches.
 * {@link chartDiff} reports the difference so the change is legible, not buried
 * in two full charts.
 */
import {
  Engine, Chart, ChartOptions, Aspect, Position, ChartBody, SIGNS, findAspects, DEFAULT_ORBS,
} from "./chart.js";
import { houseOf } from "./electional.js";
import { mod } from "./core.js";
import { parseOffset, AnchorRegistry } from "./provenance.js";
import { AnchoredChart, RealizedChart, realize } from "./anchored.js";

/** A perturbation of a resolved chart. */
export interface CounterfactualEdit {
  /** Shift the resolved instant by a duration (e.g. `"1h"`, `"-30m"`, `"P1D"`). */
  shiftTime?: string;
  /** Recompute at a different place. */
  place?: { lat: number; lonEast: number; altM?: number };
  /** Move bodies to given ecliptic longitudes (degrees), keeping everything else
   *  -- a geometry what-if. The moved body's house and the touched aspects are
   *  recomputed; the angles and other bodies are untouched. */
  setLongitudes?: Record<string, number>;
}

/** A body whose sign or house changed between two charts. */
export interface BodyChange {
  body: string;
  /** Signed degrees the body moved (`b` minus `a`). */
  dLon: number;
  signFrom: string; signTo: string;
  houseFrom: number; houseTo: number;
}

/** An angle whose sign changed. */
export interface AngleChange { angle: string; from: string; to: string }

/** What differs between two charts. */
export interface ChartDiff {
  /** Bodies whose sign or house changed. */
  bodies: BodyChange[];
  /** Aspects present in the variant but not the original. */
  aspectsGained: Aspect[];
  /** Aspects present in the original but not the variant. */
  aspectsLost: Aspect[];
  /** Angles whose sign changed. */
  angles: AngleChange[];
}

const signOf = (lon: number): string => SIGNS[Math.floor(mod(lon, 360) / 30)];
const aspectKey = (x: Aspect): string => `${[x.a, x.b].sort().join("~")}:${x.aspect}`;

/** Diff two charts: body sign/house shifts, aspects gained/lost, angle sign
 *  changes. Bodies and angles that did not change sign/house are omitted. */
export function chartDiff(a: Chart, b: Chart): ChartDiff {
  const bodies: BodyChange[] = [];
  for (const [name, pa] of Object.entries(a.bodies)) {
    const pb = b.bodies[name];
    if (!pa || !pb || (pa.sign === pb.sign && pa.house === pb.house)) continue;
    bodies.push({
      body: name, dLon: mod(pb.lon - pa.lon + 180, 360) - 180,
      signFrom: pa.sign, signTo: pb.sign, houseFrom: pa.house, houseTo: pb.house,
    });
  }
  const aset = new Set(a.aspects.map(aspectKey));
  const bset = new Set(b.aspects.map(aspectKey));
  const angles: AngleChange[] = [];
  for (const ang of ["asc", "mc", "vertex", "eastPoint"] as const) {
    const from = signOf(a.angles[ang]); const to = signOf(b.angles[ang]);
    if (from !== to) angles.push({ angle: ang, from, to });
  }
  return {
    bodies,
    aspectsGained: b.aspects.filter((x) => !aset.has(aspectKey(x))),
    aspectsLost: a.aspects.filter((x) => !bset.has(aspectKey(x))),
    angles,
  };
}

/** Splice bodies to new longitudes, recomputing their sign/house and the
 *  aspects (the angles and untouched bodies stay as they were). */
function spliceLongitudes(chart: Chart, overrides: Record<string, number>): Chart {
  const bodies: Record<string, ChartBody> = { ...(chart.bodies as Record<string, ChartBody>) };
  for (const [name, lon] of Object.entries(overrides)) {
    const cur = bodies[name];
    if (!cur) continue;
    const L = mod(lon, 360);
    bodies[name] = {
      ...cur, lon: L, sign: SIGNS[Math.floor(L / 30)], signDeg: L % 30,
      house: houseOf(L, chart.cusps),
    };
  }
  return {
    ...chart, bodies: bodies as Chart["bodies"],
    aspects: findAspects(bodies as Record<string, Position>, DEFAULT_ORBS),
  };
}

/** A counterfactual: a base chart and a perturbed variant, with the diff. */
export interface Counterfactual {
  edit: CounterfactualEdit;
  /** The realized base (its `chart` is the original). */
  original: RealizedChart;
  /** The perturbed chart, or null when the base had no chart to perturb. */
  variant: Chart | null;
  diff: ChartDiff | null;
  note: string;
}

/**
 * Realize an {@link AnchoredChart}, then apply a {@link CounterfactualEdit} and
 * diff the result -- "a real event, perturbed." A time/place edit recomputes the
 * ephemeris; a `setLongitudes` edit splices the geometry.
 *
 * @param engine The engine.
 * @param base The base chart to perturb (realized via {@link realize}).
 * @param edit The perturbation.
 * @param registry Anchor lookups for the base.
 * @param opts Chart options (house system, zodiac).
 * @returns A {@link Counterfactual}; `variant`/`diff` are null when the base
 *   produced no chart (e.g. a constraints-only form).
 */
export function counterfactual(
  engine: Engine, base: AnchoredChart, edit: CounterfactualEdit,
  registry: AnchorRegistry = {}, opts: ChartOptions = {},
): Counterfactual {
  const original = realize(engine, base, registry, opts);
  if (!original.chart) {
    return { edit, original, variant: null, diff: null, note: `nothing to perturb (${original.note})` };
  }
  const shiftsTimeOrPlace = edit.shiftTime !== undefined || edit.place !== undefined;
  let variant = original.chart;
  if (shiftsTimeOrPlace) {
    const off = edit.shiftTime !== undefined ? parseOffset(edit.shiftTime) : 0;
    if (Number.isNaN(off)) throw new Error(`unparseable shiftTime ${edit.shiftTime}`);
    const lat = edit.place?.lat ?? original.place.place?.lat ?? 0;
    const lon = edit.place?.lonEast ?? original.place.place?.lonEast ?? 0;
    variant = engine.chartAt(original.time.jd! + off, lat, lon, opts);
  }
  if (edit.setLongitudes) variant = spliceLongitudes(variant, edit.setLongitudes);
  const bits = [
    edit.shiftTime !== undefined ? `time ${edit.shiftTime}` : null,
    edit.place ? "place" : null,
    edit.setLongitudes ? `moved ${Object.keys(edit.setLongitudes).join(", ")}` : null,
  ].filter(Boolean);
  return {
    edit, original, variant, diff: chartDiff(original.chart, variant),
    note: bits.length ? `perturbed: ${bits.join("; ")}` : "no edit applied",
  };
}
