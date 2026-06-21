# SkyView: apparent-sky framing for image prompts

## What this is

`skyView` answers one question: given an observer, a viewing direction, a lens,
and an output image size, where does each visible body land in the frame, and
how should it look? It returns pixel placements, apparent sizes, brightness,
Moon phase orientation, and a sky-state summary, plus a serialized prompt.

Caelus does not generate images. It produces the geometric and photometric facts
an image model cannot infer on its own, and hands aesthetics (exact colors,
atmosphere, mood) to that model with explicit instructions.

The target use case: an LLM or image model is asked for "the sky from a third
floor window facing west at sunset." Image models get the physics wrong by
default. They draw impossible Moon phases, put the Sun and a full Moon in the
same sky, scatter stars at random, and size the Moon ten times too large.
`skyView` is the truth layer that pins the facts the model gets wrong.

## Inputs

```ts
skyView(engine, jdUt, view, opts?)
```

- `engine`: a Caelus `Engine`.
- `jdUt`: the instant, Julian Day (UT). Resolve "at sunset" first with
  `riseSet(engine, "sun", jdStart, lat, lonEast, "set")`.
- `view`:
  - `observer`: `{ lat, lonEast, altM? }`. `altM` is eye height in meters. A
    third floor window is about 9 m. Eye height barely moves the sky (horizon
    dip at 9 m is about 0.09 degrees); it matters for scene framing, not
    astrometry.
  - `aim`: `{ azimuth, altitude }`. Azimuth is degrees from true north, east
    positive, matching `azAlt`. `azimuth` also accepts a compass string
    (`"W"`, `"WNW"`). `altitude` is the center-of-frame elevation in degrees:
    0 looks at the horizon, positive tilts up. This is required: with a
    telephoto lens the aim altitude decides the whole frame.
  - `lens`: a preset name, or `{ focalLengthMm, sensorWidthMm? }`, or
    `{ hfovDeg }`. Presets map to a 35 mm-equivalent focal length and a
    projection (see below).
  - `image`: `{ width, height }` in pixels. Sets the aspect ratio; vertical
    field of view derives from it.
- `opts`: `pressure`, `tempC` (refraction), `refraction` (default true),
  `bortle` (dark-sky class 1-9), `deepField`, `overlays` (ecliptic, signs,
  houses, constellations), `maxStarMag`, `maxStars`, `includeStars`, `bodies`.

### Lens presets

`hfov = 2 * atan(sensorWidth / (2 * focal))`, full-frame sensor width 36 mm.
Lens choice sets how wide and which projection. Image dimensions set the shape.

| Preset       | Focal (35mm eq.) | HFOV   | Projection   |
|--------------|------------------|--------|--------------|
| `ultrawide`  | 14 mm            | ~104°  | fisheye      |
| `wide`       | 24 mm            | ~74°   | rectilinear  |
| `standard`   | 35 mm            | ~54°   | rectilinear  |
| `normal`     | 50 mm            | ~40°   | rectilinear  |
| `portrait`   | 85 mm            | ~24°   | rectilinear  |
| `telephoto`  | 135 mm           | ~15°   | rectilinear  |
| `supertele`  | 200 mm           | ~10°   | rectilinear  |

The preset carries the projection, the same way real optics do. Rectilinear
lenses use a gnomonic projection. The ultrawide preset uses an equidistant
fisheye, because gnomonic stretches the corners past usefulness above about
100 degrees. An explicit `hfovDeg` defaults to rectilinear and warns above 100.

## Geometry

World axes are local horizontal: x east, y north, z up. A direction at azimuth
`A` and altitude `h` is `[cos(h) sin(A), cos(h) cos(A), sin(h)]`.

The camera basis from the aim direction `F`:
- `right = normalize(F x worldUp)` (horizontal, so the camera has no roll)
- `up = right x F`

Near the zenith `F x worldUp` degenerates; there the up reference falls back to
north.

For a body direction `V`:
- `f = V . F` (forward; `f <= 0` is behind the camera)
- `r = V . right`, `u = V . up`

Rectilinear (gnomonic):
```
xn = (r / f) / tan(hfov / 2)
yn = (u / f) / tan(vfov / 2)
in frame when |xn| <= 1 and |yn| <= 1
px = (xn + 1) / 2 * width
py = (1 - yn) / 2 * height
vfov = 2 * atan(tan(hfov / 2) * height / width)
```

Fisheye (equidistant): `theta = acos(f)`, `psi = atan2(u, r)`,
`xn = theta cos(psi) / (hfov/2)`, `yn = theta sin(psi) / (vfov/2)`,
`vfov = hfov * height / width`.

Apparent diameter to pixels uses the central plate scale,
`sizePx = diameterDeg * width / hfovDeg`. This is exact at frame center and
good near it; rectilinear stretches it slightly toward the corners. Sun and
Moon are about 0.5 degrees, so on a normal lens they are near 1 percent of the
frame width. That is the size image models get most wrong.

The horizon (altitude 0) is a straight horizontal line for a no-roll camera. We
report its pixel row `horizonY`. For fisheye it is a curve; `horizonY` is the
value at the center azimuth and is approximate.

## Sky state

- `twilight` from the Sun's true altitude: day (> 0), civil (0 to -6),
  nautical (-6 to -12), astronomical (-12 to -18), night (< -18).
- `limitingMag`, the naked-eye limit: the more restrictive of the twilight
  brightness ceiling and the site's dark-sky limit, reduced when a bright Moon
  is up. This filters which stars and planets are worth drawing.
- `brightestAzimuth`, the Sun's azimuth while it is within 18 degrees of the
  horizon (the afterglow sits there even after sunset), else the Moon's azimuth
  if it is up, else null.
- Per low body, refraction lifts the apparent altitude (Saemundsson), and the
  result notes near-horizon reddening so the model dims and warms it.

## Dark sky, star fields, and the Milky Way

The `bortle` option (1 pristine to 9 inner city) sets the night naked-eye limit
(7.6 at Bortle 1 down to 4.0 at Bortle 9) and drives how dense a background star
field the directives ask for. Omitting `bortle` keeps the original suburban
default (limit 6.0).

Two star sources exist. The core catalog is the ~300 brightest named stars (to
about magnitude 5), always present and bundled in the browser. The deep pack
(`data/fixed_stars_deep.json`, 8,920 stars to magnitude 6.5, built by
`scripts/build-deep-stars.mjs` from HYG v4.1) is opt-in: node-loaded, kept out
of the web bundle. When the deep pack is loaded and the sky is dark, SkyView
pins the *complete* naked-eye field at exact pixels and the `starfield` summary
reports `source: "deep"`, `complete: true`; the prompt lists the bright anchors
and summarizes the rest, with every star's pixel in the structured `bodies`.
Without the deep pack (or in twilight), it places the bright catalog and a
directive asks the model to fill the fainter field. `deepField` forces the
choice; `starfield` reports what was used.

In a dark sky (astronomical twilight or night, no bright Moon, Bortle <= 6) the
result carries a `milkyWay` object: whether it is visible, where the galactic
equator enters and exits the frame, and the galactic center (Sagittarius, the
bright bulge) when it is above the horizon. The geometry is the galactic plane
rotated into J2000 equatorial, precessed to the date, then projected like any
body, so it tracks precession across epochs. A directive describes the band's
path and brightest point; the model renders it as diffuse starlight, not points.

## Moon phase orientation

The detail image models fail most. Illuminated fraction is not enough; the
crescent has to point the right way. The bright limb points along the great
circle from the Moon toward the Sun. We take the tangent at the Moon,
`t = normalize(S - (S . M) M)`, express it in camera axes, and report
`brightLimbAngleDeg` (image-plane angle, 0 right, 90 up) and a clock-position
hint. This holds even when the Sun is below the horizon or behind the camera.

## Output

```jsonc
{
  "instant": { "jdUt": 2461000.1, "utc": "2026-..." },
  "observer": { "lat": 47.6, "lonEast": -122.3, "altM": 9 },
  "aim": { "azimuthDeg": 270, "altitudeDeg": 5 },
  "lens": { "name": "normal", "focalLengthMm": 50, "projection": "rectilinear",
            "hfovDeg": 39.6, "vfovDeg": 27.0 },
  "image": { "width": 1024, "height": 683 },
  "sky": { "twilight": "civil", "sunAltitudeDeg": -3.2, "sunAzimuthDeg": 290,
           "limitingMag": 3.0, "moonAltitudeDeg": 22, "moonIllum": 0.47,
           "brightestAzimuthDeg": 290, "horizonY": 540 },
  "bodies": [
    { "id": "sun", "name": "Sun", "x": 512, "y": 545, "sizePx": 12,
      "magnitude": -26.7, "altitudeDeg": -0.3, "nakedEye": true,
      "note": "on the horizon, flattened by refraction" },
    { "id": "moon", "name": "Moon", "x": 250, "y": 300, "sizePx": 12,
      "illum": 0.47, "phaseName": "waxing crescent",
      "brightLimbAngleDeg": 118, "brightLimbClock": "10 o'clock" }
  ],
  "offFrame": [ { "id": "jupiter", "name": "Jupiter", "side": "right", "deltaDeg": 18 } ],
  "directives": [ "..." ],
  "prompt": "..."
}
```

`bodies` holds what is above the horizon and inside the frame. `offFrame` lists
bright bodies above the horizon but outside the frame, so the model knows what
not to invent inside it. `directives` and `prompt` serialize the facts into
imperative instructions, including the constraint that the model may set colors
and atmosphere but may not move, resize, or recolor placed bodies for
composition.

## Reference-frame overlays

The `overlays` option projects the sky's reference frames into the frame as
annotations (not part of a photoreal render): the ecliptic line, the zodiac
signs (its 30 degree divisions), the house cusps and angles (ASC, MC, with the
house system selectable), and the constellation figure lines. Signs and houses
are ecliptic points, projected directly; constellations come from a bundled pack
(`data/constellations.json`, d3-celestial figures, vertices as ecliptic J2000)
precessed to the date. The result's `overlays` holds the in-frame polylines and
labeled points at exact pixels; a prompt directive names what is present and
flags it as an optional annotation layer. The web tab toggles each, and the
`sky_view` MCP tool takes an `overlays` list.

## Render plan: the hybrid pipeline

`prompt` is for humans and image models. `renderPlan` is the machine-readable
contract for the recommended pipeline: ask an image model for a body-free
background plate, then composite the computed objects locally at their exact
pixels. The model supplies atmosphere; Caelus supplies the physically correct
bodies, so accuracy never depends on the model drawing a point in the right
place.

- `background`: a body-free plate prompt (the scene directives with every body,
  star, Milky Way, and overlay line removed, plus a hard no-bodies instruction),
  the image size, and plate constraints (no bodies, the horizon row, an even
  composite-ready sky).
- `layers`: the computed layers to composite locally, each with a `composite`
  instruction: `bodies` (additive disks and glints), `stars` (fine points, the
  complete field when deep), `milkyWay` (a diffuse band), `overlays` (vector
  annotations).
- `animation`: `static` for a single frame, the sidereal rotation per hour, the
  celestial pole, and the strategy for a sequence (one plate, rotate the star
  layer about the pole, re-place bodies per frame; a video model only for
  cloud and atmosphere motion, never the bodies).
- `postprocess`: extinction and reddening near the horizon, bloom for the
  brightest bodies, and matching each layer to the plate.

## Animation: sequences and the pole

Every result carries `pole`: the visible celestial pole (north or south), its
altitude (equal to the observer's |latitude|), and its pixel. The pole is the
fixed point the whole sky rotates about as time passes, so it is the rotation
center for star trails and for reprojecting an animation frame to frame.

`skyViewSequence(engine, view, { startJdUt, frames, stepMinutes })` returns one
full frame per step, sharing the place, aim, and lens. Across frames the sky
rotates about the pole at 15.041 deg/hour (returned as `rotationDegPerStep`),
the Moon drifts and its phase evolves, twilight changes, and the Milky Way
wheels. Each frame is a physically exact spec, so the sequence is temporally
coherent. Rendered coherence then comes from supplying the frames as control
images, or from rendering one plate and reprojecting it by the per-frame
rotation about the pole, rather than generating each still freehand. With the
deep pack loaded the whole field is pinned, so it does not swim between frames.
The `sky_view_sequence` MCP tool returns a compact timeline (per-frame twilight,
Sun/Moon, Milky Way, plus the pole and rotation); the web Sky View tab has a
play/scrub control that steps time live.

## Scope

Built (this module): viewport and projection, culling, pixel placement and
size, magnitude with a brightness-prominence cue, Moon phase orientation,
horizon line, twilight and limiting magnitude, Bortle dark-sky class, background
star-field directives, the Milky Way band, the deep complete star field,
reference-frame overlays (ecliptic, signs, houses, constellations), the
celestial pole, time sequences for animation, the hybrid render plan (body-free
plate plus composited layers), JSON result and prompt serializer.
The single frame is exposed through the `sky_view` MCP tool (with `deep_field`)
and the web playground's Sky View tab (with a play/scrub time control);
sequences through the `sky_view_sequence` MCP tool and the `skyViewSequence`
library API.

Later: a sky-brightness gradient color model, atmospheric extinction near the
horizon, an observer obstruction profile (skyline altitude per azimuth),
constellation line data, and per-image-model prompt templates.

Division of labor: Caelus owns geometry and photometry. The image model owns
color, light, and mood, guided by the directives.
