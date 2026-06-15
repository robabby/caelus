import {
  solarReturn, declinationAspects, outOfBounds,
  BODIES, julianDay,
  type BodyId,
} from "caelus";
import { ChartWheel, GLYPHS } from "caelus-wheel";
import { WHEEL_THEME } from "../../lib/wheelTheme";
import {
  sampleEngine, sampleChart, SAMPLE, SAMPLE_JD, jdToDate, jdToMinute,
} from "../../lib/sample-chart";
import { DocFigure, cell } from "./DocFigure";

const { lat, lon } = SAMPLE;

/** The 2026 solar-return chart of the sample natal, rendered as a wheel. */
export function SolarReturnChart() {
  const [jd] = solarReturn(sampleEngine, SAMPLE_JD, julianDay(2026, 1, 1), julianDay(2027, 1, 1));
  const chart = sampleEngine.chartAt(jd, lat, lon, "placidus");
  return (
    <DocFigure
      center
      caption={<>The 2026 solar return: the Sun back at its natal longitude, {jdToMinute(jd)} UT. Built with one <code>chartAt</code> call at the return instant and drawn with <code>ChartWheel</code>.</>}
    >
      <div className="chart-fluid" style={{ maxWidth: 340 }}>
        <ChartWheel chart={chart} size={340} theme={WHEEL_THEME} />
      </div>
    </DocFigure>
  );
}

/** A decade of solar-return dates. */
export function ReturnsTimeline() {
  const from = julianDay(2026, 1, 1);
  const dates = solarReturn(sampleEngine, SAMPLE_JD, from, from + 365.25 * 10).map(jdToDate);
  return (
    <DocFigure caption={<>Ten years of solar returns from {jdToDate(from)}: the search is a span, so a timeline is one call.</>}>
      <div className="mono" style={{ fontSize: "0.82rem", display: "flex", flexWrap: "wrap", gap: "0.4rem 1.1rem" }}>
        {dates.map((d) => <span key={d} className="mute">{d}</span>)}
      </div>
    </DocFigure>
  );
}

/** Declinations of the sample chart, out-of-bounds flags, and parallels. */
export function DeclinationTable() {
  const present = BODIES.filter((b) => sampleChart.bodies[b]) as BodyId[];
  const pairs = declinationAspects(sampleEngine, present, SAMPLE_JD);
  return (
    <DocFigure caption={<>Each body&rsquo;s declination, with out-of-bounds (beyond the obliquity, ±23.4°) flagged, and the parallels and contraparallels among them.</>}>
      <div style={{ display: "grid", gap: "1.2rem", gridTemplateColumns: "auto auto", alignItems: "start" }}>
        <table className="mono" style={{ fontSize: "0.82rem", width: "auto" }}>
          <tbody>
            {present.map((b) => {
              const dec = sampleChart.bodies[b]!.dec;
              const oob = outOfBounds(sampleEngine, b, SAMPLE_JD);
              return (
                <tr key={b}>
                  <td className="mute" style={cell}>{GLYPHS[b] ? `${GLYPHS[b]} ` : ""}{b}</td>
                  <td style={cell}>{dec >= 0 ? "+" : ""}{dec.toFixed(2)}°</td>
                  <td style={{ ...cell, color: oob ? "var(--warm)" : "var(--text-mute)" }}>{oob ? "out of bounds" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div>
          <div className="dim small" style={{ marginBottom: "0.35rem" }}>Parallels (∥) and contraparallels (⊼), within 1°:</div>
          {pairs.length === 0 ? (
            <p className="dim small" style={{ margin: 0 }}>None.</p>
          ) : (
            <ul className="mono" style={{ lineHeight: 1.7, paddingLeft: "1.1rem", fontSize: "0.82rem", margin: 0 }}>
              {pairs.map((p, i) => (
                <li key={i}>{p.a} {p.kind === "parallel" ? "∥" : "⊼"} {p.b} <span className="mute">({p.kind})</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DocFigure>
  );
}
