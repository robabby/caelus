"use client";

import Link from "next/link";
import InstallButton from "./InstallButton";
import { MCP_TOOL_COUNT, SITE } from "../lib/site";

type CtaProps = {
  /** Hero shows tertiary doc/starter/MCP links; compact is install + quickstart only. */
  variant?: "hero" | "compact";
  secondaryHref?: string;
  secondaryLabel?: string;
};

function CtaLinks() {
  return (
    <p className="cta__links">
      <Link href="/docs">Docs</Link>
      <span className="cta__sep" aria-hidden>
        ·
      </span>
      <a href={SITE.starter} target="_blank" rel="noreferrer">
        Starter template<span className="cta__external" aria-hidden> ↗</span>
      </a>
      <span className="cta__sep" aria-hidden>
        ·
      </span>
      <Link href="/docs/mcp">MCP tools ({MCP_TOOL_COUNT})</Link>
    </p>
  );
}

export default function Cta({
  variant = "hero",
  secondaryHref = "/docs/quickstart",
  secondaryLabel = "Quickstart →",
}: CtaProps) {
  return (
    <div className="cta">
      <div className="cta__actions">
        <InstallButton />
        <Link href={secondaryHref} className="btn btn-secondary">
          {secondaryLabel}
        </Link>
      </div>
      {variant === "hero" ? <CtaLinks /> : null}
    </div>
  );
}
