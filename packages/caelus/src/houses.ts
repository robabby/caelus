/** astroengine houses -- sidereal time, angles, house systems. */
import {
  DEG, J2000, mod, nutation, trueObliquity, jdTT, EngineData,
} from "./core.js";

const TWO_PI = 2 * Math.PI;

/** Greenwich mean sidereal time, radians (IAU 1982 / Meeus 12.4). */
export function gmst(jdUt: number): number {
  const T = (jdUt - J2000) / 36525.0;
  const deg = 280.46061837 + 360.98564736629 * (jdUt - J2000)
    + 0.000387933 * T * T - T ** 3 / 38710000.0;
  return mod(deg, 360.0) * DEG;
}

/** Greenwich apparent sidereal time. */
export function gast(data: EngineData, jdUt: number): number {
  const jde = jdTT(jdUt);
  const [dpsi] = nutation(data, jde);
  const eps = trueObliquity(data, jde);
  return mod(gmst(jdUt) + dpsi * Math.cos(eps), TWO_PI);
}

/** Ecliptic longitude where the house circle with pole `pole` crosses the
 *  ecliptic; `ra` measured like ARMC. The Ascendant is houseCusp(armc+90,
 *  phi); the MC is houseCusp(armc, 0). */
export function houseCusp(ra: number, pole: number, eps: number): number {
  return mod(Math.atan2(
    Math.sin(ra), Math.cos(ra) * Math.cos(eps) - Math.sin(eps) * Math.tan(pole),
  ), TWO_PI);
}

function mcOf(armc: number, eps: number): number {
  return mod(Math.atan2(Math.sin(armc), Math.cos(armc) * Math.cos(eps)), TWO_PI);
}

/** Ascendant with the polar-latitude convention: the ASC always lies in
 *  the half-circle (MC, MC+180). Above ~66 deg the raw horizon intersection
 *  can be the setting one; Swiss Ephemeris applies the same correction. */
function ascOf(armc: number, phi: number, eps: number): number {
  let asc = houseCusp(armc + Math.PI / 2, phi, eps);
  if (mod(asc - mcOf(armc, eps), TWO_PI) >= Math.PI) {
    asc = mod(asc + Math.PI, TWO_PI);
  }
  return asc;
}

/** Ascendant, MC, ARMC, obliquity. East longitude positive. */
export function angles(
  data: EngineData, jdUt: number, latDeg: number, lonDeg: number,
): [number, number, number, number] {
  const jde = jdTT(jdUt);
  const eps = trueObliquity(data, jde);
  const armc = mod(gast(data, jdUt) + lonDeg * DEG, TWO_PI);
  const phi = latDeg * DEG;
  const mc = mcOf(armc, eps);
  const asc = ascOf(armc, phi, eps);
  return [asc, mc, armc, eps];
}

/** Vertex (western crossing of prime vertical and ecliptic) and east
 *  point (equatorial ascendant). Radians in, radians out. */
export function vertexEastPoint(
  armc: number, phi: number, eps: number,
): [number, number] {
  const colat = phi >= 0 ? Math.PI / 2 - phi : -Math.PI / 2 - phi;
  let vtx = houseCusp(armc + (3 * Math.PI) / 2, colat, eps);
  // pick the western intersection: equatorial direction . east-point < 0
  const dx = Math.cos(vtx);
  const dy = Math.sin(vtx) * Math.cos(eps);
  if (dx * -Math.sin(armc) + dy * Math.cos(armc) > 0) {
    vtx = mod(vtx + Math.PI, TWO_PI);
  }
  const east = houseCusp(armc + Math.PI / 2, 0.0, eps);
  return [vtx, east];
}

export function housesWholeSign(asc: number): number[] {
  const first = Math.floor(asc / (30 * DEG)) * 30 * DEG;
  return Array.from({ length: 12 }, (_, i) => mod(first + i * 30 * DEG, TWO_PI));
}

export function housesEqual(asc: number): number[] {
  return Array.from({ length: 12 }, (_, i) => mod(asc + i * 30 * DEG, TWO_PI));
}

export function housesPorphyry(asc: number, mc: number): number[] {
  const ic = mod(mc + Math.PI, TWO_PI);
  const dsc = mod(asc + Math.PI, TWO_PI);
  const span = (a: number, b: number) => mod(b - a, TWO_PI);
  const cusps = new Array<number>(12).fill(0);
  cusps[0] = asc;
  cusps[9] = mc;
  let s = span(mc, asc) / 3.0;
  cusps[10] = mod(mc + s, TWO_PI);
  cusps[11] = mod(mc + 2 * s, TWO_PI);
  s = span(asc, ic) / 3.0;
  cusps[1] = mod(asc + s, TWO_PI);
  cusps[2] = mod(asc + 2 * s, TWO_PI);
  cusps[3] = ic;
  cusps[6] = dsc;
  cusps[4] = mod(cusps[10] + Math.PI, TWO_PI);
  cusps[5] = mod(cusps[11] + Math.PI, TWO_PI);
  cusps[7] = mod(cusps[1] + Math.PI, TWO_PI);
  cusps[8] = mod(cusps[2] + Math.PI, TWO_PI);
  return cusps;
}

function signed(x: number): number {
  return mod(x + Math.PI, TWO_PI) - Math.PI;
}

function fillOpposites(out: number[]): number[] {
  for (const k of [3, 4, 5]) out[k] = mod(out[k + 6] + Math.PI, TWO_PI);
  for (const k of [6, 7, 8]) out[k] = mod(out[k - 6] + Math.PI, TWO_PI);
  return out;
}

/** Cusps 1 and 10. With flipMc (Regiomontanus, Campanus, Polich-Page), the
 *  MC moves to the IC when the polar ASC correction fires, keeping the cusps
 *  in zodiacal order; Swiss Ephemeris does the same. Alcabitius and Koch
 *  keep the astronomical MC. */
function quadrantFrame(
  armc: number, phi: number, eps: number, flipMc: boolean,
): number[] {
  const out = new Array<number>(12).fill(0);
  let mc = mcOf(armc, eps);
  let asc = houseCusp(armc + Math.PI / 2, phi, eps);
  if (mod(asc - mc, TWO_PI) >= Math.PI) {
    asc = mod(asc + Math.PI, TWO_PI);
    if (flipMc) mc = mod(mc + Math.PI, TWO_PI);
  }
  out[0] = asc;
  out[9] = mc;
  return out;
}

/** Every quadrant-system house circle passes through the horizon's
 *  north/south points, so its two ecliptic crossings sit east and west of
 *  the meridian. Cusps 11, 12, 2, 3 are the eastern ones. */
function eastOfMeridian(lon: number, armc: number, eps: number): number {
  const ra = Math.atan2(Math.sin(lon) * Math.cos(eps), Math.cos(lon));
  if (Math.sin(armc - ra) > 0) return mod(lon + Math.PI, TWO_PI);
  return lon;
}

/** Force a cusp candidate onto the short arc from lo spanning the signed
 *  angle d (negative when the polar ASC correction reverses the zodiacal
 *  direction of the house sequence). */
function normArc(lon: number, lo: number, d: number): number {
  const off = signed(lon - lo);
  const inside = d >= 0 ? off >= 0 && off <= d : off >= d && off <= 0;
  return inside ? lon : mod(lon + Math.PI, TWO_PI);
}

/** Koch (birthplace): cusps are ascendants at ARMC +/- k/3 of the MC
 *  degree's diurnal semi-arc. Throws where the MC degree is circumpolar
 *  (|phi| >= 90 - eps, matching Swiss Ephemeris). */
export function housesKoch(armc: number, phi: number, eps: number): number[] {
  if (Math.abs(phi) >= Math.PI / 2 - eps) {
    throw new RangeError("koch undefined at polar latitudes");
  }
  const out = quadrantFrame(armc, phi, eps, false);
  const decMc = Math.asin(Math.sin(eps) * Math.sin(out[9]));
  const x = Math.tan(phi) * Math.tan(decMc);
  if (Math.abs(x) > 1) {
    throw new RangeError("koch undefined: MC degree circumpolar");
  }
  const sa = Math.PI / 2 + Math.asin(x); // diurnal semi-arc of the MC degree
  out[10] = ascOf(armc - (2 * sa) / 3, phi, eps);
  out[11] = ascOf(armc - sa / 3, phi, eps);
  out[1] = ascOf(armc + sa / 3, phi, eps);
  out[2] = ascOf(armc + (2 * sa) / 3, phi, eps);
  return fillOpposites(out);
}

/** Regiomontanus: equal divisions of the celestial equator; cusp poles
 *  tan P = tan(phi) sin(H). */
export function housesRegiomontanus(
  armc: number, phi: number, eps: number,
): number[] {
  const out = quadrantFrame(armc, phi, eps, true);
  for (const [k, h] of [[10, 30], [11, 60], [1, 120], [2, 150]] as const) {
    const pole = Math.atan(Math.tan(phi) * Math.sin(h * DEG));
    out[k] = eastOfMeridian(houseCusp(armc + h * DEG, pole, eps), armc, eps);
  }
  return fillOpposites(out);
}

/** Campanus: equal divisions of the prime vertical. House circles run
 *  through the horizon's north/south points; cusps are their ecliptic
 *  crossings, assigned in zodiacal order MC->ASC->IC. */
export function housesCampanus(armc: number, phi: number, eps: number): number[] {
  const out = quadrantFrame(armc, phi, eps, true);
  const n: [number, number, number] = [
    -Math.sin(phi) * Math.cos(armc), -Math.sin(phi) * Math.sin(armc), Math.cos(phi),
  ];
  const zen: [number, number, number] = [
    Math.cos(phi) * Math.cos(armc), Math.cos(phi) * Math.sin(armc), Math.sin(phi),
  ];
  const east: [number, number, number] = [-Math.sin(armc), Math.cos(armc), 0.0];
  const pole: [number, number, number] = [0.0, -Math.sin(eps), Math.cos(eps)];
  const cusp = (theta: number): number => {
    const t = theta * DEG;
    const v = [
      east[0] * Math.cos(t) + zen[0] * Math.sin(t),
      east[1] * Math.cos(t) + zen[1] * Math.sin(t),
      east[2] * Math.cos(t) + zen[2] * Math.sin(t),
    ];
    const m = [
      n[1] * v[2] - n[2] * v[1], n[2] * v[0] - n[0] * v[2], n[0] * v[1] - n[1] * v[0],
    ];
    const d = [
      m[1] * pole[2] - m[2] * pole[1],
      m[2] * pole[0] - m[0] * pole[2],
      m[0] * pole[1] - m[1] * pole[0],
    ];
    return mod(Math.atan2(d[1] * Math.cos(eps) + d[2] * Math.sin(eps), d[0]), TWO_PI);
  };
  for (const [k, theta] of [[10, 30], [11, 60], [1, 120], [2, 150]] as const) {
    out[k] = cusp(theta);
  }
  const mc = out[9];
  const asc = out[0];
  const dUp = signed(asc - mc);
  const dDn = signed(mod(mc + Math.PI, TWO_PI) - asc);
  for (const k of [10, 11]) out[k] = normArc(out[k], mc, dUp);
  for (const k of [1, 2]) out[k] = normArc(out[k], asc, dDn);
  // within each quadrant the two cusps must be in house order (away from
  // MC, away from ASC)
  if (Math.abs(signed(out[10] - mc)) > Math.abs(signed(out[11] - mc))) {
    [out[10], out[11]] = [out[11], out[10]];
  }
  if (Math.abs(signed(out[1] - asc)) > Math.abs(signed(out[2] - asc))) {
    [out[1], out[2]] = [out[2], out[1]];
  }
  return fillOpposites(out);
}

/** Alcabitius: trisect the Ascendant degree's semi-arcs in right ascension;
 *  project cusps along meridians. */
export function housesAlcabitius(
  armc: number, phi: number, eps: number,
): number[] {
  const out = quadrantFrame(armc, phi, eps, false);
  const dec = Math.asin(Math.sin(eps) * Math.sin(out[0]));
  const x = Math.max(-1.0, Math.min(1.0, Math.tan(phi) * Math.tan(dec)));
  const ad = Math.asin(x);
  const sda = Math.PI / 2 + ad; // diurnal semi-arc of the ASC degree
  const sna = Math.PI / 2 - ad;
  const ras: Array<[number, number]> = [
    [10, armc + sda / 3], [11, armc + (2 * sda) / 3],
    [1, armc + Math.PI - (2 * sna) / 3], [2, armc + Math.PI - sna / 3],
  ];
  for (const [k, ra] of ras) {
    out[k] = mod(Math.atan2(Math.sin(ra), Math.cos(ra) * Math.cos(eps)), TWO_PI);
  }
  return fillOpposites(out);
}

/** Morinus: equal RA divisions projected onto the ecliptic by great circles
 *  through the ecliptic poles. Latitude-independent. */
export function housesMorinus(armc: number, _phi: number, eps: number): number[] {
  return Array.from({ length: 12 }, (_, i) => mod(Math.atan2(
    Math.sin(armc + (i + 3) * 30 * DEG) * Math.cos(eps),
    Math.cos(armc + (i + 3) * 30 * DEG),
  ), TWO_PI));
}

/** Meridian (axial rotation): equal RA divisions projected along hour
 *  circles. Latitude-independent. */
export function housesMeridian(armc: number, _phi: number, eps: number): number[] {
  return Array.from({ length: 12 }, (_, i) => mod(Math.atan2(
    Math.sin(armc + (i + 3) * 30 * DEG),
    Math.cos(armc + (i + 3) * 30 * DEG) * Math.cos(eps),
  ), TWO_PI));
}

/** Polich-Page ('topocentric'): cusp poles tan P = (k/3) tan(phi). */
export function housesPolichPage(
  armc: number, phi: number, eps: number,
): number[] {
  const out = quadrantFrame(armc, phi, eps, true);
  const spec: Array<[number, number, number]> = [
    [10, 30, 1], [11, 60, 2], [1, 120, 2], [2, 150, 1],
  ];
  for (const [k, h, w] of spec) {
    const pole = Math.atan((Math.tan(phi) * w) / 3.0);
    out[k] = eastOfMeridian(houseCusp(armc + h * DEG, pole, eps), armc, eps);
  }
  return fillOpposites(out);
}

/** Vehlow: equal houses with the ASC at the middle of house 1. */
export function housesVehlow(armc: number, phi: number, eps: number): number[] {
  const asc = ascOf(armc, phi, eps);
  return Array.from({ length: 12 }, (_, i) => mod(asc - 15 * DEG + i * 30 * DEG, TWO_PI));
}

/**
 * Placidus cusps via the classic iterative scheme. Semi-arc derivation:
 * for ALL four intermediate cusps RA = ARMC + offset + f*AD with
 * AD = asin(tan(phi) tan(dec)); offsets 30/60/120/150, f = 1/3,2/3,2/3,1/3.
 * Undefined above the polar circles (as Placidus itself is).
 */
export function housesPlacidus(armc: number, phi: number, eps: number): number[] {
  const cusp = (offsetDeg: number, f: number): number => {
    let lam = mod(armc + offsetDeg * DEG, TWO_PI);
    for (let i = 0; i < 50; i++) {
      const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
      let x = Math.tan(phi) * Math.tan(dec);
      x = Math.max(-1.0, Math.min(1.0, x));
      const ad = Math.asin(x);
      const raI = mod(armc + offsetDeg * DEG + f * ad, TWO_PI);
      const lamNew = mod(
        Math.atan2(Math.sin(raI), Math.cos(raI) * Math.cos(eps)), TWO_PI,
      );
      if (Math.abs(mod(lamNew - lam + Math.PI, TWO_PI) - Math.PI) < 1e-10) {
        lam = lamNew;
        break;
      }
      lam = lamNew;
    }
    return lam;
  };

  const mc = mod(Math.atan2(Math.sin(armc), Math.cos(armc) * Math.cos(eps)), TWO_PI);
  const asc = mod(Math.atan2(
    Math.cos(armc),
    -(Math.sin(armc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)),
  ), TWO_PI);
  const cusps = new Array<number>(12).fill(0);
  cusps[0] = asc;
  cusps[9] = mc;
  cusps[10] = cusp(30, 1.0 / 3.0);
  cusps[11] = cusp(60, 2.0 / 3.0);
  cusps[1] = cusp(120, 2.0 / 3.0);
  cusps[2] = cusp(150, 1.0 / 3.0);
  cusps[3] = mod(mc + Math.PI, TWO_PI);
  cusps[6] = mod(asc + Math.PI, TWO_PI);
  cusps[4] = mod(cusps[10] + Math.PI, TWO_PI);
  cusps[5] = mod(cusps[11] + Math.PI, TWO_PI);
  cusps[7] = mod(cusps[1] + Math.PI, TWO_PI);
  cusps[8] = mod(cusps[2] + Math.PI, TWO_PI);
  return cusps;
}
