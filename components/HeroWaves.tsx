/**
 * Layered SVG wave divider for the bottom edge of a gradient hero panel.
 *
 * Three stacked wave paths at different opacities drift sideways at slightly
 * different rates (a cheap parallax) on a very slow loop. The drift is pure CSS
 * (see the `wavedrift` keyframes in globals.css) and is disabled entirely under
 * `prefers-reduced-motion` via the `.wave-layer` hook. Each path is drawn wider
 * than the viewBox so the sideways slide never reveals an empty edge.
 *
 * Decorative only — hidden from assistive tech.
 */
export function HeroWaves() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 overflow-hidden" aria-hidden>
      <svg
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        className="absolute bottom-0 h-full w-full"
      >
        {/* Back wave — faintest, drifts farthest. */}
        <path
          className="wave-layer"
          style={{ ["--drift" as string]: "-60px", animation: "wavedrift 26s ease-in-out infinite alternate" }}
          fill="#0b1f3a"
          fillOpacity="0.5"
          d="M-160 70 C 120 30, 360 100, 620 64 S 1140 24, 1440 64 1760 92, 2000 64 L2000 120 L-160 120 Z"
        />
        {/* Mid wave. */}
        <path
          className="wave-layer"
          style={{ ["--drift" as string]: "-40px", animation: "wavedrift 20s ease-in-out infinite alternate" }}
          fill="#081626"
          fillOpacity="0.7"
          d="M-160 84 C 160 52, 380 104, 660 80 S 1180 48, 1440 82 1740 104, 2000 82 L2000 120 L-160 120 Z"
        />
        {/* Front wave — solid abyss, seats the panel into the page background. */}
        <path
          className="wave-layer"
          style={{ ["--drift" as string]: "-28px", animation: "wavedrift 15s ease-in-out infinite alternate" }}
          fill="#020617"
          d="M-160 98 C 200 78, 420 112, 720 96 S 1220 80, 1440 98 1720 112, 2000 98 L2000 120 L-160 120 Z"
        />
      </svg>
    </div>
  );
}
