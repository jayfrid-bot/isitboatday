import type { LightningData, NwsAlert, NwsData, Wrapped } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { degToCardinal } from "@/lib/util";

// Marine-alert classification (mirrors the score-side regexes — see the plan's
// contract §6) so the banner severity matches what the score acts on.
const SEVERE = /gale warning|storm warning|hurricane force|hazardous seas warning|tsunami/i;
const SPECIAL_MARINE_WARNING = /special marine warning/i;
const SMALL_CRAFT_ADVISORY = /small craft advisory/i;
const DENSE_FOG = /dense fog advisory/i;
// Land-point warnings that mean "do not leave the dock" even without a marine zone alert.
const LAND_SEVERE =
  /hurricane warning|tropical storm warning|storm surge warning|tsunami/i;

/** "until Jun 11" line for an alert that publishes an end time. */
function untilLabel(a: NwsAlert): string {
  return a.ends ? ` — until ${fmtDate(a.ends, "America/New_York")}` : "";
}

/**
 * Boating safety banner. Marine zone alerts (Small Craft Advisory, Gale/Storm
 * Warning, Special Marine Warning, Dense Fog) get top billing because they are
 * THE authoritative go/no-go signal for a boater; land alerts and nearby
 * lightning follow. Red = do not go out; amber = go with caution.
 */
export function SafetyBanner({
  nws,
  lightning,
}: {
  nws?: Wrapped<NwsData>;
  lightning?: Wrapped<LightningData>;
}) {
  const marineAlerts = nws?.data?.marineAlerts ?? [];
  const landAlerts = nws?.data?.alerts ?? [];
  const lt = lightning?.data;
  // Lightning within ~25 mi is a reason to never leave the dock; ≤10 mi is acute.
  const lightningNear = (lt?.within25mi ?? 0) > 0;

  // Split marine alerts by severity for distinct red/amber treatment.
  const severeMarine = marineAlerts.filter((a) => SEVERE.test(a.event));
  const smwMarine = marineAlerts.filter((a) => SPECIAL_MARINE_WARNING.test(a.event));
  const scaMarine = marineAlerts.filter((a) => SMALL_CRAFT_ADVISORY.test(a.event));
  const fogMarine = marineAlerts.filter((a) => DENSE_FOG.test(a.event));
  // Anything else on the marine zone we still surface (amber) so nothing is lost.
  const otherMarine = marineAlerts.filter(
    (a) =>
      !SEVERE.test(a.event) &&
      !SPECIAL_MARINE_WARNING.test(a.event) &&
      !SMALL_CRAFT_ADVISORY.test(a.event) &&
      !DENSE_FOG.test(a.event),
  );
  const severeLand = landAlerts.filter((a) => LAND_SEVERE.test(a.event));
  const otherLand = landAlerts.filter((a) => !LAND_SEVERE.test(a.event));

  const hasRed =
    severeMarine.length > 0 ||
    smwMarine.length > 0 ||
    severeLand.length > 0 ||
    (lt?.within10mi ?? 0) > 0;
  const hasAnything =
    marineAlerts.length > 0 || landAlerts.length > 0 || lightningNear;

  // Nothing worth surfacing → render nothing.
  if (!hasAnything) return null;

  return (
    <div
      className={`rounded-2xl p-4 ring-1 ${
        hasRed ? "bg-rose-500/10 ring-rose-500/40" : "bg-amber-500/10 ring-amber-500/30"
      }`}
    >
      {/* Gale / Storm / Hurricane-force / tsunami on the marine zone — do not go out. */}
      {severeMarine.length ? (
        <div className="mb-3 rounded-xl bg-rose-500/15 p-3 ring-1 ring-rose-500/40">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-200">
            <span aria-hidden>🌀</span>
            <span>Gale or storm warning — do not go out</span>
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-rose-100/80">
            {severeMarine.map((a) => (
              <li key={a.event + (a.ends ?? "")}>
                {a.event}
                {untilLabel(a)}
              </li>
            ))}
          </ul>
          <div className="mt-1 text-[11px] text-rose-200/60">NWS marine zone forecast</div>
        </div>
      ) : null}

      {/* Special Marine Warning — severe thunderstorm over the water, red. */}
      {smwMarine.length ? (
        <div className="mb-3 rounded-xl bg-rose-500/15 p-3 ring-1 ring-rose-500/40">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-200">
            <span aria-hidden>⛈️</span>
            <span>Special Marine Warning — severe storm over the water</span>
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-rose-100/80">
            {smwMarine.map((a) => (
              <li key={a.event + (a.ends ?? "")}>
                {a.headline || a.event}
                {untilLabel(a)}
              </li>
            ))}
          </ul>
          <div className="mt-1 text-[11px] text-rose-200/60">NWS marine zone forecast</div>
        </div>
      ) : null}

      {/* Land-point severe weather (hurricane / tropical storm / surge), red. */}
      {severeLand.length ? (
        <div className="mb-3 rounded-xl bg-rose-500/15 p-3 ring-1 ring-rose-500/40">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-200">
            <span aria-hidden>🚨</span>
            <span>Severe weather warning in effect</span>
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-rose-100/80">
            {severeLand.map((a) => (
              <li key={a.event + (a.ends ?? "")}>
                {a.event}
                {untilLabel(a)}
              </li>
            ))}
          </ul>
          <div className="mt-1 text-[11px] text-rose-200/60">NOAA/NWS</div>
        </div>
      ) : null}

      {/* Lightning within ~10 mi — red; ≤25 mi — amber. */}
      {lightningNear ? (
        <div
          className={`mb-3 rounded-xl p-3 ring-1 ${
            (lt?.within10mi ?? 0) > 0
              ? "bg-rose-500/15 ring-rose-500/40"
              : "bg-amber-500/10 ring-amber-500/30"
          }`}
        >
          <div
            className={`flex items-center gap-2 text-sm font-semibold ${
              (lt?.within10mi ?? 0) > 0 ? "text-rose-200" : "text-amber-200"
            }`}
          >
            <span aria-hidden>⚡</span>
            <span>
              {(lt?.within10mi ?? 0) > 0
                ? "Lightning within 10 miles — stay at the dock"
                : "Lightning in the area"}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-300">
            {lt?.within25mi} strike{(lt?.within25mi ?? 0) === 1 ? "" : "s"} within 25 mi
            in the last {lt?.windowMinutes ?? 30} min
            {lt?.nearestMi != null
              ? ` (nearest ${lt.nearestMi} mi${
                  lt.nearestBearingDeg != null
                    ? " to the " + degToCardinal(lt.nearestBearingDeg)
                    : ""
                }).`
              : "."}{" "}
            NOAA GOES GLM.
          </div>
        </div>
      ) : null}

      {/* Small Craft Advisory — amber with a plain-English explanation. */}
      {scaMarine.length ? (
        <div className="mb-3 rounded-xl bg-amber-500/10 p-3 ring-1 ring-amber-500/30">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            <span aria-hidden>⚠️</span>
            <span>Small Craft Advisory</span>
          </div>
          <div className="mt-1 text-xs text-amber-100/80">
            NWS advisory for boats under ~33 ft — strong winds and/or rough seas.
            {scaMarine.some((a) => a.ends)
              ? ` In effect until ${fmtDate(
                  scaMarine.map((a) => a.ends).filter(Boolean).sort()[0] as string,
                  "America/New_York",
                )}.`
              : ""}{" "}
            NWS marine zone forecast.
          </div>
        </div>
      ) : null}

      {/* Marine Dense Fog Advisory — amber (a navigation hazard). */}
      {fogMarine.length ? (
        <div className="mb-3 rounded-xl bg-amber-500/10 p-3 ring-1 ring-amber-500/30">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            <span aria-hidden>🌫️</span>
            <span>Dense Fog Advisory — poor visibility on the water</span>
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-100/80">
            {fogMarine.map((a) => (
              <li key={a.event + (a.ends ?? "")}>
                {a.event}
                {untilLabel(a)}
              </li>
            ))}
          </ul>
          <div className="mt-1 text-[11px] text-amber-200/60">NWS marine zone forecast</div>
        </div>
      ) : null}

      {/* Any other marine-zone or land alerts we didn't classify — surfaced amber. */}
      {otherMarine.length || otherLand.length ? (
        <div className="rounded-xl bg-amber-500/10 p-3 ring-1 ring-amber-500/30">
          <ul className="space-y-0.5 text-xs text-slate-300">
            {otherMarine.map((a) => (
              <li key={"m" + a.event + (a.ends ?? "")}>
                ⚓ {a.event}
                {untilLabel(a)}
              </li>
            ))}
            {otherLand.map((a) => (
              <li key={"l" + a.event + (a.ends ?? "")}>
                ⚠ {a.event}
                {untilLabel(a)}
              </li>
            ))}
          </ul>
          <div className="mt-1 text-[11px] text-slate-500">NOAA/NWS</div>
        </div>
      ) : null}
    </div>
  );
}
