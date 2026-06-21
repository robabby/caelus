/**
 * caelus synthetic ephemeris -- give imaginary bodies motion, not just a
 * single longitude.
 *
 * {@link compileForm} places an authored body at one static longitude
 * (a snapshot). A sky that does not move is dead: no transits, no returns, no
 * seasons. This module makes a body's position a deterministic **function of
 * time** from authored parameters, so every derived computation — transits,
 * returns, retrograde, conjunctions, phases, SkyView — works on it unchanged.
 *
 * Three tiers, increasing in physics:
 *  - **placement** — a fixed longitude (parity with `compileForm`; effectively a
 *    body on the celestial sphere that never moves).
 *  - **periodic** — `lon(t) = wrap360(phaseDeg + 360·(t − epoch)/periodDays)`.
 *    Cheap, no real physics, but yields returns, cyclic transits, and (viewed
 *    from an inner observer body) apparent retrograde. Covers ~all
 *    narrative/game needs.
 *  - **kepler** — constant Keplerian elements solved each instant
 *    (`{ a, e, i, node, peri, M0, periodDays }`), giving heliocentric ecliptic
 *    (x, y, z, lon, lat, r); with a designated **observer body** the positions
 *    become geocentric/apparent, enabling true retrograde, phases and
 *    occultation.
 *
 * Determinism is non-negotiable: every export is a pure function of
 * `(system, t)`. No randomness, no wall-clock reads — identical inputs yield
 * identical outputs, like the rest of Caelus.
 *
 * Two ways to consume a system:
 *  1. {@link syntheticPositions} / {@link syntheticEphemeris} — the self-
 *     contained *world frame*. An `observer` body, if set, is the vantage point;
 *     longitudes are in the world's own ecliptic, decoupled from Earth. This is
 *     the canonical position-over-time contract.
 *  2. {@link registerSyntheticSystem} — drop the bodies into a real {@link
 *     Engine} via {@link Engine.registerSource}, so `transits`, `returns`,
 *     `skyView`, `relational` etc. consume them through their existing `Engine`
 *     interfaces with zero changes. Here the vantage point is real Earth (the
 *     system's heliocentre maps to the Sun), so the synthetic `observer` does
 *     not apply — it is "imaginary bodies in our sky".
 */
import { DEG, mod, KeplerOrbit, XyzSource, KeplerElements } from "./core.js";

const TWO_PI = 2 * Math.PI;

/** A single authored body. Its `id` is how every consumer (charts, transits,
 *  SkyView) refers to it. */
export type SyntheticBody =
  /** A fixed longitude that never moves — parity with `compileForm`. */
  | { id: string; mode: "placement"; lonDeg: number }
  /** Uniform angular motion: `lon(t) = phaseDeg + 360·(t − epoch)/periodDays`.
   *  `epoch` defaults to `0`. */
  | { id: string; mode: "periodic"; periodDays: number; phaseDeg: number; epoch?: number }
  /** Constant Keplerian elements. Angles `i`, `node`, `peri`, `M0` in **degrees**;
   *  `a` in arbitrary length units (consistent within a system); `e` in `[0, 1)`;
   *  `epoch` defaults to `0`. */
  | {
    id: string; mode: "kepler"; a: number; e: number; i: number; node: number;
    peri: number; M0: number; periodDays: number; epoch?: number;
  };

/** Render attributes for a synthetic body — how an imaginary body should *look*
 *  in a SkyView frame. The engine owns position; these own appearance, so a body
 *  stays visually consistent across {@link skyViewSequence} frames. */
export interface SyntheticRender {
  /** Apparent angular diameter in degrees (the Moon is ~0.5°). */
  sizeDeg?: number;
  /** Apparent visual magnitude (smaller is brighter; Sirius is ~-1.5). */
  magnitude?: number;
  /** A colour hint, e.g. a CSS colour or evocative name ("pale gold"). */
  color?: string;
}

/** An authored celestial system: a set of {@link SyntheticBody} that move
 *  together, an optional `observer` body that fixes the vantage point, and
 *  optional per-body {@link SyntheticRender} attributes. */
export interface SyntheticSystem {
  id: string;
  bodies: SyntheticBody[];
  /** Body id of the vantage point. When set, {@link syntheticPositions} returns
   *  geocentric/apparent positions seen from this body (it sees itself at the
   *  origin, so it is reported at its own heliocentric place). When unset,
   *  positions are heliocentric. */
  observer?: string;
  /** Render attributes keyed by body id. */
  render?: Record<string, SyntheticRender>;
}

/** A body's position at one instant, in degrees and system length units. */
export interface SyntheticPosition {
  /** Ecliptic longitude in degrees, `[0, 360)`. */
  lonDeg: number;
  /** Ecliptic latitude in degrees. */
  latDeg: number;
  /** Distance from the vantage point (heliocentric, or from the observer body
   *  when one is set), in the system's length units. */
  r: number;
}

/** Why a system is unsatisfiable, if it is — the `impossible`/`residual` honesty
 *  pattern, mirroring {@link CompiledForm}. A system with problems
 *  still computes for the bodies that are individually valid, but flags the rest
 *  rather than silently producing garbage. */
export interface SyntheticDiagnosis {
  /** `true` when at least one problem makes the system ill-defined. */
  impossible: boolean;
  /** One human-readable line per problem (empty when the system is sound). */
  problems: string[];
}

/** A pluggable position-over-time source: the same shape every derived
 *  computation needs from a body. Returned by {@link syntheticEphemeris}. */
export interface BodyPositionSource extends SyntheticDiagnosis {
  /** The body ids this source can place. */
  bodies(): string[];
  /** Apparent ecliptic longitude (degrees, `[0, 360)`) at time `t`. */
  longitude(id: string, t: number): number;
  /** Full position at time `t`, with longitude speed and a retrograde flag
   *  derived by central difference — matching the {@link Position}
   *  contract that real bodies satisfy. */
  position(id: string, t: number): SyntheticPosition & { speed: number; retrograde: boolean };
}

// ----------------------------------------------------------------- validation

/**
 * Check an authored system for the ways it can be ill-defined — duplicate ids, a
 * dangling `observer`, non-positive periods, or out-of-range eccentricity — and
 * report each, in the `impossible`/`residual` honesty style. Pure.
 *
 * @param sys The system to check.
 * @returns A {@link SyntheticDiagnosis}; `impossible` is `true` when any problem
 *   is found.
 */
export function validateSyntheticSystem(sys: SyntheticSystem): SyntheticDiagnosis {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const b of sys.bodies) {
    if (seen.has(b.id)) problems.push(`duplicate body id '${b.id}'`);
    seen.add(b.id);
    if (b.mode === "periodic" && !(b.periodDays > 0)) {
      problems.push(`body '${b.id}': periodDays must be > 0 (got ${b.periodDays})`);
    }
    if (b.mode === "kepler") {
      if (!(b.periodDays > 0)) problems.push(`body '${b.id}': periodDays must be > 0 (got ${b.periodDays})`);
      if (!(b.a > 0)) problems.push(`body '${b.id}': a must be > 0 (got ${b.a})`);
      if (!(b.e >= 0 && b.e < 1)) problems.push(`body '${b.id}': e must be in [0, 1) (got ${b.e})`);
    }
  }
  if (sys.observer !== undefined && !seen.has(sys.observer)) {
    problems.push(`observer '${sys.observer}' is not a body in the system`);
  }
  return { impossible: problems.length > 0, problems };
}

// -------------------------------------------------------------------- sources

/**
 * The heliocentric xyz source for one authored body — the per-body engine behind
 * every tier, and the exact object {@link Engine.registerSource} consumes.
 *
 *  - **placement** sits on a very distant sphere so its direction (longitude) is
 *    fixed and parallax-free from any vantage.
 *  - **periodic** is a circular, coplanar orbit (`e = 0`, `i = 0`) whose radius
 *    follows Kepler's third law in the system's units (`a = periodDays^(2/3)`),
 *    so an inner body both moves faster and orbits tighter — making outer bodies
 *    show apparent retrograde near opposition, just like the real sky. Its
 *    heliocentric longitude is exactly `phaseDeg + 360·(t − epoch)/periodDays`.
 *  - **kepler** is the full constant-element solver ({@link KeplerOrbit}).
 *
 * @param body The authored body.
 * @returns An {@link XyzSource} yielding heliocentric ecliptic xyz at time `t`.
 */
export function bodySource(body: SyntheticBody): XyzSource {
  if (body.mode === "placement") {
    const R = 1e9;
    const lam = body.lonDeg * DEG;
    const v: [number, number, number] = [R * Math.cos(lam), R * Math.sin(lam), 0];
    return { xyz: () => v };
  }
  if (body.mode === "periodic") {
    const els: KeplerElements = {
      a: Math.cbrt(body.periodDays * body.periodDays),
      e: 0, i: 0, node: 0, peri: 0,
      M0: body.phaseDeg * DEG, n: TWO_PI / body.periodDays,
    };
    return new KeplerOrbit(els, body.epoch ?? 0);
  }
  const els: KeplerElements = {
    a: body.a, e: body.e, i: body.i * DEG, node: body.node * DEG,
    peri: body.peri * DEG, M0: body.M0 * DEG, n: TWO_PI / body.periodDays,
  };
  return new KeplerOrbit(els, body.epoch ?? 0);
}

/**
 * Build the heliocentric {@link XyzSource} for every body in a system, keyed by
 * id — the raw material for both the world-frame contract and engine
 * registration.
 *
 * @param sys The authored system.
 * @returns One source per body id.
 */
export function syntheticSources(sys: SyntheticSystem): Record<string, XyzSource> {
  const out: Record<string, XyzSource> = {};
  for (const b of sys.bodies) out[b.id] = bodySource(b);
  return out;
}

function vecToPos(v: [number, number, number]): SyntheticPosition {
  const r = Math.hypot(v[0], v[1], v[2]);
  return {
    lonDeg: mod(Math.atan2(v[1], v[0]) / DEG, 360),
    latDeg: r === 0 ? 0 : Math.asin(v[2] / r) / DEG,
    r,
  };
}

// ------------------------------------------------------------------- contract

/**
 * Positions of every body at one instant — the core position-over-time
 * contract. Pure: a function of `(sys, t)` only.
 *
 * When `sys.observer` is set, each other body's position is geocentric/apparent
 * as seen from the observer body (its heliocentric vector subtracted), so an
 * outer body shows a real apparent retrograde arc around opposition. The
 * observer body itself is reported at its own heliocentric place. With no
 * observer the positions are heliocentric.
 *
 * @param sys The authored system.
 * @param tDays The instant, in the same day units as each body's `periodDays`
 *   and `epoch`.
 * @returns Position per body id (`lonDeg`, `latDeg`, `r`).
 * @example
 * ```ts
 * const sys: SyntheticSystem = {
 *   id: "twin-moons",
 *   bodies: [
 *     { id: "fast", mode: "periodic", periodDays: 20, phaseDeg: 0 },
 *     { id: "slow", mode: "periodic", periodDays: 80, phaseDeg: 0 },
 *   ],
 * };
 * syntheticPositions(sys, 0).fast.lonDeg;  // 0
 * syntheticPositions(sys, 5).fast.lonDeg;  // 90  (a quarter of its 20-day period)
 * ```
 */
export function syntheticPositions(
  sys: SyntheticSystem, tDays: number,
): Record<string, SyntheticPosition> {
  const sources = syntheticSources(sys);
  const obs = sys.observer ? sources[sys.observer]?.xyz(tDays) ?? null : null;
  const out: Record<string, SyntheticPosition> = {};
  for (const b of sys.bodies) {
    const v = sources[b.id].xyz(tDays);
    if (obs && sys.observer !== b.id) {
      out[b.id] = vecToPos([v[0] - obs[0], v[1] - obs[1], v[2] - obs[2]]);
    } else {
      out[b.id] = vecToPos(v);
    }
  }
  return out;
}

/**
 * A {@link BodyPositionSource} over an authored system: the world-frame view as
 * a reusable object, with longitude speed and a retrograde flag so it satisfies
 * the same contract real ephemeris bodies do. Carries the system's
 * {@link validateSyntheticSystem} diagnosis (`impossible`/`problems`) — the
 * honesty pattern — and still serves the bodies that are individually valid.
 *
 * @param sys The authored system.
 * @returns A position source: `bodies()`, `longitude(id, t)`, `position(id, t)`,
 *   plus `impossible`/`problems`.
 */
export function syntheticEphemeris(sys: SyntheticSystem): BodyPositionSource {
  const { impossible, problems } = validateSyntheticSystem(sys);
  const sources = syntheticSources(sys);
  const ids = sys.bodies.map((b) => b.id);

  const apparent = (id: string, t: number): SyntheticPosition => {
    const v = sources[id].xyz(t);
    if (sys.observer && sys.observer !== id) {
      const o = sources[sys.observer].xyz(t);
      return vecToPos([v[0] - o[0], v[1] - o[1], v[2] - o[2]]);
    }
    return vecToPos(v);
  };

  return {
    impossible, problems,
    bodies: () => [...ids],
    longitude: (id, t) => apparent(id, t).lonDeg,
    position: (id, t) => {
      const p = apparent(id, t);
      const h = 0.05; // days; central difference, matching Engine.position
      const l0 = apparent(id, t - h).lonDeg;
      const l1 = apparent(id, t + h).lonDeg;
      const speed = (mod(l1 - l0 + 540, 360) - 180) / (2 * h);
      return { ...p, speed, retrograde: speed < 0 };
    },
  };
}

// ---------------------------------------------------------- engine integration

/** A type guard for the surface {@link registerSyntheticSystem} needs, so the
 *  synthetic module does not import the heavy {@link Engine} class. */
export interface SourceRegistrar {
  registerSource(id: string, source: XyzSource): unknown;
  registerRender?(id: string, render: SyntheticRender): unknown;
}

/**
 * Register a system's bodies on a real {@link Engine} so `transits`, `returns`,
 * retrograde detection, `skyView`, `relational` — every computation built on
 * `Engine.position`/`Engine.longitude` — consume them unchanged. The bodies are
 * placed heliocentrically in the real solar system and viewed from real Earth,
 * so the synthetic `observer` is *not* applied here (use
 * {@link syntheticPositions} for the self-contained world frame). Each body's
 * `epoch` is then interpreted as a TT Julian Day.
 *
 * @param engine The engine to register onto (anything with `registerSource`).
 * @param sys The authored system.
 * @returns The ids registered.
 * @example
 * ```ts
 * registerSyntheticSystem(engine, {
 *   id: "nemesis", bodies: [{ id: "nemesis", mode: "kepler", a: 520, e: 0.1,
 *     i: 5, node: 0, peri: 0, M0: 0, periodDays: 4_300_000, epoch: 2451545 }],
 * });
 * returns(engine, "nemesis", natalJd, jdStart, jdEnd); // works, zero changes
 * engine.position("nemesis", jd).retrograde;           // apparent, from Earth
 * ```
 */
export function registerSyntheticSystem(
  engine: SourceRegistrar, sys: SyntheticSystem,
): string[] {
  const sources = syntheticSources(sys);
  for (const b of sys.bodies) {
    engine.registerSource(b.id, sources[b.id]);
    const render = sys.render?.[b.id];
    if (render) engine.registerRender?.(b.id, render);
  }
  return sys.bodies.map((b) => b.id);
}

/**
 * The {@link SyntheticRender} attributes for a body id, or `undefined` when none
 * were authored. The accessor SkyView/`skyViewSequence` reads so an imaginary
 * body keeps a consistent size, brightness and colour across frames — the engine
 * owns position, this owns appearance.
 *
 * @param sys The authored system.
 * @param id A body id.
 * @returns The render attributes, or `undefined`.
 */
export function syntheticRender(
  sys: SyntheticSystem, id: string,
): SyntheticRender | undefined {
  return sys.render?.[id];
}
