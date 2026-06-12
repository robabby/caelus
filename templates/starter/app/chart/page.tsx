"use client";
import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Engine } from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { toUT } from "caelus-birth";
import ChartView from "../../components/ChartView";

const engine = new Engine(embeddedData);

function ChartInner() {
  const params = useSearchParams();
  const router = useRouter();

  const n = (k: string) => Number(params.get(k));
  const timeUnknown = params.get("tu") === "1";
  const useLater = params.get("alt") === "1"; // ambiguous time: later candidate

  const { t, chart, error } = useMemo(() => {
    try {
      const t = toUT({
        year: n("y"), month: n("mo"), day: n("d"), hour: n("h"), minute: n("mi"),
        lat: n("lat"), lon: n("lon"),
        ...(params.get("zone") ? { zone: params.get("zone")! } : {}),
      });
      // ambiguous fall-back hour: default is the earlier instant; honor ?alt=1
      const utc = useLater && t.candidates?.[1]
        ? (() => {
            const ms = (t.candidates[1].jdUt - 2440587.5) * 86_400_000;
            const d = new Date(Math.round(ms));
            return {
              year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
              hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
            };
          })()
        : t.utc;
      const chart = engine.chart(
        utc.year, utc.month, utc.day, utc.hour, utc.minute, utc.second,
        n("lat"), n("lon"), timeUnknown ? "whole_sign" : "placidus",
      );
      return { t, chart, error: null };
    } catch (e) {
      return { t: null, chart: null, error: e instanceof Error ? e.message : String(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (error) return <p style={{ color: "#e08a8a" }}>{error}</p>;
  if (!t || !chart) return null;

  const localTime = `${params.get("h")}:${String(n("mi")).padStart(2, "0")}`;

  return (
    <main>
      <h1 style={{ letterSpacing: "0.05em" }}>
        <a href="/" style={{ color: "inherit", textDecoration: "none" }}>‹</a> chart
      </h1>
      <p style={{ opacity: 0.6, fontSize: "0.9em" }}>
        {params.get("y")}-{params.get("mo")}-{params.get("d")} {localTime} local
        ({t.zone}, UTC{t.offsetMinutes >= 0 ? "+" : ""}{t.offsetMinutes / 60}
        {t.dst ? " DST" : ""}) → {String(t.utc.hour).padStart(2, "0")}:
        {String(t.utc.minute).padStart(2, "0")} UT
      </p>

      {t.status === "ambiguous" && (
        <p style={{ background: "#2a2438", padding: "0.6rem 1rem", borderRadius: 6 }}>
          Clocks changed that night — {localTime} happened twice. Showing the{" "}
          {useLater ? "later" : "earlier"} one.{" "}
          <button
            onClick={() => {
              const q = new URLSearchParams(params.toString());
              if (useLater) q.delete("alt"); else q.set("alt", "1");
              router.replace(`/chart?${q}`);
            }}
            style={{ color: "#8a7fd4", background: "none", border: "none",
              cursor: "pointer", font: "inherit", textDecoration: "underline" }}
          >switch?</button>
        </p>
      )}
      {t.status === "nonexistent" && (
        <p style={{ background: "#2a2438", padding: "0.6rem 1rem", borderRadius: 6 }}>
          Clocks sprang forward that night — {localTime} never existed. Shifted
          forward per timezone convention.
        </p>
      )}
      {timeUnknown && (
        <p style={{ background: "#2a2438", padding: "0.6rem 1rem", borderRadius: 6 }}>
          Birth time unknown: computed for local noon with whole-sign houses.
          Planet signs are usually reliable (the Moon can change sign within a
          day); <strong>houses and the Ascendant require a birth time</strong>.{" "}
          <a href="/rectify" style={{ color: "#8a7fd4" }}>How to narrow it down →</a>
        </p>
      )}

      <ChartView chart={chart} hideHouses={timeUnknown} />
    </main>
  );
}

export default function ChartPage() {
  return (
    <Suspense fallback={<p style={{ opacity: 0.5 }}>computing…</p>}>
      <ChartInner />
    </Suspense>
  );
}
