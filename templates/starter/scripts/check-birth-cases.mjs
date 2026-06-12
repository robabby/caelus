/**
 * Integration check: the cursed-timezone golden cases from caelus-birth,
 * run through the exact inputs the birth form submits. Expected values are
 * tzdb-verified in the caelus-birth test suite.
 *
 * TODO: a Playwright run that drives the actual form is the fuller version
 * of this check; scripted toUT assertions were chosen to keep the template
 * dependency-light (smaller scope per the work order's guardrails).
 */
import { toUT } from "caelus-birth";

const CASES = [
  // [label, form input, expected UTC ISO, expected status]
  ["Kolkata +5:30", { year: 1990, month: 6, day: 10, hour: 14, minute: 30, lat: 22.57, lon: 88.36 }, "1990-06-10T09:00", "ok"],
  ["Kathmandu +5:45", { year: 1995, month: 3, day: 15, hour: 10, minute: 15, lat: 27.7, lon: 85.3 }, "1995-03-15T04:30", "ok"],
  ["Newfoundland -3:30", { year: 1980, month: 1, day: 10, hour: 8, minute: 0, lat: 47.56, lon: -52.71 }, "1980-01-10T11:30", "ok"],
  ["Sydney January DST", { year: 2000, month: 1, day: 15, hour: 12, minute: 0, lat: -33.87, lon: 151.21 }, "2000-01-15T01:00", "ok"],
  ["NY spring-forward", { year: 2021, month: 3, day: 14, hour: 2, minute: 30, lat: 40.71, lon: -74.0 }, "2021-03-14T07:30", "nonexistent"],
  ["NY fall-back", { year: 2021, month: 11, day: 7, hour: 1, minute: 30, lat: 40.71, lon: -74.0 }, "2021-11-07T05:30", "ambiguous"],
  ["London 1955 BST", { year: 1955, month: 6, day: 10, hour: 12, minute: 0, lat: 51.5, lon: -0.12 }, "1955-06-10T11:00", "ok"],
  ["London 1942 BDST", { year: 1942, month: 8, day: 1, hour: 12, minute: 0, lat: 51.5, lon: -0.12 }, "1942-08-01T10:00", "ok"],
  ["NY 1942 War Time", { year: 1942, month: 8, day: 1, hour: 12, minute: 0, lat: 40.71, lon: -74.0 }, "1942-08-01T16:00", "ok"],
];

let failures = 0;
for (const [label, input, expectedIso, expectedStatus] of CASES) {
  const t = toUT(input);
  const got = `${t.utc.year}-${String(t.utc.month).padStart(2, "0")}-${String(t.utc.day).padStart(2, "0")}T${String(t.utc.hour).padStart(2, "0")}:${String(t.utc.minute).padStart(2, "0")}`;
  if (got !== expectedIso || t.status !== expectedStatus) {
    failures++;
    console.error(`FAIL ${label}: got ${got} (${t.status}), expected ${expectedIso} (${expectedStatus})`);
  }
}
console.log(`${CASES.length} birth cases, ${failures} failures`);
process.exit(failures ? 1 : 0);
