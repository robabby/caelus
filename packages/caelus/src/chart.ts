/** astroengine chart -- public API: natal charts, aspects, retrogrades. */
import {
  DEG, mod, jdTT, julianDay, EngineData, ChebSeries,
  planetApparent, sunApparent, moonApparentSeries, moonApparentPrecise,
  plutoApparent, chironApparent, meanNode, trueNodeSeries, trueNodePrecise,
  equatorial, ayanamsa, AYANAMSA_J2000, meanLilith, topocentricEcl,
  oscApogeePrecise, oscApogeeSeries, KeplerOrbit, XyzSource,
  trueObliquity, nutation, plutoHeliocentric, vsopHeliocentric, precessEcliptic,
  J2000,
} from "./core.js";
import { starApparent } from "./stars.js";
import type { SyntheticRender } from "./synthetic.js";
import { hermeticLots, HERMETIC_LOTS } from "./lots.js";
import * as H from "./houses.js";
import type { AspectPhase } from "./electional.js"; // type-only: no runtime cycle

const TWO_PI = 2 * Math.PI;

export const BODIES = [
  "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn",
  "uranus", "neptune", "pluto", "chiron", "mean_node", "true_node",
] as const;
export type Body = (typeof BODIES)[number];

/** Computable on request (not in the default chart set). */
export const EXTRA_BODIES = ["mean_lilith", "true_lilith"] as const;

/** Core names keep autocomplete; any string id is accepted (data packs). */
export type BodyId = Body | (typeof EXTRA_BODIES)[number] | (string & {});

/** Points: excluded from aspect search by default. */
export const NOT_ASPECTABLE = new Set([
  "mean_node", "true_node", "mean_lilith", "true_lilith",
]);

export const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra",
  "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

export const ASPECTS: Record<string, number> = {
  conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180,
};
export const DEFAULT_ORBS: Record<string, number> = {
  conjunction: 8, sextile: 4, square: 7, trine: 7, opposition: 8,
};

export type HouseSystem =
  | "placidus" | "porphyry" | "equal" | "whole_sign"
  | "koch" | "regiomontanus" | "campanus" | "alcabitius"
  | "morinus" | "meridian" | "polich_page" | "vehlow";

/** The canonical house-system ids, in a stable order (also used for error text). */
export const HOUSE_SYSTEMS: readonly HouseSystem[] = [
  "placidus", "porphyry", "equal", "whole_sign", "koch", "regiomontanus",
  "campanus", "alcabitius", "morinus", "meridian", "polich_page", "vehlow",
];

// Short or alternate names that normalization (lowercase + space/hyphen -> "_")
// can't reach on its own. "whole sign", "Polich Page", etc. already normalize to
// their canonical id, so only genuinely different spellings live here.
const HOUSE_ALIASES: Record<string, HouseSystem> = {
  whole: "whole_sign", signs: "whole_sign", wholesign: "whole_sign",
  equal_house: "equal", porphyrius: "porphyry", placidean: "placidus",
};

/** Resolve a forgiving house-system string (any case, spaces or hyphens, or a
 *  known alias) to a canonical {@link HouseSystem}, or throw listing the valid
 *  ids. Lets MCP, share links, and hand-written calls pass "whole sign",
 *  "Whole_Sign", "whole", etc. without tripping the strict union. */
export function normalizeHouseSystem(raw: string): HouseSystem {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((HOUSE_SYSTEMS as readonly string[]).includes(key)) return key as HouseSystem;
  const alias = HOUSE_ALIASES[key];
  if (alias) return alias;
  throw new Error(`unknown house system '${raw}' (valid: ${HOUSE_SYSTEMS.join(", ")})`);
}

// ----------------------------------------------------------- sign helpers
export type Element = "fire" | "earth" | "air" | "water";
export type Modality = "cardinal" | "fixed" | "mutable";
const ELEMENTS: readonly Element[] = ["fire", "earth", "air", "water"];
const MODALITIES: readonly Modality[] = ["cardinal", "fixed", "mutable"];

/** Sign index `0`–`11` (Aries = 0) from an index or a sign name (`"Aries"`). */
function signIndex(sign: number | string): number {
  return typeof sign === "number" ? mod(Math.floor(sign), 12) : SIGNS.indexOf(sign);
}

/** Triplicity (element) of a sign: `"fire"`, `"earth"`, `"air"`, or `"water"`. */
export function element(sign: number | string): Element {
  return ELEMENTS[mod(signIndex(sign), 4)];
}
/** Quadruplicity (modality) of a sign: `"cardinal"`, `"fixed"`, or `"mutable"`. */
export function modality(sign: number | string): Modality {
  return MODALITIES[mod(signIndex(sign), 3)];
}
/** 1-based quadrant (I–IV) of a 1-based house number: houses 1–3 -> 1, etc. */
export function quadrant(house: number): number {
  return Math.floor(mod(house - 1, 12) / 3) + 1;
}

// ----------------------------------------------------------- essential dignities
export const DOMICILE: Record<string, number[]> = {
  sun: [4], moon: [3], mercury: [2, 5], venus: [1, 6],
  mars: [0, 7], jupiter: [8, 11], saturn: [9, 10],
};
export const EXALTATION: Record<string, number> = {
  sun: 0, moon: 1, mercury: 5, venus: 11, mars: 9, jupiter: 3, saturn: 6,
};

/**
 * Essential dignities a body holds in a sign: any of `"domicile"`,
 * `"exaltation"`, `"detriment"`, `"fall"` (the last two are the signs opposite
 * domicile and exaltation). Empty when the body is peregrine there or has no
 * classical rulership (the outer planets, Chiron, the nodes).
 *
 * @param body Body id, e.g. `"mars"`.
 * @param sign A sign index `0`–`11` (Aries = 0) or its name, e.g. `"Aries"`.
 * @returns The dignities held, in the order above; empty if none.
 * @example
 * ```ts
 * dignities("mars", "Aries"); // ["domicile"]
 * dignities("sun", "Libra");  // ["fall"]
 * ```
 */
export function dignities(body: string, sign: number | string): string[] {
  const idx = signIndex(sign);
  const dom = DOMICILE[body] ?? [];
  const out: string[] = [];
  if (dom.includes(idx)) out.push("domicile");
  if (EXALTATION[body] === idx) out.push("exaltation");
  if (dom.map((d) => mod(d + 6, 12)).includes(idx)) out.push("detriment");
  if (body in EXALTATION && mod(EXALTATION[body] + 6, 12) === idx) out.push("fall");
  return out;
}

export type Ayanamsa = keyof typeof AYANAMSA_J2000 & string;
export type Zodiac = "tropical" | `sidereal:${string}`;

export interface Observer { lat: number; lonEast: number; altM?: number }

/** Options shared by the single-body calls ({@link Engine.position},
 *  {@link Engine.longitude}) and by charts. */
export interface CalcOptions {
  /** Tropical (the default) or a sidereal ayanamsa, e.g. `"sidereal:lahiri"`. */
  zodiac?: Zodiac;
  /** Apply topocentric parallax for `observer`. Defaults to `false`. */
  topocentric?: boolean;
  /** Observer location; required when `topocentric` is set. */
  observer?: Observer;
}

/** Options for {@link Engine.chart} and {@link Engine.chartAt}, extending
 *  {@link CalcOptions}. */
export interface ChartOptions extends CalcOptions {
  /** House system to compute. Defaults to `"placidus"`. */
  houseSystem?: HouseSystem;
  /** Extra bodies to compute beyond the core chart set. */
  bodies?: BodyId[];
  /** Per-aspect orb overrides in degrees, keyed by aspect name. */
  orbs?: Record<string, number>;
}

/** A body's full apparent position, as returned by {@link Engine.position}. */
export interface Position {
  /** Ecliptic longitude in degrees, `[0, 360)`. */
  lon: number;
  /** Daily motion in longitude, degrees/day; negative when retrograde. */
  speed: number;
  /** Whether the body is in apparent retrograde motion (`speed < 0`). */
  retrograde: boolean;
  /** Zodiac sign containing `lon`, e.g. `"Leo"`. */
  sign: string;
  /** Longitude within the sign, degrees `[0, 30)`. */
  signDeg: number;
  /** Ecliptic latitude, deg (0 for nodes). */
  lat: number;
  /** Geocentric distance in AU (Moon included); null for nodes and Lilith. */
  dist: number | null;
  /** Equatorial right ascension, true equinox of date, degrees. */
  ra: number;
  /** Equatorial declination, true equinox of date, degrees. */
  dec: number;
}

/** A {@link Position} enriched with chart-relative placement, as returned per
 *  body by {@link Engine.chart} and {@link Engine.chartAt}. */
export interface ChartBody extends Position {
  /** 1-based house the body falls in, by the chart's cusps (1–12). */
  house: number;
  /** Essential dignities held in the body's sign (see {@link dignities});
   *  empty when peregrine or for bodies without classical rulerships. */
  dignities: string[];
}

/** Default chart bodies that are Chebyshev-packed, so they can fall outside
 *  their fitted range (and be omitted from a chart). Opt-in asteroids are
 *  packed too, but arrive as arbitrary ids through the string index. */
export type PackedBody = "chiron";

/** Bodies guaranteed to be in every chart: the analytic Sun–Pluto and the lunar
 *  nodes, which resolve across all supported epochs. (Chiron is Chebyshev-packed
 *  and can fall outside its fitted range, so it is *not* guaranteed.) */
export type AlwaysBody = Exclude<Body, PackedBody>;

/**
 * A chart's bodies, keyed by id. The analytic core ({@link AlwaysBody}) is
 * always present and needs no presence check. {@link PackedBody} bodies (Chiron)
 * and any opt-in extras requested via {@link ChartOptions.bodies} may be absent
 * when the instant is outside their fitted range (see {@link Chart.unavailable}),
 * so those accesses are typed `ChartBody | undefined` and must be guarded.
 */
export type ChartBodies =
  & Record<AlwaysBody, ChartBody>
  & Partial<Record<PackedBody, ChartBody>>
  & { [id: string]: ChartBody | undefined };

/** One aspect between two bodies in a {@link Chart}. */
export interface Aspect {
  /** First body id. */
  a: string;
  /** Second body id. */
  b: string;
  /** Aspect name, e.g. `"trine"`. */
  aspect: string;
  /** Orb from exact, in degrees. */
  orb: number;
  /** Applying, separating, or exact -- from the two bodies' longitude speeds. */
  phase: AspectPhase;
  /** Closeness in `[0, 1]`: `1` exact, `0` at the orb limit. */
  strength: number;
}

/** A full natal chart, as returned by {@link Engine.chart} and
 *  {@link Engine.chartAt}. Longitudes are degrees in the chart's `zodiac`. */
export interface Chart {
  /** The instant, as a Julian Day (UT). */
  jdUt: number;
  /** The zodiac the longitudes are expressed in. */
  zodiac: Zodiac;
  /** House system actually used. May differ from the request: Placidus and
   *  Koch are undefined above the polar circles and fall back to whole_sign. */
  houseSystem: HouseSystem;
  /** The house system originally requested, before any polar fallback. */
  houseSystemRequested: HouseSystem;
  /** Apparent position per body, enriched with house and dignities, keyed by
   *  body id. See {@link ChartBody}. */
  bodies: ChartBodies;
  /** Body ids that were requested but omitted because the instant falls outside
   *  their fitted range (e.g. Chiron and other Chebyshev-packed bodies before
   *  ~1850 or after ~2150). Empty for the usual modern dates. The analytic
   *  bodies (Sun through Pluto and the nodes) are always present. */
  unavailable: string[];
  /** Chart angles in degrees: Ascendant, Midheaven, Vertex, East Point. */
  angles: { asc: number; mc: number; vertex: number; eastPoint: number };
  /** The twelve house cusp longitudes in degrees, house 1 first. */
  cusps: number[];
  /** Aspects found among the bodies, within the active orbs. */
  aspects: Aspect[];
}

const KM_PER_AU = 149597870.7;

// A generous window for the analytic models. Every real chart, however
// historical, sits well inside it; an instant far outside almost always means a
// Julian Day was passed to chart() where calendar fields belong.
const JD_SANE_MIN = -2_000_000; // ~ 10000 BC
const JD_SANE_MAX = 9_000_000; // ~ 20000 AD

function parseZodiac(zodiac: Zodiac): string | null {
  if (zodiac === "tropical") return null;
  if (zodiac.startsWith("sidereal:")) {
    const mode = zodiac.slice("sidereal:".length);
    if (AYANAMSA_J2000[mode] !== undefined || STAR_AYANAMSAS[mode]) return mode;
  }
  throw new Error(`unknown zodiac ${JSON.stringify(zodiac)}`);
}

/** Star-anchored ayanamsas: the named star sits at the fixed sidereal
 *  longitude by definition (Galactic Center at 0 Sagittarius; Spica at
 *  0 Libra "citra"). Need the fixed-star catalog loaded. */
const STAR_AYANAMSAS: Record<string, [string, number]> = {
  galcent_0sag: ["Galactic Center", 240.0],
  true_citra: ["Spica", 180.0],
};

const VSOP_BODIES = new Set([
  "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune",
]);

export class Engine {
  readonly data: EngineData;
  private moonCheb: ChebSeries | null;
  private chironCheb: ChebSeries | null;

  private packs = new Map<string, XyzSource>();
  private runtimeSources = new Map<string, XyzSource>();
  private renderAttrs = new Map<string, SyntheticRender>();

  constructor(data: EngineData) {
    this.data = data;
    this.moonCheb = data.moonCheb ? new ChebSeries(data.moonCheb) : null;
    this.chironCheb = data.chiron ? new ChebSeries(data.chiron) : null;
  }

  /**
   * Register a runtime {@link XyzSource} under a body id, so it resolves through
   * {@link Engine.position}, {@link Engine.longitude}, {@link Engine.chartAt},
   * and everything built on them (transits, returns, retrograde, SkyView) with
   * no special-casing — exactly like a baked-in Chebyshev or Kepler pack. The
   * source yields heliocentric ecliptic-J2000 xyz in AU at a **TT** Julian Day,
   * the same contract Chiron and the Uranian bodies satisfy; the engine applies
   * light-time, aberration, precession and nutation to it like any real body.
   *
   * This is the seam the `synthetic` module plugs imaginary bodies into (see
   * {@link registerSyntheticSystem}). A registered id shadows a baked-in pack of
   * the same name and persists for the engine's lifetime.
   *
   * @param id The body id to register (any string).
   * @param source A heliocentric xyz source; see {@link XyzSource}.
   * @returns This engine, for chaining.
   */
  registerSource(id: string, source: XyzSource): this {
    this.runtimeSources.set(id, source);
    this.packs.set(id, source);
    return this;
  }

  /** Author how a runtime body should look in SkyView (size, magnitude, colour).
   *  Position still comes from {@link registerSource}; this owns appearance only. */
  registerRender(id: string, render: SyntheticRender): this {
    this.renderAttrs.set(id, render);
    return this;
  }

  /** SkyView appearance for a registered body, if any. */
  renderFor(id: string): SyntheticRender | undefined {
    return this.renderAttrs.get(id);
  }

  /** Whether `body` resolves through the generic packed-source path: a baked-in
   *  Chebyshev/Kepler pack or a runtime source from {@link registerSource}. */
  private hasPack(body: string): boolean {
    return !!(this.data.chebPacks?.[body] || this.data.keplerPack?.bodies[body])
      || this.runtimeSources.has(body);
  }

  private pack(body: string): XyzSource {
    let s = this.packs.get(body);
    if (!s) {
      const raw = this.data.chebPacks?.[body];
      const kp = this.data.keplerPack;
      if (raw) s = new ChebSeries(raw);
      else if (kp?.bodies[body]) s = new KeplerOrbit(kp.bodies[body], kp.epoch);
      else throw new Error(`no data loaded for body '${body}'`);
      this.packs.set(body, s);
    }
    return s;
  }

  private moonInRange(jde: number): boolean {
    return !!this.moonCheb
      && this.moonCheb.jd0 <= jde - 0.1 && jde + 0.1 <= this.moonCheb.jd1;
  }

  /**
   * The body ids this engine can compute, given the data pack it was
   * constructed with. The core set is always present; extra asteroids and
   * hypotheticals appear only when their Chebyshev or Kepler packs are loaded.
   *
   * @returns Body ids accepted by {@link Engine.position},
   *   {@link Engine.longitude}, and {@link Engine.chart}.
   * @example
   * ```ts
   * engine.bodies().includes("ceres"); // true only if the Ceres pack is loaded
   * ```
   */
  bodies(): BodyId[] {
    return [
      ...[...BODIES, ...EXTRA_BODIES].filter((b) => b !== "chiron" || this.chironCheb),
      ...Object.keys(this.data.chebPacks ?? {}),
      ...Object.keys(this.data.keplerPack?.bodies ?? {}),
      ...this.runtimeSources.keys(),
    ];
  }

  /**
   * Low-level apparent geocentric ecliptic coordinates at a **TT** Julian Day,
   * in **radians**. This is the engine's internal building block for the events
   * module; it takes TT (not UT) and does no zodiac shift. Most callers want
   * {@link Engine.position} (full Position in degrees) or
   * {@link Engine.longitude} (longitude in degrees) instead.
   *
   * @param body A body id from {@link Engine.bodies}.
   * @param jde Julian Day in **TT** (Terrestrial Time), e.g. `jdTT(jdUt)`.
   * @returns `[lon, lat, dist]` — longitude and latitude in **radians** (true
   *   equinox of date), distance in AU, or `null` distance for nodes and
   *   Lilith points.
   * @throws Error if no data is loaded for `body`.
   */
  ecliptic(body: BodyId, jde: number): [number, number, number | null] {
    if (body === "sun") return sunApparent(this.data, jde);
    if (body === "moon") {
      const [lon, lat, km] = this.moonInRange(jde)
        ? moonApparentPrecise(this.data, this.moonCheb!, jde)
        : moonApparentSeries(this.data, jde);
      return [lon, lat, km / KM_PER_AU];
    }
    // Pluto: a wide-range Chebyshev pack when one is loaded (same heliocentric
    // pipeline as Chiron, via the generic packed-body path below), else the
    // Meeus ch.37 series (valid 1885-2099, accuracy degrades outside).
    if (body === "pluto" && !this.data.chebPacks?.pluto) return plutoApparent(this.data, jde);
    if (body === "chiron") {
      if (!this.chironCheb) throw new Error("chiron data not loaded");
      return chironApparent(this.data, this.chironCheb, jde);
    }
    if (body === "mean_node") return [meanNode(this.data, jde), 0.0, null];
    if (body === "true_node") {
      return [
        this.moonInRange(jde)
          ? trueNodePrecise(this.data, this.moonCheb!, jde)
          : trueNodeSeries(this.data, jde),
        0.0, null,
      ];
    }
    if (body === "mean_lilith") {
      const [lon, lat] = meanLilith(this.data, jde);
      return [lon, lat, null];
    }
    if (body === "true_lilith") {
      const [lon, lat, km] = this.moonInRange(jde)
        ? oscApogeePrecise(this.data, this.moonCheb!, jde)
        : oscApogeeSeries(this.data, jde);
      return [lon, lat, km / KM_PER_AU];
    }
    if (this.hasPack(body)) {
      // same heliocentric pipeline as Chiron (Chebyshev, Kepler, or a runtime
      // source registered via registerSource — e.g. a synthetic body)
      return chironApparent(this.data, this.pack(body), jde);
    }
    if (this.data.vsop[body]) return planetApparent(this.data, body, jde);
    throw new Error(`no data loaded for body '${body}'`);
  }

  /** Degrees to subtract from a true-equinox tropical longitude. */
  private ayanShift(jde: number, mode: string): number {
    const star = STAR_AYANAMSAS[mode];
    if (star) {
      const s = this.data.fixedStars?.stars[star[0]];
      if (!s) throw new Error(`zodiac 'sidereal:${mode}' needs the fixed-star catalog loaded`);
      const [lon] = starApparent(this.data, s, jde);
      return mod(lon / DEG - star[1], 360);
    }
    return mod(nutation(this.data, jde)[0] / DEG + ayanamsa(jde, mode), 360);
  }

  /**
   * Apparent place of a catalog fixed star at a Julian Day (UT). Requires the
   * fixed-star catalog to be present in the data pack; see
   * {@link Engine.starNames} for the available names.
   *
   * @param name Catalog star name, e.g. `"Regulus"` (see
   *   {@link Engine.starNames}).
   * @param jdUt Julian Day in UT.
   * @param opts Calculation options; only `zodiac` is meaningful here (tropical
   *   by default, or a sidereal ayanamsa).
   * @returns Ecliptic `lon`/`lat`, equatorial `ra`/`dec` (all degrees), the
   *   zodiac `sign` and `signDeg`, and the star's visual magnitude `mag`.
   * @throws Error if `name` is not in the loaded catalog.
   * @example
   * ```ts
   * const regulus = engine.fixedStar("Regulus", julianDay(2025, 1, 1));
   * regulus.sign;  // e.g. "Leo"
   * regulus.mag;   // apparent magnitude
   * ```
   */
  fixedStar(name: string, jdUt: number, opts: CalcOptions = {}): {
    lon: number; lat: number; ra: number; dec: number; mag: number;
    sign: string; signDeg: number;
  } {
    const s = this.data.fixedStars?.stars[name];
    if (!s) throw new Error(`no fixed-star catalog entry for '${name}'`);
    const mode = parseZodiac(opts.zodiac ?? "tropical");
    const jde = jdTT(jdUt);
    const [lonR, latR] = starApparent(this.data, s, jde);
    const [ra, dec] = equatorial(lonR, latR, trueObliquity(this.data, jde));
    let lon = lonR / DEG;
    if (mode !== null) lon = mod(lon - this.ayanShift(jde, mode), 360);
    return {
      lon, lat: latR / DEG, ra: ra / DEG, dec: dec / DEG, mag: s.mag,
      sign: SIGNS[Math.floor(lon / 30)], signDeg: mod(lon, 30),
    };
  }

  /**
   * The names in the loaded fixed-star catalog, sorted. Empty if no catalog is
   * present in the data pack. Pass any of these to {@link Engine.fixedStar}.
   *
   * @returns Sorted catalog star names.
   */
  starNames(): string[] {
    return Object.keys(this.data.fixedStars?.stars ?? {}).sort();
  }

  /**
   * Fixed-star conjunctions in a chart: each body within `orb` of a catalog
   * star, in the chart's own zodiac. Feed the result to
   * {@link interpretationContext} as `stars` to project `star` fact atoms (the
   * Chart itself carries no star catalog).
   *
   * @param chart A chart from {@link Engine.chart} / {@link Engine.chartAt}.
   * @param opts `orb` (default 1°); `stars` to restrict to named stars (then no
   *   magnitude filter); else `maxMag` keeps only stars brighter than it
   *   (default 2.5) so obscure catalog entries do not flood the result.
   * @returns Conjunctions sorted by increasing orb.
   */
  starConjunctions(
    chart: Chart,
    opts: { orb?: number; maxMag?: number; stars?: string[] } = {},
  ): { body: string; star: string; orb: number }[] {
    const catalog = this.data.fixedStars?.stars;
    if (!catalog) return [];
    const orbLimit = opts.orb ?? 1.0;
    const names = opts.stars ?? Object.keys(catalog);
    const useMag = opts.stars === undefined;
    const maxMag = opts.maxMag ?? 2.5;
    const out: { body: string; star: string; orb: number }[] = [];
    for (const name of names) {
      const s = catalog[name];
      if (!s || (useMag && s.mag > maxMag)) continue;
      const starLon = this.fixedStar(name, chart.jdUt, { zodiac: chart.zodiac }).lon;
      for (const [body, p] of Object.entries(chart.bodies)) {
        if (!p) continue;
        const sep = Math.abs(mod(p.lon - starLon + 180, 360) - 180);
        if (sep <= orbLimit) out.push({ body, star: name, orb: sep });
      }
    }
    out.sort((a, b) => a.orb - b.orb);
    return out;
  }

  /**
   * The seven Hermetic lots of a chart, each placed by sign and house. Sect is
   * read from the Sun (above the horizon -> a day chart). Feed the result to
   * {@link interpretationContext} as `lots` to project `lot` fact atoms.
   *
   * @param chart A chart from {@link Engine.chart} / {@link Engine.chartAt}; it
   *   must carry the seven classical planets.
   * @returns One entry per lot with its longitude, sign, `signDeg`, and house,
   *   or an empty array if a required planet is absent.
   */
  lots(chart: Chart): {
    lot: string; lon: number; sign: string; signDeg: number; house: number;
  }[] {
    const b = chart.bodies;
    const need = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"] as const;
    if (need.some((k) => !b[k])) return [];
    const day = (b.sun!.house >= 7); // Sun above the horizon (houses 7-12)
    const h = hermeticLots(
      chart.angles.asc, day, b.sun!.lon, b.moon!.lon, b.mercury!.lon,
      b.venus!.lon, b.mars!.lon, b.jupiter!.lon, b.saturn!.lon,
    );
    return HERMETIC_LOTS.map((lot) => {
      const lon = mod(h[lot], 360);
      return {
        lot, lon, sign: SIGNS[Math.floor(lon / 30)], signDeg: mod(lon, 30),
        house: houseIndex(lon, chart.cusps),
      };
    });
  }

  private lonOnly(
    body: BodyId, jdUt: number, mode: string | null, topo: Observer | null,
  ): number {
    const jde = jdTT(jdUt);
    let [lon, lat, dist] = this.ecliptic(body, jde);
    if (topo !== null && dist !== null) {
      const lst = mod(H.gast(this.data, jdUt) + topo.lonEast * DEG, TWO_PI);
      [lon, lat, dist] = topocentricEcl(
        lon, lat, dist, lst, topo.lat * DEG, topo.altM ?? 0.0,
        trueObliquity(this.data, jde),
      );
    }
    let lonDeg = lon / DEG;
    if (mode !== null) lonDeg = mod(lonDeg - this.ayanShift(jde, mode), 360);
    return lonDeg;
  }

  /**
   * Apparent geocentric ecliptic longitude of a body, in degrees `[0, 360)`,
   * at a Julian Day (UT). The fast path when you need only a longitude — a
   * transit position, an aspect angle, a sign — without the full
   * {@link Position}. In the tropical zodiac this is referred to the true
   * equinox of date; sidereal subtracts the ayanamsa.
   *
   * @param body A body id from {@link Engine.bodies}.
   * @param jdUt Julian Day in UT.
   * @param opts Calculation options: `zodiac` (tropical or a sidereal
   *   ayanamsa), and `topocentric` with an `observer` for a parallax-corrected
   *   place.
   * @returns Ecliptic longitude in degrees, `[0, 360)`.
   * @example
   * ```ts
   * engine.longitude("mars", julianDay(2025, 6, 1));               // tropical
   * engine.longitude("mars", julianDay(2025, 6, 1), { zodiac: "sidereal:lahiri" });
   * ```
   * @see {@link Engine.position} for speed, retrograde, latitude, and distance.
   */
  longitude(body: BodyId, jdUt: number, opts: CalcOptions = {}): number {
    const mode = parseZodiac(opts.zodiac ?? "tropical");
    const topo = opts.topocentric ? opts.observer ?? null : null;
    return this.lonOnly(body, jdUt, mode, topo);
  }

  /**
   * Geometric heliocentric ecliptic position (Sun-centred) at a Julian Day
   * (UT), referred to the ecliptic of date. Unlike {@link Engine.position},
   * this is a geometric place — no light-time, aberration, or nutation — and is
   * undefined for the Sun, the Moon, and the lunar nodes.
   *
   * @param body A Sun-orbiting body (planet or asteroid) from
   *   {@link Engine.bodies}.
   * @param jdUt Julian Day in UT.
   * @returns Heliocentric `lon`/`lat` in degrees and `dist` in AU.
   * @throws Error if `body` has no heliocentric solution (e.g. the Moon).
   */
  heliocentric(body: BodyId, jdUt: number): { lon: number; lat: number; dist: number } {
    const jde = jdTT(jdUt);
    let l: number; let b: number; let r: number;
    if (body === "pluto" && !this.data.chebPacks?.pluto) {
      [l, b, r] = plutoHeliocentric(this.data, jde);
      [l, b] = precessEcliptic(l, b, J2000, jde);
    } else if (body === "chiron") {
      if (!this.chironCheb) throw new Error("chiron data not loaded");
      const [x, y, z] = this.chironCheb.xyz(jde);
      r = Math.sqrt(x * x + y * y + z * z);
      l = mod(Math.atan2(y, x), TWO_PI);
      b = Math.atan2(z, Math.hypot(x, y));
      [l, b] = precessEcliptic(l, b, J2000, jde);
    } else if (this.hasPack(body)) {
      const [x, y, z] = this.pack(body).xyz(jde);
      r = Math.sqrt(x * x + y * y + z * z);
      l = mod(Math.atan2(y, x), TWO_PI);
      b = Math.atan2(z, Math.hypot(x, y));
      [l, b] = precessEcliptic(l, b, J2000, jde);
    } else if (VSOP_BODIES.has(body) && this.data.vsop[body]) {
      [l, b, r] = vsopHeliocentric(this.data.vsop[body], jde);
    } else {
      throw new Error(`no heliocentric position for '${body}'`);
    }
    return { lon: l / DEG, lat: b / DEG, dist: r };
  }

  /**
   * Full apparent position of a body at a Julian Day (UT): ecliptic longitude
   * and daily speed (with a retrograde flag), the zodiac sign, ecliptic
   * latitude, geocentric distance, and equatorial right ascension and
   * declination. The general-purpose single-body call; use
   * {@link Engine.longitude} when you need only the longitude.
   *
   * @param body A body id from {@link Engine.bodies}.
   * @param jdUt Julian Day in UT.
   * @param opts Calculation options: `zodiac` (tropical or a sidereal
   *   ayanamsa), and `topocentric` with an `observer` for a parallax-corrected
   *   place.
   * @returns A {@link Position}: `lon`, `speed`, `retrograde`, `sign`,
   *   `signDeg`, `lat`, `dist` (AU; `null` for nodes and Lilith), `ra`, `dec`.
   * @example
   * ```ts
   * const mars = engine.position("mars", julianDay(2025, 6, 1));
   * mars.retrograde; // boolean
   * mars.speed;      // degrees/day (negative when retrograde)
   * ```
   */
  position(body: BodyId, jdUt: number, opts: CalcOptions = {}): Position {
    const mode = parseZodiac(opts.zodiac ?? "tropical");
    const topo = opts.topocentric ? opts.observer ?? null : null;
    const jde = jdTT(jdUt);
    let [lonR, latR, dist] = this.ecliptic(body, jde);
    if (topo !== null && dist !== null) {
      const lst = mod(H.gast(this.data, jdUt) + topo.lonEast * DEG, TWO_PI);
      [lonR, latR, dist] = topocentricEcl(
        lonR, latR, dist, lst, topo.lat * DEG, topo.altM ?? 0.0,
        trueObliquity(this.data, jde),
      );
    }
    const [ra, dec] = equatorial(lonR, latR, trueObliquity(this.data, jde));
    let lon = lonR / DEG;
    if (mode !== null) lon = mod(lon - this.ayanShift(jde, mode), 360);
    const h = 0.25; // days; central difference
    const l0 = this.lonOnly(body, jdUt - h, mode, topo);
    const l1 = this.lonOnly(body, jdUt + h, mode, topo);
    const speed = (mod(l1 - l0 + 540, 360) - 180) / (2 * h);
    return {
      lon, speed, retrograde: speed < 0,
      sign: SIGNS[Math.floor(lon / 30)], signDeg: mod(lon, 30),
      lat: latR / DEG, dist,
      ra: ra / DEG, dec: dec / DEG,
    };
  }

  /**
   * Full natal chart: body positions, house cusps, angles, and aspects for one
   * instant and place.
   *
   * The first six arguments are calendar fields in **UT** — not local civil
   * time, and not a Julian Day. Passing a JD in `y` builds an absurd instant and
   * throws `RangeError`; use {@link Engine.chartAt} for a chart from a JD. For a
   * birth time given in a local time zone, resolve it to UT first (see the
   * `caelus-birth` package).
   *
   * @param y Year in UT, e.g. `1990` — a calendar year, not a Julian Day.
   * @param mo Month, `1`–`12`.
   * @param d Day of month, `1`–`31`.
   * @param h Hour in UT, `0`–`23`.
   * @param mi Minute, `0`–`59`.
   * @param s Second, `0`–`59`.
   * @param lat Geographic latitude in degrees, north positive.
   * @param lonEast Geographic longitude in degrees, **east positive** (so
   *   82.46° W is `-82.46`).
   * @param opts A house-system name (e.g. `"placidus"`) or a
   *   {@link ChartOptions} bag for zodiac, topocentric mode, extra bodies, and
   *   custom orbs. Defaults to Placidus houses in the tropical zodiac.
   * @returns A {@link Chart}: `bodies`, `cusps`, `angles`, and `aspects`, plus
   *   `jdUt` and the house system actually used (Placidus and Koch fall back to
   *   whole-sign above the polar circles). A body outside its fitted range
   *   (e.g. Chiron before ~1850) is omitted from `bodies` and listed in
   *   `unavailable` rather than failing the whole chart.
   * @throws RangeError only if the instant itself is absurd — far outside any
   *   supported epoch — which almost always means a Julian Day was passed where
   *   calendar fields belong.
   * @example
   * ```ts
   * // 1990-06-10 14:30 UT at Tampa, FL (27.95° N, 82.46° W), Placidus houses
   * const chart = engine.chart(1990, 6, 10, 14, 30, 0, 27.95, -82.46, "placidus");
   * chart.bodies.sun.lon; // Sun's ecliptic longitude, degrees
   * chart.angles.asc;     // Ascendant, degrees
   * ```
   * @see {@link Engine.chartAt} to build the same chart from a Julian Day.
   */
  chart(
    y: number, mo: number, d: number, h: number, mi: number, s: number,
    lat: number, lonEast: number, opts: HouseSystem | ChartOptions = "placidus",
  ): Chart {
    return this.chartAt(julianDay(y, mo, d, h, mi, s), lat, lonEast, opts);
  }

  /**
   * Full natal chart from a Julian Day (UT) — identical output to
   * {@link Engine.chart}, without the calendar round-trip. Reach for this when
   * you already hold a JD: transit and event scans, `rankMoments` winners, or
   * `position`/`longitude` workflows.
   *
   * @param jdUt Julian Day in UT, e.g. from {@link julianDay} or a scan.
   * @param lat Geographic latitude in degrees, north positive.
   * @param lonEast Geographic longitude in degrees, east positive.
   * @param opts A house-system name or a {@link ChartOptions} bag. Defaults to
   *   Placidus houses in the tropical zodiac.
   * @returns The same {@link Chart} shape returned by {@link Engine.chart}.
   * @example
   * ```ts
   * const jd = julianDay(1990, 6, 10, 14, 30, 0);
   * const chart = engine.chartAt(jd, 27.95, -82.46, "placidus");
   * ```
   * @see {@link Engine.chart} for the calendar-field entry point.
   */
  chartAt(
    jdUt: number, lat: number, lonEast: number,
    opts: HouseSystem | ChartOptions = "placidus",
  ): Chart {
    if (!Number.isFinite(jdUt) || jdUt < JD_SANE_MIN || jdUt > JD_SANE_MAX) {
      throw new RangeError(
        `chart instant (jd ${jdUt}) is far outside the supported range; if you ` +
        `meant a calendar date, pass year/month/day to chart() rather than a Julian Day.`,
      );
    }
    const o: ChartOptions = typeof opts === "string" ? { houseSystem: opts } : opts;
    const houseSystem = normalizeHouseSystem(o.houseSystem ?? "placidus");
    const zodiac = o.zodiac ?? "tropical";
    const mode = parseZodiac(zodiac);
    const calc: CalcOptions = {
      zodiac,
      topocentric: o.topocentric,
      observer: o.topocentric ? o.observer ?? { lat, lonEast, altM: 0.0 } : undefined,
    };
    const names: BodyId[] = [
      ...BODIES, ...(o.bodies ?? []).filter((b) => !(BODIES as readonly string[]).includes(b)),
    ];
    const bodies: Record<string, Position> = {};
    const unavailable: string[] = [];
    for (const b of names) {
      try {
        bodies[b] = this.position(b, jdUt, calc);
      } catch (e) {
        // A Chebyshev-packed body (Chiron, fitted asteroids) outside its fitted
        // range throws RangeError. Omit it and report it rather than discarding
        // the whole chart; the analytic bodies still resolve. Any other error
        // (e.g. a missing data pack) is a real fault and propagates.
        if (e instanceof RangeError) unavailable.push(b);
        else throw e;
      }
    }
    const [asc, mc, armc, eps] = H.angles(this.data, jdUt, lat, lonEast);
    const [vtx, east] = H.vertexEastPoint(armc, lat * DEG, eps);
    const phi = lat * DEG;
    let used: HouseSystem = houseSystem;
    let cusps: number[];
    try {
      if (houseSystem === "placidus") {
        if (Math.abs(lat) >= 66.0) {
          throw new RangeError("placidus undefined above polar circles");
        }
        cusps = H.housesPlacidus(armc, phi, eps);
      } else if (houseSystem === "porphyry") {
        cusps = H.housesPorphyry(asc, mc);
      } else if (houseSystem === "equal") {
        cusps = H.housesEqual(asc);
      } else if (houseSystem === "whole_sign") {
        cusps = H.housesWholeSign(asc);
      } else if (houseSystem === "koch") {
        cusps = H.housesKoch(armc, phi, eps);
      } else if (houseSystem === "regiomontanus") {
        cusps = H.housesRegiomontanus(armc, phi, eps);
      } else if (houseSystem === "campanus") {
        cusps = H.housesCampanus(armc, phi, eps);
      } else if (houseSystem === "alcabitius") {
        cusps = H.housesAlcabitius(armc, phi, eps);
      } else if (houseSystem === "morinus") {
        cusps = H.housesMorinus(armc, phi, eps);
      } else if (houseSystem === "meridian") {
        cusps = H.housesMeridian(armc, phi, eps);
      } else if (houseSystem === "polich_page") {
        cusps = H.housesPolichPage(armc, phi, eps);
      } else if (houseSystem === "vehlow") {
        cusps = H.housesVehlow(armc, phi, eps);
      } else {
        throw new Error(`unknown house system '${houseSystem as string}' (valid: ${HOUSE_SYSTEMS.join(", ")})`);
      }
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
      used = "whole_sign"; // Placidus/Koch undefined above polar circles
      cusps = H.housesWholeSign(asc);
    }
    const jde = jdTT(jdUt);
    let shift = 0.0;
    if (mode !== null) shift = this.ayanShift(jde, mode);
    const outDeg = (rad: number): number => mod(rad / DEG - shift, 360);
    let cuspsDeg: number[];
    if (mode !== null && used === "whole_sign") {
      // whole-sign cusps must stay sign-aligned in the sidereal zodiac
      const first = Math.floor(outDeg(asc) / 30) * 30.0;
      cuspsDeg = Array.from({ length: 12 }, (_, i) => mod(first + i * 30.0, 360));
    } else {
      cuspsDeg = cusps.map(outDeg);
    }
    // Enrich each position with chart-relative placement (house) and the
    // essential dignities of its sign, so callers don't recompute from cusps.
    const chartBodies: Record<string, ChartBody> = {};
    for (const b of names) {
      const p = bodies[b];
      if (!p) continue; // omitted: outside its fitted range (see `unavailable`)
      chartBodies[b] = {
        ...p,
        house: houseIndex(p.lon, cuspsDeg),
        dignities: dignities(b, Math.floor(mod(p.lon, 360) / 30)),
      };
    }
    return {
      jdUt,
      zodiac,
      houseSystem: used,
      houseSystemRequested: houseSystem,
      bodies: chartBodies as ChartBodies,
      unavailable,
      angles: {
        asc: outDeg(asc), mc: outDeg(mc),
        vertex: outDeg(vtx), eastPoint: outDeg(east),
      },
      cusps: cuspsDeg,
      aspects: findAspects(chartBodies, o.orbs ?? DEFAULT_ORBS),
    };
  }
}

/** 1-based house for an ecliptic longitude (degrees) given the twelve cusp
 *  longitudes (degrees), wrapping across 0. */
function houseIndex(lon: number, cusps: number[]): number {
  for (let i = 0; i < 12; i++) {
    if (mod(lon - cusps[i], 360) < mod(cusps[(i + 1) % 12] - cusps[i], 360)) return i + 1;
  }
  return 12;
}

export function findAspects(
  bodies: Record<string, Position>, orbs: Record<string, number> = DEFAULT_ORBS,
): Aspect[] {
  const out: Aspect[] = [];
  const names = Object.keys(bodies).filter((b) => !NOT_ASPECTABLE.has(b));
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      const e = mod(bodies[a].lon - bodies[b].lon + 180, 360) - 180; // signed gap
      const sep = Math.abs(e);
      for (const [asp, angle] of Object.entries(ASPECTS)) {
        const orb = Math.abs(sep - angle);
        if (orb <= orbs[asp]) {
          const orbRounded = Math.round(orb * 100) / 100;
          // Applying/separating from the closing of the signed orb (matches
          // electional.aspectPhase); strength from the same rounded orb so a
          // consumer can reproduce it from .orb and the orb policy.
          const signedOrb = sep - angle;
          const dAbsOrbDt = (signedOrb >= 0 ? 1 : -1) * (e >= 0 ? 1 : -1)
            * (bodies[a].speed - bodies[b].speed);
          const phase: AspectPhase = Math.abs(signedOrb) < 1e-9
            ? "exact" : dAbsOrbDt < 0 ? "applying" : "separating";
          out.push({
            a, b, aspect: asp, orb: orbRounded,
            phase, strength: Math.max(0, 1 - orbRounded / orbs[asp]),
          });
        }
      }
    }
  }
  return out;
}

export function fmtLon(deg: number): string {
  // Normalize first: a raw or rounded longitude (e.g. exactly 360, or a small
  // negative) would otherwise index SIGNS out of range and render "undefined".
  const norm = mod(deg, 360);
  const sign = SIGNS[Math.floor(norm / 30)];
  const d = mod(norm, 30);
  const m = mod(d, 1) * 60;
  return `${String(Math.floor(d)).padStart(2)}°${String(Math.floor(m)).padStart(2, "0")}' ${sign}`;
}
