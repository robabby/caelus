import { A, H2, P, Code, Nav } from "../../components/Prose";

export const metadata = {
  title: "caelus — validation",
  description: "Reference engine vs Swiss Ephemeris; TypeScript port vs 1,438 golden checks. CI on every commit.",
};

const BODY_TABLE: Array<[string, string, string, string]> = [
  ["Sun", "0.4″", "0.2″", ""],
  ["Moon (precise tier)", "2.5″", "0.9″", "JPL DE423 fit (2010); DE423 vs DE440 is <0.1″ over this span"],
  ["Moon (embedded series)", "9.6″", "2.8″", "60-term ELP abridged"],
  ["Mercury", "0.5″", "0.2″", ""],
  ["Venus", "0.8″", "0.2″", ""],
  ["Mars", "0.7″", "0.2″", ""],
  ["Jupiter", "0.9″", "0.3″", ""],
  ["Saturn", "0.8″", "0.4″", ""],
  ["Uranus", "1.9″", "0.7″", "series truncation; complete VSOP87 holds ≤1″"],
  ["Neptune", "4.6″", "2.2″", "series truncation; complete VSOP87 holds ≤1″"],
  ["Pluto", "2.5″", "1.0″", "series valid 1885–2099"],
  ["Chiron", "1.0″", "0.3″", "JPL Horizons fit, 1850–2150"],
  ["Mean node", "0.1″", "0.1″", ""],
  ["True node", "61″", "12″", "osculating element; rounds to the 1′ display step"],
  ["Ascendant / MC", "3.2″", "—", ""],
  ["Placidus cusps (all 12)", "3.2″", "—", ""],
];

export default function Validation() {
  const td = { padding: "0.15rem 0.8rem 0.15rem 0", verticalAlign: "top" as const };
  return (
    <main>
      <Nav current="/validation" />
      <h1 style={{ letterSpacing: "0.05em" }}>validation</h1>
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
            <th style={td}>body</th><th style={td}>max</th><th style={td}>rms</th><th style={td}>note</th>
          </tr>
        </thead>
        <tbody>
          {BODY_TABLE.map(([b, mx, rms, note]) => (
            <tr key={b}>
              <td style={td}>{b}</td><td style={td}>{mx}</td><td style={td}>{rms}</td>
              <td style={{ ...td, opacity: 0.55 }}>{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <P dim>
        Chart software usually displays to the arcminute (60″). Birth-time uncertainty
        dominates these deltas. Post-2025 instants also depend on each engine&apos;s
        ΔT extrapolation, which no model can pin down:{" "}
        <A href="/notes">build notes</A>.
      </P>
      <H2>TypeScript port vs reference</H2>
      <P>
        <strong>1,438 golden checks</strong> (bodies, timescales, nutation, four house
        systems, speeds, retrograde flags, polar Placidus fallback). Worst deviation
        1.6 nano-arcseconds. Same algorithms in IEEE doubles; tolerance is far below
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
