/**
 * Ensure caelus-delineations-pd is built before web dev/build (the /pd subpath
 * resolves to dist/src/pd.js via package exports).
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const PD = ROOT + "packages/caelus-delineations-pd/dist/src/pd.js";

if (existsSync(PD)) process.exit(0);

console.log("ensure-delineations-pd: building caelus-delineations-pd…");
execFileSync("npm", ["run", "build", "-w", "caelus-delineations-pd"], {
  cwd: ROOT,
  stdio: "inherit",
});
