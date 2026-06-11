import type { Location, NwsAlert, NwsData, Wrapped } from "@/lib/types";
import { fetchWithTimeout, fetchedAtOf, nowIso, oldestIso } from "@/lib/util";

const ATTRIBUTION = "NOAA/NWS (api.weather.gov)";
const SOURCE = "NWS (land + marine zone alerts)";

// --- pure parsers ----------------------------------------------------------
interface AlertsJson {
  features?: {
    properties?: {
      event?: string;
      severity?: string;
      headline?: string;
      ends?: string | null;
      expires?: string | null;
    };
  }[];
}

/** Map the NWS active-alerts GeoJSON to a compact alert list. */
export function parseAlerts(json: AlertsJson): NwsAlert[] {
  return (json.features ?? [])
    .map((f) => f.properties ?? {})
    .filter((p) => p.event)
    .map((p) => ({
      event: p.event as string,
      severity: p.severity ?? "Unknown",
      headline: p.headline ?? undefined,
      ends: p.ends ?? p.expires ?? undefined,
    }));
}

// --- fetch -----------------------------------------------------------------
/**
 * Fetch one active-alerts feed and parse it. Returns the parsed list plus an
 * `ok` flag and the response timestamp so the caller can tell which of the two
 * feeds (land point vs marine zone) succeeded without anything throwing.
 */
async function fetchAlertsFeed(
  url: string,
): Promise<{ alerts: NwsAlert[]; ok: boolean; at?: string }> {
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: 7000,
      next: { revalidate: 900 }, // 15m — alerts change
    });
    if (!res.ok) return { alerts: [], ok: false };
    return { alerts: parseAlerts(await res.json()), ok: true, at: fetchedAtOf(res) };
  } catch {
    return { alerts: [], ok: false };
  }
}

export async function fetchNws(loc: Location): Promise<Wrapped<NwsData>> {
  const fetchedAt = nowIso();
  try {
    // Land-point alerts (hurricane warnings etc.) and offshore marine-zone
    // alerts (Small Craft Advisory, Gale Warning, Special Marine Warning, marine
    // Dense Fog Advisory) fetched in parallel — the marine zone is the boating
    // safety authority for offshore conditions.
    const [land, marine] = await Promise.all([
      fetchAlertsFeed(`https://api.weather.gov/alerts/active?point=${loc.lat},${loc.lon}`),
      fetchAlertsFeed(
        `https://api.weather.gov/alerts/active?zone=${loc.nwsMarineZoneId}`,
      ),
    ]);

    const data: NwsData = { alerts: land.alerts, marineAlerts: marine.alerts };

    // If exactly one feed failed we still have useful data — report best-effort
    // with a note rather than dropping the whole source.
    if (land.ok !== marine.ok) {
      const failed = land.ok ? "marine-zone" : "land-point";
      return {
        source: SOURCE,
        status: "best-effort",
        fetchedAt: oldestIso(land.at, marine.at),
        attribution: ATTRIBUTION,
        data,
        note: `${failed} alerts unavailable; showing the other`,
      };
    }

    // Both failed: surface an error with no data.
    if (!land.ok && !marine.ok) {
      return {
        source: SOURCE,
        status: "error",
        fetchedAt,
        attribution: ATTRIBUTION,
        data: null,
        note: "alerts unavailable",
      };
    }

    return {
      source: SOURCE,
      status: "ok",
      fetchedAt: oldestIso(land.at, marine.at),
      attribution: ATTRIBUTION,
      data,
    };
  } catch (e) {
    return {
      source: SOURCE,
      status: "error",
      fetchedAt,
      attribution: ATTRIBUTION,
      data: null,
      note: String(e),
    };
  }
}
