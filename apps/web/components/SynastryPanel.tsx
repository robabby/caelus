"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Engine, fmtLon, BODIES, compositeLongitudes,
  type BodyId, type Chart,
} from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { toUT } from "caelus-birth";
import { GLYPHS } from "caelus-wheel";
import fixedStars from "../lib/fixed-stars.json";
import CityPicker, { type City } from "./CityPicker";
import BiWheel, { type SynContact } from "./BiWheel";
import { ASPECT_GLYPH, aspectColor, crossAspect, ASPECTABLE_ORDER as GRID } from "../lib/chart-display";

const ReadingTab = dynamic(() => import("./ReadingTab"), {
  ssr: false,
  loading: () => <p className="dim small" style={{ marginTop: 0 }}>reading the charts…</p>,
});

const engine = new Engine({ ...embeddedData, fixedStars } as never);

// Both births live in the URL fragment (#s2=), never sent to a server.
function b64urlEncode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(raw: string): unknown {
  const bytes = Uint8Array.from(atob(raw.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

type Person = { iso: string; lat: string; lon: string; place: string; name: string };
const DEFAULTS: [Person, Person] = [
  { iso: "1990-06-10T14:30", lat: "27.95", lon: "-82.46", place: "Tampa, US", name: "A" },
  { iso: "1988-03-21T06:00", lat: "40.71", lon: "-74.01", place: "New York, US", name: "B" },
];

function personChart(p: Person): { chart: Chart; jd: number; zone: string } | null {
  const d = new Date(p.iso + ":00Z");
  const la = Number(p.lat);
  const lo = Number(p.lon);
  if (!Number.isFinite(la) || la < -90 || la > 90) return null;
  if (!Number.isFinite(lo) || lo < -180 || lo > 180) return null;
  if (Number.isNaN(d.getTime())) return null;
  try {
    const t = toUT({
      year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
      hour: d.getUTCHours(), minute: d.getUTCMinutes(), lat: la, lon: lo,
    });
    const chart = engine.chart(t.utc.year, t.utc.month, t.utc.day, t.utc.hour, t.utc.minute, 0, la, lo, "placidus");
    return { chart, jd: t.jdUt, zone: t.zone };
  } catch {
    return null;
  }
}

const inp: React.CSSProperties = {
  background: "var(--surface-3)", color: "var(--text)", border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-sm)", padding: "0.35rem 0.55rem", font: "inherit", fontSize: "0.85rem",
};
const cell: React.CSSProperties = { padding: "0.15rem 0.7rem 0.15rem 0" };

function PersonInputs({ p, onChange }: { p: Person; onChange: (p: Person) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
      <input
        style={{ ...inp, width: "4rem" }}
        value={p.name}
        onChange={(e) => onChange({ ...p, name: e.target.value })}
        aria-label="name"
      />
      <CityPicker
        width="11rem"
        onSelect={(c: City) => onChange({ ...p, lat: String(c.lat), lon: String(c.lon), place: `${c.name}, ${c.country}` })}
      />
      <input
        style={inp}
        type="datetime-local"
        value={p.iso}
        onChange={(e) => onChange({ ...p, iso: e.target.value })}
        aria-label="local birth time"
      />
    </div>
  );
}

export default function SynastryPanel() {
  const [people, setPeople] = useState<[Person, Person]>(DEFAULTS);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("s2");
      if (!raw) return;
      const d = b64urlDecode(raw) as { a?: Person; b?: Person };
      if (d?.a && d?.b) setPeople([{ ...DEFAULTS[0], ...d.a }, { ...DEFAULTS[1], ...d.b }]);
    } catch {
      /* ignore a malformed link */
    }
  }, []);

  function share() {
    const url = `${window.location.origin}${window.location.pathname}#s2=${b64urlEncode({ v: 1, a: people[0], b: people[1] })}`;
    window.history.replaceState(null, "", url);
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard blocked: the address bar still holds it */ });
  }

  const a = useMemo(() => personChart(people[0]), [people]);
  const b = useMemo(() => personChart(people[1]), [people]);
  const composite = useMemo(
    () => (a && b ? compositeLongitudes(engine, a.jd, b.jd, [...BODIES] as BodyId[]) : null),
    [a, b],
  );

  const readingInputs = useMemo(() => {
    if (!a) return null;
    try {
      return {
        stars: engine.starConjunctions(a.chart, { orb: 1 }),
        lots: engine.lots(a.chart),
      };
    } catch {
      return { stars: [], lots: [] };
    }
  }, [a]);

  const set = (i: 0 | 1) => (next: Person) =>
    setPeople((prev) => (i === 0 ? [next, prev[1]] : [prev[0], next]));

  const aPlanets = a ? GRID.filter((g) => a.chart.bodies[g]) : [];
  const bPlanets = b ? GRID.filter((g) => b.chart.bodies[g]) : [];
  const contacts: SynContact[] = [];
  if (a && b) {
    for (const ap of aPlanets) for (const bp of bPlanets) {
      const asp = crossAspect(a.chart.bodies[ap]!.lon, b.chart.bodies[bp]!.lon);
      if (asp) contacts.push({ aBody: ap, bBody: bp, aspect: asp.aspect, orb: asp.orb });
    }
  }

  return (
    <div className="card" style={{ padding: "1.2rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
        <div>
          <div className="dim small" style={{ marginBottom: "0.35rem" }}>Person A · local birth time</div>
          <PersonInputs p={people[0]} onChange={set(0)} />
        </div>
        <div>
          <div className="dim small" style={{ marginBottom: "0.35rem" }}>Person B · local birth time</div>
          <PersonInputs p={people[1]} onChange={set(1)} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button
            type="button"
            className="mono"
            style={{ ...inp, cursor: "pointer", borderColor: "var(--accent)", color: "var(--text)" }}
            onClick={share}
          >
            {copied ? "Link copied ✓" : "Copy share link"}
          </button>
        </div>
      </div>

      {!a || !b ? (
        <p className="dim small" style={{ marginTop: "1rem" }}>Enter two valid births to compare.</p>
      ) : (
        <>
          <p className="dim small" style={{ margin: "0.8rem 0 0" }}>
            {people[0].name || "A"} ({a.zone}) and {people[1].name || "B"} ({b.zone}), computed client-side.
          </p>

          {readingInputs && (
            <>
              <h3 style={{ marginTop: "1.2rem", marginBottom: "0.3rem" }}>Reading</h3>
              <p className="dim small" style={{ margin: "0 0 0.6rem" }}>
                {people[0].name || "A"}&rsquo;s chart as the base; synastry and composite facts are citable atoms.
              </p>
              <ReadingTab
                chart={a.chart}
                engine={engine}
                lat={Number(people[0].lat)}
                lonEast={Number(people[0].lon)}
                zodiac="tropical"
                stars={readingInputs.stars}
                lots={readingInputs.lots}
                partner={{ chart: b.chart, label: people[0].name || "A" }}
              />
            </>
          )}

          <figure className="chart-fluid" style={{ margin: "1rem 0 0", textAlign: "center" }}>
            <BiWheel
              inner={a.chart}
              outer={b.chart}
              contacts={contacts}
              size={420}
              innerLabel={people[0].name || "A"}
              outerLabel={people[1].name || "B"}
            />
            <figcaption className="dim small" style={{ marginTop: "0.3rem" }}>
              {people[0].name || "A"} inner · {people[1].name || "B"} outer · the inter-chart aspect web
            </figcaption>
          </figure>

          {/* Synastry cross-aspect grid: A's planets (rows) to B's planets (columns) */}
          <h3 style={{ marginTop: "1.6rem", marginBottom: "0.3rem" }}>Synastry</h3>
          <p className="dim small" style={{ margin: "0 0 0.6rem" }}>
            Inter-chart aspects: a row is {people[0].name || "A"}&rsquo;s planet, a column is {people[1].name || "B"}&rsquo;s.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="mono" style={{ borderCollapse: "collapse", fontSize: "0.95rem" }}>
              <thead>
                <tr>
                  <td style={{ ...cell, color: "var(--text-mute)" }} />
                  {bPlanets.map((bp) => (
                    <th key={bp} style={{ width: "1.5rem", textAlign: "center", color: "var(--text-mute)", fontWeight: 400 }}>
                      {GLYPHS[bp] ?? bp.slice(0, 2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aPlanets.map((ap) => (
                  <tr key={ap}>
                    <th style={{ ...cell, textAlign: "left", color: "var(--text-mute)", fontWeight: 400 }}>
                      {GLYPHS[ap] ?? ap.slice(0, 2)}
                    </th>
                    {bPlanets.map((bp) => {
                      const asp = crossAspect(a.chart.bodies[ap]!.lon, b.chart.bodies[bp]!.lon);
                      return (
                        <td
                          key={bp}
                          title={asp ? `${ap} ${asp.aspect} ${bp} · orb ${asp.orb}°` : `${ap} / ${bp}`}
                          style={{
                            width: "1.5rem", height: "1.5rem", textAlign: "center",
                            border: "1px solid var(--border)", color: aspectColor(asp?.aspect),
                          }}
                        >
                          {asp ? ASPECT_GLYPH[asp.aspect] ?? "" : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Composite (midpoint) chart positions */}
          {composite && (
            <>
              <h3 style={{ marginTop: "1.6rem", marginBottom: "0.3rem" }}>Composite</h3>
              <p className="dim small" style={{ margin: "0 0 0.6rem" }}>
                The midpoint chart: each body at the circular midpoint of the two.
              </p>
              <table className="mono" style={{ fontSize: "0.82rem" }}>
                <tbody>
                  {GRID.filter((g) => composite[g] !== undefined).map((g) => (
                    <tr key={g}>
                      <td className="mute" style={cell}>{GLYPHS[g] ? `${GLYPHS[g]} ` : ""}{g}</td>
                      <td style={cell}>{fmtLon(composite[g])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}
