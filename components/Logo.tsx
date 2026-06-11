// Brand logo for "Is It Boat Day" — a white sport boat cutting toward a dawn
// sun through layered swells, plus an optional wordmark. Pure inline SVG so it
// ships with zero requests and inherits sizing. (Same art as assets/icon.svg.)

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
          <stop offset="0" stopColor="#0a1730" />
          <stop offset="0.58" stopColor="#11305b" />
          <stop offset="1" stopColor="#1b4a7a" />
        </linearGradient>
        <linearGradient id="lg-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffedb8" />
          <stop offset="1" stopColor="#f9b234" />
        </linearGradient>
        <linearGradient id="lg-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d3a66" />
          <stop offset="1" stopColor="#071c33" />
        </linearGradient>
      </defs>

      <rect width="512" height="512" fill="url(#lg-sky)" />

      {/* dawn glow sitting on the horizon */}
      <ellipse cx="330" cy="292" rx="250" ry="96" fill="#f59e0b" opacity="0.16" />
      <circle cx="330" cy="200" r="92" fill="#fbbf24" opacity="0.22" />
      <circle cx="330" cy="200" r="54" fill="url(#lg-sun)" />

      {/* sea base under the wave bands */}
      <rect y="300" width="512" height="212" fill="url(#lg-sea)" />

      {/* swells, brightest at the surface */}
      <path d="M0 316 Q 64 296 128 316 T 256 316 T 384 316 T 512 316 V 512 H 0 Z" fill="#38bdf8" opacity="0.95" />
      <path d="M0 372 Q 64 348 128 372 T 256 372 T 384 372 T 512 372 V 512 H 0 Z" fill="#0e7dc2" />
      <path d="M0 428 Q 64 406 128 428 T 256 428 T 384 428 T 512 428 V 512 H 0 Z" fill="#0a4e86" />

      {/* wake trailing the stern */}
      <path d="M84 322 Q 110 316 138 320" stroke="#bae6fd" strokeWidth="9" strokeLinecap="round" fill="none" opacity="0.55" />
      <path d="M62 344 Q 96 336 132 341" stroke="#7dd3fc" strokeWidth="7" strokeLinecap="round" fill="none" opacity="0.35" />

      {/* the boat: white hull, sheer line sweeping up to the bow (heading right) */}
      <path d="M148 298 Q 260 282 378 264 Q 366 296 352 314 L 170 316 Q 152 312 148 298 Z" fill="#f8fafc" />
      {/* hull shadow along the waterline */}
      <path d="M170 316 L 352 314 Q 356 309 360 302 L 176 306 Q 172 311 170 316 Z" fill="#94a3b8" opacity="0.55" />
      {/* raked windscreen */}
      <path d="M206 292 L 252 286 L 264 266 L 226 271 Z" fill="#7dd3fc" />

      {/* bow spray */}
      <path d="M352 314 Q 388 306 408 318 Q 386 328 358 322 Z" fill="#e0f2fe" opacity="0.9" />
      <path d="M396 300 Q 408 296 416 300 Q 408 308 398 306 Z" fill="#e0f2fe" opacity="0.6" />
    </svg>
  );
}

/** Mark + wordmark lockup; "boat" in ocean teal, the brand "?" in sun gold. */
export function Logo({ markSize = 36 }: { markSize?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={markSize} />
      <span className="whitespace-nowrap font-bold tracking-tight text-white">
        Is it <span className="text-ocean-300">boat</span> day
        <span className="text-amber-400">?</span>
      </span>
    </span>
  );
}
