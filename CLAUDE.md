# CLAUDE.md — Is It Boat Day

Next.js (App Router) + TypeScript + Tailwind app that consolidates live boating
conditions and computes a composite **Boat Day** score (0–100). Designed to
scale from Boca Raton to every boating town.

## Architecture (read these first)
- `config/locations.ts` — the source of truth. Adding a town = adding one entry
  (tide station + buoy + `nwsMarineZoneId` + cams).
- `lib/types.ts` — shared domain types; every source returns `Wrapped<T>` with a status.
- `lib/sources/*` — one adapter per data source. **Each must catch its own errors and
  return a `Wrapped<T>` (never throw to the UI).** Pure parsers (`parseNdbcRealtime`,
  `parseNoaaPredictions`, etc.) are split out and unit-tested.
- `lib/conditions.ts` — fetches all sources in parallel and assembles the snapshot.
- `lib/score.ts` — `deriveMetrics` consolidates best-available values; `computeScores`
  produces the Boat Day score with sub-score breakdowns and hard safety caps.
- `app/api/conditions/[slug]/route.ts` — cached JSON API and the data the pages use.
- `components/ConditionsDashboard.tsx` — client shell (SWR polling, dashboard layout).

## Conventions
- All external data is fetched **server-side** with per-source `next.revalidate` caching.
- Units are normalized to imperial in the adapters; conversions live in `lib/util.ts`.
  Wind is **stored in mph** but **displayed in knots** (boaters speak knots) via
  `mphToKnots` from `lib/util.ts`.
- New data source => new `lib/sources/x.ts` returning `Wrapped<T>` + a fixture-based test.

## Guardrails
- Keep the Boat Day score as **guidance only**. The authoritative safety signal is the
  **NWS marine zone forecast**: a Small Craft Advisory, Gale/Storm Warning, Special
  Marine Warning, or Dense Fog Advisory overrides the score (it caps it) and gets top
  billing in the safety banner. Never present the score as a go/no-go determination.
- Lightning within range is a hard cap, not a suggestion — no shelter exists on open water.

## Commands
```bash
npm install
npm run dev
npm test          # Vitest (parsers + scoring)
npm run lint
npm run build
```

## Communication
- The owner prefers plain-English explanations. Explain technical concepts in
  plain language (define jargon, use analogies) rather than assuming expertise.
