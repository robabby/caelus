/**
 * Shareable charts: the playground encodes the inputs the user typed into the
 * URL fragment and nothing more. No chart is computed, transmitted, or stored
 * server-side — whoever opens the link recomputes it locally from these
 * numbers. The fragment (`#...`) is never sent over the network, so the inputs
 * never reach a server at all.
 */
import type { HouseSystem, Zodiac } from "caelus";

/**
 * A shareable chart is just the inputs the user typed. Keys are short to keep
 * the link compact; `n` is an optional, user-chosen nickname (not PII unless
 * the minter puts it there). `t` is the UT instant, so a link is tz-unambiguous.
 */
export type Share = { v: 1; t: string; la: string; lo: string; h: HouseSystem; z: Zodiac; n?: string };

/** base64url of any JSON value, so it is URL- and fragment-safe. */
export function b64urlEncode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(raw: string): unknown {
  const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

const isShare = (v: unknown): v is Share =>
  !!v && typeof v === "object" && typeof (v as Share).t === "string";

function decShare(raw: string): Share | null {
  try {
    const s = b64urlDecode(raw);
    return isShare(s) ? s : null;
  } catch {
    return null;
  }
}

/** A set of charts ("my charts"), shared as one link. */
function decSet(raw: string): Share[] | null {
  try {
    const s = b64urlDecode(raw) as { c?: unknown };
    return s && Array.isArray(s.c) ? (s.c.filter(isShare) as Share[]) : null;
  } catch {
    return null;
  }
}

/**
 * Read the encoded chart(s) from the URL. We prefer the fragment (`#...`):
 * browsers never transmit the fragment to the server, so the inputs stay out of
 * request lines, access logs, and any infra in between. `#s=` is a set, `#c=` a
 * single chart; the query string (`?c=`) is read only as back-compat.
 */
export function readUrlState(): { set: Share[] | null; single: Share | null } {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const setRaw = hash.get("s");
  const singleRaw = hash.get("c") ?? new URLSearchParams(window.location.search).get("c");
  return {
    set: setRaw ? decSet(setRaw) : null,
    single: singleRaw ? decShare(singleRaw) : null,
  };
}
