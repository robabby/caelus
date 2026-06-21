/**
 * Synthetic ephemeris checks: the acceptance criteria from the feature spec.
 * Self-contained (no golden fixture): a new feature with no Python reference.
 * The world-frame contract is pure math; the integration cases drive a real
 * Engine through registerSource to prove zero-change reuse.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { julianDay, mod } from "../src/core.js";
import { Engine } from "../src/chart.js";
import { loadNodeData } from "../src/node-loader.js";
import { returns } from "../src/derived.js";
import { azAlt } from "../src/pheno.js";
import { skyView } from "../src/skyview.js";
import {
  SyntheticSystem, syntheticPositions, syntheticEphemeris,
  registerSyntheticSystem, validateSyntheticSystem, syntheticRender,
} from "../src/synthetic.js";

const here = dirname(fileURLToPath(import.meta.url));
const eng = new Engine(loadNodeData(join(here, "../../data"), "embedded", "full"));

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) { failures++; console.error(`FAIL ${msg}`); }
}
function near(got: number, want: number, tol: number, msg: string): void {
  const d = Math.abs(got - want);
  if (!(d <= tol)) { failures++; console.error(`FAIL ${msg}: ${got} vs ${want} (diff ${d})`); }
}
/** Shortest angular separation between two longitudes, degrees. */
function sep(a: number, b: number): number {
  return Math.abs(mod(a - b + 180, 360) - 180);
}

// ---- 1. A periodic body returns to its phase after exactly one periodDays ----
{
  const sys: SyntheticSystem = {
    id: "one-moon",
    bodies: [{ id: "luna", mode: "periodic", periodDays: 27.3, phaseDeg: 137, epoch: 100 }],
  };
  const eph = syntheticEphemeris(sys);
  const t0 = 250.0;
  near(eph.longitude("luna", t0), eph.longitude("luna", t0 + 27.3), 1e-9,
    "periodic body returns to its phase after exactly one period");
  // and the closed-form phase holds: lon(t) = phaseDeg + 360*(t-epoch)/P
  near(eph.longitude("luna", 100), 137, 1e-9, "periodic lon at epoch equals phaseDeg");
  near(eph.longitude("luna", 100 + 27.3 / 4), mod(137 + 90, 360), 1e-9,
    "periodic lon advances 90 deg in a quarter period");
}

// ---- 2. Two periodic bodies in a ratio conjunct at the predicted cadence ----
{
  // P=20 and P=30, both at phase 0 at epoch 0 -> synodic period 60 days.
  const sys: SyntheticSystem = {
    id: "ratio",
    bodies: [
      { id: "a", mode: "periodic", periodDays: 20, phaseDeg: 0 },
      { id: "b", mode: "periodic", periodDays: 30, phaseDeg: 0 },
    ],
  };
  const synodic = 1 / (1 / 20 - 1 / 30); // = 60
  near(synodic, 60, 1e-9, "synodic period of the chosen ratio is 60 days");
  for (let k = 0; k <= 3; k++) {
    const t = k * synodic;
    const p = syntheticPositions(sys, t);
    near(sep(p.a.lonDeg, p.b.lonDeg), 0, 1e-6,
      `bodies conjunct at predicted cadence (k=${k}, t=${t})`);
  }
  // halfway between conjunctions they are at opposition
  const half = syntheticPositions(sys, 30);
  near(sep(half.a.lonDeg, half.b.lonDeg), 180, 1e-6,
    "bodies oppose at half the synodic period");
}

// ---- 3. A Kepler body conserves its elements over many periods; orbit closes -
{
  const P = 687.0;
  const sys: SyntheticSystem = {
    id: "kep",
    bodies: [{
      id: "ares", mode: "kepler",
      a: 1.524, e: 0.0934, i: 1.85, node: 49.6, peri: 286.5, M0: 19.4,
      periodDays: P, epoch: 0,
    }],
  };
  const base = syntheticPositions(sys, 0).ares;
  for (let k = 1; k <= 50; k++) {
    const p = syntheticPositions(sys, k * P).ares;
    near(p.lonDeg, base.lonDeg, 1e-6, `Kepler orbit closes in longitude after ${k} periods`);
    near(p.latDeg, base.latDeg, 1e-6, `Kepler orbit closes in latitude after ${k} periods`);
    near(p.r, base.r, 1e-9, `Kepler orbit conserves distance after ${k} periods`);
  }
  // perihelion distance is a(1-e); aphelion a(1+e) -- the radius stays bounded.
  let rMin = Infinity; let rMax = 0;
  for (let i = 0; i < 360; i++) {
    const r = syntheticPositions(sys, (i / 360) * P).ares.r;
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
  }
  near(rMin, 1.524 * (1 - 0.0934), 2e-3, "perihelion distance matches a(1-e)");
  near(rMax, 1.524 * (1 + 0.0934), 2e-3, "aphelion distance matches a(1+e)");
}

// ---- 4. With an observer, an outer body shows apparent retrograde ----
{
  // Inner observer (fast, tight orbit), outer target. The target must reverse
  // its apparent longitude near opposition and run prograde near conjunction.
  const sys: SyntheticSystem = {
    id: "retro",
    bodies: [
      { id: "home", mode: "periodic", periodDays: 20, phaseDeg: 0 },
      { id: "outer", mode: "periodic", periodDays: 80, phaseDeg: 0 },
    ],
    observer: "home",
  };
  const eph = syntheticEphemeris(sys);
  let sawRetro = false; let sawPrograde = false;
  for (let t = 0; t <= 80; t += 0.5) {
    if (eph.position("outer", t).retrograde) sawRetro = true; else sawPrograde = true;
  }
  ok(sawRetro, "outer body shows apparent retrograde motion from the observer");
  ok(sawPrograde, "outer body also runs prograde across the synodic cycle");
  // sanity: with no observer (heliocentric) the same body never retrogrades.
  const helioEph = syntheticEphemeris({ ...sys, observer: undefined });
  let everRetroHelio = false;
  for (let t = 0; t <= 80; t += 0.5) if (helioEph.position("outer", t).retrograde) everRetroHelio = true;
  ok(!everRetroHelio, "heliocentric periodic motion is always prograde (no observer)");
}

// ---- 5. A synthetic system feeds returns / position / skyView unchanged ----
{
  // Register heliocentric synthetic bodies on a real Engine; epoch is a TT JD.
  const epoch = julianDay(2000, 1, 1);
  const sys: SyntheticSystem = {
    id: "world-sky",
    bodies: [
      { id: "verdant", mode: "kepler", a: 3.2, e: 0.05, i: 2.0, node: 80, peri: 30, M0: 0, periodDays: 2100, epoch },
      { id: "ember", mode: "periodic", periodDays: 540, phaseDeg: 210, epoch },
      { id: "beacon", mode: "placement", lonDeg: 120 },
    ],
    render: {
      verdant: { sizeDeg: 0.4, magnitude: -1.2, color: "pale gold" },
      beacon: { sizeDeg: 0.4, magnitude: -1.2, color: "pale gold" },
    },
  };
  const ids = registerSyntheticSystem(eng, sys);
  ok(ids.length === 3, "registerSyntheticSystem returns the registered ids");
  ok(eng.bodies().includes("verdant"), "registered synthetic body appears in engine.bodies()");

  const jd = julianDay(2025, 6, 21, 12);
  const pos = eng.position("verdant", jd);
  ok(Number.isFinite(pos.lon) && pos.lon >= 0 && pos.lon < 360,
    "engine.position gives a sane longitude for a synthetic body");
  ok(typeof pos.retrograde === "boolean", "synthetic body carries a retrograde flag like a real one");

  // returns(): the synthetic body crossing its own natal longitude.
  const natal = julianDay(2010, 1, 1);
  const hits = returns(eng, "verdant", natal, julianDay(2010, 1, 1), julianDay(2040, 1, 1));
  ok(Array.isArray(hits) && hits.length >= 1,
    "returns() finds synthetic-body returns through the existing interface");
  for (const h of hits) {
    near(eng.longitude("verdant", h), eng.longitude("verdant", natal), 0.05,
      "each return instant lands on the natal longitude");
  }

  // skyView(): synthetic body flows through with authored render attrs.
  const beaconPos = eng.position("beacon", jd);
  const [bAz, bAlt] = azAlt(eng.data, beaconPos.lon, beaconPos.lat, jd, 40, -75);
  ok(bAlt > 0, "beacon placement body is above the horizon for the skyView check");
  const sky = skyView(eng, jd, {
    observer: { lat: 40, lonEast: -75 },
    aim: { azimuth: bAz, altitude: bAlt },
    lens: "wide",
    image: { width: 1000, height: 1000 },
  }, { bodies: ["sun", "beacon"] });
  ok(Array.isArray(sky.bodies), "skyView runs with synthetic bodies in the body list");
  const beaconBody = sky.bodies.find((b) => b.id === "beacon");
  ok(beaconBody !== undefined, "skyView places a registered synthetic body");
  ok(beaconBody?.color === "pale gold", "skyView picks up engine-registered render colour");
  ok((beaconBody?.sizePx ?? 0) >= 3, "skyView applies authored angular size");
  ok(sky.prompt.includes("pale gold"), "skyView prompt carries the authored colour");

  // render attributes are exposed for frame consistency.
  ok(syntheticRender(sys, "verdant")?.color === "pale gold",
    "syntheticRender exposes authored appearance");
  ok(syntheticRender(sys, "member") === undefined,
    "syntheticRender returns undefined for un-authored bodies");
}

// ---- 6. Determinism: same (system, t) -> identical output across runs ----
{
  const sys: SyntheticSystem = {
    id: "det",
    bodies: [
      { id: "x", mode: "kepler", a: 2.1, e: 0.2, i: 7, node: 12, peri: 200, M0: 33, periodDays: 999, epoch: 5 },
      { id: "y", mode: "periodic", periodDays: 41, phaseDeg: 88, epoch: 5 },
      { id: "z", mode: "placement", lonDeg: 315 },
    ],
    observer: "x",
  };
  const t = 1234.567;
  const a = JSON.stringify(syntheticPositions(sys, t));
  const b = JSON.stringify(syntheticPositions(sys, t));
  ok(a === b, "syntheticPositions is deterministic across runs");
  // placement never moves.
  near(syntheticPositions({ ...sys, observer: undefined }, 0).z.lonDeg, 315, 1e-6,
    "placement body holds its longitude at t=0");
  near(syntheticPositions({ ...sys, observer: undefined }, 1e6).z.lonDeg, 315, 1e-6,
    "placement body holds its longitude far in the future");
}

// ---- honesty pattern: unsatisfiable systems are flagged, not silently bad ----
{
  const bad: SyntheticSystem = {
    id: "bad",
    bodies: [
      { id: "dup", mode: "periodic", periodDays: 10, phaseDeg: 0 },
      { id: "dup", mode: "periodic", periodDays: -5, phaseDeg: 0 },
      { id: "k", mode: "kepler", a: -1, e: 1.5, i: 0, node: 0, peri: 0, M0: 0, periodDays: 0 },
    ],
    observer: "ghost",
  };
  const diag = validateSyntheticSystem(bad);
  ok(diag.impossible, "an unsatisfiable system is flagged impossible");
  ok(diag.problems.some((p) => p.includes("duplicate")), "duplicate ids are reported");
  ok(diag.problems.some((p) => p.includes("periodDays")), "non-positive periods are reported");
  ok(diag.problems.some((p) => p.includes("e must be")), "out-of-range eccentricity is reported");
  ok(diag.problems.some((p) => p.includes("observer")), "a dangling observer is reported");
  ok(syntheticEphemeris(bad).impossible, "the position source carries the diagnosis");

  const good = validateSyntheticSystem({
    id: "good", bodies: [{ id: "m", mode: "periodic", periodDays: 12, phaseDeg: 0 }],
  });
  ok(!good.impossible && good.problems.length === 0, "a sound system reports no problems");
}

console.log(`\nsynthetic: ${failures} failures`);
process.exit(failures ? 1 : 0);
