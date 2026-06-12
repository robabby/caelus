"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { openMeteoGeocoder, type GeocodeResult } from "caelus-birth/geocode";

const inp = {
  background: "#1a1626", color: "#e8e4f0", border: "1px solid #3a3450",
  borderRadius: 4, padding: "0.4rem 0.6rem", fontFamily: "inherit", fontSize: "1em",
};

export default function BirthForm() {
  const router = useRouter();
  const [date, setDate] = useState("1990-06-10");
  const [time, setTime] = useState("14:30");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [place, setPlace] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [picked, setPicked] = useState<GeocodeResult | null>(null);
  const [lat, setLat] = useState("27.95");
  const [lon, setLon] = useState("-82.46");
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // debounced place search (Open-Meteo geocoder: free, no key; data CC-BY GeoNames)
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (place.trim().length < 3 || place === picked?.name) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await openMeteoGeocoder.search(place.trim()));
      } catch {
        setResults([]); // offline or rate-limited: manual lat/lon still works
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [place, picked]);

  const pick = (r: GeocodeResult) => {
    setPicked(r);
    setPlace(r.name);
    setLat(String(r.lat));
    setLon(String(r.lon));
    setResults([]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const [y, mo, d] = date.split("-").map(Number);
    const [h, mi] = timeUnknown ? [12, 0] : time.split(":").map(Number);
    const q = new URLSearchParams({
      y: String(y), mo: String(mo), d: String(d), h: String(h), mi: String(mi),
      lat, lon, ...(timeUnknown ? { tu: "1" } : {}),
      ...(picked?.timezone ? { zone: picked.timezone } : {}),
    });
    router.push(`/chart?${q}`);
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "0.8rem", maxWidth: 480, margin: "1.5rem 0" }}>
      <label>birth date{" "}
        <input style={inp} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label style={{ opacity: timeUnknown ? 0.4 : 1 }}>local time{" "}
        <input style={inp} type="time" value={time} onChange={(e) => setTime(e.target.value)}
          disabled={timeUnknown} required={!timeUnknown} />
      </label>
      <label>
        <input type="checkbox" checked={timeUnknown} onChange={(e) => setTimeUnknown(e.target.checked)} />
        {" "}time unknown
      </label>
      <div style={{ position: "relative" }}>
        <label>place{" "}
          <input style={{ ...inp, width: "16rem" }} value={place} placeholder="search a city…"
            onChange={(e) => { setPlace(e.target.value); setPicked(null); }} />
        </label>
        {searching && <span style={{ opacity: 0.5, marginLeft: 8 }}>…</span>}
        {results.length > 0 && (
          <ul style={{
            position: "absolute", zIndex: 2, listStyle: "none", margin: 0, padding: 0,
            background: "#1a1626", border: "1px solid #3a3450", borderRadius: 4, width: "20rem",
          }}>
            {results.map((r) => (
              <li key={`${r.lat},${r.lon}`}>
                <button type="button" onClick={() => pick(r)} style={{
                  ...inp, border: "none", width: "100%", textAlign: "left", cursor: "pointer",
                }}>{r.name}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.8rem", opacity: 0.85 }}>
        <label>lat <input style={{ ...inp, width: "6rem" }} value={lat} onChange={(e) => setLat(e.target.value)} /></label>
        <label>lon <input style={{ ...inp, width: "6rem" }} value={lon} onChange={(e) => setLon(e.target.value)} /></label>
        <span style={{ opacity: 0.5, alignSelf: "center", fontSize: "0.8em" }}>east+</span>
      </div>
      <button type="submit" style={{ ...inp, cursor: "pointer", borderColor: "#8a7fd4", width: "10rem" }}>
        compute chart
      </button>
    </form>
  );
}
