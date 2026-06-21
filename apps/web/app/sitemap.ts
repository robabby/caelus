import type { MetadataRoute } from "next";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SITE } from "../lib/site";
import { listApiDocs } from "../lib/api-docs";

// Next runs the build from apps/web, so source paths are resolved from here.
const ROOT = process.cwd();
const BUILD_DATE = new Date();

// Vercel shallow-clones (git clone --depth=10) by default, so files untouched
// in the last 10 commits would fall back to the build date. Setting
// VERCEL_DEEP_CLONE=true in project settings gives the build full history.
const IS_SHALLOW = (() => {
  try {
    return (
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === "true"
    );
  } catch {
    return false;
  }
})();

if (IS_SHALLOW) {
  console.warn(
    "[sitemap] shallow git clone detected: lastModified falls back to the build date. " +
      "Set VERCEL_DEEP_CLONE=true in project settings for accurate per-page dates.",
  );
}

/** Last git commit date for a source file, or the build date if unavailable. */
function gitDate(relPath: string): Date {
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", relPath],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return out ? new Date(out) : BUILD_DATE;
  } catch {
    return BUILD_DATE;
  }
}

/** Map a route to the source file whose history drives its freshness. */
function sourceFor(route: string): string {
  if (route === "") return "app/page.tsx";
  if (route === "/changelog") return join("..", "..", "CHANGELOG.md");
  if (route.startsWith("/docs/api/")) {
    return join("content", "api", `${route.slice("/docs/api/".length)}.md`);
  }
  const base = join("app", route.slice(1));
  for (const ext of ["page.mdx", "page.tsx"]) {
    const candidate = join(base, ext);
    if (existsSync(join(ROOT, candidate))) return candidate;
  }
  return join(base, "page.tsx");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/playground",
    "/features",
    "/validation",
    "/provenance",
    "/methods",
    "/how-it-was-built",
    "/notes",
    "/changelog",
    "/privacy",
    "/docs",
    "/docs/quickstart",
    "/docs/charts",
    "/docs/cookbook",
    "/docs/architecture",
    "/docs/houses-and-zodiacs",
    "/docs/derived",
    "/docs/hellenistic",
    "/docs/vedic",
    "/docs/data-tiers",
    "/docs/recipes",
    "/docs/electional",
    "/docs/visualizations",
    "/docs/interpretation",
    "/docs/provenance",
    "/docs/corpus",
    "/docs/mcp",
    "/docs/edge-cases",
    "/docs/api",
    ...listApiDocs().map((s) => `/docs/api/${s}`),
  ];
  return routes.map((path) => ({
    url: `${SITE.url}${path}`,
    lastModified: gitDate(sourceFor(path)),
    changeFrequency: path.startsWith("/docs/api") ? "monthly" : "weekly",
    priority: path === "" ? 1 : path.startsWith("/docs") ? 0.7 : 0.6,
  }));
}
