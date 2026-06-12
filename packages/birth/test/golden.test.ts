/**
 * Golden cases for caelus-birth.
 *
 * Every expected value below was verified against the IANA tzdb (via the
 * runtime Intl database through Luxon) in a scratch script before being
 * written down — per repo rule, historical offsets are never trusted from
 * memory. Verification: Node 22 / full-icu, tzdb as shipped with ICU.
 */
import { DateTime } from "luxon";
import tzLookup from "tz-lookup";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { Engine, julianDay } from "caelus";
import { loadNodeData } from "caelus/node";
import { toUT, localToChart, type BirthInput } from "../src/index.js";

let checks = 0;
let failures = 0;
const MINUTE = 60_000;
function assert(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL ${msg}`);
  }
}

interface Golden {
  label: string;
  input: BirthInput;
  zone: string;
  utcIso: string;          // expected UTC instant
  offsetMinutes: number;
  dst: boolean;
  status: "ok" | "ambiguous" | "nonexistent";
}

const GOLDEN: Golden[] = [
  // -------- half-hour / 45-minute zones (no DST) --------
  {
    // verified: Asia/Kolkata +5:30 fixed since 1945
    label: "Kolkata +5:30",
    input: { year: 1990, month: 6, day: 10, hour: 14, minute: 30, lat: 22.57, lon: 88.36 },
    zone: "Asia/Kolkata", utcIso: "1990-06-10T09:00Z",
    offsetMinutes: 330, dst: false, status: "ok",
  },
  {
    // verified: Asia/Kathmandu +5:45 since 1986
    label: "Kathmandu +5:45",
    input: { year: 1995, month: 3, day: 15, hour: 10, minute: 15, lat: 27.7, lon: 85.3 },
    zone: "Asia/Kathmandu", utcIso: "1995-03-15T04:30Z",
    offsetMinutes: 345, dst: false, status: "ok",
  },
  {
    // verified: America/St_Johns NST -3:30 (winter, no DST in January)
    label: "Newfoundland -3:30",
    input: { year: 1980, month: 1, day: 10, hour: 8, minute: 0, lat: 47.56, lon: -52.71 },
    zone: "America/St_Johns", utcIso: "1980-01-10T11:30Z",
    offsetMinutes: -210, dst: false, status: "ok",
  },
  // -------- southern-hemisphere DST --------
  {
    // verified: Australia/Sydney AEDT +11 in January (southern summer)
    label: "Sydney January = +11 (DST)",
    input: { year: 2000, month: 1, day: 15, hour: 12, minute: 0, lat: -33.87, lon: 151.21 },
    zone: "Australia/Sydney", utcIso: "2000-01-15T01:00Z",
    offsetMinutes: 660, dst: true, status: "ok",
  },
  // -------- spring-forward gap --------
  {
    // verified: US DST began 2021-03-14 02:00 EST; 02:30 never existed.
    // tzdb shift-forward convention: 02:30 EST -> 03:30 EDT = 07:30 UTC
    label: "NY spring-forward 02:30 (nonexistent)",
    input: { year: 2021, month: 3, day: 14, hour: 2, minute: 30, lat: 40.71, lon: -74.0 },
    zone: "America/New_York", utcIso: "2021-03-14T07:30Z",
    offsetMinutes: -240, dst: true, status: "nonexistent",
  },
  // -------- fall-back overlap --------
  {
    // verified: US DST ended 2021-11-07 02:00 EDT; 01:30 occurred twice:
    // 05:30 UTC (EDT, -240) and 06:30 UTC (EST, -300). Earlier chosen.
    label: "NY fall-back 01:30 (ambiguous, earlier chosen)",
    input: { year: 2021, month: 11, day: 7, hour: 1, minute: 30, lat: 40.71, lon: -74.0 },
    zone: "America/New_York", utcIso: "2021-11-07T05:30Z",
    offsetMinutes: -240, dst: true, status: "ambiguous",
  },
  // -------- pre-1970 --------
  {
    // verified: Europe/London BST +1 in June 1955 (UK summer time,
    // pre-1970 rule set — exercises the historical tzdb)
    label: "London 1955 BST +1 (pre-1970)",
    input: { year: 1955, month: 6, day: 10, hour: 12, minute: 0, lat: 51.5, lon: -0.12 },
    zone: "Europe/London", utcIso: "1955-06-10T11:00Z",
    offsetMinutes: 60, dst: true, status: "ok",
  },
  // -------- wartime rules --------
  {
    // verified: British Double Summer Time, +2, summer 1942
    label: "London 1942 BDST +2 (wartime)",
    input: { year: 1942, month: 8, day: 1, hour: 12, minute: 0, lat: 51.5, lon: -0.12 },
    zone: "Europe/London", utcIso: "1942-08-01T10:00Z",
    offsetMinutes: 120, dst: true, status: "ok",
  },
  {
    // verified: Eastern War Time, -4 year-round Feb 1942 - Sep 1945
    label: "NY 1942 EWT -4 (wartime)",
    input: { year: 1942, month: 8, day: 1, hour: 12, minute: 0, lat: 40.71, lon: -74.0 },
    zone: "America/New_York", utcIso: "1942-08-01T16:00Z",
    offsetMinutes: -240, dst: true, status: "ok",
  },
];

for (const g of GOLDEN) {
  const r = toUT(g.input);
  const expected = DateTime.fromISO(g.utcIso, { zone: "utc" });
  assert(r.zone === g.zone, `${g.label}: zone ${r.zone} != ${g.zone}`);
  assert(r.status === g.status, `${g.label}: status ${r.status} != ${g.status}`);
  assert(r.offsetMinutes === g.offsetMinutes, `${g.label}: offset ${r.offsetMinutes} != ${g.offsetMinutes}`);
  assert(r.dst === g.dst, `${g.label}: dst ${r.dst} != ${g.dst}`);
  const got = DateTime.utc(
    r.utc.year, r.utc.month, r.utc.day, r.utc.hour, r.utc.minute, r.utc.second,
  );
  assert(got.toMillis() === expected.toMillis(),
    `${g.label}: UTC ${got.toISO()} != ${expected.toISO()}`);
  const expectedJd = julianDay(
    expected.year, expected.month, expected.day,
    expected.hour, expected.minute, expected.second,
  );
  assert(Math.abs(r.jdUt - expectedJd) < 1e-9, `${g.label}: jdUt off by ${r.jdUt - expectedJd}`);
}

// ambiguous case: both candidates present, ordered, correct instants
{
  const r = toUT({ year: 2021, month: 11, day: 7, hour: 1, minute: 30, lat: 40.71, lon: -74.0 });
  assert(r.candidates?.length === 2, "ambiguous: two candidates");
  const [a, b] = r.candidates!;
  assert(a.jdUt < b.jdUt, "ambiguous: candidates sorted earliest first");
  assert(a.offsetMinutes === -240 && a.dst === true, "ambiguous: first candidate is EDT");
  assert(b.offsetMinutes === -300 && b.dst === false, "ambiguous: second candidate is EST");
  assert(Math.abs((b.jdUt - a.jdUt) * 24 - 1) < 1e-6, "ambiguous: candidates 1 hour apart");
  assert(r.jdUt === a.jdUt, "ambiguous: earlier candidate chosen by default");
}

// zone override skips the coordinate lookup
{
  const r = toUT({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, lat: 0, lon: 0, zone: "Asia/Tokyo" });
  assert(r.zone === "Asia/Tokyo" && r.utc.hour === 3, "zone override respected");
}

// invalid inputs throw
for (const [label, input] of [
  ["bad zone", { year: 2000, month: 1, day: 1, hour: 0, minute: 0, lat: 0, lon: 0, zone: "Not/AZone" }],
  ["bad month", { year: 2000, month: 13, day: 1, hour: 0, minute: 0, lat: 0, lon: 0 }],
  ["bad lat", { year: 2000, month: 1, day: 1, hour: 0, minute: 0, lat: 91, lon: 0 }],
] as Array<[string, BirthInput]>) {
  checks++;
  try {
    toUT(input);
    failures++;
    console.error(`FAIL ${label}: did not throw`);
  } catch { /* expected */ }
}

// ---------------------------------------------------------------- property
// Round-trip: UT -> local wall clock (Luxon) -> toUT recovers the instant.
{
  const LOCS: Array<[number, number]> = [
    [40.71, -74.0], [51.5, -0.12], [-33.87, 151.21], [27.95, -82.46],
    [22.57, 88.36], [27.7, 85.3], [47.56, -52.71], [35.68, 139.69],
    [-23.55, -46.63], [64.1, -21.9], [78.2, 15.6], [0, 0],
  ];
  // deterministic LCG so failures are reproducible
  let seed = 12345;
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  let tested = 0;
  for (let i = 0; i < 200; i++) {
    const [lat, lon] = LOCS[Math.floor(rand() * LOCS.length)];
    const ms = Date.UTC(1900, 0, 1)
      + Math.floor(rand() * (Date.UTC(2100, 0, 1) - Date.UTC(1900, 0, 1)) / MINUTE) * MINUTE;
    const zone = tzLookup(lat, lon);
    const local = DateTime.fromMillis(ms, { zone });
    const r = toUT({
      year: local.year, month: local.month, day: local.day,
      hour: local.hour, minute: local.minute, lat, lon,
    });
    const got = DateTime.utc(
      r.utc.year, r.utc.month, r.utc.day, r.utc.hour, r.utc.minute, r.utc.second,
    ).toMillis();
    // LMT-era offsets carry seconds (e.g. Kathmandu +05:41:16 pre-1920);
    // minute-resolution input cannot carry them back, so the recovered
    // instant is the original truncated to the local whole minute.
    const want = ms - local.second * 1000 - local.millisecond;
    if (r.status === "ok") {
      tested++;
      assert(got === want,
        `round-trip ${zone} ${local.toISO()}: ${new Date(got).toISOString()} != ${new Date(want).toISOString()}`);
    } else if (r.status === "ambiguous") {
      // the original instant must be one of the candidates
      tested++;
      assert(r.candidates!.some((c) =>
        Math.abs((c.jdUt - 2440587.5) * 86_400_000 - want) < 1),
        `round-trip ambiguous ${zone} ${local.toISO()}: original not among candidates`);
    } else {
      // a wall time read off a real instant always exists
      tested++;
      assert(false, `round-trip ${zone} ${local.toISO()}: impossible nonexistent status`);
    }
  }
  assert(tested === 200, `property test ran ${tested}/200 cases`);
}

// ---------------------------------------------------------------- localToChart
{
  const require_ = createRequire(import.meta.url);
  const DATA = join(dirname(require_.resolve("caelus/package.json")), "data");
  const engine = new Engine(loadNodeData(DATA, "embedded", "full"));
  // 1990-06-10 14:30 EDT in Tampa == 18:30 UT — the canonical fixture chart
  const r = localToChart(
    { year: 1990, month: 6, day: 10, hour: 14, minute: 30, lat: 27.95, lon: -82.46 },
    engine,
  );
  const direct = engine.chart(1990, 6, 10, 18, 30, 0, 27.95, -82.46, "placidus");
  assert(r.utc.hour === 18 && r.utc.minute === 30, "localToChart: Tampa EDT -> 18:30 UT");
  assert(r.chart.bodies.sun.lon === direct.bodies.sun.lon, "localToChart: sun matches direct UT chart");
  assert(r.chart.angles.asc === direct.angles.asc, "localToChart: asc matches direct UT chart");
  // the naive new Date() path in a non-EDT runtime would differ by hours;
  // prove the wrong way is wrong: interpreting 14:30 as UT moves the Asc
  const wrong = engine.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus");
  assert(Math.abs(wrong.angles.asc - direct.angles.asc) > 30,
    "localToChart: naive-UT chart differs (Asc moves by sign-scale)");
}

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
