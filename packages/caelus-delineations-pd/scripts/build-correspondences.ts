#!/usr/bin/env npx tsx
/**
 * Build data/correspondences.json from sources/correspondence/liber-777.csv
 * (from https://github.com/adamblvck/open_777).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const CSV_PATH = path.join(PKG_ROOT, "sources/correspondence/liber-777.csv");
const OUT_PATH = path.join(PKG_ROOT, "data/correspondences.json");

/** Map 777 path columns (11–32) to Caelus body ids where applicable. */
const PATH_TO_BODY: Record<string, string> = {
  "11": "mercury",
  "12": "mercury",
  "13": "moon",
  "14": "venus",
  "15": "mars",
  "16": "sun",
  "17": "venus",
  "18": "mercury",
  "19": "moon",
  "20": "jupiter",
  "21": "jupiter",
  "22": "jupiter",
  "23": "mars",
  "24": "mars",
  "25": "sun",
  "26": "sun",
  "27": "mars",
  "28": "sun",
  "29": "sun",
  "30": "sun",
  "31": "sun",
  "32": "saturn",
};

const ZODIAC_TO_SIGN: Record<string, string> = {
  aries: "aries", taurus: "taurus", gemini: "gemini", cancer: "cancer",
  leo: "leo", virgo: "virgo", libra: "libra", scorpio: "scorpio",
  sagittarius: "sagittarius", capricorn: "capricorn", aquarius: "aquarius",
  pisces: "pisces",
};

interface CorrespondenceEntry {
  path: string;
  body?: string;
  sign?: string;
  sephirah?: string;
  tarot?: string;
  greekGod?: string;
  romanGod?: string;
  metal?: string;
  element?: string;
  color?: string;
  source: { author: string; work: string; locus: string };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function clean(s: string): string {
  return s.replace(/\[\[[^\]]*\]\]/g, "").replace(/\s+/g, " ").trim();
}

function main(): void {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`missing ${CSV_PATH} — run npm run fetch first`);
    process.exit(1);
  }

  const lines = fs.readFileSync(CSV_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const col = (name: string): number => header.findIndex((h) => h.startsWith(name));

  const iCategory = 0;
  const iSephirah = col("2 - Hebrew");
  const iTarot = col("14 - General Attribution");
  const iGreek = col("34 - Greek");
  const iRoman = col("35 - Roman");
  const iMetal = col("Metal");
  const iElement = col("11 - Elements");
  const iColor = col("15 - The King Scale");
  const iZodiac = col("48 - Lineal");

  const byPath = new Map<string, CorrespondenceEntry>();

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r]);
    const category = clean(cells[iCategory] ?? "");
    const pathMatch = category.match(/^(\d{1,2})\b/) ?? category.match(/\b(\d{1,2})\s*-/);
    if (!pathMatch) continue;
    const pathNum = pathMatch[1].padStart(2, "0").replace(/^0+/, "") || "0";
    const pathKey = pathNum.length === 1 ? pathNum : pathNum;

    let entry = byPath.get(pathKey);
    if (!entry) {
      entry = {
        path: pathKey,
        body: PATH_TO_BODY[pathKey],
        source: { author: "Aleister Crowley", work: "Liber 777", locus: `path ${pathKey}` },
      };
      byPath.set(pathKey, entry);
    }

    const seph = clean(cells[iSephirah] ?? "");
    if (seph && !entry.sephirah) entry.sephirah = seph;

    const tarot = clean(cells[iTarot] ?? "");
    if (tarot && tarot !== "...") entry.tarot = tarot;

    const greek = clean(cells[iGreek] ?? "");
    if (greek && greek !== "...") entry.greekGod = greek;

    const roman = clean(cells[iRoman] ?? "");
    if (roman && roman !== "...") entry.romanGod = roman;

    const metal = clean(cells[iMetal] ?? "");
    if (metal && metal !== "...") entry.metal = metal;

    const element = clean(cells[iElement] ?? "");
    if (element && element !== "...") entry.element = element;

    const color = clean(cells[iColor] ?? "");
    if (color && color !== "...") entry.color = color;

    const zodiac = clean(cells[iZodiac] ?? "").toLowerCase();
    for (const [name, sign] of Object.entries(ZODIAC_TO_SIGN)) {
      if (zodiac.includes(name)) entry.sign = sign;
    }
  }

  const correspondences = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({ version: "0.1.0", correspondences }, null, 2));
  console.log(`wrote ${correspondences.length} path entries → ${OUT_PATH}`);
}

main();
