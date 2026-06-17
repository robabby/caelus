"use client";

import type { StarParan } from "caelus";
import { GLYPHS } from "caelus-wheel";
import { cell } from "../lib/chart-display";

export interface StarsData {
  conjunctions: Array<{ body: string; star: string; orb: number }>;
  parans: StarParan[];
}

/** Fixed-star longitude conjunctions and Brady parans for the chart. */
export default function StarsTab({ stars }: { stars: StarsData }) {
  return (
    <>
      <p className="dim small" style={{ marginTop: 0 }}>Bright fixed stars (mag ≤ 2.5) within 1° of a body, by longitude:</p>
      {stars.conjunctions.length === 0 ? (
        <p className="dim small" style={{ margin: 0 }}>No close conjunctions.</p>
      ) : (
        <table className="mono" style={{ fontSize: "0.82rem" }}>
          <tbody>
            {stars.conjunctions.map((h, i) => (
              <tr key={i}>
                <td className="mute" style={cell}>{GLYPHS[h.body] ? `${GLYPHS[h.body]} ` : ""}{h.body}</td>
                <td style={cell}>{h.star}</td>
                <td className="mute" style={cell}>{h.orb}°</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="dim small" style={{ margin: "0.8rem 0 0.3rem" }}>
        Parans (Brady): a bright star and a body on the angles at once, this day and latitude (tightest, within 12 min):
      </p>
      {stars.parans.length === 0 ? (
        <p className="dim small" style={{ margin: 0 }}>No parans.</p>
      ) : (
        <ul className="mono" style={{ lineHeight: 1.7, paddingLeft: "1.1rem", fontSize: "0.82rem", margin: 0 }}>
          {stars.parans.map((p, i) => (
            <li key={i}>
              {p.star} <span className="mute">({p.star_angle})</span> {GLYPHS[p.body] ?? p.body} <span className="mute">({p.body_angle}) · {Math.round(p.gap_min)}m</span>
            </li>
          ))}
        </ul>
      )}
      <p className="dim small" style={{ margin: "0.5rem 0 0" }}>From the 319-star HYG catalogue in the embedded data pack.</p>
    </>
  );
}
