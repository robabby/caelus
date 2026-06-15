"use client";

import { useState } from "react";
import { SITE } from "../lib/site";

export default function Cta() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText("npm install caelus");
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="btn btn-primary mono" onClick={copy}>
        {copied ? "copied ✓" : "$ npm install caelus"}
      </button>
      <a href="/docs/quickstart" className="btn btn-ghost">
        Quickstart
      </a>
      <a href={SITE.starter} className="btn btn-ghost" target="_blank" rel="noreferrer">
        Starter template
      </a>
      <a href="/docs/mcp" className="btn btn-ghost">
        MCP tools (25)
      </a>
    </div>
  );
}
