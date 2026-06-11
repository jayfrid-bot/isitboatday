import type {
  BestWindow,
  BoatTrafficLevel,
  ConditionsSnapshot,
  HourlyScore,
  ScoreResult,
  SubScore,
} from "@/lib/types";
import { predictTraffic } from "@/lib/sources/boatTraffic";
import { clamp, degToCardinal, dewPointFromTempRH, mphToKnots, plateau, round } from "@/lib/util";

// Consolidated, best-available values pulled across all sources. Wind/seas/storms
// are the make-or-break boating signals; the rest refine the day's quality.
export interface Derived {
  airTempF?: number;
  waterTempF?: number;
  windSpeedMph?: number;
  windGustMph?: number;
  windDirDeg?: number;
  waveHeightFt?: number; // combined sea state
  wavePeriodS?: number; // dominant/peak wave period — long swell rides gentler than short chop
  precipProbability?: number;
  shortForecast?: string;
  weatherCode?: number; // WMO code (hourly path); drives the rain/thunder cap
  uvIndex?: number;
  cloudCoverPct?: number; // 0 = full sun, 100 = overcast
  humidityPct?: number; // relative humidity, 0-100
  dewPointF?: number; // °F — the comfort/mugginess driver
  visibilityMi?: number; // horizontal visibility (miles) — fog is a navigation hazard
  tideTrend?: "rising" | "falling"; // incoming vs outgoing — drives the inlet sub-score
  boatTrafficLevel?: BoatTrafficLevel; // how crowded the water is — emptier scores higher
  boatTrafficDisplay?: string; // e.g. "busy · ~14 boats (cams)" or "moderate (typical)"
  // --- safety flags (drive the hard caps) ---
  /** Small Craft Advisory active in the offshore marine zone. */
  smallCraftAdvisory: boolean;
  /** Special Marine Warning (severe thunderstorm/waterspout over the water). */
  specialMarineWarning: boolean;
  /** Gale/Storm/Hurricane-force Warning or tsunami in the marine zone. */
  severeMarineWarning: boolean;
  /** Marine Dense Fog Advisory active. */
  denseFogAdvisory: boolean;
  /** A severe NWS warning on the LAND point (hurricane/tropical storm/storm surge/tsunami). */
  severeAlert: boolean;
  /** GLM lightning strike counts within radius bands (0 when none/unknown). */
  lightningWithin10mi: number;
  lightningWithin25mi: number;
}

// --- marine-alert classification (tested against marineAlerts[].event) ------
// A gale/storm/hurricane-force warning, a Hazardous Seas Warning (waves/steepness
// past warning criteria), or a tsunami means the water is no place for a small
// boat — the harshest marine cap.
const SEVERE_MARINE = /gale warning|storm warning|hurricane force|hazardous seas warning|tsunami/i;
// A Special Marine Warning is a short-fuse severe thunderstorm/waterspout over the water.
const SPECIAL_MARINE_WARNING = /special marine warning/i;
// A Small Craft Advisory: conditions hazardous to small boats (wind/seas).
const SMALL_CRAFT_ADVISORY = /small craft advisory/i;
// A marine Dense Fog Advisory: visibility low enough to be a navigation hazard.
const DENSE_FOG = /dense fog advisory/i;

/**
 * A severe NWS warning on the LAND point that closes the day. (Gale/storm live in
 * the marine severities above; high surf is not a land-stopper for boating, so it's
 * dropped from this list versus the beach app.)
 */
const SEVERE_ALERT = /hurricane warning|tropical storm warning|storm surge warning|tsunami/i;

export function deriveMetrics(s: ConditionsSnapshot): Derived {
  const w = s.weather.data;
  const b = s.buoy.data;
  const m = s.marine.data;
  const n = s.nws.data;
  const marineAlerts = n?.marineAlerts ?? [];
  const anyMarine = (re: RegExp) => marineAlerts.some((a) => re.test(a.event));
  // Dew point drives the comfort score; fall back to computing it from temp + RH.
  const dpFallback =
    w?.airTempF != null && w?.humidityPct != null
      ? dewPointFromTempRH(w.airTempF, w.humidityPct)
      : undefined;
  return {
    airTempF: w?.airTempF ?? b?.airTempF,
    waterTempF: b?.waterTempF ?? m?.seaSurfaceTempF,
    windSpeedMph: w?.windSpeedMph ?? b?.windSpeedMph,
    windGustMph: b?.windGustMph,
    windDirDeg: w?.windDirDeg ?? b?.windDirDeg,
    waveHeightFt: b?.waveHeightFt ?? m?.waveHeightFt,
    wavePeriodS: b?.dominantPeriodS ?? m?.wavePeriodS,
    precipProbability: w?.precipProbability,
    shortForecast: w?.shortForecast,
    uvIndex: m?.uvIndex,
    cloudCoverPct: m?.cloudCoverPct,
    humidityPct: w?.humidityPct,
    dewPointF: w?.dewPointF ?? (dpFallback != null ? round(dpFallback) : undefined),
    // Visibility comes from the current weather when present, else the hourly
    // entry closest to now (the snapshot can carry hourly visibility but no
    // current-conditions field).
    visibilityMi: w?.visibilityMi ?? hourlyVisibilityNow(s),
    tideTrend: s.tides.data?.trend,
    boatTrafficLevel: s.boatTraffic.data?.level,
    boatTrafficDisplay: boatTrafficDisplay(s),
    smallCraftAdvisory: anyMarine(SMALL_CRAFT_ADVISORY),
    specialMarineWarning: anyMarine(SPECIAL_MARINE_WARNING),
    severeMarineWarning: anyMarine(SEVERE_MARINE),
    denseFogAdvisory: anyMarine(DENSE_FOG),
    severeAlert: (n?.alerts ?? []).some((a) => SEVERE_ALERT.test(a.event)),
    lightningWithin10mi: s.lightning.data?.within10mi ?? 0,
    lightningWithin25mi: s.lightning.data?.within25mi ?? 0,
  };
}

/** Visibility from the hourly entry whose timestamp is closest to now. */
function hourlyVisibilityNow(s: ConditionsSnapshot): number | undefined {
  const hours = s.hourly.data;
  if (!hours?.length) return undefined;
  const now = Date.now();
  let best: number | undefined;
  let bestDelta = Infinity;
  for (const h of hours) {
    if (h.visibilityMi == null) continue;
    const delta = Math.abs(new Date(h.time).getTime() - now);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = h.visibilityMi;
    }
  }
  return best;
}

/**
 * The longest contiguous run of today's scored daylight hours that stays within
 * 8 points of the day's peak — i.e. "the best stretch to go". `endIso` is the
 * end of the last hour in the run. Null when there are no hours.
 */
export function bestBoatWindow(hours: HourlyScore[]): BestWindow | null {
  if (!hours.length) return null;
  const max = Math.max(...hours.map((h) => h.score));
  const threshold = max - 8;
  let bestStart = -1;
  let bestLen = 0;
  let bestPeak = 0;
  let curStart = -1;
  let curLen = 0;
  let curPeak = 0;
  for (let i = 0; i < hours.length; i++) {
    if (hours[i].score >= threshold) {
      if (curLen === 0) curStart = i;
      curLen += 1;
      curPeak = Math.max(curPeak, hours[i].score);
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
        bestPeak = curPeak;
      }
    } else {
      curLen = 0;
      curPeak = 0;
    }
  }
  if (bestStart < 0) return null;
  const last = hours[bestStart + bestLen - 1];
  return {
    startIso: hours[bestStart].time,
    endIso: new Date(new Date(last.time).getTime() + 3600000).toISOString(),
    score: Math.round(bestPeak),
  };
}

// --- individual curves -----------------------------------------------------

/** Piecewise-linear interpolation through sorted (x,y) anchors, clamped to the ends. */
function lerpCurve(x: number, anchors: [number, number][]): number {
  if (x <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i];
    if (x <= x1) {
      const [x0, y0] = anchors[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return last[1];
}

/**
 * Wind sub-score (in KNOTS — boaters speak knots). Unlike the beach curve, dead
 * calm is *perfect* for boating (glass water), so 0-10 kn is full marks, fading
 * to 0 by 25 kn. A wide gust spread (squally) is worse than steady wind at the
 * same average, so a spread of more than 8 kn over the sustained speed subtracts
 * up to 20 points.
 */
function windScore(d: Derived): number | null {
  if (d.windSpeedMph == null) return null;
  const kn = mphToKnots(d.windSpeedMph);
  let s = plateau(kn, 0, 10, 15); // 0-10 kn = 100, linear to 0 at 25 kn
  if (d.windGustMph != null) {
    const gustKn = mphToKnots(d.windGustMph);
    const spread = gustKn - kn;
    if (spread > 8) s -= Math.min(20, (spread - 8) * 4);
  }
  return clamp(s, 0, 100);
}

/** "8 kn ENE · gusts 14" — sustained + direction, with gusts when known. */
function windDisplay(d: Derived): string | undefined {
  if (d.windSpeedMph == null) return undefined;
  const kn = Math.round(mphToKnots(d.windSpeedMph));
  let s = `${kn} kn`;
  if (d.windDirDeg != null) s += ` ${degToCardinal(d.windDirDeg)}`;
  if (d.windGustMph != null) s += ` · gusts ${Math.round(mphToKnots(d.windGustMph))}`;
  return s;
}

/**
 * Seas sub-score: flat water is best; steepness matters as much as height. Long-
 * period swell (>= 8 s) rolls gently underfoot (+10), while short-period chop
 * (<= 5 s) at any real height is the slamming, spray-in-the-face ride that beats
 * a small boat up (-10).
 */
const SEAS_CURVE: [number, number][] = [
  [0, 100],
  [2, 90],
  [3, 70],
  [4, 45],
  [6, 15],
  [8, 0],
];
function seasScore(d: Derived): number | null {
  if (d.waveHeightFt == null) return null;
  let s = lerpCurve(d.waveHeightFt, SEAS_CURVE);
  if (d.wavePeriodS != null) {
    if (d.wavePeriodS >= 8) s += 10;
    else if (d.wavePeriodS <= 5 && d.waveHeightFt >= 2) s -= 10;
  }
  return clamp(s, 0, 100);
}

/** "2.3 ft @ 9 s" — height with period when known. */
function seasDisplay(d: Derived): string | undefined {
  if (d.waveHeightFt == null) return undefined;
  return d.wavePeriodS != null
    ? `${d.waveHeightFt} ft @ ${Math.round(d.wavePeriodS)} s`
    : `${d.waveHeightFt} ft`;
}

/**
 * Storms & rain sub-score blends "dryness" (from precip probability) with
 * "sunshine" (from cloud cover): no rain + full sun → ~100; rainy/overcast → low.
 * Dryness is weighted higher (rain is the bigger boating spoiler). Active
 * storm/rain wording in the forecast text clamps it as a floor. (Confirmed
 * thunder/rain ALSO hard-cap the whole composite — see applyBoatCaps.)
 */
function stormsScore(d: Derived): number | null {
  const dry =
    typeof d.precipProbability === "number"
      ? clamp(100 - d.precipProbability, 0, 100)
      : null;
  const sunshine =
    d.cloudCoverPct != null ? clamp(100 - d.cloudCoverPct, 0, 100) : null;

  let base: number | null;
  if (dry != null && sunshine != null) base = 0.7 * dry + 0.3 * sunshine;
  else base = dry ?? sunshine;

  const f = d.shortForecast?.toLowerCase() ?? "";
  if (base == null) {
    if (!f) return null; // no numeric or text signal at all
    base = 75; // neutral default when only text is available
  }
  // Hedged wording ("chance/slight/possible/isolated") feeds the probability but
  // does not clamp — a mere chance of a storm shouldn't floor a sunny, calm day.
  if (!/chance|slight|possible|isolated/.test(f)) {
    if (/thunder|storm/.test(f)) base = Math.min(base, 35);
    else if (/rain|shower/.test(f)) base = Math.min(base, 55);
  }
  return clamp(base, 0, 100);
}

/** Human-readable summary of the storms/sky inputs for the score breakdown. */
function stormsDisplay(d: Derived): string | undefined {
  const parts: string[] = [];
  if (d.shortForecast) parts.push(d.shortForecast);
  if (d.cloudCoverPct != null) parts.push(`${d.cloudCoverPct}% cloud`);
  return parts.length ? parts.join(" · ") : undefined;
}

/**
 * Visibility sub-score: fog is a navigation hazard. Under half a mile is a
 * whiteout (0); 10+ miles is crystal clear (100). (Visibility under 1 mi or a
 * Dense Fog Advisory ALSO hard-caps the composite — see applyBoatCaps.)
 */
const VISIBILITY_CURVE: [number, number][] = [
  [0.5, 0],
  [1, 25],
  [3, 60],
  [6, 90],
  [10, 100],
];
function visibilityScore(mi: number | undefined): number | null {
  return mi == null ? null : lerpCurve(mi, VISIBILITY_CURVE);
}

/** UV exposure: there's no shade on a boat, so a high index drags the day. */
const uvScore = (uv: number) => clamp(100 - Math.max(0, uv - 8) * 12, 0, 100);

/**
 * Comfort (mugginess) from dew point — the real "how heavy does the air feel"
 * signal (sweat can't evaporate as the dew point climbs). <=60°F feels great;
 * each °F above subtracts ~5 (≈68°F→60, 72°F→40, ≥80°F→0). Very high relative
 * humidity (>85%) adds a small extra penalty. Null when no dew point is known.
 */
function comfortScore(d: Derived): number | null {
  if (d.dewPointF == null) return null;
  let s = clamp(100 - Math.max(0, d.dewPointF - 60) * 5, 0, 100);
  if (d.humidityPct != null && d.humidityPct > 85) {
    s = clamp(s - (d.humidityPct - 85) * 1.5, 0, 100);
  }
  return s;
}

function comfortDisplay(d: Derived): string | undefined {
  if (d.dewPointF == null) return undefined;
  const parts = [`${d.dewPointF}°F dew pt`];
  if (d.humidityPct != null) parts.push(`${d.humidityPct}% RH`);
  return parts.join(" · ");
}

/** East quadrant (45-135°): an onshore wind that stacks against an outgoing tide. */
const isEastWind = (deg: number) => deg >= 45 && deg <= 135;

/**
 * Tide & inlet sub-score. An incoming (rising) tide is the friendly window —
 * deeper water over the sandbars, current carrying you in. An outgoing (falling)
 * tide is merely so-so (60). But a falling tide running OUT against an onshore
 * east wind stands the inlet up into a steep, dangerous chop — the classic
 * "ebb against wind" — so that combination drops to 25. Unknown trend → null.
 */
function tideScore(d: Derived): { score: number | null; display?: string } {
  if (d.tideTrend === "rising") return { score: 100, display: "rising — incoming" };
  if (d.tideTrend === "falling") {
    const kn = d.windSpeedMph != null ? mphToKnots(d.windSpeedMph) : null;
    if (d.windDirDeg != null && isEastWind(d.windDirDeg) && kn != null && kn >= 10) {
      return { score: 25, display: "ebb against east wind — steep inlet chop" };
    }
    return { score: 60, display: "falling — outgoing" };
  }
  return { score: null };
}

/**
 * On-the-water traffic sub-score: emptier water is a better boat day (mirrors how
 * beach crowds are scored). quiet 100 / light 90 / moderate 70 / busy 45 /
 * packed 25; unknown drops out of the average (null).
 */
const BOAT_TRAFFIC_SCORES: Record<BoatTrafficLevel, number | null> = {
  quiet: 100,
  light: 90,
  moderate: 70,
  busy: 45,
  packed: 25,
  unknown: null,
};
function boatTrafficScore(level: BoatTrafficLevel | undefined): number | null {
  if (level == null) return null;
  return BOAT_TRAFFIC_SCORES[level];
}

/** "busy · ~14 boats (cams)" or "moderate (typical)" — from the snapshot's boat-traffic read. */
function boatTrafficDisplay(s: ConditionsSnapshot): string | undefined {
  const bt = s.boatTraffic.data;
  if (!bt) return undefined;
  let out: string = bt.level;
  if (typeof bt.boats === "number") out += ` · ~${bt.boats} boats`;
  out += bt.source === "cams" ? " (cams)" : " (typical)";
  return out;
}

// --- combination + caps ----------------------------------------------------
function combine(subs: SubScore[]): number {
  const avail = subs.filter((s) => s.score != null);
  const totalW = avail.reduce((a, s) => a + s.weight, 0);
  if (totalW === 0) return 0;
  const sum = avail.reduce((a, s) => a + (s.score as number) * s.weight, 0);
  return Math.round(sum / totalW);
}

function ratingFor(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 45) return "Fair";
  return "Poor";
}

function f1(n: number | undefined, unit: string): string | undefined {
  return n == null ? undefined : `${n}${unit}`;
}

function sub(
  key: string,
  label: string,
  score: number | null,
  weight: number,
  display?: string,
): SubScore {
  return { key, label, score: score == null ? null : Math.round(score), weight, display };
}

export function scoreBoatDay(d: Derived): ScoreResult {
  const tide = tideScore(d);
  const subs: SubScore[] = [
    sub("wind", "Wind", windScore(d), 0.24, windDisplay(d)),
    sub("seas", "Seas (height & period)", seasScore(d), 0.22, seasDisplay(d)),
    sub("storms", "Storms & rain", stormsScore(d), 0.17, stormsDisplay(d)),
    sub("visibility", "Visibility", visibilityScore(d.visibilityMi), 0.07, f1(d.visibilityMi, " mi")),
    sub(
      "airTemp",
      "Air temperature",
      d.airTempF != null ? plateau(d.airTempF, 72, 90, 20) : null,
      0.07,
      f1(d.airTempF, "°F"),
    ),
    sub("comfort", "Comfort (mugginess)", comfortScore(d), 0.06, comfortDisplay(d)),
    sub(
      "waterTemp",
      "Water temperature",
      d.waterTempF != null ? plateau(d.waterTempF, 76, 86, 16) : null,
      0.06,
      f1(d.waterTempF, "°F"),
    ),
    sub("tide", "Tide & inlet", tide.score, 0.04, tide.display),
    sub(
      "boatTraffic",
      "On-the-water traffic",
      boatTrafficScore(d.boatTrafficLevel),
      0.04,
      d.boatTrafficDisplay,
    ),
    sub(
      "uv",
      "UV index",
      d.uvIndex != null ? uvScore(d.uvIndex) : null,
      0.03,
      d.uvIndex != null ? `${d.uvIndex}` : undefined,
    ),
  ];

  const rawScore = combine(subs);
  const { score, caps } = applyBoatCaps(rawScore, d);
  return { score, rawScore, rating: ratingFor(score), subScores: subs, caps };
}

export type RainSeverity = "none" | "rain" | "thunder";

/**
 * Whether it's actively raining/stormy. WMO weather codes are authoritative when
 * present (the hourly-forecast path); otherwise we read the forecast text but
 * ignore hedged "chance/slight/possible" wording, so a mere *chance* of rain does
 * not trip the cap (it still feeds stormsScore via precip probability).
 */
export function rainSeverity(d: Derived): RainSeverity {
  const c = d.weatherCode;
  if (c != null) {
    if (c >= 95 && c <= 99) return "thunder";
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return "rain";
    return "none"; // includes snow 71-86 — not relevant in S. FL, not a "rain" cap
  }
  const f = d.shortForecast?.toLowerCase() ?? "";
  if (/chance|slight|possible|isolated/.test(f)) return "none";
  if (/thunder|storm/.test(f)) return "thunder";
  if (/rain|shower|drizzle/.test(f)) return "rain";
  return "none";
}

/**
 * Hard safety caps — worst wins. Every cap pushes a plain-English string so the
 * UI can explain *why* a day is rated low. The NWS marine zone is the boating
 * safety authority — its warnings override the computed score.
 */
function applyBoatCaps(
  raw: number,
  d: Derived,
): { score: number; caps: string[] } {
  let score = raw;
  const caps: string[] = [];
  // A gale/storm/hurricane-force warning means a small boat has no business out.
  if (d.severeMarineWarning) {
    score = Math.min(score, 5);
    caps.push("Gale or storm warning — do not go out");
  }
  // A severe LAND warning (hurricane/tropical storm/storm surge/tsunami) closes the day.
  if (d.severeAlert) {
    score = Math.min(score, 10);
    caps.push("Severe weather warning in effect");
  }
  // A Special Marine Warning is a short-fuse severe thunderstorm/waterspout overhead.
  if (d.specialMarineWarning) {
    score = Math.min(score, 15);
    caps.push("Severe thunderstorm over the water");
  }
  // Lightning close enough to be an immediate strike risk — never leave the dock.
  if (d.lightningWithin10mi > 0) {
    score = Math.min(score, 15);
    caps.push("Lightning within 10 miles");
  }
  // Thunder is life-threatening on open water (no shelter); it's a hard ceiling
  // beyond just the storms sub-score.
  const rain = rainSeverity(d);
  if (rain === "thunder") {
    score = Math.min(score, 20);
    caps.push("Thunderstorms in the forecast");
  }
  // Fog (advisory or measured visibility under a mile) is a navigation hazard.
  if (d.denseFogAdvisory || (d.visibilityMi != null && d.visibilityMi < 1)) {
    score = Math.min(score, 30);
    caps.push("Dense fog — poor visibility on the water");
  }
  // Big seas can swamp or pound a small boat.
  if (d.waveHeightFt != null && d.waveHeightFt >= 6) {
    score = Math.min(score, 35);
    caps.push("Rough seas");
  }
  // Lightning in the wider area — storms can build and close in fast.
  if (d.lightningWithin25mi > 0) {
    score = Math.min(score, 40);
    caps.push("Lightning in the area");
  }
  // Steady rain: miserable and reduces visibility, even without thunder.
  if (rain === "rain") {
    score = Math.min(score, 40);
    caps.push("Rain in the forecast");
  }
  // A Small Craft Advisory: the marine authority says conditions are hazardous to
  // small boats. Not a closure (bigger boats may still go), so it caps rather than
  // bottoms out — but it stays surfaced regardless.
  if (d.smallCraftAdvisory) {
    score = Math.min(score, 45);
    caps.push("Small Craft Advisory in effect");
  }
  return { score, caps };
}

export function computeScore(s: ConditionsSnapshot): ScoreResult {
  return scoreBoatDay(deriveMetrics(s));
}

const HOUR_MS = 3_600_000;

/**
 * Forecast the Boat Day score across today's daylight hours. Reuses the pure
 * `scoreBoatDay` by combining each forecast hour's weather (air/wind/sky/precip/
 * visibility) with the day-constant marine inputs from the current snapshot
 * (seas, water temp, tide trend, marine alerts, lightning). Bounded to the hours
 * between sunrise and sunset. Returns [] when hourly data is unavailable.
 */
export function computeHourlyScores(s: ConditionsSnapshot): HourlyScore[] {
  const hours = s.hourly.data;
  if (!hours?.length) return [];

  // Day-constant inputs (seas, water temp, tide, alerts, lightning) reuse the snapshot.
  const base = deriveMetrics(s);
  const tz = s.location.timezone;
  // Typical boat traffic learned by local hour from the feed's history (when present).
  const byHour = s.boatTraffic.data?.byHour;
  const byHourMap = new Map(byHour?.map((b) => [b.hour, b]) ?? []);
  const sun = s.sun.data;
  const sunrise = sun?.sunrise ? new Date(sun.sunrise).getTime() : null;
  const sunset = sun?.sunset ? new Date(sun.sunset).getTime() : null;

  return hours
    .filter((h) => {
      if (sunrise == null || sunset == null) return true; // no bounds -> keep all
      const t = new Date(h.time).getTime();
      // Include the hour bucket that contains sunrise, through the last hour <= sunset.
      return t + HOUR_MS > sunrise && t <= sunset;
    })
    .map((h) => {
      // Per-hour boat traffic: the learned by-hour level for this local hour when
      // available, else the deterministic typical-traffic prediction for that hour.
      const localHour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "2-digit",
          hour12: false,
        }).format(new Date(h.time)),
      ) % 24;
      const learned = byHourMap.get(localHour);
      const hourTraffic: BoatTrafficLevel = learned
        ? learned.level
        : predictTraffic(new Date(h.time), tz).level;
      const d: Derived = {
        airTempF: h.airTempF,
        waterTempF: base.waterTempF,
        windSpeedMph: h.windSpeedMph,
        windGustMph: base.windGustMph,
        windDirDeg: h.windDirDeg,
        waveHeightFt: base.waveHeightFt,
        wavePeriodS: base.wavePeriodS,
        precipProbability: h.precipProbability,
        shortForecast: h.shortForecast,
        weatherCode: h.weatherCode,
        uvIndex: h.uvIndex,
        cloudCoverPct: h.cloudCoverPct,
        humidityPct: h.humidityPct,
        dewPointF: h.dewPointF,
        visibilityMi: h.visibilityMi,
        tideTrend: base.tideTrend,
        boatTrafficLevel: hourTraffic,
        boatTrafficDisplay: base.boatTrafficDisplay,
        smallCraftAdvisory: base.smallCraftAdvisory,
        specialMarineWarning: base.specialMarineWarning,
        severeMarineWarning: base.severeMarineWarning,
        denseFogAdvisory: base.denseFogAdvisory,
        severeAlert: base.severeAlert,
        lightningWithin10mi: base.lightningWithin10mi,
        lightningWithin25mi: base.lightningWithin25mi,
      };
      const r = scoreBoatDay(d);
      return {
        time: h.time,
        score: r.score,
        rating: r.rating,
        emoji: h.emoji ?? "",
        raining: rainSeverity(d) !== "none",
        windSpeedMph: h.windSpeedMph,
        windDirDeg: h.windDirDeg,
      };
    });
}
