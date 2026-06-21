import { A, Lead, P, H2 } from "../../components/Prose";
import { SITE } from "../../lib/site";
import { pageMetadata } from "../../lib/seo";

export const metadata = pageMetadata({
  title: "Privacy",
  description:
    "Caelus collects no personal data. The Playground computes charts in your browser; birth data never leaves your device.",
  path: "/privacy",
});

export default function Privacy() {
  return (
    <main className="container page">
      <h1>Privacy</h1>
      <Lead>
        Caelus is an open-source library and its documentation site. It collects
        no personal data, runs no analytics, and sets no advertising or tracking
        cookies.
      </Lead>

      <H2>What stays on your device</H2>
      <P>
        The <A href="/playground">Playground</A> computes charts entirely in your
        browser using the engine itself. The birth date, time, and place you enter
        are never sent to a server. A share link encodes those inputs in the URL
        fragment (the part after <code>#</code>), which browsers do not transmit;
        it travels only if you copy the link and send it yourself.
      </P>
      <P>
        The one thing kept locally is your light or dark theme preference, stored
        in <code>localStorage</code> so the site remembers it on your next visit.
        Nothing else is stored, and clearing site data removes it.
      </P>

      <H2>The hosted API</H2>
      <P>
        The optional REST and <A href="/docs/mcp">MCP</A> endpoints are stateless:
        they receive only the parameters a request sends (such as date, latitude,
        and longitude), compute a result, and return it. They keep no logs of birth
        data and store nothing between requests.
      </P>

      <H2>Questions</H2>
      <P>
        The code is MIT licensed and fully auditable on{" "}
        <A href={SITE.repo}>GitHub</A>. If something here is unclear, open an issue
        there.
      </P>
    </main>
  );
}
