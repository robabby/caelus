import {
  lots, HERMETIC_LOTS, fmtLon,
  profectionAt,
  firdaria, isDayChart,
  zrRelease, zrAt,
  primaryDirections,
} from "caelus";
import { GLYPHS } from "caelus-wheel";
import {
  sampleEngine, SAMPLE, SAMPLE_JD, TARGET_JD, TARGET, jdToDate,
} from "../../lib/sample-chart";
import { DocFigure, cell } from "./DocFigure";

const { lat, lon } = SAMPLE;

/** The seven Hermetic lots of the sample natal. */
export function LotsTable() {
  const l = lots(sampleEngine, SAMPLE_JD, lat, lon);
  return (
    <DocFigure caption={<>The seven Hermetic lots of the sample chart ({l.day ? "a day chart" : "a night chart"}). Fortune and Spirit are symmetric about the Ascendant.</>}>
      <table className="mono" style={{ fontSize: "0.82rem", width: "auto" }}>
        <tbody>
          {HERMETIC_LOTS.map((name) => (
            <tr key={name}>
              <td className="mute" style={cell}>{name}</td>
              <td style={cell}>{fmtLon(l[name])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DocFigure>
  );
}

/** Annual and monthly profection of the sample natal at the fixed target date. */
export function ProfectionPanel() {
  const p = profectionAt(sampleEngine, SAMPLE_JD, TARGET_JD, lat, lon);
  return (
    <DocFigure caption={<>Profection at {TARGET.y}-{String(TARGET.mo).padStart(2, "0")}-{String(TARGET.d).padStart(2, "0")}, age {p.age_years}. The lord of the year rules the profected sign; the monthly profection advances one further sign per twelfth of the year.</>}>
      <table className="mono" style={{ fontSize: "0.82rem", width: "auto" }}>
        <tbody>
          <tr>
            <td className="mute" style={cell}>annual (age {p.age_years})</td>
            <td style={cell}>house {p.annual.house}</td>
            <td style={cell}>{p.annual.sign}</td>
            <td style={cell}>lord {GLYPHS[p.annual.lord] ?? ""} {p.annual.lord}</td>
          </tr>
          <tr>
            <td className="mute" style={cell}>monthly (month {p.month})</td>
            <td style={cell}>house {p.monthly.house}</td>
            <td style={cell}>{p.monthly.sign}</td>
            <td style={cell}>lord {GLYPHS[p.monthly.lord] ?? ""} {p.monthly.lord}</td>
          </tr>
        </tbody>
      </table>
    </DocFigure>
  );
}

/** The nine firdaria major periods, with the one active at the target marked. */
export function FirdariaTimeline() {
  const day = isDayChart(sampleEngine, SAMPLE_JD, lat, lon);
  const periods = firdaria(day, SAMPLE_JD);
  return (
    <DocFigure caption={<>The nine firdaria periods (75 years), {day ? "a day chart beginning with the Sun" : "a night chart beginning with the Moon"}. The highlighted row is active at the target date; its sub-period lord comes from <code>firdariaAt</code>.</>}>
      <table className="mono" style={{ fontSize: "0.82rem", width: "auto" }}>
        <tbody>
          {periods.map((per) => {
            const active = per.start <= TARGET_JD && TARGET_JD < per.end;
            return (
              <tr key={per.lord} style={active ? { background: "var(--surface-2)" } : undefined}>
                <td style={{ ...cell, color: active ? "var(--accent)" : "var(--text)" }}>
                  {GLYPHS[per.lord] ?? ""} {per.lord}
                </td>
                <td className="mute" style={cell}>{per.years}y</td>
                <td className="mute" style={cell}>{jdToDate(per.start)} → {jdToDate(per.end)}</td>
                {active && <td style={{ ...cell, color: "var(--accent)" }}>active now</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </DocFigure>
  );
}

/** The L1 zodiacal-releasing periods from Spirit, with the active level shown. */
export function ReleasingPanel() {
  const z = zrAt(sampleEngine, SAMPLE_JD, TARGET_JD, lat, lon, "spirit");
  // The L1 timeline needs the Lot of Spirit's sign index; derive it once.
  const l = lots(sampleEngine, SAMPLE_JD, lat, lon);
  const lotSign = ((Math.floor(l.spirit / 30) % 12) + 12) % 12;
  const periods = zrRelease(lotSign, SAMPLE_JD, 1, 100);
  return (
    <DocFigure caption={<>Zodiacal releasing from the Lot of Spirit ({z.lot_sign}). The L1 periods release sign by sign in 360-day years; the loosing of the bond (<code>lb</code>) jumps to the opposite sign. Active at the target: L1 {z.l1} › L2 {z.l2} › L3 {z.l3} › L4 {z.l4}.</>}>
      <table className="mono" style={{ fontSize: "0.82rem", width: "auto" }}>
        <tbody>
          {periods.map((per, i) => {
            const active = per.start <= TARGET_JD && TARGET_JD < per.end;
            return (
              <tr key={i} style={active ? { background: "var(--surface-2)" } : undefined}>
                <td style={{ ...cell, color: active ? "var(--accent)" : "var(--text)" }}>{per.sign}</td>
                <td className="mute" style={cell}>{jdToDate(per.start)} → {jdToDate(per.end)}</td>
                <td className="mute" style={cell}>{per.lb ? "loosing of the bond" : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DocFigure>
  );
}

/** Primary directions to the four angles, soonest first. */
export function DirectionsTable() {
  const dirs = primaryDirections(sampleEngine, SAMPLE_JD, lat, lon).slice(0, 10);
  return (
    <DocFigure caption={<>Direct primary directions of the seven traditional planets to the four angles (Naibod key), soonest first. The age is the arc of diurnal rotation converted by the time key.</>}>
      <table className="mono" style={{ fontSize: "0.82rem", width: "auto" }}>
        <tbody>
          {dirs.map((d, i) => (
            <tr key={i}>
              <td className="mute" style={cell}>{GLYPHS[d.body] ?? ""} {d.body}</td>
              <td style={cell}>→ {d.angle}</td>
              <td className="mute" style={cell}>age {d.years.toFixed(1)}</td>
              <td className="mute" style={cell}>{jdToDate(d.jd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DocFigure>
  );
}
