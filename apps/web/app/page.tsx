import SkyNow from "../components/SkyNow";
import Cta from "../components/Cta";
import { A, H2, P, Code, Pre, Nav } from "../components/Prose";

export const metadata = {
  title: "Caelus — the ephemeris is now just code",
  description:
    "MIT astrological ephemeris in ~85 KB of TypeScript: planets, Moon, Chiron, nodes, houses, aspects. No AGPL, no license fees, no ephemeris files. Browser, edge, Node, MCP.",
};

const PACKAGES: Array<[string, string, string]> = [
  ["caelus", "https://www.npmjs.com/package/caelus",
    "The engine: positions, houses, aspects. Zero dependencies, ~85 KB gzipped"],
  ["caelus-mcp", "https://www.npmjs.com/package/caelus-mcp",
    "Six chart tools for AI agents over MCP. Runs with npx, no install"],
  ["caelus-birth", "https://www.npmjs.com/package/caelus-birth",
    "Local birth time + place to UT: DST, historical timezones, edge cases flagged"],
  ["caelus-wheel", "https://www.npmjs.com/package/caelus-wheel",
    "React SVG chart wheel. SSR-safe, ~3.4 KB gzipped"],
];

export default function Home() {
  const a = { color: "#8a7fd4" };
  const td = { padding: "0.25rem 0.9rem 0.25rem 0", verticalAlign: "top" as const };
  return (
    <main>
      <Nav current="/" />
      <h1 style={{ letterSpacing: "0.05em" }}>Caelus</h1>
      <p style={{ fontSize: "1.1rem", opacity: 0.92, lineHeight: 1.55 }}>
        The ephemeris is now just code.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: "0.8rem 0", lineHeight: 2, opacity: 0.85 }}>
        <li>🪐 Full natal charts: 13 bodies, four house systems, aspects, in ~85 KB</li>
        <li>🆓 Free and MIT, commercial use included</li>
        <li>⚖️ No AGPL, no 700 CHF license</li>
        <li>📦 No ephemeris files: the data ships inside the bundle</li>
      </ul>
      <Cta />
      <SkyNow />

      <H2>The Packages</H2>
      <P>
        Four packages, all MIT, all on npm. Per-body accuracy against Swiss
        Ephemeris: <A href="/validation">Validation</A> ·{" "}
        <A href="/provenance">Sources</A>.
      </P>
      <table style={{ fontSize: "0.85em", lineHeight: 1.6, borderSpacing: 0 }}>
        <tbody>
          {PACKAGES.map(([name, href, desc]) => (
            <tr key={name}>
              <td style={td}><A href={href}><code>{name}</code></A></td>
              <td style={{ ...td, opacity: 0.7 }}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <H2 id="get-started">Get Started: Compute a Chart</H2>
      <Pre>{`npm install caelus

import { Engine, fmtLon } from "caelus";
import { embeddedData } from "caelus/data-embedded";

const engine = new Engine(embeddedData);
const chart = engine.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus");
fmtLon(chart.bodies.sun.lon);        // "19°27' Gemini"
chart.bodies.saturn.retrograde;      // true
chart.angles, chart.cusps, chart.aspects;`}</Pre>
      <P>
        The same code runs in the browser, on edge runtimes, and in Node.
        Times are UT; for local birth times use <Code>caelus-birth</Code> below.
        Full API: the{" "}
        <A href="https://www.npmjs.com/package/caelus">package README</A>.
      </P>

      <H2 id="mcp">Get Started: Ask Your AI About the Sky</H2>
      <P>
        No code required. <Code>caelus-mcp</Code> gives Claude, Cursor, or any
        MCP client six chart tools. Add this to{" "}
        <Code>claude_desktop_config.json</Code> or <Code>.cursor/mcp.json</Code>:
      </P>
      <Pre>{`{
  "mcpServers": {
    "caelus": { "command": "npx", "args": ["caelus-mcp"] }
  }
}`}</Pre>
      <P>Then ask in plain language:</P>
      <ul style={{ lineHeight: 1.9, paddingLeft: "1.2rem", opacity: 0.78 }}>
        <li>&ldquo;What&apos;s my natal chart? Born June 10 1990, 2:30pm, Tampa FL.&rdquo;</li>
        <li>&ldquo;When is Saturn square my natal Moon in the next two years?&rdquo;</li>
        <li>&ldquo;Compare my chart with my partner&apos;s.&rdquo;</li>
      </ul>
      <P>
        Tools: <Code>natal_chart</Code>, <Code>current_sky</Code>,{" "}
        <Code>transits</Code>, <Code>synastry</Code>,{" "}
        <Code>find_aspect_dates</Code>, <Code>rectification_grid</Code>.
        Positions are computed by the engine, never recalled from training
        data, and every answer is deterministic.
      </P>

      <H2>Get Started: Real Birth Times and a Wheel</H2>
      <P>
        <Code>caelus-birth</Code> converts a local birth time and place to UT
        with historical timezone rules. A four-hour timezone mistake moves the
        Ascendant about 60°; this package exists so that never happens
        silently. <Code>caelus-wheel</Code> renders the chart as an SVG wheel
        (<A href="/wheel-demo">live demo</A>).
      </P>
      <Pre>{`import { toUT } from "caelus-birth";
import { ChartWheel } from "caelus-wheel";

const t = toUT({ year: 1990, month: 6, day: 10, hour: 14, minute: 30,
                 lat: 27.95, lon: -82.46 });   // resolves America/New_York, EDT
const chart = engine.chart(/* t.utc fields */);

<ChartWheel chart={chart} size={520} showAspects />`}</Pre>

      <H2>What This Is</H2>
      <P>
        Caelus computes apparent geocentric positions for the Sun, Moon, eight
        planets, Pluto, Chiron, and both lunar nodes, with speeds, retrograde
        flags, ASC/MC, four house systems, and major aspects. Valid 1800–2149.
        The coefficient data ships inside the bundle: VSOP87D planets, an
        abridged ELP-2000/82 Moon, Meeus&apos;s Pluto series, and Chebyshev fits
        of JPL data for Chiron and the precise-Moon tier.
      </P>
      <P>
        The engine takes injected data and does no I/O, so one codebase serves
        three runtimes: this page (charts compute client-side in ~2 ms), the
        demo endpoint <Code>GET /api/chart</Code>, and Node, where{" "}
        <Code>caelus-mcp</Code> exposes six chart tools to AI agents over MCP.
      </P>

      <H2>Why It Exists</H2>
      <P>
        Most astrology software computes positions with{" "}
        <A href="https://www.astro.com/swisseph/swephinfo_e.htm">Swiss Ephemeris</A>,
        and it earned that position: JPL DE431 compressed to 0.001″. It is also
        a 1997 C library with process-global state, it reads 2–97 MB of
        ephemeris files from a filesystem, and since v2.10.1 (June 2021) it is{" "}
        <A href="https://groups.io/g/swisseph/topic/change_of_license_from_gpl_to/82255295">AGPL-3.0</A>,
        dual-licensed at{" "}
        <A href="https://www.astro.com/swisseph/swephprice_e.htm">700 CHF</A>{" "}
        for closed source. None of that maps onto browsers or edge runtimes.
      </P>
      <P>
        The MIT-licensed alternatives are astronomy libraries, not astrology
        engines:{" "}
        <A href="https://github.com/cosinekitty/astronomy">astronomy-engine</A>{" "}
        stops at ±1 arcminute and computes no houses, nodes, or Chiron;{" "}
        <A href="https://www.npmjs.com/package/astronomia">astronomia</A> has
        sub-arcsecond planets and no astrology layer. Caelus is written from
        the published record and covers the chart core at chart precision.
        Engine-by-engine comparison: <A href="/provenance">Sources</A>.
      </P>

      <H2>How It Is Checked</H2>
      <P>
        Two stages, both in CI. The Python reference is compared to Swiss
        Ephemeris 2.10 at hundreds of random instants across 1900–2099:
        planets ≤1″, precise-tier Moon ≤2.5″, angles and Placidus cusps ≤3.2″.
        The TypeScript engine must match the reference across 3,087 golden
        fixtures; worst recorded deviation 1.64 nano-arcseconds. Per-body
        deltas: <A href="/validation">Validation</A>. Bugs the suite caught:{" "}
        <A href="/notes">Build Notes</A>.
      </P>

      <p style={{ marginTop: "2rem", display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
        <a style={a} href="https://www.npmjs.com/package/caelus">npm install caelus</a>
        <a style={a} href="https://github.com/heavyblotto/caelus">GitHub</a>
        <a style={a} href="/api/chart?lat=27.94&lon=-82.46">REST API</a>
        <a style={a} href="https://www.npmjs.com/package/caelus-mcp">MCP Server</a>
      </p>
    </main>
  );
}
