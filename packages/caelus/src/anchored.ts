/**
 * astroengine anchored charts -- realize a {@link Realm} + anchors into a chart.
 *
 * This is where the provenance layer meets the two generators. Given what a
 * chart *is* and how its time/place are anchored, {@link realize} routes:
 * when an instant can be resolved it runs the ephemeris (`chartAt`); when it
 * cannot but constraints are supplied it runs the compiler's symbolic synthesis
 * (`compileForm`); otherwise it reports that nothing could be computed and why.
 * The realm rides along as framing for the interpretation layer.
 */
import { Engine, Chart, ChartOptions } from "./chart.js";
import { compileForm, CompiledForm, Constraint } from "./compiler.js";
import {
  Realm, TemporalAnchor, SpatialAnchor, AnchorRegistry,
  ResolvedTime, ResolvedPlace, resolveTime, resolvePlace, isTimeAnchored,
} from "./provenance.js";

/** A chart described by its realm and anchors, not a bare (instant, place). */
export interface AnchoredChart {
  realm: Realm;
  when: TemporalAnchor;
  where?: SpatialAnchor;
  /** Constraints for the compiler path -- a chart with no instant
   *  (archetypal / conceptual / symbolic). */
  constraints?: Constraint[];
}

/** The outcome of {@link realize}: how (or whether) a chart was produced. */
export interface RealizedChart {
  realm: Realm;
  /** `ephemeris` (an instant resolved), `compiler` (synthesized from
   *  constraints), or `none` (neither was possible). */
  via: "ephemeris" | "compiler" | "none";
  time: ResolvedTime;
  place: ResolvedPlace;
  /** The computed chart, when an instant was available. */
  chart: Chart | null;
  /** The synthesized form, when the compiler path ran. */
  form: CompiledForm | null;
  note: string;
}

/**
 * Realize an {@link AnchoredChart}: resolve its anchors and run the appropriate
 * generator. A resolvable instant always wins (the realm is then just framing);
 * failing that, constraints synthesize a form; failing both, nothing computes.
 *
 * @param engine The engine for the ephemeris path.
 * @param anchored The realm + temporal/spatial anchors (+ optional constraints).
 * @param registry Lookups for relative/narrative/named anchors.
 * @param opts Chart options (house system, zodiac) for the ephemeris path.
 * @returns A {@link RealizedChart}; `chart`/`form` are null on the paths that
 *   did not run.
 */
export function realize(
  engine: Engine, anchored: AnchoredChart,
  registry: AnchorRegistry = {}, opts: ChartOptions = {},
): RealizedChart {
  const time = resolveTime(anchored.when, registry);
  const place = resolvePlace(
    anchored.where ?? { kind: "none", reason: "intentionally_unset" }, registry,
  );
  const base = { realm: anchored.realm, time, place };

  if (time.jd !== null) {
    const chart = engine.chartAt(time.jd, place.place?.lat ?? 0, place.place?.lonEast ?? 0, opts);
    return {
      ...base, via: "ephemeris", chart, form: null,
      note: `ephemeris (${time.certainty}) `
        + (place.place ? `at ${place.note ?? "given coordinates"}` : "no place; houses nominal at 0,0"),
    };
  }
  if (anchored.constraints?.length) {
    const form = compileForm(anchored.constraints);
    return {
      ...base, via: "compiler", chart: null, form,
      note: `compiler synthesis (${form.impossible ? "impossible form" : `residual ${form.residual.toFixed(2)}`})`,
    };
  }
  return {
    ...base, via: "none", chart: null, form: null,
    note: isTimeAnchored(anchored.realm)
      ? `time-anchored realm but no instant resolved (${time.note ?? "no time"}); supply a resolvable anchor or constraints`
      : `${anchored.realm} realm has no instant; supply constraints to synthesize a form`,
  };
}
