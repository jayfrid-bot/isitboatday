# Is It Boat Day? ⛵🌊

Live local boating conditions for **Boca Raton, FL**, consolidated into one page
with a single composite **Boat Day** score that answers one question: *should you
take the boat out today?* Built config-first so adding a new boating town is a
single entry — the long-term goal is *every* boating town.

> **TODO:** after changing the boat mark in `assets/icon.svg`, regenerate the raster
> PNGs (`public/icon-*.png`, `app/icon.png`, `app/apple-icon.png`) via
> `scripts/gen-icons` — they are still the old artwork until then.

## What it shows

- **Wind** — the make-or-break factor, shown in **knots** (NWS + nearest NDBC buoy),
  with gust spread when the buoy reports it
- **Seas** — wave height & period, e.g. "2.3 ft @ 9 s" (NDBC buoy + Open-Meteo)
- **Tides** — next high/low and an inlet note keyed to the trend and wind (NOAA CO-OPS)
- **NWS marine zone alerts** — Small Craft Advisory, Gale/Storm Warning, Special
  Marine Warning, Dense Fog Advisory (`api.weather.gov`) — **the safety authority**
- **Lightning** — nearest strike + recency from NOAA GOES GLM (a reason to stay docked)
- **Visibility** — fog is a navigation hazard (Open-Meteo)
- **Air & water temp, humidity, dew point, UV, cloud cover, rain chance** — NWS + Open-Meteo
- **Ramp & marina traffic** — congestion near the waterfront (HERE Traffic, optional)
- **Inlet & waterway cams** — check the inlet before you launch; each cam shows live
  weather & wind from Open-Meteo at its own coordinates

## The Boat Day score

One composite **Boat Day** score (0–100), weighted for boaters. Sub-scores (weights
sum to 1.00; a missing input drops out of the weighted average):

| Sub-score | Weight | What it rewards |
|-----------|:------:|-----------------|
| Wind | 24% | Calm/glass (≤10 kn) is best; fades to 0 by 25 kn. Big gust spread = squally penalty |
| Seas (height & period) | 22% | Flat is best; long-period swell is gentler than short chop |
| Storms & rain | 18% | Dry and sunny; thunder/rain wording clamps it down hard |
| Visibility | 8% | Clear sightlines; fog tanks it |
| Air temperature | 8% | Comfortable 72–90 °F plateau |
| Comfort (mugginess) | 6% | Dew-point curve |
| Water temperature | 6% | Pleasant for a sandbar swim |
| Tide & inlet | 4% | Incoming is friendly; ebb against an onshore east wind = steep inlet chop |
| UV exposure | 4% | No shade on a boat |

**Hard safety caps** (worst wins; each gets a plain-English explanation):

| Condition | Caps score at |
|-----------|:------:|
| Gale/Storm/Hurricane-force Warning or tsunami | 5 |
| Hurricane/Tropical Storm/Storm Surge warning (land) | 10 |
| Special Marine Warning active | 15 |
| Lightning within 10 mi | 15 |
| Thunder in current conditions | 20 |
| Marine Dense Fog Advisory or visibility < 1 mi | 30 |
| Wave height ≥ 6 ft | 35 |
| Lightning within 25 mi | 40 |
| Rain in the forecast | 40 |
| Small Craft Advisory active | 45 |

Ratings: **≥80 Excellent · ≥65 Good · ≥45 Fair · else Poor**. The verdict line
(`boatDayVerdict`) reads e.g. "Yes — get out there", "Pretty good day to boat",
"Borderline — check the caps", "Not today, captain".

> The **NWS marine zone forecast** is the authoritative safety signal — the score
> is guidance, the marine warnings are the rule.

## Tech

Next.js (App Router) + TypeScript + Tailwind. All data is fetched **server-side**
(avoids CORS, centralizes caching) by isolated adapters in `lib/sources/*`,
aggregated in `lib/conditions.ts`, scored in `lib/score.ts`, and exposed at
`GET /api/conditions/[slug]`.

```
config/locations.ts   # add a town here — drives everything
lib/sources/*          # one adapter per data source (each degrades gracefully)
lib/conditions.ts      # parallel fetch + assemble snapshot
lib/score.ts           # Boat Day score with weighted breakdown & safety caps
app/[slug]/page.tsx    # boat dashboard (client shell: ConditionsDashboard)
app/page.tsx           # all-towns landing
app/api/conditions/... # cached JSON API (also a public endpoint)
```

## Develop

```bash
npm install
npm run dev      # http://localhost:3000/boca-raton
npm test         # parser + scoring unit tests (Vitest)
npm run lint
npm run build
```

No API keys are required — every default source is free and keyless. See `.env.example`
for the optional Stormglass key, the HERE Traffic key, and the `User-Agent` used for NWS.

## Add a boating town

Add an entry to `LOCATIONS` in `config/locations.ts`. Four things drive everything:
the **NOAA tide station**, the nearest **NDBC buoy**, the **NWS marine zone** (the
`AMZ…` offshore coastal-waters zone), and the **cams** (list the inlet first):

```ts
{
  slug: "fort-lauderdale",
  name: "Fort Lauderdale",
  region: "Broward County, FL",
  lat: 26.122, lon: -80.103,
  timezone: "America/New_York",
  noaaTideStationId: "8722956",      // nearest NOAA CO-OPS tide station
  ndbcBuoyId: "FWYF1",                // nearest NDBC buoy
  offshoreWindFromDeg: 270,           // coast faces east -> offshore wind from the west
  nwsMarineZoneId: "AMZ630",          // NWS offshore marine zone (Coastal Waters …)
  cams: [ /* inlet cam first, then ramps / waterways; iframe or link cams */ ],
}
```

That's it — the route, scoring, and UI all pick it up automatically.

- **Find the tide station**: https://tidesandcurrents.noaa.gov/ — search the inlet/harbor.
- **Find the buoy**: https://www.ndbc.noaa.gov/ — the nearest coastal station.
- **Find the marine zone**: the `AMZ…` id from the NWS marine forecast for your coast
  (e.g. Boca Raton is **AMZ650**, "Coastal waters from Jupiter Inlet to Deerfield Beach
  FL out 20 NM"). Confirm against
  `https://api.weather.gov/zones/marine/AMZ650`.

## Deploy

### Netlify

This repo already ships `netlify.toml` (and `.nvmrc`), so it's zero-config on the
official Next.js runtime:

1. Push to GitHub, then in Netlify pick **Add a new site → Import an existing project**
   and select this repo. Netlify reads `netlify.toml` (`npm run build`, Node 20, the
   `@netlify/plugin-nextjs` plugin) and auto-installs the plugin.
2. No environment variables are required. Optionally set `CONDITIONS_USER_AGENT`,
   `HERE_API_KEY`, or `STORMGLASS_API_KEY` (see `.env.example`) under
   **Site settings → Environment variables**.
3. SSG pages, the `/api/conditions/[slug]` route, and per-source `next.revalidate`
   caching all work on Netlify's Next.js runtime.

From the CLI instead: `npm i -g netlify-cli && netlify deploy --build` (add `--prod`
to publish).

### DNS for isitboatday.com (Namecheap)

The domain is registered at Namecheap; point it at Netlify:

1. In **Netlify → Domain settings**, add `isitboatday.com` as a custom domain. Netlify
   shows you the exact records to create (an apex **A** or **ALIAS** record, plus a
   **CNAME** for `www`).
2. In **Namecheap → Domain List → Manage → Advanced DNS**, add those records:
   - the apex **A/ALIAS** record Netlify displays (its load-balancer IP / ALIAS target), and
   - a **CNAME** for `www` pointing at the `…netlify.app` host Netlify shows.
3. Save. DNS propagates within minutes to a few hours. **HTTPS is automatic** —
   Netlify provisions a Let's Encrypt certificate once the records resolve.

---

*Is It Boat Day is a sister app of [isitbeachday.com](https://isitbeachday.com) — same
skeleton, different judgment call.*

*Scores are an automated estimate for general guidance only — not a safety
determination. Check the official NWS marine forecast and use your own judgment as captain.*
