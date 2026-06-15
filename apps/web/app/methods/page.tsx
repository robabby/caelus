import { A, Eyebrow, H2, P, Note } from "../../components/Prose";

export const metadata = {
  title: "Methods",
  description:
    "How the engine is built from published math and how each result is checked: reference-first ports, Swiss Ephemeris and JPL Horizons as independent yardsticks, and effects recovered by fitting.",
  alternates: { canonical: "/methods" },
};

export default function Methods() {
  return (
    <main className="container page">
      <Eyebrow>Methods</Eyebrow>
      <h1>Methods</h1>
      <P>
        Caelus is written from the published record, then checked against two
        independent references before any figure is quoted. The per-body numbers
        live on <A href="/validation">Validation</A>; the source citations live
        on <A href="/provenance">Provenance</A>. This page covers how a model
        gets from a paper to a tested result.
      </P>

      <H2>Reference-first</H2>
      <P>
        Every model lands first in the Python reference. That reference emits
        golden fixtures: position and event values at fixed instants, written to
        JSON. The TypeScript engine is a port of the same math, and a conformance
        suite replays the fixtures against it on every commit. The port has to
        reproduce the reference to the last digit the fixture records. A red run
        blocks merge.
      </P>
      <P>
        The core reads no files and makes no network calls. Coefficient tables
        are compiled in or loaded as plain data, so the same code path runs in
        the browser, on an edge runtime, and in Node. A model is not shipped
        until the reference, its fixtures, and the port all agree.
      </P>

      <H2>Two independent yardsticks</H2>
      <P>
        <A href="https://www.astro.com/swisseph/swephinfo_e.htm">
          Swiss Ephemeris
        </A>{" "}
        2.10 is the calibration oracle. It shares the apparent-place definition
        used here, geocentric ecliptic longitude at the true equinox of date, so
        a comparison at random instants across 1850&ndash;2150 shows whether the
        model matches the field standard. No Swiss Ephemeris code or coefficient
        ships in Caelus. It is a test target only.
      </P>
      <P>
        <A href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons</A> is the
        independent reference. Its apparent geocentric right ascension and
        declination come from a different source and a different frame, sampled
        at a separate set of epochs. Agreement with Swiss alone could mean two
        implementations of the same textbook share a bias; agreement with
        Horizons as well shows the result tracks the underlying ephemeris. The
        Sun and inner planets sit near a tenth of an arcsecond against Horizons,
        the Moon near two tenths, and the giant planets within a few arcseconds.
      </P>

      <H2>Validating the conventions</H2>
      <P>
        The traditional techniques (the Hellenistic time-lords and the
        Vedic dashas, vargas, and yogas) are deterministic arithmetic, but
        many carry named convention variants where the texts disagree. Caelus
        applies the same discipline to the conventions as to the positions:
        rather than assert one reading, each technique is pinned to a named
        authority (the Brihat Parashara Hora Shastra, or the JHora/PVR
        Narasimha Rao implementation where the texts differ), and a
        reference tier (<code>validate_jyotish</code>) replays a committed,
        per-check-cited set so every convention choice is validated against a
        named source, not memory. It runs no external tool, keeping the engine
        free of any Swiss Ephemeris dependency.
      </P>

      <Note>
        Swiss Ephemeris in Moshier mode carries its own model error. Where a
        quantity is measured against that built-in theory rather than the full
        JPL files, the gap is reported as the theory&apos;s error, not assigned
        to Caelus. The true node is the clear case: within 1&Prime; of JPL DE431,
        up to about 1&prime; against the Moshier lunar theory.
      </Note>

      <H2>Recovering effects by fitting</H2>
      <P>
        Some effects are not published as a formula you can apply directly. Where
        that happens, the coefficient or rule is recovered by fitting to a
        reference and then frozen as data, with the raw samples kept for
        reproducibility.
      </P>
      <ul>
        <li>
          <strong>Minor bodies.</strong> Chiron and the asteroids are Chebyshev
          fits of JPL Horizons samples across 1850&ndash;2150, with residuals
          under 5&times;10&#8315;&#8310; AU. They use the same geocentric pipeline
          as the planets.
        </li>
        <li>
          <strong>Lunar eclipse magnitude.</strong> The Danjon enlargement of
          Earth&apos;s shadow is recovered empirically against Swiss, which
          brings lunar magnitudes within 0.0013.
        </li>
        <li>
          <strong>Uranian points.</strong> The Hamburg-school bodies use
          constant-element Kepler orbits whose elements are fit to Swiss
          Ephemeris&apos;s built-in definitions.
        </li>
        <li>
          <strong>Rise, set, and Gauquelin sectors.</strong> Disc-center
          geometry with refraction is matched to the Swiss rise and set method.
        </li>
      </ul>

      <H2>What gets reproduced, and how it is checked</H2>
      <table className="data-table table-auto" style={{ fontSize: "0.85rem" }}>
        <thead>
          <tr>
            <th>Layer</th>
            <th>Check</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Planet and Moon longitudes</td>
            <td>Swiss across 1850&ndash;2150, plus JPL Horizons at independent epochs</td>
          </tr>
          <tr>
            <td>House cusps, 8 added systems</td>
            <td>exact against swe_houses_armc, polar cases included</td>
          </tr>
          <tr>
            <td>Vertex and east point</td>
            <td>exact against swe_houses_armc</td>
          </tr>
          <tr>
            <td>Rise, set, meridian transit</td>
            <td>root-finds against swe_rise_trans</td>
          </tr>
          <tr>
            <td>Crossings and lunar phases</td>
            <td>against swe_solcross and swe_mooncross</td>
          </tr>
          <tr>
            <td>Eclipse types</td>
            <td>exact over 1990&ndash;2030, zero mismatches</td>
          </tr>
        </tbody>
      </table>
      <P dim>
        Full per-body bounds, including root-mean-square figures, are on{" "}
        <A href="/validation">Validation</A>.
      </P>

      <H2>Where the method reaches its limit</H2>
      <P>
        A few quantities are ill-conditioned, and the accuracy table says so
        rather than smoothing it over. A planetary station is a speed-zero root
        with a slope near 0.01&deg; per day squared, so a sub-arcsecond position
        difference turns into a timing difference of seconds to about a minute.
        The osculating lunar apogee, sold as &quot;true Lilith&quot;, amplifies
        the lunar theory&apos;s own error by roughly a factor of 1/e, which is
        why its values disagree across every software package at that scale.
        Numbers like these are quoted with the reason they are large.
      </P>

      <P dim>
        <A href="/validation">Validation tables &rarr;</A>{" "}
        <A href="/provenance">Sources &rarr;</A>{" "}
        <A href="/notes">Build Notes &rarr;</A>
      </P>
    </main>
  );
}
