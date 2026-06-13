import { A, H2, P, Code, Nav } from "../../components/Prose";

export const metadata = {
  title: "Caelus — Build Notes",
  description: "Postmortems: ΔT extrapolation, node frame error, Chiron light-time double-count, aspect-search geometry.",
};

export default function Notes() {
  return (
    <main>
      <Nav current="/notes" />
      <h1 style={{ letterSpacing: "0.05em" }}>Build Notes</h1>
      <P>
        VSOP87 evaluation is a few hundred lines and matched professional ephemerides
        on the first pass. The bugs were in timescales, frames, and geometry: invisible
        in a spot check, obvious in the golden suite.
      </P>

      <H2>ΔT: Textbook Extrapolation vs Earth Since 2016</H2>
      <P>
        Ephemerides use TT; civil time follows Earth rotation. ΔT bridges the two.
        The{" "}
        <A href="https://eclipse.gsfc.nasa.gov/SEcat5/deltatpoly.html">
          Espenak–Meeus (2006) polynomials
        </A>, copied into decades of software, assume Earth&apos;s spin keeps
        slowing: they predict ΔT ≈ 158 s for 2080. Earth&apos;s rotation began{" "}
        <A href="https://www.cbsnews.com/news/earth-spinning-faster-than-usual-shortest-day-ever/">
          accelerating around 2016
        </A>; observed ΔT has sat near 69 s since 2020 and is drifting down. The
        textbook curve is already ~6 s high today and runs ~90 s high by 2080.
        The Moon moves 0.55″ per second of ΔT error, so a faithful
        implementation of the old formula misses the Moon by tens of arcseconds
        within a lifetime. Caelus interpolates IERS observations through 2025,
        continues the observed near-flat trend, and rejoins the slow tidal
        rise decades out: an 80-year ΔT forecast carries roughly{" "}
        <A href="https://www.ucolick.org/~sla/leapsecs/year2100.html">
          ±37 s of uncertainty
        </A>{" "}
        (Huber 2006), so a steeper slope would be false precision.
      </P>

      <H2>Node Longitude: 11× Frame Sensitivity</H2>
      <P>
        Lunar nodes mark where the Moon&apos;s plane crosses the ecliptic. The ecliptic
        of date drifts ~47″/century. With the Moon inclined only 5.1°, a frame error
        in the reference plane scales by 1/sin(5.1°) ≈ 11× in node longitude. Using
        J2000 instead of ecliptic-of-date produced ~500″ node error while planetary
        longitudes barely moved.
      </P>

      <H2>Chiron Fit: Double Light-Time</H2>
      <P>
        The first Chebyshev fit sampled Horizons &ldquo;heliocentric&rdquo; positions
        that already included Sun→body light-time (~6,900 s of motion, ~55,000 km).
        The pipeline then applied Earth→body light-time again: ~9″ steady bias.
        Fix: fit geometric states; validate the fit, then the Earth vector, then
        assemble geocentric positions from the oracle&apos;s parts.
      </P>

      <H2>Aspect Dates: ±90° Geometry</H2>
      <P>
        Code review found <Code>find_aspect_dates</Code> root-finding only +90°
        separations, dropping half of sextile/square/trine hits. The engine was fine;
        the MCP search was wrong.         Fixed with a seven-year Mars sextile oracle. Nine hits matched an
        independent scan to the minute, including a retrograde triple pass.
      </P>

      <H2>Golden Suite</H2>
      <P>
        Swiss Ephemeris checks the Python reference; 3,218 fixtures pin the TypeScript
        port (worst delta 1.64 nano-arcseconds). CI runs both on every commit. The
        TS port was mostly agent-written with one gate: keep the suite green.
      </P>

      <P dim>
        Playground: <A href="/">/</A> (~85 KB, ~2 ms/chart).{" "}
        <A href="/provenance">Provenance</A> · <A href="/validation">Validation</A> ·{" "}
        <A href="https://github.com/heavyblotto/caelus">GitHub</A>.
      </P>
    </main>
  );
}
