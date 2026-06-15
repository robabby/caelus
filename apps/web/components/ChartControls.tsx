"use client";

import type { Dispatch, SetStateAction } from "react";
import type { HouseSystem, Zodiac } from "caelus";
import CityPicker, { type City } from "./CityPicker";
import { control } from "../lib/chart-display";
import type { Share } from "../lib/share";

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

const fieldLabel = { display: "flex", gap: "0.35rem", alignItems: "center" } as const;

export interface ChartControlsProps {
  iso: string; setIso: Dispatch<SetStateAction<string>>;
  lat: string; setLat: Dispatch<SetStateAction<string>>;
  lon: string; setLon: Dispatch<SetStateAction<string>>;
  sys: HouseSystem; setSys: Dispatch<SetStateAction<HouseSystem>>;
  zodiac: Zodiac; setZodiac: Dispatch<SetStateAction<Zodiac>>;
  tzMode: "utc" | "local"; setTzMode: Dispatch<SetStateAction<"utc" | "local">>;
  label: string; setLabel: Dispatch<SetStateAction<string>>;
  setPlace: Dispatch<SetStateAction<string>>;
  set: Share[];
  hasChart: boolean;
  copied: boolean;
  collectionCopied: boolean;
  onShare: () => void;
  onAddToSet: () => void;
  onShareSet: () => void;
  onLoadShare: (s: Share) => void;
  onRemoveFromSet: (i: number) => void;
}

/**
 * The playground's input header: the place/time/coordinate controls, the share
 * and "add to my charts" actions, the privacy note, and the "my charts" tray.
 * A controlled form — all state lives in the parent (SkyNow); this renders it.
 */
export default function ChartControls({
  iso, setIso, lat, setLat, lon, setLon, sys, setSys, zodiac, setZodiac,
  tzMode, setTzMode, label, setLabel, setPlace, set, hasChart,
  copied, collectionCopied, onShare, onAddToSet, onShareSet, onLoadShare, onRemoveFromSet,
}: ChartControlsProps) {
  return (
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
        <label className="small mute" style={fieldLabel}>
          <select
            style={control}
            value={tzMode}
            onChange={(e) => setTzMode(e.target.value as "utc" | "local")}
            aria-label="how to read the time"
          >
            <option value="utc">UTC</option>
            <option value="local">local</option>
          </select>
          <input
            style={control}
            type="datetime-local"
            value={iso}
            onChange={(e) => setIso(e.target.value)}
            aria-label={tzMode === "local" ? "local birth time" : "time in UTC"}
          />
        </label>
        <label className="small mute" style={fieldLabel}>
          lat <input style={{ ...control, width: "5.5rem" }} value={lat} onChange={(e) => { setLat(e.target.value); setPlace(""); }} />
        </label>
        <label className="small mute" style={fieldLabel}>
          lon <input style={{ ...control, width: "5.5rem" }} value={lon} onChange={(e) => { setLon(e.target.value); setPlace(""); }} />
        </label>
        <select style={control} value={sys} onChange={(e) => setSys(e.target.value as HouseSystem)} aria-label="house system">
          {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select style={control} value={zodiac} onChange={(e) => setZodiac(e.target.value as Zodiac)} aria-label="zodiac">
          {ZODIACS.map(([zlabel, value]) => <option key={value} value={value}>{zlabel}</option>)}
        </select>
        <label className="small mute" style={fieldLabel}>
          name
          <input
            style={{ ...control, width: "8rem" }}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="optional nickname"
            aria-label="chart nickname"
          />
        </label>
        <button
          type="button"
          className="mono"
          style={{ ...control, cursor: "pointer", borderColor: "var(--accent)", color: "var(--text)" }}
          onClick={onShare}
        >
          {copied ? "Link copied ✓" : "Copy share link"}
        </button>
        <button
          type="button"
          className="mono"
          style={{ ...control, cursor: "pointer" }}
          onClick={onAddToSet}
          disabled={!hasChart}
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
                onClick={() => onLoadShare(s)}
                title="Load this chart"
              >
                {s.n || `Chart ${i + 1}`}
              </button>
              <button
                type="button"
                className="chart-chip__remove"
                onClick={() => onRemoveFromSet(i)}
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
            style={{ ...control, cursor: "pointer", borderColor: "var(--accent)", color: "var(--text)" }}
            onClick={onShareSet}
          >
            {collectionCopied ? "Set link copied ✓" : `Copy link to ${set.length} chart${set.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </>
  );
}
