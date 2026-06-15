"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import GlyphMark from "./GlyphMark";
import InstallButton from "./InstallButton";
import ThemeToggle from "./ThemeToggle";
import { NAV, SITE } from "../lib/site";

export default function SiteHeader() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="site-header">
      <div className="container-wide site-header__inner">
        <Link href="/" className="wordmark" aria-label="Caelus home">
          <GlyphMark />
          <span>Caelus</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
          <span className="site-nav__sep" aria-hidden />
          <InstallButton label="install" className="btn-sm site-nav__install" />
          <a
            href={SITE.repo}
            className="site-nav__hide-sm"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <span className="tag site-nav__hide-sm" aria-label="current version">
            v{SITE.version}
          </span>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
