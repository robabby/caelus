/**
 * SkyView checks: projection invariants and sky-state, validated against the
 * engine's own positions. Aiming the camera at a body must land that body at
 * the frame center; the horizon must sit where the aim altitude puts it.
 * Self-contained (no golden fixture): a new feature with no Python reference.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { julianDay } from "../src/core.js";
import { Engine } from "../src/chart.js";
import { loadNodeData } from "../src/node-loader.js";
import { azAlt } from "../src/pheno.js";
import { skyView, skyViewSequence } from "../src/skyview.js";

const here = dirname(fileURLToPath(import.meta.url));
const eng = new Engine(loadNodeData(join(here, "../../data"), "embedded", "full"));

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) { failures++; console.error(`FAIL ${msg}`); }
}
function near(got: number, want: number, tol: number, msg: string): void {
  const d = Math.abs(got - want);
  if (!(d <= tol)) { failures++; console.error(`FAIL ${msg}: ${got} vs ${want} (diff ${d})`); }
}

const lat = 40.0;
const lonEast = -75.0;
const jd = julianDay(2025, 6, 21, 22, 30, 0); // Sun well up over the US east coast

// Aim straight at the Sun: it must land at the frame center.
const sun = eng.position("sun", jd);
const [sunAz, sunAlt] = azAlt(eng.data, sun.lon, sun.lat, jd, lat, lonEast);
ok(sunAlt > 0, "test setup: Sun is above the horizon");

const W = 1000;
const Hh = 1000;
const centered = skyView(eng, jd, {
  observer: { lat, lonEast, altM: 9 },
  aim: { azimuth: sunAz, altitude: sunAlt },
  lens: "normal",
  image: { width: W, height: Hh },
});
const sunBody = centered.bodies.find((b) => b.id === "sun");
ok(!!sunBody, "Sun appears in a frame aimed at the Sun");
if (sunBody) {
  ok(sunBody.inFrame, "Sun is in frame");
  near(sunBody.x, W / 2, 2, "Sun x at frame center");
  near(sunBody.y, Hh / 2, 2, "Sun y at frame center");
  ok(sunBody.sizePx >= 1, "Sun has a non-zero pixel size");
  ok(sunBody.magnitude !== null && sunBody.magnitude < -20, "Sun magnitude is very bright");
  ok(typeof sunBody.brightnessHint === "string" && sunBody.brightnessHint.length > 0, "Sun carries a brightness hint");
}

// Normal lens: ~39.6 deg horizontal field, rectilinear.
near(centered.lens.hfovDeg, 39.6, 0.3, "normal lens horizontal FOV");
ok(centered.lens.projection === "rectilinear", "normal lens is rectilinear");
// 1:1 image, so vertical FOV equals horizontal.
near(centered.lens.vfovDeg, centered.lens.hfovDeg, 0.3, "square frame: vfov == hfov");

// Compass aim: "W" resolves to 270 deg.
const west = skyView(eng, jd, {
  observer: { lat, lonEast },
  aim: { azimuth: "W", altitude: 5 },
  lens: "wide",
  image: { width: 800, height: 600 },
});
near(west.aim.azimuthDeg, 270, 1e-9, "compass W resolves to azimuth 270");
ok(west.aim.compass === "W", "aim compass label is W");

// Horizon at aim altitude 0 sits at the vertical center of a level frame.
const flat = skyView(eng, jd, {
  observer: { lat, lonEast },
  aim: { azimuth: sunAz, altitude: 0 },
  lens: "normal",
  image: { width: 1000, height: 1000 },
});
ok(flat.sky.horizonY !== null, "horizon row is reported when aimed at it");
if (flat.sky.horizonY !== null) near(flat.sky.horizonY, 500, 2, "horizon at vertical center");

// Aim well above the horizon: the horizon drops lower in the frame (larger y).
const up = skyView(eng, jd, {
  observer: { lat, lonEast },
  aim: { azimuth: sunAz, altitude: 15 },
  lens: "normal",
  image: { width: 1000, height: 1000 },
});
ok(up.sky.horizonY !== null && up.sky.horizonY > 500, "aiming up pushes the horizon below center");

// Ultrawide preset is a fisheye with a ~104 deg field.
const fish = skyView(eng, jd, {
  observer: { lat, lonEast },
  aim: { azimuth: sunAz, altitude: 20 },
  lens: "ultrawide",
  image: { width: 1200, height: 1200 },
});
ok(fish.lens.projection === "fisheye", "ultrawide is a fisheye projection");
near(fish.lens.hfovDeg, 104, 1.5, "ultrawide horizontal FOV");

// Aiming at the zenith must not throw (camera-basis degeneracy fallback).
let zenithOk = true;
try {
  skyView(eng, jd, {
    observer: { lat, lonEast },
    aim: { azimuth: 0, altitude: 89.9 },
    lens: "wide",
    image: { width: 600, height: 600 },
  });
} catch (e) {
  zenithOk = false;
  console.error(`FAIL zenith aim threw: ${(e as Error).message}`);
}
ok(zenithOk, "aiming near the zenith does not throw");

// Moon bright-limb orientation: when the Moon is framed, the limb angle and a
// clock position are reported, and the bright side points toward the Sun.
const moon = eng.position("moon", jd);
const [moonAz, moonAlt] = azAlt(eng.data, moon.lon, moon.lat, jd, lat, lonEast);
if (moonAlt > 2) {
  const mv = skyView(eng, jd, {
    observer: { lat, lonEast },
    aim: { azimuth: moonAz, altitude: moonAlt },
    lens: "portrait",
    image: { width: 1000, height: 1000 },
  });
  const mb = mv.bodies.find((b) => b.id === "moon");
  ok(!!mb, "Moon is framed when aimed at it");
  if (mb) {
    ok(mb.brightLimbAngleDeg !== undefined, "Moon reports a bright-limb angle");
    ok(typeof mb.brightLimbClock === "string", "Moon reports a clock position");
    ok(mb.illum !== undefined && mb.illum >= 0 && mb.illum <= 1, "Moon illum in [0,1]");
    ok(typeof mb.phaseName === "string", "Moon reports a phase name");
  }
} else {
  console.log("note: Moon below the horizon at the test instant; limb check skipped");
}

// Prompt and directives are populated.
// Bortle dark-sky class, dense star field, and the Milky Way band. Deep-night,
// dark West Texas site aimed south at the galactic center (Sagittarius) in June.
{
  const galJd = julianDay(2026, 6, 22, 7, 30, 0);
  const darkSite = { observer: { lat: 29.3, lonEast: -103.3 }, aim: { azimuth: "S", altitude: 25 },
    lens: "wide" as const, image: { width: 1024, height: 683 } };

  const pristine = skyView(eng, galJd, darkSite, { bortle: 1 });
  const city = skyView(eng, galJd, darkSite, { bortle: 8 });

  near(pristine.sky.limitingMag, 7.6, 0.01, "Bortle 1 limiting magnitude");
  near(city.sky.limitingMag, 4.5, 0.01, "Bortle 8 limiting magnitude");
  ok(pristine.sky.limitingMag > city.sky.limitingMag, "darker site reaches fainter stars");

  ok(pristine.milkyWay.visible && pristine.milkyWay.inFrame, "Milky Way crosses the frame at a dark site");
  ok(!!pristine.milkyWay.entry && !!pristine.milkyWay.exit, "Milky Way reports entry/exit pixels");
  ok(pristine.milkyWay.galacticCenter !== null, "galactic center is located when above the horizon");
  ok(pristine.prompt.includes("Milky Way"), "dark-sky prompt describes the Milky Way");

  // Deep pack present: a dark site pins the complete naked-eye field.
  ok(pristine.starfield.source === "deep", "dark site uses the deep star pack");
  ok(pristine.starfield.complete, "the deep field is marked complete");
  ok(pristine.starfield.count > 100, "the deep field pins hundreds of stars");
  ok(/complete|field of \d+|exact pixel/.test(pristine.directives.find((d) => d.includes("Naked-eye")) ?? ""),
    "dark-sky directive describes the complete pinned field");
  ok(pristine.prompt.includes("field stars at the exact pixels"),
    "prompt summarizes the field rather than listing thousands");

  ok(!city.milkyWay.visible, "Milky Way is not visible from a Bortle 8 city");
  ok(!city.prompt.includes("Milky Way"), "city prompt omits the Milky Way");

  // Deep night must not request a warm twilight horizon (the Sun is far down).
  ok(pristine.sky.twilight === "night", "the dark-site scene is full night");
  ok(!pristine.prompt.includes("warm low"), "deep-night prompt drops the warm-horizon directive");
  ok(pristine.prompt.includes("no twilight"), "deep-night prompt states there is no twilight");

  const starCount = (r: typeof pristine) => r.bodies.filter((b) => b.id.startsWith("star:")).length;
  ok(starCount(pristine) >= starCount(skyView(eng, galJd, darkSite, {})),
    "a Bortle class surfaces at least as many catalog stars as the default");
}

// Celestial pole and time sequences (the keyframes for an animation). A dark
// Colorado night aimed due north at altitude = latitude puts the north pole at
// the frame center; stepping time rotates the sky about that fixed point.
{
  const nightJd = julianDay(2026, 6, 22, 7, 30, 0); // ~01:30 local, deep night
  const poleView = {
    observer: { lat: 40.0, lonEast: -105.0 }, aim: { azimuth: "N", altitude: 40 },
    lens: "wide" as const, image: { width: 1024, height: 683 },
  };
  const f0 = skyView(eng, nightJd, poleView, { bortle: 3 });
  ok(f0.pole.which === "north", "northern observer sees the north celestial pole");
  near(f0.pole.altitudeDeg, 40, 0.1, "pole altitude equals the latitude");
  ok(f0.pole.inFrame, "pole is in frame when aimed at it");
  near(f0.pole.x ?? -1, 512, 2, "pole at horizontal frame center");
  near(f0.pole.y ?? -1, 341, 2, "pole at vertical frame center");

  const seq = skyViewSequence(eng, poleView, { startJdUt: nightJd, frames: 5, stepMinutes: 24 }, { bortle: 3 });
  ok(seq.count === 5, "sequence has the requested frame count");
  near(seq.stepMinutes, 24, 1e-9, "sequence step in minutes");
  near(seq.durationMinutes, 96, 1e-9, "sequence duration spans (frames-1) steps");
  near(seq.rotationDegPerStep, (360 / 1436.0682) * 24, 1e-6, "sidereal rotation per step");
  near(seq.rotationDegPerHour, 15.041, 0.01, "sidereal rotation per hour");

  // The pole is the fixed rotation center: it stays put across frames.
  near(seq.frames[4].pole.x ?? -1, seq.frames[0].pole.x ?? -2, 0.5, "pole is fixed across the sequence");

  // The sky rotates: at least one star shared by the first and last frame has
  // moved over the 96-minute span.
  const first = new Map(seq.frames[0].bodies.map((b) => [b.id, b]));
  let moved = false;
  for (const b of seq.frames[4].bodies) {
    if (!b.id.startsWith("star:")) continue;
    const p0 = first.get(b.id);
    if (p0 && Math.abs(p0.x - b.x) + Math.abs(p0.y - b.y) > 3) { moved = true; break; }
  }
  ok(moved, "stars rotate about the pole as the sequence advances");
}

// Reference-frame overlays: ecliptic, signs, houses, constellations. The
// triple-planet WNW dusk over Los Angeles: planets sit on the ecliptic, and the
// descendant (7th cusp) is on the western horizon we are facing.
{
  const ovJd = julianDay(2026, 6, 23, 3, 37, 0);
  const ovView = {
    observer: { lat: 34.05, lonEast: -118.24 }, aim: { azimuth: "WNW", altitude: 16 },
    lens: "wide" as const, image: { width: 1024, height: 683 },
  };
  const none = skyView(eng, ovJd, ovView, {});
  ok(none.overlays === null, "overlays are null when not requested");

  const ov = skyView(eng, ovJd, ovView, {
    overlays: { ecliptic: true, signs: true, houses: true, constellations: true },
  }).overlays!;
  ok(ov !== null, "overlays present when requested");
  ok((ov.ecliptic?.length ?? 0) > 0 && (ov.ecliptic![0].points.length > 2),
    "the ecliptic projects as a polyline across the frame");
  ok((ov.signs?.length ?? 0) > 0, "zodiac signs are placed");
  ok(ov.signs!.some((s) => s.text === "Leo" || s.text === "Cancer"), "the dusk signs are Cancer/Leo");
  ok((ov.houses?.length ?? 0) > 0, "house cusps and angles are placed");
  ok(ov.houses!.some((h) => h.text === "DSC"), "the descendant is in the western frame");
  ok((ov.constellations?.labels.length ?? 0) > 0, "constellation labels are placed");
  ok((ov.constellations?.lines.length ?? 0) > 0, "constellation figure strokes are placed");

  const ovPrompt = skyView(eng, ovJd, ovView, { overlays: { signs: true } }).prompt;
  ok(ovPrompt.includes("OVERLAY"), "the prompt notes the optional overlay layer");
}

// Render plan: the machine-readable contract for a hybrid composite pipeline.
// Body-free plate from the image model; computed layers composited locally.
{
  const p = skyView(eng, julianDay(2026, 6, 23, 3, 37, 0), {
    observer: { lat: 34.05, lonEast: -118.24 }, aim: { azimuth: "WNW", altitude: 16 },
    lens: "wide", image: { width: 1024, height: 683 },
  }).renderPlan;
  ok(p.background.prompt.includes("PLATE") && /no celestial bodies/i.test(p.background.prompt),
    "the background plate prompt is body-free");
  ok(!p.background.prompt.includes("render EVERY one"), "the plate prompt omits the bodies list");
  ok(p.layers.length === 4 && p.layers.some((l) => l.kind === "bodies")
    && p.layers.some((l) => l.kind === "milkyWay"), "render plan enumerates the computed layers");
  ok(p.layers.find((l) => l.kind === "bodies")!.present, "bodies layer present when planets are framed");
  ok(p.animation.strategy === "static", "a single frame is a static render");
  near(p.animation.rotationDegPerHour, 15.041, 0.01, "render plan carries the sidereal rate");
  ok(p.animation.pole.which === "north", "render plan carries the celestial pole");
  ok(p.background.constraints.length >= 2 && p.postprocess.length >= 2,
    "render plan carries plate constraints and postprocess notes");
}

ok(centered.prompt.includes("BODIES"), "prompt has a bodies section");
ok(centered.prompt.includes("wide disk") || centered.prompt.includes("point of light"),
  "prompt describes bodies as disks or points of light, not bare pixel widths");
ok(centered.directives.length >= 3, "directives are populated");

// Brightness descriptor: a point-source body carries a magnitude-derived cue,
// and the brightest (Venus-class) reads as dominant rather than a faint speck.
{
  // Known scene: Venus, Jupiter, Mercury clustered in the WNW after sunset over
  // Los Angeles on 2026-06-23 03:37 UT (civil dusk). Venus is magnitude ~-4.
  const laJd = julianDay(2026, 6, 23, 3, 37, 0);
  const bright = skyView(eng, laJd, {
    observer: { lat: 34.05, lonEast: -118.24 },
    aim: { azimuth: "WNW", altitude: 16 },
    lens: "wide",
    image: { width: 1024, height: 683 },
  });
  const venus = bright.bodies.find((b) => b.id === "venus");
  ok(!!venus, "Venus is framed in the Los Angeles dusk scene");
  if (venus) {
    ok(venus.nakedEye, "Venus is naked-eye in civil twilight");
    ok(typeof venus.brightnessHint === "string", "Venus carries a brightness hint");
    ok(/brilliant|very bright/.test(venus.brightnessHint ?? ""),
      "a magnitude -4 planet reads as brilliant, not a faint speck");
    ok(!bright.prompt.includes("magnitude -4"),
      "the prompt leads with a brightness cue, not a bare magnitude number");
  }
}
ok(/^\d{4}-\d{2}-\d{2}T/.test(centered.instant.utc), "instant carries an ISO UTC string");

console.log(`\nskyview: ${failures} failures`);
process.exit(failures ? 1 : 0);
