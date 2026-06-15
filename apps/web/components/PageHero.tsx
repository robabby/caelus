import type { ReactNode } from "react";
import Cta from "./Cta";
import { Eyebrow } from "./Prose";

type PageHeroProps = {
  eyebrow: string;
  title: string;
  children: ReactNode;
  cta?: "hero" | "compact";
  after?: ReactNode;
};

export default function PageHero({ eyebrow, title, children, cta, after }: PageHeroProps) {
  return (
    <header className="page-hero">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1>{title}</h1>
      {children}
      {cta ? <Cta variant={cta} /> : null}
      {after}
    </header>
  );
}
