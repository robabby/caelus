import type { WheelTheme } from "caelus-wheel";

/**
 * The caelus-wheel renderers ship a fixed dark palette. On the site we instead
 * feed them the live design tokens as CSS-variable strings, so every SVG colour
 * resolves against the page's current `data-theme` and tracks the light/dark
 * toggle with no JS, no flash, and no hydration mismatch (the values are literal
 * strings on both server and client). Planet glyphs map to --text and the axes
 * to --accent so they stay legible on either surface; the structural inks have
 * their own --wheel-* tokens tuned per mode.
 */
/**
 * Per-body glyph and position-tick tints for ChartWheel. Matches the AstroMap /
 * EphemerisGraph palette; moon and saturn use mode-aware tokens so they stay
 * legible on light surfaces.
 */
export const WHEEL_PLANET_COLORS: Record<string, string> = {
  sun: "var(--wheel-planet-sun)",
  moon: "var(--wheel-planet-moon)",
  mercury: "var(--wheel-planet-mercury)",
  venus: "var(--wheel-planet-venus)",
  mars: "var(--wheel-planet-mars)",
  jupiter: "var(--wheel-planet-jupiter)",
  saturn: "var(--wheel-planet-saturn)",
  uranus: "var(--wheel-planet-uranus)",
  neptune: "var(--wheel-planet-neptune)",
  pluto: "var(--wheel-planet-pluto)",
  chiron: "var(--wheel-planet-chiron)",
  true_node: "var(--wheel-planet-true-node)",
};

export const WHEEL_THEME: Partial<WheelTheme> = {
  ring: "var(--wheel-ring)",
  axis: "var(--accent)",
  signText: "var(--wheel-sign)",
  planetText: "var(--text)",
  planetColors: WHEEL_PLANET_COLORS,
  labelText: "var(--wheel-label)",
  houseText: "var(--wheel-house)",
  // Only conjunction is theme-sensitive (a near-neutral); the coloured aspects
  // read on both surfaces and inherit the renderer's defaults via deep-merge.
  aspectColors: { conjunction: "var(--wheel-conj)" },
};

/**
 * AstroMap / EphemerisGraph draw each body in a distinct hue. Two of them
 * (moon, saturn) are pale greys that vanish on a light surface, so override just
 * those with mode-aware tokens; every other body colour reads on both.
 */
export const WHEEL_LINE_COLORS: Record<string, string> = {
  moon: "var(--wheel-line-moon)",
  saturn: "var(--wheel-line-saturn)",
};
