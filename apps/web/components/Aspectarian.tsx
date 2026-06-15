"use client";

import { type Chart } from "caelus";
import { GLYPHS } from "caelus-wheel";
import { ASPECT_GLYPH, aspectColor, ASPECTABLE_ORDER } from "../lib/chart-display";

/** The classic triangular aspect grid (aspectarian) plus a legend and the orb list. */
export default function Aspectarian({ chart }: { chart: Chart }) {
  const present = ASPECTABLE_ORDER.filter((b) => chart.bodies[b]);
  const look: Record<string, { aspect: string; orb: number }> = {};
  for (const a of chart.aspects) look[[a.a, a.b].sort().join("|")] = { aspect: a.aspect, orb: a.orb };

  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table className="mono" style={{ borderCollapse: "collapse", fontSize: "0.95rem" }}>
          <tbody>
            {present.map((b, i) => (
              <tr key={b}>
                {present.slice(0, i).map((other) => {
                  const a = look[[b, other].sort().join("|")];
                  return (
                    <td
                      key={other}
                      title={a ? `${b} ${a.aspect} ${other} · orb ${a.orb}°` : `${b} / ${other}`}
                      style={{
                        width: "1.5rem", height: "1.5rem", textAlign: "center",
                        border: "1px solid var(--border)", color: aspectColor(a?.aspect),
                      }}
                    >
                      {a ? ASPECT_GLYPH[a.aspect] ?? "" : ""}
                    </td>
                  );
                })}
                <td style={{ padding: "0 0.4rem", color: "var(--text-mute)", whiteSpace: "nowrap" }}>
                  {GLYPHS[b] ?? b.slice(0, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dim small" style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", margin: "0.55rem 0 0" }}>
        {(["conjunction", "sextile", "square", "trine", "opposition"] as const).map((a) => (
          <span key={a}>
            <span style={{ color: aspectColor(a) }}>{ASPECT_GLYPH[a]}</span> {a}
          </span>
        ))}
      </div>
      <ul className="mono" style={{ lineHeight: 1.8, paddingLeft: "1.1rem", fontSize: "0.82rem", margin: "0.8rem 0 0" }}>
        {chart.aspects.map((a, i) => (
          <li key={i}>{a.a} {a.aspect} {a.b} <span className="mute">(orb {a.orb}°)</span></li>
        ))}
      </ul>
    </>
  );
}
