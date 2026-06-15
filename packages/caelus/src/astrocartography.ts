/**
 * astroengine astrocartography -- planetary angle lines across the globe.
 *
 * For one moment, each planet is exactly on an angle along a curve on the
 * Earth's surface: MC and IC are meridians (culmination / anti-culmination),
 * ASC and DSC are the curved rising / setting tracks. Geometry from each body's
 * right ascension and declination and the moment's Greenwich apparent sidereal
 * time. Mirrors the Python reference (astroengine/astrocartography.py); the
 * golden pins the two.
 */
import { DEG } from "./core.js";
import { gast } from "./houses.js";
import { Engine, BodyId } from "./chart.js";

/** Wrap a longitude to (-180, 180], east positive. */
function mapLon(deg: number): number {
  const d = ((deg % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

export interface AngleLines {
  /** MC meridian longitude (culmination). */
  mc: number;
  /** IC meridian longitude (anti-culmination). */
  ic: number;
  /** Rising track, [lon, lat] points over the latitude band. */
  asc: [number, number][];
  /** Setting track, [lon, lat] points. */
  dsc: [number, number][];
}

/** Angle lines for one body at right ascension/declination (degrees) and a
 *  Greenwich apparent sidereal time (degrees). */
export function planetLines(
  ra: number, dec: number, gastDeg: number,
  latMin = -85.0, latMax = 85.0, latStep = 1.0,
): AngleLines {
  const mc = mapLon(ra - gastDeg);
  const ic = mapLon(ra - gastDeg - 180.0);
  const td = Math.tan(dec * DEG);
  const asc: [number, number][] = [];
  const dsc: [number, number][] = [];
  const n = Math.floor((latMax - latMin) / latStep + 1e-9); // never exceed latMax
  // Skip the degenerate near-tangent point where |x| -> 1 (h0 -> 0 or 180): the
  // body grazes the horizon at the meridian, acos' is singular there, and
  // cross-platform libm rounding would swing the longitude by ~mas. Trimming it
  // costs <0.003 deg of line length and makes the track deterministic.
  const EDGE = 1.0 - 1e-9;
  for (let i = 0; i <= n; i++) {
    const phi = latMin + i * latStep;
    const x = -Math.tan(phi * DEG) * td;
    if (x >= -EDGE && x <= EDGE) {
      const h0 = Math.acos(x) / DEG; // hour-angle half-width, degrees
      asc.push([mapLon(ra - h0 - gastDeg), phi]); // eastern horizon
      dsc.push([mapLon(ra + h0 - gastDeg), phi]); // western horizon
    }
  }
  return { mc, ic, asc, dsc };
}

/** Angle lines for each body at jdUt: { body: AngleLines }. */
export function astrocartography(
  engine: Engine, jdUt: number, bodies: BodyId[],
  latMin = -85.0, latMax = 85.0, latStep = 1.0,
): Record<string, AngleLines> {
  const g = gast(engine.data, jdUt) / DEG; // Greenwich apparent sidereal time, deg
  const out: Record<string, AngleLines> = {};
  for (const b of bodies) {
    const p = engine.position(b, jdUt);
    out[b] = planetLines(p.ra, p.dec, g, latMin, latMax, latStep);
  }
  return out;
}
