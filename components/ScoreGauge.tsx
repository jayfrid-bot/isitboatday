"use client";

import { useEffect, useId, useState } from "react";
import { clamp } from "@/lib/util";

/**
 * The headline Boat Day dial. The ring is stroked with a gradient in the
 * verdict color (a darker tail easing into the bright accent head) and carries
 * a soft glow. On mount it sweeps from empty to the score: we render at 0 for
 * the first paint, then flip to the real value so the CSS transition on
 * stroke-dashoffset animates the fill in. (prefers-reduced-motion users still
 * get the same one-shot settle — it reads as the dial coming to rest.)
 */
export function ScoreGauge({
  score,
  rating,
  label,
  accent,
}: {
  score: number;
  rating: string;
  label: string;
  accent: string;
}) {
  const gradId = useId();
  const r = 80;
  const circ = 2 * Math.PI * r;
  const pct = clamp(score, 0, 100) / 100;

  // Start empty, then sweep to the score after first paint.
  const [swept, setSwept] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSwept(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const shownPct = swept ? pct : 0;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 200" className="h-48 w-48">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            {/* Dim tail → bright accent head, both inside the verdict ramp. */}
            <stop offset="0%" stopColor={accent} stopOpacity="0.45" />
            <stop offset="100%" stopColor={accent} stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={r} fill="none" stroke="#1e293b" strokeWidth="16" />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - shownPct)}
          transform="rotate(-90 100 100)"
          className="gauge-glow"
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1), stroke 300ms ease" }}
        />
        <text
          x="100"
          y="96"
          textAnchor="middle"
          fill="white"
          fontSize="52"
          fontWeight="700"
          className="tabular-nums"
        >
          {score}
        </text>
        <text x="100" y="126" textAnchor="middle" fill="#94a3b8" fontSize="15">
          out of 100
        </text>
      </svg>
      <div className="mt-1 text-xl font-semibold" style={{ color: accent }}>
        {rating}
      </div>
      <div className="text-sm text-slate-400">{label}</div>
    </div>
  );
}
