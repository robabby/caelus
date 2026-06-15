"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import InstallButton from "./InstallButton";

export default function PlaygroundStickyBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 480);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`sticky-cta${visible ? " sticky-cta--visible" : ""}`}
      role="region"
      aria-label="Get started"
      aria-hidden={!visible}
    >
      <div className="container-wide sticky-cta__inner">
        <p className="sticky-cta__note dim small">
          Computed client-side · <code>npm install caelus</code>
        </p>
        <div className="sticky-cta__actions">
          <InstallButton label="install" className="btn-sm" />
          <Link href="/docs/quickstart" className="btn btn-secondary btn-sm">
            Quickstart →
          </Link>
        </div>
      </div>
    </div>
  );
}
