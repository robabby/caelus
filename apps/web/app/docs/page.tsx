import Link from "next/link";
import { Eyebrow, Lead, P } from "../../components/Prose";

export const metadata = {
  title: "Documentation",
  description: "Guides and API reference for the caelus ephemeris engine: quickstart, charts, houses and zodiacs, data tiers, MCP setup, and recipes.",
};

const CARDS: Array<[string, string, string]> = [
  ["/docs/quickstart", "Quickstart", "Install caelus and compute your first chart in the browser or Node."],
  ["/docs/charts", "Computing Charts", "The chart object: bodies, angles, cusps, aspects, and the UT vs local-time hazard."],
  ["/docs/houses-and-zodiacs", "Houses & Zodiacs", "Twelve house systems, tropical and sidereal modes, and polar fallbacks."],
  ["/docs/data-tiers", "Data Tiers", "Embedded vs Node loader: what ships in the bundle and what loads lazily."],
  ["/docs/mcp", "MCP Setup", "Add seven chart tools to Claude, Cursor, and other MCP clients."],
  ["/docs/recipes", "Recipes", "Transits, the when() query language, event search, and chart wheels."],
  ["/docs/api", "API Reference", "Generated reference for the caelus package surface."],
  ["https://github.com/heavyblotto/caelus-starter", "Starter template", "A full Next.js app: birth form, timezone handling, chart wheel. Clone and deploy."],
  ["/changelog", "Changelog", "Release notes for all four packages, versioned in lockstep."],
];

export default function DocsHome() {
  return (
    <>
      <Eyebrow>Documentation</Eyebrow>
      <h1>Documentation</h1>
      <Lead>
        Caelus is an MIT ephemeris engine: planetary positions, houses, aspects,
        and astronomical events, with no ephemeris files on disk.
      </Lead>
      <P>
        New here? Start with the <Link href="/docs/quickstart">Quickstart</Link>, then
        read <Link href="/docs/charts">Computing Charts</Link>. The full package surface
        is in the <Link href="/docs/api">API Reference</Link>.
      </P>
      <div className="grid grid-2" style={{ marginTop: "1.5rem" }}>
        {CARDS.map(([href, title, desc]) => {
          const inner = (
            <>
              <strong>{title}</strong>
              <p className="dim small" style={{ margin: "0.4rem 0 0" }}>{desc}</p>
            </>
          );
          return href.startsWith("http") ? (
            <a key={href} href={href} target="_blank" rel="noreferrer" className="card card-interactive">
              {inner}
            </a>
          ) : (
            <Link key={href} href={href} className="card card-interactive">
              {inner}
            </Link>
          );
        })}
      </div>
    </>
  );
}
