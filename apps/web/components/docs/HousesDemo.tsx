import { fmtLon, type BodyId, type HouseSystem, type Zodiac } from "caelus";
import { GLYPHS } from "caelus-wheel";
import { sampleEngine, SAMPLE, SAMPLE_JD } from "../../lib/sample-chart";
import { DocFigure, cell } from "./DocFigure";

const { lat, lon } = SAMPLE;

const SYSTEMS: HouseSystem[] = ["placidus", "koch", "whole_sign", "equal"];

/** The twelve house cusps of the sample chart across four systems. */
export function CuspComparison() {
  const charts = SYSTEMS.map((s) => ({ system: s, chart: sampleEngine.chartAt(SAMPLE_JD, lat, lon, s) }));
  return (
    <DocFigure caption={<>The same instant, four house systems. The Ascendant and Midheaven are identical across all of them (they are astronomical, not a division rule); the intermediate cusps are where the systems disagree.</>}>
      <table className="mono" style={{ fontSize: "0.78rem", width: "auto" }}>
        <thead>
          <tr style={{ color: "var(--text-mute)" }}>
            <td style={cell}>cusp</td>
            {charts.map(({ system }) => <td key={system} style={cell}>{system}</td>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 12 }, (_, i) => (
            <tr key={i}>
              <td className="mute" style={cell}>{i + 1}{i === 0 ? " (ASC)" : i === 9 ? " (MC)" : ""}</td>
              {charts.map(({ system, chart }) => (
                <td key={system} style={cell}>{fmtLon(chart.cusps[i])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </DocFigure>
  );
}

const ZODIACS: Array<[string, Zodiac]> = [
  ["tropical", "tropical"],
  ["lahiri", "sidereal:lahiri"],
  ["fagan/bradley", "sidereal:fagan_bradley"],
  ["krishnamurti", "sidereal:krishnamurti"],
];
const ZBODIES: BodyId[] = ["sun", "moon", "mercury", "venus", "mars"];

/** The same bodies in the tropical zodiac and three sidereal ayanamsas. */
export function ZodiacComparison() {
  return (
    <DocFigure caption={<>The same positions, tropical and three sidereal ayanamsas. Each sidereal mode subtracts its ayanamsa, shifting every longitude back by ~24°.</>}>
      <table className="mono" style={{ fontSize: "0.8rem", width: "auto" }}>
        <thead>
          <tr style={{ color: "var(--text-mute)" }}>
            <td style={cell} />
            {ZODIACS.map(([label]) => <td key={label} style={cell}>{label}</td>)}
          </tr>
        </thead>
        <tbody>
          {ZBODIES.map((b) => (
            <tr key={b}>
              <td className="mute" style={cell}>{GLYPHS[b] ? `${GLYPHS[b]} ` : ""}{b}</td>
              {ZODIACS.map(([label, z]) => (
                <td key={label} style={cell}>{fmtLon(sampleEngine.longitude(b, SAMPLE_JD, { zodiac: z }))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </DocFigure>
  );
}
