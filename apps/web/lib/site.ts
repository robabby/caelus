/**
 * Single source of truth for site-wide constants and link sets used by the
 * header, footer, and metadata. Keeping the version here avoids drift across
 * the header tag, footer, and OpenGraph copy.
 */
export const SITE = {
  name: "Caelus",
  version: "0.8.0",
  url: "https://www.ephemengine.com",
  tagline: "MIT astrological ephemeris engine in TypeScript.",
  repo: "https://github.com/heavyblotto/caelus",
  starter: "https://github.com/heavyblotto/caelus-starter",
  description:
    "MIT astrological ephemeris engine in TypeScript. Natal charts, houses, aspects, and event search. Runs in the browser, on edge, and in Node, with MCP tools for AI clients. No AGPL, no ephemeris files.",
} as const;

export const NPM = {
  caelus: "https://www.npmjs.com/package/caelus",
  mcp: "https://www.npmjs.com/package/caelus-mcp",
  birth: "https://www.npmjs.com/package/caelus-birth",
  wheel: "https://www.npmjs.com/package/caelus-wheel",
} as const;

export const PYPI = {
  caelusEngine: "https://pypi.org/project/caelus-engine/",
} as const;

export type NavItem = { href: string; label: string };

/** Primary navigation (home is reached through the wordmark). */
export const NAV: NavItem[] = [
  { href: "/docs", label: "Docs" },
  { href: "/playground", label: "Playground" },
  { href: "/validation", label: "Validation" },
  { href: "/provenance", label: "Provenance" },
  { href: "/notes", label: "Build Notes" },
];

export type FooterColumn = { title: string; links: Array<NavItem & { external?: boolean }> };

export type DocsGroup = { title: string; items: NavItem[] };

/** Sidebar for the /docs section. */
export const DOCS_NAV: DocsGroup[] = [
  {
    title: "Getting Started",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/charts", label: "Computing Charts" },
    ],
  },
  {
    title: "Guides",
    items: [
      { href: "/docs/architecture", label: "Architecture" },
      { href: "/docs/houses-and-zodiacs", label: "Houses & Zodiacs" },
      { href: "/docs/derived", label: "Derived Charts" },
      { href: "/docs/data-tiers", label: "Data Tiers" },
      { href: "/docs/recipes", label: "Recipes" },
    ],
  },
  {
    title: "Integrations",
    items: [{ href: "/docs/mcp", label: "MCP Setup" }],
  },
  {
    title: "Reference",
    items: [
      { href: "/docs/api", label: "API Reference" },
      { href: "/docs/edge-cases", label: "Edge Cases & Stability" },
      { href: "/changelog", label: "Changelog" },
    ],
  },
];

export const FOOTER: FooterColumn[] = [
  {
    title: "Packages",
    links: [
      { href: NPM.caelus, label: "caelus", external: true },
      { href: NPM.mcp, label: "caelus-mcp", external: true },
      { href: NPM.birth, label: "caelus-birth", external: true },
      { href: NPM.wheel, label: "caelus-wheel", external: true },
      { href: PYPI.caelusEngine, label: "caelus-engine (PyPI)", external: true },
    ],
  },
  {
    title: "Documentation",
    links: [
      { href: "/docs", label: "Docs home" },
      { href: "/docs/api", label: "API reference" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/mcp", label: "MCP setup" },
      { href: "/llms.txt", label: "llms.txt", external: true },
    ],
  },
  {
    title: "Project",
    links: [
      { href: SITE.repo, label: "GitHub", external: true },
      { href: SITE.starter, label: "Starter template", external: true },
      { href: `${SITE.repo}/blob/main/ROADMAP.md`, label: "Roadmap", external: true },
      { href: "/changelog", label: "Changelog" },
      { href: "/methods", label: "Methods" },
      { href: "/validation", label: "Validation" },
      { href: "/provenance", label: "Provenance" },
      { href: "/api/chart?lat=27.94&lon=-82.46", label: "REST API", external: true },
    ],
  },
];
