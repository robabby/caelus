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
  return (
    <section className="page-close" aria-labelledby="page-close-heading">
      <H2 id="page-close-heading">{title}</H2>
      <Cta
        variant="compact"
        secondaryHref={secondaryHref}
        secondaryLabel={secondaryLabel}
      />
    </section>
  );
}
