import Link from "next/link";
import ApiMarkdown from "../../../components/ApiMarkdown";
import { Eyebrow, P } from "../../../components/Prose";
import { readApiDoc } from "../../../lib/api-docs";
import { SITE } from "../../../lib/site";

export const metadata = {
  title: "API Reference",
  description: "Generated TypeScript API reference for the caelus package surface, grouped into recommended, advanced, and internal tiers.",
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
      "The engine's own astronomy machinery — series evaluators, apparent-position builders, and raw constants. Exported for inspection and tests; not a stable contract. Prefer the Engine over calling these directly.",
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
