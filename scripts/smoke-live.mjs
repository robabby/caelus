#!/usr/bin/env node
/**
 * Live deployment smoke test: the conformance suite guards the code; this
 * guards what actually serves at ephemengine.com. Asserts the flagship GET
 * (with a date param — the part a 2026-06-12 review found broken in
 * production while the suite was green), tolerance of unknown params (the
 * canary for WAF/firewall allowlist rules that the repo cannot see),
 * input validation, and llms.txt.
 *
 * Usage: node scripts/smoke-live.mjs [base-url]   (default ephemengine.com)
 */
const BASE = process.argv[2] ?? "https://www.ephemengine.com";

// Fixed-instant expectations (engine values for 1990-06-10T14:30Z, Tampa).
// Sun moves ~0.04"/yr across engine versions; 0.05 deg of slack outlives
// any plausible model change.
const CHART = "/api/chart?date=1990-06-10T14:30:00Z&lat=27.94&lon=-82.46";
const SUN_LON = 79.4520;
const ASC = 130.8977;

let failures = 0;
const fail = (msg) => { failures++; console.error(`FAIL ${msg}`); };
const ok = (msg) => console.log(`  ok ${msg}`);

async function get(path) {
  const res = await fetch(BASE + path, { redirect: "follow" });
  const body = await res.text();
  return { status: res.status, body };
}

// 1. flagship: chart with a date param
{
  const { status, body } = await get(CHART);
  if (status !== 200) {
    fail(`${CHART} -> ${status} (expected 200). If the route code is fine, check Vercel WAF/firewall rules and the deployed commit.`);
  } else {
    const c = JSON.parse(body);
    const dSun = Math.abs(c.bodies?.sun?.lon - SUN_LON);
    const dAsc = Math.abs(c.angles?.asc - ASC);
    if (!(dSun < 0.05)) fail(`sun lon ${c.bodies?.sun?.lon} vs expected ${SUN_LON}`);
    else ok(`chart with date: 200, sun lon within 0.05 deg`);
    if (!(dAsc < 0.05)) fail(`asc ${c.angles?.asc} vs expected ${ASC}`);
    else ok(`asc within 0.05 deg`);
    if (c.cusps?.length !== 12) fail(`cusps length ${c.cusps?.length}`);
  }
}

// 2. unknown params must be ignored, not rejected (WAF allowlist canary)
{
  const { status } = await get(CHART + "&foo=bar");
  if (status !== 200) {
    fail(`unknown param foo=bar -> ${status} (expected 200): a parameter allowlist exists outside the repo`);
  } else ok("unknown query param ignored (no parameter allowlist in front)");
}

// 3. validation still rejects what it should
{
  const { status } = await get("/api/chart?date=1492-01-01T00:00:00Z&lat=0&lon=0");
  if (status !== 400) fail(`out-of-range date -> ${status} (expected 400)`);
  else ok("out-of-range date rejected with 400");
}

// 4. llms.txt serves
{
  const { status, body } = await get("/llms.txt");
  if (status !== 200 || !body.includes("caelus")) fail(`/llms.txt -> ${status}`);
  else ok("/llms.txt serves");
}

// 5. bare apex must redirect to www AND land on the real site. The 2026-06-12
// review's "production 400s" turned out to be the apex resolving to a parked
// GoDaddy site while www was healthy — this check covers that hole. A failure
// here with non-Vercel HTML means DNS, not the app.
if (BASE === "https://www.ephemengine.com") {
  try {
    const res = await fetch("https://ephemengine.com" + CHART, { redirect: "follow" });
    const c = res.status === 200 ? await res.json() : null;
    if (res.status !== 200 || !(Math.abs(c?.bodies?.sun?.lon - SUN_LON) < 0.05)) {
      fail(`apex ephemengine.com -> ${res.status} (expected redirect to www + 200): check DNS A record points at Vercel`);
    } else ok("apex redirects to www and serves the chart");
  } catch (err) {
    fail(`apex ephemengine.com unreachable: ${err.message} (DNS?)`);
  }
}

if (failures) {
  console.error(`\nlive smoke FAILED (${failures}) against ${BASE}`);
  process.exit(1);
}
console.log(`\nlive smoke passed against ${BASE}`);
