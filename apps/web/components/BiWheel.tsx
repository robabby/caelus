"use client";

import { mod, type Chart } from "caelus";
import { GLYPHS } from "caelus-wheel";

const SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

function aspectColor(a: string): string {
  if (a === "square" || a === "opposition") return "var(--bad)";
  if (a === "trine" || a === "sextile") return "var(--good)";
  return "var(--text-mute)";
}

export interface SynContact { aBody: string; bBody: string; aspect: string; orb: number }

/**
 * A synastry bi-wheel: the inner chart's planets, the outer chart's planets in a
 * ring outside them, the zodiac, and the inter-chart aspect web. Oriented to the
 * inner chart's Ascendant (9 o'clock, counterclockwise), matching ChartWheel.
 */
export default function BiWheel({
  inner, outer, contacts, size = 360, innerLabel = "A", outerLabel = "B",
}: {
  inner: Chart;
  outer: Chart;
  contacts: SynContact[];
  size?: number;
  innerLabel?: string;
  outerLabel?: string;
}) {
  const c = size / 2;
  const R = (size / 2) * 0.9;
  const asc = inner.angles.asc;
  const pad = size * 0.04;
  const pt = (lon: number, r: number): [number, number] => {
    const a = ((lon - asc + 180) * Math.PI) / 180;
    return [c + r * R * Math.cos(a), c - r * R * Math.sin(a)];
  };
  const fix = (v: number) => Math.round(v * 100) / 100;
  const ring = (r: number, key: string, w = 1) => (
    <circle key={key} cx={c} cy={c} r={fix(r * R)} fill="none" stroke="var(--wheel-ring)" strokeWidth={w} />
  );
  const lineEl = (l0: [number, number], l1: [number, number], props: object, key: string) => (
    <line key={key} x1={fix(l0[0])} y1={fix(l0[1])} x2={fix(l1[0])} y2={fix(l1[1])} {...props} />
  );
  const glyphEl = (lon: number, r: number, content: string, fontSize: number, fill: string, key: string) => {
    const [x, y] = pt(lon, r);
    return (
      <text key={key} x={fix(x)} y={fix(y)} fontSize={fontSize} fill={fill}
        textAnchor="middle" dominantBaseline="central"
        fontFamily="ui-monospace, Menlo, Consolas, monospace">{content}</text>
    );
  };

  const el: React.ReactElement[] = [];
  el.push(ring(1.0, "r-out", 1.5), ring(0.86, "r-zod"), ring(0.58, "r-asp"));

  // zodiac signs
  for (let s = 0; s < 12; s++) {
    el.push(lineEl(pt(s * 30, 0.86), pt(s * 30, 1.0), { stroke: "var(--wheel-ring)", strokeWidth: 1 }, `sb-${s}`));
    el.push(glyphEl(s * 30 + 15, 0.93, SIGN_GLYPHS[s], size * 0.045, "var(--wheel-sign)", `sg-${s}`));
  }

  // inner-chart Ascendant / MC axes
  for (const [lon, lbl] of [[asc, "AC"], [inner.angles.mc, "MC"]] as Array<[number, string]>) {
    el.push(lineEl(pt(lon, 0.58), pt(lon, 1.0), { stroke: "var(--accent)", strokeWidth: 2 }, `ax-${lbl}`));
  }

  // inter-chart aspect web (inner radius)
  for (const k of contacts) {
    const la = inner.bodies[k.aBody]?.lon;
    const lb = outer.bodies[k.bBody]?.lon;
    if (la === undefined || lb === undefined) continue;
    const hard = k.aspect === "square" || k.aspect === "opposition" || k.aspect === "conjunction";
    el.push(lineEl(pt(la, 0.58), pt(lb, 0.58), {
      stroke: aspectColor(k.aspect), strokeWidth: 1, opacity: 0.55,
      strokeDasharray: hard ? undefined : "4 3",
    }, `c-${k.aBody}-${k.bBody}`));
  }

  // planets: inner ring then outer ring, each with a pointer tick
  const planets = (chart: Chart, glyphR: number, tick: [number, number], fill: string, prefix: string) => {
    for (const b of Object.keys(chart.bodies)) {
      const p = chart.bodies[b];
      if (!p || b === "mean_node") continue;
      el.push(lineEl(pt(p.lon, tick[0]), pt(p.lon, tick[1]), { stroke: fill, strokeWidth: 1 }, `${prefix}t-${b}`));
      el.push(glyphEl(p.lon, glyphR, GLYPHS[b] ?? b.slice(0, 2), size * 0.045, fill, `${prefix}g-${b}`));
    }
  };
  planets(inner, 0.68, [0.58, 0.62], "var(--text)", "in-");
  planets(outer, 0.80, [0.84, 0.86], "var(--accent)", "out-");

  return (
    <svg width={size} height={size} viewBox={`${-pad} ${-pad} ${size + 2 * pad} ${size + 2 * pad}`}
      role="img" aria-label={`synastry bi-wheel: ${innerLabel} inner, ${outerLabel} outer`}
      style={{ display: "block" }}>
      {el}
    </svg>
  );
}
