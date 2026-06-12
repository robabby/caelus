"use client";
/**
 * Visual check page for caelus-wheel (unlinked from nav, used in review).
 * Four charts chosen to stress the renderer: the canonical fixture, a polar
 * whole-sign fallback, the 1962-02-05 Aquarius stellium (5 bodies within 3°
 * plus the node pair — collision avoidance), and an equal-house chart.
 */
import { Engine } from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { ChartWheel } from "caelus-wheel";

const engine = new Engine(embeddedData);

const CHARTS: Array<[string, Parameters<Engine["chart"]>]> = [
  ["canonical fixture — 1990-06-10 18:30 UT, Tampa, placidus",
    [1990, 6, 10, 18, 30, 0, 27.95, -82.46, "placidus"]],
  ["polar fallback — 1985-12-01 09:00 UT, Svalbard, placidus → whole_sign",
    [1985, 12, 1, 9, 0, 0, 78.2, 15.6, "placidus"]],
  ["stellium — 1962-02-05 00:00 UT (5 bodies within 3° in Aquarius)",
    [1962, 2, 5, 0, 0, 0, 27.95, -82.46, "placidus"]],
  ["equal houses — 2026-03-20 14:46 UT, London",
    [2026, 3, 20, 14, 46, 0, 51.5, -0.12, "equal"]],
];

export default function WheelDemo() {
  return (
    <main>
      <h1 style={{ letterSpacing: "0.05em" }}>wheel demo</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2rem" }}>
        {CHARTS.map(([label, args]) => (
          <figure key={label} style={{ margin: 0 }}>
            <ChartWheel chart={engine.chart(...args)} size={440} />
            <figcaption style={{ opacity: 0.6, fontSize: "0.8em", maxWidth: 440 }}>
              {label}
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
