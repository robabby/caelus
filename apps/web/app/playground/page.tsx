import { Engine } from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { ChartWheel } from "caelus-wheel";
import { SkyNow, SynastryPanel } from "../../components/PlaygroundPanels";
import PageClose from "../../components/PageClose";
import PageHero from "../../components/PageHero";
import PlaygroundStickyBar from "../../components/PlaygroundStickyBar";
import { WHEEL_THEME } from "../../lib/wheelTheme";
import { A, Lead, P, H2 } from "../../components/Prose";

export const metadata = {
  title: "Playground",
  description:
    "Compute and interpret a chart in the browser: ranked fact atoms turned into a cited, public-domain reading, plus positions, houses, aspects, fixed stars, and lots. Twelve house systems, tropical and sidereal zodiacs, all client-side.",
  alternates: { canonical: "/playground" },
};

const engine = new Engine(embeddedData);

const EXAMPLES: Array<[string, Parameters<Engine["chart"]>]> = [
  ["1990-06-10 18:30 UT · Tampa · placidus", [1990, 6, 10, 18, 30, 0, 27.95, -82.46, "placidus"]],
  ["1985-12-01 09:00 UT · Svalbard · placidus → whole-sign fallback", [1985, 12, 1, 9, 0, 0, 78.2, 15.6, "placidus"]],
  ["1962-02-05 00:00 UT · Aquarius stellium (5 bodies within 3°)", [1962, 2, 5, 0, 0, 0, 27.95, -82.46, "placidus"]],
  ["2026-03-20 14:46 UT · London · equal houses", [2026, 3, 20, 14, 46, 0, 51.5, -0.12, "equal"]],
];

export default function Playground() {
  return (
    <main className="container page page--sticky-cta">
      <PageHero eyebrow="Playground" title="Compute and interpret a chart in your browser">
        <Lead>
          Every chart below is computed on this page by the <code>caelus</code> engine
          with its embedded dataset, then <strong>read</strong>: its validated facts are
          turned into a cited reading from a public-domain corpus. No server, no
          ephemeris files, nothing invented.
        </Lead>
        <P dim>
          The <strong>Reading</strong> tab projects the chart into ranked fact atoms
          (placements, aspects, fixed-star conjunctions, the Part of Fortune) and runs a
          public-domain delineation corpus over them, so every statement cites the
          validated fact it rests on: the same grounding an LLM uses instead of
          hallucinating positions. Search a birthplace and enter the local time
          (<code>caelus-birth</code> resolves the zone and historical DST to UT offline),
          then <strong>Copy share link</strong> to mint a chart whose URL carries only
          the values you typed, recomputed in the recipient&rsquo;s browser. (Switch the
          time mode to UTC for the current sky.)
        </P>
      </PageHero>

      <SkyNow />

      <H2>Compare two charts</H2>
      <P>
        Synastry and the composite, both computed in your browser: two births in,
        the inter-chart aspect grid and the midpoint chart out. Birth times are
        local to each place (resolved to UT with <code>caelus-birth</code>).
      </P>
      <SynastryPanel />

      <H2>Example charts</H2>
      <P>
        Four charts chosen to stress the <A href="https://www.npmjs.com/package/caelus-wheel">caelus-wheel</A>{" "}
        renderer: the canonical fixture, a polar Placidus fallback, a tight stellium with
        collision-avoided glyphs, and an equal-house chart.
      </P>
      <div className="grid grid-2" style={{ marginTop: "1rem" }}>
        {EXAMPLES.map(([label, args]) => (
          <figure key={label} className="card" style={{ margin: 0 }}>
            <div className="chart-fluid">
              <ChartWheel chart={engine.chart(...args)} size={420} theme={WHEEL_THEME} />
            </div>
            <figcaption className="dim small" style={{ marginTop: "0.6rem" }}>{label}</figcaption>
          </figure>
        ))}
      </div>

      <PageClose title="Ship it in your app" />
      <PlaygroundStickyBar />
    </main>
  );
}
