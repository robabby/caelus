import { A, Eyebrow, H2, P, Note } from "../../components/Prose";
import CaelusMark from "../../components/CaelusMark";

export const metadata = {
  title: "How this was built",
  description:
    "Caelus was written almost entirely by AI coding agents, under human direction, with a validation harness as the backstop. How the process kept an AI-built engine trustworthy.",
  alternates: { canonical: "/how-it-was-built" },
};

export default function HowItWasBuilt() {
  return (
    <main className="container page">
      <Eyebrow>Process</Eyebrow>
      <h1>How this was built</h1>
      <P>
        Caelus was written almost entirely by AI coding agents. The Python
        reference, the TypeScript port, the tests, the website, and most of this
        prose came from agents working under human direction. That is only worth
        saying because of the second half: every number the engine produces is
        checked against two independent references, and a golden suite fails the
        build the moment the code drifts. The checking is the reason an engine
        written by machines can be trusted.
      </P>

      <H2>Reference-first, checked to the last digit</H2>
      <P>
        Every model landed in the Python reference first. That reference writes
        golden fixtures: positions and events at fixed instants, stored as JSON.
        The TypeScript engine is a port of the same math, and a conformance suite
        replays the fixtures against it on every commit, to the last digit the
        fixture records. A model is not shipped until the reference, its
        fixtures, and the port agree. An agent can move quickly when a red suite
        catches the exact moment a port stops matching its reference.
      </P>

      <H2>Two oracles, not the author&apos;s word</H2>
      <P>
        Swiss Ephemeris 2.10 is the same-frame oracle across 1850&ndash;2150; JPL
        Horizons is the independent reference at a separate set of epochs. The
        per-body bounds are published on <A href="/validation">Validation</A>, and the methodology behind them
        on <A href="/methods">Methods</A>. For an engine written by a machine,
        the trust comes from the oracle rather than the author, which is the same
        standard a human-written engine should meet.
      </P>

      <H2>Direction stayed human</H2>
      <P>
        The agents wrote the code; a person chose what shipped. Work lands on a
        development branch, and a person promotes it to the main branch, so
        someone signs off before anything reaches users. Dead-ends were reverted
        rather than shipped: when a heavier lunar data pack broke the browser
        bundle and lost accuracy against the reference, it went back to the
        existing fit, which already sat at the reference floor. The agents
        supplied speed; the judgment about what was correct and what belonged
        stayed with a person.
      </P>

      <H2>The prose has the same gate</H2>
      <P>
        AI writes like AI. The repository runs a prose linter with a rule set for
        the usual machine tells: the em-dash used as a connective, the three-verb
        drumroll, the manufactured conclusion, the closing pleasantry. It fails
        continuous integration the way a failing test does. This page was held to
        the same gate.
      </P>

      <Note>
        None of this removes the human. It moves the human from typing to
        directing and reviewing, and it leans on a test harness and two ephemeris
        oracles to catch what review alone would miss.
      </Note>

      <H2>Why the name Caelus?</H2>
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", flexWrap: "wrap", margin: "1rem 0" }}>
        <figure style={{ margin: 0, flex: "none", textAlign: "center", color: "var(--accent)" }}>
          <CaelusMark size={132} />
          <figcaption className="dim small" style={{ marginTop: "0.4rem", maxWidth: 150 }}>
            An original drawing, after the Carnuntum altar.
          </figcaption>
        </figure>
        <div style={{ flex: "1 1 18rem" }}>
          <P>
            Caelus is the Roman god of the sky, the personification of the heavens.
            Roman art shows him as a bearded figure holding his cloak in a
            billowing arch above his head, a gesture called <em>velificatio</em>{" "}
            that signals the vault of the firmament. The face here is drawn from one
            such figure on a third-century altar from Carnuntum, where Caelus
            kneels beneath the four seasons and their winds. The name suited an
            engine whose whole task is to compute the positions on that vault.
          </P>
        </div>
      </div>

      <P dim>
        <A href="/validation">Validation tables &rarr;</A>{" "}
        <A href="/methods">Methods &rarr;</A>{" "}
        <A href="/notes">Build Notes &rarr;</A>{" "}
        <A href="https://github.com/heavyblotto/caelus">Source &rarr;</A>
      </P>
    </main>
  );
}
