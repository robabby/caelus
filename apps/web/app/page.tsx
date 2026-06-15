import Link from "next/link";
import { Engine } from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { ChartWheel } from "caelus-wheel";
import SkyRibbon from "../components/SkyRibbon";
import PageClose from "../components/PageClose";
import PageHero from "../components/PageHero";
import CodeBlock from "../components/CodeBlock";
import FAQ from "../components/FAQ";
import { A, Lead, P, H2 } from "../components/Prose";
import { WHEEL_THEME } from "../lib/wheelTheme";
import { NPM, SITE } from "../lib/site";

export const metadata = {
  title: "Caelus · MIT astrological ephemeris engine",
  description:
    "Free MIT TypeScript engine for natal charts, the Hellenistic time-lords, and the Vedic system of dashas, vargas, and yogas. Runs in the browser, on edge, and in Node, with MCP tools for AI clients.",
  alternates: { canonical: "/" },
};

const PACKAGES: Array<[keyof typeof NPM, string, string]> = [
  ["caelus", "caelus", "Chart math: positions, houses, aspects. Zero dependencies, ~85 KB gzipped."],
  ["mcp", "caelus-mcp", "Twenty-nine chart tools for AI agents: natal charts, transits, synastry, event search, electional, lots, time-lords, directions, and the Vedic layer (nakshatras, dashas, vargas, yogas)."],
  ["birth", "caelus-birth", "Local birth time and place to UT, with DST and historical timezone rules."],
  ["wheel", "caelus-wheel", "React SVG chart wheel. SSR-safe, ~3.4 KB gzipped."],
];

// Credibility numbers surfaced above the fold. Each links to its proof.
const PROOF: Array<{ num: string; label: string; href: string }> = [
  { num: "0.41", label: "Nano-arcsec worst deviation", href: "/validation" },
  { num: "3,218", label: "Golden checks in CI", href: "/validation" },
  { num: "29", label: "MCP tools for AI clients", href: "/docs/mcp" },
  { num: "~85 KB", label: "Engine, gzipped", href: "/docs/data-tiers" },
  { num: "0", label: "Runtime dependencies", href: NPM.caelus },
  { num: "MIT", label: "Licensed, no AGPL", href: `${SITE.repo}/blob/main/LICENSE` },
];

// The home page's worked example is the canonical fixture: the exact chart the
// code sample computes, rendered server-side as static SVG (no client JS).
const homeChart = new Engine(embeddedData).chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus");

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: "Caelus",
  description: SITE.description,
  url: SITE.url,
  codeRepository: SITE.repo,
  programmingLanguage: "TypeScript",
  license: "https://opensource.org/licenses/MIT",
  keywords: "ephemeris, astrology, natal chart, MCP, TypeScript",
};

export default function Home() {
  return (
    <main className="container page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <PageHero
        eyebrow="TypeScript · browser, edge, and Node"
        title="A free, small, and complete Western and Vedic astrology engine"
        cta="hero"
        after={
          <div className="feature-stats" style={{ marginBottom: "0.5rem" }}>
            {PROOF.map((s) =>
              s.href.startsWith("/") ? (
                <Link key={s.label} href={s.href} className="card stat">
                  <span className="stat__num">{s.num}</span>
                  <span className="stat__label">{s.label}</span>
                </Link>
              ) : (
                <a key={s.label} href={s.href} className="card stat" target="_blank" rel="noreferrer">
                  <span className="stat__num">{s.num}</span>
                  <span className="stat__label">{s.label}</span>
                </a>
              ),
            )}
          </div>
        }
      >
        <Lead>
          Caelus computes natal charts and the classical techniques built on them,
          each convention validated against a named authority. The same TypeScript
          runs in the browser, on edge runtimes, and in Node, with MCP tools for AI
          clients. No Swiss Ephemeris, no AGPL, no ephemeris files on disk.
        </Lead>
      </PageHero>

      <div style={{ margin: "1.5rem 0 0.5rem" }}>
        <SkyRibbon />
      </div>

      <ul className="capability-list">
        <li>Sun through Pluto, Chiron, and nodes; twelve house systems; tropical and seven sidereal zodiacs</li>
        <li><A href="/docs/derived">Derived charts</A>: returns, progressions, solar arc, composite, Davison, harmonics, dignities, and sect</li>
        <li><A href="/docs/hellenistic">Hellenistic time-lords</A>: lots, profections, firdaria, zodiacal releasing, and primary directions</li>
        <li><A href="/docs/vedic">Vedic &amp; Jyotish</A>: nakshatras, the Vimshottari, Yogini, and Ashtottari dashas, divisional charts, and yogas</li>
        <li><A href="/docs/interpretation">Interpretation layer</A>: ranked, citable fact atoms, a pluggable rule corpus, and LLM briefs with citation auditing</li>
        <li><A href="/docs/provenance">Chart provenance</A>: declare what a chart is (forecast, mythic, archetypal) and route to the ephemeris or the compiler</li>
        <li><A href="/docs/mcp"><code>caelus-mcp</code></A> gives Claude, Cursor, and other MCP clients twenty-nine chart tools</li>
        <li>Charts can compute entirely in the browser, so an app never has to send birth data to a server</li>
      </ul>

      <P>
        You pass a date, UT time, latitude, and longitude; the engine returns a
        chart object for your app, API, or AI tool. The full capability list,
        with a comparison against the other engines, is on{" "}
        <A href="/features">Features</A>.
      </P>

      <H2>Compute a chart</H2>
      <CodeBlock lang="bash" code="npm install caelus" />
      <div className="home-compute">
        <CodeBlock
          lang="typescript"
          label="chart.ts"
          code={`import { Engine, fmtLon } from "caelus";
import { embeddedData } from "caelus/data-embedded";

const engine = new Engine(embeddedData);

const chart = engine.chart(
  1990, 6, 10, 14, 30, 0,
  27.95, -82.46,
  "placidus",
);

fmtLon(chart.bodies.sun.lon);   // "19°27' Gemini"
chart.bodies.saturn.retrograde; // true`}
        />
        <figure className="home-compute__chart">
          <div className="chart-fluid">
            <ChartWheel chart={homeChart} size={360} theme={WHEEL_THEME} />
          </div>
          <figcaption className="dim small" style={{ marginTop: "0.5rem" }}>
            The same chart, drawn by <code>caelus-wheel</code>: 1990-06-10 14:30 UT, Tampa.
          </figcaption>
        </figure>
      </div>
      <P dim>
        Full walkthrough in the <A href="/docs/quickstart">Quickstart</A>, or try it live in the{" "}
        <A href="/playground">Playground</A>. For a complete app, the{" "}
        <A href={SITE.starter}>caelus-starter</A> template is a Next.js project with a
        birth form, timezone handling, and a chart wheel, deployable to Vercel in one click.
      </P>

      <H2>The packages</H2>
      <div className="grid grid-2">
        {PACKAGES.map(([key, name, desc]) => (
          <a key={name} href={NPM[key]} className="card card-interactive">
            <code style={{ color: "var(--accent)" }}>{name}</code>
            <p className="dim small" style={{ margin: "0.5rem 0 0" }}>{desc}</p>
          </a>
        ))}
      </div>

      <H2>How it is checked</H2>
      <P>
        Two-stage CI. A Python reference engine is calibrated against Swiss
        Ephemeris, then the TypeScript port is replayed against 3,218 golden
        checks. Worst recorded deviation: 0.41 nano-arcseconds, far below any
        astronomical relevance, so a porting bug fails the build. Tables and
        methodology: <A href="/validation">Validation</A>. Bugs the suite caught:{" "}
        <A href="/notes">Build Notes</A>.
      </P>

      <FAQ />

      <PageClose />
    </main>
  );
}
