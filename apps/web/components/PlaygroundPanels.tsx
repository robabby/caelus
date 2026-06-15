"use client";

import dynamic from "next/dynamic";

export const SkyNow = dynamic(() => import("./SkyNow"), {
  ssr: false,
  loading: () => (
    <div className="card" style={{ padding: "1.2rem" }}>
      <p className="dim small" style={{ margin: 0 }}>loading playground…</p>
    </div>
  ),
});

export const SynastryPanel = dynamic(() => import("./SynastryPanel"), {
  ssr: false,
  loading: () => (
    <div className="card" style={{ padding: "1.2rem" }}>
      <p className="dim small" style={{ margin: 0 }}>loading synastry…</p>
    </div>
  ),
});
