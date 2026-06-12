/**
 * Golden conformance test: the TypeScript port must reproduce the validated
 * Python engine's output. Both run identical algorithms in IEEE doubles, so
 * tolerances are tiny -- any real porting bug violates them by orders of
 * magnitude.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  julianDay, deltaT, jdTT, nutation, meanObliquity, DEG, mod, ayanamsa,
} from "../src/core.js";
import { Engine, BODIES, Body } from "../src/chart.js";
import { pheno, equationOfTime } from "../src/pheno.js";
import * as H from "../src/houses.js";
import { loadNodeData } from "../src/node-loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(readFileSync(join(here, "../../test/golden.json"), "utf8"));
const data = loadNodeData(join(here, "../../data"), "embedded", "full");
const eng = new Engine(data);

let checks = 0;
let failures = 0;
let worst = { what: "", diff: 0 };

function expect(what: string, got: number, want: number, tol: number) {
  checks++;
  const diff = Math.abs(got - want);
  if (diff > worst.diff) worst = { what, diff };
  if (diff > tol) {
    failures++;
    if (failures <= 10) {
      console.error(`FAIL ${what}: got ${got}, want ${want} (diff ${diff})`);
    }
  }
}

function expectAngleDeg(what: string, got: number, want: number, tolDeg: number) {
  checks++;
  const diff = Math.abs(mod(got - want + 180, 360) - 180);
  if (diff > worst.diff) worst = { what, diff };
  if (diff > tolDeg) {
    failures++;
    if (failures <= 10) {
      console.error(`FAIL ${what}: got ${got}, want ${want} (diff ${diff * 3600}")`);
    }
  }
}

// tolerance: 1e-6 deg = 3.6 milliarcseconds
const TOL = 1e-6;

// julian day sanity
expect("julianDay(2000-1-1.5)", julianDay(2000, 1, 1, 12), 2451545.0, 1e-9);

// delta T
for (const g of G.delta_t) expect(`deltaT@${g.jd}`, deltaT(g.jd), g.dt, 1e-9);

// nutation + obliquity
for (const g of G.nutation) {
  const [dpsi, deps] = nutation(data, g.jde);
  expect(`dpsi@${g.jde}`, dpsi, g.dpsi, 1e-15);
  expect(`deps@${g.jde}`, deps, g.deps, 1e-15);
  expect(`eps0@${g.jde}`, meanObliquity(g.jde), g.eps0, 1e-15);
}

// body longitudes
for (const row of G.longitudes) {
  for (const b of BODIES) {
    expectAngleDeg(
      `${b}@${row.jd_ut}`, eng.longitude(b as Body, row.jd_ut), row.bodies[b], TOL,
    );
  }
}

// positions: speed + retrograde + lat/dist/ra/dec
for (const row of G.positions) {
  for (const b of BODIES) {
    const p = eng.position(b as Body, row.jd_ut);
    const g = row.bodies[b];
    expectAngleDeg(`${b}.lon@${row.jd_ut}`, p.lon, g.lon, TOL);
    expect(`${b}.speed@${row.jd_ut}`, p.speed, g.speed, 1e-6);
    expect(`${b}.lat@${row.jd_ut}`, p.lat, g.lat, TOL);
    expectAngleDeg(`${b}.ra@${row.jd_ut}`, p.ra, g.ra, TOL);
    expect(`${b}.dec@${row.jd_ut}`, p.dec, g.dec, TOL);
    checks++;
    if (g.dist === null ? p.dist !== null : Math.abs((p.dist ?? NaN) - g.dist) > 1e-9) {
      failures++;
      console.error(`FAIL ${b}.dist@${row.jd_ut}: ${p.dist} vs ${g.dist}`);
    }
    checks++;
    if (p.retrograde !== g.retrograde) {
      failures++;
      console.error(`FAIL ${b}.retrograde@${row.jd_ut}`);
    }
  }
}

// sidereal longitudes + ayanamsa values
for (const row of G.sidereal) {
  for (const mode of Object.keys(row.modes)) {
    const want = row.modes[mode];
    const zodiac = `sidereal:${mode}` as const;
    expect(`ayanamsa.${mode}@${row.jd_ut}`,
      ayanamsa(jdTT(row.jd_ut), mode), want.ayanamsa, TOL);
    expectAngleDeg(`sun.${mode}@${row.jd_ut}`,
      eng.longitude("sun", row.jd_ut, { zodiac }), want.sun, TOL);
    expectAngleDeg(`moon.${mode}@${row.jd_ut}`,
      eng.longitude("moon", row.jd_ut, { zodiac }), want.moon, TOL);
  }
}

// extras: lilith, topocentric, heliocentric, pheno, equation of time
for (const row of G.extras) {
  const jd = row.jd_ut;
  const lil = eng.position("mean_lilith", jd);
  expectAngleDeg(`lilith.lon@${jd}`, lil.lon, row.lilith.lon, TOL);
  expect(`lilith.lat@${jd}`, lil.lat, row.lilith.lat, TOL);
  expect(`lilith.speed@${jd}`, lil.speed, row.lilith.speed, 1e-6);
  const topo = eng.position("moon", jd, {
    topocentric: true, observer: { lat: 27.95, lonEast: -82.46, altM: 10.0 },
  });
  expectAngleDeg(`moon.topo@${jd}`, topo.lon, row.moon_topo_lon, TOL);
  const helio = eng.heliocentric("mars", jd);
  expectAngleDeg(`mars.helio.lon@${jd}`, helio.lon, row.mars_helio.lon, TOL);
  expect(`mars.helio.dist@${jd}`, helio.dist, row.mars_helio.dist, 1e-9);
  const ven = eng.position("venus", jd);
  expectAngleDeg(`venus.ra@${jd}`, ven.ra, row.venus.ra, TOL);
  expect(`venus.dec@${jd}`, ven.dec, row.venus.dec, TOL);
  for (const [body, want] of [["mars", row.pheno_mars], ["moon", row.pheno_moon]] as const) {
    const ph = pheno(eng, body, jd);
    expect(`pheno.${body}.phase_angle@${jd}`, ph.phaseAngle, want.phase_angle, TOL);
    expect(`pheno.${body}.phase@${jd}`, ph.phase, want.phase, 1e-9);
    expect(`pheno.${body}.elongation@${jd}`, ph.elongation, want.elongation, TOL);
    expect(`pheno.${body}.diameter@${jd}`, ph.diameter, want.diameter, 1e-9);
    expect(`pheno.${body}.magnitude@${jd}`, ph.magnitude, want.magnitude, 1e-6);
  }
  expect(`eot@${jd}`, equationOfTime(eng, jd), row.eot_min, 1e-6);
}

// houses
for (const g of G.houses) {
  const [asc, mc, armc, eps] = H.angles(data, g.jd_ut, g.lat, g.lon);
  expectAngleDeg("asc", asc / DEG, g.asc, TOL);
  expectAngleDeg("mc", mc / DEG, g.mc, TOL);
  expectAngleDeg("armc", armc / DEG, g.armc, TOL);
  expect("eps", eps / DEG, g.eps, TOL);
  const [vtx, east] = H.vertexEastPoint(armc, g.lat * DEG, eps);
  expectAngleDeg("vertex", vtx / DEG, g.vertex, TOL);
  expectAngleDeg("east_point", east / DEG, g.east_point, TOL);
  const phi = g.lat * DEG;
  const systems: Array<[string, number[] | null, () => number[]]> = [
    ["placidus", g.placidus, () => H.housesPlacidus(armc, phi, eps)],
    ["porphyry", g.porphyry, () => H.housesPorphyry(asc, mc)],
    ["equal", g.equal, () => H.housesEqual(asc)],
    ["whole_sign", g.whole_sign, () => H.housesWholeSign(asc)],
    ["koch", g.koch, () => H.housesKoch(armc, phi, eps)],
    ["regiomontanus", g.regiomontanus, () => H.housesRegiomontanus(armc, phi, eps)],
    ["campanus", g.campanus, () => H.housesCampanus(armc, phi, eps)],
    ["alcabitius", g.alcabitius, () => H.housesAlcabitius(armc, phi, eps)],
    ["morinus", g.morinus, () => H.housesMorinus(armc, phi, eps)],
    ["meridian", g.meridian, () => H.housesMeridian(armc, phi, eps)],
    ["polich_page", g.polich_page, () => H.housesPolichPage(armc, phi, eps)],
    ["vehlow", g.vehlow, () => H.housesVehlow(armc, phi, eps)],
  ];
  for (const [name, want, fn] of systems) {
    if (!want) {
      if (name === "koch") {
        // fixture says undefined (polar latitudes): port must throw too
        checks++;
        try {
          fn();
          failures++;
          console.error(`FAIL ${name}@${g.jd_ut}: expected throw`);
        } catch { /* expected */ }
      }
      continue;
    }
    const got = fn();
    for (let i = 0; i < 12; i++) {
      expectAngleDeg(`${name}[${i}]`, got[i] / DEG, want[i], TOL);
    }
  }
}

// full chart: aspects count + every cusp/body + angles
{
  const g = G.chart;
  const c = eng.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus");
  expect("chart.jdUt", c.jdUt, g.jd_ut, 1e-9);
  for (const b of BODIES) {
    expectAngleDeg(`chart.${b}`, c.bodies[b].lon, g.bodies[b].lon, TOL);
  }
  for (let i = 0; i < 12; i++) {
    expectAngleDeg(`chart.cusp[${i}]`, c.cusps[i], g.cusps[i], TOL);
  }
  expectAngleDeg("chart.vertex", c.angles.vertex, g.angles.vertex, TOL);
  expectAngleDeg("chart.east_point", c.angles.eastPoint, g.angles.east_point, TOL);
  checks++;
  if (c.aspects.length !== g.aspects.length) {
    failures++;
    console.error(`FAIL aspect count: ${c.aspects.length} vs ${g.aspects.length}`);
  }
}

// sidereal chart: koch + lahiri, options-object call form
{
  const g = G.chart_sidereal;
  const c = eng.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, {
    houseSystem: "koch", zodiac: "sidereal:lahiri",
  });
  checks++;
  if (c.zodiac !== g.zodiac || c.houseSystem !== g.house_system) {
    failures++;
    console.error(`FAIL chart_sidereal meta: ${c.zodiac}/${c.houseSystem}`);
  }
  for (const b of BODIES) {
    expectAngleDeg(`sid.${b}`, c.bodies[b].lon, g.bodies[b].lon, TOL);
  }
  for (let i = 0; i < 12; i++) {
    expectAngleDeg(`sid.cusp[${i}]`, c.cusps[i], g.cusps[i], TOL);
  }
  expectAngleDeg("sid.asc", c.angles.asc, g.angles.asc, TOL);
  expectAngleDeg("sid.mc", c.angles.mc, g.angles.mc, TOL);
}

// polar Placidus fallback contract
{
  const g = G.chart_polar;
  const c = eng.chart(1985, 12, 1, 9, 0, 0, 78.2, 15.6, "placidus");
  checks++;
  if (c.houseSystem !== g.house_system || c.houseSystemRequested !== g.house_system_requested) {
    failures++;
    console.error(`FAIL polar fallback: ${c.houseSystem}/${c.houseSystemRequested}`);
  }
}

console.log(`\n${checks} checks, ${failures} failures`);
console.log(`worst diff: ${worst.what} = ${(worst.diff * 3600).toExponential(2)}" (${worst.diff.toExponential(2)} deg)`);

if (process.env.CAELUS_STATS_OUT) {
  const arcsec = worst.diff * 3600;
  writeFileSync(process.env.CAELUS_STATS_OUT, JSON.stringify({
    suite: "golden",
    checks,
    failures,
    worst: {
      what: worst.what,
      deg: worst.diff,
      arcsec,
      nano_arcsec: arcsec * 1e9,
    },
    bodies: BODIES.length,
    fixtures: {
      delta_t: G.delta_t.length,
      nutation: G.nutation.length,
      longitudes: G.longitudes.length,
      positions: G.positions.length,
      houses: G.houses.length,
      sidereal: G.sidereal.length,
      extras: G.extras.length,
    },
    generatedAt: new Date().toISOString(),
  }, null, 2) + "\n");
}

process.exit(failures ? 1 : 0);
