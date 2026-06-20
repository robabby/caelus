import { Engine } from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { ChartWheel } from "caelus-wheel";
import { SkyNow, SynastryPanel } from "../../components/PlaygroundPanels";
import PageClose from "../../components/PageClose";
import PageHero from "../../components/PageHero";
import PlaygroundStickyBar from "../../components/PlaygroundStickyBar";
import { WHEEL_THEME } from "../../lib/wheelTheme";
import { b64urlEncode, type Share } from "../../lib/share";
import { A, Lead, P, H2 } from "../../components/Prose";

export const metadata = {
  title: "Playground",
  description:
    "Compute and interpret a chart in the browser: ranked citable fact atoms (natal, transits, time-lords), a cited public-domain reading, synastry/composite compare, plus positions, aspects, fixed stars, and lots. All client-side.",
  alternates: { canonical: "/playground" },
};

const engine = new Engine(embeddedData);

// Charts curated for a striking reading. Each carries the share payload (a UT
// instant + place) so a click loads it into the builder above; the wheel is a
// preview computed here.
const EXAMPLES: Array<{ caption: string; args: Parameters<Engine["chart"]>; share: Share }> = [
  {
    caption: "Four Royal Stars lit at once: the Sun and Mercury on Regulus, the Moon on Algol, Pluto on Antares.",
    args: [2000, 8, 22, 12, 0, 0, 51.5, -0.12, "placidus"],
    share: { v: 1, t: "2000-08-22T12:00", la: "51.5", lo: "-0.12", h: "placidus", z: "tropical", n: "Royal stars" },
  },
  {
    caption: "Jupiter conjunct Sirius, the brightest star; the engine's canonical test fixture.",
    args: [1990, 6, 10, 18, 30, 0, 27.95, -82.46, "placidus"],
    share: { v: 1, t: "1990-06-10T18:30", la: "27.95", lo: "-82.46", h: "placidus", z: "tropical", n: "Jupiter on Sirius" },
  },
  {
    caption: "A five-body Aquarius stellium, with Uranus on Regulus.",
    args: [1962, 2, 5, 0, 0, 0, 27.95, -82.46, "placidus"],
    share: { v: 1, t: "1962-02-05T00:00", la: "27.95", lo: "-82.46", h: "placidus", z: "tropical", n: "Aquarius stellium" },
  },
  {
    caption: "The day Star Wars opened: the Moon on Regulus, the lunar node on Spica.",
    args: [1977, 5, 25, 19, 0, 0, 34.05, -118.24, "placidus"],
    share: { v: 1, t: "1977-05-25T19:00", la: "34.05", lo: "-118.24", h: "placidus", z: "tropical", n: "1977-05-25" },
  },
];

export default function Playground() {
  return (
    <main className="container-wide page page--sticky-cta">
      <PageHero eyebrow="Playground" title="Compute and interpret a chart in your browser">
        <Lead>
          Every chart below is computed on this page by the <code>caelus</code> engine
          with its embedded dataset, then <strong>read</strong>: its validated facts are
          turned into a cited reading from a public-domain corpus. No server, no
          ephemeris files, nothing invented.
        </Lead>
        <P dim>
          The <strong>reading</strong> that leads each chart projects it into ranked
          fact atoms (placements, aspects, fixed-star conjunctions, the Part of
          Fortune, transits and time-lords active now) and runs a
          public-domain delineation corpus over them, so every statement cites the
          validated fact it rests on: the same grounding an LLM uses instead of
          hallucinating positions. The **Facts** tab lists the same enriched atoms;
          **Synastry** adds inter-chart and composite ids. Search a birthplace and enter the local time
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

      <H2>Charts worth reading</H2>
      <P>
        Four charts chosen for a striking reading. Click any one to load it into the builder
        above and read it in full: the wheel is the{" "}
        <A href="https://www.npmjs.com/package/caelus-wheel">caelus-wheel</A> renderer, and the
        interpretation is the public-domain corpus run over the engine&rsquo;s facts.
      </P>
      <div className="grid grid-2" style={{ marginTop: "1rem" }}>
        {EXAMPLES.map((ex) => (
          <a
            key={ex.caption}
            href={`/playground#c=${b64urlEncode(ex.share)}`}
            className="card"
            style={{ margin: 0, display: "block", textDecoration: "none", color: "inherit" }}
          >
            <div className="chart-fluid">
              <ChartWheel chart={engine.chart(...ex.args)} size={420} theme={WHEEL_THEME} />
            </div>
            <div className="dim small" style={{ marginTop: "0.6rem" }}>
              {ex.caption} <span style={{ color: "var(--accent)" }}>Read this chart &rarr;</span>
            </div>
          </a>
        ))}
      </div>

      <PageClose title="Ship it in your app" />
      <PlaygroundStickyBar />
    </main>
  );
}
