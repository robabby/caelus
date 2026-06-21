/**
 * caelus skyview -- apparent-sky framing for image prompts.
 *
 * Given an observer, an aim direction, a lens, and an output image size,
 * `skyView` projects the visible bodies into the frame: pixel position,
 * apparent size, brightness, Moon phase orientation, and a sky-state summary.
 * It also serializes a prompt. Caelus computes the geometry and photometry; the
 * image model owns color and atmosphere, guided by the directives.
 *
 * See docs/skyview.md for the model, the projection math, and the schema.
 */
import { DEG, mod, J2000, jdTT, precessEcliptic } from "./core.js";
import { Engine, BodyId, Observer, SIGNS, HouseSystem } from "./chart.js";
import { starApparent } from "./stars.js";
import {
  azAlt, pheno, refractTrueToApparent, DIAMETER_KM,
} from "./pheno.js";
import type { SyntheticRender } from "./synthetic.js";

type Vec3 = [number, number, number];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => {
  const n = norm(a);
  return [a[0] / n, a[1] / n, a[2] / n];
};
const clamp1 = (x: number): number => Math.max(-1, Math.min(1, x));

/** Direction (local horizontal frame: x east, y north, z up) for an azimuth
 *  (deg from true north, east positive) and altitude (deg). */
function dirFromAzAlt(azDeg: number, altDeg: number): Vec3 {
  const a = azDeg * DEG;
  const h = altDeg * DEG;
  return [Math.cos(h) * Math.sin(a), Math.cos(h) * Math.cos(a), Math.sin(h)];
}

const COMPASS16 = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];
function compassOf(azDeg: number): string {
  return COMPASS16[Math.round(mod(azDeg, 360) / 22.5) % 16];
}

/** Accept an azimuth as degrees or a compass point (`"W"`, `"WNW"`). */
function parseAzimuth(az: number | string): number {
  if (typeof az === "number") return mod(az, 360);
  const key = az.trim().toUpperCase();
  const i = COMPASS16.indexOf(key);
  if (i >= 0) return i * 22.5;
  const n = Number(key);
  if (Number.isFinite(n)) return mod(n, 360);
  throw new Error(`unknown azimuth '${az}' (degrees or a 16-point compass name)`);
}

export type SkyProjection = "rectilinear" | "fisheye";

/** A resolved lens: field of view and projection actually used. */
export interface SkyLens {
  name: string;
  focalLengthMm: number;
  sensorWidthMm: number;
  projection: SkyProjection;
  hfovDeg: number;
  vfovDeg: number;
}

/** Lens presets. Focal length is 35 mm-equivalent (full-frame, 36 mm wide).
 *  The preset carries the projection, as real optics do. */
const LENS_PRESETS: Record<string, { focalLengthMm: number; projection: SkyProjection }> = {
  ultrawide: { focalLengthMm: 14, projection: "fisheye" },
  wide: { focalLengthMm: 24, projection: "rectilinear" },
  standard: { focalLengthMm: 35, projection: "rectilinear" },
  normal: { focalLengthMm: 50, projection: "rectilinear" },
  portrait: { focalLengthMm: 85, projection: "rectilinear" },
  telephoto: { focalLengthMm: 135, projection: "rectilinear" },
  supertele: { focalLengthMm: 200, projection: "rectilinear" },
};

export const LENS_NAMES = Object.keys(LENS_PRESETS);

export type LensSpec =
  | string
  | { focalLengthMm: number; sensorWidthMm?: number; projection?: SkyProjection }
  | { hfovDeg: number; projection?: SkyProjection };

const SENSOR_MM = 36;
const hfovFromFocal = (focal: number, sensor: number): number =>
  (2 * Math.atan(sensor / (2 * focal))) / DEG;
const focalFromHfov = (hfovDeg: number, sensor: number): number =>
  sensor / (2 * Math.tan((hfovDeg * DEG) / 2));

function resolveLens(spec: LensSpec, width: number, height: number): SkyLens {
  let name = "custom";
  let projection: SkyProjection = "rectilinear";
  let focal: number;
  let sensor = SENSOR_MM;
  let hfovDeg: number;

  if (typeof spec === "string") {
    const p = LENS_PRESETS[spec];
    if (!p) throw new Error(`unknown lens '${spec}' (presets: ${LENS_NAMES.join(", ")})`);
    name = spec;
    focal = p.focalLengthMm;
    projection = p.projection;
    hfovDeg = hfovFromFocal(focal, sensor);
  } else if ("hfovDeg" in spec) {
    hfovDeg = spec.hfovDeg;
    projection = spec.projection ?? "rectilinear";
    focal = focalFromHfov(hfovDeg, sensor);
  } else {
    sensor = spec.sensorWidthMm ?? SENSOR_MM;
    focal = spec.focalLengthMm;
    projection = spec.projection ?? "rectilinear";
    hfovDeg = hfovFromFocal(focal, sensor);
  }

  const hfovR = hfovDeg * DEG;
  const vfovDeg = projection === "fisheye"
    ? hfovDeg * (height / width)
    : (2 * Math.atan(Math.tan(hfovR / 2) * (height / width))) / DEG;
  return {
    name,
    focalLengthMm: Math.round(focal * 10) / 10,
    sensorWidthMm: sensor,
    projection,
    hfovDeg: Math.round(hfovDeg * 100) / 100,
    vfovDeg: Math.round(vfovDeg * 100) / 100,
  };
}

export type TwilightStage = "day" | "civil" | "nautical" | "astronomical" | "night";

function twilightStage(sunAltDeg: number): TwilightStage {
  if (sunAltDeg > 0) return "day";
  if (sunAltDeg > -6) return "civil";
  if (sunAltDeg > -12) return "nautical";
  if (sunAltDeg > -18) return "astronomical";
  return "night";
}

/** Sky-brightness ceiling on the naked-eye limit by twilight stage. Night sets
 *  no ceiling of its own; there the site darkness ({@link BORTLE_LIMIT}) and the
 *  Moon decide the limit. */
const STAGE_CEILING: Record<TwilightStage, number> = {
  day: -4.0, civil: 1.5, nautical: 4.0, astronomical: 5.5, night: Infinity,
};

/** Effective naked-eye limiting magnitude: the more restrictive of the
 *  twilight-brightness ceiling and the site's dark-sky limit, then reduced when
 *  a bright Moon is up. With no Bortle class, the dark-site limit defaults to
 *  6.0 (suburban), matching the original behavior. */
function limitingMag(
  stage: TwilightStage, moonAltDeg: number | null, moonIllum: number | null,
  bortle: number | undefined,
): number {
  const bortleLimit = bortle !== undefined ? (BORTLE_LIMIT[Math.round(bortle)] ?? 6.0) : 6.0;
  let lim = Math.min(STAGE_CEILING[stage], bortleLimit);
  if (lim > 0 && moonAltDeg !== null && moonAltDeg > 0 && (moonIllum ?? 0) > 0.3) {
    lim -= 1.5 * (moonIllum ?? 0);
  }
  return Math.round(lim * 10) / 10;
}

const PHASE_NAMES = [
  "new moon", "waxing crescent", "first quarter", "waxing gibbous",
  "full moon", "waning gibbous", "last quarter", "waning crescent",
];
function moonPhaseName(illum: number, waxing: boolean): string {
  if (illum < 0.03) return "new moon";
  if (illum > 0.97) return "full moon";
  if (Math.abs(illum - 0.5) < 0.06) return waxing ? "first quarter" : "last quarter";
  if (illum < 0.5) return waxing ? "waxing crescent" : "waning crescent";
  return waxing ? "waxing gibbous" : "waning gibbous";
}

/** Image-plane angle (deg, 0 right, 90 up) to a clock position (12 up). */
function clockOf(angleDeg: number): string {
  let h = Math.round((90 - angleDeg) / 30) % 12;
  if (h <= 0) h += 12;
  return `${h} o'clock`;
}

/** UT Julian Day to an ISO-8601 UTC string (Meeus ch. 7, inverse). */
function jdToUtcIso(jd: number): string {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const dayF = b - d - Math.floor(30.6001 * e) + f;
  const day = Math.floor(dayF);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  let secs = Math.min(86399, Math.round((dayF - day) * 86400));
  const hh = Math.floor(secs / 3600); secs -= hh * 3600;
  const mm = Math.floor(secs / 60); const ss = secs - mm * 60;
  const p2 = (n: number): string => String(n).padStart(2, "0");
  const yr = year < 0 ? `-${String(-year).padStart(4, "0")}` : String(year).padStart(4, "0");
  return `${yr}-${p2(month)}-${p2(day)}T${p2(hh)}:${p2(mm)}:${p2(ss)}Z`;
}

function displayName(id: string): string {
  if (id.startsWith("star:")) return id.slice(5);
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** Merge engine-registered and opt-in render attrs; apply size, magnitude, colour. */
function applyRenderAttrs(
  body: SkyBody, id: string, render: SyntheticRender | undefined,
  lens: SkyLens, width: number, limit: number,
): void {
  if (!render) return;
  if (render.sizeDeg !== undefined) {
    body.angularDiameterDeg = Math.round(render.sizeDeg * 1e4) / 1e4;
    body.sizePx = Math.max(1, Math.round((render.sizeDeg * width) / lens.hfovDeg));
  }
  if (render.magnitude !== undefined) {
    body.magnitude = Math.round(render.magnitude * 100) / 100;
    body.nakedEye = id === "sun" || id === "moon" || render.magnitude <= limit;
    body.brightnessHint = brightnessDescriptor(body.magnitude, body.nakedEye);
  }
  if (render.color) body.color = render.color;
}

/** Map apparent magnitude to a rendering cue: how prominent the point should
 *  look in the image. This is deliberately decoupled from the body's true
 *  angular size, which is sub-pixel for a planet: in a photo a bright point's
 *  on-screen presence comes from brightness bloom, not its disk. Drives the
 *  prompt text, not the geometry. */
function brightnessDescriptor(mag: number | null, nakedEye: boolean): string | undefined {
  if (mag === null) return undefined;
  if (!nakedEye) return "faint, just at the visibility limit";
  if (mag <= -3) return "brilliant, the dominant point in the sky; render with a soft glow and slight bloom";
  if (mag <= -1) return "very bright, with a slight glow";
  if (mag <= 1) return "bright point of light";
  return "modest point of light";
}

// ICRS (J2000 equatorial) -> galactic rotation; rows are the galactic axes in
// equatorial coordinates. The inverse (galactic -> equatorial) is the transpose.
const ICRS_TO_GAL: Vec3[] = [
  [-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];
const ECL_OBLIQUITY_J2000 = 23.4392911 * DEG;

/** A point on the galactic equator (galactic longitude `lDeg`, latitude 0) as
 *  a J2000 ecliptic (lon, lat) pair in radians, ready for {@link precessEcliptic}. */
function galacticEquatorToEclJ2000(lDeg: number): [number, number] {
  const l = lDeg * DEG;
  const g: Vec3 = [Math.cos(l), Math.sin(l), 0]; // galactic Cartesian, b = 0
  // equatorial J2000 = ICRS_TO_GAL^T . g
  const xq = ICRS_TO_GAL[0][0] * g[0] + ICRS_TO_GAL[1][0] * g[1] + ICRS_TO_GAL[2][0] * g[2];
  const yq = ICRS_TO_GAL[0][1] * g[0] + ICRS_TO_GAL[1][1] * g[1] + ICRS_TO_GAL[2][1] * g[2];
  const zq = ICRS_TO_GAL[0][2] * g[0] + ICRS_TO_GAL[1][2] * g[1] + ICRS_TO_GAL[2][2] * g[2];
  // equatorial -> ecliptic: rotate about the x-axis by the J2000 obliquity.
  const e = ECL_OBLIQUITY_J2000;
  const lon = Math.atan2(yq * Math.cos(e) + zq * Math.sin(e), xq);
  const lat = Math.asin(clamp1(-yq * Math.sin(e) + zq * Math.cos(e)));
  return [lon, lat];
}

/** Naked-eye limiting magnitude by Bortle dark-sky class (1 pristine, 9 inner
 *  city). Omitting the class keeps the legacy suburban default of 6.0. */
const BORTLE_LIMIT: Record<number, number> = {
  1: 7.6, 2: 7.4, 3: 7.0, 4: 6.5, 5: 6.0, 6: 5.5, 7: 5.0, 8: 4.5, 9: 4.0,
};

/** The background star-field instruction, adapting to sky darkness. In a dark
 *  sky it tells the model to fill a dense field; in twilight or city sky it
 *  keeps the field sparse. The listed stars are always pinned regardless. */
function starfieldClause(
  limit: number, dark: boolean, moonBright: boolean, field: StarfieldSummary,
): string {
  if (field.complete) {
    return `The structured \`bodies\` data holds a complete naked-eye field of ${field.count} `
      + `stars to magnitude ${limit}; render each at its exact pixel as a fine point of light. `
      + "Do not add, move, or omit stars.";
  }
  if (!dark) {
    return "Beyond those you may add a few of the very brightest stars, but keep it sparse: "
      + "do not fill the sky with stars.";
  }
  if (moonBright) {
    return "Moonlight suppresses the faint stars: beyond those, keep the background field sparse.";
  }
  if (limit >= 6.5) {
    return `Beyond those, fill the background with a dense, deep field of faint stars down to about `
      + `magnitude ${limit}, with natural brightness variation; the listed stars stay exactly placed.`;
  }
  if (limit >= 5.5) {
    return `Beyond those, add a rich field of many hundreds of fainter stars, down to about magnitude ${limit}.`;
  }
  if (limit >= 4.5) {
    return `Beyond those, add a moderate scatter of stars, down to about magnitude ${limit}.`;
  }
  return "Beyond those, only a sparse scatter of stars is visible.";
}

// ---------------------------------------------------------------- public types

export interface SkyAim {
  /** Center azimuth: degrees from true north (east positive), or a compass
   *  point (`"W"`, `"WNW"`). */
  azimuth: number | string;
  /** Center altitude in degrees: 0 looks at the horizon, positive tilts up. */
  altitude: number;
}

export interface SkyViewSpec {
  observer: Observer;
  aim: SkyAim;
  lens: LensSpec;
  image: { width: number; height: number };
}

export interface SkyViewOptions {
  /** Atmospheric pressure (hPa) and temperature (C) for refraction. */
  pressure?: number;
  tempC?: number;
  /** Lift apparent altitudes by refraction. Defaults to true. */
  refraction?: boolean;
  /** Bortle dark-sky class, 1 (pristine) to 9 (inner city). Sets the night
   *  naked-eye limit and drives the background star-field density and Milky Way
   *  visibility. Omit for the legacy suburban default (limit 6.0). */
  bortle?: number;
  /** Include bright catalog stars. Defaults to true when a catalog is loaded. */
  includeStars?: boolean;
  /** Brightest-magnitude cutoff for stars (smaller is brighter). Default 2.5. */
  maxStarMag?: number;
  /** Cap on the number of stars returned. Default 40 (named) or 4000 (deep). */
  maxStars?: number;
  /** Pin the complete deep star field (needs the deep pack loaded). Defaults to
   *  on when the sky is dark and no bright Moon is up. */
  deepField?: boolean;
  /** Reference-frame overlays to project onto the sky (annotations, not part of
   *  a photoreal render). */
  overlays?: SkyViewOverlaysRequest;
  /** Bodies to place. Defaults to Sun, Moon, and the naked-eye planets. Any
   *  string id works for runtime bodies registered via {@link Engine.registerSource}. */
  bodies?: readonly string[];
  /** Per-body appearance overrides (size, magnitude, colour). Merged with
   *  {@link Engine.renderFor} for registered bodies; opts win on conflict. */
  render?: Record<string, SyntheticRender>;
}

export interface SkyBody {
  id: string;
  name: string;
  azimuthDeg: number;
  altitudeDeg: number;
  x: number;
  y: number;
  inFrame: boolean;
  sizePx: number;
  angularDiameterDeg: number;
  magnitude: number | null;
  /** Bright enough to see at this sky brightness. */
  nakedEye: boolean;
  /** How prominent to render the body, derived from its magnitude (a prompt
   *  cue, not a physical size). See {@link brightnessDescriptor}. */
  brightnessHint?: string;
  /** Moon only: illuminated fraction, phase name, and bright-limb orientation. */
  illum?: number;
  phaseName?: string;
  brightLimbAngleDeg?: number;
  brightLimbClock?: string;
  /** Authored colour hint for synthetic or overridden bodies. */
  color?: string;
  note?: string;
}

export interface SkyOffFrameBody {
  id: string;
  name: string;
  side: "left" | "right" | "above" | "below" | "behind";
  /** Angular distance from the frame center, degrees. */
  deltaDeg: number;
  azimuthDeg: number;
  altitudeDeg: number;
  magnitude: number | null;
}

export interface SkySummary {
  twilight: TwilightStage;
  sunAltitudeDeg: number;
  sunAzimuthDeg: number;
  limitingMag: number;
  moonAltitudeDeg: number | null;
  moonIllum: number | null;
  /** Azimuth of the brightest part of the sky (afterglow, then Moon), or null. */
  brightestAzimuthDeg: number | null;
  /** Pixel row of the true horizon, or null when it is behind the camera. */
  horizonY: number | null;
}

/** The Milky Way band's appearance in the frame. Visible only in a dark sky
 *  (astronomical twilight or night) without a bright Moon or heavy light
 *  pollution. The band is the galactic equator; its bright bulge is the
 *  galactic center in Sagittarius. */
export interface MilkyWay {
  /** Dark enough to see, and at least partly above the horizon. */
  visible: boolean;
  /** The band crosses the frame (implies `visible`). */
  inFrame: boolean;
  /** Pixel where the band enters the frame, and where it exits. */
  entry: { x: number; y: number } | null;
  exit: { x: number; y: number } | null;
  /** The galactic center (Sagittarius), the brightest part, when above the
   *  horizon: its pixel, whether it is in frame, its altitude, and which way it
   *  lies relative to the frame. */
  galacticCenter:
    | { x: number; y: number; inFrame: boolean; altitudeDeg: number; side: string }
    | null;
  /** Plain-language state, e.g. "crosses the frame, bright center in view" or
   *  "washed out by a bright Moon". */
  note: string;
}

/** The visible celestial pole: the fixed point the whole sky rotates about as
 *  time passes (north pole for northern observers, south for southern). Its
 *  altitude equals the observer's |latitude|. The rotation center for star
 *  trails and for reprojecting an animation frame to frame. */
export interface CelestialPole {
  which: "north" | "south";
  altitudeDeg: number;
  /** Pixel of the pole, or null when it is behind the camera. */
  x: number | null;
  y: number | null;
  inFrame: boolean;
}

/** What the star field in `bodies` represents. A `deep` field is the complete
 *  naked-eye sky to `limitingMag`, pinned at exact pixels (animation-grade); a
 *  `named` field is the bright catalog, to be fleshed out by the model. */
export interface StarfieldSummary {
  source: "deep" | "named" | "none";
  /** Stars placed in the frame. */
  count: number;
  /** The field is complete to `limitingMag` (deep pack); do not add stars. */
  complete: boolean;
  limitingMag: number;
}

/** Which reference frames to project. The ecliptic, the zodiac signs (its 30
 *  degree divisions), the house cusps and angles, and the constellation figure
 *  lines. These are annotations: real reference frames drawn over the sky, not
 *  things a camera sees. */
export interface SkyViewOverlaysRequest {
  ecliptic?: boolean;
  signs?: boolean;
  houses?: boolean;
  constellations?: boolean;
  /** House system for the cusps. Defaults to Placidus. */
  houseSystem?: HouseSystem;
}

/** A labeled point projected into the frame (sign, house, constellation name). */
export interface OverlayMark {
  text: string;
  x: number;
  y: number;
  /** Ecliptic longitude (deg), for signs and house cusps. */
  lon?: number;
}

/** An in-frame polyline (the ecliptic, a constellation figure stroke). */
export interface OverlayLine {
  label?: string;
  points: Array<{ x: number; y: number }>;
}

/** Projected reference-frame overlays. Each is null when not requested; arrays
 *  hold only the in-frame parts. Pixels match the bodies' coordinate system. */
export interface SkyViewOverlays {
  ecliptic: OverlayLine[] | null;
  signs: OverlayMark[] | null;
  houses: OverlayMark[] | null;
  constellations: { lines: OverlayLine[]; labels: OverlayMark[] } | null;
}

/** One layer of the hybrid render: what Caelus computes and the pipeline
 *  composites locally over the image-model background plate. */
export interface RenderLayer {
  kind: "bodies" | "stars" | "milkyWay" | "overlays";
  /** The layer has content in this frame. */
  present: boolean;
  /** Items in the layer (bodies, stars, figure strokes...). */
  count: number;
  /** How to composite this layer locally, over the plate. */
  composite: string;
}

/**
 * A machine-readable render contract for a hybrid pipeline: ask an image model
 * for a body-free background plate, then composite the computed layers (bodies,
 * stars, the Milky Way, overlays) locally at their exact pixels. The image model
 * supplies atmosphere; Caelus supplies the physically correct objects. This is
 * the structured complement to `prompt`, which is for humans and image models.
 */
export interface RenderPlan {
  /** The body-free sky/atmosphere plate to generate with an image model. */
  background: {
    prompt: string;
    width: number;
    height: number;
    /** Hard constraints on the plate (no bodies, horizon row, even sky). */
    constraints: string[];
  };
  /** Layers to composite locally; do not ask the model to draw these. */
  layers: RenderLayer[];
  /** How to drive an animation. `static` for a single frame. */
  animation: {
    strategy: "static" | "sequence-composite";
    /** Sidereal rotation of the sky about the pole, degrees/hour. */
    rotationDegPerHour: number;
    pole: CelestialPole;
    notes: string;
  };
  /** Post-processing and grading notes for the composite. */
  postprocess: string[];
}

export interface SkyViewResult {
  instant: { jdUt: number; utc: string };
  observer: Observer;
  aim: { azimuthDeg: number; altitudeDeg: number; compass: string };
  lens: SkyLens;
  image: { width: number; height: number };
  sky: SkySummary;
  bodies: SkyBody[];
  offFrame: SkyOffFrameBody[];
  milkyWay: MilkyWay;
  pole: CelestialPole;
  starfield: StarfieldSummary;
  overlays: SkyViewOverlays | null;
  renderPlan: RenderPlan;
  directives: string[];
  prompt: string;
}

// ------------------------------------------------------------------- main entry

/**
 * Project the visible sky into an image frame for a place, instant, aim, and
 * lens. Returns each in-frame body's pixel position, apparent size, brightness,
 * and (for the Moon) phase orientation, a sky-state summary, the bright bodies
 * just outside the frame, and a serialized prompt.
 *
 * Caelus computes geometry and photometry only. It does not render an image;
 * the `prompt` and `directives` hand color and atmosphere to an image model.
 *
 * @param engine The engine used to evaluate positions.
 * @param jdUt The instant, Julian Day (UT). For "at sunset", resolve it first
 *   with `riseSet(engine, "sun", jdStart, lat, lonEast, "set")`.
 * @param view Observer, aim (azimuth and altitude), lens, and image size.
 * @param opts Refraction inputs, star selection, and the body set.
 * @returns A {@link SkyViewResult}.
 * @example
 * ```ts
 * const set = riseSet(engine, "sun", julianDay(2026, 6, 21), 47.6, -122.3, "set")!;
 * const view = skyView(engine, set, {
 *   observer: { lat: 47.6, lonEast: -122.3, altM: 9 },
 *   aim: { azimuth: "W", altitude: 5 },
 *   lens: "normal",
 *   image: { width: 1024, height: 683 },
 * });
 * view.bodies.find((b) => b.id === "moon")?.brightLimbClock;
 * ```
 */
export function skyView(
  engine: Engine, jdUt: number, view: SkyViewSpec, opts: SkyViewOptions = {},
): SkyViewResult {
  const { lat, lonEast, altM } = view.observer;
  const { width, height } = view.image;
  if (!(width > 0) || !(height > 0)) {
    throw new Error("image width and height must be positive");
  }
  const aimAz = parseAzimuth(view.aim.azimuth);
  const aimAlt = view.aim.altitude;
  const lens = resolveLens(view.lens, width, height);
  const pressure = opts.pressure ?? 1013.25;
  const tempC = opts.tempC ?? 15.0;
  const refract = opts.refraction ?? true;

  // Camera basis from the aim. `right` is horizontal (no roll); near the zenith
  // the up reference falls back to north.
  const F = dirFromAzAlt(aimAz, aimAlt);
  let rightRaw = cross(F, [0, 0, 1]);
  if (norm(rightRaw) < 1e-6) rightRaw = cross(F, [0, 1, 0]);
  const right = unit(rightRaw);
  const up = cross(right, F); // unit: right and F are orthonormal

  const hfovR = lens.hfovDeg * DEG;
  const vfovR = lens.vfovDeg * DEG;
  const tanH = Math.tan(hfovR / 2);
  const tanV = Math.tan(vfovR / 2);

  type Placed = {
    altApp: number; x: number; y: number; inFrame: boolean;
    deltaDeg: number; side: SkyOffFrameBody["side"];
  };
  const place = (azDeg: number, altTrueDeg: number, refractThis = refract): Placed => {
    const altApp = refractThis ? refractTrueToApparent(altTrueDeg, pressure, tempC) : altTrueDeg;
    const V = dirFromAzAlt(azDeg, altApp);
    const f = dot(V, F);
    const rr = dot(V, right);
    const uu = dot(V, up);
    let xn: number;
    let yn: number;
    let inFrame: boolean;
    if (lens.projection === "rectilinear") {
      if (f > 1e-9) {
        xn = (rr / f) / tanH;
        yn = (uu / f) / tanV;
        inFrame = Math.abs(xn) <= 1 && Math.abs(yn) <= 1;
      } else {
        xn = rr >= 0 ? Infinity : -Infinity;
        yn = uu >= 0 ? Infinity : -Infinity;
        inFrame = false;
      }
    } else {
      const theta = Math.acos(clamp1(f));
      const psi = Math.atan2(uu, rr);
      xn = (theta * Math.cos(psi)) / (hfovR / 2);
      yn = (theta * Math.sin(psi)) / (vfovR / 2);
      inFrame = Math.abs(xn) <= 1 && Math.abs(yn) <= 1;
    }
    const deltaDeg = Math.acos(clamp1(f)) / DEG;
    let side: SkyOffFrameBody["side"] = "behind";
    if (f > 0) {
      side = Math.abs(xn) >= Math.abs(yn)
        ? (xn > 0 ? "right" : "left")
        : (yn > 0 ? "above" : "below");
    }
    const x = Number.isFinite(xn) ? Math.round(((xn + 1) / 2) * width) : NaN;
    const y = Number.isFinite(yn) ? Math.round(((1 - yn) / 2) * height) : NaN;
    return { altApp, x, y, inFrame, deltaDeg, side };
  };

  // Sun and Moon up front: they drive twilight, limiting magnitude, the sky
  // gradient, and the Moon's bright-limb orientation.
  const sunPos = engine.position("sun", jdUt);
  const [sunAz, sunAltTrue] = azAlt(engine.data, sunPos.lon, sunPos.lat, jdUt, lat, lonEast);
  const stage = twilightStage(sunAltTrue);

  const moonPos = engine.position("moon", jdUt);
  const [moonAz, moonAltTrue] = azAlt(engine.data, moonPos.lon, moonPos.lat, jdUt, lat, lonEast);
  const moonPheno = pheno(engine, "moon", jdUt);
  const moonIllum = moonPheno.phase;
  const moonWaxing = mod(moonPos.lon - sunPos.lon, 360) < 180;
  const moonUp = moonAltTrue > 0;

  const bortle = opts.bortle;
  const limit = limitingMag(stage, moonUp ? moonAltTrue : null, moonIllum, bortle);
  const skyIsDark = stage === "astronomical" || stage === "night";
  const moonBright = moonUp && moonIllum > 0.55;

  let brightestAz: number | null = null;
  if (sunAltTrue > -18) brightestAz = sunAz;
  else if (moonUp && moonIllum > 0.3) brightestAz = moonAz;

  const lowNote = (id: string, altApp: number): string | undefined => {
    if (altApp >= 5) return undefined;
    if (id === "sun") return "on the horizon: flattened by refraction, deep warm color";
    return "near the horizon: dimmed and reddened by the atmosphere";
  };

  const bodies: SkyBody[] = [];
  const offFrame: SkyOffFrameBody[] = [];

  const bodyIds: readonly string[] = opts.bodies ?? [
    "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn",
  ];

  for (const id of bodyIds) {
    const pos = id === "sun" ? sunPos : id === "moon" ? moonPos : engine.position(id, jdUt);
    const [az, altTrue] = id === "sun"
      ? [sunAz, sunAltTrue]
      : id === "moon"
        ? [moonAz, moonAltTrue]
        : azAlt(engine.data, pos.lon, pos.lat, jdUt, lat, lonEast);
    const p = place(az, altTrue);

    // The Sun stays in view as it touches the horizon (the sunset subject);
    // every other body must be above the horizon to appear.
    const visible = id === "sun" ? p.altApp > -1.0 : p.altApp > 0;
    if (!visible) continue;

    let magnitude: number | null = null;
    let diamDeg = 0;
    if (DIAMETER_KM[id] !== undefined) {
      const ph = pheno(engine, id, jdUt);
      magnitude = Math.round(ph.magnitude * 100) / 100;
      diamDeg = ph.diameter;
    }
    const sizePx = Math.max(diamDeg > 0 ? 1 : 0, Math.round((diamDeg * width) / lens.hfovDeg));
    const nakedEye = id === "sun" || id === "moon"
      || (magnitude !== null && magnitude <= limit);

    if (!p.inFrame) {
      if (nakedEye) {
        offFrame.push({
          id, name: displayName(id), side: p.side,
          deltaDeg: Math.round(p.deltaDeg * 10) / 10,
          azimuthDeg: Math.round(az * 10) / 10,
          altitudeDeg: Math.round(p.altApp * 10) / 10,
          magnitude,
        });
      }
      continue;
    }

    const body: SkyBody = {
      id, name: displayName(id),
      azimuthDeg: Math.round(az * 10) / 10,
      altitudeDeg: Math.round(p.altApp * 10) / 10,
      x: p.x, y: p.y, inFrame: true,
      sizePx, angularDiameterDeg: Math.round(diamDeg * 1e4) / 1e4,
      magnitude, nakedEye,
      brightnessHint: brightnessDescriptor(magnitude, nakedEye),
      note: lowNote(id, p.altApp),
    };

    if (id === "moon") {
      body.illum = Math.round(moonIllum * 1000) / 1000;
      body.phaseName = moonPhaseName(moonIllum, moonWaxing);
      // Bright limb points along the great circle from Moon toward Sun.
      const M = dirFromAzAlt(moonAz, moonAltTrue);
      const S = dirFromAzAlt(sunAz, sunAltTrue);
      const t = unit([
        S[0] - dot(S, M) * M[0], S[1] - dot(S, M) * M[1], S[2] - dot(S, M) * M[2],
      ]);
      const angle = mod(Math.atan2(dot(t, up), dot(t, right)) / DEG, 360);
      body.brightLimbAngleDeg = Math.round(angle * 10) / 10;
      body.brightLimbClock = clockOf(angle);
    }
    const authored = {
      ...engine.renderFor(id),
      ...opts.render?.[id],
    };
    applyRenderAttrs(body, id, Object.keys(authored).length ? authored : undefined, lens, width, limit);
    bodies.push(body);
  }

  // Stars. With the deep pack loaded and a dark sky, pin the complete naked-eye
  // field to the limiting magnitude (animation-grade, exact). Otherwise place
  // the bright named catalog and let the directive ask the model to fill the
  // fainter field. A Bortle class shows named stars to the limit; without one,
  // the legacy bright-only default keeps existing output unchanged.
  const wantStars = opts.includeStars ?? true;
  const deep = engine.data.deepStars;
  const useDeep = wantStars && deep !== undefined
    && (opts.deepField ?? (skyIsDark && !moonBright));
  const starMagLimit = opts.maxStarMag ?? (bortle !== undefined ? limit : 2.5);
  const starCap = Math.min(starMagLimit, limit);
  let starfield: StarfieldSummary = { source: "none", count: 0, complete: false, limitingMag: limit };

  const toStarBody = (name: string, mag: number, az: number, p: Placed): SkyBody => ({
    id: `star:${name}`, name,
    azimuthDeg: Math.round(az * 10) / 10,
    altitudeDeg: Math.round(p.altApp * 10) / 10,
    x: p.x, y: p.y, inFrame: true,
    sizePx: 0, angularDiameterDeg: 0,
    magnitude: Math.round(mag * 100) / 100, nakedEye: true,
    brightnessHint: brightnessDescriptor(Math.round(mag * 100) / 100, true),
  });

  if (useDeep && deep) {
    const jde = jdTT(jdUt);
    const found: SkyBody[] = [];
    for (const name in deep.stars) {
      const s = deep.stars[name];
      if (s.mag > limit) continue;
      const [lonR, latR] = starApparent(engine.data, s, jde);
      const [az, altTrue] = azAlt(engine.data, lonR / DEG, latR / DEG, jdUt, lat, lonEast);
      const p = place(az, altTrue);
      if (p.altApp <= 0 || !p.inFrame) continue;
      found.push(toStarBody(name, s.mag, az, p));
    }
    found.sort((a, b) => (a.magnitude ?? 99) - (b.magnitude ?? 99));
    const capped = found.slice(0, opts.maxStars ?? 4000);
    bodies.push(...capped);
    starfield = { source: "deep", count: capped.length, complete: true, limitingMag: limit };
  } else if (wantStars && engine.starNames().length > 0 && starCap > -10) {
    const found: SkyBody[] = [];
    for (const name of engine.starNames()) {
      const s = engine.fixedStar(name, jdUt);
      if (s.mag > starCap) continue;
      const [az, altTrue] = azAlt(engine.data, s.lon, s.lat, jdUt, lat, lonEast);
      const p = place(az, altTrue);
      if (p.altApp <= 0 || !p.inFrame) continue;
      found.push(toStarBody(name, s.mag, az, p));
    }
    found.sort((a, b) => (a.magnitude ?? 99) - (b.magnitude ?? 99));
    const capped = found.slice(0, opts.maxStars ?? (bortle !== undefined ? 250 : 40));
    bodies.push(...capped);
    starfield = { source: "named", count: capped.length, complete: false, limitingMag: limit };
  }

  // Horizon row at the center azimuth: the geometric horizon (no refraction, it
  // is a ground reference, not a body). Exact for a no-roll rectilinear camera;
  // approximate (a curve's midpoint) for fisheye.
  const horizon = place(aimAz, 0, false);
  const horizonY = Number.isFinite(horizon.y) ? horizon.y : null;

  // Keep "just out of frame" honest: only bodies in front and within one
  // horizontal field of the center, nearest first.
  const offMax = Math.max(lens.hfovDeg, lens.vfovDeg);
  const offNear = offFrame
    .filter((o) => o.side !== "behind" && o.deltaDeg <= offMax)
    .sort((a, b) => a.deltaDeg - b.deltaDeg);
  offFrame.length = 0;
  offFrame.push(...offNear);

  // Milky Way band: sample the galactic equator, project it, and report where
  // it crosses the frame and where its bright center (Sagittarius) sits. Visible
  // only in a dark sky without a bright Moon or heavy light pollution.
  const mwDark = skyIsDark && !moonBright && (bortle === undefined || bortle <= 6);
  type GalSamp = { l: number; x: number; y: number; inFrame: boolean; altApp: number; side: string };
  const galSamples: GalSamp[] = [];
  let gcSamp: GalSamp | null = null;
  for (let l = 0; l < 360; l += 2) {
    const [lonR, latR] = galacticEquatorToEclJ2000(l);
    const [lonD, latD] = precessEcliptic(lonR, latR, J2000, jdUt);
    const [az, altTrue] = azAlt(engine.data, lonD / DEG, latD / DEG, jdUt, lat, lonEast);
    const pl = place(az, altTrue, false); // diffuse band: no refraction
    const s: GalSamp = { l, x: pl.x, y: pl.y, inFrame: pl.inFrame, altApp: pl.altApp, side: pl.side };
    galSamples.push(s);
    if (l === 0) gcSamp = s;
  }
  const galUp = galSamples.filter((s) => s.altApp > 0);
  const galInFrame = galUp.filter((s) => s.inFrame && Number.isFinite(s.x));
  const visible = mwDark && galUp.length > 0;
  let entry: { x: number; y: number } | null = null;
  let exit: { x: number; y: number } | null = null;
  if (galInFrame.length >= 2) {
    const byX = [...galInFrame].sort((a, b) => a.x - b.x);
    entry = { x: byX[0].x, y: byX[0].y };
    exit = { x: byX[byX.length - 1].x, y: byX[byX.length - 1].y };
  }
  const gcUp = gcSamp !== null && gcSamp.altApp > 0 && Number.isFinite(gcSamp.x);
  const galacticCenter = gcUp && gcSamp !== null
    ? {
      x: gcSamp.x, y: gcSamp.y, inFrame: gcSamp.inFrame,
      altitudeDeg: Math.round(gcSamp.altApp * 10) / 10, side: gcSamp.side,
    }
    : null;
  let mwNote: string;
  if (!mwDark) {
    mwNote = moonBright ? "washed out by a bright Moon"
      : (bortle !== undefined && bortle > 6) ? "lost to light pollution"
        : "the sky is too bright (daylight or twilight)";
  } else if (galUp.length === 0) {
    mwNote = "the galactic plane is entirely below the horizon";
  } else if (galInFrame.length === 0) {
    mwNote = "above the horizon but outside this frame";
  } else if (galacticCenter?.inFrame) {
    mwNote = "crosses the frame, with the bright center in view";
  } else {
    mwNote = `crosses the frame; the bright center is ${gcUp ? "above the horizon, off-frame" : "below the horizon"}`;
  }
  const milkyWay: MilkyWay = {
    visible, inFrame: visible && galInFrame.length > 0, entry, exit, galacticCenter, note: mwNote,
  };

  const fieldClause = starfieldClause(limit, skyIsDark, moonBright, starfield);

  // The visible celestial pole: the sky's rotation center. Azimuth 0 (north) or
  // 180 (south), altitude |lat|.
  const poleAltTrue = Math.abs(lat);
  const polePlace = place(lat >= 0 ? 0 : 180, poleAltTrue, false);
  const pole: CelestialPole = {
    which: lat >= 0 ? "north" : "south",
    altitudeDeg: Math.round(poleAltTrue * 10) / 10,
    x: Number.isFinite(polePlace.x) ? polePlace.x : null,
    y: Number.isFinite(polePlace.y) ? polePlace.y : null,
    inFrame: polePlace.inFrame,
  };

  // Reference-frame overlays: the ecliptic, zodiac signs, house cusps, and
  // constellation figures projected into the frame. Annotations, not photoreal.
  let overlays: SkyViewOverlays | null = null;
  if (opts.overlays) {
    const req = opts.overlays;
    overlays = { ecliptic: null, signs: null, houses: null, constellations: null };
    // Project an ecliptic-of-date point (deg) to a frame placement.
    const projEcl = (lonDeg: number, latDeg: number): Placed => {
      const [az, altTrue] = azAlt(engine.data, lonDeg, latDeg, jdUt, lat, lonEast);
      return place(az, altTrue, false);
    };
    // In-frame polylines from a path of ecliptic-of-date [lon, lat] points.
    const polylines = (pts: Array<[number, number]>): Array<{ x: number; y: number }[]> => {
      const segs: Array<{ x: number; y: number }[]> = [];
      let cur: { x: number; y: number }[] = [];
      for (const [lo, la] of pts) {
        const p = projEcl(lo, la);
        if (p.inFrame && Number.isFinite(p.x)) cur.push({ x: p.x, y: p.y });
        else { if (cur.length > 1) segs.push(cur); cur = []; }
      }
      if (cur.length > 1) segs.push(cur);
      return segs;
    };

    if (req.ecliptic) {
      const path: Array<[number, number]> = [];
      for (let l = 0; l <= 360; l += 1) path.push([l, 0]);
      overlays.ecliptic = polylines(path).map((s) => ({ label: "ecliptic", points: s }));
    }
    if (req.signs) {
      const marks: OverlayMark[] = [];
      for (let k = 0; k < 12; k++) {
        const lon = k * 30 + 15; // sign midpoint, for the label
        const p = projEcl(lon, 0);
        if (p.inFrame && Number.isFinite(p.x)) marks.push({ text: SIGNS[k], x: p.x, y: p.y, lon });
      }
      overlays.signs = marks;
    }
    if (req.houses) {
      const marks: OverlayMark[] = [];
      try {
        const chart = engine.chartAt(jdUt, lat, lonEast, { houseSystem: req.houseSystem ?? "placidus" });
        for (let i = 0; i < 12; i++) {
          const p = projEcl(chart.cusps[i], 0);
          if (p.inFrame && Number.isFinite(p.x)) marks.push({ text: `H${i + 1}`, x: p.x, y: p.y, lon: chart.cusps[i] });
        }
        const ang: Array<[string, number]> = [
          ["ASC", chart.angles.asc], ["MC", chart.angles.mc],
          ["DSC", mod(chart.angles.asc + 180, 360)], ["IC", mod(chart.angles.mc + 180, 360)],
        ];
        for (const [t, lo] of ang) {
          const p = projEcl(lo, 0);
          if (p.inFrame && Number.isFinite(p.x)) marks.push({ text: t, x: p.x, y: p.y, lon: lo });
        }
      } catch { /* polar house failure: leave what was collected */ }
      overlays.houses = marks;
    }
    if (req.constellations && engine.data.constellations) {
      const jde = jdTT(jdUt);
      const lines: OverlayLine[] = [];
      const toDate = (lo: number, la: number): [number, number] => {
        const [l2, b2] = precessEcliptic(lo * DEG, la * DEG, J2000, jde);
        return [l2 / DEG, b2 / DEG];
      };
      for (const fig of engine.data.constellations.lines) {
        for (const seg of fig.segs) {
          const ofDate = seg.map(([lo, la]) => toDate(lo, la));
          for (const s of polylines(ofDate)) lines.push({ label: fig.con, points: s });
        }
      }
      const labels: OverlayMark[] = [];
      for (const lab of engine.data.constellations.labels) {
        const [lo, la] = toDate(lab.lon, lab.lat);
        const p = projEcl(lo, la);
        if (p.inFrame && Number.isFinite(p.x)) labels.push({ text: lab.name, x: p.x, y: p.y });
      }
      overlays.constellations = { lines, labels };
    }
  }

  const sky: SkySummary = {
    twilight: stage,
    sunAltitudeDeg: Math.round(sunAltTrue * 10) / 10,
    sunAzimuthDeg: Math.round(sunAz * 10) / 10,
    limitingMag: limit,
    moonAltitudeDeg: Math.round(moonAltTrue * 10) / 10,
    moonIllum: Math.round(moonIllum * 1000) / 1000,
    brightestAzimuthDeg: brightestAz === null ? null : Math.round(brightestAz * 10) / 10,
    horizonY,
  };

  const directives = buildDirectives(lens, sky, milkyWay, fieldClause, overlays, width, height, aimAz, aimAlt);
  const prompt = buildPrompt(bodies, offFrame, directives, starfield);
  const renderPlan = buildRenderPlan(sky, bodies, starfield, milkyWay, overlays, pole, directives, width, height);

  return {
    instant: { jdUt, utc: jdToUtcIso(jdUt) },
    observer: { lat, lonEast, ...(altM !== undefined ? { altM } : {}) },
    aim: { azimuthDeg: Math.round(aimAz * 10) / 10, altitudeDeg: aimAlt, compass: compassOf(aimAz) },
    lens,
    image: { width, height },
    sky,
    bodies,
    offFrame,
    milkyWay,
    pole,
    starfield,
    overlays,
    renderPlan,
    directives,
    prompt,
  };
}

// --------------------------------------------------------------- sequences

export interface SkyViewSequenceSpec {
  /** First frame instant, Julian Day (UT). */
  startJdUt: number;
  /** Number of frames (>= 1). */
  frames: number;
  /** Minutes between frames. Provide this or `endJdUt`. */
  stepMinutes?: number;
  /** Last frame instant (UT); the step is `(end - start) / (frames - 1)`.
   *  Takes precedence over `stepMinutes` when both are given. */
  endJdUt?: number;
}

export interface SkyViewSequence {
  /** One full {@link SkyViewResult} per frame, in time order. */
  frames: SkyViewResult[];
  count: number;
  startJdUt: number;
  endJdUt: number;
  stepMinutes: number;
  durationMinutes: number;
  /** Sidereal rotation of the sky about the celestial pole: 15.041 deg/hour. */
  rotationDegPerHour: number;
  /** Sky rotation between consecutive frames, degrees about the pole. */
  rotationDegPerStep: number;
}

const SIDEREAL_DEG_PER_MIN = 360 / 1436.0682; // 360 deg per sidereal day

/**
 * A time sequence of {@link skyView} frames for the same place, aim, and lens:
 * the keyframes for an accurate night-sky animation. Each frame is a complete,
 * physically exact spec; across frames the sky rotates about the pole, the Moon
 * drifts and changes phase, twilight evolves, and the Milky Way wheels. The
 * geometry is continuous, so the frames are temporally coherent; supplying them
 * as control images (or reprojecting one rendered plate by the per-frame
 * rotation) is how to keep the rendered output coherent too.
 *
 * @param engine The engine used to evaluate positions.
 * @param view Observer, aim, lens, and image size, shared by every frame.
 * @param seq Frame count and timing (`stepMinutes` or `endJdUt`).
 * @param opts Per-frame {@link SkyViewOptions} (bortle, refraction, bodies).
 * @returns A {@link SkyViewSequence}: the frames plus timing and the sky's
 *   per-step rotation about the celestial pole (each frame carries its `pole`).
 * @example
 * ```ts
 * // One frame per 6 minutes for two hours from astronomical dusk
 * const seq = skyViewSequence(engine, view, { startJdUt: dusk, frames: 21, stepMinutes: 6 });
 * seq.rotationDegPerStep;        // ~1.5 deg of sky rotation per frame
 * seq.frames[0].pole;            // the rotation center in pixels
 * ```
 */
export function skyViewSequence(
  engine: Engine, view: SkyViewSpec, seq: SkyViewSequenceSpec, opts: SkyViewOptions = {},
): SkyViewSequence {
  if (!Number.isInteger(seq.frames) || seq.frames < 1) {
    throw new Error("frames must be a positive integer");
  }
  let stepDays = 0;
  if (seq.frames > 1) {
    if (seq.endJdUt !== undefined) {
      stepDays = (seq.endJdUt - seq.startJdUt) / (seq.frames - 1);
    } else if (seq.stepMinutes !== undefined) {
      stepDays = seq.stepMinutes / 1440;
    } else {
      throw new Error("provide stepMinutes or endJdUt for a multi-frame sequence");
    }
  }
  const frames: SkyViewResult[] = [];
  for (let i = 0; i < seq.frames; i++) {
    frames.push(skyView(engine, seq.startJdUt + i * stepDays, view, opts));
  }
  const stepMinutes = stepDays * 1440;
  return {
    frames,
    count: frames.length,
    startJdUt: seq.startJdUt,
    endJdUt: seq.startJdUt + (seq.frames - 1) * stepDays,
    stepMinutes,
    durationMinutes: stepMinutes * (seq.frames - 1),
    rotationDegPerHour: SIDEREAL_DEG_PER_MIN * 60,
    rotationDegPerStep: SIDEREAL_DEG_PER_MIN * stepMinutes,
  };
}

// ------------------------------------------------------------- serialization

function buildDirectives(
  lens: SkyLens, sky: SkySummary, milkyWay: MilkyWay, fieldClause: string,
  overlays: SkyViewOverlays | null,
  width: number, height: number, aimAz: number, aimAlt: number,
): string[] {
  const out: string[] = [];
  out.push(
    `Frame ${width}x${height}px, ${lens.name} lens (${lens.focalLengthMm}mm, `
    + `${lens.hfovDeg} deg horizontal field), ${lens.projection} projection. `
    + `Looking ${compassOf(aimAz)} (azimuth ${Math.round(aimAz)} deg) at `
    + `altitude ${aimAlt} deg.`,
  );
  if (lens.projection === "rectilinear" && lens.hfovDeg > 100) {
    out.push("Field of view exceeds 100 deg on a rectilinear projection; corners stretch heavily. Consider the ultrawide (fisheye) lens.");
  }
  if (sky.horizonY !== null && sky.horizonY >= 0 && sky.horizonY <= height) {
    const pct = Math.round((sky.horizonY / height) * 100);
    out.push(`Keep the horizon level and straight at y=${sky.horizonY} (${pct}% down the frame).`);
  } else {
    out.push("The true horizon is outside the frame.");
  }
  if (sky.twilight === "night") {
    // Sun below -18 deg: no solar twilight. A warm horizon glow would be a
    // physical impossibility here; the sky is dark to the horizon, neutral-lit
    // by the Moon if one is up.
    const moonLit = sky.moonAltitudeDeg !== null && sky.moonAltitudeDeg > 0 && (sky.moonIllum ?? 0) > 0.3;
    out.push(
      `Deep night: the Sun is ${Math.abs(sky.sunAltitudeDeg).toFixed(1)} deg below the horizon, no twilight. `
      + (moonLit
        ? "Moonlight casts a soft, neutral blue-grey wash, brighter near the Moon. "
        : "The sky is dark all the way down to the horizon (at most faint airglow); do not paint a warm twilight glow. ")
      + "You choose exact colors.",
    );
  } else {
    const sunWhere = sky.sunAltitudeDeg >= 0 ? "above" : "below";
    const grad = sky.brightestAzimuthDeg !== null
      ? `Render the sky brightest toward ${compassOf(sky.brightestAzimuthDeg)} `
        + `(azimuth ${Math.round(sky.brightestAzimuthDeg)} deg), fading across the frame. `
      : "";
    out.push(
      `${sky.twilight} twilight: the Sun is ${Math.abs(sky.sunAltitudeDeg).toFixed(1)} deg ${sunWhere} `
      + `the horizon. ${grad}You choose exact colors; keep it warm low and cool high.`,
    );
  }
  out.push(
    `Naked-eye limit about magnitude ${sky.limitingMag}. Render every body listed below. ${fieldClause}`,
  );
  if (milkyWay.visible && milkyWay.inFrame && milkyWay.entry && milkyWay.exit) {
    const gc = milkyWay.galacticCenter;
    const center = gc?.inFrame
      ? `Its brightest part, the galactic center in Sagittarius, is at (${gc.x},${gc.y}). `
      : gc
        ? `Its bright center (Sagittarius) lies off-frame ${gc.side}. `
        : "Its bright center is below the horizon, so the band here is the fainter outer arm. ";
    out.push(
      `The Milky Way crosses the frame, entering near (${milkyWay.entry.x},${milkyWay.entry.y}) `
      + `and exiting near (${milkyWay.exit.x},${milkyWay.exit.y}). ${center}`
      + "Render it as a soft, mottled band of unresolved starlight, dustier and brighter toward the "
      + "center; not individual stars.",
    );
  }
  if (overlays) {
    const parts: string[] = [];
    if (overlays.ecliptic?.length) parts.push("the ecliptic line");
    if (overlays.signs?.length) {
      parts.push(`zodiac signs (${overlays.signs.map((s) => s.text).join(", ")})`);
    }
    if (overlays.houses?.length) parts.push("house cusps and the angles (ASC, MC)");
    if (overlays.constellations?.labels.length) {
      const names = overlays.constellations.labels.map((l) => l.text);
      const shown = names.slice(0, 8).join(", ") + (names.length > 8 ? ", ..." : "");
      parts.push(`constellation figures (${shown})`);
    }
    if (parts.length) {
      out.push(
        `OVERLAY (optional annotation layer, not part of a photoreal sky): the structured \`overlays\` `
        + `data holds exact pixels for ${parts.join("; ")}. Draw these only for an annotated star chart, `
        + "as thin lines and small labels over the sky.",
      );
    }
  }
  out.push(
    "You set color, light, and atmosphere. Do not move, resize, or recolor the placed "
    + "bodies for composition; their positions and sizes are physically correct.",
  );
  return out;
}

const ANCHOR_MAG = 2.5; // stars brighter than this are listed individually

function buildPrompt(
  bodies: SkyBody[], offFrame: SkyOffFrameBody[], directives: string[],
  starfield: StarfieldSummary,
): string {
  const lines: string[] = [];
  lines.push("PHOTOREALISTIC SKY, exact placement (pixel origin top-left):");
  lines.push("");
  lines.push("SCENE:");
  for (const d of directives) lines.push(`- ${d}`);
  lines.push("");
  lines.push("BODIES (render EVERY one at its given pixel; do not relocate, rescale, or omit any):");
  if (bodies.length === 0) lines.push("- none in frame");
  // List the bright anchors individually; a large faint field is summarized,
  // with its exact pixels carried in the structured data.
  const isField = (b: SkyBody) => b.id.startsWith("star:") && (b.magnitude ?? 99) > ANCHOR_MAG;
  const fieldStars = bodies.filter(isField);
  for (const b of bodies) {
    if (isField(b)) continue;
    const parts = [`${b.name} at (${b.x},${b.y})`];
    // A body with a resolvable disk (Sun, Moon) gets a pixel size; a planet or
    // star is a point whose on-screen presence is its brightness, not its
    // sub-pixel disk, so it leads with the brightness cue instead.
    const isDisk = b.sizePx >= 3;
    if (isDisk) {
      parts.push(`~${b.sizePx}px wide disk`);
      if (b.phaseName) {
        parts.push(`${b.phaseName}, ${Math.round((b.illum ?? 0) * 100)}% lit`);
        if (b.brightLimbClock) parts.push(`bright side toward ${b.brightLimbClock}`);
      } else if (b.brightnessHint) {
        parts.push(b.brightnessHint);
      }
    } else {
      parts.push("point of light");
      if (b.brightnessHint) parts.push(b.brightnessHint);
    }
    if (b.color) parts.push(`colour ${b.color}`);
    let line = `- ${parts.join(", ")}`;
    if (b.note) line += `. ${b.note}`;
    lines.push(line);
  }
  if (fieldStars.length > 0) {
    lines.push(starfield.complete
      ? `- Plus ${fieldStars.length} field stars at the exact pixels in the structured \`bodies\` data, `
        + `a complete naked-eye field to magnitude ${starfield.limitingMag}: render each as a fine point of `
        + "light; do not add, move, or omit stars."
      : `- Plus ${fieldStars.length} fainter stars at the exact pixels in the structured \`bodies\` data; `
        + "render them as fine points, and you may add a sparse scatter more.");
  }
  if (offFrame.length > 0) {
    lines.push("");
    lines.push("OUTSIDE THE FRAME (do not draw these inside it):");
    const sideText: Record<SkyOffFrameBody["side"], string> = {
      left: "off the left edge", right: "off the right edge",
      above: "above the top edge", below: "below the bottom edge", behind: "behind the camera",
    };
    for (const o of offFrame) {
      lines.push(`- ${o.name} is ${sideText[o.side]}, ${o.deltaDeg} deg from center`);
    }
  }
  return lines.join("\n");
}

/** The body-free background plate prompt: the scene directives (camera, horizon,
 *  sky color) with every body, star, Milky Way, and overlay directive removed,
 *  and a hard no-bodies instruction added. The plate is pure atmosphere. */
function buildBackgroundPrompt(directives: string[]): string {
  const drop = ["Naked-eye limit", "The Milky Way", "OVERLAY", "You set color"];
  const scene = directives.filter((d) => !drop.some((p) => d.startsWith(p)));
  const lines = ["PHOTOREALISTIC SKY PLATE (atmosphere and horizon only, no celestial bodies):", ""];
  for (const d of scene) lines.push(`- ${d}`);
  lines.push(
    "- Render ONLY the sky gradient, clouds, atmosphere, and any horizon or foreground. "
    + "Do NOT draw the Sun, Moon, planets, stars, the Milky Way, or any point of light: those are "
    + "composited separately. Keep the sky clean and even, with no baked-in glare where bright "
    + "bodies will sit.",
  );
  return lines.join("\n");
}

/** Assemble the {@link RenderPlan}: a body-free plate plus the locally
 *  composited computed layers, animation strategy, and grading notes. */
function buildRenderPlan(
  sky: SkySummary, bodies: SkyBody[], starfield: StarfieldSummary, milkyWay: MilkyWay,
  overlays: SkyViewOverlays | null, pole: CelestialPole, directives: string[],
  width: number, height: number,
): RenderPlan {
  const planetCount = bodies.filter((b) => !b.id.startsWith("star:")).length;
  const starCount = bodies.length - planetCount;
  const overlayCount = overlays
    ? (overlays.ecliptic?.length ?? 0) + (overlays.signs?.length ?? 0)
      + (overlays.houses?.length ?? 0) + (overlays.constellations?.lines.length ?? 0)
    : 0;
  const layers: RenderLayer[] = [
    {
      kind: "bodies", present: planetCount > 0, count: planetCount,
      composite: "Additive sprites at each pixel: refraction-flattened disks for the Sun and Moon "
        + "(the Moon at its lit fraction, bright limb toward its clock angle), brightness-scaled "
        + "glints for the planets.",
    },
    {
      kind: "stars", present: starCount > 0, count: starCount,
      composite: starfield.complete
        ? "Fine additive points at the exact pixels in `bodies` (a complete field to the limiting "
          + "magnitude); size and brightness from magnitude. Do not add or move stars."
        : "Fine additive points at the listed pixels, brightness from magnitude; a faint scatter "
          + "may be added between them.",
    },
    {
      kind: "milkyWay", present: milkyWay.visible && milkyWay.inFrame, count: milkyWay.inFrame ? 1 : 0,
      composite: "A diffuse luminous band along the entry-to-exit path, brightest toward the "
        + "galactic center; soft and mottled, not resolved into stars.",
    },
    {
      kind: "overlays", present: overlayCount > 0, count: overlayCount,
      composite: "Vector annotations (lines and labels) drawn over the composite. Reference frames, "
        + "not photoreal; optional.",
    },
  ];

  return {
    background: {
      prompt: buildBackgroundPrompt(directives),
      width,
      height,
      constraints: [
        "No celestial bodies: no Sun, Moon, planets, stars, or Milky Way in the plate.",
        sky.horizonY !== null ? `Horizon at y=${sky.horizonY}.` : "Horizon outside the frame.",
        "Even, composite-ready sky; no baked-in glare or lens flare where bright bodies will sit.",
      ],
    },
    layers,
    animation: {
      strategy: "static",
      rotationDegPerHour: Math.round(SIDEREAL_DEG_PER_MIN * 60 * 1e4) / 1e4,
      pole,
      notes: "For a sequence (skyViewSequence): generate one background plate (or a few for cloud "
        + "motion), then per frame rotate the star layer about the pole at the sidereal rate and "
        + "re-place the bodies, Moon, and Milky Way from each frame's spec. Use a video model only "
        + "for cloud and atmosphere motion, never for the bodies.",
    },
    postprocess: [
      "Apply atmospheric extinction and reddening to bodies below about 10 deg altitude.",
      "Add subtle bloom to bodies brighter than magnitude -1; keep faint stars crisp points.",
      "Match every composited layer to the plate's color temperature and exposure.",
    ],
  };
}
