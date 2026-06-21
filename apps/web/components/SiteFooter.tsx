import Link from "next/link";
import GlyphMark from "./GlyphMark";
import { FOOTER, SITE } from "../lib/site";

function FooterLink({ href, label, external }: { href: string; label: string; external?: boolean }) {
  if (external || href.startsWith("http") || href.endsWith(".txt") || href.startsWith("/api/")) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
        {label}
      </a>
    );
  }
  return <Link href={href}>{label}</Link>;
}

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container-wide">
        <div className="site-footer__grid">
          <div className="site-footer__col">
            <Link href="/" className="wordmark" aria-label="Caelus home">
              <GlyphMark size={20} />
              <span>Caelus</span>
            </Link>
            <p className="dim small" style={{ margin: "0.8rem 0 0", maxWidth: "26ch" }}>
              {SITE.tagline} Clean-room, MIT, no ephemeris files.
            </p>
          </div>
          {FOOTER.map((col) => (
            <div key={col.title} className="site-footer__col">
              <h4>{col.title}</h4>
              <ul>
                {col.links.map((link) => (
                  <li key={link.label}>
                    <FooterLink {...link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="site-footer__meta">
          <a href={`${SITE.repo}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
            MIT License
          </a>
          <span aria-hidden>·</span>
          <Link href="/privacy">Privacy</Link>
          <span aria-hidden>·</span>
          <span>v{SITE.version}</span>
          <span aria-hidden>·</span>
          <span>Positions computed from published math, not recalled.</span>
          <span style={{ marginLeft: "auto" }} suppressHydrationWarning>
            © {year} Caelus
          </span>
        </div>
      </div>
    </footer>
  );
}
