/** astroengine chart -- public API: natal charts, aspects, retrogrades. */
import {
  DEG, mod, jdTT, julianDay, EngineData, ChebSeries,
  planetApparent, sunApparent, moonApparentSeries, moonApparentPrecise,
  plutoApparent, chironApparent, meanNode, trueNodeSeries, trueNodePrecise,
  equatorial, ayanamsa, AYANAMSA_J2000, meanLilith, topocentricEcl,
  oscApogeePrecise, oscApogeeSeries,
  trueObliquity, nutation, plutoHeliocentric, vsopHeliocentric, precessEcliptic,
  J2000,
} from "./core.js";
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
    if (AYANAMSA_J2000[mode] !== undefined) return mode;
  }
  throw new Error(`unknown zodiac ${JSON.stringify(zodiac)}`);
}

const VSOP_BODIES = new Set([
  "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune",
]);

export class Engine {
  readonly data: EngineData;
  private moonCheb: ChebSeries | null;
  private chironCheb: ChebSeries | null;

  constructor(data: EngineData) {
    this.data = data;
    this.moonCheb = data.moonCheb ? new ChebSeries(data.moonCheb) : null;
    this.chironCheb = data.chiron ? new ChebSeries(data.chiron) : null;
  }

  private moonInRange(jde: number): boolean {
    return !!this.moonCheb
      && this.moonCheb.jd0 <= jde - 0.1 && jde + 0.1 <= this.moonCheb.jd1;
  }

  /** Body ids this engine can compute, given the data it was handed. */
  bodies(): BodyId[] {
    return [...BODIES, ...EXTRA_BODIES].filter(
      (b) => b !== "chiron" || this.chironCheb,
    );
  }

  /** Apparent geocentric [lon rad, lat rad, dist AU | null] at TT jde.
   *  Building block for the events module; chart consumers want
   *  position() instead. */
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
    if (this.data.vsop[body]) return planetApparent(this.data, body, jde);
    throw new Error(`no data loaded for body '${body}'`);
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
    if (mode !== null) {
      lonDeg = mod(
        lonDeg - nutation(this.data, jde)[0] / DEG - ayanamsa(jde, mode), 360,
      );
    }
    return lonDeg;
  }

  /** Apparent geocentric ecliptic longitude (deg). Tropical: true equinox
   *  of date. Sidereal: mean equinox minus ayanamsa. */
  longitude(body: BodyId, jdUt: number, opts: CalcOptions = {}): number {
    const mode = parseZodiac(opts.zodiac ?? "tropical");
    const topo = opts.topocentric ? opts.observer ?? null : null;
    return this.lonOnly(body, jdUt, mode, topo);
  }

  /** Geometric heliocentric ecliptic of date (deg, deg, AU). */
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
    } else if (VSOP_BODIES.has(body) && this.data.vsop[body]) {
      [l, b, r] = vsopHeliocentric(this.data.vsop[body], jde);
    } else {
      throw new Error(`no heliocentric position for '${body}'`);
    }
    return { lon: l / DEG, lat: b / DEG, dist: r };
  }

  /** Full position: lon/speed/retrograde/sign + lat, dist (AU), ra, dec. */
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
    if (mode !== null) {
      lon = mod(lon - nutation(this.data, jde)[0] / DEG - ayanamsa(jde, mode), 360);
    }
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

  /** Full natal chart. Time is UT. East longitude positive. The ninth
   *  argument takes a house system name (0.2.x form) or a ChartOptions bag. */
  chart(
    y: number, mo: number, d: number, h: number, mi: number, s: number,
    lat: number, lonEast: number, opts: HouseSystem | ChartOptions = "placidus",
  ): Chart {
    const o: ChartOptions = typeof opts === "string" ? { houseSystem: opts } : opts;
    const houseSystem = o.houseSystem ?? "placidus";
    const zodiac = o.zodiac ?? "tropical";
    const mode = parseZodiac(zodiac);
    const jdUt = julianDay(y, mo, d, h, mi, s);
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
    if (mode !== null) {
      shift = nutation(this.data, jde)[0] / DEG + ayanamsa(jde, mode);
    }
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
