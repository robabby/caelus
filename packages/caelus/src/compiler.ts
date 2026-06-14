/**
 * astroengine compiler -- synthesize a chart form from geometric constraints.
 *
 * The inverse of (time, place) -> chart: given weighted geometric constraints
 * (aspects between bodies, sign or degree placements), find the body longitudes
 * that best satisfy them, and report how well they can be. If the best fit is
 * still poor, the form is geometrically impossible -- a valid result.
 *
 * The loss / constraint math is pure and mirrors the Python reference
 * (astroengine/compiler.py), pinned by the golden. The optimizer is a
 * deterministic coordinate descent with fixed low-discrepancy restarts.
 */
const PHI = 0.6180339887498949;

export type Constraint =
  | { kind: "aspect"; a: string; b: string; angle: number; weight?: number }
  | { kind: "sign"; body: string; sign: number; weight?: number }
  | { kind: "degree"; body: string; degree: number; weight?: number };

function angDist(a: number, b: number): number {
  return Math.abs(((a - b + 180.0) % 360.0) - 180.0);
}

function signLoss(lon: number, sign: number): number {
  const lo = (((sign % 12) + 12) % 12) * 30.0;
  const d = (((lon - lo) % 360.0) + 360.0) % 360.0;
  if (d < 30.0) return 0.0;
  return Math.min(d - 30.0, 360.0 - d);
}

/** Degrees by which a single constraint is unmet given the longitudes. */
export function constraintLoss(lons: Record<string, number>, c: Constraint): number {
  if (c.kind === "aspect") return Math.abs(angDist(lons[c.a], lons[c.b]) - c.angle);
  if (c.kind === "sign") return signLoss(lons[c.body], c.sign);
  return angDist(lons[c.body], c.degree);
}

/** Total weighted constraint loss for a set of body longitudes. */
export function formLoss(lons: Record<string, number>, constraints: Constraint[]): number {
  let total = 0;
  for (const c of constraints) total += (c.weight ?? 1.0) * constraintLoss(lons, c);
  return total;
}

function bodiesOf(constraints: Constraint[]): string[] {
  const s = new Set<string>();
  for (const c of constraints) {
    if (c.kind === "aspect") { s.add(c.a); s.add(c.b); }
    else s.add(c.body);
  }
  return [...s].sort();
}

function involves(c: Constraint, body: string): boolean {
  return c.kind === "aspect" ? (c.a === body || c.b === body) : c.body === body;
}

function bodyLoss(lons: Record<string, number>, body: string, constraints: Constraint[]): number {
  let total = 0;
  for (const c of constraints) if (involves(c, body)) total += (c.weight ?? 1.0) * constraintLoss(lons, c);
  return total;
}

export interface CompiledForm {
  longitudes: Record<string, number>;
  residual: number;
  maxConstraintLoss: number;
  impossible: boolean;
  constraints: Array<Constraint & { loss: number }>;
}

export interface CompileOptions {
  restarts?: number;
  iters?: number;
  /** A form is impossible when its worst constraint exceeds this (degrees). */
  impossibleDeg?: number;
}

/** Find body longitudes minimizing the weighted constraint loss. */
export function compileForm(constraints: Constraint[], opts: CompileOptions = {}): CompiledForm {
  const restarts = opts.restarts ?? 12;
  const iters = opts.iters ?? 8;
  const impossibleDeg = opts.impossibleDeg ?? 5.0;
  const bodies = bodiesOf(constraints);
  const n = Math.max(bodies.length, 1);

  let best: { e: number; lons: Record<string, number> } | null = null;
  for (let r = 0; r < restarts; r++) {
    const lons: Record<string, number> = {};
    bodies.forEach((b, i) => { lons[b] = (((r * n + i + 1) * PHI) % 1.0) * 360.0; });
    for (let it = 0; it < iters; it++) {
      for (const b of bodies) {
        let bestL = lons[b];
        let bestE = bodyLoss(lons, b, constraints);
        for (let i = 0; i < 360; i++) {
          lons[b] = i;
          const e = bodyLoss(lons, b, constraints);
          if (e < bestE) { bestE = e; bestL = i; }
        }
        for (let k = -20; k <= 20; k++) {
          const cand = (((bestL + k * 0.05) % 360.0) + 360.0) % 360.0;
          lons[b] = cand;
          const e = bodyLoss(lons, b, constraints);
          if (e < bestE) { bestE = e; bestL = cand; }
        }
        lons[b] = bestL;
      }
    }
    const e = formLoss(lons, constraints);
    if (best === null || e < best.e) best = { e, lons: { ...lons } };
  }

  const lons = best!.lons;
  let maxLoss = 0;
  for (const c of constraints) maxLoss = Math.max(maxLoss, constraintLoss(lons, c));
  return {
    longitudes: lons,
    residual: best!.e,
    maxConstraintLoss: maxLoss,
    impossible: maxLoss > impossibleDeg,
    constraints: constraints.map((c) => ({ ...c, loss: constraintLoss(lons, c) })),
  };
}
