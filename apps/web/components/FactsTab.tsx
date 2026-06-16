"use client";

import { useMemo } from "react";
import { interpretationContext, type Chart } from "caelus";

const MAX = 46;

const KIND_LABEL: Record<string, string> = {
  placement: "place", aspect: "aspect", pattern: "pattern", signature: "sig",
  angle: "angle", dispositor: "dispos", reception: "recept", star: "star", lot: "lot",
};

export interface FactsTabProps {
  chart: Chart;
  stars: { body: string; star: string; orb: number }[];
  lots: { lot: string; sign: string; signDeg: number; house: number }[];
}

/**
 * The citable-atom substrate: the chart projected into a flat, ranked list of
 * typed fact atoms (the same projection the reading is built on, and the shape
 * an LLM receives via chartBrief). Every atom carries a stable id, a transparent
 * salience, and a plain-language statement — structured output, not prose.
 */
export default function FactsTab({ chart, stars, lots }: FactsTabProps) {
  const { atoms, max } = useMemo(() => {
    const ctx = interpretationContext(chart, { stars, lots });
    const max = ctx.atoms.reduce((m, a) => Math.max(m, a.salience), 1);
    return { atoms: ctx.atoms, max };
  }, [chart, stars, lots]);

  return (
    <div style={{ fontSize: "0.82rem" }}>
      <p className="dim small" style={{ marginTop: 0 }}>
        <strong style={{ color: "var(--text)" }}>{atoms.length}</strong> ranked fact atoms: the
        structured, citable substrate the reading is built on, and the same shape an LLM receives.
        Each carries a stable <code>id</code>, a salience, and the enriched fields (aspect phase and
        strength, dignities, sect) the bare chart omits.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {atoms.slice(0, MAX).map((a) => (
          <div
            key={a.id}
            style={{ display: "grid", gridTemplateColumns: "2.6rem 4.2rem 1fr", gap: "0.5rem", alignItems: "baseline" }}
          >
            <div
              title={`salience ${a.salience.toFixed(1)}`}
              style={{ background: "var(--surface-2)", borderRadius: 2, height: "0.5rem", overflow: "hidden", alignSelf: "center" }}
            >
              <div style={{ width: `${(a.salience / max) * 100}%`, background: "var(--accent)", height: "100%" }} />
            </div>
            <span className="mono mute" style={{ fontSize: "0.66rem" }}>{KIND_LABEL[a.kind] ?? a.kind}</span>
            <span>
              <span className="mono" style={{ color: "var(--accent)", fontSize: "0.72rem", marginRight: "0.5rem" }}>{a.id}</span>
              <span className="mute">{a.text}</span>
            </span>
          </div>
        ))}
      </div>
      {atoms.length > MAX && (
        <p className="dim small" style={{ margin: "0.5rem 0 0" }}>+ {atoms.length - MAX} more, lower-salience.</p>
      )}
      <p className="dim small" style={{ margin: "0.5rem 0 0" }}>
        This is <code>interpretationContext()</code>. A rule corpus or an LLM cites these ids; the math was
        never theirs to invent. See the <a href="/docs/interpretation">interpretation layer</a>.
      </p>
    </div>
  );
}
