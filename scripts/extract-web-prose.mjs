#!/usr/bin/env node
/**
 * Extract user-facing prose from apps/web for Vale.
 * Writes .web-prose-extract.md (gitignored).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const files = [
  "apps/web/app/page.tsx",
  "apps/web/app/notes/page.tsx",
  "apps/web/app/provenance/page.tsx",
  "apps/web/app/validation/page.tsx",
  "apps/web/app/methods/page.tsx",
  "apps/web/app/how-it-was-built/page.tsx",
  "apps/web/app/features/page.tsx",
];

const chunks = ["# Web prose extract (auto-generated for Vale)\n"];

function add(line) {
  const t = line.replace(/\s+/g, " ").trim();
  if (t.length < 12) return;
  if (/[{=>]|const |useState|style=|opacity:|fontSize:/.test(t)) return;
  chunks.push(t, "\n");
}

for (const file of files) {
  const text = readFileSync(join(root, file), "utf8");
  chunks.push(`\n## ${relative(root, file)}\n`);

  for (const m of text.matchAll(/description:\s*"([^"]+)"/g)) add(m[1]);

  // Multi-line JSX text between tags (P, H2, h1, strong)
  for (const m of text.matchAll(/(?:<P>|<H2>|<h1[^>]*>|>)\s*([\s\S]*?)<\//g)) {
    const block = m[1].replace(/\{[^}]+\}/g, " ").replace(/<[^>]+>/g, " ");
    for (const line of block.split(/\n/)) add(line);
  }
}

writeFileSync(join(root, ".web-prose-extract.md"), chunks.join("\n"));
console.log("Wrote .web-prose-extract.md");
