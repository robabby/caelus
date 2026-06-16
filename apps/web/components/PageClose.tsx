import { useId } from "react";
import Cta from "./Cta";
import { H2 } from "./Prose";

type PageCloseProps = {
  title?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export default function PageClose({
  title = "Start building",
  secondaryHref,
  secondaryLabel,
}: PageCloseProps) {
  const headingId = useId();
  return (
    <section className="page-close" aria-labelledby={headingId}>
      <H2 id={headingId}>{title}</H2>
      <Cta
        variant="compact"
        secondaryHref={secondaryHref}
        secondaryLabel={secondaryLabel}
      />
    </section>
  );
}
