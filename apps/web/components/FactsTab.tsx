"use client";

import { useMemo } from "react";
import {
  interpretationContext, enrichContextOptions, julianDay,
  type Chart, type Engine, type Zodiac,
} from "caelus";

const MAX = 46;

const KIND_LABEL: Record<string, string> = {
  placement: "place", aspect: "aspect", pattern: "pattern", signature: "sig",
  angle: "angle", dispositor: "dispos", reception: "recept", star: "star", lot: "lot",
  transit: "trans", synastry: "syn", composite: "comp", timelord: "lord",
  dignity: "dign", nakshatra: "nak", varga: "varga", yoga: "yoga",
};

export interface FactsTabProps {
  chart: Chart;
  engine: Engine;
  lat: number;
  lonEast: number;
  zodiac: Zodiac;
  stars: { body: string; star: string; orb: number }[];
  lots: { lot: string; sign: string; signDeg: number; house: number }[];
}

/**
 * The citable-atom substrate: the chart projected into a flat, ranked list of
 * typed fact atoms (the same enriched projection the Reading tab uses).
 */
export default function FactsTab({
  chart, engine, lat, lonEast, zodiac, stars, lots,
}: FactsTabProps) {
  const { atoms, max, enriched } = useMemo(() => {
    const now = new Date();
    const targetJd = julianDay(
      now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
      now.getUTCHours(), now.getUTCMinutes(),
    );
    const ctx = interpretationContext(chart, {
      stars, lots,
      ...enrichContextOptions(engine, chart, { jd: targetJd, lat, lonEast, zodiac }),
    });
    const max = ctx.atoms.reduce((m, a) => Math.max(m, a.salience), 1);
    const kinds = new Set(ctx.atoms.map((a) => a.kind));
    return {
      atoms: ctx.atoms,
      max,
      enriched: kinds.has("transit") || kinds.has("timelord") || kinds.has("dignity"),
    };
  }, [chart, engine, lat, lonEast, zodiac, stars, lots]);

  return (
    <div style={{ fontSize: "0.82rem" }}>
      <p className="dim small" style={{ marginTop: 0 }}>
        <strong style={{ color: "var(--text)" }}>{atoms.length}</strong> ranked fact atoms: the
        structured, citable substrate the Reading is built on, and the same shape MCP
        <code>chart_facts</code> returns.
        {enriched && (
          <> Includes transits, time-lords, and finer dignities active{" "}
            <strong style={{ color: "var(--text)" }}>now</strong>.</>
        )}
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
        This is <code>interpretationContext()</code> with <code>enrichContextOptions()</code>.
        A rule corpus or an LLM cites these ids; <code>auditCitations</code> verifies them.
        See the <a href="/docs/interpretation">interpretation layer</a>.
      </p>
    </div>
  );
}
