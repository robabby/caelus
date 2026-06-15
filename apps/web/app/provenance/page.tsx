import { A, Eyebrow, H2, P } from "../../components/Prose";
import { SITE } from "../../lib/site";

export const metadata = {
  title: "Provenance",
  description:
    "Coefficients from published sources. Swiss Ephemeris is a test oracle only. Engine-by-engine comparison.",
  alternates: { canonical: "/provenance" },
};

const FIELD: Array<[string, string, string, string, string]> = [
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

const SOURCES: Array<[string, string, React.ReactNode]> = [
  ["Planets", "VSOP87D analytical theory", "Bretagnon & Francou, 1988, Bureau des Longitudes"],
  ["Moon", "Chebyshev fit of JPL DE423 (2010)", "NASA JPL (public domain); differs from DE440 by <0.1″ here; re-fit planned"],
  ["Moon (embedded)", "ELP2000-82 abridged series", "Chapront-Touzé & Chapront, as published in Meeus ch. 47"],
  ["Pluto", "Published periodic series", "Meeus, Astronomical Algorithms, ch. 37"],
  ["Chiron", "Chebyshev fit of JPL Horizons", "NASA JPL small-body system (public domain); raw Horizons samples committed in-repo"],
  ["Nutation", "IAU 1980 theory, 63-term abridged table", "Meeus ch. 22; terms ≥ 0.0003″ of the 106-term series"],
  ["Precession", "IAU 1976 / Meeus formulations", "Lieske et al."],
  ["ΔT", "IERS observed values; near-flat then slow tidal rise afterward", <>International Earth Rotation Service; see <A href="/notes">Build Notes</A></>],
  ["Houses", "Spherical trigonometry from first principles", "semi-arc definitions, closed-form angles"],
];

export default function Provenance() {
  return (
    <main className="container page">
      <Eyebrow>Provenance</Eyebrow>
      <h1>Sources</h1>
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
        Caelus is written from the published record. Coefficients trace to
        public literature or public-domain ephemerides:
      </P>
      <table className="data-table table-auto" style={{ fontSize: "0.85rem" }}>
        <tbody>
          {SOURCES.map(([what, src, cite], i) => (
            <tr key={i}>
              <td>{what}</td>
              <td>{src}</td>
              <td className="dim">{cite}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <H2>Other engines</H2>
      <P>
        Where Caelus sits, checked February–June 2026. Sizes are gzipped where
        published:
      </P>
      <div className="table-scroll">
        <table className="data-table table-auto" style={{ fontSize: "0.85rem" }}>
          <thead>
            <tr><th>Engine</th><th>License</th><th>Accuracy</th><th>Coverage and runtime</th></tr>
          </thead>
          <tbody>
            {FIELD.map(([name, href, lic, acc, cov]) => (
              <tr key={name}>
                <td><A href={href}>{name}</A></td>
                <td>{lic}</td>
                <td>{acc}</td>
                <td className="dim">{cov}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <P dim>
        celestine (MIT, January 2026) is the closest project: houses, Chiron,
        and nodes with no data files. Differences as of its v0.2.1: Caelus
        publishes per-body oracle deltas (<A href="/validation">Validation</A>)
        and ships an MCP server and edge API; celestine ships Koch,
        Regiomontanus, and Campanus houses, which Caelus does not.
      </P>

      <H2>Swiss Ephemeris as oracle</H2>
      <P>
        During development, Caelus positions were compared to Swiss Ephemeris
        2.10 at random instants across 1850–2150. No Swiss Ephemeris code or
        coefficient ships here. An early Chiron fit sampled its asteroid file
        offline; release uses JPL Horizons instead. The two Chiron integrations
        agree to 0.85″ worst-case across 1900–2099.
      </P>
      <H2>License</H2>
      <P>
        MIT. Ship in closed source, SaaS, mobile, or edge bundles without AGPL
        obligations or ephemeris file deployment. Engine plus embedded data is
        ~85 KB gzipped, so a full chart computes in the browser; the same code
        runs on the edge API and the{" "}
        <A href="https://www.npmjs.com/package/caelus-mcp">MCP Server</A>.
      </P>
      <P>
        Because the engine is small enough to run in the browser, an app can
        compute a chart on the user&apos;s device and never send their birth
        time or place to a server. The{" "}
        <A href={SITE.starter}>caelus-starter</A> works this way, which sidesteps
        a lot of privacy and GDPR overhead: there is no birth data to store,
        transfer, or lose. A Swiss Ephemeris stack has a harder time here. Its
        AGPL license applies once you serve results over a network, and its
        accuracy depends on ephemeris files too large to ship to the browser.
      </P>
      <P dim>
        <A href="/validation">Validation tables →</A>
      </P>
    </main>
  );
}
