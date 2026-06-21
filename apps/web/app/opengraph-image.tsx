import { ImageResponse } from "next/og";
import { SITE } from "../lib/site";

export const alt = SITE.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0c0a14",
          padding: "72px",
          color: "#e8e4f0",
          fontFamily: "monospace",
          position: "relative",
        }}
      >
        <svg
          width="560"
          height="560"
          viewBox="0 0 120 120"
          fill="none"
          stroke="#8a7fd4"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: "absolute", right: -40, top: 40, opacity: 0.16 }}
        >
          <path d="M16 82 C18 40 40 22 60 22 C80 22 102 40 104 82" />
          <path d="M25 82 C27 48 44 33 60 33 C76 33 93 48 95 82" stroke="#8a7fd4" opacity="0.6" />
          <path d="M16 82 c-4 5 -3 10 2 12" />
          <path d="M104 82 c4 5 3 10 -2 12" />
          <circle cx="60" cy="41" r="2.6" fill="#8a7fd4" stroke="none" />
          <path d="M41 57 c2 -7 9 -9 15 -6" />
          <path d="M79 57 c-2 -7 -9 -9 -15 -6" />
          <path d="M47 65 q13 -7 26 0" />
          <circle cx="52" cy="70" r="2" fill="#8a7fd4" stroke="none" />
          <circle cx="68" cy="70" r="2" fill="#8a7fd4" stroke="none" />
          <path d="M60 68 c0 9 1 13 -4 15" />
          <path d="M50 85 q10 6 20 0" />
          <path d="M46 82 C42 98 50 112 60 105 C70 112 78 98 74 82" />
          <path d="M55 94 q5 6 10 0" opacity="0.6" />
        </svg>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="13" fill="none" stroke="#8a7fd4" strokeWidth="1.5" opacity="0.6" />
            <circle cx="16" cy="16" r="9" fill="none" stroke="#8b849e" strokeWidth="1" opacity="0.4" />
            <circle cx="16" cy="16" r="3.2" fill="#f0a878" />
            <circle cx="29" cy="16" r="2.4" fill="#8a7fd4" />
            <circle cx="10.4" cy="9.2" r="1.5" fill="#e8e4f0" />
          </svg>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: 2 }}>Caelus</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.1, maxWidth: 900 }}>
            Validated astrology computation
          </div>
          <div style={{ fontSize: 30, color: "#9a93b0", maxWidth: 900 }}>
            Ephemeris, charts, events, timing techniques, Vedic methods, and MCP tools.
          </div>
        </div>

        <div style={{ display: "flex", gap: 28, fontSize: 26, color: "#8a7fd4" }}>
          <span>npm install caelus</span>
          <span style={{ color: "#6f6885" }}>·</span>
          <span>{SITE.url.replace("https://", "")}</span>
          <span style={{ color: "#6f6885" }}>·</span>
          <span>v{SITE.version}</span>
        </div>
      </div>
    ),
    size,
  );
}
