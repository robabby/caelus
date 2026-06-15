"use client";

import type { DeclinationPair } from "caelus";
import { GLYPHS } from "caelus-wheel";
import { cell } from "../lib/chart-display";

export interface DeclData {
  bodies: Array<{ body: string; dec: number; oob: boolean }>;
  pairs: DeclinationPair[];
}

/** Declination per body, out-of-bounds flags, and parallels / contraparallels. */
export default function DeclinationTab({ decl }: { decl: DeclData }) {
  return (
    <>
      <p className="dim small" style={{ marginTop: 0 }}>Declination (°), with out-of-bounds flagged (beyond the Sun&rsquo;s ±23.4°):</p>
      <table className="mono" style={{ fontSize: "0.82rem" }}>
        <tbody>
          {decl.bodies.map(({ body, dec, oob }) => (
            <tr key={body}>
              <td className="mute" style={cell}>{GLYPHS[body] ? `${GLYPHS[body]} ` : ""}{body}</td>
              <td style={cell}>{dec >= 0 ? "+" : ""}{dec.toFixed(2)}°</td>
              <td style={{ ...cell, color: oob ? "var(--warm)" : "var(--text-mute)" }}>{oob ? "out of bounds" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim small" style={{ margin: "0.8rem 0 0.3rem" }}>Parallels (=) and contraparallels (≠), within 1°:</p>
      {decl.pairs.length === 0 ? (
        <p className="dim small" style={{ margin: 0 }}>None.</p>
      ) : (
        <ul className="mono" style={{ lineHeight: 1.7, paddingLeft: "1.1rem", fontSize: "0.82rem", margin: 0 }}>
          {decl.pairs.map((p, i) => (
            <li key={i}>{p.a} {p.kind === "parallel" ? "∥" : "⊼"} {p.b} <span className="mute">({p.kind})</span></li>
          ))}
        </ul>
      )}
    </>
  );
}
