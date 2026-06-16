"use client";

import { usePathname } from "next/navigation";
import PageClose from "./PageClose";

type CloseConfig = {
  title: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

const DEFAULT_CLOSE: CloseConfig = { title: "Start building" };

/** Custom close blocks on high-intent doc pages; default elsewhere. */
const CLOSE_BY_PATH: Record<string, CloseConfig> = {
  "/docs/quickstart": { title: "Install and build" },
  "/docs/mcp": {
    title: "Add the engine to your stack",
    secondaryHref: "/docs/quickstart",
    secondaryLabel: "Engine quickstart →",
  },
  "/docs/charts": { title: "Ship a chart in your app" },
  "/docs/visualizations": {
    title: "Try it in the Playground",
    secondaryHref: "/playground",
    secondaryLabel: "Playground →",
  },
  "/docs/corpus": {
    title: "Ground an LLM in real chart facts",
    secondaryHref: "/docs/interpretation",
    secondaryLabel: "Interpretation layer →",
  },
};

export default function DocsPageFooter() {
  const pathname = usePathname();

  if (pathname === "/docs") {
    return null;
  }

  const config = CLOSE_BY_PATH[pathname] ?? DEFAULT_CLOSE;

  return (
    <PageClose
      title={config.title}
      secondaryHref={config.secondaryHref}
      secondaryLabel={config.secondaryLabel}
    />
  );
}
