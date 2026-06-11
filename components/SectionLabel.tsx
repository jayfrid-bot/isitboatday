import type { ReactNode } from "react";

/**
 * Shared section eyebrow. One consistent treatment for every section title on
 * the page (uppercase, wide tracking, muted) so the dashboard reads as one
 * instrument cluster rather than a stack of differently-styled cards.
 */
export function SectionLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-xs font-semibold uppercase tracking-widest text-slate-400 ${className}`}
    >
      {children}
    </h2>
  );
}
