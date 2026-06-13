#!/usr/bin/env node
/**
 * Builds apps/web/public/search-index.json from the docs MDX pages, the
 * static-metadata .tsx pages, and the generated TypeDoc API markdown.
 *
 * The site is a normal Next app (not a static export), so a crawler like
 * Pagefind has no `out/` to index. A generated JSON index over the same
 * source the pages render from is cleaner, keeps the zero-runtime-dependency
 * ethos, and lets a query for "solar return" or "rise set" land on the exact
 * function or recipe. Run after `docs:api` so the API markdown exists.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const APP_DIR = join(ROOT, "apps", "web", "app");
const API_DIR = join(ROOT, "apps", "web", "content", "api");
const OUT = join(ROOT, "apps", "web", "public", "search-index.json");

/** github-slugger-compatible heading slug (matches rehype-slug output). */
function slug(text) {
  return text
    .toLowerCase()
    .replace(/&amp;/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/ /g, "-");
}

/** Route for an app-dir page file, or null if it should be skipped. */
function routeOf(file) {
  const rel = relative(APP_DIR, file).replace(/\\/g, "/");
  const dir = rel.replace(/\/?page\.(mdx|tsx)$/, "");
  const segments = dir.split("/").filter((s) => s && !/^\(.*\)$/.test(s));
  if (segments.some((s) => s.startsWith("[") || s.startsWith("_") || s === "api")) {
    return null;
  }
  return "/" + segments.join("/");
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === "page.mdx" || name === "page.tsx") out.push(full);
  }
  return out;
}

function field(block, key) {
  const m = block.match(new RegExp(`${key}\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? m[1].replace(/\\"/g, '"') : "";
}

function metadataBlock(src) {
  const m = src.match(/export const metadata\s*=\s*\{([\s\S]*?)\}\s*;/);
  return m ? m[1] : "";
}

function stripToText(src, max = 240) {
  return src
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<CodeBlock[\s\S]*?\/>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*`>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const entries = [];

for (const file of walk(APP_DIR)) {
  const route = routeOf(file);
  if (route === null) continue;
  const src = readFileSync(file, "utf8");
  const meta = metadataBlock(src);
  const title = field(meta, "title");
  if (!title) continue; // pages without static metadata (dynamic routes, etc.)
  const description = field(meta, "description");

  if (file.endsWith("page.mdx")) {
    const body = src
      .replace(/export const metadata\s*=\s*\{[\s\S]*?\}\s*;/, "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/<CodeBlock[\s\S]*?\/>/g, " ");
    entries.push({ title, kind: "page", url: route, text: description || stripToText(body) });
    for (const m of body.matchAll(/^(#{2,3})\s+(.+)$/gm)) {
      const heading = m[2].replace(/&amp;/g, "&").replace(/[*`]/g, "").trim();
      entries.push({
        title: heading,
        kind: "heading",
        url: `${route}#${slug(m[2])}`,
        text: `${title} · ${description}`.slice(0, 240),
      });
    }
  } else {
    entries.push({ title, kind: "page", url: route, text: description });
  }
}

const KIND_LABEL = {
  Class: "class", Interface: "interface", Function: "function",
  TypeAlias: "type", Variable: "const", Enumeration: "enum",
};

if (existsSync(API_DIR)) {
  for (const name of readdirSync(API_DIR)) {
    if (!name.endsWith(".md") || name === "index.md") continue;
    const slugName = name.slice(0, -3);
    const [kindRaw, ...rest] = slugName.split(".");
    const symbol = rest.join(".") || kindRaw;
    const text = stripToText(readFileSync(join(API_DIR, name), "utf8"));
    entries.push({
      title: symbol,
      kind: KIND_LABEL[kindRaw] ?? "api",
      url: `/docs/api/${slugName}`,
      text,
    });
  }
}

writeFileSync(OUT, JSON.stringify(entries));
console.log(`search index: ${entries.length} entries -> ${relative(ROOT, OUT)}`);
