"use client";

import Link from "next/link";
import useSWR from "swr";
import type { ConditionsResponse } from "@/lib/types";
import { bestBoatWindow, deriveMetrics } from "@/lib/score";
import { boatDayVerdict, fmtDate, fmtTime, scoreColor } from "@/lib/format";
import { mphToKnots, round } from "@/lib/util";
import { Logo } from "@/components/Logo";
import { HeroWaves } from "@/components/HeroWaves";
import { ScoreGauge } from "@/components/ScoreGauge";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { HourlyScoreGraph } from "@/components/HourlyScoreGraph";
import { LightningCard } from "@/components/LightningCard";
import { MetricCard } from "@/components/MetricCard";
import { WindCompass } from "@/components/WindCompass";
import { TidePanel } from "@/components/TidePanel";
import { SunPanel } from "@/components/SunPanel";
import { MoonPanel } from "@/components/MoonPanel";
import { SafetyBanner } from "@/components/SafetyBanner";
import { SourceList } from "@/components/SourceBadge";
import { CamGrid } from "@/components/CamGrid";
import { ForecastStrip } from "@/components/ForecastStrip";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

// Stamped into the bundle at build time (see next.config.mjs) for the footer.
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME;

/** Plain-English comfort note for a dew point (°F) — the mugginess driver. */
function dewComfort(f?: number): string | undefined {
  if (f == null) return undefined;
  if (f < 55) return "crisp & dry";
  if (f < 60) return "very comfortable";
  if (f < 65) return "comfortable";
  if (f < 70) return "a bit sticky";
  if (f < 75) return "muggy";
  return "oppressive";
}
/** Plain-English note for relative humidity (%). */
function humidityNote(p?: number): string | undefined {
  if (p == null) return undefined;
  if (p < 40) return "dry";
  if (p < 60) return "comfortable";
  if (p < 75) return "humid";
  if (p < 90) return "muggy";
  return "saturated";
}

export function ConditionsDashboard({
  slug,
  initial,
}: {
  slug: string;
  initial: ConditionsResponse;
}) {
  const { data } = useSWR<ConditionsResponse>(
    `/api/conditions/${slug}`,
    fetcher,
    { fallbackData: initial, refreshInterval: 300_000 },
  );

  const res = data ?? initial;
  const snap = res.snapshot;
  const active = res.score;
  const d = deriveMetrics(snap);
  const tz = snap.location.timezone;
  const cams = res.cams;
  const traffic = snap.traffic.data;
  const nc = snap.nowcast.data;
  const bw = bestBoatWindow(res.hourlyScores);
  const uvBurn =
    d.uvIndex != null && d.uvIndex >= 1 ? Math.round(200 / d.uvIndex) : undefined;
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

  // Wind is the hero. Boaters speak knots, so lead with knots and keep mph small.
  // Internal storage stays mph (imperial-in-adapters); mphToKnots lives in util.
  const windKn = d.windSpeedMph != null ? round(mphToKnots(d.windSpeedMph)) : undefined;
  const gustKn = d.windGustMph != null ? round(mphToKnots(d.windGustMph)) : undefined;

  const sources = [
    snap.weather,
    snap.buoy,
    snap.tides,
    snap.marine,
    snap.nowcast,
    snap.nws,
    snap.lightning,
    snap.traffic,
    snap.forecast,
    snap.sun,
    snap.hourly,
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5">
        <Link
          href="/"
          className="inline-flex min-h-[36px] items-center text-sm hover:opacity-80"
          aria-label="Is It Boat Day — all boating towns"
        >
          <Logo markSize={28} />
        </Link>
      </header>

      {/* Hero verdict panel — the instrument-cluster headline. A dawn-over-water
          gradient carries the location, the one-line verdict, and the gauge,
          with a drifting layered wave divider seating it into the page. */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-dawn-hero ring-1 ring-white/10">
        <div className="relative z-10 px-5 pb-20 pt-6 sm:px-8 sm:pb-24 sm:pt-8">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            {snap.location.name}
          </h1>
          <p className="text-ocean-200/80">{snap.location.region}</p>

          <div className="mt-6 flex flex-col items-center gap-6 sm:mt-8 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
            <div className="text-center sm:text-left">
              <div className="text-xs uppercase tracking-widest text-ocean-200/70">
                Is it boat day?
              </div>
              <div
                className="mt-1 text-3xl font-bold leading-tight sm:text-4xl"
                style={{ color: scoreColor(active.score) }}
              >
                {boatDayVerdict(active.score)}
              </div>
            </div>
            <div className="shrink-0">
              <ScoreGauge
                score={active.score}
                rating={active.rating}
                label="Boat Day score"
                accent={scoreColor(active.score)}
              />
            </div>
          </div>
        </div>
        <HeroWaves />
      </section>

      <div className="mb-6">
        <SafetyBanner nws={snap.nws} lightning={snap.lightning} />
      </div>

      <section className="mb-6">
        <ScoreBreakdown result={active} />
      </section>

      {nc || bw ? (
        <section className="mb-4 flex flex-wrap gap-2 text-sm">
          {nc ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/60 px-3 py-1 text-slate-200 ring-1 ring-white/10 backdrop-blur">
              <span aria-hidden>{nc.state === "raining" ? "🌧️" : "☀️"}</span>
              {nc.text}
            </span>
          ) : null}
          {bw ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-200 ring-1 ring-emerald-400/20 backdrop-blur">
              <span aria-hidden>⭐</span>
              Best window today:{" "}
              <span className="tabular-nums">
                {fmtTime(bw.startIso, tz)}–{fmtTime(bw.endIso, tz)}
              </span>
            </span>
          ) : null}
        </section>
      ) : null}

      <section className="mb-6">
        <HourlyScoreGraph hours={res.hourlyScores} tz={tz} />
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {/* Wind — the hero card, knots first. Spans two columns to give it weight. */}
        <div className="col-span-2 rounded-2xl bg-slate-900/60 p-4 ring-1 ring-white/10 backdrop-blur transition-transform duration-200 hover:-translate-y-0.5 hover:ring-white/20">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400">
            <span aria-hidden>💨</span>
            <span>Wind</span>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <WindCompass fromDeg={d.windDirDeg} speedMph={d.windSpeedMph} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold tabular-nums leading-none text-white sm:text-5xl">
                  {windKn != null ? windKn : "—"}
                </span>
                {windKn != null ? (
                  <span className="text-base font-medium text-slate-400">kn</span>
                ) : null}
              </div>
              {d.windSpeedMph != null ? (
                <div className="mt-1 text-xs tabular-nums text-slate-400">
                  {d.windSpeedMph} mph
                </div>
              ) : null}
              {gustKn != null ? (
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-2 py-0.5 text-xs font-medium tabular-nums text-ocean-200 ring-1 ring-white/10">
                  gusts {gustKn} kn
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <MetricCard
          icon="〰️"
          label="Sea state"
          value={d.waveHeightFt != null ? `${d.waveHeightFt} ft` : "—"}
          sub={
            d.waveHeightFt != null && d.wavePeriodS != null
              ? `${d.waveHeightFt} ft @ ${d.wavePeriodS} s`
              : d.wavePeriodS != null
                ? `${d.wavePeriodS} s period`
                : undefined
          }
        />
        <MetricCard
          icon="🌡️"
          label="Water temp"
          value={d.waterTempF != null ? `${d.waterTempF}°F` : "—"}
        />
        <MetricCard
          icon="☀️"
          label="Air temp"
          value={d.airTempF != null ? `${d.airTempF}°F` : "—"}
          sub={d.shortForecast}
        />
        <MetricCard
          icon="🌫️"
          label="Visibility"
          value={d.visibilityMi != null ? `${d.visibilityMi} mi` : "—"}
          sub={
            d.visibilityMi != null && d.visibilityMi < 2
              ? "fog risk"
              : d.visibilityMi != null
                ? "clear sightlines"
                : undefined
          }
        />
        <MetricCard
          icon="💧"
          label="Humidity"
          value={d.humidityPct != null ? `${d.humidityPct}%` : "—"}
          sub={humidityNote(d.humidityPct)}
        />
        <MetricCard
          icon="🌫️"
          label="Dew point"
          value={d.dewPointF != null ? `${d.dewPointF}°F` : "—"}
          sub={dewComfort(d.dewPointF)}
        />
        <MetricCard
          icon="🔆"
          label="UV index"
          value={d.uvIndex != null ? `${d.uvIndex}` : "—"}
          sub={
            uvBurn != null
              ? `~${uvBurn} min to burn — no shade out there`
              : d.uvIndex != null
                ? "minimal burn risk"
                : undefined
          }
        />
        <MetricCard
          icon="☁️"
          label="Cloud cover"
          value={d.cloudCoverPct != null ? `${d.cloudCoverPct}%` : "—"}
          sub={
            d.cloudCoverPct != null
              ? d.cloudCoverPct <= 15
                ? "full sun"
                : d.cloudCoverPct <= 60
                  ? "partly cloudy"
                  : "overcast"
              : undefined
          }
        />
        <MetricCard
          icon="⚓"
          label="Ramp & marina traffic"
          value={!traffic || traffic.level === "unknown" ? "—" : cap(traffic.level)}
          sub={
            traffic && traffic.level !== "unknown"
              ? traffic.congestion != null
                ? `${traffic.congestion}% congestion near the waterfront`
                : "near the waterfront"
              : undefined
          }
        />
        {d.precipProbability != null ? (
          <MetricCard
            icon="🌧️"
            label="Rain chance"
            value={`${d.precipProbability}%`}
          />
        ) : null}
      </section>

      <section className="mb-6 grid gap-4 sm:grid-cols-2">
        <LightningCard lightning={snap.lightning} />
      </section>

      <section className="mb-6 grid gap-4 sm:grid-cols-2">
        <TidePanel tides={snap.tides} weather={snap.weather} buoy={snap.buoy} tz={tz} />
        <SunPanel sun={snap.sun} tz={tz} />
        <MoonPanel sun={snap.sun} />
      </section>

      <section className="mb-6">
        <ForecastStrip forecast={snap.forecast} />
      </section>

      <section className="mb-8">
        <CamGrid cams={cams} tz={tz} />
      </section>

      <footer className="space-y-3 border-t border-white/5 pt-6">
        <SourceList sources={sources} />
        <p className="text-center text-xs text-slate-500">
          Scores are an automated estimate for general guidance only — not a
          safety determination. Check the official NWS marine forecast and use
          your own judgment as captain.
        </p>
        <p className="text-center text-xs text-slate-500">
          Spot something off or have an idea?{" "}
          <a
            href="mailto:hello@isitboatday.com"
            className="text-ocean-300 hover:underline"
          >
            hello@isitboatday.com
          </a>
        </p>
        <p className="text-center text-xs text-slate-500">
          v{APP_VERSION}
          <span className="mx-1.5 text-slate-600">·</span>
          data updated {fmtDate(snap.generatedAt, tz)}, {fmtTime(snap.generatedAt, tz)}
          {BUILD_TIME && (
            <>
              <span className="mx-1.5 text-slate-600">·</span>
              built {fmtDate(BUILD_TIME, tz)}, {fmtTime(BUILD_TIME, tz)}
            </>
          )}
        </p>
      </footer>
    </main>
  );
}
