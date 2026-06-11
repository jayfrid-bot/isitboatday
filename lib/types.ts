// ---------------------------------------------------------------------------
// Shared domain types for Is It Boat Day.
// Every data source normalizes its payload into one of the *Data shapes below
// and wraps it in `Wrapped<T>` so the UI gets a uniform { data, status } envelope.
// ---------------------------------------------------------------------------

export type SourceStatus = "ok" | "stale" | "error" | "best-effort";

export interface SourceMeta {
  /** Human-readable provider, e.g. "NOAA NDBC (LKWF1)". */
  source: string;
  status: SourceStatus;
  /** ISO timestamp of when we fetched it. */
  fetchedAt: string;
  /** Short credit line shown in the UI. */
  attribution: string;
  note?: string;
}

export interface Wrapped<T> extends SourceMeta {
  data: T | null;
}

// --- Tides (NOAA CO-OPS) ---------------------------------------------------
export interface TideEvent {
  type: "high" | "low";
  time: string; // ISO
  heightFt: number;
}
export interface TideData {
  /** Upcoming high/low events, soonest first. */
  next: TideEvent[];
  /** Whether the tide is currently rising or falling (derived from next events). */
  trend?: "rising" | "falling";
}

// --- Buoy (NOAA NDBC realtime2) -------------------------------------------
export interface BuoyData {
  waterTempF?: number;
  airTempF?: number;
  /** Wind direction the wind is coming FROM, in degrees. */
  windDirDeg?: number;
  windSpeedMph?: number;
  windGustMph?: number;
  waveHeightFt?: number;
  dominantPeriodS?: number;
  observedAt?: string; // ISO
}

// --- Weather (NWS api.weather.gov) ----------------------------------------
export interface WeatherData {
  airTempF?: number;
  windDirDeg?: number;
  windDirCardinal?: string;
  windSpeedMph?: number;
  shortForecast?: string; // "Mostly Sunny"
  precipProbability?: number; // 0-100
  humidityPct?: number; // relative humidity, 0-100
  dewPointF?: number; // °F — the comfort/mugginess driver
  visibilityMi?: number; // statute miles — fog is a boating hazard
  isDaytime?: boolean;
  observedAt?: string; // ISO
}

// --- Marine (Open-Meteo) ---------------------------------------------------
export interface MarineData {
  waveHeightFt?: number;
  waveDirDeg?: number;
  wavePeriodS?: number;
  swellHeightFt?: number;
  swellPeriodS?: number;
  swellDirDeg?: number;
  seaSurfaceTempF?: number;
  uvIndex?: number;
  /** Cloud cover, 0-100% (0 = full sun, 100 = overcast). */
  cloudCoverPct?: number;
}

// --- 7-day outlook (Open-Meteo daily) -------------------------------------
export interface ForecastDay {
  date: string; // YYYY-MM-DD (local to the town)
  dow: string; // "Mon"
  hi?: number; // °F
  lo?: number; // °F
  rain?: number; // precip probability %, 0-100
  windMaxMph?: number;
  weatherCode?: number; // WMO code
  emoji: string; // sky emoji derived from the code
  sky?: string; // short label derived from the code
}

// --- Hourly outlook (Open-Meteo hourly) -----------------------------------
/** Raw per-hour metrics; `time` is an absolute UTC ISO string. */
export interface HourlyMetrics {
  time: string; // ISO (UTC)
  airTempF?: number;
  cloudCoverPct?: number;
  precipProbability?: number; // 0-100
  weatherCode?: number; // WMO code
  windSpeedMph?: number;
  windDirDeg?: number;
  uvIndex?: number;
  humidityPct?: number; // relative humidity, 0-100
  dewPointF?: number; // °F — the comfort/mugginess driver
  visibilityMi?: number; // statute miles — fog is a boating hazard
  /** Precipitation that hour (inches). */
  precipIn?: number;
  shortForecast?: string; // derived from the WMO code
  emoji?: string; // sky emoji derived from the code
}

/** One scored daylight hour for the hourly score graph. */
export interface HourlyScore {
  time: string; // ISO (UTC)
  score: number; // 0-100 after caps
  rating: string; // "Excellent" | "Good" | "Fair" | "Poor"
  emoji: string;
  raining: boolean;
  windSpeedMph?: number;
  /** Direction the wind blows FROM, in degrees. */
  windDirDeg?: number;
}

// --- Rain nowcast (Open-Meteo minutely_15 precipitation) -------------------
export type NowcastState = "dry" | "raining";
export interface NowcastData {
  state: NowcastState;
  /** Minutes until rain starts (when dry) or stops (when raining); undefined if no change in the window. */
  changeInMin?: number;
  /** Plain-English summary, e.g. "Dry — rain likely in ~25 min". */
  text: string;
}

/** The best contiguous stretch of today's daylight hours by Boat Day score. */
export interface BestWindow {
  startIso: string;
  endIso: string;
  score: number;
}

// --- Sun times (computed locally from lat/lon/date) ------------------------
export interface SunData {
  /** Calendar day these events fall on, local to the town (YYYY-MM-DD). */
  date: string;
  /** First light / civil dawn (sun 6° below horizon), ISO. */
  daybreak?: string;
  /** Sunrise (upper limb at the horizon, ISO). */
  sunrise?: string;
  /** Solar noon — the sun at its highest and strongest, ISO. */
  solarNoon?: string;
  /** Sunset (upper limb at the horizon, ISO). */
  sunset?: string;
  /** Dusk / civil twilight end (sun 6° below horizon, evening), ISO. */
  dusk?: string;
  /** Sun's maximum altitude above the horizon at solar noon (degrees). */
  maxAltitudeDeg?: number;
  /** Tonight's moon phase (computed from the date). */
  moonPhase?: {
    phase: string;
    emoji: string;
    illumination: number;
    /** Position in the ~29.5-day synodic cycle: 0 = new, 0.5 = full, →1 = next new. */
    fraction: number;
  };
}

// --- Lightning (NOAA GOES-19 GLM, via an off-Netlify job) ------------------
export interface LightningData {
  /** Minutes of GLM data the upstream job scanned. */
  windowMinutes: number;
  /** Closest strike in the window (miles) + how long ago (minutes). */
  nearestMi?: number;
  nearestMinutesAgo?: number;
  /** Compass bearing FROM the inlet TO the closest strike (deg, 0=N, 90=E). */
  nearestBearingDeg?: number;
  /** Most recent strike in the window (may differ from the closest). */
  lastMinutesAgo?: number;
  lastMi?: number;
  /** Strike counts within radius bands over the window. */
  within10mi: number;
  within25mi: number;
  within50mi: number;
  /** Total strikes the job saw in its scanned area + window. */
  totalInArea: number;
  /** Age of the upstream GLM snapshot, in minutes (its end-to-end latency). */
  dataAgeMinutes?: number;
}

// --- NWS alerts (api.weather.gov) ------------------------------------------
export interface NwsAlert {
  event: string; // "Small Craft Advisory"
  severity: string; // "Moderate" | "Severe" | ...
  headline?: string;
  ends?: string; // ISO
}
export interface NwsData {
  /** Active NWS alerts for the land point (hurricane warnings etc.). */
  alerts: NwsAlert[];
  /** Active alerts for the offshore marine zone (SCA, gale, SMW, fog). */
  marineAlerts: NwsAlert[];
}

// --- Per-spot weather (Open-Meteo current) --------------------------------
export interface SpotWeatherData {
  airTempF?: number;
  apparentTempF?: number;
  windSpeedMph?: number;
  windGustMph?: number;
  windDirDeg?: number;
  windDirCardinal?: string;
  humidity?: number; // %
  dewPointF?: number; // °F
  visibilityMi?: number; // statute miles — fog is a boating hazard
  weatherCode?: number; // WMO code
  shortForecast?: string; // human-readable, derived from the WMO code
  observedAt?: string; // ISO
}

// --- Traffic (ramp & marina congestion near the inlet, HERE Traffic v7 flow) ---
export type TrafficLevel = "light" | "moderate" | "heavy" | "severe" | "unknown";
export interface TrafficData {
  /** Congestion band derived from HERE jamFactor. */
  level: TrafficLevel;
  /** 0-100 congestion index (jamFactor × 10); undefined when unknown. */
  congestion?: number;
  /** Number of usable road segments that fed the aggregate. */
  segments: number;
}

// --- On-the-water boat traffic (Inlet & Lake Boca cams + AI vision) --------
// How crowded the WATER itself is (boats), distinct from the road-congestion
// `traffic` field above. A scheduled cam-vision job counts boats on the webcams
// and publishes a feed; when no fresh observation exists we fall back to a
// deterministic typical-traffic calendar model. Emptier water = better boat day.
export type BoatTrafficLevel = "quiet" | "light" | "moderate" | "busy" | "packed" | "unknown";

export interface BoatTrafficByHour {
  hour: number;
  level: BoatTrafficLevel;
  boats?: number;
  samples: number;
}

export interface BoatTrafficData {
  level: BoatTrafficLevel;
  boats?: number;
  underway?: number;
  anchored?: number;
  source: "cams" | "typical";
  note?: string;
  capturedAtLocal?: string;
  byHour?: BoatTrafficByHour[];
}

// --- Snapshot --------------------------------------------------------------
export interface ConditionsSnapshot {
  location: LocationPublic;
  generatedAt: string; // ISO
  tides: Wrapped<TideData>;
  buoy: Wrapped<BuoyData>;
  weather: Wrapped<WeatherData>;
  marine: Wrapped<MarineData>;
  nowcast: Wrapped<NowcastData>;
  nws: Wrapped<NwsData>;
  lightning: Wrapped<LightningData>;
  traffic: Wrapped<TrafficData>;
  /** On-the-water boat traffic — how crowded the water is (distinct from road `traffic`). */
  boatTraffic: Wrapped<BoatTrafficData>;
  forecast: Wrapped<ForecastDay[]>;
  sun: Wrapped<SunData>;
  hourly: Wrapped<HourlyMetrics[]>;
}

// --- Scores ----------------------------------------------------------------
export interface SubScore {
  key: string;
  label: string;
  /** 0-100 sub-score, or null when the input was unavailable. */
  score: number | null;
  weight: number; // 0-1
  /** Human-readable value that produced this sub-score. */
  display?: string;
}
export interface ScoreResult {
  /** Final 0-100 score after safety caps. */
  score: number;
  /** Score before safety caps were applied. */
  rawScore: number;
  rating: string; // "Excellent" | "Good" | "Fair" | "Poor"
  subScores: SubScore[];
  /** Explanations for any safety cap that lowered the score. */
  caps: string[];
}

/** A cam plus the live weather/wind at its location (Open-Meteo, per spot). */
export interface CamView {
  /** Stable id (only set for cams with a proxied snapshot). */
  id?: string;
  name: string;
  provider: string;
  embedType: "iframe" | "image" | "link";
  url: string;
  /** Local proxy path for the live still (image cams only), e.g. /api/cam/boca-surf. */
  imageUrl?: string;
  /** Capture time of the displayed still (ISO), when the source publishes one. */
  capturedAt?: string;
  attribution?: string;
  weather: Wrapped<SpotWeatherData>;
}

export interface ConditionsResponse {
  snapshot: ConditionsSnapshot;
  /** Single composite Boat Day score (0-100) with breakdown + safety caps. */
  score: ScoreResult;
  /** Boat Day score forecast across today's daylight hours (empty if unavailable). */
  hourlyScores: HourlyScore[];
  cams: CamView[];
}

// --- Location config -------------------------------------------------------
export interface CamConfig {
  /**
   * Stable id, required when `snapshotUrl` or `snapshotFeed` is set: it keys the
   * /api/cam/[id] proxy allowlist so only configured upstreams can be fetched (no SSRF).
   */
  id?: string;
  name: string;
  provider: string;
  /** How to render: inline iframe, an auto-refreshing still image, or a link out. */
  embedType: "iframe" | "image" | "link";
  /** Human-facing page (used for the link/click-through). */
  url: string;
  /**
   * Upstream live still-image URL, proxied server-side via /api/cam/[id] (so an
   * http-only or hotlink-sensitive source is served same-origin over https).
   * Only used when embedType is "image".
   */
  snapshotUrl?: string;
  /**
   * Live still resolved from a video-monitoring.com "latest.json" feed: we read
   * the most-recent frame path for `view` and proxy it via /api/cam/[id]. Use this
   * (instead of snapshotUrl) when the freshest frame lives at a rotating path.
   */
  snapshotFeed?: {
    /** Cam base directory, e.g. http://video-monitoring.com/beachcams/bocainlet */
    base: string;
    /** View key within latest.json, e.g. "s4". */
    view: string;
    /** Frame resolution to serve (default "mr" ≈ 1920px; "hr" is the full original). */
    res?: "mr" | "hr";
  };
  attribution?: string;
  /** Cam's own coordinates for per-spot weather; falls back to the town's lat/lon. */
  lat?: number;
  lon?: number;
}

export interface Location {
  slug: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  timezone: string; // IANA, e.g. "America/New_York"
  noaaTideStationId: string;
  noaaTideStationFallbackId?: string;
  ndbcBuoyId: string;
  ndbcBuoyFallbackId?: string;
  /**
   * NWS coastal marine forecast zone id (e.g. "AMZ650"). A marine zone is the
   * offshore equivalent of a county: the NWS issues boater warnings — Small
   * Craft Advisory, Gale Warning, Special Marine Warning, Dense Fog Advisory —
   * per zone rather than per point. We poll this zone's active alerts to drive
   * the Boat Day safety caps and the marine-advisory banner.
   */
  nwsMarineZoneId: string;
  /** Optional override for the HERE traffic sampling radius (km). Defaults to ~2 km. */
  trafficRadiusKm?: number;
  cams: CamConfig[];
}

export type LocationPublic = Pick<
  Location,
  "slug" | "name" | "region" | "lat" | "lon" | "timezone"
>;
