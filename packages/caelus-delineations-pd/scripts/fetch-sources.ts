#!/usr/bin/env npx tsx
/**
 * Fetch PD source texts listed in sources/manifest.json into the package tree.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(PKG_ROOT, "sources/manifest.json");

interface FetchSpec {
  url?: string;
  urls?: string[];
  stripGutenberg?: boolean;
  stripArchive?: boolean;
  sacredTextsIndex?: string;
}

interface SourceEntry {
  id: string;
  layer: 1 | 2 | 3;
  title: string;
  author: string;
  year: number;
  tradition: string;
  rights: string;
  file: string;
  fetch: FetchSpec;
}

function stripGutenberg(text: string): string {
  const startMarkers = [
    "*** START OF THE PROJECT GUTENBERG EBOOK",
    "*** START OF THIS PROJECT GUTENBERG EBOOK",
  ];
  const endMarkers = [
    "*** END OF THE PROJECT GUTENBERG EBOOK",
    "End of the Project Gutenberg",
  ];
  let start = 0;
  for (const m of startMarkers) {
    const i = text.indexOf(m);
    if (i !== -1) {
      const lineEnd = text.indexOf("\n", i);
      start = lineEnd !== -1 ? lineEnd + 1 : i + m.length;
      break;
    }
  }
  let end = text.length;
  for (const m of endMarkers) {
    const i = text.indexOf(m);
    if (i !== -1) {
      end = i;
      break;
    }
  }
  return text.slice(start, end).trim();
}

function stripArchive(text: string): string {
  return text
    .replace(/^\s*\d{1,4}\s*$/gm, "")
    .replace(/^.*Digitized by.*$/gm, "")
    .replace(/^.*Internet Archive.*$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ZODIAC = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittar", "capricorn", "aquarius", "pisces",
];

/** A fetched body that is actually an HTML page (an archive.org / error
 *  wrapper), not book text. The original bug shipped two of these. */
function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 4000).toLowerCase();
  return head.includes("<!doctype html") || head.includes("<html")
    || head.includes("archive.org/includes");
}

/** Count distinct zodiac terms — a cheap "is this an astrology text" signal
 *  that an HTML wrapper or wrong scan fails. */
function astrologyTerms(text: string): number {
  const low = text.toLowerCase();
  return ZODIAC.filter((z) => low.includes(z)).length;
}

/** Reject a body that is HTML, too short, or (for an astrology source) carries
 *  too little zodiac vocabulary. Returns a reason, or null when the body is
 *  acceptable. The zodiac floor is skipped for hermetic/kabbalistic texts. */
function validateContent(text: string, requireAstrology = true): string | null {
  if (looksLikeHtml(text)) return "looks like an HTML page, not text";
  if (text.length < 1000) return `too short (${text.length} chars)`;
  if (requireAstrology) {
    const terms = astrologyTerms(text);
    if (terms < 6) return `only ${terms}/12 zodiac terms found`;
  }
  return null;
}

const ASTROLOGY_TRADITIONS = new Set(["hellenistic", "renaissance", "modern"]);

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; caelus-delineations-pd/0.1; +https://ephemengine.com)",
      Accept: "text/plain,text/html,*/*",
    },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchSacredTextsCorpus(indexUrl: string): Promise<string> {
  const indexHtml = await fetchText(indexUrl);
  const base = indexUrl.replace(/[^/]+$/, "");
  const links = [...indexHtml.matchAll(/href="([^"]+\.htm)"/gi)]
    .map((m) => m[1])
    .filter((href) => !href.startsWith("http") && href !== "index.htm")
    .map((href) => new URL(href, base).href);
  const unique = [...new Set(links)];
  const parts: string[] = [];
  for (const url of unique) {
    const html = await fetchText(url);
    parts.push(stripHtml(html));
  }
  return parts.join("\n\n---\n\n");
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as SourceEntry[];
  let ok = 0;
  let fail = 0;

  for (const entry of manifest) {
    const outPath = path.join(PKG_ROOT, entry.file);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const requireAstrology = ASTROLOGY_TRADITIONS.has(entry.tradition);

    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 5000) {
      const existing = fs.readFileSync(outPath, "utf8");
      if (!validateContent(existing, requireAstrology)) {
        console.log(`skip ${entry.id} (exists, valid)`);
        ok++;
        continue;
      }
      console.log(`re-fetch ${entry.id} (vendored copy is corrupt)`);
    }

    process.stdout.write(`fetch ${entry.id}... `);
    let lastErr: Error | undefined;
    try {
      let text: string;
      if (entry.fetch.sacredTextsIndex) {
        text = await fetchSacredTextsCorpus(entry.fetch.sacredTextsIndex);
      } else {
        const urls = entry.fetch.urls ?? (entry.fetch.url ? [entry.fetch.url] : []);
        text = "";
        for (const url of urls) {
          try {
            text = await fetchText(url);
            if (entry.fetch.stripGutenberg) text = stripGutenberg(text);
            if (entry.fetch.stripArchive) text = stripArchive(text);
            if (entry.file.endsWith(".htm") || url.endsWith(".htm") || url.endsWith(".html")) {
              text = stripHtml(text);
            }
            // Auto-recover a body that came back as HTML even when not flagged.
            if (looksLikeHtml(text)) text = stripHtml(text);
            const bad = validateContent(text, requireAstrology);
            if (!bad) break;
            lastErr = new Error(`${bad} from ${url}`);
          } catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err));
          }
        }
      }
      const bad = validateContent(text, requireAstrology);
      if (bad) throw lastErr ?? new Error(bad);
      fs.writeFileSync(outPath, text, "utf8");
      console.log(`${(text.length / 1024).toFixed(0)} KB`);
      ok++;
    } catch (err) {
      console.log(`FAIL: ${err instanceof Error ? err.message : err}`);
      fail++;
    }
  }

  console.log(`\n${ok} ok, ${fail} failed`);
  if (fail > 0) console.warn("some sources failed — re-run fetch or add urls to manifest");
}

main();
