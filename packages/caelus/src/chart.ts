/** astroengine chart -- public API: natal charts, aspects, retrogrades. */
import {
  DEG, mod, jdTT, julianDay, EngineData, ChebSeries, ChebData,
  planetApparent, sunApparent, moonApparentSeries, moonApparentPrecise,
  plutoApparent, chironApparent, meanNode, trueNodeSeries, trueNodePrecise,
} from "./core.js";
import * as H from "./houses.js";

export const BODIES = [
  "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn",
  "uranus", "neptune", "pluto", "chiron", "mean_node", "true_node",
] as const;
export type Body = (typeof BODIES)[number];

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

export type HouseSystem = "placidus" | "porphyry" | "equal" | "whole_sign";

export interface Position {
  lon: number; speed: number; retrograde: boolean; sign: string; signDeg: number;
}

export interface Aspect { a: string; b: string; aspect: string; orb: number }

export interface Chart {
  jdUt: number;
  /** House system actually used. May differ from the request: Placidus is
   *  undefined above the polar circles and falls back to whole_sign. */
  houseSystem: HouseSystem;
  houseSystemRequested: HouseSystem;
  bodies: Record<string, Position>;
  angles: { asc: number; mc: number };
  cusps: number[];
  aspects: Aspect[];
}

export class Engine {
  private data: EngineData;
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

  /** Apparent geocentric ecliptic longitude (deg), true equinox of date. */
  longitude(body: Body, jdUt: number): number {
    const jde = jdTT(jdUt);
    let lon: number;
    if (body === "sun") {
      [lon] = sunApparent(this.data, jde);
    } else if (body === "moon") {
      [lon] = this.moonInRange(jde)
        ? moonApparentPrecise(this.data, this.moonCheb!, jde)
        : moonApparentSeries(this.data, jde);
    } else if (body === "pluto") {
      [lon] = plutoApparent(this.data, jde);
    } else if (body === "chiron") {
      if (!this.chironCheb) throw new Error("chiron data not loaded");
      [lon] = chironApparent(this.data, this.chironCheb, jde);
    } else if (body === "mean_node") {
      lon = meanNode(this.data, jde);
    } else if (body === "true_node") {
      lon = this.moonInRange(jde)
        ? trueNodePrecise(this.data, this.moonCheb!, jde)
        : trueNodeSeries(this.data, jde);
    } else {
      [lon] = planetApparent(this.data, body, jde);
    }
    return lon / DEG;
  }

  /** Longitude (deg) + speed (deg/day) + retrograde flag. */
  position(body: Body, jdUt: number): Position {
    const h = 0.25;
    const lon = this.longitude(body, jdUt);
    const l0 = this.longitude(body, jdUt - h);
    const l1 = this.longitude(body, jdUt + h);
    const speed = (mod(l1 - l0 + 540, 360) - 180) / (2 * h);
    return {
      lon, speed, retrograde: speed < 0,
      sign: SIGNS[Math.floor(lon / 30)], signDeg: mod(lon, 30),
    };
  }

  /** Full natal chart. Time is UT. East longitude positive. */
  chart(
    y: number, mo: number, d: number, h: number, mi: number, s: number,
    lat: number, lonEast: number, houseSystem: HouseSystem = "placidus",
  ): Chart {
    const jdUt = julianDay(y, mo, d, h, mi, s);
    const bodies: Record<string, Position> = {};
    for (const b of BODIES) bodies[b] = this.position(b, jdUt);
    const [asc, mc, armc, eps] = H.angles(this.data, jdUt, lat, lonEast);
    const phi = lat * DEG;
    let cusps: number[];
    let used: HouseSystem = houseSystem;
    if (houseSystem === "placidus") {
      if (Math.abs(lat) < 66.0) {
        cusps = H.housesPlacidus(armc, phi, eps);
      } else {
        used = "whole_sign"; // Placidus undefined above polar circles
        cusps = H.housesWholeSign(asc);
      }
    } else if (houseSystem === "porphyry") {
      cusps = H.housesPorphyry(asc, mc);
    } else if (houseSystem === "equal") {
      cusps = H.housesEqual(asc);
    } else {
      cusps = H.housesWholeSign(asc);
    }
    return {
      jdUt,
      houseSystem: used,
      houseSystemRequested: houseSystem,
      bodies,
      angles: { asc: asc / DEG, mc: mc / DEG },
      cusps: cusps.map((c) => c / DEG),
      aspects: findAspects(bodies),
    };
  }
}

export function findAspects(
  bodies: Record<string, Position>, orbs: Record<string, number> = DEFAULT_ORBS,
): Aspect[] {
  const out: Aspect[] = [];
  const names = Object.keys(bodies).filter((b) => !b.endsWith("_node"));
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
  return `${String(Math.floor(d)).padStart(2)}\u00b0${String(Math.floor(m)).padStart(2, "0")}' ${sign}`;
}
