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

export class Turbo {
  readonly jd0: number;
  readonly jd1: number;
  private readonly bodies: Record<string, TurboBody>;

  constructor(pack: TurboPack) {
    this.jd0 = pack.jd0;
    this.jd1 = pack.jd1;
    this.bodies = pack.bodies;
  }

  has(body: string): boolean {
    return body in this.bodies;
  }

  /** Apparent ecliptic longitude (degrees) from the turbo pack. */
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
