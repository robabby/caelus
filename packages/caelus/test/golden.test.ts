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
import { Engine, BODIES, Body, DEFAULT_ORBS, ASPECTS } from "../src/chart.js";
import { aspectPhase } from "../src/electional.js";
import { interpretationContext } from "../src/interpretation.js";
import {
  interpret, hasPlacement, hasAspect, hasPattern, matchAll, matchNone,
  hasDispositor, hasReception, reconcile,
} from "../src/interpret.js";
import { chartBrief, auditCitations, BRIEF_INSTRUCTIONS } from "../src/brief.js";
import { pheno, equationOfTime } from "../src/pheno.js";
import { riseSet, crossings, lunarPhases, stations, gauquelinSector } from "../src/events.js";
import {
  lunarEclipses, solarEclipses, solarEclipseWhere, solarEclipseLocal,
  solarEclipseLimits, lunarEclipseLocal,
} from "../src/eclipses.js";
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
  // Eclipse where/local: validated against NASA GSFC's five-millennium canon
  // rather than golden fixtures, since the canon is the external ground truth
  // (gated via `failures`, no `checks` inflation). Greatest-eclipse point to
  // ~0.02 deg (~2 km) and totality duration to a few seconds.
  for (const c of [
    // NASA GSFC canon: greatest-eclipse point, central duration, eclipse
    // magnitude (Moon/Sun diameter ratio at a central eclipse), path width.
    { y: 2017, m: 8, kind: "total", geLat: 36.974, geLon: -87.659, durS: 160, mag: 1.031, obsc: 1, widthKm: 114.7 },
    { y: 2024, m: 4, kind: "total", geLat: 25.298, geLon: -104.138, durS: 268, mag: 1.057, obsc: 1, widthKm: 197.5 },
    { y: 2023, m: 10, kind: "annular", geLat: 11.4, geLon: -83.1, durS: 317, mag: 0.952, obsc: 0.906, widthKm: 187 },
  ]) {
    const es = solarEclipses(eng, julianDay(c.y, c.m, 1), julianDay(c.y, c.m, 28));
    const e = es.find((x) => x.type === c.kind);
    const w = e ? solarEclipseWhere(eng, e.tMax) : null;
    if (!e || !w || Math.abs(w.lat - c.geLat) > 0.06 || Math.abs(w.lonEast - c.geLon) > 0.06) {
      failures++;
      console.error(`FAIL ${c.y} greatest-eclipse point: ${w ? `${w.lat.toFixed(3)},${w.lonEast.toFixed(3)}` : "null"} vs ${c.geLat},${c.geLon}`);
    }
    const loc = e ? solarEclipseLocal(eng, e.tMax, c.geLat, c.geLon) : null;
    const dur = loc && loc.c2 && loc.c3 ? (loc.c3 - loc.c2) * 86400 : -1;
    if (!loc || loc.type !== c.kind
      || Math.abs(loc.magnitude - c.mag) > 0.002
      || Math.abs(loc.obscuration - c.obsc) > 0.003
      || Math.abs(dur - c.durS) > 8) {
      failures++;
      console.error(`FAIL ${c.y} local@GE: type=${loc?.type} mag=${loc?.magnitude.toFixed(3)} obsc=${loc?.obscuration.toFixed(3)} dur=${dur.toFixed(0)}s`);
    }
    const path = e ? solarEclipseLimits(eng, e.tMax) : null;
    if (!path || path.widthKm === null || Math.abs(path.widthKm - c.widthKm) > 4) {
      failures++;
      console.error(`FAIL ${c.y} path width: ${path?.widthKm?.toFixed(1)} km vs ${c.widthKm} km`);
    }
  }
  // Lunar eclipse local visibility: the 2025-03-14 total lunar eclipse was up
  // over the Americas (night) and below the horizon in East Asia (daytime).
  {
    const le = lunarEclipses(eng, julianDay(2025, 3, 1), julianDay(2025, 3, 31))
      .find((x) => x.type === "total");
    const la = le ? lunarEclipseLocal(eng, le.tMax, 34.05, -118.24) : null; // Los Angeles
    const tk = le ? lunarEclipseLocal(eng, le.tMax, 35.68, 139.69) : null; // Tokyo
    if (!le || !la?.visible || tk?.visible !== false) {
      failures++;
      console.error(`FAIL 2025 lunar visibility: LA alt=${la?.altitude.toFixed(1)} Tokyo alt=${tk?.altitude.toFixed(1)}`);
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
  // aspects carry phase + strength; phase must match the canonical aspectPhase
  // and strength sits in [0,1]. (Golden pins count only, so this guards the
  // enrichment via `failures` without a regenerated fixture.)
  for (const ap of c.aspects) {
    const pa = c.bodies[ap.a]!; const pb = c.bodies[ap.b]!;
    const want = aspectPhase(pa.lon, pa.speed, pb.lon, pb.speed, ASPECTS[ap.aspect]);
    if (ap.phase !== want || ap.strength < 0 || ap.strength > 1) {
      failures++;
      console.error(`FAIL aspect enrich ${ap.a}~${ap.b} ${ap.aspect}: phase=${ap.phase} vs ${want} strength=${ap.strength}`);
      break;
    }
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

// Interpretation context: the fact-atom projection is a deterministic transform
// of a validated chart, so it is checked structurally (gated via `failures`):
// every aspect atom ties back to a chart aspect with a consistent strength and a
// valid phase, every present body has a placement, ids are unique, and atoms are
// salience-sorted.
{
  const c = eng.chartAt(julianDay(1990, 6, 10, 14, 30, 0), 27.95, -82.46, "placidus");
  const ctx = interpretationContext(c);
  const by = (k: string) => ctx.atoms.filter((a) => a.kind === k);
  const ids = new Set(ctx.atoms.map((a) => a.id));
  const sorted = ctx.atoms.every((a, i) => i === 0 || ctx.atoms[i - 1].salience >= a.salience);
  if (
    ids.size !== ctx.atoms.length // unique ids
    || !sorted // descending salience
    || by("placement").length !== Object.keys(c.bodies).length
    || by("aspect").length !== c.aspects.length
    || by("angle").length !== 4
  ) {
    failures++;
    console.error(`FAIL interp shape: atoms=${ctx.atoms.length} placements=${by("placement").length}/${Object.keys(c.bodies).length} aspects=${by("aspect").length}/${c.aspects.length} unique=${ids.size === ctx.atoms.length} sorted=${sorted}`);
  }
  // every aspect atom maps to a chart aspect; strength = 1 - |orb|/limit in [0,1]
  for (const a of by("aspect") as Array<{ a: string; b: string; aspect: string; orb: number; strength: number; phase: string }>) {
    const match = c.aspects.find((x) => x.a === a.a && x.b === a.b && x.aspect === a.aspect);
    const want = Math.max(0, 1 - Math.abs(a.orb) / DEFAULT_ORBS[a.aspect]);
    if (!match || Math.abs(match.orb - a.orb) > 1e-9 || Math.abs(a.strength - want) > 1e-9
      || !["applying", "separating", "exact"].includes(a.phase)) {
      failures++;
      console.error(`FAIL interp aspect ${a.a}~${a.b} ${a.aspect}: strength=${a.strength} phase=${a.phase}`);
      break;
    }
  }
  // a known fact: 1990-06-10 has the Sun in Gemini
  const sun = ctx.atoms.find((a) => a.id === "placement:sun") as { sign?: string } | undefined;
  if (sun?.sign !== "Gemini") {
    failures++;
    console.error(`FAIL interp sun placement: ${sun?.sign}`);
  }

  // Matching + resolver: a developer's rule corpus over the projection, with
  // provenance. The engine ships the mechanism, never the content.
  const source = {
    id: "demo", version: "0.1", rules: [
      { id: "sun-gemini", when: hasPlacement({ body: "sun", sign: "Gemini" }), text: "x" },
      { id: "moon-neptune", when: hasAspect({ between: ["moon", "neptune"] as [string, string], aspect: "conjunction" }), text: "x", weight: 1.5 },
      { id: "moon-stellium", when: matchAll(hasPlacement({ body: "moon" }), hasPattern({ kind: "stellium_sign", body: "moon" })), text: "x" },
      { id: "no-aries-sun", when: matchNone(hasPlacement({ body: "sun", sign: "Aries" })), text: "x" },
      { id: "miss", when: hasPlacement({ body: "sun", sign: "Aries" }), text: "x" },
    ],
  };
  const reading = interpret(ctx, [source]);
  const byRule = Object.fromEntries(reading.entries.map((e) => [e.rule, e]));
  const rsorted = reading.entries.every((e, i) => i === 0 || reading.entries[i - 1].salience >= e.salience);
  if (
    reading.entries.length !== 4 // the four matching rules; "miss" omitted
    || "miss" in byRule
    || byRule["sun-gemini"]?.atomIds.join() !== "placement:sun" // provenance
    || byRule["sun-gemini"]?.id !== "demo/sun-gemini"
    || byRule["moon-stellium"]?.atomIds.length !== 2 // matchAll unions atoms
    || byRule["no-aries-sun"]?.atomIds.length !== 0 // absence: matched, no atoms
    || !rsorted
  ) {
    failures++;
    console.error(`FAIL interpret: entries=${reading.entries.length} rules=${JSON.stringify(reading.entries.map((e) => e.rule))} sorted=${rsorted}`);
  }

  // LLM brief + citation audit: the "novel and accurate" loop. The brief is the
  // top-N facts, id-tagged; the audit flags any citation that invents a fact.
  const brief = chartBrief(ctx, { limit: 6 });
  const briefSorted = brief.facts.every((f, i) => i === 0 || brief.facts[i - 1].salience >= f.salience);
  if (
    brief.facts.length !== 6
    || !brief.prompt.startsWith(BRIEF_INSTRUCTIONS)
    || !brief.prompt.includes(`[${brief.facts[0].id}]`)
    || !briefSorted
    || chartBrief(ctx, { header: false }).prompt.startsWith(BRIEF_INSTRUCTIONS) // header off
  ) {
    failures++;
    console.error(`FAIL brief: facts=${brief.facts.length} sorted=${briefSorted}`);
  }
  const realId = ctx.atoms[0].id;
  const audit = auditCitations([
    { text: "honest", cites: [realId] },
    { text: "invented", cites: ["aspect:mars~jupiter:trine:fake"] },
    { text: "uncited", cites: [] },
  ], ctx);
  if (
    audit.ok // must be false: one citation is fabricated
    || !audit.unknown.includes("aspect:mars~jupiter:trine:fake")
    || !audit.valid.includes(realId)
    || audit.uncited !== 1 || audit.cited !== 2 || audit.claims !== 3
  ) {
    failures++;
    console.error(`FAIL citation audit: ${JSON.stringify(audit)}`);
  }

  // Dispositors: one per classical planet; Saturn in Capricorn is a final
  // dispositor and the Moon (Capricorn) is disposited by Saturn. No mutual
  // reception in this chart.
  const disp = ctx.atoms.filter((a) => a.kind === "dispositor");
  if (
    disp.length !== 7
    || !hasDispositor({ body: "saturn", final: true })(ctx).matched
    || !hasDispositor({ body: "moon", dispositor: "saturn" })(ctx).matched
    || ctx.atoms.some((a) => a.kind === "reception")
  ) {
    failures++;
    console.error(`FAIL dispositors: count=${disp.length}`);
  }
  // Reception: 2000-02-01 has Mars<->Jupiter and Venus<->Saturn.
  const ctx2000 = interpretationContext(eng.chartAt(julianDay(2000, 2, 1, 12, 0, 0), 51.5, 0, "whole_sign"));
  const recs = ctx2000.atoms.filter((a) => a.kind === "reception");
  if (
    recs.length !== 2
    || !hasReception({ body: "mars" })(ctx2000).matched
    || !hasReception({ body: "saturn" })(ctx2000).matched
    || hasReception({ body: "sun" })(ctx2000).matched
  ) {
    failures++;
    console.error(`FAIL reception: ${JSON.stringify(recs.map((r) => r.id))}`);
  }

  // Reconcile: entries citing the same atom group together; opposing declared
  // tags mark the group contested; duplicate text is dropped.
  const rsrc = {
    id: "s", version: "1", rules: [
      { id: "sun-up", when: hasPlacement({ body: "sun" }), text: "a", tags: ["affirming"] },
      { id: "sun-dn", when: hasPlacement({ body: "sun" }), text: "b", tags: ["challenging"] },
      { id: "moon-a", when: hasPlacement({ body: "moon" }), text: "m" },
      { id: "moon-b", when: hasPlacement({ body: "moon" }), text: "m", weight: 0.5 }, // dup text
    ],
  };
  const groups = reconcile(interpret(ctx, [rsrc]), { conflicts: [["affirming", "challenging"]], dedupe: true });
  const sunGroup = groups.find((g) => g.atomIds.includes("placement:sun"));
  const moonGroup = groups.find((g) => g.atomIds.includes("placement:moon"));
  if (
    !sunGroup?.contested // opposing tags on shared atom
    || sunGroup.entries.length !== 2
    || moonGroup?.entries.length !== 1 // dedupe dropped the duplicate text
    || moonGroup.contested
  ) {
    failures++;
    console.error(`FAIL reconcile: sunContested=${sunGroup?.contested} moonEntries=${moonGroup?.entries.length}`);
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
