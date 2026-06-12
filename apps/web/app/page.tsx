import SkyNow from "../components/SkyNow";
import TryIt from "../components/TryIt";
import { A, H2, P, Code, Nav } from "../components/Prose";

export const metadata = {
  title: "Caelus — the ephemeris is now just code",
  description:
    "MIT astrological ephemeris in ~85 KB of TypeScript: planets, Moon, Chiron, nodes, houses, aspects. No AGPL, no license fees, no ephemeris files. Browser, edge, Node, MCP.",
};

export default function Home() {
  const a = { color: "#8a7fd4" };
  return (
    <main>
      <Nav current="/" />
      <h1 style={{ letterSpacing: "0.05em" }}>Caelus</h1>
      <p style={{ fontSize: "1.1rem", opacity: 0.92, lineHeight: 1.55 }}>
        The ephemeris is now just code.
        <br />
        No AGPL. No license fees. No ephemeris files.
      </p>
      <p style={{ opacity: 0.7 }}>
        The core engine is ~85 KB gzipped, has zero dependencies, and runs
        anywhere JavaScript runs, under MIT. Per-body accuracy against Swiss
        Ephemeris: <A href="/validation">Validation</A> ·{" "}
        <A href="/provenance">Sources</A>.
      </p>
      <TryIt />
      <SkyNow />

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
        The TypeScript engine must match the reference across 1,438 golden
        fixtures; worst recorded deviation 1.6 nano-arcseconds. Per-body
        deltas: <A href="/validation">Validation</A>. Bugs the suite caught:{" "}
        <A href="/notes">Build Notes</A>.
      </P>

      <H2>What Ships</H2>
      <P>
        <Code>caelus</Code>: the engine, ~85 KB gzipped embedded tier; a 729 KB
        precise-Moon tier (1920–2080) lazy-loads on demand.{" "}
        <Code>caelus-mcp</Code>: natal_chart, current_sky, transits, synastry,
        find_aspect_dates, rectification_grid over stdio. LLMs interpolate
        planetary positions from training data; the MCP tools let them compute
        instead. <Code>GET /api/chart</Code>: the same engine on the edge
        runtime, as a demo, not hosted infrastructure.
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
