"use client";

import {
  fmtLon, HERMETIC_LOTS,
  type ChartSignature, type ChartPattern, type DignityScore, type ChartLots, type Profection,
} from "caelus";
import { PATTERN_LABEL, cell } from "../lib/chart-display";

const ELEMENTS = ["fire", "earth", "air", "water"] as const;

function dignityLabel(d: DignityScore): string {
  if (d.rulership) return "domicile";
  if (d.exaltation) return "exalted";
  if (d.detriment) return "detriment";
  if (d.fall) return "fall";
  if (d.peregrine) return "peregrine";
  const minor = [d.triplicity && "triplicity", d.term && "term", d.face && "face"].filter(Boolean);
  return minor.length ? minor.join(", ") : "—";
}

export interface InsightsData {
  signature: ChartSignature;
  patterns: ChartPattern[];
  dignities: DignityScore[];
  lots: ChartLots;
  profection: Profection;
  sect: string;
}

const heading: React.CSSProperties = {
  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem",
};

/** The Phase 4 symbolic layer: signature, configurations, dignities, lots, time-lords. */
export default function InsightsTab({
  insights, focus, onToggle,
}: {
  insights: InsightsData;
  focus: { key: string; bodies: string[] } | null;
  onToggle: (key: string, bodies: string[]) => void;
}) {
  const focusBodies = focus?.bodies;
  const total = ELEMENTS.reduce((s, el) => s + insights.signature.elements[el], 0) || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem", fontSize: "0.82rem" }}>
      {/* Signature */}
      <div>
        <div className="dim small" style={heading}>Signature</div>
        {ELEMENTS.map((e) => {
          const n = insights.signature.elements[e];
          return (
            <div key={e} style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0.15rem 0" }}>
              <span className="mute" style={{ width: "3.4rem" }}>{e}</span>
              <div style={{ flex: 1, background: "var(--surface-2)", borderRadius: 2, height: "0.6rem", overflow: "hidden" }}>
                <div style={{ width: `${(n / total) * 100}%`, background: "var(--accent)", height: "100%" }} />
              </div>
              <span className="mute" style={{ width: "1.2rem", textAlign: "right" }}>{n}</span>
            </div>
          );
        })}
        <p className="dim small" style={{ margin: "0.5rem 0 0" }}>
          {insights.signature.modalities.cardinal}c · {insights.signature.modalities.fixed}f · {insights.signature.modalities.mutable}m
          {" · dominant "}<strong style={{ color: "var(--text)" }}>{insights.signature.dominant.element} {insights.signature.dominant.modality}</strong>
          {insights.signature.dominant.sign && <> in {insights.signature.dominant.sign}</>}
          {insights.signature.ruler && <> · ruler {insights.signature.ruler}</>}
        </p>
      </div>

      {/* Configurations */}
      <div>
        <div className="dim small" style={heading}>Configurations</div>
        {insights.patterns.length === 0 ? (
          <p className="dim small" style={{ margin: 0 }}>No major configurations.</p>
        ) : (
          <>
            <div className="mono" style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
              {insights.patterns.map((p, i) => {
                const active = focus?.key === `p${i}`;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onToggle(`p${i}`, p.bodies)}
                    aria-pressed={active}
                    title="Isolate this configuration on the wheel"
                    style={{
                      textAlign: "left", font: "inherit", fontSize: "0.82rem", cursor: "pointer",
                      background: active ? "var(--surface-2)" : "transparent",
                      border: "1px solid", borderColor: active ? "var(--accent)" : "transparent",
                      borderRadius: "var(--radius-sm)", padding: "0.2rem 0.45rem", color: "var(--text)",
                    }}
                  >
                    {PATTERN_LABEL[p.kind] ?? p.kind}{" "}
                    <span className="mute">
                      {p.bodies.join(", ")}
                      {p.sign ? ` · ${p.sign}` : ""}
                      {p.apex ? ` · apex ${p.apex}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="dim small" style={{ margin: "0.4rem 0 0" }}>
              {focusBodies ? "Showing one configuration on the wheel. " : ""}
              Click a configuration to isolate it on the wheel.
            </p>
          </>
        )}
      </div>

      {/* Dignities */}
      <div>
        <div className="dim small" style={heading}>Dignity ({insights.sect} chart)</div>
        <table className="mono" style={{ fontSize: "0.82rem" }}>
          <tbody>
            {insights.dignities.map((d) => (
              <tr key={d.planet}>
                <td className="mute" style={cell}>{d.planet}</td>
                <td style={{ ...cell, color: d.total > 0 ? "var(--good)" : d.total < 0 ? "var(--bad)" : "var(--text-dim)" }}>
                  {d.total > 0 ? "+" : ""}{d.total}
                </td>
                <td className="mute" style={cell}>{dignityLabel(d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hermetic lots */}
      <div>
        <div className="dim small" style={heading}>Hermetic lots</div>
        <table className="mono" style={{ fontSize: "0.82rem" }}>
          <tbody>
            {HERMETIC_LOTS.map((name) => (
              <tr key={name}>
                <td className="mute" style={cell}>{name}</td>
                <td style={cell}>{fmtLon(insights.lots[name])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Time-lords */}
      <div>
        <div className="dim small" style={heading}>Time-lords (today)</div>
        <p className="small" style={{ margin: 0 }}>
          Age {insights.profection.age_years} · lord of the year{" "}
          <strong style={{ color: "var(--text)" }}>{insights.profection.annual.lord}</strong>{" "}
          <span className="mute">({insights.profection.annual.sign}, house {insights.profection.annual.house})</span>
        </p>
        <p className="dim small" style={{ margin: "0.2rem 0 0" }}>
          Month {insights.profection.month}: {insights.profection.monthly.lord} ({insights.profection.monthly.sign}).
          Also firdaria, zodiacal releasing, and primary directions.
        </p>
      </div>
    </div>
  );
}
