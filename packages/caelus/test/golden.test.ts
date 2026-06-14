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
import { riseSet, crossings, lunarPhases, stations, gauquelinSector } from "../src/events.js";
import { lunarEclipses, solarEclipses } from "../src/eclipses.js";
import * as H from "../src/houses.js";
import { loadNodeData } from "../src/node-loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(readFileSync(join(here, "../../test/golden.json"), "utf8"));
const data = loadNodeData(join(here, "../../data"), "embedded", "full");
const eng = new Engine(data);

let checks = 0;
let failures = 0;
let worst = { what: "", diff: 0 };

// `worst` tracks ANGULAR deviations only (expectAngleDeg): mixing JD,
// AU, magnitude, and second-valued diffs into one headline number would
// make "nano-arcseconds" a lie of units.
function expect(what: string, got: number, want: number, tol: number) {
  checks++;
  const diff = Math.abs(got - want);
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

// events: rise/set/transit, crossings, phases, stations, true lilith
{
  const g = G.events;
  const jd0 = g.jd0;
  const JTOL = 1e-8; // days; both ports bisect the same bracket
  expect("ev.sun_rise", riseSet(eng, "sun", jd0, 27.95, -82.46, "rise")!,
    g.sun_rise_tampa, JTOL);
  expect("ev.moon_set", riseSet(eng, "moon", jd0, 51.5, -0.12, "set")!,
    g.moon_set_london, JTOL);
  expect("ev.mars_mtransit", riseSet(eng, "mars", jd0, -33.87, 151.21, "mtransit")!,
    g.mars_mtransit_sydney, JTOL);
  checks++;
  if (riseSet(eng, "sun", jd0, 78.2, 15.6, "set") !== null) {
    failures++;
    console.error("FAIL ev.polar midnight sun: expected null");
  }
  const cs = crossings(eng, "sun", 0.0, jd0, jd0 + 400);
  const cm = crossings(eng, "moon", 123.45, jd0, jd0 + 30);
  checks++;
  if (cs.length !== g.sun_cross_0.length || cm.length !== g.moon_cross_123.length) {
    failures++;
    console.error("FAIL ev.crossings count");
  } else {
    cs.forEach((t, i) => expect(`ev.sun_cross[${i}]`, t, g.sun_cross_0[i], JTOL));
    cm.forEach((t, i) => expect(`ev.moon_cross[${i}]`, t, g.moon_cross_123[i], JTOL));
  }
  const ph = lunarPhases(eng, jd0, jd0 + 30);
  const st = stations(eng, "mercury", jd0, jd0 + 200);
  checks++;
  if (ph.length !== g.phases_30d.length || st.length !== g.mercury_stations_200d.length) {
    failures++;
    console.error("FAIL ev.phases/stations count");
  } else {
    ph.forEach(([t, name], i) => {
      expect(`ev.phase[${i}]`, t, g.phases_30d[i][0], JTOL);
      checks++;
      if (name !== g.phases_30d[i][1]) {
        failures++;
        console.error(`FAIL ev.phase[${i}] name ${name}`);
      }
    });
    st.forEach(([t, dir], i) => {
      expect(`ev.station[${i}]`, t, g.mercury_stations_200d[i][0], JTOL);
      checks++;
      if (dir !== g.mercury_stations_200d[i][1]) {
        failures++;
        console.error(`FAIL ev.station[${i}] dir ${dir}`);
      }
    });
  }
  const lil = eng.position("true_lilith", jd0);
  expectAngleDeg("ev.true_lilith.lon", lil.lon, g.true_lilith.lon, TOL);
  expect("ev.true_lilith.lat", lil.lat, g.true_lilith.lat, TOL);
  expect("ev.true_lilith.dist", lil.dist!, g.true_lilith.dist, 1e-9);
  for (const [n, want] of Object.entries(g.stars) as Array<[string, any]>) {
    const st = eng.fixedStar(n, jd0);
    expectAngleDeg(`star.${n}.lon`, st.lon, want.lon, TOL);
    expect(`star.${n}.lat`, st.lat, want.lat, TOL);
    expectAngleDeg(`star.${n}.ra`, st.ra, want.ra, TOL);
    expect(`star.${n}.dec`, st.dec, want.dec, TOL);
  }
  expectAngleDeg("star.sid.galcent.sun",
    eng.longitude("sun", jd0, { zodiac: "sidereal:galcent_0sag" }),
    g.star_sidereal.galcent_0sag_sun, TOL);
  expectAngleDeg("star.sid.citra.spica",
    eng.fixedStar("Spica", jd0, { zodiac: "sidereal:true_citra" }).lon,
    g.star_sidereal.true_citra_spica, TOL);
  expect("gauquelin.sun", gauquelinSector(eng, "sun", jd0 + 0.3, 27.95, -82.46)!,
    g.gauquelin.sun_tampa, 1e-6);
  expect("gauquelin.moon", gauquelinSector(eng, "moon", jd0 + 0.6, -33.87, 151.21)!,
    g.gauquelin.moon_sydney, 1e-6);
  {
    const le = lunarEclipses(eng, jd0, jd0 + 366);
    const ge = g.lunar_eclipses_1y;
    checks++;
    if (le.length !== ge.length) {
      failures++;
      console.error(`FAIL lunar eclipse count ${le.length} vs ${ge.length}`);
    } else {
      le.forEach((e, i) => {
        expect(`lec[${i}].t_max`, e.tMax, ge[i].t_max, 1e-8);
        expect(`lec[${i}].mag_u`, e.magUmbral, ge[i].mag_umbral, 1e-9);
        checks++;
        if (e.type !== ge[i].type) { failures++; console.error(`FAIL lec[${i}].type`); }
        if (ge[i].partial_begin !== null) {
          expect(`lec[${i}].pb`, e.partialBegin!, ge[i].partial_begin, 1e-8);
        }
      });
    }
    const se = solarEclipses(eng, jd0, jd0 + 366);
    const gs = g.solar_eclipses_1y;
    checks++;
    if (se.length !== gs.length) {
      failures++;
      console.error(`FAIL solar eclipse count ${se.length} vs ${gs.length}`);
    } else {
      se.forEach((e, i) => {
        expect(`sec[${i}].t_max`, e.tMax, gs[i].t_max, 1e-8);
        expect(`sec[${i}].gamma`, e.gamma, gs[i].gamma, 1e-9);
        expect(`sec[${i}].begin`, e.begin, gs[i].begin, 1e-8);
        checks++;
        if (e.type !== gs[i].type) { failures++; console.error(`FAIL sec[${i}].type`); }
      });
    }
  }
  for (const [b, want] of Object.entries({ ...g.asteroids, ...g.uranians }) as Array<[string, any]>) {
    const p = eng.position(b, jd0);
    expectAngleDeg(`ast.${b}.lon`, p.lon, want.lon, TOL);
    expect(`ast.${b}.lat`, p.lat, want.lat, TOL);
    expect(`ast.${b}.dist`, p.dist!, want.dist, 1e-9);
    expect(`ast.${b}.speed`, p.speed, want.speed, 1e-6);
    checks++;
    if (p.retrograde !== want.retrograde) {
      failures++;
      console.error(`FAIL ast.${b}.retrograde`);
    }
  }
}

// full chart: aspects count + every cusp/body + angles
{
  const g = G.chart;
  const c = eng.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus");
  expect("chart.jdUt", c.jdUt, g.jd_ut, 1e-9);
  for (const b of BODIES) {
    const cb = c.bodies[b];
    if (!cb) { failures++; console.error(`FAIL chart.${b}: unexpectedly absent`); continue; }
    expectAngleDeg(`chart.${b}`, cb.lon, g.bodies[b].lon, TOL);
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
  // chartAt(jd) must be byte-for-byte identical to chart(calendar fields).
  // A TS-internal invariant (not a Python-pinned golden), so it guards
  // regressions without inflating the conformance check count.
  const cAt = eng.chartAt(julianDay(1990, 6, 10, 14, 30, 0), 27.95, -82.46, "placidus");
  if (JSON.stringify(cAt) !== JSON.stringify(c)) {
    failures++;
    console.error("FAIL chartAt != chart for identical instant");
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
    const cb = c.bodies[b];
    if (!cb) { failures++; console.error(`FAIL sid.${b}: unexpectedly absent`); continue; }
    expectAngleDeg(`sid.${b}`, cb.lon, g.bodies[b].lon, TOL);
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

// Graceful degradation: a body outside its fitted range is omitted + reported,
// not thrown; an absurd instant (Julian Day passed as a year) still throws.
// These are behavioural assertions, not accuracy fixtures, so they gate the run
// via `failures` without inflating the `checks` count the docs quote.
{
  const inRange = eng.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus");
  if (inRange.unavailable.length !== 0 || !("chiron" in inRange.bodies)) {
    failures++;
    console.error(`FAIL in-range unavailable: ${JSON.stringify(inRange.unavailable)}`);
  }

  const pre1850 = eng.chart(1700, 3, 21, 12, 0, 0, 51.5, -0.12, "placidus");
  if (
    !pre1850.unavailable.includes("chiron") ||
    "chiron" in pre1850.bodies ||
    !("sun" in pre1850.bodies) ||
    !("moon" in pre1850.bodies)
  ) {
    failures++;
    console.error(
      `FAIL pre-1850 degradation: unavailable=${JSON.stringify(pre1850.unavailable)} bodies=${Object.keys(pre1850.bodies).length}`,
    );
  }

  let threw = false;
  try {
    eng.chart(2451545, 6, 10, 0, 0, 0, 0, 0);
  } catch (e) {
    threw = e instanceof RangeError;
  }
  if (!threw) {
    failures++;
    console.error("FAIL Julian-Day-as-year did not throw RangeError");
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
      events: Object.keys(G.events).length,
    },
    generatedAt: new Date().toISOString(),
  }, null, 2) + "\n");
}

process.exit(failures ? 1 : 0);
