# Is It Boat Day — Pivot Plan

*Authored by Claude Fable 5 (orchestrator). Built by a fleet of Opus agents working
in parallel against the contracts below. Forked from the Is It Beach Day codebase.*

---

## 1. The idea in plain English

Is It Beach Day answers "should I go to the beach today?" **Is It Boat Day**
(isitboatday.com) answers "should I take the boat out today?" — same skeleton,
different judgment call. A great beach day and a great boat day are scored on
different things:

| What matters | Beach day | Boat day |
|---|---|---|
| Wind | Light sea breeze is nice | **The** make-or-break factor. Calm = glass. 20+ knots = stay home |
| Waves | Only matters for swimming | Critical: 2 ft is pleasant, 6 ft is dangerous in a small boat |
| Thunderstorms | Annoying | **Life-threatening** — no shelter on open water |
| Lightning | A reason to leave | A reason to never leave the dock |
| Tides | Mild curiosity | Real: inlet timing, sandbar depth, current |
| Fog/visibility | Irrelevant | A navigation hazard |
| Lifeguard flags | The safety authority | Replaced by **NWS marine zone alerts** (Small Craft Advisory, Gale Warning) |
| Seaweed, sand temp, crowds | Beach things | Not boat things — removed |

The architecture carries over wholesale: one config entry per town, one adapter
per data source returning `Wrapped<T>`, parallel server-side fetch, a composite
0-100 score with sub-scores and hard safety caps, SWR-polled dashboard, live cams.

**Wind is displayed in knots** (boaters speak knots); internal storage stays mph
(imperial-in-adapters convention unchanged).

## 2. What carries forward / changes / is new

**Kept as-is** (≈80% of the code): tides (NOAA CO-OPS), buoy (NDBC), weather
(NWS), marine (Open-Meteo waves/swell/SST), rain nowcast, lightning (GOES GLM
job — same geography, same upstream), 7-day + hourly forecast, sun/moon, traffic
(relabeled "ramp & marina traffic"), cams (the Boca Inlet + Lake Boca cams are
now the *stars* — boaters check the inlet before leaving), `Wrapped<T>` plumbing,
caching, API route, PWA shell, Netlify deploy.

**Removed** (beach-only): sargassum/seaweed (+ cam-vision job), beach busyness,
sand temperature, FL Healthy Beaches water quality, City lifeguard-flags scrape
(`cityOfficial`), rip-current Surf Zone parse, air quality meter, Surfline link.

**New for boating:**
- **NWS marine zone alerts** — the safety authority. Boca's offshore zone is
  **AMZ650** ("Coastal waters from Jupiter Inlet to Deerfield Beach FL out
  20 NM", verified against api.weather.gov 2026-06-11). Small Craft Advisory,
  Gale/Storm Warning, Special Marine Warning, marine Dense Fog Advisory.
- **Visibility** (Open-Meteo `visibility`) — fog is a boating hazard.
- **Lightning now feeds the score** as a hard cap (beach app only displayed it).
- **Inlet/tide judgment** — outgoing tide against an onshore east wind makes the
  Boca Inlet steep and nasty; the score knows this.
- **Knots display**, gust spread (squally vs steady), wave period/steepness.

## 3. The Boat Day score

One composite 0-100 **Boat Day** score (mirrors the single Beach Day score).
Sub-scores (weights sum to 1.00; null inputs drop out of the weighted average):

| Key | Label | Weight | Curve (plain English) |
|---|---|---|---|
| `wind` | Wind | 0.24 | ≤10 kn = 100 (calm/glass), fades to 0 at 25 kn. Gust spread >8 kn over sustained subtracts up to 20 (squally) |
| `seas` | Seas (wave height & period) | 0.22 | lerp through [0 ft→100, 2→90, 3→70, 4→45, 6→15, 8→0]; period ≥8 s adds +10 (gentle swell), ≤5 s subtracts 10 (short chop); clamp 0-100 |
| `storms` | Storms & rain | 0.18 | 0.7×dryness (100−precip prob) + 0.3×sunshine (100−cloud); thunder wording clamps ≤35, rain wording ≤55 |
| `visibility` | Visibility | 0.08 | lerp [0.5 mi→0, 1→25, 3→60, 6→90, 10→100] |
| `airTemp` | Air temperature | 0.08 | plateau 72-90 °F, falloff 20 |
| `comfort` | Comfort (mugginess) | 0.06 | dew-point curve, unchanged from beach app |
| `waterTemp` | Water temperature | 0.06 | plateau 76-86 °F, falloff 16 (sandbar swimming) |
| `tide` | Tide & inlet | 0.04 | rising/incoming = 100; falling = 60; falling **+ onshore E wind ≥10 kn = 25** ("ebb against wind — steep inlet chop"); unknown → null |
| `uv` | UV exposure | 0.04 | unchanged curve (no shade on a boat) |

**Hard safety caps** (`applyBoatCaps`, worst wins; every cap gets a plain-English
explanation string):

| Condition | Cap | Message |
|---|---|---|
| Gale/Storm/Hurricane-force Warning or tsunami (marine zone or point) | 5 | "Gale or storm warning — do not go out" |
| Hurricane/Tropical Storm/Storm Surge warning (land point) | 10 | "Severe weather warning in effect" |
| Special Marine Warning active | 15 | "Severe thunderstorm over the water" |
| Lightning strike within 10 mi in the GLM window | 15 | "Lightning within 10 miles" |
| Thunder in current conditions (WMO 95-99 or text) | 20 | "Thunderstorms in the forecast" |
| Small Craft Advisory active | 45 | "Small Craft Advisory in effect" |
| Lightning within 25 mi | 40 | "Lightning in the area" |
| Rain (WMO codes / unhedged text) | 40 | "Rain in the forecast" |
| Marine Dense Fog Advisory or visibility < 1 mi | 30 | "Dense fog — poor visibility on the water" |
| Wave height ≥ 6 ft | 35 | "Rough seas" |

Ratings: ≥80 Excellent · ≥65 Good · ≥45 Fair · else Poor (unchanged).
Verdict line: `boatDayVerdict(score)` in `lib/format.ts` (replaces
`beachDayVerdict`) — e.g. ≥80 "Yes — get out there", ≥65 "Pretty good day to
boat", ≥45 "Borderline — check the caps", <45 "Not today, captain".

Hourly scores: same `computeHourlyScores` pattern — hourly wind/sky/precip/
visibility drive each hour; waves/water/alerts stay day-constant; bounded
sunrise→sunset. "Best window today" chip carries over (rename
`bestBeachWindow` → `bestBoatWindow`).

## 4. Contracts (exact — every agent codes to these)

`ConditionsSnapshot` final shape (fields removed: `cityOfficial`, `waterQuality`,
`airQuality`, `sargassum`, `busyness`):

```ts
export interface ConditionsSnapshot {
  location: LocationPublic;
  generatedAt: string;
  tides: Wrapped<TideData>;
  buoy: Wrapped<BuoyData>;
  weather: Wrapped<WeatherData>;
  marine: Wrapped<MarineData>;
  nowcast: Wrapped<NowcastData>;
  nws: Wrapped<NwsData>;
  lightning: Wrapped<LightningData>;
  traffic: Wrapped<TrafficData>;
  forecast: Wrapped<ForecastDay[]>;
  sun: Wrapped<SunData>;
  hourly: Wrapped<HourlyMetrics[]>;
}
```

`NwsData` (rip current removed; marine zone alerts added):

```ts
export interface NwsData {
  /** Active NWS alerts for the land point (hurricane warnings etc.). */
  alerts: NwsAlert[];
  /** Active alerts for the offshore marine zone (SCA, gale, SMW, fog). */
  marineAlerts: NwsAlert[];
}
```

Field additions: `WeatherData.visibilityMi?: number`,
`SpotWeatherData.visibilityMi?: number`, `HourlyMetrics.visibilityMi?: number`.
`BuoyData`, `MarineData`, `TideData` (already has `trend`), `LightningData`,
`TrafficData`, `ForecastDay`, `SunData`, score types: **unchanged**.
`HourlyScore` and `BestWindow` unchanged. `ConditionsResponse` unchanged
(`snapshot`, `score`, `hourlyScores`, `cams`).

`Location` config: **remove** `healthyBeaches`, `cityConditionsUrl`, `surfZone`;
**add** `nwsMarineZoneId: string`. Boca entry keeps tide stations
(8722816/8722670), buoys (LKWF1/FWYF1), `nwsMarineZoneId: "AMZ650"`, and all
video-monitoring/bocasurfcam/lakebocacam cams (inlet + Lake Boca cams listed
first; Surfline link entry dropped).

`lib/util.ts` adds `export const mphToKnots = (mph: number): number => mph / 1.150779;`
and the default User-Agent string becomes
`"isitboatday (https://github.com/jayfrid-bot/isitboatday)"`.

Marine-alert classification (score-side regexes against `marineAlerts[].event`):
severe `/gale warning|storm warning|hurricane force|tsunami/i` · warning
`/special marine warning/i` · advisory `/small craft advisory/i` · fog
`/dense fog advisory/i`.

## 5. Agent fleet & file ownership (no overlaps)

| Agent | Owns (only these) | Mission |
|---|---|---|
| **A — sources** | `lib/sources/**` | Rework `nws.ts` (drop SRF rip parse; add `alerts/active?zone=` fetch + fixture tests); add `visibility` to weather/spotWeather/hourlyForecast adapters; delete sargassum/busyness/cityOfficial/waterQuality/airQuality sources + tests |
| **B — scoring** | `lib/score.ts`, `lib/score.test.ts`, `lib/format.ts` | Boat Day `Derived`/`deriveMetrics`/`scoreBoatDay`/`applyBoatCaps`/`computeHourlyScores`/`bestBoatWindow` + thorough scenario tests; `boatDayVerdict` |
| **C — core** | `lib/types.ts`, `config/locations.ts`, `lib/conditions.ts`, `lib/util.ts`, `lib/sandTemp.ts(.test)` deletion | Land the contract types, new Location config, rewire the parallel fetch, add `mphToKnots`, new UA |
| **D — UI/brand** | `components/**`, `app/**` (not `app/api/**`), `README.md`, `CLAUDE.md`, `package.json`, `capacitor.config.ts`, `netlify.toml`, `tailwind.config.ts`, `assets/icon.svg`, `.env.example`, `public/sw.js` | Rebrand to Is It Boat Day; remove beach cards/panels; add gusts/visibility/marine-advisory UI; knots display; boat logo; README with Netlify + Namecheap DNS steps |

Then sequentially: **Integrator** (full `npm test` + `lint` + `build`, fix
cross-agent drift, grep out leftover beach-isms) → **2 parallel reviewers**
(boating-domain correctness; code-quality/conventions) → **Fixer** (apply
confirmed findings, re-verify green).

## 6. Verification gates

1. `npm test` — all parsers + scoring scenarios green.
2. `npm run lint` + `npm run build` — clean.
3. Live boot: `/api/conditions/boca-raton` returns a real scored snapshot.
4. Orchestrator (Fable) eyeballs the rendered dashboard before pushing.

## 7. Roadmap (post-v1)

- **Sail mode** toggle (wind sweet spot 8-18 kn instead of "calm is best").
- Fishing mode (moon phase + tide movement get real weight).
- More towns: the config is one entry per town — Fort Lauderdale (Port
  Everglades), Jupiter, the Keys.
- NOAA CO-OPS **currents** stations for real inlet current speed.
- Boat-ramp cam vision (the old seaweed-job pattern, repointed at ramp queues).
- Icon/PWA raster regen from the new boat SVG (`scripts/gen-icons.mjs`).
