import { A, Eyebrow, H2, P } from "../../components/Prose";

export const metadata = {
  title: "Features",
  description:
    "What the caelus engine computes: bodies, house systems, zodiacs, aspects, events, derived charts, the query engine, the turbo tier, packages, and integration surfaces. Counts link to the validation row or guide behind them.",
};

export default function Features() {
  return (
    <main className="container page">
      <Eyebrow>Features</Eyebrow>
      <h1>Features</h1>
      <P>
        What the engine computes, in one place. The counts are exact, and each
        links to the <A href="/validation">accuracy row</A> or guide behind it.
        Positions are checked against Swiss Ephemeris and JPL Horizons; see{" "}
        <A href="/methods">Methods</A>.
      </P>

      <H2>Bodies</H2>
      <P>
        Thirteen in the default chart: Sun, Moon, Mercury, Venus, Mars, Jupiter,
        Saturn, Uranus, Neptune, Pluto, Chiron, and the mean and true lunar node.
        On request: mean and true Lilith (lunar apogee), five asteroids (Ceres,
        Pallas, Juno, Vesta, Pholus), the Uranian/Hamburg points, and a 318-star
        fixed catalog.
      </P>

      <H2>Houses, angles, and zodiacs</H2>
      <P>
        Twelve house systems: Placidus, Koch, Porphyry, Equal, Whole-sign,
        Regiomontanus, Campanus, Alcabitius, Morinus, Meridian, Polich-Page, and
        Vehlow, with a whole-sign fallback above the polar circles. Angles:
        Ascendant, Midheaven, vertex, and east point. Zodiac: tropical and
        seven sidereal ayanamsas (Lahiri, Fagan/Bradley, Krishnamurti, Raman,
        Yukteshwar, Galactic Center, and Spica). See{" "}
        <A href="/docs/houses-and-zodiacs">Houses &amp; Zodiacs</A>.
      </P>

      <H2>Aspects and frames</H2>
      <P>
        Major aspects (conjunction, sextile, square, trine, opposition) with
        configurable orbs. Apparent geocentric or topocentric positions, in
        ecliptic longitude and latitude or right ascension and declination, with
        light-time, annual aberration, IAU 1980 nutation, and Vondrák 2011
        precession.
      </P>

      <H2>Events</H2>
      <P>
        Rise, set, and meridian transit; longitude crossings; lunar phases;
        stations; Gauquelin sectors; and solar and lunar eclipses (global
        circumstances, with types and times). Timing bounds are on{" "}
        <A href="/validation">Validation</A>.
      </P>

      <H2>Derived charts</H2>
      <P>
        Solar and lunar returns, secondary progressions, solar arc directions,
        composite and Davison charts, harmonics, antiscia and contra-antiscia,
        declination aspects and parallels, out-of-bounds, essential dignities,
        and sect. See <A href="/docs/derived">Derived Charts</A>.
      </P>

      <H2>Electional</H2>
      <P>
        Applying and separating aspects, solar phase (cazimi, combust, under the
        beams), planetary hours, the void-of-course Moon, and house placement
        with angularity. These read off the validated positions, pinned to the
        Python reference.
      </P>

      <H2>Query, turbo, and search</H2>
      <P>
        A declarative <code>when()</code> query language finds the intervals
        where celestial predicates hold. Predicates combine with allOf, anyOf,
        and notOf, and the solver locates the boundaries by bisection. For bulk
        scans, the turbo tier evaluates segmented Chebyshev longitude packs fit to
        the engine. For ranked time searches, <code>rankMoments</code> scores
        every instant in a range and returns the best, with a non-blocking
        variant for the browser. See <A href="/docs/recipes">Recipes</A>.
      </P>

      <H2>Matching and synthesis</H2>
      <P>
        A chart reduces to a feature vector, each body's longitude as a weighted
        point on the unit circle, so two configurations compare by cosine
        similarity and <code>searchConfigurations</code> ranks a time range by
        how closely the sky resembles a target form. The geometric compiler runs
        the other way: give <code>compileForm</code> weighted constraints (an
        aspect between two bodies, a sign or a degree placement) and it finds the
        longitudes that best satisfy them, reports the residual, and flags a form
        as impossible when even the best fit falls short. Both are pure and
        pinned to the Python reference. See <A href="/docs/recipes">Recipes</A>.
      </P>

      <H2>Visualization</H2>
      <P>
        The chart as a flat wheel, as a tilted celestial sphere with planets at
        their true ecliptic latitude, or as an astrocartography world map of the
        planetary angle lines, plus a graphic ephemeris of any value over time.
        The 3D aspect angle accounts for latitude rather than longitude alone.
        Every view renders to SSR-safe SVG with no runtime dependencies. See{" "}
        <A href="/docs/visualizations">Visualizations</A>.
      </P>

      <H2>Packages</H2>
      <P>
        Four npm packages: <code>caelus</code> (the engine, zero runtime
        dependencies), <code>caelus-birth</code> (timezone and local-time
        resolution), <code>caelus-wheel</code> (server-rendered SVG charts), and{" "}
        <code>caelus-mcp</code> (the MCP server). The Python reference ships on
        PyPI as{" "}
        <A href="https://pypi.org/project/caelus-engine/">caelus-engine</A>.
      </P>

      <H2>Integration</H2>
      <P>
        The MCP server exposes nine chart tools over stdio and Streamable HTTP
        at <A href="/api/mcp">/api/mcp</A>; a REST endpoint answers at{" "}
        <A href="/api/chart?lat=27.94&lon=-82.46">/api/chart</A>. The engine does
        no file or network I/O, ships an embedded data tier and a Node loader, and
        runs in the browser, on edge runtimes, and in Node. See{" "}
        <A href="/docs/mcp">MCP Setup</A> and{" "}
        <A href="/docs/data-tiers">Data Tiers</A>.
      </P>

      <H2>Range and license</H2>
      <P>
        Supported range 1800&ndash;2149, with the precise Moon and Chiron fits
        spanning 1850&ndash;2150. MIT licensed, with no AGPL and no ephemeris
        files on disk. Provenance for every coefficient is on{" "}
        <A href="/provenance">Provenance</A>.
      </P>
    </main>
  );
}
