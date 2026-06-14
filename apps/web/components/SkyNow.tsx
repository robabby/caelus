"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Engine, BODIES, fmtLon, mod, julianDay, lunarPhases, astrocartography,
  type BodyId, type Chart, type HouseSystem, type Zodiac,
} from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { ChartWheel, ChartSphere, AstroMap } from "caelus-wheel";
import accuracy from "caelus/accuracy.json";

const MAP_BODIES: BodyId[] = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];

const SYSTEMS: HouseSystem[] = [
  "placidus", "whole_sign", "equal", "porphyry",
  "koch", "regiomontanus", "campanus", "alcabitius",
  "morinus", "meridian", "polich_page", "vehlow",
];
const ZODIACS: Array<[string, Zodiac]> = [
  ["tropical", "tropical"],
  ["sidereal · lahiri", "sidereal:lahiri"],
  ["sidereal · fagan/bradley", "sidereal:fagan_bradley"],
  ["sidereal · krishnamurti", "sidereal:krishnamurti"],
  ["sidereal · raman", "sidereal:raman"],
];
const ACCURACY: Array<[string, string]> = accuracy.summary.map((s) => [s.label, s.bound]);
const PHASE_LABEL: Record<string, string> = {
  new: "New Moon", first_quarter: "First Quarter", full: "Full Moon", last_quarter: "Last Quarter",
};

function houseOf(cusps: number[], lon: number) {
  for (let i = 0; i < 12; i++) {
    if (mod(lon - cusps[i], 360) < mod(cusps[(i + 1) % 12] - cusps[i], 360)) return i + 1;
  }
  return 12;
}

function jdToUtc(jd: number): string {
  return new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 16).replace("T", " ");
}

export default function SkyNow() {
  const engineRef = useRef<Engine | null>(null);
  const [mounted, setMounted] = useState(false);
  const [iso, setIso] = useState("");
  const [lat, setLat] = useState("27.94");
  const [lon, setLon] = useState("-82.46");
  const [sys, setSys] = useState<HouseSystem>("placidus");
  const [zodiac, setZodiac] = useState<Zodiac>("tropical");
  const [tab, setTab] = useState<"positions" | "aspects" | "events" | "json">("positions");
  const [view, setView] = useState<"wheel" | "sphere" | "map">("wheel");

  useEffect(() => {
    setIso(new Date().toISOString().slice(0, 16));
    setMounted(true);
  }, []);

  const engine = () => (engineRef.current ??= new Engine(embeddedData));

  const { chart, ms, error } = useMemo(() => {
    if (!mounted || !iso) return { chart: null, ms: 0, error: null };
    const la = Number(lat);
    const lo = Number(lon);
    const d = new Date(iso + ":00Z");
    if (!Number.isFinite(la) || la < -90 || la > 90) return { chart: null, ms: 0, error: "latitude must be in [-90, 90]" };
    if (!Number.isFinite(lo) || lo < -180 || lo > 180) return { chart: null, ms: 0, error: "longitude must be in [-180, 180], east positive" };
    if (Number.isNaN(d.getTime())) return { chart: null, ms: 0, error: "invalid date" };
    const t0 = performance.now();
    const c = engine().chart(
      d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
      d.getUTCHours(), d.getUTCMinutes(), 0, la, lo,
      { houseSystem: sys, zodiac },
    );
    return { chart: c as Chart, ms: performance.now() - t0, error: null };
  }, [mounted, iso, lat, lon, sys, zodiac]);

  const phases = useMemo(() => {
    if (!chart || !iso) return [];
    const d = new Date(iso + ":00Z");
    const jd0 = julianDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return lunarPhases(engine(), jd0, jd0 + 120).slice(0, 6);
  }, [chart, iso]);

  const mapLines = useMemo(() => {
    if (view !== "map" || !chart || !iso) return null;
    const d = new Date(iso + ":00Z");
    const jd = julianDay(
      d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
      d.getUTCHours(), d.getUTCMinutes(),
    );
    return astrocartography(engine(), jd, MAP_BODIES);
  }, [view, chart, iso]);

  const inp: React.CSSProperties = {
    background: "var(--surface-3)", color: "var(--text)", border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-sm)", padding: "0.35rem 0.55rem", font: "inherit", fontSize: "0.85rem",
  };
  const tabBtn = (t: typeof tab): React.CSSProperties => ({
    ...inp, cursor: "pointer", opacity: tab === t ? 1 : 0.55,
    borderColor: tab === t ? "var(--accent)" : "var(--border-strong)",
    color: tab === t ? "var(--text)" : "var(--text-dim)",
  });
  const viewBtn = (v: typeof view): React.CSSProperties => ({
    ...inp, cursor: "pointer", opacity: view === v ? 1 : 0.55,
    borderColor: view === v ? "var(--accent)" : "var(--border-strong)",
    color: view === v ? "var(--text)" : "var(--text-dim)",
  });
  const cell: React.CSSProperties = { padding: "0.18rem 0.9rem 0.18rem 0" };

  return (
    <div className="card" style={{ padding: "1.2rem" }}>
      {!mounted ? (
        <p className="dim small" style={{ margin: 0 }}>loading playground…</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <label className="small mute" style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              UTC <input style={inp} type="datetime-local" value={iso} onChange={(e) => setIso(e.target.value)} />
            </label>
            <label className="small mute" style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              lat <input style={{ ...inp, width: "5.5rem" }} value={lat} onChange={(e) => setLat(e.target.value)} />
            </label>
            <label className="small mute" style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              lon <input style={{ ...inp, width: "5.5rem" }} value={lon} onChange={(e) => setLon(e.target.value)} />
            </label>
            <select style={inp} value={sys} onChange={(e) => setSys(e.target.value as HouseSystem)} aria-label="house system">
              {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select style={inp} value={zodiac} onChange={(e) => setZodiac(e.target.value as Zodiac)} aria-label="zodiac">
              {ZODIACS.map(([label, value]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          {error && <p style={{ color: "var(--bad)", marginTop: "0.8rem" }}>{error}</p>}

          {chart && (
            <>
              <p className="dim small" style={{ marginTop: "0.8rem" }}>
                {iso}Z · {lat}°, {lon}° (east+) · {chart.houseSystem} · {zodiac}
                {chart.houseSystem !== chart.houseSystemRequested && " · placidus undefined at this latitude, fell back"}
                {" · "}computed client-side in {ms.toFixed(1)} ms
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 460px) 1fr", gap: "1.5rem", alignItems: "start", marginTop: "0.8rem" }}>
                <div style={{ maxWidth: 460 }}>
                  <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.6rem" }}>
                    {(["wheel", "sphere", "map"] as const).map((v) => (
                      <button key={v} type="button" className="mono" style={viewBtn(v)} onClick={() => setView(v)}>
                        {v.charAt(0).toUpperCase() + v.slice(1)}
                      </button>
                    ))}
                  </div>
                  {view === "wheel" && <ChartWheel chart={chart} size={460} />}
                  {view === "sphere" && <ChartSphere chart={chart} size={460} />}
                  {view === "map" && mapLines && <AstroMap lines={mapLines} width={460} height={230} />}
                  {view === "sphere" && (
                    <p className="dim small" style={{ margin: "0.5rem 0 0" }}>
                      Planets at true ecliptic latitude. Solid ring is the ecliptic, dashed the equator.
                    </p>
                  )}
                  {view === "map" && (
                    <p className="dim small" style={{ margin: "0.5rem 0 0" }}>
                      Where each planet is angular across the globe at this instant: MC and IC meridians, ASC and DSC tracks.
                    </p>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.8rem" }}>
                    {(["positions", "aspects", "events", "json"] as const).map((t) => (
                      <button key={t} type="button" className="mono" style={tabBtn(t)} onClick={() => setTab(t)}>
                        {t === "json" ? "JSON" : t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>

                  {tab === "positions" && (
                    <table className="mono" style={{ fontSize: "0.82rem" }}>
                      <tbody>
                        {BODIES.map((b) => (
                          <tr key={b}>
                            <td className="mute" style={cell}>{b}</td>
                            <td style={cell}>{fmtLon(chart.bodies[b].lon)}{chart.bodies[b].retrograde ? " ℞" : ""}</td>
                            <td className="mute" style={cell}>h{houseOf(chart.cusps, chart.bodies[b].lon)}</td>
                          </tr>
                        ))}
                        <tr><td className="mute" style={cell}>ASC</td><td style={cell}>{fmtLon(chart.angles.asc)}</td><td /></tr>
                        <tr><td className="mute" style={cell}>MC</td><td style={cell}>{fmtLon(chart.angles.mc)}</td><td /></tr>
                      </tbody>
                    </table>
                  )}

                  {tab === "aspects" && (
                    <ul className="mono" style={{ lineHeight: 1.8, paddingLeft: "1.1rem", fontSize: "0.82rem", margin: 0 }}>
                      {chart.aspects.map((a, i) => (
                        <li key={i}>{a.a} {a.aspect} {a.b} <span className="mute">(orb {a.orb}°)</span></li>
                      ))}
                    </ul>
                  )}

                  {tab === "events" && (
                    <>
                      <p className="dim small" style={{ marginTop: 0 }}>Lunar phases in the 120 days from this date:</p>
                      <table className="mono" style={{ fontSize: "0.82rem" }}>
                        <tbody>
                          {phases.map(([jd, name], i) => (
                            <tr key={i}>
                              <td className="mute" style={cell}>{PHASE_LABEL[name]}</td>
                              <td style={cell}>{jdToUtc(jd)} UT</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="dim small">Node-tier event search adds rise/set, stations, crossings, and eclipses.</p>
                    </>
                  )}

                  {tab === "json" && (
                    <pre style={{ fontSize: "0.72rem", maxHeight: "26rem", margin: 0 }}>
                      {JSON.stringify(chart, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      <h3 style={{ marginTop: "2rem" }}>
        Accuracy <span className="mute" style={{ fontWeight: 400, fontSize: "0.85rem" }}>(vs reference, 1900–2099)</span>
      </h3>
      <table className="mono" style={{ fontSize: "0.85rem", maxWidth: 420 }}>
        <tbody>{ACCURACY.map(([k, v]) => <tr key={k}><td className="mute" style={cell}>{k}</td><td style={cell}>{v}</td></tr>)}</tbody>
      </table>
      <p className="dim small">Within 1′ chart-display precision. <a href="/validation">Full table →</a></p>
    </div>
  );
}
