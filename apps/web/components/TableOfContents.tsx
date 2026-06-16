"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Item = { id: string; text: string; level: 2 | 3 };

// Mirror github-slugger (what rehype-slug uses) closely enough for the headings
// we generate on TSX pages. MDX and API markdown already carry rehype-slug ids,
// which we reuse verbatim; we only mint ids for headings that lack one.
function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Right-rail "On this page" navigation. Reads the rendered headings out of
 * `.docs-content` after each navigation, so it works uniformly across MDX
 * guides, the generated API markdown, and hand-written TSX pages without any
 * per-page wiring. Hidden on narrow viewports via CSS.
 */
export default function TableOfContents() {
  const pathname = usePathname();
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const root = document.querySelector(".docs-content");
    if (!root) {
      setItems([]);
      return;
    }
    const next: Item[] = [];
    const idCounts = new Map<string, number>();
    for (const h of Array.from(root.querySelectorAll<HTMLElement>("h2, h3"))) {
      const text = (h.textContent ?? "").replace(/[¶#]/g, "").trim();
      if (!text) continue;
      const base = h.id || slugify(text);
      const n = idCounts.get(base) ?? 0;
      const id = n === 0 ? base : `${base}-${n + 1}`;
      idCounts.set(base, n + 1);
      h.id = id;
      next.push({ id, text, level: h.tagName === "H3" ? 3 : 2 });
    }
    setItems(next);
    setActive(next[0]?.id ?? "");
  }, [pathname]);

  useEffect(() => {
    if (items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive((entry.target as HTMLElement).id);
        }
      },
      { rootMargin: "-84px 0px -68% 0px", threshold: 0 },
    );
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 2) return null;

  return (
    <nav className="docs-toc" aria-label="On this page">
      <h5>On this page</h5>
      <ul>
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? "docs-toc__sub" : undefined}>
            <a href={`#${item.id}`} aria-current={active === item.id ? "true" : undefined}>
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
