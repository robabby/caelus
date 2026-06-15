"use client";

import type { CSSProperties } from "react";
import { GLYPHS } from "caelus-wheel";
import { cell } from "../lib/chart-display";

const nowrapCell: CSSProperties = { ...cell, whiteSpace: "nowrap" };

export interface VedicData {
  bodies: Array<{ body: string; nak: { name: string; pada: number }; d9: string; d10: string }>;
  dasha: { maha: string; antar: string | null; pratyantar: string | null } | null;
}

/** Sidereal layer: nakshatra, D9/D10 signs, and the active Vimshottari dasha. */
export default function VedicTab({ vedic }: { vedic: VedicData }) {
  return (
    <>
      <p className="dim small" style={{ marginTop: 0 }}>Sidereal · Lahiri. Nakshatra, then the navamsa (D9) and dasamsa (D10) signs:</p>
      <div style={{ overflowX: "auto" }}>
        <table className="mono" style={{ fontSize: "0.82rem" }}>
          <thead>
            <tr style={{ color: "var(--text-mute)" }}>
              <td style={cell} /><td style={nowrapCell}>nakshatra</td><td style={cell}>D9</td><td style={cell}>D10</td>
            </tr>
          </thead>
          <tbody>
            {vedic.bodies.map(({ body, nak, d9, d10 }) => (
              <tr key={body}>
                <td className="mute" style={nowrapCell}>{GLYPHS[body] ? `${GLYPHS[body]} ` : ""}{body}</td>
                <td style={nowrapCell}>{nak.name} <span className="mute">p{nak.pada}</span></td>
                <td className="mute" style={cell}>{d9}</td>
                <td className="mute" style={cell}>{d10}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {vedic.dasha && (
        <p className="dim small" style={{ margin: "0.8rem 0 0" }}>
          Vimshottari dasha today:{" "}
          <strong style={{ color: "var(--text)" }}>{vedic.dasha.maha}</strong>
          {vedic.dasha.antar && <> › {vedic.dasha.antar}</>}
          {vedic.dasha.pratyantar && <> › {vedic.dasha.pratyantar}</>}
        </p>
      )}
      <p className="dim small" style={{ margin: "0.4rem 0 0" }}>
        Reading the chart as a birth moment. Also: Yogini and Ashtottari dashas, the vargas, and the yogas.
      </p>
    </>
  );
}
