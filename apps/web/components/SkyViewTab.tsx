import { useEffect, useMemo, useState } from "react";
import { Engine, skyView, type SkyViewResult } from "caelus";
import { cell, control } from "../lib/chart-display";

const LENSES = ["ultrawide", "wide", "standard", "normal", "portrait", "telephoto", "supertele"];

const BODY_COLOR: Record<string, string> = {
  sun: "#ffd27f", moon: "#ece8f2", mercury: "#c9c4d4", venus: "#ffffff",
  mars: "#e08a8a", jupiter: "#efe0b4", saturn: "#e3d3a6",
};
function colorOf(id: string): string {
  if (id.startsWith("star:")) return "#cfe0ff";
  return BODY_COLOR[id] ?? "var(--accent)";
}

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.15rem", fontSize: "0.75rem" };

export default function SkyViewTab({ engine, jdUt, lat, lonEast }: {
  engine: Engine; jdUt: number; lat: number; lonEast: number;
}) {
  const [azimuth, setAzimuth] = useState("W");
  const [altitude, setAltitude] = useState("5");
  const [lens, setLens] = useState("normal");
  const [w, setW] = useState("1024");
  const [h, setH] = useState("683");
  const [bortle, setBortle] = useState("");
  const [offsetMin, setOffsetMin] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ov, setOv] = useState({ ecliptic: false, signs: false, houses: false, constellations: false });
  const anyOverlay = ov.ecliptic || ov.signs || ov.houses || ov.constellations;

  // Animation: advance the instant a step per tick and re-render. Each frame is
  // a fresh exact skyView, so stars rotate about the pole, the Moon drifts, and
  // twilight evolves -- a live preview of a sky-view sequence.
  const OFFSET_MAX = 600; // minutes
  const STEP = 8;         // minutes per tick
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setOffsetMin((m) => (m + STEP > OFFSET_MAX ? -120 : m + STEP));
    }, 200);
    return () => clearInterval(id);
  }, [playing]);

  const effJd = jdUt + offsetMin / 1440;
  const result = useMemo<SkyViewResult | { error: string }>(() => {
    try {
      return skyView(engine, effJd, {
        observer: { lat, lonEast },
        aim: { azimuth, altitude: Number(altitude) },
        lens,
        image: { width: Math.round(Number(w)), height: Math.round(Number(h)) },
      }, { bortle: bortle ? Number(bortle) : undefined, overlays: anyOverlay ? ov : undefined });
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [engine, effJd, lat, lonEast, azimuth, altitude, lens, w, h, bortle, ov, anyOverlay]);

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.8rem" }}>
        <label style={field}>aim
          <input style={{ ...control, width: "4.5rem" }} value={azimuth}
            onChange={(e) => setAzimuth(e.target.value)} aria-label="aim azimuth (compass or degrees)" />
        </label>
        <label style={field}>altitude°
          <input style={{ ...control, width: "4rem" }} value={altitude} type="number"
            onChange={(e) => setAltitude(e.target.value)} aria-label="aim altitude in degrees" />
        </label>
        <label style={field}>lens
          <select style={control} value={lens} onChange={(e) => setLens(e.target.value)} aria-label="lens preset">
            {LENSES.map((l) => <option key={l}>{l}</option>)}
          </select>
        </label>
        <label style={field}>width
          <input style={{ ...control, width: "4.5rem" }} value={w} type="number"
            onChange={(e) => setW(e.target.value)} aria-label="image width in pixels" />
        </label>
        <label style={field}>height
          <input style={{ ...control, width: "4.5rem" }} value={h} type="number"
            onChange={(e) => setH(e.target.value)} aria-label="image height in pixels" />
        </label>
        <label style={field}>dark sky
          <select style={control} value={bortle} onChange={(e) => setBortle(e.target.value)} aria-label="Bortle dark-sky class">
            <option value="">auto</option>
            <option value="1">Bortle 1 (pristine)</option>
            <option value="2">Bortle 2</option>
            <option value="3">Bortle 3 (rural)</option>
            <option value="4">Bortle 4</option>
            <option value="5">Bortle 5 (suburban)</option>
            <option value="7">Bortle 7 (city)</option>
            <option value="9">Bortle 9 (inner city)</option>
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginBottom: "0.8rem" }}>
        <button type="button" className="mono" style={{ ...control, cursor: "pointer", minWidth: "4.2rem" }}
          onClick={() => setPlaying((p) => !p)} aria-label={playing ? "pause animation" : "play animation"}>
          {playing ? "❚❚ pause" : "▶ play"}
        </button>
        <input type="range" min={-120} max={OFFSET_MAX} step={1} value={offsetMin}
          onChange={(e) => { setPlaying(false); setOffsetMin(Number(e.target.value)); }}
          style={{ flex: 1, accentColor: "var(--accent)" }} aria-label="time offset in minutes" />
        <span className="mono small mute" style={{ minWidth: "5.5rem", textAlign: "right" }}>
          {offsetMin >= 0 ? "+" : ""}{(offsetMin / 60).toFixed(1)} h
        </span>
        {offsetMin !== 0 && (
          <button type="button" className="mono small" style={{ ...control, cursor: "pointer" }}
            onClick={() => { setPlaying(false); setOffsetMin(0); }} aria-label="reset time">reset</button>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap", marginBottom: "0.8rem", fontSize: "0.78rem" }}>
        <span className="mute">overlays:</span>
        {(["ecliptic", "signs", "houses", "constellations"] as const).map((k) => (
          <label key={k} style={{ display: "flex", gap: "0.3rem", alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={ov[k]} style={{ accentColor: "var(--accent)" }}
              onChange={(e) => setOv((s) => ({ ...s, [k]: e.target.checked }))} />
            {k}
          </label>
        ))}
      </div>

      {"error" in result ? (
        <p className="small" style={{ color: "var(--bad)" }}>{result.error}</p>
      ) : (
        <SkyViewBody result={result} onCopy={copy} copied={copied} />
      )}

      <p className="dim small" style={{ marginTop: "0.8rem" }}>
        Caelus places the bodies and describes the sky; it does not render the image. Aim takes a
        compass point (W, WNW) or degrees from true north; the prompt is built for an image model.
        Press play (or scrub) to step time forward and watch the sky rotate, the Moon drift, and
        twilight evolve. Each frame is a fresh exact computation.
      </p>
    </div>
  );
}

function SkyViewBody({ result, onCopy, copied }: {
  result: SkyViewResult; onCopy: (t: string) => void; copied: boolean;
}) {
  const { sky, lens, image, bodies, offFrame, milkyWay, overlays, aim, prompt } = result;
  const W = image.width;
  const H = image.height;
  const dotR = Math.max(H * 0.014, 4);

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", maxWidth: 420, height: "auto", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", background: "linear-gradient(#10101e, #1a1322)", display: "block" }}
        role="img"
        aria-label="sky frame preview"
      >
        {milkyWay.visible && milkyWay.inFrame && milkyWay.entry && milkyWay.exit && (
          <line x1={milkyWay.entry.x} y1={milkyWay.entry.y} x2={milkyWay.exit.x} y2={milkyWay.exit.y}
            stroke="#b9c4ff" strokeOpacity={0.18} strokeWidth={H * 0.12} strokeLinecap="round" />
        )}
        {milkyWay.visible && milkyWay.galacticCenter?.inFrame && (
          <circle cx={milkyWay.galacticCenter.x} cy={milkyWay.galacticCenter.y} r={H * 0.09}
            fill="#cdd6ff" opacity={0.16} />
        )}
        {sky.horizonY !== null && sky.horizonY >= 0 && sky.horizonY <= H && (
          <line x1={0} y1={sky.horizonY} x2={W} y2={sky.horizonY} stroke="var(--text-mute)" strokeWidth={H * 0.003} strokeDasharray={`${H * 0.02} ${H * 0.02}`} />
        )}
        {overlays && (
          <g>
            {(overlays.constellations?.lines ?? []).map((ln, i) => (
              <polyline key={`c${i}`} points={ln.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none" stroke="#7da7d9" strokeOpacity={0.5} strokeWidth={H * 0.0025} />
            ))}
            {(overlays.ecliptic ?? []).map((ln, i) => (
              <polyline key={`e${i}`} points={ln.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none" stroke="#e8c66a" strokeOpacity={0.75} strokeWidth={H * 0.004}
                strokeDasharray={`${H * 0.02} ${H * 0.012}`} />
            ))}
            {(overlays.constellations?.labels ?? []).map((m, i) => (
              <text key={`cl${i}`} x={m.x} y={m.y} fill="#7da7d9" opacity={0.8} textAnchor="middle"
                fontSize={H * 0.026} fontFamily="monospace">{m.text}</text>
            ))}
            {(overlays.signs ?? []).map((m, i) => (
              <text key={`s${i}`} x={m.x} y={m.y} fill="#9fdc9f" textAnchor="middle"
                fontSize={H * 0.034} fontFamily="monospace">{m.text}</text>
            ))}
            {(overlays.houses ?? []).map((m, i) => (
              <text key={`h${i}`} x={m.x} y={m.y} fill="var(--accent)" textAnchor="middle"
                fontSize={H * 0.03} fontFamily="monospace">{m.text}</text>
            ))}
          </g>
        )}
        {bodies.map((b) => {
          const r = b.id === "sun" || b.id === "moon"
            ? Math.max(b.sizePx / 2, dotR) : b.sizePx > 0 ? Math.max(b.sizePx / 2, dotR * 0.7) : dotR * 0.6;
          return (
            <g key={b.id}>
              <circle cx={b.x} cy={b.y} r={r} fill={colorOf(b.id)} opacity={b.nakedEye ? 0.95 : 0.45} />
              {!b.id.startsWith("star:") && (
                <text x={b.x + r + H * 0.01} y={b.y + H * 0.012} fill="var(--text-dim)" fontSize={H * 0.03} fontFamily="monospace">{b.name}</text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mono small" style={{ margin: "0.4rem 0 0" }}>
        {sky.twilight} twilight · Sun {sky.sunAltitudeDeg}° alt / {sky.sunAzimuthDeg}° az ·
        limiting mag {sky.limitingMag} · Moon {sky.moonIllum !== null ? `${Math.round(sky.moonIllum * 100)}% lit` : "n/a"}
        {sky.moonAltitudeDeg !== null ? ` at ${sky.moonAltitudeDeg}°` : ""} ·
        {" "}{lens.name} {lens.hfovDeg}°×{lens.vfovDeg}° {lens.projection}
        {result.starfield.count > 0 ? ` · ${result.starfield.count} stars${result.starfield.complete ? " (complete field)" : ""}` : ""}
      </p>
      <p className="dim small" style={{ margin: "0.3rem 0 0.8rem" }}>
        Frame aimed {aim.compass} ({aim.azimuthDeg}°) at altitude {aim.altitudeDeg}°. Sizes are to scale within the frame.
      </p>

      {bodies.length > 0 && (
        <table className="mono" style={{ fontSize: "0.8rem" }}>
          <tbody>
            {bodies.map((b) => (
              <tr key={b.id} style={{ opacity: b.nakedEye ? 1 : 0.6 }}>
                <td style={cell}>{b.name}</td>
                <td className="mute" style={cell}>({b.x},{b.y})</td>
                <td className="mute" style={cell}>{b.sizePx > 0 ? `${b.sizePx}px` : "point"}</td>
                <td className="mute" style={cell}>{b.magnitude !== null ? `m${b.magnitude}` : ""}</td>
                <td className="mute" style={cell}>
                  {b.phaseName ? `${b.phaseName}, limb ${b.brightLimbClock}` : b.note ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {bodies.length === 0 && <p className="dim small">No bodies in this frame. Try a wider lens or a different aim.</p>}

      {offFrame.length > 0 && (
        <p className="dim small" style={{ marginTop: "0.5rem" }}>
          Just out of frame: {offFrame.map((o) => `${o.name} (${o.side}, ${o.deltaDeg}°)`).join(", ")}
        </p>
      )}

      <p className="dim small" style={{ marginTop: "0.4rem" }}>
        Milky Way: {milkyWay.note}.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", margin: "0.9rem 0 0.3rem" }}>
        <strong className="small">Image prompt</strong>
        <button type="button" className="mono" style={{ ...control, cursor: "pointer", fontSize: "0.75rem" }} onClick={() => onCopy(prompt)}>
          {copied ? "copied" : "copy"}
        </button>
        <button type="button" className="mono" style={{ ...control, cursor: "pointer", fontSize: "0.75rem" }}
          onClick={() => onCopy(JSON.stringify(result.renderPlan, null, 2))}
          title="A machine-readable hybrid-render contract: a body-free background-plate prompt plus the computed layers to composite locally">
          copy render plan (JSON)
        </button>
      </div>
      <p className="dim small" style={{ margin: "0 0 0.3rem" }}>
        The render plan separates a body-free background plate (for an image model) from the computed
        layers (bodies, stars, Milky Way, overlays) to composite locally, for accurate stills and
        animation.
      </p>
      <pre style={{ fontSize: "0.72rem", maxHeight: "20rem", margin: 0, whiteSpace: "pre-wrap" }}>{prompt}</pre>
    </>
  );
}
