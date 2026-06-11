import type { Wrapped, TideData, WeatherData, BuoyData } from "@/lib/types";
import { fmtTime } from "@/lib/format";
import { angularDistance, mphToKnots } from "@/lib/util";
import { TideCurve } from "@/components/TideCurve";

/**
 * Plain-English inlet note keyed to the tide trend and the wind. An outgoing
 * (ebb) tide running against an onshore east wind stacks up steep, breaking
 * chop right in the inlet — the classic Boca Inlet trap — so we call that out
 * specifically. Otherwise: rising water makes for an easy, friendly inlet.
 */
function inletNote(
  trend: TideData["trend"],
  windFromDeg?: number,
  windSpeedMph?: number,
): string | undefined {
  if (!trend) return undefined;
  if (trend === "rising") return "incoming — friendly inlet";
  // Falling tide. An onshore wind (blowing FROM the east, ~90°) over an ebb is the nasty case.
  // Gate on knots exactly like the scorer's tideScore() (>= 10 kn) so the note
  // and the score's inlet-chop penalty never disagree at the margin.
  const onshoreEast =
    windFromDeg != null &&
    angularDistance(windFromDeg, 90) <= 45 &&
    mphToKnots(windSpeedMph ?? 0) >= 10;
  return onshoreEast
    ? "outgoing — expect chop at the inlet on an east wind"
    : "outgoing — watch the inlet";
}

export function TidePanel({
  tides,
  weather,
  buoy,
  tz,
}: {
  tides: Wrapped<TideData>;
  weather?: Wrapped<WeatherData>;
  buoy?: Wrapped<BuoyData>;
  tz: string;
}) {
  const events = tides.data?.next ?? [];
  const trend = tides.data?.trend;
  const windFromDeg = weather?.data?.windDirDeg ?? buoy?.data?.windDirDeg;
  const windSpeedMph = weather?.data?.windSpeedMph ?? buoy?.data?.windSpeedMph;
  const note = inletNote(trend, windFromDeg, windSpeedMph);

  return (
    <div className="rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span aria-hidden>🌊</span>
          <span>Tides</span>
        </div>
        {trend ? (
          <span className="text-xs text-ocean-300">
            {trend === "rising" ? "↑ rising" : "↓ falling"}
          </span>
        ) : null}
      </div>
      {note ? (
        <div className="mt-1.5 text-xs font-medium text-ocean-200">{note}</div>
      ) : null}
      {events.length === 0 ? (
        <div className="mt-2 text-sm text-slate-500">Unavailable</div>
      ) : (
        <>
          <TideCurve events={events} tz={tz} />
          <ul className="mt-2 space-y-1.5">
            {events.map((e, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="capitalize text-slate-300">
                  {e.type === "high" ? "High" : "Low"} tide
                </span>
                <span className="text-white">{fmtTime(e.time, tz)}</span>
                <span className="w-12 text-right text-slate-400">{e.heightFt} ft</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
