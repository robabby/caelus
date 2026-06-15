/**
 * Caelus as an original line drawing: the bearded sky god under the velificatio,
 * the cloak billowing into an arch that stands for the vault of the firmament.
 * Drawn from scratch (not traced from any photo), so the asset is ours. Strokes
 * use currentColor, so set `color` on a parent to theme it.
 */
type Props = { size?: number; className?: string; title?: string };

export default function CaelusMark({
  size = 120,
  className,
  title = "Caelus, the sky god, holding the veil of the firmament",
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={title}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={3.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{title}</title>
      <path d="M16 82 C18 40 40 22 60 22 C80 22 102 40 104 82" />
      <path d="M25 82 C27 48 44 33 60 33 C76 33 93 48 95 82" opacity="0.45" />
      <path d="M16 82 c-4 5 -3 10 2 12" />
      <path d="M104 82 c4 5 3 10 -2 12" />
      <circle cx="60" cy="41" r="2.6" fill="currentColor" stroke="none" />
      <path d="M41 57 c2 -7 9 -9 15 -6" />
      <path d="M79 57 c-2 -7 -9 -9 -15 -6" />
      <path d="M47 65 q13 -7 26 0" />
      <circle cx="52" cy="70" r="2" fill="currentColor" stroke="none" />
      <circle cx="68" cy="70" r="2" fill="currentColor" stroke="none" />
      <path d="M60 68 c0 9 1 13 -4 15" />
      <path d="M50 85 q10 6 20 0" />
      <path d="M46 82 C42 98 50 112 60 105 C70 112 78 98 74 82" />
      <path d="M55 94 q5 6 10 0" opacity="0.55" />
    </svg>
  );
}
