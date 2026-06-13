"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_NAV } from "../lib/site";
import Search from "./Search";

export default function DocsSidebar() {
  const pathname = usePathname();
  return (
    <nav className="docs-sidebar" aria-label="Documentation">
      <Search />
      {DOCS_NAV.map((group) => (
        <div key={group.title}>
          <h5>{group.title}</h5>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
