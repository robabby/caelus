import Link from "next/link";
import ApiMarkdown from "../../../components/ApiMarkdown";
import { Eyebrow, P } from "../../../components/Prose";
import { readApiDoc } from "../../../lib/api-docs";
import { SITE } from "../../../lib/site";

export const metadata = {
  title: "API Reference",
  description: "Generated TypeScript API reference for the caelus package surface, grouped into recommended, advanced, and internal tiers.",
  alternates: { canonical: "/docs/api" },
};

type Ref = readonly [label: string, slug: string];

const TIERS: ReadonlyArray<{
  title: string;
  blurb: string;
  refs: ReadonlyArray<Ref>;
}> = [
  {
    title: "Recommended",
    blurb: "The surface most applications build against. Start here.",
    refs: [
      ["Engine", "Class.Engine"],
      ["julianDay", "Function.julianDay"],
      ["when", "Function.when"],
      ["riseSet", "Function.riseSet"],
      ["lunarPhases", "Function.lunarPhases"],
      ["solarEclipses", "Function.solarEclipses"],
      ["solarReturn", "Function.solarReturn"],
      ["progressedLongitude", "Function.progressedLongitude"],
      ["interpretationContext", "Function.interpretationContext"],
      ["chartBrief", "Function.chartBrief"],
      ["realize", "Function.realize"],
      ["counterfactual", "Function.counterfactual"],
      ["chartDiff", "Function.chartDiff"],
      ["Chart", "Interface.Chart"],
      ["Position", "Interface.Position"],
    ],
  },
  {
    title: "Advanced",
    blurb:
      "Stable but specialized: reach for these when the recommended surface does not cover the case. The Engine already calls most of them for you.",
    refs: [
      ["Turbo", "Class.Turbo"],
      ["housesPlacidus", "Function.housesPlacidus"],
      ["dignities", "Function.dignities"],
      ["planetarySect", "Function.planetarySect"],
      ["harmonicChart", "Function.harmonicChart"],
      ["declinationAspects", "Function.declinationAspects"],
      ["aspect", "Function.aspect"],
      ["solarEclipseWhere", "Function.solarEclipseWhere"],
      ["interpret", "Function.interpret"],
      ["resolveTime", "Function.resolveTime"],
      ["pheno", "Function.pheno"],
      ["gauquelinSector", "Function.gauquelinSector"],
      ["deltaT", "Function.deltaT"],
      ["chartFeatures", "Function.chartFeatures"],
      ["searchConfigurations", "Function.searchConfigurations"],
      ["compileForm", "Function.compileForm"],
    ],
  },
  {
    title: "Internal / unstable",
    blurb:
      "The engine's own astronomy machinery: series evaluators, apparent-position builders, and raw constants. Exported for inspection and tests; not a stable contract. Prefer the Engine over calling these directly.",
    refs: [
      ["vsopHeliocentric", "Function.vsopHeliocentric"],
      ["moonGeometric", "Function.moonGeometric"],
      ["nutation", "Function.nutation"],
      ["planetApparent", "Function.planetApparent"],
      ["KeplerOrbit", "Class.KeplerOrbit"],
      ["ChebSeries", "Class.ChebSeries"],
    ],
  },
];

const ENGINE_METHODS: ReadonlyArray<{
  group: string;
  methods: ReadonlyArray<readonly [name: string, anchor: string, blurb: string]>;
}> = [
  {
    group: "Charts",
    methods: [
      ["chart()", "chart", "Full chart from calendar fields in UT (year, month, day, hour, minute, second)."],
      ["chartAt()", "chartat", "The same chart straight from a Julian Day (UT), no calendar round-trip."],
    ],
  },
  {
    group: "Positions",
    methods: [
      ["position()", "position", "Full Position at a JD: lon, speed, retrograde, sign, lat, distance, ra/dec."],
      ["longitude()", "longitude", "Apparent geocentric ecliptic longitude (deg) at a JD."],
      ["heliocentric()", "heliocentric", "Geometric heliocentric ecliptic (lon, lat, distance in AU)."],
      ["ecliptic()", "ecliptic", "Raw apparent [lon, lat, dist] building block; most callers want position()."],
    ],
  },
  {
    group: "Fixed stars & introspection",
    methods: [
      ["fixedStar()", "fixedstar", "Apparent place of a catalog star: lon/lat/ra/dec, sign, magnitude."],
      ["starNames()", "starnames", "Names in the loaded fixed-star catalog."],
      ["starConjunctions()", "starconjunctions", "A chart's bodies within orb of catalog stars; feeds star fact atoms."],
      ["lots()", "lots", "The seven Hermetic lots placed by sign and house; feeds lot fact atoms."],
      ["bodies()", "bodies", "Body ids this engine can compute, given its data."],
    ],
  },
];

export default function ApiIndex() {
  const content = readApiDoc("index");
  return (
    <>
      <Eyebrow>Reference · v{SITE.version}</Eyebrow>
      <h1>API Reference</h1>
      <P dim>
        Generated from the <code>caelus</code> package with TypeDoc. Regenerate with{" "}
        <code>npm run docs:api</code>. The tiers below mark what to build against;
        the full alphabetical index follows. See{" "}
        <Link href="/docs/edge-cases">Edge Cases &amp; Stability</Link> for the
        versioning contract.
      </P>

      <div className="grid" style={{ marginTop: "1.5rem", marginBottom: "1rem" }}>
        {TIERS.map((tier) => (
          <div key={tier.title} className="card">
            <strong>{tier.title}</strong>
            <p className="dim small" style={{ margin: "0.4rem 0 0.7rem" }}>{tier.blurb}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {tier.refs.map(([label, slug]) => (
                <Link
                  key={slug}
                  href={`/docs/api/${slug}`}
                  className="mono small"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.15rem 0.5rem",
                  }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h2>The Engine</h2>
      <P dim>
        Construct one <Link href="/docs/api/Class.Engine">Engine</Link> from a
        data pack, then call these methods, the surface most code uses. Every
        method links straight to its signature and parameters.
      </P>
      <div className="card" style={{ marginTop: "1rem", marginBottom: "2rem" }}>
        {ENGINE_METHODS.map((g) => (
          <div key={g.group} style={{ marginBottom: "0.9rem" }}>
            <div className="dim small" style={{ textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
              {g.group}
            </div>
            {g.methods.map(([name, anchor, blurb]) => (
              <div
                key={anchor}
                style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", padding: "0.2rem 0" }}
              >
                <Link
                  href={`/docs/api/Class.Engine#${anchor}`}
                  className="mono small"
                  style={{ flex: "0 0 8.5rem", whiteSpace: "nowrap" }}
                >
                  {name}
                </Link>
                <span className="dim small">{blurb}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {content ? (
        <>
          <h2>Full index</h2>
          <ApiMarkdown content={content} />
        </>
      ) : (
        <P>Run <code>npm run docs:api</code> to generate the reference.</P>
      )}
    </>
  );
}
