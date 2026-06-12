"use client";
import { useState } from "react";
import { BODIES, fmtLon, mod, type Chart } from "caelus";
import { ChartWheel } from "caelus-wheel";

function houseOf(cusps: number[], lon: number) {
  for (let i = 0; i < 12; i++) {
    if (mod(lon - cusps[i], 360) < mod(cusps[(i + 1) % 12] - cusps[i], 360)) return i + 1;
  }
  return 12;
}

export default function ChartView({ chart, hideHouses = false }: { chart: Chart; hideHouses?: boolean }) {
  const [reading, setReading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const getReading = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/reading", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chart }),
      });
      const data = await res.json();
      setReading(res.ok ? data.reading : data.error);
    } catch {
      setReading("Reading unavailable.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ maxWidth: 480, margin: "1rem 0" }}>
        <ChartWheel chart={chart} size={480} />
      </div>

      <h2>positions</h2>
      <table style={{ borderSpacing: "0.8rem 0.15rem" }}>
        <tbody>
          {BODIES.map((b) => (
            <tr key={b}>
              <td style={{ opacity: 0.6 }}>{b}</td>
              <td>{fmtLon(chart.bodies[b].lon)}{chart.bodies[b].retrograde ? " ℞" : ""}</td>
              {!hideHouses && (
                <td style={{ opacity: 0.6 }}>house {houseOf(chart.cusps, chart.bodies[b].lon)}</td>
              )}
            </tr>
          ))}
          {!hideHouses && (
            <>
              <tr><td style={{ opacity: 0.6 }}>ASC</td><td>{fmtLon(chart.angles.asc)}</td><td /></tr>
              <tr><td style={{ opacity: 0.6 }}>MC</td><td>{fmtLon(chart.angles.mc)}</td><td /></tr>
            </>
          )}
        </tbody>
      </table>

      <h2>aspects</h2>
      <ul style={{ lineHeight: 1.7, paddingLeft: "1.2rem" }}>
        {chart.aspects.map((a, i) => (
          <li key={i}>{a.a} {a.aspect} {a.b} <span style={{ opacity: 0.5 }}>(orb {a.orb}°)</span></li>
        ))}
      </ul>

      <h2>reading <span style={{ opacity: 0.5, fontSize: "0.7em" }}>(optional, needs an API key)</span></h2>
      {reading
        ? <p style={{ whiteSpace: "pre-wrap", maxWidth: "42rem" }}>{reading}</p>
        : <button onClick={getReading} disabled={busy} style={{
            background: "#1a1626", color: "#e8e4f0", border: "1px solid #8a7fd4",
            borderRadius: 4, padding: "0.4rem 0.8rem", cursor: "pointer", font: "inherit",
          }}>{busy ? "thinking…" : "generate reading"}</button>}
    </div>
  );
}
