/**
 * caelus-wheel layout kernel — pure chart-wheel geometry.
 *
 * layoutChartWheel() turns resolved display points and resolved aspect edges
 * into every ring, wedge, tick, house line, axis, text box, connector, and
 * aspect chord a thin SVG renderer needs. It is deterministic, framework-free
 * (no React, no DOM), and policy-free: which bodies exist, which node flavor
 * wins, which aspect families display, and which orb admits an aspect are all
 * decided by the caller before this module is involved.
 *
 * Orientation follows Western convention: the anchor longitude sits at
 * 9 o'clock and the zodiac runs counterclockwise. Known-time charts anchor on
 * the Ascendant; unknown-time charts omit angles and cusps and anchor 0° Aries
 * at 9 o'clock.
 *
 * Text extents come from an injected deterministic metrics table — never from
 * the DOM, and never from character count alone: each codepoint carries its
 * own em advance. After angular spreading, label-to-label intersections get
 * one bounded radial adjustment (alternate labels drop to an inner tier);
 * whatever still intersects is reported per region in `crowding` rather than
 * silently overdrawn. A layout is therefore never blank and never a lie: every
 * unresolved region names the points inside it.
 */

/** Python-semantics modulo (result sign follows the divisor). */
const mod = (a: number, n: number) => ((a % n) + n) % n;

// ---------------------------------------------------------------- input

/** One resolved display point (a planet, node, or other body). */
export interface WheelLayoutPoint {
  /** Stable identity, unique within the input (e.g. "sun"). */
  id: string;
  /** True ecliptic longitude in degrees. */
  lon: number;
  /** Glyph text to draw at the point (already chosen by the caller). */
  glyph: string;
  /** Optional label text under the glyph (e.g. "16°30'℞"). */
  label?: string;
}

/** One resolved aspect edge. The caller has already applied orb policy. */
export interface WheelLayoutAspect {
  /** Point id of one endpoint. */
  a: string;
  /** Point id of the other endpoint. */
  b: string;
  /** Aspect family name (e.g. "trine"); passed through untouched. */
  family: string;
  /** Resolved display weight in [0, 1] (1 = exact); passed through untouched. */
  tightness: number;
}

export interface WheelLayoutInput {
  points: WheelLayoutPoint[];
  aspects: WheelLayoutAspect[];
  /** Chart angles. Absent = unknown birth time: no axes are laid out. */
  angles?: { asc: number; mc: number };
  /** Twelve house-cusp longitudes. Absent = unknown birth time: no houses. */
  cusps?: number[];
}

// ---------------------------------------------------------------- options

/**
 * Deterministic text measurement. `width` must account for the actual
 * codepoints in `text` (a metrics table keyed by codepoint qualifies);
 * a flat character count times a constant does not. No DOM access.
 */
export interface WheelTextMetrics {
  /** Advance width of `text` in px at `fontSize` px. */
  width(text: string, fontSize: number): number;
  /** Line-box height in px at `fontSize` px (text is centrally anchored). */
  height(fontSize: number): number;
}

/** Table-driven metrics: per-codepoint em advances plus a line-box height. */
export interface WheelTextMetricsTable {
  /** Em advance per codepoint (string key = the character). */
  advancesEm: Record<string, number>;
  /** Em advance for any codepoint not in the table. */
  defaultAdvanceEm: number;
  /** Line-box height in em. */
  heightEm: number;
}

/** Build a WheelTextMetrics from a pure table. Deterministic by construction. */
export function createTableTextMetrics(table: WheelTextMetricsTable): WheelTextMetrics {
  return {
    width(text, fontSize) {
      let em = 0;
      for (const ch of text) em += table.advancesEm[ch] ?? table.defaultAdvanceEm;
      return em * fontSize;
    },
    height(fontSize) {
      return table.heightEm * fontSize;
    },
  };
}

/**
 * Default metrics: an ink-box approximation of the wheel's default monospace
 * stack. ASCII and punctuation advance 0.6 em (the monospace cell); the
 * astrological glyphs render a little wider, 0.62 em. Heights use a 0.7 em
 * line box (cap height plus a small margin, not the full em square). Callers
 * with a known font should supply measured tables via createTableTextMetrics.
 */
export const DEFAULT_TEXT_METRICS: WheelTextMetrics = createTableTextMetrics({
  advancesEm: Object.fromEntries(
    [..."☉☽☿♀♂♃♄♅♆♇⚷☊☋♈♉♊♋♌♍♎♏♐♑♒♓"].map((g) => [g, 0.62]),
  ),
  defaultAdvanceEm: 0.6,
  heightEm: 0.7,
});

/** Ring and anchor radii as fractions of the outer radius. */
export interface WheelRadii {
  outer: number;
  zodiacInner: number;
  houseInner: number;
  aspectHub: number;
  signGlyph: number;
  houseNumber: number;
  axisLabel: number;
  /** Point pointer tick, drawn at the true longitude. */
  pointTickInner: number;
  pointTickOuter: number;
  /** Inner end of the connector from true longitude to displaced glyph. */
  connectorEnd: number;
  glyph: number;
  label: number;
  /** Radial drop applied to alternate labels when label boxes intersect. */
  labelTierDrop: number;
  /** Degree-tick lengths outward from the zodiac inner ring. */
  tickLenUnit: number;
  tickLenFive: number;
  tickLenTen: number;
}

export const DEFAULT_WHEEL_RADII: WheelRadii = {
  outer: 1.0,
  zodiacInner: 0.84,
  houseInner: 0.70,
  aspectHub: 0.50,
  signGlyph: 0.92,
  houseNumber: 0.77,
  axisLabel: 1.045,
  pointTickInner: 0.815,
  pointTickOuter: 0.84,
  connectorEnd: 0.71,
  glyph: 0.655,
  label: 0.585,
  labelTierDrop: 0.06,
  tickLenUnit: 0.016,
  tickLenFive: 0.028,
  tickLenTen: 0.035,
};

/** Font sizes in px. Defaults derive from `size` (see DEFAULT_FONT_FACTORS). */
export interface WheelFontSizes {
  signGlyph: number;
  pointGlyph: number;
  pointLabel: number;
  houseNumber: number;
  axisLabel: number;
}

/** Default font sizes as fractions of the square output size. */
export const DEFAULT_FONT_FACTORS: WheelFontSizes = {
  signGlyph: 0.045,
  pointGlyph: 0.05,
  pointLabel: 0.024,
  houseNumber: 0.026,
  axisLabel: 0.026,
};

const DEFAULT_SIGN_GLYPHS: readonly string[] = ["♈", "♉", "♊", "♋", "♌", "♍",
  "♎", "♏", "♐", "♑", "♒", "♓"];

export interface WheelLayoutOptions {
  /** Square output size in px. Default 520. */
  size?: number;
  /** Ring geometry overrides, as fractions of the outer radius. */
  radii?: Partial<WheelRadii>;
  /** Minimum angular separation between displayed points, degrees. Default 6.5. */
  minAngularSep?: number;
  /**
   * Orientation. "asc" puts the Ascendant at 9 o'clock and requires
   * `input.angles`; "aries0" puts 0° Aries at 9 o'clock. Default: "asc" when
   * angles are present, otherwise "aries0".
   */
  anchor?: "asc" | "aries0";
  /** Angular displacement (degrees) beyond which a connector is drawn. Default 0.75. */
  connectorThresholdDeg?: number;
  /** Deterministic text metrics. Default: DEFAULT_TEXT_METRICS. */
  metrics?: WheelTextMetrics;
  /** Font size overrides in px (defaults derive from `size`). */
  fontSizes?: Partial<WheelFontSizes>;
  /** Twelve zodiac glyph strings, Aries first. Default: Unicode signs. */
  signGlyphs?: readonly string[];
  /** Axis label strings. Default: AC / MC / DC / IC. */
  axisLabels?: { ac: string; mc: string; dc: string; ic: string };
}

// ---------------------------------------------------------------- output

/** A straight segment in output px coordinates. */
export interface WheelSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A measured, centrally anchored text box in output px coordinates. */
export interface WheelTextBox {
  /** Text anchor point (SVG textAnchor="middle", dominantBaseline="central"). */
  cx: number;
  cy: number;
  /** Measured box extent in px. */
  w: number;
  h: number;
  text: string;
  fontSize: number;
}

export interface WheelPointLayout {
  id: string;
  /** True ecliptic longitude, as supplied. */
  trueLon: number;
  /** Longitude actually used for the glyph and label after spreading. */
  displayLon: number;
  /** Pointer tick at the true longitude. */
  tick: WheelSegment;
  glyph: WheelTextBox;
  label?: WheelTextBox;
  /** Present when the point was displaced beyond the connector threshold. */
  connector?: WheelSegment;
}

/** A region whose text boxes still intersect after the bounded adjustment. */
export interface WheelCrowdedRegion {
  /** Ids of every point involved, in circular display order. */
  pointIds: string[];
  /** Which boxes intersect: glyphs, labels, or both. */
  kind: "glyph" | "label" | "mixed";
  /** Display-longitude arc covered by the region (start precedes end going counterclockwise). */
  startLon: number;
  endLon: number;
}

export interface ChartWheelLayout {
  size: number;
  center: { x: number; y: number };
  /** Outer wheel radius in px (the radii table is expressed against this). */
  outerRadius: number;
  /** Padded view box (axis labels sit outside the outer ring). */
  viewBox: { x: number; y: number; width: number; height: number };
  /** Concentric circles, outermost first. */
  rings: Array<{ id: "outer" | "zodiacInner" | "houseInner" | "aspectHub"; r: number }>;
  zodiac: {
    /** Twelve sign-boundary segments, Aries boundary first. */
    boundaries: Array<{ sign: number; lon: number; seg: WheelSegment }>;
    /** Twelve sign glyphs at mid-sign. */
    signGlyphs: Array<{ sign: number; lon: number; box: WheelTextBox }>;
    /** 360 degree ticks. */
    ticks: Array<{ lon: number; kind: "unit" | "five" | "ten"; seg: WheelSegment }>;
  };
  /** null when the input has no cusps (unknown time). */
  houses: {
    cusps: Array<{ house: number; lon: number; seg: WheelSegment }>;
    numbers: Array<{ house: number; lon: number; box: WheelTextBox }>;
  } | null;
  /** null when the input has no angles (unknown time). */
  axes: Array<{ id: "AC" | "MC" | "DC" | "IC"; lon: number; seg: WheelSegment; label: WheelTextBox }> | null;
  /** One entry per input point, input order preserved. */
  points: WheelPointLayout[];
  /** One chord per input aspect edge, input order preserved. */
  aspects: Array<{ a: string; b: string; family: string; tightness: number; seg: WheelSegment }>;
  /** Explicitly unresolved regions. Empty when every box is clear. */
  crowding: WheelCrowdedRegion[];
  /** The geometry that was actually applied. */
  applied: {
    anchor: "asc" | "aries0";
    /** Longitude placed at 9 o'clock. */
    anchorLon: number;
    size: number;
    radii: WheelRadii;
    minAngularSep: number;
    connectorThresholdDeg: number;
    fontSizes: WheelFontSizes;
    metrics: "default" | "custom";
  };
}

// ---------------------------------------------------------------- spreading

/**
 * Fan out display angles so no two bodies sit closer than minSep degrees,
 * preserving zodiacal order. Circular: cut at the largest gap, cluster
 * linearly, spread each cluster around its midpoint, merge clusters that
 * collide after spreading, repeat until stable.
 */
export function spreadAngles(lons: number[], minSep: number): number[] {
  const n = lons.length;
  if (n <= 1) return [...lons];
  // cannot fit at all: shrink separation to what the circle allows
  const sep = Math.min(minSep, 360 / n);

  const order = lons.map((lon, i) => ({ lon: mod(lon, 360), i }))
    .sort((a, b) => a.lon - b.lon);
  // rotate so the largest gap is between the last and first element
  let cut = 0;
  let biggest = -1;
  for (let k = 0; k < n; k++) {
    const gap = mod(order[(k + 1) % n].lon - order[k].lon, 360);
    if (gap > biggest) { biggest = gap; cut = (k + 1) % n; }
  }
  const seq = [...order.slice(cut), ...order.slice(0, cut)];
  // unwrap to a monotonic line starting at the first element
  const line = seq.map((e) => e.lon);
  for (let k = 1; k < n; k++) {
    while (line[k] < line[k - 1]) line[k] += 360;
  }

  // clusters as [start, end) index ranges; spread each evenly around the
  // midpoint of its true positions, merge clusters that collide, repeat
  const spread = (cl: { s: number; e: number }): number[] => {
    const m = cl.e - cl.s;
    const mid = (line[cl.s] + line[cl.e - 1]) / 2;
    return Array.from({ length: m }, (_, j) => mid + (j - (m - 1) / 2) * sep);
  };
  let clusters = line.map((_, k) => ({ s: k, e: k + 1 }));
  let positions = clusters.map(spread);
  for (let pass = 0; pass < n; pass++) {
    let merged = false;
    const nc: typeof clusters = [];
    const np: number[][] = [];
    for (let k = 0; k < clusters.length; k++) {
      const prev = np[np.length - 1];
      if (prev && positions[k][0] - prev[prev.length - 1] < sep - 1e-9) {
        nc[nc.length - 1].e = clusters[k].e;
        np[np.length - 1] = spread(nc[nc.length - 1]);
        merged = true;
      } else {
        nc.push({ ...clusters[k] });
        np.push(positions[k]);
      }
    }
    clusters = nc;
    positions = np;
    if (!merged) break;
  }

  const out = new Array<number>(n);
  clusters.forEach((cl, k) => {
    for (let j = cl.s; j < cl.e; j++) out[seq[j].i] = mod(positions[k][j - cl.s], 360);
  });
  return out;
}

// ---------------------------------------------------------------- kernel

export function layoutChartWheel(
  input: WheelLayoutInput,
  options: WheelLayoutOptions = {},
): ChartWheelLayout {
  // ---- validate input shape (throw, never degrade silently)
  const size = options.size ?? 520;
  if (!Number.isFinite(size) || size <= 0) {
    throw new RangeError(`layoutChartWheel: size must be a positive finite number, got ${size}`);
  }
  const minSep = options.minAngularSep ?? 6.5;
  if (!Number.isFinite(minSep) || minSep <= 0) {
    throw new RangeError(`layoutChartWheel: minAngularSep must be positive, got ${minSep}`);
  }
  const connThreshold = options.connectorThresholdDeg ?? 0.75;
  if (!Number.isFinite(connThreshold) || connThreshold < 0) {
    throw new RangeError(
      `layoutChartWheel: connectorThresholdDeg must be non-negative, got ${connThreshold}`);
  }

  const seen = new Set<string>();
  for (const p of input.points) {
    if (typeof p.id !== "string" || p.id === "") {
      throw new TypeError("layoutChartWheel: every point needs a non-empty string id");
    }
    if (seen.has(p.id)) {
      throw new TypeError(`layoutChartWheel: duplicate point id "${p.id}"`);
    }
    seen.add(p.id);
    if (!Number.isFinite(p.lon)) {
      throw new RangeError(`layoutChartWheel: point "${p.id}" has non-finite lon ${p.lon}`);
    }
  }
  for (const a of input.aspects) {
    if (!seen.has(a.a) || !seen.has(a.b)) {
      throw new TypeError(
        `layoutChartWheel: aspect ${a.a}-${a.family}-${a.b} references a point not in input.points`);
    }
    if (!Number.isFinite(a.tightness)) {
      throw new RangeError(
        `layoutChartWheel: aspect ${a.a}-${a.family}-${a.b} has non-finite tightness`);
    }
  }
  if (input.angles !== undefined
    && (!Number.isFinite(input.angles.asc) || !Number.isFinite(input.angles.mc))) {
    throw new RangeError("layoutChartWheel: angles.asc and angles.mc must be finite");
  }
  if (input.cusps !== undefined
    && (input.cusps.length !== 12 || input.cusps.some((c) => !Number.isFinite(c)))) {
    throw new TypeError("layoutChartWheel: cusps must be twelve finite longitudes");
  }

  const anchor = options.anchor ?? (input.angles ? "asc" : "aries0");
  if (anchor === "asc" && input.angles === undefined) {
    throw new TypeError(
      'layoutChartWheel: anchor "asc" requires input.angles (unknown time anchors on "aries0")');
  }
  const signGlyphs = options.signGlyphs ?? DEFAULT_SIGN_GLYPHS;
  if (signGlyphs.length !== 12) {
    throw new TypeError("layoutChartWheel: signGlyphs must contain twelve entries");
  }
  const axisLabels = options.axisLabels ?? { ac: "AC", mc: "MC", dc: "DC", ic: "IC" };

  const radii: WheelRadii = { ...DEFAULT_WHEEL_RADII, ...options.radii };
  for (const [k, v] of Object.entries(radii)) {
    if (!Number.isFinite(v)) throw new RangeError(`layoutChartWheel: radii.${k} must be finite`);
  }
  const fontSizes: WheelFontSizes = {
    signGlyph: options.fontSizes?.signGlyph ?? size * DEFAULT_FONT_FACTORS.signGlyph,
    pointGlyph: options.fontSizes?.pointGlyph ?? size * DEFAULT_FONT_FACTORS.pointGlyph,
    pointLabel: options.fontSizes?.pointLabel ?? size * DEFAULT_FONT_FACTORS.pointLabel,
    houseNumber: options.fontSizes?.houseNumber ?? size * DEFAULT_FONT_FACTORS.houseNumber,
    axisLabel: options.fontSizes?.axisLabel ?? size * DEFAULT_FONT_FACTORS.axisLabel,
  };
  const metrics = options.metrics ?? DEFAULT_TEXT_METRICS;

  // ---- shared geometry helpers (identical math to the historical renderer)
  const anchorLon = anchor === "asc" ? input.angles!.asc : 0;
  const c = size / 2;
  const R = (size / 2) * 0.96;
  const pad = size * 0.07;

  const pt = (lon: number, r: number): [number, number] => {
    const a = ((lon - anchorLon + 180) * Math.PI) / 180;
    return [c + r * R * Math.cos(a), c - r * R * Math.sin(a)];
  };
  const fix = (v: number): number => {
    if (!Number.isFinite(v)) {
      throw new RangeError("layoutChartWheel: computed a non-finite coordinate (check metrics and radii)");
    }
    return Math.round(v * 100) / 100;
  };
  const seg = (lon: number, r0: number, r1: number): WheelSegment => {
    const [x1, y1] = pt(lon, r0);
    const [x2, y2] = pt(lon, r1);
    return { x1: fix(x1), y1: fix(y1), x2: fix(x2), y2: fix(y2) };
  };
  const textBox = (lon: number, r: number, text: string, fontSize: number): WheelTextBox => {
    const [x, y] = pt(lon, r);
    return {
      cx: fix(x), cy: fix(y),
      w: fix(metrics.width(text, fontSize)), h: fix(metrics.height(fontSize)),
      text, fontSize,
    };
  };

  // ---- rings
  const rings: ChartWheelLayout["rings"] = [
    { id: "outer", r: fix(radii.outer * R) },
    { id: "zodiacInner", r: fix(radii.zodiacInner * R) },
    { id: "houseInner", r: fix(radii.houseInner * R) },
    { id: "aspectHub", r: fix(radii.aspectHub * R) },
  ];

  // ---- zodiac: boundaries, glyphs, ticks
  const boundaries = Array.from({ length: 12 }, (_, s) => ({
    sign: s, lon: s * 30, seg: seg(s * 30, radii.zodiacInner, radii.outer),
  }));
  const zodiacGlyphs = Array.from({ length: 12 }, (_, s) => ({
    sign: s, lon: s * 30 + 15,
    box: textBox(s * 30 + 15, radii.signGlyph, signGlyphs[s], fontSizes.signGlyph),
  }));
  const ticks = Array.from({ length: 360 }, (_, d) => {
    const kind = d % 10 === 0 ? "ten" as const : d % 5 === 0 ? "five" as const : "unit" as const;
    const len = kind === "ten" ? radii.tickLenTen
      : kind === "five" ? radii.tickLenFive : radii.tickLenUnit;
    return { lon: d, kind, seg: seg(d, radii.zodiacInner, radii.zodiacInner + len) };
  });

  // ---- houses (optional)
  let houses: ChartWheelLayout["houses"] = null;
  if (input.cusps !== undefined) {
    const cusps = input.cusps;
    houses = {
      cusps: cusps.map((lon, i) => ({
        house: i + 1, lon, seg: seg(lon, radii.aspectHub, radii.zodiacInner),
      })),
      numbers: cusps.map((lon, i) => {
        const arc = mod(cusps[(i + 1) % 12] - lon, 360);
        const at = lon + arc / 2;
        return {
          house: i + 1, lon: at,
          box: textBox(at, radii.houseNumber, String(i + 1), fontSizes.houseNumber),
        };
      }),
    };
  }

  // ---- axes (optional)
  let axes: ChartWheelLayout["axes"] = null;
  if (input.angles !== undefined) {
    const { asc, mc } = input.angles;
    const list: Array<[number, "AC" | "MC" | "DC" | "IC"]> = [
      [asc, "AC"], [mc, "MC"], [mod(asc + 180, 360), "DC"], [mod(mc + 180, 360), "IC"],
    ];
    axes = list.map(([lon, id]) => ({
      id, lon,
      seg: seg(lon, radii.aspectHub, radii.outer),
      label: textBox(lon, radii.axisLabel, axisLabels[id.toLowerCase() as "ac" | "mc" | "dc" | "ic"], fontSizes.axisLabel),
    }));
  }

  // ---- points: spread, boxes, connectors
  const trueLons = input.points.map((p) => p.lon);
  const dispLons = spreadAngles(trueLons, minSep);

  const points: WheelPointLayout[] = input.points.map((p, i) => {
    const disp = dispLons[i];
    const entry: WheelPointLayout = {
      id: p.id,
      trueLon: p.lon,
      displayLon: disp,
      tick: seg(p.lon, radii.pointTickInner, radii.pointTickOuter),
      glyph: textBox(disp, radii.glyph, p.glyph, fontSizes.pointGlyph),
    };
    if (p.label !== undefined) {
      entry.label = textBox(disp, radii.label, p.label, fontSizes.pointLabel);
    }
    if (Math.abs(mod(disp - p.lon + 180, 360) - 180) > connThreshold) {
      const [x1, y1] = pt(p.lon, radii.pointTickInner);
      const [x2, y2] = pt(disp, radii.connectorEnd);
      entry.connector = { x1: fix(x1), y1: fix(y1), x2: fix(x2), y2: fix(y2) };
    }
    return entry;
  });

  // ---- collision pass: detect, apply one bounded label tier, report the rest
  const overlaps = (a: WheelTextBox, b: WheelTextBox): boolean =>
    Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2;

  /** Indices of `points` in circular display order (cut at the largest gap). */
  const circularOrder = (indices: number[]): number[] => {
    const entries = indices.map((i) => ({ i, lon: mod(points[i].displayLon, 360) }))
      .sort((x, y) => x.lon - y.lon);
    let cut = 0;
    let biggest = -1;
    for (let k = 0; k < entries.length; k++) {
      const gap = mod(entries[(k + 1) % entries.length].lon - entries[k].lon, 360);
      if (gap > biggest) { biggest = gap; cut = (k + 1) % entries.length; }
    }
    return [...entries.slice(cut), ...entries.slice(0, cut)].map((e) => e.i);
  };

  /** Connected components over an overlap relation, keyed by point index. */
  const components = (pairs: Array<[number, number]>): number[][] => {
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r)!;
      let cur = x;
      while (parent.get(cur) !== cur) { const nxt = parent.get(cur)!; parent.set(cur, r); cur = nxt; }
      return r;
    };
    for (const [x, y] of pairs) {
      if (!parent.has(x)) parent.set(x, x);
      if (!parent.has(y)) parent.set(y, y);
      const rx = find(x);
      const ry = find(y);
      if (rx !== ry) parent.set(Math.max(rx, ry), Math.min(rx, ry));
    }
    const groups = new Map<number, number[]>();
    for (const x of [...parent.keys()].sort((p, q) => p - q)) {
      const r = find(x);
      const g = groups.get(r) ?? [];
      g.push(x);
      groups.set(r, g);
    }
    return [...groups.values()];
  };

  // one bounded adjustment: within each cluster of intersecting labels, every
  // second label (in circular order) drops to an inner tier
  {
    const labelPairs: Array<[number, number]> = [];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const la = points[i].label;
        const lb = points[j].label;
        if (la && lb && overlaps(la, lb)) labelPairs.push([i, j]);
      }
    }
    for (const cluster of components(labelPairs)) {
      const ordered = circularOrder(cluster);
      ordered.forEach((pi, k) => {
        if (k % 2 === 1) {
          const p = points[pi];
          p.label = textBox(p.displayLon, radii.label - radii.labelTierDrop,
            p.label!.text, p.label!.fontSize);
        }
      });
    }
  }

  // report whatever still intersects, per connected region
  const crowding: WheelCrowdedRegion[] = [];
  {
    const pairs: Array<[number, number]> = [];
    const kinds = new Map<string, { glyph: boolean; label: boolean }>();
    const note = (i: number, j: number, kind: "glyph" | "label" | "mixed") => {
      pairs.push([i, j]);
      const key = [Math.min(i, j), Math.max(i, j)].join("-");
      const k = kinds.get(key) ?? { glyph: false, label: false };
      if (kind === "glyph" || kind === "mixed") k.glyph = true;
      if (kind === "label" || kind === "mixed") k.label = true;
      kinds.set(key, k);
    };
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i];
        const b = points[j];
        if (overlaps(a.glyph, b.glyph)) note(i, j, "glyph");
        if (a.label && b.label && overlaps(a.label, b.label)) note(i, j, "label");
        // a point's own glyph and label are one radial unit; only cross-point
        // glyph-label intersections count
        if (a.glyph && b.label && overlaps(a.glyph, b.label)) note(i, j, "mixed");
        if (b.glyph && a.label && overlaps(b.glyph, a.label)) note(i, j, "mixed");
      }
    }
    for (const cluster of components(pairs)) {
      const ordered = circularOrder(cluster);
      let hasGlyph = false;
      let hasLabel = false;
      for (const [key, k] of kinds) {
        const [i, j] = key.split("-").map(Number);
        if (cluster.includes(i) && cluster.includes(j)) {
          hasGlyph = hasGlyph || k.glyph;
          hasLabel = hasLabel || k.label;
        }
      }
      crowding.push({
        pointIds: ordered.map((i) => points[i].id),
        kind: hasGlyph && hasLabel ? "mixed" : hasGlyph ? "glyph" : "label",
        startLon: mod(points[ordered[0]].displayLon, 360),
        endLon: mod(points[ordered[ordered.length - 1]].displayLon, 360),
      });
    }
  }

  // ---- aspect chords at the hub, endpoints at true longitudes
  const byId = new Map(input.points.map((p) => [p.id, p]));
  const aspects = input.aspects.map((a) => {
    const [x1, y1] = pt(byId.get(a.a)!.lon, radii.aspectHub);
    const [x2, y2] = pt(byId.get(a.b)!.lon, radii.aspectHub);
    return {
      a: a.a, b: a.b, family: a.family, tightness: a.tightness,
      seg: { x1: fix(x1), y1: fix(y1), x2: fix(x2), y2: fix(y2) },
    };
  });

  return {
    size,
    center: { x: c, y: c },
    outerRadius: R,
    viewBox: { x: -pad, y: -pad, width: size + 2 * pad, height: size + 2 * pad },
    rings,
    zodiac: { boundaries, signGlyphs: zodiacGlyphs, ticks },
    houses,
    axes,
    points,
    aspects,
    crowding,
    applied: {
      anchor,
      anchorLon,
      size,
      radii,
      minAngularSep: minSep,
      connectorThresholdDeg: connThreshold,
      fontSizes,
      metrics: options.metrics ? "custom" : "default",
    },
  };
}
