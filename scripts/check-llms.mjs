// llms.txt governance: the repo-root copy and the served copy must match,
// and the package versions it claims must match the package.json files.
import { readFileSync } from "node:fs";

let fail = 0;
const root = readFileSync("llms.txt", "utf8");
const served = readFileSync("apps/web/public/llms.txt", "utf8");
if (root !== served) {
  console.error("FAIL llms.txt: repo root and apps/web/public copies differ");
  fail = 1;
}

const PKGS = [
  ["caelus", "packages/caelus/package.json"],
  ["caelus-mcp", "packages/caelus-mcp/package.json"],
  ["caelus-birth", "packages/birth/package.json"],
  ["caelus-wheel", "packages/wheel/package.json"],
];
for (const [name, path] of PKGS) {
  const version = JSON.parse(readFileSync(path, "utf8")).version;
  const claim = `${name}@${version}`;
  if (!root.includes(claim)) {
    console.error(`FAIL llms.txt: expected "${claim}" (per ${path})`);
    fail = 1;
  }
}
console.log(fail ? "llms.txt check failed" : "llms.txt in sync");
process.exit(fail);
