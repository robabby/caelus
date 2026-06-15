import { BODIES, fmtLon } from "caelus";
import { ChartWheel, GLYPHS } from "caelus-wheel";
import { WHEEL_THEME } from "../../lib/wheelTheme";
import { sampleChart, SAMPLE } from "../../lib/sample-chart";
import { DocFigure, cell } from "./DocFigure";

/**
 * The sample natal chart rendered as a wheel beside its positions table: the
 * exact `Chart` object the code sample on this page produces, drawn live.
 */
export function NatalChart() {
  const c = sampleChart;
  return (
    <DocFigure
      caption={
        <>
          The sample chart from the code above: {SAMPLE.label}, {SAMPLE.place} ({SAMPLE.lat}°,
          {" "}{SAMPLE.lon}° east-positive), {c.houseSystem}. Rendered server-side from the same{" "}
          <code>Chart</code> object with <code>{"<ChartWheel chart={chart} />"}</code> from{" "}
          <code>caelus-wheel</code>.
        </>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 320px) minmax(0, 1fr)",
          gap: "1.5rem",
          alignItems: "center",
          width: "100%",
        }}
      >
        <div className="chart-fluid" style={{ maxWidth: 320 }}>
          <ChartWheel chart={c} size={320} theme={WHEEL_THEME} />
        </div>
        <table className="mono" style={{ fontSize: "0.8rem", width: "auto" }}>
          <tbody>
            {BODIES.map((b) => {
              const p = c.bodies[b];
              return (
                <tr key={b}>
                  <td className="mute" style={cell}>{GLYPHS[b] ? `${GLYPHS[b]} ` : ""}{b}</td>
                  {p ? (
                    <>
                      <td style={cell}>{fmtLon(p.lon)}{p.retrograde ? " ℞" : ""}</td>
                      <td className="mute" style={cell}>h{p.house}</td>
                    </>
                  ) : (
                    <td className="mute" style={cell} colSpan={2}>n/a (outside fitted range)</td>
                  )}
                </tr>
              );
            })}
            <tr><td className="mute" style={cell}>ASC</td><td style={cell}>{fmtLon(c.angles.asc)}</td><td /></tr>
            <tr><td className="mute" style={cell}>MC</td><td style={cell}>{fmtLon(c.angles.mc)}</td><td /></tr>
          </tbody>
        </table>
      </div>
    </DocFigure>
  );
}
