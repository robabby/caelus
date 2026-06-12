"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Engine, BODIES, fmtLon, mod, type Chart, type HouseSystem } from "caelus";
import { embeddedData } from "caelus/data-embedded";

const SYSTEMS: HouseSystem[] = ["placidus", "whole_sign", "equal", "porphyry"];
const ACCURACY: Array<[string, string]> = [
  ["Sun–Saturn", "≤ 1″"], ["Uranus / Neptune", "≤ 2″ / ≤ 5″"],
  ["Moon (1920–2080 tier)", "≤ 2.5″"], ["Moon (series, embedded)", "≤ 10″"],
  ["Pluto / Chiron", "≤ 2.5″ / ≤ 1″"], ["Angles & Placidus cusps", "≤ 3.2″"],
  ["True node", "≤ 1″"],
];

function houseOf(cusps: number[], lon: number) {
  for (let i = 0; i < 12; i++) {
    if (mod(lon - cusps[i], 360) < mod(cusps[(i + 1) % 12] - cusps[i], 360)) return i + 1;
  }
  return 12;
}

export default function SkyNow() {
  const engineRef = useRef<Engine | null>(null);
  const [mounted, setMounted] = useState(false);
  const [iso, setIso] = useState("2000-01-01T12:00");
  const [lat, setLat] = useState("27.94");
  const [lon, setLon] = useState("-82.46");
  const [sys, setSys] = useState<HouseSystem>("placidus");
  const [tab, setTab] = useState<"positions" | "aspects" | "json">("positions");

  useEffect(() => {
    setIso(new Date().toISOString().slice(0, 16));
    setMounted(true);
  }, []);

  const { chart, ms, error } = useMemo(() => {
    const la = Number(lat);
    const lo = Number(lon);
    const d = new Date(iso + ":00Z");
    if (!Number.isFinite(la) || la < -90 || la > 90) return { chart: null, ms: 0, error: "latitude must be in [-90, 90]" };
    if (!Number.isFinite(lo) || lo < -180 || lo > 180) return { chart: null, ms: 0, error: "longitude must be in [-180, 180], east positive" };
    if (Number.isNaN(d.getTime())) return { chart: null, ms: 0, error: "invalid date" };
    if (!engineRef.current) engineRef.current = new Engine(embeddedData);
    const t0 = performance.now();
    const c = engineRef.current.chart(
      d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
      d.getUTCHours(), d.getUTCMinutes(), 0, la, lo, sys,
    );
    return { chart: c as Chart, ms: performance.now() - t0, error: null };
  }, [iso, lat, lon, sys]);

  const inp = { background: "#1a1626", color: "#e8e4f0", border: "1px solid #3a3450", borderRadius: 4, padding: "0.3rem 0.5rem", fontFamily: "inherit" };
  const tabBtn = (t: typeof tab) => ({
    ...inp, cursor: "pointer", opacity: tab === t ? 1 : 0.5,
    borderColor: tab === t ? "#8a7fd4" : "#3a3450",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
        <label>UTC <input style={inp} type="datetime-local" value={iso} onChange={(e) => setIso(e.target.value)} /></label>
        <label>lat <input style={{ ...inp, width: "5.5rem" }} value={lat} onChange={(e) => setLat(e.target.value)} /></label>
        <label>lon <input style={{ ...inp, width: "5.5rem" }} value={lon} onChange={(e) => setLon(e.target.value)} /></label>
        <select style={inp} value={sys} onChange={(e) => setSys(e.target.value as HouseSystem)}>
          {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {error && <p style={{ color: "#e08a8a" }}>{error}</p>}
      {!mounted && <p style={{ opacity: 0.55, fontSize: "0.85em" }}>computing…</p>}
      {mounted && chart && (
        <>
          <p style={{ opacity: 0.55, fontSize: "0.85em" }}>
            {iso}Z · {lat}°, {lon}° (east+) · {chart.houseSystem}
            {chart.houseSystem !== chart.houseSystemRequested && " (placidus undefined at this latitude)"}
            {" "}· computed client-side in {ms.toFixed(1)} ms
          </p>
          <div style={{ display: "flex", gap: "0.5rem", margin: "0.5rem 0" }}>
            {(["positions", "aspects", "json"] as const).map((t) => (
              <button key={t} type="button" style={tabBtn(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          {tab === "positions" && (
            <table style={{ borderSpacing: "0.8rem 0.15rem" }}>
              <tbody>
                {BODIES.map((b) => (
                  <tr key={b}>
                    <td style={{ opacity: 0.6 }}>{b}</td>
                    <td>{fmtLon(chart.bodies[b].lon)}{chart.bodies[b].retrograde ? " ℞" : ""}</td>
                    <td style={{ opacity: 0.6 }}>house {houseOf(chart.cusps, chart.bodies[b].lon)}</td>
                  </tr>
                ))}
                <tr><td style={{ opacity: 0.6 }}>ASC</td><td>{fmtLon(chart.angles.asc)}</td><td /></tr>
                <tr><td style={{ opacity: 0.6 }}>MC</td><td>{fmtLon(chart.angles.mc)}</td><td /></tr>
              </tbody>
            </table>
          )}
          {tab === "aspects" && (
            <ul style={{ lineHeight: 1.7, paddingLeft: "1.2rem" }}>
              {chart.aspects.map((a, i) => <li key={i}>{a.a} {a.aspect} {a.b} <span style={{ opacity: 0.5 }}>(orb {a.orb}°)</span></li>)}
            </ul>
          )}
          {tab === "json" && (
            <pre style={{ background: "#13101e", padding: "1rem", borderRadius: 6, overflow: "auto", fontSize: "0.75em", maxHeight: "24rem" }}>
              {JSON.stringify(chart, null, 2)}
            </pre>
          )}
        </>
      )}
      <h3 style={{ marginTop: "2.5rem", opacity: 0.8 }}>accuracy <span style={{ opacity: 0.5, fontWeight: "normal" }}>(vs Swiss Ephemeris, 1900–2099)</span></h3>
      <table style={{ borderSpacing: "0.8rem 0.1rem", fontSize: "0.9em" }}>
        <tbody>{ACCURACY.map(([k, v]) => <tr key={k}><td style={{ opacity: 0.6 }}>{k}</td><td>{v}</td></tr>)}</tbody>
      </table>
      <p style={{ opacity: 0.5, fontSize: "0.8em" }}>Within 1′ chart-display precision. <a href="/validation" style={{ color: "#8a7fd4" }}>Full table →</a></p>
    </div>
  );
}
