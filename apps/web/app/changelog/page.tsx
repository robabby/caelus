import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import ApiMarkdown from "../../components/ApiMarkdown";
import { Eyebrow, Lead, P } from "../../components/Prose";

export const metadata = {
  title: "Changelog",
  description: "Release notes for caelus, caelus-mcp, caelus-birth, and caelus-wheel, versioned in lockstep.",
};

function loadChangelog(): string | null {
  const path = join(process.cwd(), "..", "..", "CHANGELOG.md");
  if (!existsSync(path)) return null;
  // drop everything before the first release heading: the page already
  // provides the title and the lockstep/accuracy lead, so the file's own
  // H1 and intro paragraph would otherwise render a second time.
  return readFileSync(path, "utf8").replace(/^[\s\S]*?(?=^## )/m, "");
}

export default function Changelog() {
  const content = loadChangelog();
  return (
    <main className="container page">
      <Eyebrow>Changelog</Eyebrow>
      <h1>Changelog</h1>
      <Lead>
        All four packages version in lockstep. Numbers are as measured at release
        time; current figures live in <code>accuracy.json</code> and on{" "}
        <a href="/validation">Validation</a>.
      </Lead>
      {content ? <ApiMarkdown content={content} /> : <P>Changelog unavailable.</P>}
    </main>
  );
}
