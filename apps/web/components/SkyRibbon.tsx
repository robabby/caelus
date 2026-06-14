/**
 * The current sky as an ecliptic ribbon, computed at render time from the
 * engine (the core does no I/O, so this is cheap and deterministic per load).
 * Glyphs sit at the real apparent longitudes for "now" in UT. Decoration that
 * is actual engine output, not stock art.
 */
import { Engine, BODIES, SIGNS, fmtLon, type Body } from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { GLYPHS } from "caelus-wheel";

const SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
const W = 1000;
const H = 132;
const ECLIPTIC_Y = 96;
// nodes share a glyph; drawing both doubles it, so skip mean_node like the wheel
const SHOWN = BODIES.filter((b) => b !== "mean_node");

type Placed = { body: Body; lon: number; x: number; y: number };

function place(lons: Array<{ body: Body; lon: number }>): Placed[] {
  const sorted = [...lons].sort((a, b) => a.lon - b.lon);
  const out: Placed[] = [];
  let lastX = -Infinity;
  let row = 0;
  for (const { body, lon } of sorted) {
    const x = (lon / 360) * W;
    if (x - lastX < 34) row += 1;
    else row = 0;
    lastX = x;
    out.push({ body, lon, x, y: ECLIPTIC_Y - 26 - row * 22 });
  }
  return out;
}

export default function SkyRibbon() {
  const now = new Date();
  const engine = new Engine(embeddedData);
  const chart = engine.chart(
    now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
    now.getUTCHours(), now.getUTCMinutes(), 0, 0, 0, "whole_sign",
  );
  const placed = place(SHOWN.flatMap((body) => {
    const p = chart.bodies[body];
    return p ? [{ body, lon: p.lon }] : []; // skip a body outside its fitted range
  }));
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");

  return (
    <figure className="sky-ribbon reveal" aria-label="The current sky, computed by the engine">
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <linearGradient id="ecliptic" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="0.5" stopColor="var(--accent)" stopOpacity="0.7" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {SIGNS.map((sign, i) => {
          const x = (i / 12) * W;
          return (
            <g key={sign}>
              <line x1={x} y1={ECLIPTIC_Y - 6} x2={x} y2={ECLIPTIC_Y + 6} stroke="var(--border-strong)" strokeWidth="1" />
              <text
                x={x + W / 24}
                y={H - 8}
                textAnchor="middle"
                fontSize="15"
                fill="var(--text-faint)"
              >
                {SIGN_GLYPHS[i]}
              </text>
            </g>
          );
        })}

        <line x1="0" y1={ECLIPTIC_Y} x2={W} y2={ECLIPTIC_Y} stroke="url(#ecliptic)" strokeWidth="1.5" />

        {placed.map(({ body, lon, x, y }) => (
          <g key={body}>
            <line x1={x} y1={ECLIPTIC_Y} x2={x} y2={y + 10} stroke="var(--border-strong)" strokeWidth="0.75" opacity="0.7" />
            <circle cx={x} cy={ECLIPTIC_Y} r="2" fill="var(--warm)" />
            <text x={x} y={y} textAnchor="middle" fontSize="17" fill="var(--text)">
              {GLYPHS[body] ?? body.slice(0, 2)}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="eyebrow sky-ribbon__cap">
        sky now · {stamp} UT · sun {fmtLon(chart.bodies.sun.lon)} · moon {fmtLon(chart.bodies.moon.lon)}
      </figcaption>
    </figure>
  );
}
