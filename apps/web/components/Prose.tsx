import Link from "next/link";

export const A = ({ href, children }: { href: string; children: React.ReactNode }) =>
  href.startsWith("/")
    ? <Link href={href} style={{ color: "#8a7fd4" }}>{children}</Link>
    : <a href={href} style={{ color: "#8a7fd4" }}>{children}</a>;

export const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ marginTop: "2.2rem", fontSize: "1.05rem", letterSpacing: "0.04em", opacity: 0.9 }}>{children}</h2>
);

export const P = ({ children, dim }: { children: React.ReactNode; dim?: boolean }) => (
  <p style={{ lineHeight: 1.65, opacity: dim ? 0.55 : 0.78 }}>{children}</p>
);

export const Code = ({ children }: { children: React.ReactNode }) => (
  <code style={{ background: "#1a1626", padding: "0.1rem 0.35rem", borderRadius: 4 }}>{children}</code>
);

export function Nav({ current }: { current: string }) {
  const pages = [["/", "Playground"], ["/validation", "Validation"], ["/provenance", "Provenance"], ["/notes", "Build Notes"]];
  return (
    <nav style={{ display: "flex", gap: "1.1rem", marginBottom: "2rem", fontSize: "0.85em" }}>
      {pages.map(([href, label]) => (
        <Link key={href} href={href} style={{ color: current === href ? "#e8e4f0" : "#8a7fd4", textDecoration: current === href ? "none" : undefined }}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
