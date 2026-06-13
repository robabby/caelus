import { A, H2, P, Code, Nav } from "../../components/Prose";
import accuracy from "caelus/accuracy.json";

export const metadata = {
  title: "Caelus — Validation",
  description: "Reference engine vs Swiss Ephemeris; TypeScript port vs 3,218 golden checks. CI on every commit.",
};

// Canonical per-body accuracy lives in packages/caelus/accuracy.json so prose,
// SkyNow, and the MCP description derive from one source (lint:claims gate).
const fmt = (v: string) => (v === "—" ? "—" : `${v}″`);

export default function Validation() {
  const td = { padding: "0.15rem 0.8rem 0.15rem 0", verticalAlign: "top" as const };
  return (
    <main>
      <Nav current="/validation" />
      <h1 style={{ letterSpacing: "0.05em" }}>Validation</h1>
      <P>
        Reference engine checked against Swiss Ephemeris; TypeScript port checked
        against golden fixtures. CI runs both on every commit.
      </P>
      <H2>Reference vs Swiss Ephemeris 2.10</H2>
      <P>
        Python reference vs Swiss Ephemeris at hundreds of random instants in
        1900–2099: apparent geocentric ecliptic longitude (true equinox of date),
        all bodies, angles and cusps at six latitudes including polar Iceland.
        Max and RMS disagreement in arcseconds:
      </P>
      <table style={{ fontSize: "0.85em", lineHeight: 1.55, borderSpacing: 0 }}>
        <thead>
          <tr style={{ opacity: 0.5, textAlign: "left" }}>
            <th style={td}>Body</th><th style={td}>Max</th><th style={td}>RMS</th><th style={td}>Note</th>
          </tr>
        </thead>
        <tbody>
          {accuracy.bodies.map((row) => (
            <tr key={row.name}>
              <td style={td}>{row.name}</td><td style={td}>{fmt(row.max)}</td><td style={td}>{fmt(row.rms)}</td>
              <td style={{ ...td, opacity: 0.55 }}>{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <P dim>
        Chart software usually displays to the arcminute (60″). Birth-time uncertainty
        dominates these deltas. Post-2025 instants also depend on each engine&apos;s
        ΔT extrapolation, which no model can pin down:{" "}
        <A href="/notes">Build Notes</A>.
      </P>
      <H2>TypeScript Port vs Reference</H2>
      <P>
        <strong>3,218 golden checks</strong> (bodies, timescales, nutation, twelve house
        systems, fixed stars, Gauquelin sectors, eclipses, speeds, retrograde flags,
        polar Placidus fallback). Worst deviation
        1.64 nano-arcseconds. Same algorithms in IEEE doubles; tolerance is far below
        astronomical relevance: a porting bug fails the build.
      </P>
      <H2>Cross-checks</H2>
      <P>
        Moon fit to JPL DE423: 0.19 km residual (≈0.1″). Chiron fit from Horizons
        vs Swiss Ephemeris asteroid file: 0.85″ worst-case. MCP aspect-date search
        verified hit-for-hit against an independent scan (nine Mars sextiles, minute
        agreement, retrograde triple pass included).
      </P>
      <H2>Reproduce</H2>
      <P>
        <Code>git clone</Code> the <A href="https://github.com/heavyblotto/caelus">repo</A>,{" "}
        <Code>npm install &amp;&amp; npm run build &amp;&amp; npm test</Code>.
        Discrepancy vs any professional ephemeris: open an issue with UTC instant and
        coordinates.
      </P>
      <P dim>
        Range 1800–2149 (1850–2150 for precise Moon/Chiron). No eclipses or topocentric
        positions yet. Placidus undefined above polar circles: falls back to whole-sign
        and reports the fallback in the response.{" "}
        <A href="/notes">Build notes →</A>
      </P>
    </main>
  );
}
