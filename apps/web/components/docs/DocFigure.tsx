import type { ReactNode } from "react";

/**
 * A framed illustration for the guide pages: the rendered output (a wheel, a
 * table, a timeline) over a small caption. Server-rendered, no client JS.
 * `center` centres the body (used for the square chart wheels); the default is
 * left-aligned for tables that should read like the surrounding prose.
 */
export function DocFigure({
  caption, children, center = false,
}: {
  caption?: ReactNode;
  children: ReactNode;
  center?: boolean;
}) {
  return (
    <figure
      className="card"
      style={{ margin: "1.25rem 0", padding: "1rem 1.2rem", background: "var(--surface)" }}
    >
      <div style={{ display: "flex", justifyContent: center ? "center" : "flex-start", overflowX: "auto" }}>
        {children}
      </div>
      {caption && (
        <figcaption className="dim small" style={{ margin: "0.7rem 0 0", lineHeight: 1.5 }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** Shared cell padding for the monospace output tables. */
export const cell: React.CSSProperties = { padding: "0.16rem 0.9rem 0.16rem 0", whiteSpace: "nowrap" };

/** A muted, uppercase section label inside an output panel. */
export function OutputLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="dim small"
      style={{ textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.45rem" }}
    >
      {children}
    </div>
  );
}
