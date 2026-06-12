import { A, H2, P, Nav } from "../../components/Prose";

export const metadata = {
  title: "caelus — provenance",
  description:
    "Coefficients from published sources. Swiss Ephemeris is a test oracle only. Engine-by-engine comparison.",
};

const FIELD: Array<[string, string, string, string, string]> = [
  // name, link, license, accuracy, astrology coverage + runtime
  ["Swiss Ephemeris (sweph, WASM ports)", "https://www.astro.com/swisseph/swephinfo_e.htm",
    "AGPL-3.0 / 700 CHF", "0.001″",
    "houses, Chiron, nodes; native Node or 250 KB–1.7 MB WASM, plus data files"],
  ["astronomy-engine", "https://github.com/cosinekitty/astronomy",
    "MIT", "±60″",
    "no houses, Chiron, or nodes; 41 KB gz, browser and edge"],
  ["astronomia", "https://www.npmjs.com/package/astronomia",
    "MIT", "sub-arcsecond planets",
    "no astrology layer; 48 KB gz plus VSOP data"],
  ["ephemeris (Moshier port)", "https://www.npmjs.com/package/ephemeris",
    "GPL-3.0", "<0.1″ planets, ~3″ Moon",
    "no houses; 235 KB minified, stale since ~2020"],
  ["celestine", "https://github.com/Anonyfox/celestine",
    "MIT", "sub-arcsecond (claimed)",
    "houses (7 systems), Chiron, nodes; 59 KB gz, v0.2.x since Jan 2026"],
  ["Skyfield", "https://rhodesmill.org/skyfield/",
    "MIT", "milliarcsecond (JPL)",
    "no astrology layer; Python only, 32 MB–3.1 GB BSP files"],
];

export default function Provenance() {
  const td = { padding: "0.2rem 0.9rem 0.2rem 0", verticalAlign: "top" as const };
  const dim = { ...td, opacity: 0.55 };
  return (
    <main>
      <Nav current="/provenance" />
      <h1 style={{ letterSpacing: "0.05em" }}>sources</h1>
      <P>
        Most astrology software computes positions with{" "}
        <A href="https://www.astro.com/swisseph/swephinfo_e.htm">Swiss Ephemeris</A>.
        Since v2.10.1 (June 2021) it is AGPL-3.0, dual-licensed at{" "}
        <A href="https://www.astro.com/swisseph/swephprice_e.htm">700 CHF</A> for
        closed source.{" "}
        <A href="https://groups.io/g/swisseph/topic/change_of_license_from_gpl_to/82255295">
          Astrodienst&apos;s stated position
        </A>{" "}
        is that an application serving its results over a network must
        open-source the complete stack or buy the license. Open-source astrology
        libraries (kerykeion, immanuel, flatlib) sit on it and inherit those
        terms. Most commercial astrology APIs do not say what engine they run.
      </P>
      <P>
        caelus is written from the published record. Coefficients trace to
        public literature or public-domain ephemerides:
      </P>
      <table style={{ fontSize: "0.85em", lineHeight: 1.6, borderSpacing: 0 }}>
        <tbody>
          <tr><td style={td}>Planets</td><td style={td}>VSOP87D analytical theory</td><td style={dim}>Bretagnon &amp; Francou, 1988, Bureau des Longitudes</td></tr>
          <tr><td style={td}>Moon</td><td style={td}>Chebyshev fit of JPL DE423 (2010)</td><td style={dim}>NASA JPL (public domain); differs from DE440 by &lt;0.1″ here; re-fit planned</td></tr>
          <tr><td style={td}>Moon (embedded)</td><td style={td}>ELP2000-82 abridged series</td><td style={dim}>Chapront-Touzé &amp; Chapront, as published in Meeus ch. 47</td></tr>
          <tr><td style={td}>Pluto</td><td style={td}>Published periodic series</td><td style={dim}>Meeus, Astronomical Algorithms, ch. 37</td></tr>
          <tr><td style={td}>Chiron</td><td style={td}>Chebyshev fit of JPL Horizons</td><td style={dim}>NASA JPL small-body system (public domain)</td></tr>
          <tr><td style={td}>Nutation</td><td style={td}>IAU 1980 theory, 63-term abridged table</td><td style={dim}>Meeus ch. 22; terms ≥ 0.0003″ of the 106-term series</td></tr>
          <tr><td style={td}>Precession</td><td style={td}>IAU 1976 / Meeus formulations</td><td style={dim}>Lieske et al.</td></tr>
          <tr><td style={td}>ΔT</td><td style={td}>IERS observed values, held near current afterward</td><td style={dim}>International Earth Rotation Service; see build notes</td></tr>
          <tr><td style={td}>Houses</td><td style={td}>Spherical trigonometry from first principles</td><td style={dim}>semi-arc definitions, closed-form angles</td></tr>
        </tbody>
      </table>

      <H2>Other engines</H2>
      <P>
        Where caelus sits, checked February–June 2026. Sizes are gzipped where
        published:
      </P>
      <table style={{ fontSize: "0.85em", lineHeight: 1.6, borderSpacing: 0 }}>
        <thead>
          <tr style={{ opacity: 0.5, textAlign: "left" }}>
            <th style={td}>engine</th><th style={td}>license</th><th style={td}>accuracy</th><th style={td}>coverage and runtime</th>
          </tr>
        </thead>
        <tbody>
          {FIELD.map(([name, href, lic, acc, cov]) => (
            <tr key={name}>
              <td style={td}><A href={href}>{name}</A></td>
              <td style={td}>{lic}</td>
              <td style={td}>{acc}</td>
              <td style={dim}>{cov}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <P dim>
        celestine (MIT, January 2026) is the closest project: houses, Chiron,
        and nodes with no data files. Differences as of its v0.2.1: caelus
        publishes per-body oracle deltas (<A href="/validation">validation</A>)
        and ships an MCP server and edge API; celestine ships Koch,
        Regiomontanus, and Campanus houses, which caelus does not.
      </P>

      <H2>Swiss Ephemeris as oracle</H2>
      <P>
        During development, caelus positions were compared to Swiss Ephemeris
        2.10 at random instants across 1900–2099. No Swiss Ephemeris code or
        coefficient ships here. An early Chiron fit sampled its asteroid file
        offline; release uses JPL Horizons instead. The two Chiron integrations
        agree to 0.85″ worst-case across 1900–2099.
      </P>
      <H2>License</H2>
      <P>
        MIT. Ship in closed source, SaaS, mobile, or edge bundles without AGPL
        obligations or ephemeris file deployment. Engine plus embedded data is
        ~85 KB gzipped; same code in browser, edge API, and the{" "}
        <A href="https://www.npmjs.com/package/caelus-mcp">MCP server</A>.
      </P>
      <P dim>
        <A href="/validation">Validation tables →</A>
      </P>
    </main>
  );
}
