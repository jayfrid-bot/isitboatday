import type {
  BoatTrafficByHour,
  BoatTrafficData,
  BoatTrafficLevel,
  Location,
  Wrapped,
} from "@/lib/types";
import { fetchedAtOf, fetchWithTimeout, nowIso } from "@/lib/util";

const ATTRIBUTION = "Inlet & Lake Boca cams + AI vision · typical-traffic model";

/**
 * The same off-host cam-vision job that counts boats on the Boca Inlet + Lake
 * Boca webcams publishes its rolling read here. The data lives on a dedicated
 * `boat-traffic-data` branch, so the feed may 404 until that branch exists.
 */
const BOAT_TRAFFIC_FEED_URL =
  process.env.BOAT_TRAFFIC_FEED_URL ??
  "https://raw.githubusercontent.com/jayfrid-bot/isitboatday/boat-traffic-data/boat_traffic.json";

// An observation counts as LIVE only if it was captured within this window.
const LIVE_WINDOW_MIN = 90;

// quiet < light < moderate < busy < packed — the rank we average/compare on.
const RANK: Record<string, number> = {
  quiet: 0,
  light: 1,
  moderate: 2,
  busy: 3,
  packed: 4,
};
const LEVELS: BoatTrafficLevel[] = ["quiet", "light", "moderate", "busy", "packed"];

/** Map a per-view boat count to a crowd level (shared semantics with the cam job). */
export function levelFromBoats(boats: number): BoatTrafficLevel {
  if (boats <= 1) return "quiet";
  if (boats <= 4) return "light";
  if (boats <= 9) return "moderate";
  if (boats <= 19) return "busy";
  return "packed";
}

/** Clamp a numeric rank into the quiet..packed band and map it back to a level. */
function levelFromRank(rank: number): BoatTrafficLevel {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, Math.round(rank)))];
}

// --- published feed shape (Agent A writes it) ------------------------------
interface FeedCam {
  name?: string;
  boats?: number;
  underway?: number;
  anchored?: number;
  level?: string;
  note?: string;
}
interface FeedLatest {
  capturedAtLocal?: string;
  totalBoats?: number;
  underway?: number;
  anchored?: number;
  level?: string;
  cams?: FeedCam[];
}
interface FeedHistoryEntry {
  t?: string; // ISO-local capture time
  hour?: number; // 0-23, local
  boats?: number;
  level?: string;
}
export interface BoatFeed {
  latest?: FeedLatest | null;
  history?: FeedHistoryEntry[];
}

/** Parse the raw JSON into the latest read + the rolling history list. Pure. */
export function parseBoatFeed(json: unknown): {
  latest: FeedLatest | null;
  history: FeedHistoryEntry[];
} {
  const feed = (json ?? {}) as BoatFeed;
  const latest = feed.latest ?? null;
  const history = Array.isArray(feed.history) ? feed.history : [];
  return { latest, history };
}

/**
 * Average the rolling history into a typical boat count + level per local hour.
 * Only keeps hours with >= 2 samples (a single read isn't a "typical"). The
 * hour's level is the average boat count mapped back to a band when counts are
 * present, else the modal/rounded level rank. Pure (unit-tested).
 */
export function byHourFromHistory(
  history: FeedHistoryEntry[],
): BoatTrafficByHour[] | undefined {
  const buckets = new Map<
    number,
    { boats: number; bN: number; rank: number; rN: number; n: number }
  >();
  for (const e of history) {
    if (typeof e.hour !== "number" || e.hour < 0 || e.hour > 23) continue;
    const b = buckets.get(e.hour) ?? { boats: 0, bN: 0, rank: 0, rN: 0, n: 0 };
    b.n += 1;
    if (typeof e.boats === "number" && Number.isFinite(e.boats)) {
      b.boats += e.boats;
      b.bN += 1;
    }
    if (typeof e.level === "string" && e.level in RANK) {
      b.rank += RANK[e.level];
      b.rN += 1;
    }
    buckets.set(e.hour, b);
  }
  const out: BoatTrafficByHour[] = [];
  for (const [hour, b] of buckets) {
    if (b.n < 2) continue; // need at least 2 reads to call it "typical"
    const boats = b.bN ? Math.round(b.boats / b.bN) : undefined;
    // Prefer averaging the boat count (smoother); else fall back to the level rank.
    const level =
      boats != null ? levelFromBoats(boats) : b.rN ? levelFromRank(b.rank / b.rN) : "unknown";
    out.push({ hour, level, boats, samples: b.n });
  }
  if (!out.length) return undefined;
  return out.sort((a, b) => a.hour - b.hour);
}

/**
 * Deterministic "typical traffic" calendar model — used when no fresh cam
 * observation exists. Reads the LOCAL hour/day/month in the town's timezone and
 * applies a simple daypart curve, bumped on weekends (and bumped again on summer
 * weekend afternoons — the sandbar raft-up window). Pure (unit-tested).
 */
export function predictTraffic(
  date: Date,
  tz: string,
): { level: BoatTrafficLevel; note: string } {
  const parts = localParts(date, tz);
  const { hour, weekdayIdx, weekdayName, monthIdx, monthName } = parts;

  // Base daypart level.
  let rank: number;
  if (hour < 6 || hour > 20) rank = RANK.quiet;
  else if (hour <= 8) rank = RANK.light;
  else if (hour <= 16) rank = RANK.moderate; // 9-10 and 11-16 both moderate
  else rank = RANK.light; // 17-19, plus hour 20 falls through here too

  const isWeekend = weekdayIdx === 0 || weekdayIdx === 6; // Sun=0, Sat=6
  if (isWeekend) rank += 1;

  // Summer (May-September) weekend afternoons (11-16): the sandbar Saturday bump.
  const isSummer = monthIdx >= 4 && monthIdx <= 8; // May(4)..Sep(8)
  if (isWeekend && isSummer && hour >= 11 && hour <= 16) rank += 1;

  const level = levelFromRank(rank);
  const note = `typical for a ${weekdayName} ${daypartName(hour)} in ${monthName}`;
  return { level, note };
}

/** Plain-English daypart label for the note. */
function daypartName(hour: number): string {
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour <= 20) return "evening";
  return "night";
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Resolve the local hour / weekday / month for a Date in a given IANA timezone. */
function localParts(date: Date, tz: string): {
  hour: number;
  weekdayIdx: number;
  weekdayName: string;
  monthIdx: number;
  monthName: string;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
    month: "numeric",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // some engines render midnight as "24"
  const monthIdx = Number(map.month) - 1;
  const weekdayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(map.weekday);
  return {
    hour,
    weekdayIdx,
    weekdayName: WEEKDAYS[weekdayIdx] ?? map.weekday,
    monthIdx,
    monthName: MONTHS[monthIdx] ?? map.month,
  };
}

/** Minutes between an ISO-local capture time and now; +Infinity when unparseable. */
function ageMinutes(capturedAtLocal: string | undefined): number {
  if (!capturedAtLocal) return Infinity;
  const t = new Date(capturedAtLocal).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 60_000;
}

/** Build the typical-pattern fallback (source "typical"), keeping byHour if history existed. */
function typicalFallback(
  loc: Location,
  byHour: BoatTrafficByHour[] | undefined,
  extraNote?: string,
): BoatTrafficData {
  const { level, note } = predictTraffic(new Date(), loc.timezone);
  return {
    level,
    source: "typical",
    note: extraNote ? `${note} (${extraNote})` : `${note} — typical-pattern estimate`,
    byHour,
  };
}

export async function fetchBoatTraffic(loc: Location): Promise<Wrapped<BoatTrafficData>> {
  let fetchedAt = nowIso();
  // The prediction path is pure and cannot fail, so this source never returns
  // "error": worst case it serves the typical-traffic estimate as "best-effort".
  try {
    const res = await fetchWithTimeout(BOAT_TRAFFIC_FEED_URL, {
      timeoutMs: 6000,
      next: { revalidate: 900 }, // 15 min — the cam-vision job runs frequently
    });
    fetchedAt = fetchedAtOf(res);

    // The data branch may not exist yet -> fall back to the typical model.
    if (res.status === 404) {
      return {
        source: ATTRIBUTION,
        status: "best-effort",
        fetchedAt,
        attribution: ATTRIBUTION,
        data: typicalFallback(loc, undefined, "live cam feed not published yet"),
      };
    }
    if (!res.ok) throw new Error(`boat traffic feed -> ${res.status}`);

    const { latest, history } = parseBoatFeed(await res.json());
    const byHour = byHourFromHistory(history);

    // LIVE observation: latest read within the freshness window -> use the cams.
    if (latest && ageMinutes(latest.capturedAtLocal) <= LIVE_WINDOW_MIN) {
      const level =
        typeof latest.level === "string" && latest.level in RANK
          ? (latest.level as BoatTrafficLevel)
          : typeof latest.totalBoats === "number"
            ? levelFromBoats(latest.totalBoats)
            : "unknown";
      return {
        source: ATTRIBUTION,
        status: "ok",
        fetchedAt,
        attribution: ATTRIBUTION,
        data: {
          level,
          boats: typeof latest.totalBoats === "number" ? latest.totalBoats : undefined,
          underway: typeof latest.underway === "number" ? latest.underway : undefined,
          anchored: typeof latest.anchored === "number" ? latest.anchored : undefined,
          source: "cams",
          capturedAtLocal: latest.capturedAtLocal,
          byHour,
        },
      };
    }

    // Stale or missing latest -> typical-pattern estimate (keep byHour if we have it).
    return {
      source: ATTRIBUTION,
      status: "best-effort",
      fetchedAt,
      attribution: ATTRIBUTION,
      data: typicalFallback(
        loc,
        byHour,
        latest ? "live read is stale" : "no live read yet",
      ),
    };
  } catch {
    // Network/parse failure -> still serve the deterministic typical estimate.
    return {
      source: ATTRIBUTION,
      status: "best-effort",
      fetchedAt,
      attribution: ATTRIBUTION,
      data: typicalFallback(loc, undefined, "live cam feed unavailable"),
    };
  }
}
