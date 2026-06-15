import { A, Eyebrow, Lead, P } from "../components/Prose";
import CaelusMark from "../components/CaelusMark";

export const metadata = {
  title: "Off the chart",
  description: "This page is not on the chart.",
};

export default function NotFound() {
  return (
    <main className="container page" style={{ textAlign: "center" }}>
      <div style={{ color: "var(--accent)", display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
        <CaelusMark size={148} title="Caelus, holding the veil of the sky" />
      </div>
      <Eyebrow>404</Eyebrow>
      <h1>Off the chart</h1>
      <Lead>
        Caelus holds the whole sky, but this address is not on it. The page may
        have moved, or it never rose above the horizon.
      </Lead>
      <P dim>
        <A href="/">Home</A> · <A href="/docs">Docs</A> ·{" "}
        <A href="/playground">Playground</A> · <A href="/validation">Validation</A>
      </P>
    </main>
  );
}
