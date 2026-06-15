"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Engine, BODIES, fmtLon, mod, julianDay, lunarPhases, astrocartography,
  detectPatterns, chartSignature, dignityScore, lots, HERMETIC_LOTS,
  nakshatra, vimshottariActive, profectionAt, varga,
  declinationAspects, outOfBounds,
  type BodyId, type Chart, type HouseSystem, type Zodiac,
} from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { toUT, type UTResult } from "caelus-birth";
import { ChartWheel, ChartSphere, AstroMap, GLYPHS } from "caelus-wheel";
import accuracy from "caelus/accuracy.json";
import CityPicker, { type City } from "./CityPicker";
import BiWheel, { type SynContact } from "./BiWheel";
import { WHEEL_THEME, WHEEL_LINE_COLORS } from "../lib/wheelTheme";
import fixedStars from "../lib/fixed-stars.json";
import {
  ASPECT_GLYPH, aspectColor, crossAspect, ASPECTABLE_ORDER, PATTERN_LABEL,
} from "../lib/chart-display";

// Bright catalog stars (mag <= 2.5) for meaningful conjunctions.
const BRIGHT_STARS = Object.entries((fixedStars as { stars: Record<string, { mag: number }> }).stars)
  .filter(([, s]) => s.mag <= 2.5).map(([name]) => name);

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");
const fmtIso = (y: number, mo: number, d: number, h: number, mi: number) =>
  `${pad(y, 4)}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;

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

// ---- Insights tab (Phase 4 symbolic layer) ----
const CLASSICAL = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"] as const;
const ELEMENTS = ["fire", "earth", "air", "water"] as const;
const MODALITIES = ["cardinal", "fixed", "mutable"] as const;

type DigScore = ReturnType<typeof dignityScore>;
function dignityLabel(d: DigScore): string {
  if (d.rulership) return "domicile";
  if (d.exaltation) return "exalted";
  if (d.detriment) return "detriment";
  if (d.fall) return "fall";
  if (d.peregrine) return "peregrine";
  const minor = [
    d.triplicity && "triplicity", d.term && "term", d.face && "face",
  ].filter(Boolean);
  return minor.length ? minor.join(", ") : "—";
}

function houseOf(cusps: number[], lon: number) {
  for (let i = 0; i < 12; i++) {
    if (mod(lon - cusps[i], 360) < mod(cusps[(i + 1) % 12] - cusps[i], 360)) return i + 1;
  }
  return 12;
}

function jdToUtc(jd: number): string {
  return new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 16).replace("T", " ");
}

/**
 * A shareable chart is just the inputs the user typed, encoded into the URL.
 * Nothing is computed, transmitted, or stored server-side: whoever opens the
 * link recomputes the chart locally from these numbers. Keys are short to keep
 * the link compact; `n` is an optional, user-chosen nickname (not PII unless
 * the minter puts it there). `t` is the UT instant, so a link is tz-unambiguous.
 */
type Share = { v: 1; t: string; la: string; lo: string; h: HouseSystem; z: Zodiac; n?: string };

/** base64url of any JSON value, so it is URL- and fragment-safe. */
function b64urlEncode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(raw: string): unknown {
  const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

const isShare = (v: unknown): v is Share =>
  !!v && typeof v === "object" && typeof (v as Share).t === "string";

function decShare(raw: string): Share | null {
  try {
    const s = b64urlDecode(raw);
    return isShare(s) ? s : null;
  } catch {
    return null;
  }
}

/** A set of charts ("my charts"), shared as one link. */
function decSet(raw: string): Share[] | null {
  try {
    const s = b64urlDecode(raw) as { c?: unknown };
    return s && Array.isArray(s.c) ? (s.c.filter(isShare) as Share[]) : null;
  } catch {
    return null;
  }
}

/**
 * Read the encoded chart(s) from the URL. We prefer the fragment (`#...`):
 * browsers never transmit the fragment to the server, so the inputs stay out of
 * request lines, access logs, and any infra in between. `#s=` is a set, `#c=` a
 * single chart; the query string (`?c=`) is read only as back-compat.
 */
function readUrlState(): { set: Share[] | null; single: Share | null } {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const setRaw = hash.get("s");
  const singleRaw = hash.get("c") ?? new URLSearchParams(window.location.search).get("c");
  return {
    set: setRaw ? decSet(setRaw) : null,
    single: singleRaw ? decShare(singleRaw) : null,
  };
}

export default function SkyNow() {
  const engineRef = useRef<Engine | null>(null);
  const [mounted, setMounted] = useState(false);
  const [iso, setIso] = useState("");
  const [lat, setLat] = useState("27.94");
  const [lon, setLon] = useState("-82.46");
  const [sys, setSys] = useState<HouseSystem>("placidus");
  const [zodiac, setZodiac] = useState<Zodiac>("tropical");
  const [tzMode, setTzMode] = useState<"utc" | "local">("utc");
  const [place, setPlace] = useState("");
  const [label, setLabel] = useState("");
  const [tab, setTab] = useState<"positions" | "aspects" | "insights" | "vedic" | "declination" | "stars" | "events" | "json">("positions");
  const [view, setView] = useState<"wheel" | "sphere" | "map" | "transits">("wheel");
  const [focus, setFocus] = useState<{ key: string; bodies: string[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [fromLink, setFromLink] = useState(false);
  const [set, setSet] = useState<Share[]>([]);
  const [collectionCopied, setCollectionCopied] = useState(false);

  // Load an encoded chart into the builder. `t` is a UT instant, so we read it
  // back in UTC mode; the nickname rides along.
  const loadShare = useCallback((s: Share) => {
    setIso(s.t);
    setLat(s.la);
    setLon(s.lo);
    if (s.h) setSys(s.h);
    if (s.z) setZodiac(s.z);
    setLabel(s.n ?? "");
    setPlace("");
    setTzMode("utc");
  }, []);

  useEffect(() => {
    // A link restores an exact chart or a whole set; otherwise seed from now.
    const { set: urlSet, single } = readUrlState();
    if (urlSet && urlSet.length) {
      setSet(urlSet);
      loadShare(urlSet[0]);
      setFromLink(true);
    } else if (single) {
      loadShare(single);
      setFromLink(true);
    } else {
      setIso(new Date().toISOString().slice(0, 16));
    }
    setMounted(true);
  }, [loadShare]);

  // Embedded data plus the fixed-star catalog, so star conjunctions work in-browser.
  const engine = () => (engineRef.current ??= new Engine({ ...embeddedData, fixedStars } as never));

  const { chart, ms, error, utIso, zone, tzStatus } = useMemo(() => {
    const none = { chart: null, ms: 0, error: null, utIso: iso, zone: "", tzStatus: "" as UTResult["status"] | "" };
    if (!mounted || !iso) return none;
    const la = Number(lat);
    const lo = Number(lon);
    const d = new Date(iso + ":00Z");
    if (!Number.isFinite(la) || la < -90 || la > 90) return { ...none, error: "latitude must be in [-90, 90]" };
    if (!Number.isFinite(lo) || lo < -180 || lo > 180) return { ...none, error: "longitude must be in [-180, 180], east positive" };
    if (Number.isNaN(d.getTime())) return { ...none, error: "invalid date" };

    // The typed wall-clock fields (Z-appended above so getUTC* echoes them).
    let y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, day = d.getUTCDate();
    let hh = d.getUTCHours(), mm = d.getUTCMinutes();
    let resolvedZone = "";
    let status: UTResult["status"] | "" = "";

    // In "local" mode the typed time is local to the place; convert to UT via
    // caelus-birth (offline tz-lookup + historical DST), then feed the engine.
    if (tzMode === "local") {
      try {
        const t = toUT({ year: y, month: mo, day, hour: hh, minute: mm, lat: la, lon: lo });
        ({ year: y, month: mo, day, hour: hh, minute: mm } = t.utc);
        resolvedZone = t.zone;
        status = t.status;
      } catch {
        return { ...none, error: "could not resolve a time zone for this place" };
      }
    }

    // The engine throws (RangeError) for dates outside its fitted range — Chiron
    // is Chebyshev-only over ~1850–2150. A datetime-local input emits transient
    // years (e.g. 0001) mid-edit, so catch the throw and surface it inline rather
    // than letting it crash the render tree.
    const t0 = performance.now();
    try {
      const c = engine().chart(y, mo, day, hh, mm, 0, la, lo, { houseSystem: sys, zodiac });
      return {
        chart: c as Chart,
        ms: performance.now() - t0,
        error: null,
        utIso: fmtIso(y, mo, day, hh, mm),
        zone: resolvedZone,
        tzStatus: status,
      };
    } catch {
      return { ...none, error: "could not compute a chart for this instant" };
    }
  }, [mounted, iso, lat, lon, sys, zodiac, tzMode]);

  function share() {
    // Share the resolved UT instant, so a link is tz-unambiguous: the recipient
    // recomputes the exact chart regardless of their own zone.
    const payload: Share = { v: 1, t: utIso, la: lat, lo: lon, h: sys, z: zodiac };
    if (label.trim()) payload.n = label.trim();
    // Put the chart in the fragment, not the query: the fragment is never sent
    // to the server, so the inputs never leave the visitor's browser at all.
    const url = `${window.location.origin}${window.location.pathname}#c=${b64urlEncode(payload)}`;
    // Reflect the chart in the address bar so a plain copy of the URL also works.
    window.history.replaceState(null, "", url);
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard blocked (e.g. insecure context): the address bar still holds it */
      });
  }

  // "My charts": a session collection, shared as one link. The set lives only in
  // React state and the URL fragment — never localStorage — so nothing persists.
  function addToSet() {
    if (!chart) return;
    const n = label.trim() || place || `Chart ${set.length + 1}`;
    setSet((prev) => [...prev, { v: 1, t: utIso, la: lat, lo: lon, h: sys, z: zodiac, n }]);
  }

  function removeFromSet(i: number) {
    setSet((prev) => prev.filter((_, j) => j !== i));
  }

  function shareSet() {
    if (!set.length) return;
    const url = `${window.location.origin}${window.location.pathname}#s=${b64urlEncode({ v: 1, c: set })}`;
    window.history.replaceState(null, "", url);
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCollectionCopied(true);
        setTimeout(() => setCollectionCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard blocked: the address bar still holds it */
      });
  }

  const phases = useMemo(() => {
    if (!chart) return [];
    try {
      const d = new Date(utIso + ":00Z");
      const jd0 = julianDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      return lunarPhases(engine(), jd0, jd0 + 120).slice(0, 6);
    } catch {
      return [];
    }
  }, [chart, utIso]);

  const mapLines = useMemo(() => {
    if (view !== "map" || !chart) return null;
    try {
      const d = new Date(utIso + ":00Z");
      const jd = julianDay(
        d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
        d.getUTCHours(), d.getUTCMinutes(),
      );
      return astrocartography(engine(), jd, MAP_BODIES);
    } catch {
      return null;
    }
  }, [view, chart, utIso]);

  // The Phase 4 symbolic layer: configurations, structural signature, and the
  // traditional dignity score per classical planet (sect from the Sun's house).
  const insights = useMemo(() => {
    if (!chart) return null;
    const sun = chart.bodies.sun;
    const sect: "day" | "night" = sun && sun.house >= 7 ? "day" : "night";
    const dignities = CLASSICAL.flatMap((p) => {
      const b = chart.bodies[p];
      return b ? [dignityScore(p, b.lon, sect)] : [];
    });
    const now = new Date();
    const nowJd = julianDay(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes());
    return {
      patterns: detectPatterns(chart),
      signature: chartSignature(chart),
      dignities,
      lots: lots(engine(), chart.jdUt, Number(lat), Number(lon), zodiac),
      profection: profectionAt(engine(), chart.jdUt, nowJd, Number(lat), Number(lon), zodiac),
      sect,
    };
  }, [chart]);

  // The Vedic (sidereal) layer: each body's nakshatra, and the Vimshottari dasha
  // active today, reading the chart as a natal moment.
  const vedic = useMemo(() => {
    if (!chart) return null;
    const sid = (b: string) => engine().longitude(b as BodyId, chart.jdUt, { zodiac: "sidereal:lahiri" });
    const bodies = BODIES.flatMap((b) => {
      if (!chart.bodies[b]) return [];
      const l = sid(b);
      return [{ body: b, nak: nakshatra(l), d9: varga(l, 9).sign, d10: varga(l, 10).sign }];
    });
    const now = new Date();
    const nowJd = julianDay(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes());
    return { bodies, dasha: vimshottariActive(sid("moon"), chart.jdUt, nowJd) };
  }, [chart]);

  // Transits: the chart as natal (inner), the current sky (outer), with the
  // cross-aspect web between them.
  const transit = useMemo(() => {
    if (!chart) return null;
    const n = new Date();
    const tjd = julianDay(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate(), n.getUTCHours(), n.getUTCMinutes());
    const tchart = engine().chartAt(tjd, Number(lat), Number(lon), { houseSystem: sys, zodiac });
    const contacts: SynContact[] = [];
    for (const nb of BODIES) {
      const np = chart.bodies[nb];
      if (!np) continue;
      for (const tb of BODIES) {
        const tp = tchart.bodies[tb];
        if (!tp) continue;
        const asp = crossAspect(np.lon, tp.lon);
        if (asp) contacts.push({ aBody: nb, bBody: tb, aspect: asp.aspect, orb: asp.orb });
      }
    }
    return { chart: tchart, contacts };
  }, [chart]);

  // Declinations: each body's declination, out-of-bounds flag, and the
  // parallels / contraparallels among them.
  const decl = useMemo(() => {
    if (!chart) return null;
    const bodies = BODIES.flatMap((b) => {
      const p = chart.bodies[b];
      return p ? [{ body: b, dec: p.dec, oob: outOfBounds(engine(), b as BodyId, chart.jdUt) }] : [];
    });
    const present = BODIES.filter((b) => chart.bodies[b]) as BodyId[];
    return { bodies, pairs: declinationAspects(engine(), present, chart.jdUt) };
  }, [chart]);

  // Fixed-star conjunctions: bright catalog stars within 1° of a body.
  const stars = useMemo(() => {
    if (!chart) return null;
    const starLons = BRIGHT_STARS.map((name) => ({ name, lon: engine().fixedStar(name, chart.jdUt).lon }));
    const hits: Array<{ body: string; star: string; orb: number }> = [];
    for (const b of BODIES) {
      const p = chart.bodies[b];
      if (!p) continue;
      for (const s of starLons) {
        const sep = Math.abs(mod(p.lon - s.lon + 180, 360) - 180);
        if (sep <= 1.0) hits.push({ body: b, star: s.name, orb: Math.round(sep * 100) / 100 });
      }
    }
    return hits.sort((x, y) => x.orb - y.orb);
  }, [chart]);

  // A new chart clears any isolated selection on the wheel.
  useEffect(() => { setFocus(null); }, [chart]);
  const focusBodies = focus?.bodies;
  // A planet plus everything it aspects, for the "isolate this planet" view.
  const withAspectsOf = (b: string): string[] => {
    const set = new Set<string>([b]);
    if (chart) for (const a of chart.aspects) {
      if (a.a === b) set.add(a.b);
      if (a.b === b) set.add(a.a);
    }
    return [...set];
  };
  const toggleFocus = (key: string, bodies: string[]) => {
    setFocus((f) => (f?.key === key ? null : { key, bodies }));
    setView("wheel");
  };

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
  const nowrapCell: React.CSSProperties = { ...cell, whiteSpace: "nowrap" };

  return (
    <div className="card" style={{ padding: "1.2rem" }}>
      {!mounted ? (
        <p className="dim small" style={{ margin: 0 }}>loading playground…</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <CityPicker
              onSelect={(c: City) => {
                setLat(String(c.lat));
                setLon(String(c.lon));
                setPlace(`${c.name}, ${c.country}`);
                setTzMode("local"); // picking a place means the typed time is local there
              }}
            />
            <label className="small mute" style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              <select
                style={inp}
                value={tzMode}
                onChange={(e) => setTzMode(e.target.value as "utc" | "local")}
                aria-label="how to read the time"
              >
                <option value="utc">UTC</option>
                <option value="local">local</option>
              </select>
              <input
                style={inp}
                type="datetime-local"
                value={iso}
                onChange={(e) => setIso(e.target.value)}
                aria-label={tzMode === "local" ? "local birth time" : "time in UTC"}
              />
            </label>
            <label className="small mute" style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              lat <input style={{ ...inp, width: "5.5rem" }} value={lat} onChange={(e) => { setLat(e.target.value); setPlace(""); }} />
            </label>
            <label className="small mute" style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              lon <input style={{ ...inp, width: "5.5rem" }} value={lon} onChange={(e) => { setLon(e.target.value); setPlace(""); }} />
            </label>
            <select style={inp} value={sys} onChange={(e) => setSys(e.target.value as HouseSystem)} aria-label="house system">
              {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select style={inp} value={zodiac} onChange={(e) => setZodiac(e.target.value as Zodiac)} aria-label="zodiac">
              {ZODIACS.map(([zlabel, value]) => <option key={value} value={value}>{zlabel}</option>)}
            </select>
            <label className="small mute" style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              name
              <input
                style={{ ...inp, width: "8rem" }}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="optional nickname"
                aria-label="chart nickname"
              />
            </label>
            <button
              type="button"
              className="mono"
              style={{ ...inp, cursor: "pointer", borderColor: "var(--accent)", color: "var(--text)" }}
              onClick={share}
            >
              {copied ? "Link copied ✓" : "Copy share link"}
            </button>
            <button
              type="button"
              className="mono"
              style={{ ...inp, cursor: "pointer" }}
              onClick={addToSet}
              disabled={!chart}
              title="Add this chart to a labelled set you can share as one link"
            >
              + Add to my charts
            </button>
          </div>

          <p className="dim small" style={{ margin: "0.55rem 0 0" }}>
            The share link encodes only the values above: date, place, and any
            nickname you type. It lives in the URL fragment (after the
            <code style={{ margin: "0 0.2rem" }}>#</code>), which browsers never
            send over the network, so the chart is recomputed in the
            recipient&rsquo;s browser and the inputs never reach a server at all.
          </p>

          {set.length > 0 && (
            <div className="chart-tray" aria-label="My charts">
              <span className="mute small" style={{ alignSelf: "center" }}>My charts:</span>
              {set.map((s, i) => (
                <span key={i} className="chart-chip">
                  <button
                    type="button"
                    className="chart-chip__load"
                    onClick={() => loadShare(s)}
                    title="Load this chart"
                  >
                    {s.n || `Chart ${i + 1}`}
                  </button>
                  <button
                    type="button"
                    className="chart-chip__remove"
                    onClick={() => removeFromSet(i)}
                    aria-label={`Remove ${s.n || `chart ${i + 1}`}`}
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="mono"
                style={{ ...inp, cursor: "pointer", borderColor: "var(--accent)", color: "var(--text)" }}
                onClick={shareSet}
              >
                {collectionCopied ? "Set link copied ✓" : `Copy link to ${set.length} chart${set.length > 1 ? "s" : ""}`}
              </button>
            </div>
          )}

          {error && <p style={{ color: "var(--bad)", marginTop: "0.8rem" }}>{error}</p>}

          {chart && (
            <>
              <p className="dim small" style={{ marginTop: "0.8rem" }}>
                {label.trim() && <><strong style={{ color: "var(--text)" }}>{label.trim()}</strong> · </>}
                {fromLink && <span className="mute">shared chart · </span>}
                {place && <>{place} · </>}
                {tzMode === "local" && zone
                  ? <>{iso} local ({zone}) → {utIso}Z</>
                  : <>{iso}Z</>}
                {" · "}{lat}°, {lon}° (east+) · {chart.houseSystem} · {zodiac}
                {chart.houseSystem !== chart.houseSystemRequested && " · placidus undefined at this latitude, fell back"}
                {" · "}computed client-side in {ms.toFixed(1)} ms
              </p>
              {tzStatus === "ambiguous" && (
                <p className="dim small" style={{ margin: "0.25rem 0 0", color: "var(--warm)" }}>
                  This local time falls in a daylight-saving fall-back hour that occurred twice; the earlier instant was used.
                </p>
              )}
              {tzStatus === "nonexistent" && (
                <p className="dim small" style={{ margin: "0.25rem 0 0", color: "var(--warm)" }}>
                  This local time falls in a spring-forward gap that never occurred; it was shifted forward per the time-zone rules.
                </p>
              )}
              {chart.unavailable.length > 0 && (
                <p className="dim small" style={{ margin: "0.25rem 0 0", color: "var(--warm)" }}>
                  Outside its fitted range at this date, so omitted from the chart: {chart.unavailable.join(", ")}.
                </p>
              )}

              <div className="skynow-layout">
                <div className="skynow-chart">
                  <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.6rem" }}>
                    {(["wheel", "sphere", "map", "transits"] as const).map((v) => (
                      <button key={v} type="button" className="mono" style={viewBtn(v)} onClick={() => setView(v)}>
                        {v.charAt(0).toUpperCase() + v.slice(1)}
                      </button>
                    ))}
                  </div>
                  {view === "wheel" && <ChartWheel chart={chart} size={460} bodies={focusBodies} theme={WHEEL_THEME} />}
                  {view === "sphere" && <ChartSphere chart={chart} size={460} theme={WHEEL_THEME} />}
                  {view === "map" && mapLines && <AstroMap lines={mapLines} width={460} height={230} theme={WHEEL_THEME} colors={WHEEL_LINE_COLORS} />}
                  {view === "transits" && transit && (
                    <BiWheel inner={chart} outer={transit.chart} contacts={transit.contacts} size={460} innerLabel="natal" outerLabel="transit" />
                  )}
                  {view === "transits" && (
                    <p className="dim small" style={{ margin: "0.5rem 0 0" }}>
                      The chart as natal (inner) and the sky right now (outer), with the transit aspects between them.
                    </p>
                  )}
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
                    {(["positions", "aspects", "insights", "vedic", "declination", "stars", "events", "json"] as const).map((t) => (
                      <button key={t} type="button" className="mono" style={tabBtn(t)} onClick={() => setTab(t)}>
                        {t === "json" ? "JSON" : t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>

                  {tab === "positions" && (
                    <>
                      <table className="mono" style={{ fontSize: "0.82rem" }}>
                        <tbody>
                          {BODIES.map((b) => {
                            const p = chart.bodies[b];
                            const active = focus?.key === `b-${b}`;
                            return (
                              <tr
                                key={b}
                                onClick={p ? () => toggleFocus(`b-${b}`, withAspectsOf(b)) : undefined}
                                title={p ? "Isolate this planet and its aspects on the wheel" : undefined}
                                style={p ? { cursor: "pointer", background: active ? "var(--surface-2)" : undefined } : undefined}
                              >
                                <td className="mute" style={cell}>{GLYPHS[b] ? `${GLYPHS[b]} ` : ""}{b}</td>
                                {p ? (
                                  <>
                                    <td style={cell}>{fmtLon(p.lon)}{p.retrograde ? " ℞" : ""}</td>
                                    <td className="mute" style={cell}>h{houseOf(chart.cusps, p.lon)}</td>
                                  </>
                                ) : (
                                  <td className="mute" style={cell} colSpan={2}>n/a (outside fitted range)</td>
                                )}
                              </tr>
                            );
                          })}
                          <tr><td className="mute" style={cell}>ASC</td><td style={cell}>{fmtLon(chart.angles.asc)}</td><td /></tr>
                          <tr><td className="mute" style={cell}>MC</td><td style={cell}>{fmtLon(chart.angles.mc)}</td><td /></tr>
                        </tbody>
                      </table>
                      <p className="dim small" style={{ margin: "0.5rem 0 0" }}>
                        Click a planet to isolate it and its aspects on the wheel.
                      </p>
                    </>
                  )}

                  {tab === "aspects" && (() => {
                    const present = ASPECTABLE_ORDER.filter((b) => chart.bodies[b]);
                    const look: Record<string, { aspect: string; orb: number }> = {};
                    for (const a of chart.aspects) look[[a.a, a.b].sort().join("|")] = { aspect: a.aspect, orb: a.orb };
                    return (
                      <>
                        <div style={{ overflowX: "auto" }}>
                          <table className="mono" style={{ borderCollapse: "collapse", fontSize: "0.95rem" }}>
                            <tbody>
                              {present.map((b, i) => (
                                <tr key={b}>
                                  {present.slice(0, i).map((other) => {
                                    const a = look[[b, other].sort().join("|")];
                                    return (
                                      <td
                                        key={other}
                                        title={a ? `${b} ${a.aspect} ${other} · orb ${a.orb}°` : `${b} / ${other}`}
                                        style={{
                                          width: "1.5rem", height: "1.5rem", textAlign: "center",
                                          border: "1px solid var(--border)", color: aspectColor(a?.aspect),
                                        }}
                                      >
                                        {a ? ASPECT_GLYPH[a.aspect] ?? "" : ""}
                                      </td>
                                    );
                                  })}
                                  <td style={{ padding: "0 0.4rem", color: "var(--text-mute)", whiteSpace: "nowrap" }}>
                                    {GLYPHS[b] ?? b.slice(0, 2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="dim small" style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", margin: "0.55rem 0 0" }}>
                          {(["conjunction", "sextile", "square", "trine", "opposition"] as const).map((a) => (
                            <span key={a}>
                              <span style={{ color: aspectColor(a) }}>{ASPECT_GLYPH[a]}</span> {a}
                            </span>
                          ))}
                        </div>
                        <ul className="mono" style={{ lineHeight: 1.8, paddingLeft: "1.1rem", fontSize: "0.82rem", margin: "0.8rem 0 0" }}>
                          {chart.aspects.map((a, i) => (
                            <li key={i}>{a.a} {a.aspect} {a.b} <span className="mute">(orb {a.orb}°)</span></li>
                          ))}
                        </ul>
                      </>
                    );
                  })()}

                  {tab === "insights" && insights && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem", fontSize: "0.82rem" }}>
                      {/* Signature */}
                      <div>
                        <div className="dim small" style={{ textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>Signature</div>
                        {ELEMENTS.map((e) => {
                          const n = insights.signature.elements[e];
                          const tot = ELEMENTS.reduce((s, el) => s + insights.signature.elements[el], 0) || 1;
                          return (
                            <div key={e} style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0.15rem 0" }}>
                              <span className="mute" style={{ width: "3.4rem" }}>{e}</span>
                              <div style={{ flex: 1, background: "var(--surface-2)", borderRadius: 2, height: "0.6rem", overflow: "hidden" }}>
                                <div style={{ width: `${(n / tot) * 100}%`, background: "var(--accent)", height: "100%" }} />
                              </div>
                              <span className="mute" style={{ width: "1.2rem", textAlign: "right" }}>{n}</span>
                            </div>
                          );
                        })}
                        <p className="dim small" style={{ margin: "0.5rem 0 0" }}>
                          {insights.signature.modalities.cardinal}c · {insights.signature.modalities.fixed}f · {insights.signature.modalities.mutable}m
                          {" · dominant "}<strong style={{ color: "var(--text)" }}>{insights.signature.dominant.element} {insights.signature.dominant.modality}</strong>
                          {insights.signature.dominant.sign && <> in {insights.signature.dominant.sign}</>}
                          {insights.signature.ruler && <> · ruler {insights.signature.ruler}</>}
                        </p>
                      </div>

                      {/* Patterns */}
                      <div>
                        <div className="dim small" style={{ textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>Configurations</div>
                        {insights.patterns.length === 0 ? (
                          <p className="dim small" style={{ margin: 0 }}>No major configurations.</p>
                        ) : (
                          <>
                            <div className="mono" style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                              {insights.patterns.map((p, i) => {
                                const active = focus?.key === `p${i}`;
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => toggleFocus(`p${i}`, p.bodies)}
                                    aria-pressed={active}
                                    title="Isolate this configuration on the wheel"
                                    style={{
                                      textAlign: "left", font: "inherit", fontSize: "0.82rem", cursor: "pointer",
                                      background: active ? "var(--surface-2)" : "transparent",
                                      border: "1px solid", borderColor: active ? "var(--accent)" : "transparent",
                                      borderRadius: "var(--radius-sm)", padding: "0.2rem 0.45rem", color: "var(--text)",
                                    }}
                                  >
                                    {PATTERN_LABEL[p.kind] ?? p.kind}{" "}
                                    <span className="mute">
                                      {p.bodies.join(", ")}
                                      {p.sign ? ` · ${p.sign}` : ""}
                                      {p.apex ? ` · apex ${p.apex}` : ""}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <p className="dim small" style={{ margin: "0.4rem 0 0" }}>
                              {focusBodies ? "Showing one configuration on the wheel. " : ""}
                              Click a configuration to isolate it on the wheel.
                            </p>
                          </>
                        )}
                      </div>

                      {/* Dignities */}
                      <div>
                        <div className="dim small" style={{ textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
                          Dignity ({insights.sect} chart)
                        </div>
                        <table className="mono" style={{ fontSize: "0.82rem" }}>
                          <tbody>
                            {insights.dignities.map((d) => (
                              <tr key={d.planet}>
                                <td className="mute" style={cell}>{d.planet}</td>
                                <td style={{ ...cell, color: d.total > 0 ? "var(--good)" : d.total < 0 ? "var(--bad)" : "var(--text-dim)" }}>
                                  {d.total > 0 ? "+" : ""}{d.total}
                                </td>
                                <td className="mute" style={cell}>{dignityLabel(d)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Hermetic lots (sect-aware Arabic parts) */}
                      <div>
                        <div className="dim small" style={{ textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
                          Hermetic lots
                        </div>
                        <table className="mono" style={{ fontSize: "0.82rem" }}>
                          <tbody>
                            {HERMETIC_LOTS.map((name) => (
                              <tr key={name}>
                                <td className="mute" style={cell}>{name}</td>
                                <td style={cell}>{fmtLon(insights.lots[name])}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Time-lords: annual profection (lord of the year), to today */}
                      <div>
                        <div className="dim small" style={{ textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
                          Time-lords (today)
                        </div>
                        <p className="small" style={{ margin: 0 }}>
                          Age {insights.profection.age_years} · lord of the year{" "}
                          <strong style={{ color: "var(--text)" }}>{insights.profection.annual.lord}</strong>{" "}
                          <span className="mute">({insights.profection.annual.sign}, house {insights.profection.annual.house})</span>
                        </p>
                        <p className="dim small" style={{ margin: "0.2rem 0 0" }}>
                          Month {insights.profection.month}: {insights.profection.monthly.lord} ({insights.profection.monthly.sign}).
                          Also firdaria, zodiacal releasing, and primary directions.
                        </p>
                      </div>
                    </div>
                  )}

                  {tab === "vedic" && vedic && (
                    <>
                      <p className="dim small" style={{ marginTop: 0 }}>Sidereal · Lahiri. Nakshatra, then the navamsa (D9) and dasamsa (D10) signs:</p>
                      <div style={{ overflowX: "auto" }}>
                        <table className="mono" style={{ fontSize: "0.82rem" }}>
                          <thead>
                            <tr style={{ color: "var(--text-mute)" }}>
                              <td style={cell} /><td style={nowrapCell}>nakshatra</td><td style={cell}>D9</td><td style={cell}>D10</td>
                            </tr>
                          </thead>
                          <tbody>
                            {vedic.bodies.map(({ body, nak, d9, d10 }) => (
                              <tr key={body}>
                                <td className="mute" style={nowrapCell}>{GLYPHS[body] ? `${GLYPHS[body]} ` : ""}{body}</td>
                                <td style={nowrapCell}>{nak.name} <span className="mute">p{nak.pada}</span></td>
                                <td className="mute" style={cell}>{d9}</td>
                                <td className="mute" style={cell}>{d10}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {vedic.dasha && (
                        <p className="dim small" style={{ margin: "0.8rem 0 0" }}>
                          Vimshottari dasha today:{" "}
                          <strong style={{ color: "var(--text)" }}>{vedic.dasha.maha}</strong>
                          {vedic.dasha.antar && <> › {vedic.dasha.antar}</>}
                          {vedic.dasha.pratyantar && <> › {vedic.dasha.pratyantar}</>}
                        </p>
                      )}
                      <p className="dim small" style={{ margin: "0.4rem 0 0" }}>
                        Reading the chart as a birth moment. Also: Yogini and Ashtottari dashas, the vargas, and the yogas.
                      </p>
                    </>
                  )}

                  {tab === "declination" && decl && (
                    <>
                      <p className="dim small" style={{ marginTop: 0 }}>Declination (°), with out-of-bounds flagged (beyond the Sun&rsquo;s ±23.4°):</p>
                      <table className="mono" style={{ fontSize: "0.82rem" }}>
                        <tbody>
                          {decl.bodies.map(({ body, dec, oob }) => (
                            <tr key={body}>
                              <td className="mute" style={cell}>{GLYPHS[body] ? `${GLYPHS[body]} ` : ""}{body}</td>
                              <td style={cell}>{dec >= 0 ? "+" : ""}{dec.toFixed(2)}°</td>
                              <td style={{ ...cell, color: oob ? "var(--warm)" : "var(--text-mute)" }}>{oob ? "out of bounds" : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="dim small" style={{ margin: "0.8rem 0 0.3rem" }}>Parallels (=) and contraparallels (≠), within 1°:</p>
                      {decl.pairs.length === 0 ? (
                        <p className="dim small" style={{ margin: 0 }}>None.</p>
                      ) : (
                        <ul className="mono" style={{ lineHeight: 1.7, paddingLeft: "1.1rem", fontSize: "0.82rem", margin: 0 }}>
                          {decl.pairs.map((p, i) => (
                            <li key={i}>{p.a} {p.kind === "parallel" ? "∥" : "⊼"} {p.b} <span className="mute">({p.kind})</span></li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}

                  {tab === "stars" && stars && (
                    <>
                      <p className="dim small" style={{ marginTop: 0 }}>Bright fixed stars (mag ≤ 2.5) within 1° of a body, by longitude:</p>
                      {stars.length === 0 ? (
                        <p className="dim small" style={{ margin: 0 }}>No close conjunctions.</p>
                      ) : (
                        <table className="mono" style={{ fontSize: "0.82rem" }}>
                          <tbody>
                            {stars.map((h, i) => (
                              <tr key={i}>
                                <td className="mute" style={cell}>{GLYPHS[h.body] ? `${GLYPHS[h.body]} ` : ""}{h.body}</td>
                                <td style={cell}>{h.star}</td>
                                <td className="mute" style={cell}>{h.orb}°</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <p className="dim small" style={{ margin: "0.5rem 0 0" }}>From the 319-star catalogue (Node tier), bundled here for the demo.</p>
                    </>
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
