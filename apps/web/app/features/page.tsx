import type { ReactNode } from "react";
import Link from "next/link";
import { Engine, ephemeris, julianDay, type BodyId } from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { ChartWheel, ChartSphere, EphemerisGraph } from "caelus-wheel";
import { A, P } from "../../components/Prose";
import PageClose from "../../components/PageClose";
import PageHero from "../../components/PageHero";
import { formatMcpToolsProse, MCP_TOOL_COUNT } from "../../lib/site";
import { WHEEL_THEME, WHEEL_LINE_COLORS } from "../../lib/wheelTheme";

const MCP_TOOLS_PROSE = formatMcpToolsProse();

export const metadata = {
  title: "Features",
  description:
    "What the caelus engine computes: bodies, house systems, zodiacs, aspects, events, derived charts, the Hellenistic time-lords, the Vedic layer, the query engine, the turbo tier, packages, and integration surfaces. With a factual comparison against the main astrology engines and libraries.",
  alternates: { canonical: "/features" },
};

// Live engine renders for the figures below; deterministic at build time.
const engine = new Engine(embeddedData);
const wheelChart = engine.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus");
const sphereChart = engine.chart(2026, 6, 13, 12, 0, 0, 40.71, -74.01, "placidus");
const GRAPH_BODIES: BodyId[] = ["mars", "jupiter", "saturn"];
const graphSeries = ephemeris(engine, GRAPH_BODIES, {
  start: julianDay(2026, 1, 1),
  end: julianDay(2028, 1, 1),
  step: 7,
  value: "longitude",
});

type Stat = { num: string; label: string; href: string };

const STATS: Stat[] = [
  { num: "13", label: "Bodies in the default chart", href: "/validation" },
  { num: "12", label: "House systems", href: "/docs/houses-and-zodiacs" },
  { num: "8", label: "Zodiacs (tropical + 7 sidereal)", href: "/docs/houses-and-zodiacs" },
  { num: String(MCP_TOOL_COUNT), label: "MCP tools for AI clients", href: "/docs/mcp" },
  { num: "3,218", label: "Golden checks in CI", href: "/validation" },
  { num: "0", label: "Runtime dependencies", href: "/docs/data-tiers" },
];

function Feature({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card feature-card">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function Group({ label, lead, children }: { label: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="feature-group">
      <h2 className="feature-group__label">{label}</h2>
      {lead}
      <div className="feature-grid">{children}</div>
    </section>
  );
}

// ---- comparison data ---------------------------------------------------------
// Subjects are developer-facing engines and libraries. Facts are taken from each
// project's own docs and license (linked under the tables). A check marks the
// developer-friendly answer; "–" means the capability is not built in.

const TOOLS = [
  "Caelus",
  "Swiss Ephemeris",
  "Kerykeion",
  "Immanuel",
  "Circular Natal JS",
  "Astronomy Engine",
];

type Row = { label: string; cells: string[] };

const PLATFORM_ROWS: Row[] = [
  { label: "License\u00b9", cells: ["MIT", "AGPL / paid", "AGPL", "AGPL", "Unlicense", "MIT"] },
  { label: "Language", cells: ["TypeScript", "C", "Python", "Python", "JavaScript", "TS / multi"] },
  { label: "Runs in the browser", cells: ["yes", "no", "no", "no", "yes", "yes"] },
  { label: "Ships without ephemeris files\u00b2", cells: ["yes", "no", "no", "no", "yes", "yes"] },
  { label: "Independent of Swiss Ephemeris", cells: ["yes", "—", "no", "no", "yes", "yes"] },
  { label: "MCP server for AI clients\u00b3", cells: ["yes", "no", "no", "no", "no", "no"] },
];

const CAPABILITY_ROWS: Row[] = [
  { label: "Positions & aspects", cells: ["yes", "yes", "yes", "yes", "yes", "positions only"] },
  { label: "House systems", cells: ["12", "many", "several", "several", "7", "—"] },
  { label: "Sidereal zodiacs", cells: ["7 ayanamsas", "yes", "yes", "yes", "yes", "—"] },
  { label: "Eclipses, rise/set, stations", cells: ["yes", "yes", "—", "—", "—", "yes"] },
  { label: "Derived charts (returns, progressions)", cells: ["yes", "—", "yes", "yes", "—", "—"] },
  { label: "Hellenistic time-lords (lots, profections, releasing)", cells: ["yes", "—", "—", "—", "—", "—"] },
  { label: "Vedic / Jyotish (dashas, vargas, yogas)", cells: ["yes", "—", "—", "—", "—", "—"] },
  { label: "Pattern detection (T-square, grand trine, yod)", cells: ["yes", "—", "—", "—", "—", "—"] },
  { label: "Accuracy published & CI-pinned", cells: ["yes", "reference", "via Swiss Eph", "via Swiss Eph", "—", "yes"] },
];

function Cmp({ v, me }: { v: string; me: boolean }) {
  const cls = me ? "cmp-c cmp-c--me" : "cmp-c";
  if (v === "yes") {
    return (
      <td className={cls}>
        <span className="cmp-yes" aria-label="Yes">✓</span>
      </td>
    );
  }
  if (v === "no" || v === "—") {
    return (
      <td className={cls}>
        <span className="cmp-no" aria-label={v === "no" ? "No" : "Not built in"}>
          –
        </span>
      </td>
    );
  }
  return <td className={cls}>{v}</td>;
}

function ComparisonTable({ caption, rows }: { caption: string; rows: Row[] }) {
  return (
    <div className="cmp-block">
      <p className="cmp-caption">{caption}</p>
      <div className="table-scroll">
        <table className="cmp-table">
          <thead>
            <tr>
              <th scope="col" />
              {TOOLS.map((t, i) => (
                <th scope="col" key={t} className={i === 0 ? "cmp-me" : undefined}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {r.cells.map((c, i) => (
                  <Cmp key={TOOLS[i]} v={c} me={i === 0} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Features() {
  return (
    <main className="container page">
      <PageHero eyebrow="Validated · MIT · zero dependencies" title="Features" cta="compact">
        <P>
          What the engine computes, in one place. The counts are exact. Positions
          are checked against Swiss Ephemeris and JPL Horizons (see{" "}
          <A href="/methods">Methods</A>), and per-body accuracy is published on{" "}
          <A href="/validation">Validation</A>, not asserted.
        </P>
      </PageHero>

      <div className="feature-stats">
        {STATS.map((s) => (
          <Link key={s.label} href={s.href} className="card stat">
            <span className="stat__num">{s.num}</span>
            <span className="stat__label">{s.label}</span>
          </Link>
        ))}
      </div>

      <Group
        label="Chart and positions"
        lead={
          <figure className="feature-figure">
            <div className="chart-fluid">
              <ChartWheel chart={wheelChart} size={340} theme={WHEEL_THEME} />
            </div>
            <figcaption>
              A natal wheel drawn by <code>caelus-wheel</code> from the engine&apos;s
              bodies, houses, angles, and aspects: 1990-06-10 14:30 UT, Tampa.
            </figcaption>
          </figure>
        }
      >
        <Feature title="Bodies">
          Thirteen in the default chart: Sun, Moon, Mercury, Venus, Mars,
          Jupiter, Saturn, Uranus, Neptune, Pluto, Chiron, and the mean and true
          lunar node. On request: mean and true Lilith (lunar apogee), five
          asteroids (Ceres, Pallas, Juno, Vesta, Pholus), the Uranian/Hamburg
          points, and a 318-star fixed catalog.
        </Feature>
        <Feature title="Houses, angles, and zodiacs">
          Twelve house systems: Placidus, Koch, Porphyry, Equal, Whole-sign,
          Regiomontanus, Campanus, Alcabitius, Morinus, Meridian, Polich-Page,
          and Vehlow, with a whole-sign fallback above the polar circles.
          Angles: Ascendant, Midheaven, vertex, and east point. Zodiac: tropical
          and seven sidereal ayanamsas (Lahiri, Fagan/Bradley, Krishnamurti,
          Raman, Yukteshwar, Galactic Center, and Spica). See{" "}
          <A href="/docs/houses-and-zodiacs">Houses &amp; Zodiacs</A>.
        </Feature>
        <Feature title="Aspects and frames">
          Major aspects (conjunction, sextile, square, trine, opposition) with
          configurable orbs. Apparent geocentric or topocentric positions, in
          ecliptic longitude and latitude or right ascension and declination,
          with light-time, annual aberration, IAU 1980 nutation, and Vondrák
          2011 precession.
        </Feature>
        <Feature title="Events">
          Rise, set, and meridian transit; longitude crossings; lunar phases;
          stations; Gauquelin sectors; parans (co-angular bodies, two on the
          rising, setting, or meridian axis at once); and solar and lunar
          eclipses, with types, times, and geography: the sub-solar point of
          greatest eclipse, the path of totality (north and south limits and
          width), and local circumstances (magnitude, obscuration, and contact
          times) for any observer. Timing bounds are on{" "}
          <A href="/validation">Validation</A>.
        </Feature>
      </Group>

      <Group label="Techniques">
        <Feature title="Derived charts">
          Solar and lunar returns, secondary progressions, solar arc
          directions, composite and Davison charts, harmonics, antiscia and
          contra-antiscia, declination aspects and parallels, out-of-bounds,
          essential dignities (qualitative, and William Lilly&apos;s weighted
          five-fold score with the almuten of a degree), and sect. See{" "}
          <A href="/docs/derived">Derived Charts</A>.
        </Feature>
        <Feature title="Hellenistic time-lords">
          Deterministic arithmetic on the validated positions: the seven
          Hermetic lots (Fortune, Spirit, and the rest), sect-aware; annual and
          monthly profections with the lord of the year; the firdaria, the
          Persian seventy-five-year planetary periods; zodiacal releasing from a
          lot, with the four levels and the loosing of the bond; and primary
          directions to the four angles and between planets, by the Ptolemy or
          Naibod key. See <A href="/docs/hellenistic">Hellenistic Time-Lords</A>.
        </Feature>
        <Feature title="Vedic and Jyotish">
          A full Jyotish layer on the sidereal chart: nakshatras with padas and
          their ruling planets; three dasha systems, Vimshottari (120-year),
          Yogini (36-year), and Ashtottari (108-year), each with sub-periods
          read from the Moon&apos;s nakshatra; the Parashari divisional charts
          (vargas) D1, D2, D3, D9, D10, D12, and D30; and the yogas (the five
          Pancha Mahapurusha, Gajakesari, Budha-Aditya, Chandra-Mangala,
          Kemadruma, plus a lordship and graha-drishti layer with raja and dhana
          yogas and yogakarakas). Each convention is validated against a named
          authority, not asserted. See <A href="/docs/vedic">Vedic &amp; Jyotish</A>.
        </Feature>
        <Feature title="Electional">
          Applying and separating aspects, solar phase (cazimi, combust, under
          the beams), planetary hours, the void-of-course Moon, and house
          placement with angularity. These read off the validated positions,
          pinned to the Python reference.
        </Feature>
      </Group>

      <Group
        label="Computation and search"
        lead={
          <figure className="feature-figure feature-figure--wide">
            <EphemerisGraph
              series={graphSeries}
              width={760}
              height={260}
              wrap={360}
              theme={WHEEL_THEME}
              colors={WHEEL_LINE_COLORS}
            />
            <figcaption>
              A graphic ephemeris: the longitude of Mars, Jupiter, and Saturn
              over two years. The query engine and turbo tier scan curves like
              these for the moments a predicate holds.
            </figcaption>
          </figure>
        }
      >
        <Feature title="Query, turbo, and search">
          A declarative <code>when()</code> query language finds the intervals
          where celestial predicates hold. Predicates combine with allOf, anyOf,
          and notOf, and the solver locates the boundaries by bisection. For
          bulk scans, the turbo tier evaluates segmented Chebyshev longitude
          packs fit to the engine. For ranked time searches,{" "}
          <code>rankMoments</code> scores every instant in a range and returns
          the best, with a non-blocking variant for the browser. See{" "}
          <A href="/docs/recipes">Recipes</A>.
        </Feature>
        <Feature title="Matching and synthesis">
          A chart reduces to a feature vector, each body&apos;s longitude as a
          weighted point on the unit circle, so two configurations compare by
          cosine similarity and <code>searchConfigurations</code> ranks a time
          range by how closely the sky resembles a target form. The geometric
          compiler runs the other way: give <code>compileForm</code> weighted
          constraints and it finds the longitudes that best satisfy them,
          reports the residual, and flags a form as impossible when even the
          best fit falls short. Both are pure and pinned to the Python
          reference. See <A href="/docs/recipes">Recipes</A>.
        </Feature>
        <Feature title="Patterns and chart signature">
          <code>detectPatterns</code> enumerates the classical configurations as
          structured objects: T-squares, grand trines, grand crosses, yods,
          kites, mystic rectangles, and stelliums by sign and by house. Reported
          patterns are maximal, so a grand cross hides the T-squares inside it
          and a kite its grand trine. <code>chartSignature</code> reduces a
          chart to plain counts: the element, modality, quadrant, and hemisphere
          distributions, the dominant element, modality, and sign, and the
          classical chart ruler. Both are pure geometry, interpretation-free,
          and exposed over MCP. See <A href="/docs/cookbook">Common Tasks</A>.
        </Feature>
        <Feature title="Interpretation layer">
          The engine stops at facts; this is the seam where meaning plugs in.
          <code>interpretationContext</code> projects a chart into ranked,
          citable fact atoms (including dispositors and mutual reception by
          domicile, exaltation, or triplicity); selectors and a pluggable rule
          corpus turn them into a structured reading; and{" "}
          <code>chartBrief</code> hands an LLM only the validated facts, each
          tagged with a stable id, with <code>auditCitations</code> to verify
          what it cited. Pair with the{" "}
          <A href="/docs/provenance">provenance layer</A> so forecasts, fiction,
          and inexact times get realm framing and certainty damping. See{" "}
          <A href="/docs/interpretation">Interpretation</A>.
        </Feature>
        <Feature title="Chart provenance">
          A chart is not always a verified birth instant.{" "}
          <code>Realm</code> declares what it is (observed, forecast, mythic,
          archetypal, …); <code>TemporalAnchor</code> and{" "}
          <code>SpatialAnchor</code> declare how time and place are known;
          <code>realize()</code> routes to the ephemeris or the geometric
          compiler. Certainty flows into interpretation so Moon and angles are
          down-weighted when the time is approximate. See{" "}
          <A href="/docs/provenance">Provenance</A>.
        </Feature>
      </Group>

      <Group
        label="Output and delivery"
        lead={
          <figure className="feature-figure">
            <div className="chart-fluid">
              <ChartSphere chart={sphereChart} size={320} tilt={64} theme={WHEEL_THEME} />
            </div>
            <figcaption>
              The same chart as a tilted celestial sphere, each planet at its true
              ecliptic latitude. The flat wheel, astrocartography map, and graphic
              ephemeris share this SSR-safe SVG path. See{" "}
              <A href="/docs/visualizations">Visualizations</A>.
            </figcaption>
          </figure>
        }
      >
        <Feature title="Visualization">
          The chart as a flat wheel, as a tilted celestial sphere with planets
          at their true ecliptic latitude, or as an astrocartography world map
          of the planetary angle lines, plus a graphic ephemeris of any value
          over time. The 3D aspect angle accounts for latitude rather than
          longitude alone. Every view renders to SSR-safe SVG with no runtime
          dependencies. See <A href="/docs/visualizations">Visualizations</A>.
        </Feature>
        <Feature title="Packages">
          Four npm packages: <code>caelus</code> (the engine, zero runtime
          dependencies), <code>caelus-birth</code> (timezone and local-time
          resolution), <code>caelus-wheel</code> (server-rendered SVG charts),
          and <code>caelus-mcp</code> (the MCP server). The Python reference
          ships on PyPI as{" "}
          <A href="https://pypi.org/project/caelus-engine/">caelus-engine</A>.
        </Feature>
        <Feature title="Integration">
          The MCP server exposes {MCP_TOOLS_PROSE} chart tools over stdio and
          Streamable HTTP at <A href="/api/mcp">/api/mcp</A>; a REST endpoint
          answers at <A href="/api/chart?lat=27.94&lon=-82.46">/api/chart</A>.
          The engine does no file or network I/O, ships an embedded data tier
          and a Node loader, and runs in the browser, on edge runtimes, and in
          Node. See <A href="/docs/mcp">MCP Setup</A> and{" "}
          <A href="/docs/data-tiers">Data Tiers</A>.
        </Feature>
        <Feature title="Range and license">
          Supported range 1800&ndash;2149, with the precise Moon and Chiron fits
          spanning 1850&ndash;2150. MIT licensed, with no AGPL and no ephemeris
          files on disk. Provenance for every coefficient is on{" "}
          <A href="/provenance">Provenance</A>.
        </Feature>
      </Group>

      <h2>How it compares</h2>
      <P>
        The set is developer-facing engines and libraries, with the facts taken
        from each project&apos;s own docs and license. Swiss Ephemeris and
        Astronomy Engine compute positions and astronomical events; the zodiac,
        chart, and technique layers on top are the application&apos;s job, and
        Astronomy Engine carries no astrology layer at all. A check marks the
        developer-friendly answer; a dash means the capability is not built in.
      </P>

      <div className="feature-compare">
        <div className="feature-compare__inner">
          <ComparisonTable caption="License and platform" rows={PLATFORM_ROWS} />
          <ComparisonTable caption="What it computes" rows={CAPABILITY_ROWS} />
          <ol className="cmp-notes">
            <li>
              <sup>1</sup> Swiss Ephemeris is dual-licensed: AGPL-3.0, or a paid
              Professional License from Astrodienst.
            </li>
            <li>
              <sup>2</sup> Swiss Ephemeris uses <code>.se1</code> data files for
              full precision (a built-in mode runs without them at lower
              precision); Kerykeion and Immanuel build on it.
            </li>
            <li>
              <sup>3</sup> <code>caelus-mcp</code> exposes {MCP_TOOLS_PROSE} tools over
              the Model Context Protocol. Kerykeion serializes charts to XML for
              LLM prompts but ships no MCP server.
            </li>
          </ol>
          <P dim>
            Sources:{" "}
            <A href="https://www.astro.com/swisseph/">Swiss Ephemeris</A>,{" "}
            <A href="https://kerykeion.net/">Kerykeion</A>,{" "}
            <A href="https://github.com/theriftlab/immanuel-python">Immanuel</A>,{" "}
            <A href="https://github.com/0xStarcat/CircularNatalHoroscopeJS">
              circular-natal-horoscope-js
            </A>
            , and{" "}
            <A href="https://github.com/cosinekitty/astronomy">Astronomy Engine</A>.
          </P>
        </div>
      </div>

      <PageClose />
    </main>
  );
}
