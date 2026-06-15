import {
  type Engine,
  aspectBetween, solarPhase, voidOfCourse, planetaryHour, rankMoments,
} from "caelus";
import { toUT } from "caelus-birth";
import { ChartWheel } from "caelus-wheel";
import { WHEEL_THEME } from "../../lib/wheelTheme";
import { sampleEngine, jdToMinute } from "../../lib/sample-chart";
import { DocFigure, cell } from "./DocFigure";

const place = { lat: 40.69, lon: -73.99 }; // Brooklyn, NY

/** The exact scoring function from the code sample on this page. */
function electionalScore(engine: Engine, jd: number, lat: number, lon: number): number {
  let score = 0;
  const trine = aspectBetween(engine, "moon", "venus", jd);
  if (trine?.aspect === "trine") score += trine.phase === "applying" ? 3 : 1;
  if (voidOfCourse(engine, jd).isVoid) score -= 4;
  const venus = solarPhase(engine, "venus", jd);
  if (venus === "combust" || venus === "under_beams") score -= 2;
  if (venus === "cazimi") score += 1;
  const hour = planetaryHour(engine, jd, lat, lon);
  if (hour && (hour.ruler === "venus" || hour.ruler === "jupiter")) score += 1;
  return score;
}

const from = toUT({ year: 2026, month: 7, day: 1, hour: 0, minute: 0, ...place });
const until = toUT({ year: 2026, month: 7, day: 4, hour: 0, minute: 0, ...place });

// The same hourly scan the page describes, run at build time over the window.
const ranked = rankMoments(
  { start: from.jdUt, end: until.jdUt, step: 1 / 24, limit: 5 },
  (jd) => electionalScore(sampleEngine, jd, place.lat, place.lon),
);

/** The winning chart plus the five best instants from the live scan. */
export function ElectionalResult() {
  const best = ranked[0];
  const chart = sampleEngine.chartAt(best.jd, place.lat, place.lon, "placidus");
  return (
    <DocFigure
      caption={<>The actual winner of the scan above, computed at build time: {from.zone}, {jdToMinute(best.jd)} UT, score {best.score}. A 72-sample hourly sweep of the three-day window, scored by the function above; the table lists the five best instants.</>}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 300px) minmax(0, 1fr)",
          gap: "1.5rem",
          alignItems: "center",
          width: "100%",
        }}
      >
        <div className="chart-fluid" style={{ maxWidth: 300 }}>
          <ChartWheel chart={chart} size={300} theme={WHEEL_THEME} />
        </div>
        <table className="mono" style={{ fontSize: "0.82rem", width: "auto" }}>
          <thead>
            <tr style={{ color: "var(--text-mute)" }}>
              <td style={cell}>rank</td><td style={cell}>instant (UT)</td><td style={cell}>score</td>
            </tr>
          </thead>
          <tbody>
            {ranked.map((m, i) => (
              <tr key={m.jd} style={i === 0 ? { color: "var(--accent)" } : undefined}>
                <td style={cell}>{i + 1}</td>
                <td style={cell}>{jdToMinute(m.jd)}</td>
                <td style={cell}>{m.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DocFigure>
  );
}
