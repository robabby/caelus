/**
 * Ensure conformance-stats.json exists for local web dev/build.
 * No-op when the file is already present or the golden suite is not built yet.
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const STATS = ROOT + "conformance-stats.json";
const GOLDEN = ROOT + "packages/caelus/dist/test/golden.test.js";

if (existsSync(STATS)) process.exit(0);
if (!existsSync(GOLDEN)) {
  console.warn(
    "ensure-conformance-stats: conformance-stats.json missing and caelus is not built.\n" +
      "  Run: npm run build -w caelus && npm run stats:golden",
  );
  process.exit(0);
}

execFileSync("node", [GOLDEN], {
  env: { ...process.env, CAELUS_STATS_OUT: STATS },
  stdio: "inherit",
});
