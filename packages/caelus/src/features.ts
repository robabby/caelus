/**
 * astroengine features -- a chart as a feature vector, similarity between
 * charts, and search for when the sky most resembles a target configuration.
 *
 * Each body's ecliptic longitude is circular, so it contributes a unit-circle
 * point (cos, sin), optionally weighted. Cosine similarity between two such
 * vectors is a weighted mean of cos(delta-longitude) per body: 1 when the
 * configurations coincide, falling off as bodies diverge. The deterministic
 * substrate for matching, retrieving, and searching chart configurations.
 * Mirrors the Python reference (astroengine/features.py); the golden pins them.
 */
import { DEG } from "./core.js";
import { Engine, BodyId, Zodiac } from "./chart.js";
import { rankMoments, RankedMoment } from "./scan.js";

export const DEFAULT_BODIES = ["sun", "moon", "mercury", "venus", "mars",
  "jupiter", "saturn", "uranus", "neptune", "pluto"];

/**
 * Build a feature vector from explicit `(longitude, weight)` pairs: each pair
 * contributes a weighted unit-circle point `[w·cos(lon), w·sin(lon)]`. The
 * low-level primitive behind {@link chartFeatures}; most callers want that.
 *
 * @param weightedLons `[longitudeDeg, weight]` pairs, in the order they should
 *   appear in the vector.
 * @returns A flat vector, two entries per pair.
 */
export function featureVector(weightedLons: [number, number][]): number[] {
  const out: number[] = [];
  for (const [lon, w] of weightedLons) {
    const r = lon * DEG;
    out.push(w * Math.cos(r), w * Math.sin(r));
  }
  return out;
}

/**
 * Cosine similarity of two feature vectors, in `[-1, 1]`. For vectors from
 * {@link chartFeatures} this is a weighted mean of `cos(Δlongitude)` per body:
 * `1` when the configurations coincide, falling off as bodies diverge.
 *
 * @param a First feature vector.
 * @param b Second feature vector (compared over the shorter length).
 * @returns Similarity in `[-1, 1]`; `0` if either vector is all zeros.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface FeatureOptions {
  bodies?: BodyId[];
  weights?: Record<string, number>;
  zodiac?: Zodiac;
}

/**
 * Encode the sky at an instant as a feature vector: each body's ecliptic
 * longitude becomes a weighted unit-circle point. The deterministic substrate
 * for matching and searching chart configurations — compare two with
 * {@link cosineSimilarity}, or rank a time range against one with
 * {@link searchConfigurations}.
 *
 * @param engine The engine used to evaluate positions.
 * @param jdUt Julian Day in UT.
 * @param opts `bodies` (ordered; defaults to the ten major bodies), per-body
 *   `weights`, and `zodiac` (tropical by default).
 * @returns A flat vector `[w·cos(lon), w·sin(lon), ...]`, two entries per body
 *   in `bodies` order.
 * @example
 * ```ts
 * const target = chartFeatures(engine, julianDay(2000, 1, 1));
 * const now = chartFeatures(engine, julianDay(2025, 6, 1));
 * cosineSimilarity(now, target); // 1 = identical configuration
 * ```
 */
export function chartFeatures(engine: Engine, jdUt: number, opts: FeatureOptions = {}): number[] {
  const bodies = opts.bodies ?? (DEFAULT_BODIES as BodyId[]);
  const zodiac = opts.zodiac ?? "tropical";
  const wl: [number, number][] = bodies.map((b) => [
    engine.longitude(b, jdUt, { zodiac }),
    opts.weights?.[b] ?? 1.0,
  ]);
  return featureVector(wl);
}

/**
 * Similarity between the sky at `jdUt` and a target feature vector — shorthand
 * for `cosineSimilarity(chartFeatures(engine, jdUt, opts), target)`. The scoring
 * function {@link searchConfigurations} maximizes.
 *
 * @param engine The engine used to evaluate positions.
 * @param jdUt Julian Day in UT.
 * @param target A target feature vector from {@link chartFeatures}.
 * @param opts {@link FeatureOptions} — must match those used to build `target`.
 * @returns Cosine similarity in `[-1, 1]`.
 */
export function configurationFit(
  engine: Engine, jdUt: number, target: number[], opts: FeatureOptions = {},
): number {
  return cosineSimilarity(chartFeatures(engine, jdUt, opts), target);
}

export interface SearchConfigOptions extends FeatureOptions {
  start: number;
  end: number;
  step: number;
  limit?: number;
}

/**
 * Rank the instants in `[start, end]` by how closely the sky resembles a
 * `target` feature vector, best first — a realization search over the feature
 * space. Build `target` with {@link chartFeatures} (e.g. from a natal chart).
 *
 * @param engine The engine used to evaluate positions.
 * @param target A target feature vector from {@link chartFeatures}.
 * @param opts `start`/`end` (Julian Days, UT) and `step` (days) define the
 *   scan, `limit` caps the results, plus the {@link FeatureOptions} (`bodies`,
 *   `weights`, `zodiac`) — which must match those used to build `target`.
 * @returns Ranked `{ jd, score }` moments, highest similarity first.
 * @example
 * ```ts
 * const natal = chartFeatures(engine, julianDay(1990, 6, 10, 14, 30));
 * const matches = searchConfigurations(engine, natal, {
 *   start: julianDay(2025, 1, 1), end: julianDay(2026, 1, 1), step: 1, limit: 5,
 * });
 * matches[0].jd; // best-matching instant
 * ```
 */
export function searchConfigurations(
  engine: Engine, target: number[], opts: SearchConfigOptions,
): RankedMoment[] {
  return rankMoments(
    { start: opts.start, end: opts.end, step: opts.step, limit: opts.limit },
    (jd) => configurationFit(engine, jd, target, opts),
  );
}
