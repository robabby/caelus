import SkyRibbon from "../components/SkyRibbon";
import Cta from "../components/Cta";
import CodeBlock from "../components/CodeBlock";
import FAQ from "../components/FAQ";
import { A, Eyebrow, Lead, P, H2 } from "../components/Prose";
import { NPM, SITE } from "../lib/site";

export const metadata = {
  title: "Caelus · MIT astrological ephemeris engine",
  description:
    "Free MIT TypeScript engine for natal charts, the Hellenistic time-lords, and the Vedic system of dashas, vargas, and yogas. Runs in the browser, on edge, and in Node, with MCP tools for AI clients.",
  alternates: { canonical: "/" },
};

const PACKAGES: Array<[keyof typeof NPM, string, string]> = [
  ["caelus", "caelus", "Chart math: positions, houses, aspects. Zero dependencies, ~85 KB gzipped."],
  ["mcp", "caelus-mcp", "Twenty-four chart tools for AI agents: natal charts, transits, synastry, event search, electional, lots, time-lords, directions, and the Vedic layer (nakshatras, dashas, vargas, yogas)."],
  ["birth", "caelus-birth", "Local birth time and place to UT, with DST and historical timezone rules."],
  ["wheel", "caelus-wheel", "React SVG chart wheel. SSR-safe, ~3.4 KB gzipped."],
];

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

      <Eyebrow>MIT · zero dependencies · ~85 KB</Eyebrow>
      <h1>A free, small, and complete Western and Vedic astrology engine</h1>
      <Lead>
        Caelus computes natal charts and the techniques built on them: houses
        and aspects, the Hellenistic time-lords, and the Vedic dashas, vargas,
        and yogas, each convention validated against a named authority. The same
        TypeScript runs in the browser, on edge runtimes, and in Node, with MCP
        tools for AI clients. No Swiss Ephemeris, no AGPL, no ephemeris files on
        disk.
      </Lead>
      <Cta />

      <div style={{ margin: "2rem 0" }}>
        <SkyRibbon />
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: "1.5rem 0", display: "grid", gap: "0.6rem", lineHeight: 1.5 }}>
        <li>🪐 Sun through Pluto, Chiron, and nodes; twelve house systems; tropical and seven sidereal zodiacs</li>
        <li>🧩 <A href="/docs/derived">Derived charts</A>: returns, progressions, solar arc, composite, Davison, harmonics, dignities, and sect</li>
        <li>⏳ <A href="/docs/hellenistic">Hellenistic time-lords</A>: lots, profections, firdaria, zodiacal releasing, and primary directions</li>
        <li>🕉️ <A href="/docs/vedic">Vedic &amp; Jyotish</A>: nakshatras, the Vimshottari, Yogini, and Ashtottari dashas, divisional charts, and yogas</li>
        <li>🤖 <A href="/docs/mcp"><code>caelus-mcp</code></A> gives Claude, Cursor, and other MCP clients twenty-four chart tools</li>
        <li>🆓 MIT licensed, with no Swiss Ephemeris and no ephemeris files to deploy</li>
        <li>🔒 Charts can compute entirely in the browser, so an app never has to send birth data to a server</li>
      </ul>

      <P>
        You pass a date, UT time, latitude, and longitude; the engine returns a
        chart object for your app, API, or AI tool. Per-body accuracy is published,
        not asserted: <A href="/validation">Validation</A>. Coefficient sources:{" "}
        <A href="/provenance">Provenance</A>. The full capability list is on{" "}
        <A href="/features">Features</A>.
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

      <H2>Compute a chart</H2>
      <CodeBlock lang="bash" code="npm install caelus" />
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
      <P dim>
        Full walkthrough in the <A href="/docs/quickstart">Quickstart</A>, or try it live in the{" "}
        <A href="/playground">Playground</A>. For a complete app, the{" "}
        <A href={SITE.starter}>caelus-starter</A> template is a Next.js project with a
        birth form, timezone handling, and a chart wheel, deployable to Vercel in one click.
      </P>

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
    </main>
  );
}
