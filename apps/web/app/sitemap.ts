import type { MetadataRoute } from "next";
import { SITE } from "../lib/site";
import { listApiDocs } from "../lib/api-docs";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/playground",
    "/validation",
    "/provenance",
    "/notes",
    "/changelog",
    "/docs",
    "/docs/quickstart",
    "/docs/charts",
    "/docs/architecture",
    "/docs/houses-and-zodiacs",
    "/docs/derived",
    "/docs/data-tiers",
    "/docs/recipes",
    "/docs/mcp",
    "/docs/edge-cases",
    "/docs/api",
    ...listApiDocs().map((s) => `/docs/api/${s}`),
  ];
  const now = new Date();
  return routes.map((path) => ({
    url: `${SITE.url}${path}`,
    lastModified: now,
    changeFrequency: path.startsWith("/docs/api") ? "monthly" : "weekly",
    priority: path === "" ? 1 : path.startsWith("/docs") ? 0.7 : 0.6,
  }));
}
