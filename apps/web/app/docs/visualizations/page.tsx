import { Engine, astrocartography, ephemeris, julianDay, type BodyId } from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { ChartSphere, AstroMap, EphemerisGraph } from "caelus-wheel";
import { Eyebrow, Lead, P, H2 } from "../../../components/Prose";
import CodeBlock from "../../../components/CodeBlock";
import { WHEEL_THEME, WHEEL_LINE_COLORS } from "../../../lib/wheelTheme";

export const metadata = {
  title: "Visualizations",
  description:
    "The chart beyond the flat wheel: a 3D celestial sphere, an astrocartography world map, and a graphic ephemeris. Each is SSR-safe SVG fed by the caelus engine, rendered live on this page.",
  alternates: { canonical: "/docs/visualizations" },
};

const engine = new Engine(embeddedData);

// A fixed instant so this page renders deterministically at build time.
const SPHERE_DATE = { y: 2026, mo: 6, d: 13, h: 12, lat: 40.7128, lon: -74.006 };
const sphereChart = engine.chart(
  SPHERE_DATE.y, SPHERE_DATE.mo, SPHERE_DATE.d, SPHERE_DATE.h, 0, 0,
  SPHERE_DATE.lat, SPHERE_DATE.lon, "placidus",
);

const MAP_BODIES: BodyId[] = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"];
const mapJd = julianDay(2026, 6, 13, 12);
const mapLines = astrocartography(engine, mapJd, MAP_BODIES);

const GRAPH_BODIES: BodyId[] = ["mars", "jupiter", "saturn"];
const graphSeries = ephemeris(engine, GRAPH_BODIES, {
  start: julianDay(2026, 1, 1),
  end: julianDay(2028, 1, 1),
  step: 7,
  value: "longitude",
});

const SPHERE_CODE = `import { Engine } from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { ChartSphere } from "caelus-wheel";

const engine = new Engine(embeddedData);
const chart = engine.chart(2026, 6, 13, 12, 0, 0, 40.71, -74.01, "placidus");

// The chart's bodies already carry ecliptic latitude, so the sphere can
// lift each planet off the ecliptic plane (a flat wheel collapses that to 0).
export function Sphere() {
  return <ChartSphere chart={chart} size={360} tilt={64} />;
}`;

const MAP_CODE = `import { Engine, astrocartography, julianDay } from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { AstroMap } from "caelus-wheel";

const engine = new Engine(embeddedData);
const jd = julianDay(2026, 6, 13, 12); // one instant, UT
const lines = astrocartography(engine, jd, ["sun", "moon", "venus", "mars", "jupiter"]);

// MC/IC are meridians; ASC/DSC are the curved rising and setting tracks.
// The basemap is a graticule; pass coastline paths as children to layer a map.
export function Map() {
  return <AstroMap lines={lines} width={680} height={340} />;
}`;

const GRAPH_CODE = `import { Engine, ephemeris, julianDay } from "caelus";
import { embeddedData } from "caelus/data-embedded";
import { EphemerisGraph } from "caelus-wheel";

const engine = new Engine(embeddedData);
const series = ephemeris(engine, ["mars", "jupiter", "saturn"], {
  start: julianDay(2026, 1, 1),
  end: julianDay(2028, 1, 1),
  step: 7,            // weekly samples
  value: "longitude", // or latitude, declination, rightAscension, speed
});

// wrap=360 splits each line where longitude rolls 360 back to 0.
export function Graph() {
  return <EphemerisGraph series={series} width={680} height={340} wrap={360} />;
}`;

const figure: React.CSSProperties = {
  margin: "1rem 0 1.5rem",
  display: "flex",
  justifyContent: "center",
  overflowX: "auto",
};

export default function Visualizations() {
  return (
    <>
      <Eyebrow>Guides</Eyebrow>
      <h1>Visualizations</h1>
      <Lead>
        The same chart object renders as more than a flat wheel. The engine feeds
        three dependency-free SVG views: a 3D celestial sphere, an
        astrocartography world map, and a graphic ephemeris. Every view below is
        server-rendered on this page from the embedded engine.
      </Lead>

      <H2>3D chart sphere</H2>
      <P>
        A flat wheel places every planet on the ecliptic. The sphere keeps each
        body at its true ecliptic latitude, so the Moon rides above the ecliptic
        and Pluto swings well off it. The ecliptic and equator draw as
        great-circle rings, solid on the near hemisphere and faded on the far
        one. The matching 3D aspect angle in the engine is{" "}
        <code>angularSeparation3d</code>, which accounts for latitude rather than
        longitude alone.
      </P>
      <div style={figure}>
        <ChartSphere chart={sphereChart} size={360} tilt={64} theme={WHEEL_THEME} />
      </div>
      <CodeBlock lang="tsx" label="ChartSphere.tsx" code={SPHERE_CODE} />

      <H2>Astrocartography map</H2>
      <P>
        For one instant, each planet sits on an angle along a curve across the
        Earth. <code>astrocartography</code> returns those lines from each body's
        right ascension and declination and the moment's sidereal time:
        the MC and IC meridians and the curved ASC and DSC rising and setting
        tracks. <code>AstroMap</code> draws them on an equirectangular graticule;
        layer your own coastline paths under the lines as children.
      </P>
      <div style={figure}>
        <AstroMap lines={mapLines} width={680} height={340} theme={WHEEL_THEME} colors={WHEEL_LINE_COLORS} />
      </div>
      <CodeBlock lang="tsx" label="AstroMap.tsx" code={MAP_CODE} />

      <H2>Graphic ephemeris</H2>
      <P>
        A graphic ephemeris plots one value per body over time.{" "}
        <code>ephemeris</code> samples longitude, latitude, declination, right
        ascension, or speed across a range, and <code>EphemerisGraph</code> draws
        the series, splitting each line where longitude wraps from 360 back to 0.
        Below: the longitude of Mars, Jupiter, and Saturn over two years at weekly
        steps.
      </P>
      <div style={figure}>
        <EphemerisGraph series={graphSeries} width={680} height={340} wrap={360} theme={WHEEL_THEME} colors={WHEEL_LINE_COLORS} />
      </div>
      <CodeBlock lang="tsx" label="EphemerisGraph.tsx" code={GRAPH_CODE} />

      <H2>Next steps</H2>
      <P>
        These render the same engine output as the flat <code>ChartWheel</code>{" "}
        in the <a href="/docs/architecture">Architecture</a> guide. See{" "}
        <a href="/docs/recipes">Recipes</a> for event search and the{" "}
        <code>when()</code> query language, and{" "}
        <a href="/docs/electional">Electional Search</a> for scanning a window for
        the best moment.
      </P>
    </>
  );
}
