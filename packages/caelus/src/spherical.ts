/**
 * astroengine spherical -- spherical-geometry primitives for 3D chart views.
 *
 * A body sits at a point on the celestial sphere, not just a zodiac longitude.
 * `unitVector` gives the direction for an (ecliptic longitude, latitude) pair;
 * `angularSeparation3d` gives the true great-circle angle between two bodies,
 * which is the basis for 3D aspects (the separation in space, accounting for
 * ecliptic latitude, rather than the 2D longitude difference). Mirrors the
 * Python reference (astroengine/spherical.py); the golden pins the two.
 */
import { DEG } from "./core.js";

export type Vec3 = [number, number, number];

/** Unit vector on the sphere for an (ecliptic longitude, latitude) pair, in the
 *  ecliptic frame: x toward 0 Aries, z toward the north ecliptic pole. */
export function unitVector(lonDeg: number, latDeg: number): Vec3 {
  const lam = lonDeg * DEG;
  const beta = latDeg * DEG;
  const cb = Math.cos(beta);
  return [cb * Math.cos(lam), cb * Math.sin(lam), Math.sin(beta)];
}

/** True great-circle angle (degrees) between two bodies from their ecliptic
 *  longitude and latitude. With both latitudes zero this is the unsigned
 *  longitude difference; latitude pulls the two apart in three dimensions. */
export function angularSeparation3d(
  lonA: number, latA: number, lonB: number, latB: number,
): number {
  const [ax, ay, az] = unitVector(lonA, latA);
  const [bx, by, bz] = unitVector(lonB, latB);
  const dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz));
  return Math.acos(dot) / DEG;
}
