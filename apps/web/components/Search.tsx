"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Entry = { title: string; kind: string; url: string; text: string };

const DIRECT_KINDS = new Set(["function", "class", "method", "heading", "interface"]);

function score(entry: Entry, q: string, terms: string[]): number {
  const title = entry.title.toLowerCase();
  const text = entry.text.toLowerCase();
  const url = entry.url.toLowerCase();
  let s = 0;
  if (title === q) s += 100;
  if (title.startsWith(q)) s += 50;
  if (title.includes(q)) s += 30;
  for (const t of terms) {
    if (title.includes(t)) s += 12;
    if (text.includes(t)) s += 3;
    if (url.includes(t)) s += 2;
  }
  if (s > 0 && DIRECT_KINDS.has(entry.kind)) s += 2;
  return s;
}

export default function Search() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<Entry[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/mac/i.test(navigator.platform));
  }, []);

  const load = useCallback(() => {
    if (index) return;
    fetch("/search-index.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Entry[]) => setIndex(data))
      .catch(() => setIndex([]));
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      // Remember where focus was so we can restore it when the dialog closes.
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      load();
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    setQuery("");
    // Return focus to the trigger (or wherever it was) on close.
    restoreFocusRef.current?.focus?.();
  }, [open, load]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !index) return [];
    const terms = q.split(/\s+/);
    return index
      .map((e) => ({ e, s: score(e, q, terms) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 20)
      .map((r) => r.e);
  }, [query, index]);

  const go = useCallback(
    (entry: Entry) => {
      setOpen(false);
      router.push(entry.url);
    },
    [router],
  );

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Tab") {
      // The input is the only focusable control in the dialog; keep focus
      // trapped here so Tab never escapes to the page behind the overlay.
      e.preventDefault();
    }
  };

  const activeId = results[active] ? `search-opt-${active}` : undefined;

  return (
    <>
      <button
        type="button"
        className="docs-search-trigger"
        onClick={() => setOpen(true)}
        aria-label="Search documentation"
      >
        <span>Search docs…</span>
        <kbd>{isMac ? "⌘" : "Ctrl"} K</kbd>
      </button>

      {open && (
        <div
          className="search-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Search documentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="search-panel">
            <input
              ref={inputRef}
              className="search-input"
              type="text"
              placeholder="Search functions, guides, recipes…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKey}
              aria-label="Search query"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="search-listbox"
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
            />
            {query.trim() && results.length === 0 ? (
              <p className="search-empty" role="status">
                {index === null ? "Loading index…" : "No matches."}
              </p>
            ) : (
              <ul className="search-results" id="search-listbox" role="listbox" aria-label="Search results">
                {results.map((entry, i) => (
                  <li
                    key={entry.url}
                    id={`search-opt-${i}`}
                    className="search-result"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(entry);
                    }}
                  >
                    <span className="search-text">
                      <strong>{entry.title}</strong>
                      {entry.text && <span className="search-snip">{entry.text}</span>}
                    </span>
                    <span className="search-kind">{entry.kind}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
