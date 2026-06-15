import type { ReactNode } from "react";
import { A } from "./Prose";
import { SITE } from "../lib/site";

/**
 * Each item carries the display answer (with links) and a plain-text twin for
 * the FAQPage structured data. They must stay in sync; the schema text mirrors
 * what a visitor reads, which is what Google expects for rich results.
 */
type QA = { q: string; a: ReactNode; text: string };

const ITEMS: QA[] = [
  {
    q: "Is Caelus free to use in commercial projects?",
    a: (
      <>
        Yes. All four packages are{" "}
        <A href={`${SITE.repo}/blob/main/LICENSE`}>MIT licensed</A>, with no Swiss
        Ephemeris dependency and no AGPL obligations, so you can ship it in
        closed-source and commercial apps.
      </>
    ),
    text:
      "Yes. All four packages are MIT licensed, with no Swiss Ephemeris dependency and no AGPL obligations, so you can ship it in closed-source and commercial apps.",
  },
  {
    q: "How accurate is it?",
    a: (
      <>
        Every body's deviation from a reference ephemeris is measured and
        published, then replayed against thousands of golden checks in CI. The
        full tables are on the <A href="/validation">Validation</A> page.
      </>
    ),
    text:
      "Every body's deviation from a reference ephemeris is measured and published, then replayed against thousands of golden checks in CI. The full tables are on the Validation page.",
  },
  {
    q: "Do I need Swiss Ephemeris or ephemeris files?",
    a: (
      <>
        No. The planetary data is embedded in the package, so there are no files
        to download or deploy. See <A href="/docs/data-tiers">Data Tiers</A> for
        what ships in the bundle.
      </>
    ),
    text:
      "No. The planetary data is embedded in the package, so there are no files to download or deploy.",
  },
  {
    q: "What date range does it cover?",
    a: (
      <>
        Several centuries around the present. A body outside its fitted range,
        such as Chiron before about 1850 or after 2150, is omitted from the chart
        and listed under its <code>unavailable</code> field rather than guessed.
        See <A href="/docs/edge-cases">Edge Cases</A>.
      </>
    ),
    text:
      "Several centuries around the present. A body outside its fitted range, such as Chiron before about 1850 or after 2150, is omitted from the chart and listed under its unavailable field rather than guessed.",
  },
  {
    q: "Does it support Vedic astrology, or only Western?",
    a: (
      <>
        Both. Alongside the Western chart it computes nakshatras, the Vimshottari,
        Yogini, and Ashtottari dashas, the divisional charts (vargas), and the
        yogas. See <A href="/docs/vedic">Vedic &amp; Jyotish</A>.
      </>
    ),
    text:
      "Both. Alongside the Western chart it computes nakshatras, the Vimshottari, Yogini, and Ashtottari dashas, the divisional charts (vargas), and the yogas.",
  },
  {
    q: "Can charts be computed without sending birth data to a server?",
    a: (
      <>
        Yes. The engine does no I/O and runs in the browser, so an app can compute
        a chart entirely on the client and never transmit birth data. Try the{" "}
        <A href="/playground">Playground</A>; details on{" "}
        <A href="/privacy">Privacy</A>.
      </>
    ),
    text:
      "Yes. The engine does no I/O and runs in the browser, so an app can compute a chart entirely on the client and never transmit birth data.",
  },
  {
    q: "Can I use it with AI assistants like Claude or Cursor?",
    a: (
      <>
        Yes. <code>caelus-mcp</code> exposes twenty-eight chart tools over the Model
        Context Protocol, available hosted or as a local stdio server. See{" "}
        <A href="/docs/mcp">MCP Setup</A>.
      </>
    ),
    text:
      "Yes. The caelus-mcp package exposes twenty-eight chart tools over the Model Context Protocol, available hosted or as a local stdio server.",
  },
  {
    q: "Does it interpret a chart, or just compute it?",
    a: (
      <>
        It computes; you interpret. The engine stops at validated geometry and
        ships no flavour text. For generated readings it provides an{" "}
        <A href="/docs/interpretation">interpretation layer</A>: a chart projects
        into ranked, citable fact atoms that a rule corpus or an LLM plugs into,
        with citation auditing to keep an AI grounded in the real chart. The
        meaning is always yours and always traceable to a fact.
      </>
    ),
    text:
      "It computes; you interpret. The engine stops at validated geometry and ships no flavour text. For generated readings it provides an interpretation layer: a chart projects into ranked, citable fact atoms that a rule corpus or an LLM plugs into, with citation auditing to keep an AI grounded in the real chart.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: ITEMS.map(({ q, text }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text },
  })),
};

export default function FAQ() {
  return (
    <section aria-labelledby="faq-heading" style={{ marginTop: "2.5rem" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <h2 id="faq-heading">Frequently asked questions</h2>
      <div style={{ borderBottom: "1px solid var(--border)", marginTop: "1rem" }}>
        {ITEMS.map(({ q, a }) => (
          <details key={q} style={{ borderTop: "1px solid var(--border)", padding: "0.85rem 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{q}</summary>
            <div className="dim" style={{ margin: "0.6rem 0 0", lineHeight: 1.6, maxWidth: "44rem" }}>
              {a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
