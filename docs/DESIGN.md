# Is It Boat Day — Design Direction

*Art direction by Claude Fable 5. Executed in the post-build design phase.*

## Feel

A premium marine instrument cluster at dawn. Calm, confident, legible at arm's
length on a phone in sunlight. Nautical without kitsch — no anchors-and-rope
clip art; the sea shows up as color, light, and motion instead.

## Palette (Tailwind `ocean` family, refined)

| Role | Color | Use |
|---|---|---|
| Abyss base | `#020617` → `#0b1f3a` | page background, deep navy gradient (dawn-over-water: indigo top, teal horizon glow) |
| Ocean accents | existing `ocean` teal/cyan ramp | links, gauge, active states, wave motifs |
| Verdict ramp | red `#f87171` → amber `#fbbf24` → green `#34d399` | score gauge + verdict text (existing `scoreColor`) |
| Advisory brass | `#f59e0b` on `#451a03/40` | Small Craft Advisory, fog banners |
| Warning signal | `#ef4444` on `#450a0a/40` | gale/storm/lightning banners |
| Glass | `bg-slate-900/60` + `ring-white/10` + `backdrop-blur` | cards (already close; standardize) |

## Logo

Concept: **a bow cutting a wave inside a circular badge** — minimal boat hull
(simple sheer line + small console silhouette) riding two layered swooshing
waves, sun disc behind. Circle badge = works as favicon/app icon/maskable.
Wordmark: "Is It **Boat** Day" in the existing font stack, bold, with "Boat"
in ocean teal. Same art in `components/Logo.tsx` (inline SVG with wordmark)
and `assets/icon.svg` (badge only, elements inside the inner 80% safe zone),
then `node scripts/gen-icons.mjs` regenerates every raster icon, plus the iOS
`AppIcon-512@2x.png` (1024px, no transparency for App Store).

## Signature moments (keep it fast — pure CSS/SVG, no new deps)

1. **Hero verdict panel**: full-width gradient panel (deep indigo → teal
   horizon), the "Is it boat day?" verdict + gauge floating on it, with a
   subtle layered **SVG wave divider** at the bottom edge (3 stacked wave
   paths at different opacities, gentle CSS `translateX` drift animation,
   `prefers-reduced-motion` respected).
2. **Score gauge**: gradient stroke (verdict color), soft glow, animated
   sweep on load (CSS transition on stroke-dashoffset).
3. **Metric cards**: consistent glass treatment, one accent icon per card,
   tabular numerals for values, hover lift on desktop. Wind card is the hero:
   knots huge, compass needle smooth-rotating.
4. **Safety banners**: flag-style left border, bold plain-English headline,
   never cute — these are the one place design defers entirely to clarity.
5. **Tide & sun panels**: the existing curves get gradient fills under the
   line and a "now" marker dot with pulse.
6. **Cam grid**: rounded stills with a subtle inner shadow + provider chip;
   inlet cams get a "INLET" corner tag.
7. **OG/social image**: 1200×630 static card (badge + wordmark + tagline
   "Should you take the boat out?") generated from SVG via sharp alongside
   the icons.

## Typography & rhythm

System font stack (keep — fast). Numbers: `tabular-nums`. Scale: verdict 2xl,
score huge, card values xl, labels xs uppercase tracking-widest slate-400.
Spacing rhythm: 4/6 gap grid as today, max-w-5xl container unchanged.

## Don'ts

No new fonts, no heavy animation libraries, no parallax, no autoplay video.
Lighthouse performance must not regress; everything above is CSS/SVG-only.
