// Brand logo for "Is It Boat Day" — a motorboat riding waves, plus an optional
// wordmark. Pure inline SVG so it ships with zero requests and inherits sizing.

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-hidden
      className="shrink-0 rounded-xl"
    >
      <defs>
        <linearGradient id="lg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1758b6" />
          <stop offset="0.55" stopColor="#142f57" />
          <stop offset="1" stopColor="#061826" />
        </linearGradient>
        <linearGradient id="lg-hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="1" stopColor="#fbbf24" />
        </linearGradient>
        <linearGradient id="lg-wave" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#59c1ff" />
          <stop offset="1" stopColor="#1b85f5" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" fill="url(#lg-sky)" />

      {/* sun glow low on the horizon */}
      <circle cx="370" cy="150" r="48" fill="#ffd76e" opacity="0.85" />

      {/* motorboat: hull + windscreen, riding above the waterline */}
      <g>
        {/* cabin / windscreen */}
        <path d="M196 214 L300 214 L286 262 L196 262 Z" fill="#bce7ff" />
        {/* hull */}
        <path
          d="M120 262 L372 262 L330 322 Q 322 336 304 336 L168 336 Q 150 336 142 322 Z"
          fill="url(#lg-hull)"
        />
        {/* bow accent stripe */}
        <path d="M120 262 L372 262 L364 280 L132 280 Z" fill="#f59e0b" opacity="0.7" />
      </g>

      {/* waves the boat sits in */}
      <path
        d="M0 330 Q 64 300 128 330 T 256 330 T 384 330 T 512 330 V 512 H 0 Z"
        fill="url(#lg-wave)"
      />
      <path
        d="M0 396 Q 64 366 128 396 T 256 396 T 384 396 T 512 396 V 512 H 0 Z"
        fill="#146de1"
        opacity="0.95"
      />
    </svg>
  );
}

/** Mark + wordmark lockup; the "?" carries the brand question in sun gold. */
export function Logo({ markSize = 36 }: { markSize?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={markSize} />
      <span className="whitespace-nowrap font-bold tracking-tight text-white">
        Is it boat day<span className="text-amber-400">?</span>
      </span>
    </span>
  );
}
