/**
 * astroengine turbo -- fast longitude evaluator for a turbo pack.
 *
 * A turbo pack is a segmented Chebyshev representation of the engine's apparent
 * longitude, fit to the engine itself (see python/astroengine/turbo.py and
 * fit_turbo.py). Evaluating a longitude is a couple of dozen multiply-adds, so
 * a century-scale transit scan that calls it tens of thousands of times runs in
 * milliseconds. The pack is data you mint for your range and bodies; this is
 * the runtime-only evaluator (no fitting, no engine, no I/O).
 *
 * The evaluator mirrors the Python reference exactly, so both reproduce the
 * pack bit-identically.
 */
import { mod } from "./core.js";

export interface TurboBody {
  seg_days: number;
  segments: number[][];
}

export interface TurboPack {
  jd0: number;
  jd1: number;
  degree: number;
  zodiac: string;
  bodies: Record<string, TurboBody>;
}

function clenshaw(coeffs: number[], x: number): number {
  let b0 = 0;
  let b1 = 0;
  for (let i = coeffs.length - 1; i >= 1; i--) {
    const t = 2 * x * b0 - b1 + coeffs[i];
    b1 = b0;
    b0 = t;
  }
  return x * b0 - b1 + coeffs[0];
}

/**
 * Runtime evaluator for a **turbo pack** — a segmented Chebyshev fit of the
 * engine's apparent longitude over a fixed range and body set. Evaluating a
 * longitude costs a couple dozen multiply-adds, so a century-scale transit scan
 * that calls it tens of thousands of times runs in milliseconds. Construct one
 * from a pack you minted offline; it does no fitting, no I/O, and needs no
 * {@link Engine}.
 *
 * @example
 * ```ts
 * const turbo = new Turbo(pack); // a TurboPack generated for your range/bodies
 * if (turbo.has("mars")) turbo.longitude("mars", jd);
 * ```
 */
export class Turbo {
  /** Start of the pack's valid Julian Day (UT) range. */
  readonly jd0: number;
  /** End of the pack's valid Julian Day (UT) range. */
  readonly jd1: number;
  private readonly bodies: Record<string, TurboBody>;

  /**
   * @param pack A {@link TurboPack}: the fitted segments plus its `jd0`/`jd1`
   *   range, minted offline for your bodies and span.
   */
  constructor(pack: TurboPack) {
    this.jd0 = pack.jd0;
    this.jd1 = pack.jd1;
    this.bodies = pack.bodies;
  }

  /**
   * Whether this pack can evaluate a given body.
   *
   * @param body Body id to test.
   * @returns `true` if {@link Turbo.longitude} accepts `body`.
   */
  has(body: string): boolean {
    return body in this.bodies;
  }

  /**
   * Apparent ecliptic longitude (degrees) of a body from the turbo pack, in the
   * pack's own zodiac. The hot path for bulk scans.
   *
   * @param body A body id the pack contains (see {@link Turbo.has}).
   * @param jd Julian Day (UT), within `[jd0, jd1]`.
   * @returns Ecliptic longitude in degrees, `[0, 360)`.
   * @throws Error if the pack lacks `body`, or `jd` is outside `[jd0, jd1]`.
   */
  longitude(body: string, jd: number): number {
    const b = this.bodies[body];
    if (!b) throw new Error(`turbo: no pack for ${body}`);
    if (jd < this.jd0 || jd > this.jd1) {
      throw new Error(`jd ${jd} outside turbo range ${this.jd0}-${this.jd1}`);
    }
    const seg = b.seg_days;
    const i = Math.min(Math.floor((jd - this.jd0) / seg), b.segments.length - 1);
    const x = 2 * (jd - (this.jd0 + i * seg)) / seg - 1;
    return mod(clenshaw(b.segments[i], x), 360);
  }
}
