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
import * as H from "./houses.js";

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
const NOT_ASPECTABLE = new Set([
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

export type Ayanamsa = keyof typeof AYANAMSA_J2000 & string;
export type Zodiac = "tropical" | `sidereal:${string}`;

export interface Observer { lat: number; lonEast: number; altM?: number }

export interface CalcOptions {
  zodiac?: Zodiac;            // default "tropical"
  topocentric?: boolean;      // default false; needs observer
  observer?: Observer;
}

export interface ChartOptions extends CalcOptions {
  houseSystem?: HouseSystem;  // default "placidus"
  bodies?: BodyId[];          // extra bodies beyond the core 13
  orbs?: Record<string, number>;
}

export interface Position {
  lon: number; speed: number; retrograde: boolean; sign: string; signDeg: number;
  /** Ecliptic latitude, deg (0 for nodes). */
  lat: number;
  /** Geocentric distance in AU (Moon included); null for nodes and Lilith. */
  dist: number | null;
  /** Equatorial coordinates, true equinox of date, deg. */
  ra: number; dec: number;
}

export interface Aspect { a: string; b: string; aspect: string; orb: number }

export interface Chart {
  jdUt: number;
  zodiac: Zodiac;
  /** House system actually used. May differ from the request: Placidus and
   *  Koch are undefined above the polar circles and fall back to whole_sign. */
  houseSystem: HouseSystem;
  houseSystemRequested: HouseSystem;
  bodies: Record<string, Position>;
  angles: { asc: number; mc: number; vertex: number; eastPoint: number };
  cusps: number[];
  aspects: Aspect[];
}

const KM_PER_AU = 149597870.7;

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

  constructor(data: EngineData) {
    this.data = data;
    this.moonCheb = data.moonCheb ? new ChebSeries(data.moonCheb) : null;
    this.chironCheb = data.chiron ? new ChebSeries(data.chiron) : null;
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
    if (body === "pluto") return plutoApparent(this.data, jde);
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
    if (this.data.chebPacks?.[body] || this.data.keplerPack?.bodies[body]) {
      // same heliocentric pipeline as Chiron (Chebyshev or Kepler source)
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
    if (body === "pluto") {
      [l, b, r] = plutoHeliocentric(this.data, jde);
      [l, b] = precessEcliptic(l, b, J2000, jde);
    } else if (body === "chiron") {
      if (!this.chironCheb) throw new Error("chiron data not loaded");
      const [x, y, z] = this.chironCheb.xyz(jde);
      r = Math.sqrt(x * x + y * y + z * z);
      l = mod(Math.atan2(y, x), TWO_PI);
      b = Math.atan2(z, Math.hypot(x, y));
      [l, b] = precessEcliptic(l, b, J2000, jde);
    } else if (this.data.chebPacks?.[body] || this.data.keplerPack?.bodies[body]) {
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
   * time, and not a Julian Day. Passing a JD in `y` builds an instant far
   * outside the fitted range and throws `RangeError`; use {@link Engine.chartAt}
   * for a chart from a JD. For a birth time given in a local time zone, resolve
   * it to UT first (see the `caelus-birth` package).
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
   *   whole-sign above the polar circles).
   * @throws RangeError if the instant lands outside the fitted range
   *   (1800–2149) — most often from passing a Julian Day where a year belongs.
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
    const o: ChartOptions = typeof opts === "string" ? { houseSystem: opts } : opts;
    const houseSystem = o.houseSystem ?? "placidus";
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
    for (const b of names) bodies[b] = this.position(b, jdUt, calc);
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
        throw new Error(`unknown house system '${houseSystem as string}'`);
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
    return {
      jdUt,
      zodiac,
      houseSystem: used,
      houseSystemRequested: houseSystem,
      bodies,
      angles: {
        asc: outDeg(asc), mc: outDeg(mc),
        vertex: outDeg(vtx), eastPoint: outDeg(east),
      },
      cusps: cuspsDeg,
      aspects: findAspects(bodies, o.orbs ?? DEFAULT_ORBS),
    };
  }
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
      const sep = Math.abs(mod(bodies[a].lon - bodies[b].lon + 180, 360) - 180);
      for (const [asp, angle] of Object.entries(ASPECTS)) {
        const orb = Math.abs(sep - angle);
        if (orb <= orbs[asp]) {
          out.push({ a, b, aspect: asp, orb: Math.round(orb * 100) / 100 });
        }
      }
    }
  }
  return out;
}

export function fmtLon(deg: number): string {
  const sign = SIGNS[Math.floor(deg / 30)];
  const d = mod(deg, 30);
  const m = mod(d, 1) * 60;
  return `${String(Math.floor(d)).padStart(2)}°${String(Math.floor(m)).padStart(2, "0")}' ${sign}`;
}
