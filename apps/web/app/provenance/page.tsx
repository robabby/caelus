import { A, H2, P, Nav } from "../../components/Prose";

export const metadata = {
  title: "caelus — provenance",
        description: "Coefficients from published sources. Swiss Ephemeris is a test oracle only.",
};

export default function Provenance() {
  const td = { padding: "0.2rem 0.9rem 0.2rem 0", verticalAlign: "top" as const };
  const dim = { ...td, opacity: 0.55 };
  return (
    <main>
      <Nav current="/provenance" />
      <h1 style={{ letterSpacing: "0.05em" }}>sources</h1>
      <P>
        Most astrology stacks call Swiss Ephemeris. It is accurate and AGPL: network
        use generally requires open-sourcing your code unless you buy a commercial
        license. Many &ldquo;independent&rdquo; APIs are thin wrappers.
      </P>
      <P>
        caelus is written from the published record. Coefficients trace to public
        literature or public-domain ephemerides:
      </P>
      <table style={{ fontSize: "0.85em", lineHeight: 1.6, borderSpacing: 0 }}>
        <tbody>
          <tr><td style={td}>Planets</td><td style={td}>VSOP87D analytical theory</td><td style={dim}>Bretagnon &amp; Francou, 1988, Bureau des Longitudes</td></tr>
          <tr><td style={td}>Moon</td><td style={td}>Chebyshev fit of JPL DE423</td><td style={dim}>NASA JPL numerical integration (public domain)</td></tr>
          <tr><td style={td}>Moon (embedded)</td><td style={td}>ELP2000-82 abridged series</td><td style={dim}>Chapront-Touzé &amp; Chapront, as published in Meeus</td></tr>
          <tr><td style={td}>Pluto</td><td style={td}>Published periodic series</td><td style={dim}>Meeus, Astronomical Algorithms, ch. 37</td></tr>
          <tr><td style={td}>Chiron</td><td style={td}>Chebyshev fit of JPL Horizons</td><td style={dim}>NASA JPL small-body system (public domain)</td></tr>
          <tr><td style={td}>Nutation</td><td style={td}>IAU 1980 theory, 63 terms</td><td style={dim}>International Astronomical Union</td></tr>
          <tr><td style={td}>Precession</td><td style={td}>IAU 1976 / Meeus formulations</td><td style={dim}>Lieske et al.</td></tr>
          <tr><td style={td}>ΔT</td><td style={td}>IERS observed values + modern extrapolation</td><td style={dim}>International Earth Rotation Service</td></tr>
          <tr><td style={td}>Houses</td><td style={td}>Spherical trigonometry from first principles</td><td style={dim}>semi-arc definitions, closed-form angles</td></tr>
        </tbody>
      </table>
      <H2>Swiss Ephemeris as oracle</H2>
      <P>
        During development, caelus positions were compared to Swiss Ephemeris 2.10
        at random instants across 1900–2099. No Swiss Ephemeris code or coefficient
        ships here. An early Chiron fit sampled its asteroid file offline; release
        uses JPL Horizons instead. The two Chiron integrations agree to 0.85″
        worst-case across 1900–2099.
      </P>
      <H2>License</H2>
      <P>
        MIT. Ship in closed source, SaaS, mobile, or edge bundles without AGPL
        obligations or ephemeris file deployment. Engine plus embedded data is ~85 KB
        gzipped; same code in browser, edge API, and the{" "}
        <A href="https://www.npmjs.com/package/caelus-mcp">MCP server</A>.
      </P>
      <P dim>
        <A href="/validation">Validation tables →</A>
      </P>
    </main>
  );
}
