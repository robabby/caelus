import { Engine } from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { ChartWheel } from "caelus-wheel";
import SkyNow from "../../components/SkyNow";
import { A, Eyebrow, Lead, P, H2 } from "../../components/Prose";

export const metadata = {
  title: "Playground",
  description:
    "Compute a chart in the browser: positions, houses, aspects, lunar phases, raw JSON. Twelve house systems, tropical and sidereal zodiacs, all client-side.",
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
    <main className="container page">
      <Eyebrow>Playground</Eyebrow>
      <h1>Compute a chart in your browser</h1>
      <Lead>
        Every chart below is computed on this page by the <code>caelus</code> engine
        with its embedded dataset. No server, no ephemeris files.
      </Lead>
      <P dim>
        Times are UT. For a local birth time, convert with <code>caelus-birth</code>{" "}
        first (a four-hour timezone error moves the ascendant about 60°). Set any
        date and place, then <strong>Copy share link</strong> to mint a chart you
        can send to anyone: the link carries only the values you typed, and the
        recipient&rsquo;s browser recomputes the chart with no server in the loop.
      </P>

      <SkyNow />

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
              <ChartWheel chart={engine.chart(...args)} size={420} />
            </div>
            <figcaption className="dim small" style={{ marginTop: "0.6rem" }}>{label}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
