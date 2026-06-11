import { describe, it, expect } from "vitest";
import {
  bestBoatWindow,
  computeHourlyScores,
  computeScore,
  deriveMetrics,
  rainSeverity,
  scoreBoatDay,
} from "@/lib/score";
import type {
  BuoyData,
  ConditionsSnapshot,
  ForecastDay,
  HourlyMetrics,
  HourlyScore,
  LightningData,
  MarineData,
  NowcastData,
  NwsAlert,
  NwsData,
  SunData,
  TideData,
  TrafficData,
  WeatherData,
  Wrapped,
} from "@/lib/types";

function wrap<T>(data: T | null): Wrapped<T> {
  return {
    source: "test",
    status: data ? "ok" : "error",
    fetchedAt: new Date().toISOString(),
    attribution: "test",
    data,
  };
}

function snapshot(over: {
  buoy?: BuoyData | null;
  weather?: WeatherData | null;
  marine?: MarineData | null;
  tides?: TideData | null;
  nws?: NwsData | null;
  lightning?: LightningData | null;
  sun?: SunData | null;
  hourly?: HourlyMetrics[] | null;
}): ConditionsSnapshot {
  return {
    location: {
      slug: "boca-raton",
      name: "Boca Raton",
      region: "FL",
      lat: 26.36,
      lon: -80.07,
      timezone: "America/New_York",
    },
    generatedAt: new Date().toISOString(),
    tides: wrap(over.tides ?? null),
    buoy: wrap(over.buoy ?? null),
    weather: wrap(over.weather ?? null),
    marine: wrap(over.marine ?? null),
    nowcast: wrap<NowcastData>(null),
    nws: wrap(over.nws ?? null),
    lightning: wrap(over.lightning ?? null),
    traffic: wrap<TrafficData>(null),
    forecast: wrap<ForecastDay[]>(null),
    sun: wrap(over.sun ?? null),
    hourly: wrap(over.hourly ?? null),
  };
}

/** Build a marineAlerts-only NwsData from a list of event strings. */
const marine = (...events: string[]): NwsData => ({
  alerts: [],
  marineAlerts: events.map((event): NwsAlert => ({ event, severity: "Severe" })),
});

// A glass-calm, blue-sky morning: the perfect day to take the boat out.
const PERFECT = snapshot({
  buoy: { waterTempF: 82, windSpeedMph: 5, windDirDeg: 90, waveHeightFt: 1, dominantPeriodS: 9 },
  weather: {
    airTempF: 85,
    shortForecast: "Sunny",
    precipProbability: 0,
    humidityPct: 55,
    dewPointF: 60,
    visibilityMi: 10,
  },
  marine: { uvIndex: 6, cloudCoverPct: 5 },
  tides: { next: [], trend: "rising" },
});

describe("deriveMetrics", () => {
  it("prefers buoy water temp, weather air temp, and combined sea state", () => {
    const d = deriveMetrics(PERFECT);
    expect(d.waterTempF).toBe(82);
    expect(d.airTempF).toBe(85);
    expect(d.waveHeightFt).toBe(1);
    expect(d.wavePeriodS).toBe(9);
  });

  it("prefers buoy wave period, falls back to marine", () => {
    const buoyHasPeriod = deriveMetrics(
      snapshot({ buoy: { waveHeightFt: 2, dominantPeriodS: 11 }, marine: { wavePeriodS: 6 } }),
    );
    expect(buoyHasPeriod.wavePeriodS).toBe(11);
    const onlyMarine = deriveMetrics(
      snapshot({ buoy: { waveHeightFt: 2 }, marine: { waveHeightFt: 2, wavePeriodS: 6 } }),
    );
    expect(onlyMarine.wavePeriodS).toBe(6);
  });

  it("carries the gust speed and tide trend through", () => {
    const d = deriveMetrics(
      snapshot({ buoy: { windSpeedMph: 12, windGustMph: 25 }, tides: { next: [], trend: "falling" } }),
    );
    expect(d.windGustMph).toBe(25);
    expect(d.tideTrend).toBe("falling");
  });

  it("classifies the marine-alert booleans from the marine zone events", () => {
    const d = deriveMetrics(
      snapshot({ nws: marine("Small Craft Advisory", "Dense Fog Advisory") }),
    );
    expect(d.smallCraftAdvisory).toBe(true);
    expect(d.denseFogAdvisory).toBe(true);
    expect(d.severeMarineWarning).toBe(false);
    expect(d.specialMarineWarning).toBe(false);

    const gale = deriveMetrics(snapshot({ nws: marine("Gale Warning") }));
    expect(gale.severeMarineWarning).toBe(true);

    const smw = deriveMetrics(snapshot({ nws: marine("Special Marine Warning") }));
    expect(smw.specialMarineWarning).toBe(true);
  });

  it("severeAlert reads the LAND alerts and excludes high surf", () => {
    const hurricane = deriveMetrics(
      snapshot({ nws: { alerts: [{ event: "Hurricane Warning", severity: "Extreme" }], marineAlerts: [] } }),
    );
    expect(hurricane.severeAlert).toBe(true);
    // High surf is a beach concern, not a land-stopper for boating.
    const highSurf = deriveMetrics(
      snapshot({ nws: { alerts: [{ event: "High Surf Warning", severity: "Moderate" }], marineAlerts: [] } }),
    );
    expect(highSurf.severeAlert).toBe(false);
  });

  it("defaults lightning bands to 0 when unavailable", () => {
    const d = deriveMetrics(snapshot({}));
    expect(d.lightningWithin10mi).toBe(0);
    expect(d.lightningWithin25mi).toBe(0);
  });

  it("falls back to the nearest hourly visibility when the current weather lacks it", () => {
    const now = Date.now();
    const hourly: HourlyMetrics[] = [
      { time: new Date(now - 5 * 3_600_000).toISOString(), visibilityMi: 2 },
      { time: new Date(now + 30 * 60_000).toISOString(), visibilityMi: 9 }, // closest to now
      { time: new Date(now + 5 * 3_600_000).toISOString(), visibilityMi: 1 },
    ];
    const d = deriveMetrics(snapshot({ weather: { airTempF: 80 }, hourly }));
    expect(d.visibilityMi).toBe(9);
  });
});

describe("Boat Day scoring", () => {
  it("uses the boating sub-scores whose weights sum to 1", () => {
    const { subScores } = computeScore(PERFECT);
    const keys = subScores.map((s) => s.key).sort();
    expect(keys).toEqual(
      ["airTemp", "comfort", "seas", "storms", "tide", "uv", "visibility", "waterTemp", "wind"].sort(),
    );
    const total = subScores.reduce((a, s) => a + s.weight, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("gives a glass-calm perfect morning an Excellent score with no caps", () => {
    const r = computeScore(PERFECT);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.rating).toBe("Excellent");
    expect(r.caps).toHaveLength(0);
  });

  it("treats dead calm as perfect for boating (glass water), unlike the beach", () => {
    const windSub = (mph: number) =>
      scoreBoatDay(deriveMetrics(snapshot({ buoy: { windSpeedMph: mph } })))
        .subScores.find((s) => s.key === "wind")!.score;
    // 0-10 kn is full marks. 5 mph ≈ 4.3 kn, 10 mph ≈ 8.7 kn — both calm.
    expect(windSub(0)).toBe(100);
    expect(windSub(5)).toBe(100);
    expect(windSub(10)).toBe(100);
    // Above the plateau it fades; ~29 mph ≈ 25 kn bottoms out.
    expect(windSub(20)!).toBeLessThan(100);
    expect(windSub(29)).toBe(0);
  });

  it("applies a gust-spread penalty for squally wind (steady vs gusty)", () => {
    // 10 kn sustained, 22 kn gusts -> spread 12 kn -> (12-8)*4 = 16 off the base.
    const sustainedMph = 10 * 1.150779; // ~11.5 mph ≈ 10 kn
    const gustMph = 22 * 1.150779; // ~25.3 mph ≈ 22 kn
    const gusty = scoreBoatDay(
      deriveMetrics(snapshot({ buoy: { windSpeedMph: sustainedMph, windGustMph: gustMph } })),
    ).subScores.find((s) => s.key === "wind")!.score!;
    const steady = scoreBoatDay(
      deriveMetrics(snapshot({ buoy: { windSpeedMph: sustainedMph } })),
    ).subScores.find((s) => s.key === "wind")!.score!;
    // 10 kn is inside the 0-10 plateau (base 100); the gust spread knocks ~16 off.
    expect(steady).toBe(100);
    expect(gusty).toBe(84);
    expect(gusty).toBeLessThan(steady);
  });

  it("shows wind in knots with direction and gusts", () => {
    const display = scoreBoatDay(
      deriveMetrics(snapshot({ buoy: { windSpeedMph: 9.2, windDirDeg: 67, windGustMph: 16.1 } })),
    ).subScores.find((s) => s.key === "wind")!.display;
    // 9.2 mph ≈ 8 kn, 67° ≈ ENE, 16.1 mph ≈ 14 kn.
    expect(display).toBe("8 kn ENE · gusts 14");
  });

  it("scores seas by height, rewarding long period and penalizing short chop", () => {
    const seas = (waveHeightFt: number, wavePeriodS?: number) =>
      scoreBoatDay(deriveMetrics(snapshot({ buoy: { waveHeightFt, dominantPeriodS: wavePeriodS } })))
        .subScores.find((s) => s.key === "seas")!.score!;
    // Bare height curve anchors.
    expect(seas(0)).toBe(100);
    expect(seas(3)).toBe(70);
    expect(seas(6)).toBe(15);
    // Long-period swell (>=8 s) rides gentler: +10.
    expect(seas(3, 10)).toBe(80);
    // Short-period chop (<=5 s) at real height beats you up: -10.
    expect(seas(3, 4)).toBe(60);
    // Tiny waves (< 2 ft) don't earn the short-chop penalty: 1 ft is the same
    // whether the period is short (4 s) or neutral (6 s).
    expect(seas(1, 4)).toBe(seas(1, 6));
  });

  it("formats the seas display with height and period", () => {
    const display = scoreBoatDay(
      deriveMetrics(snapshot({ buoy: { waveHeightFt: 2.3, dominantPeriodS: 9 } })),
    ).subScores.find((s) => s.key === "seas")!.display;
    expect(display).toBe("2.3 ft @ 9 s");
  });

  it("scores storms from dryness (weighted) blended with sunshine", () => {
    // 30% rain chance (dry 70) + 40% cloud (sunshine 60) -> 0.7*70 + 0.3*60 = 67.
    const r = scoreBoatDay(
      deriveMetrics(snapshot({ weather: { precipProbability: 30 }, marine: { cloudCoverPct: 40 } })),
    );
    expect(r.subScores.find((s) => s.key === "storms")!.score).toBe(67);
  });

  it("clamps the storms sub-score for thunder/rain wording but not hedged chances", () => {
    const storms = (w: WeatherData) =>
      scoreBoatDay(deriveMetrics(snapshot({ weather: w }))).subScores.find(
        (s) => s.key === "storms",
      )!.score!;
    // Clear, dry -> high.
    expect(storms({ precipProbability: 0, shortForecast: "Sunny" })).toBe(100);
    // Thunder wording floors it at 35 even with low precip prob.
    expect(storms({ precipProbability: 10, shortForecast: "Thunderstorms" })).toBeLessThanOrEqual(35);
    // Rain wording floors it at 55.
    expect(storms({ precipProbability: 10, shortForecast: "Rain Showers" })).toBeLessThanOrEqual(55);
    // A mere CHANCE of a storm does not clamp (it still feeds via precip prob).
    expect(storms({ precipProbability: 20, shortForecast: "Slight Chance Thunderstorms" })).toBe(80);
  });

  it("scores visibility, with low visibility dragging it down", () => {
    const vis = (mi: number) =>
      scoreBoatDay(deriveMetrics(snapshot({ weather: { visibilityMi: mi } })))
        .subScores.find((s) => s.key === "visibility")!.score!;
    expect(vis(10)).toBe(100);
    expect(vis(6)).toBe(90);
    expect(vis(3)).toBe(60);
    expect(vis(1)).toBe(25);
    expect(vis(0.5)).toBe(0);
  });

  it("scores comfort from dew point (mugginess), with a humidity penalty at extremes", () => {
    const comfort = (w: WeatherData) =>
      scoreBoatDay(deriveMetrics(snapshot({ weather: w }))).subScores.find(
        (s) => s.key === "comfort",
      )!.score;
    expect(comfort({ dewPointF: 58 })).toBe(100);
    expect(comfort({ dewPointF: 68 })).toBe(60);
    expect(comfort({ dewPointF: 75 })).toBe(25);
    expect(comfort({ dewPointF: 65, humidityPct: 95 })).toBe(60);
    expect(comfort({})).toBeNull();
  });

  it("scores air temperature on a comfortable plateau (72-90°F)", () => {
    const air = (f: number) =>
      scoreBoatDay(deriveMetrics(snapshot({ weather: { airTempF: f } })))
        .subScores.find((s) => s.key === "airTemp")!.score!;
    expect(air(72)).toBe(100);
    expect(air(85)).toBe(100);
    expect(air(90)).toBe(100);
    expect(air(60)!).toBeLessThan(100); // chilly
    expect(air(100)!).toBeLessThan(100); // scorching
  });

  describe("tide & inlet sub-score", () => {
    const tideSub = (over: { tides?: TideData | null; buoy?: BuoyData | null }) =>
      scoreBoatDay(deriveMetrics(snapshot(over))).subScores.find((s) => s.key === "tide")!;

    it("rewards a rising/incoming tide and is so-so on a falling tide", () => {
      expect(tideSub({ tides: { next: [], trend: "rising" } }).score).toBe(100);
      expect(tideSub({ tides: { next: [], trend: "falling" } }).score).toBe(60);
    });

    it("drops to 25 for an ebb tide against a stiff east wind (steep inlet chop)", () => {
      // Falling tide + 12 kn from the E (90°) -> the dangerous inlet combination.
      const t = tideSub({
        tides: { next: [], trend: "falling" },
        buoy: { windSpeedMph: 12 * 1.150779, windDirDeg: 90 },
      });
      expect(t.score).toBe(25);
      expect(t.display).toMatch(/ebb against east wind/i);
    });

    it("does not penalize an ebb tide when the wind is light or offshore", () => {
      // Falling but only 5 kn east -> stays at the plain falling score.
      expect(
        tideSub({
          tides: { next: [], trend: "falling" },
          buoy: { windSpeedMph: 5 * 1.150779, windDirDeg: 90 },
        }).score,
      ).toBe(60);
      // Falling with a 15 kn WEST (offshore) wind -> not against the inlet.
      expect(
        tideSub({
          tides: { next: [], trend: "falling" },
          buoy: { windSpeedMph: 15 * 1.150779, windDirDeg: 270 },
        }).score,
      ).toBe(60);
    });

    it("is null (excluded) when the tide trend is unknown", () => {
      expect(tideSub({ tides: { next: [] } }).score).toBeNull();
    });
  });

  it("excludes unavailable inputs from the average", () => {
    const sparse = snapshot({ weather: { airTempF: 80 } });
    const r = computeScore(sparse);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.subScores.some((s) => s.score == null)).toBe(true);
    // Only the airTemp sub-score has data here.
    expect(r.subScores.filter((s) => s.score != null).map((s) => s.key)).toEqual(["airTemp"]);
  });

  it("lands a blustery 20 kn / 5 ft chop in Poor/Fair territory without any cap", () => {
    const rough = snapshot({
      buoy: {
        windSpeedMph: 20 * 1.150779, // ~20 kn
        windDirDeg: 90,
        waveHeightFt: 5,
        dominantPeriodS: 5, // short, steep chop
        waterTempF: 80,
      },
      weather: { airTempF: 82, shortForecast: "Mostly Sunny", precipProbability: 10, dewPointF: 70, visibilityMi: 10 },
      marine: { cloudCoverPct: 30, uvIndex: 7 },
      tides: { next: [], trend: "rising" },
    });
    const r = computeScore(rough);
    // No advisory in effect, no thunder/rain/fog — so no hard cap.
    expect(r.caps).toHaveLength(0);
    // But genuinely unpleasant: choppy and windy => Poor or Fair, never Good.
    expect(r.score).toBeLessThan(65);
    expect(["Poor", "Fair"]).toContain(r.rating);
  });
});

describe("applyBoatCaps (hard safety caps, worst wins)", () => {
  // Start from PERFECT so the raw score is high; each cap must pull it down.
  const withMarine = (events: string[]) =>
    computeScore(snapshot({ ...perfectParts(), nws: marine(...events) }));

  // PERFECT's inputs as plain overrides we can spread into a snapshot.
  function perfectParts() {
    return {
      buoy: PERFECT.buoy.data,
      weather: PERFECT.weather.data,
      marine: PERFECT.marine.data,
      tides: PERFECT.tides.data,
    };
  }

  it("caps a Small Craft Advisory at exactly 45 with its message", () => {
    const r = withMarine(["Small Craft Advisory"]);
    expect(r.score).toBe(45);
    expect(r.caps.join(" ")).toMatch(/small craft advisory/i);
  });

  it("caps a gale warning at 5 (do not go out)", () => {
    const r = withMarine(["Gale Warning"]);
    expect(r.score).toBeLessThanOrEqual(5);
    expect(r.caps.join(" ")).toMatch(/gale or storm warning/i);
  });

  it("caps a storm warning and hurricane-force warning at 5 too", () => {
    expect(withMarine(["Storm Warning"]).score).toBeLessThanOrEqual(5);
    expect(withMarine(["Hurricane Force Wind Warning"]).score).toBeLessThanOrEqual(5);
  });

  it("caps a Hazardous Seas Warning at 5 (a danger-level marine product)", () => {
    expect(withMarine(["Hazardous Seas Warning"]).score).toBeLessThanOrEqual(5);
  });

  it("caps a Special Marine Warning at 15", () => {
    const r = withMarine(["Special Marine Warning"]);
    expect(r.score).toBeLessThanOrEqual(15);
    expect(r.caps.join(" ")).toMatch(/severe thunderstorm over the water/i);
  });

  it("caps a severe LAND warning at 10", () => {
    const r = computeScore(
      snapshot({
        ...perfectParts(),
        nws: { alerts: [{ event: "Hurricane Warning", severity: "Extreme" }], marineAlerts: [] },
      }),
    );
    expect(r.score).toBeLessThanOrEqual(10);
    expect(r.caps.join(" ")).toMatch(/severe weather warning/i);
  });

  it("caps lightning within 10 miles at 15", () => {
    const r = computeScore(
      snapshot({
        ...perfectParts(),
        lightning: { windowMinutes: 30, within10mi: 2, within25mi: 4, within50mi: 6, totalInArea: 6 } as LightningData,
      }),
    );
    expect(r.score).toBeLessThanOrEqual(15);
    expect(r.caps.join(" ")).toMatch(/lightning within 10 miles/i);
  });

  it("caps lightning within 25 miles at 40 (but not the closer-strike message)", () => {
    const r = computeScore(
      snapshot({
        ...perfectParts(),
        lightning: { windowMinutes: 30, within10mi: 0, within25mi: 3, within50mi: 5, totalInArea: 5 } as LightningData,
      }),
    );
    expect(r.score).toBeLessThanOrEqual(40);
    expect(r.caps.join(" ")).toMatch(/lightning in the area/i);
    expect(r.caps.join(" ")).not.toMatch(/within 10 miles/i);
  });

  it("caps a WMO 95 thunderstorm at 20", () => {
    // Drive the cap via an hourly Derived (weatherCode path).
    const r = scoreBoatDay({
      ...deriveMetrics(snapshot(perfectParts())),
      weatherCode: 95,
      shortForecast: "Thunderstorm",
    });
    expect(r.score).toBeLessThanOrEqual(20);
    expect(r.caps.join(" ")).toMatch(/thunderstorms in the forecast/i);
  });

  it("caps steady rain at 40", () => {
    const r = scoreBoatDay({
      ...deriveMetrics(snapshot(perfectParts())),
      weatherCode: 63, // moderate rain
      shortForecast: "Rain",
    });
    expect(r.score).toBeLessThanOrEqual(40);
    expect(r.caps.join(" ")).toMatch(/rain in the forecast/i);
  });

  it("caps dense fog / sub-1-mile visibility at 30", () => {
    // Via the marine Dense Fog Advisory.
    const advisory = withMarine(["Dense Fog Advisory"]);
    expect(advisory.score).toBeLessThanOrEqual(30);
    expect(advisory.caps.join(" ")).toMatch(/dense fog/i);

    // Via measured visibility under a mile (0.7 mi).
    const lowVis = computeScore(
      snapshot({
        ...perfectParts(),
        weather: { ...PERFECT.weather.data, visibilityMi: 0.7 },
      }),
    );
    expect(lowVis.score).toBeLessThanOrEqual(30);
    expect(lowVis.caps.join(" ")).toMatch(/dense fog|visibility/i);
  });

  it("caps rough seas (>= 6 ft) at 35", () => {
    const r = computeScore(
      snapshot({
        ...perfectParts(),
        buoy: { ...PERFECT.buoy.data, waveHeightFt: 6.5 },
      }),
    );
    expect(r.score).toBeLessThanOrEqual(35);
    expect(r.caps.join(" ")).toMatch(/rough seas/i);
  });

  it("worst cap wins when several apply at once", () => {
    // Small Craft Advisory (45) + gale warning (5) -> 5 wins, both surfaced.
    const r = withMarine(["Small Craft Advisory", "Gale Warning"]);
    expect(r.score).toBeLessThanOrEqual(5);
    expect(r.caps.join(" ")).toMatch(/small craft advisory/i);
    expect(r.caps.join(" ")).toMatch(/gale or storm warning/i);
  });
});

describe("rainSeverity", () => {
  const sev = (over: Partial<Parameters<typeof rainSeverity>[0]>) =>
    rainSeverity({
      smallCraftAdvisory: false,
      specialMarineWarning: false,
      severeMarineWarning: false,
      denseFogAdvisory: false,
      severeAlert: false,
      lightningWithin10mi: 0,
      lightningWithin25mi: 0,
      ...over,
    });

  it("classifies by WMO weather code", () => {
    for (const c of [51, 61, 66, 80, 82]) expect(sev({ weatherCode: c })).toBe("rain");
    for (const c of [95, 96, 99]) expect(sev({ weatherCode: c })).toBe("thunder");
    for (const c of [0, 2, 3, 71, 85]) expect(sev({ weatherCode: c })).toBe("none");
  });

  it("falls back to text but ignores hedged 'chance' wording", () => {
    expect(sev({ shortForecast: "Rain" })).toBe("rain");
    expect(sev({ shortForecast: "Heavy Thunderstorm" })).toBe("thunder");
    expect(sev({ shortForecast: "Chance of Rain" })).toBe("none");
    expect(sev({ shortForecast: "Slight Chance Showers" })).toBe("none");
    expect(sev({ shortForecast: "Sunny" })).toBe("none");
  });

  it("prefers the WMO code over the text when both are present", () => {
    expect(sev({ weatherCode: 0, shortForecast: "Rain" })).toBe("none");
  });
});

describe("computeHourlyScores", () => {
  // Boca 2026-06-01: sunrise ~6:27 AM EDT (10:27Z), sunset ~8:08 PM EDT (00:08Z next day).
  const SUN: SunData = {
    date: "2026-06-01",
    sunrise: "2026-06-01T10:27:00.000Z",
    sunset: "2026-06-02T00:08:00.000Z",
  };

  // 48h of clear, calm boating weather starting 2026-06-01T00:00Z.
  function hourlyDay(): HourlyMetrics[] {
    const start = Date.parse("2026-06-01T00:00:00.000Z");
    return Array.from({ length: 48 }, (_, i) => ({
      time: new Date(start + i * 3_600_000).toISOString(),
      airTempF: 82,
      cloudCoverPct: 10,
      precipProbability: 0,
      weatherCode: 0,
      windSpeedMph: 6,
      windDirDeg: 90,
      uvIndex: 5,
      visibilityMi: 10,
      shortForecast: "Clear",
      emoji: "☀️",
    }));
  }

  const nyHour = (iso: string) =>
    Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/New_York",
        hour: "2-digit",
        hour12: false,
      }).format(new Date(iso)),
    );

  const niceBase = {
    buoy: { waterTempF: 82, waveHeightFt: 1, dominantPeriodS: 9 } as BuoyData,
    marine: { uvIndex: 6, cloudCoverPct: 5 } as MarineData,
    tides: { next: [], trend: "rising" as const } as TideData,
  };

  it("returns [] when hourly data is unavailable", () => {
    expect(computeHourlyScores(snapshot({ ...niceBase, sun: SUN }))).toEqual([]);
  });

  it("bounds the forecast to daylight hours in the local timezone", () => {
    const hrs = computeHourlyScores(snapshot({ ...niceBase, hourly: hourlyDay(), sun: SUN }));
    const hours = hrs.map((h) => nyHour(h.time));
    expect(hrs.length).toBeGreaterThan(8);
    expect(Math.min(...hours)).toBe(6); // sunrise hour (6 AM EDT)
    expect(Math.max(...hours)).toBe(20); // last hour <= sunset (8 PM EDT)
    expect(hours.every((h) => h >= 6 && h <= 20)).toBe(true);
  });

  it("carries day-constant marine alerts into every forecast hour (SCA cap 45)", () => {
    const hrs = computeHourlyScores(
      snapshot({ ...niceBase, nws: marine("Small Craft Advisory"), hourly: hourlyDay(), sun: SUN }),
    );
    expect(hrs.length).toBeGreaterThan(0);
    expect(hrs.every((h) => h.score <= 45)).toBe(true);
  });

  it("carries day-constant lightning into every forecast hour (within-10 cap 15)", () => {
    const hrs = computeHourlyScores(
      snapshot({
        ...niceBase,
        lightning: { windowMinutes: 30, within10mi: 1, within25mi: 3, within50mi: 4, totalInArea: 4 } as LightningData,
        hourly: hourlyDay(),
        sun: SUN,
      }),
    );
    expect(hrs.length).toBeGreaterThan(0);
    expect(hrs.every((h) => h.score <= 15)).toBe(true);
  });

  it("caps a stormy hour to ~20 and flags it as raining", () => {
    const rows = hourlyDay();
    const idx = rows.findIndex((r) => r.time === "2026-06-01T14:00:00.000Z"); // 10 AM EDT
    rows[idx] = { ...rows[idx], weatherCode: 95, shortForecast: "Thunderstorm", emoji: "⛈️" };
    const hrs = computeHourlyScores(snapshot({ ...niceBase, hourly: rows, sun: SUN }));
    const stormy = hrs.find((h) => new Date(h.time).getUTCHours() === 14)!;
    expect(stormy.score).toBeLessThanOrEqual(20);
    expect(stormy.raining).toBe(true);
    const clear = hrs.find((h) => new Date(h.time).getUTCHours() === 15)!;
    expect(clear.raining).toBe(false);
    expect(clear.score).toBeGreaterThan(20);
  });

  it("gives the calm clear hours a strong, uncapped score", () => {
    const hrs = computeHourlyScores(snapshot({ ...niceBase, hourly: hourlyDay(), sun: SUN }));
    // A 6 mph (≈5 kn), 1 ft, clear, 10 mi-vis hour should rate Excellent.
    expect(hrs.every((h) => h.score >= 80)).toBe(true);
  });
});

describe("bestBoatWindow", () => {
  const h = (hour: number, score: number): HourlyScore => ({
    time: `2026-06-03T${String(hour).padStart(2, "0")}:00:00Z`,
    score,
    rating: "x",
    emoji: "",
    raining: false,
  });

  it("finds the longest contiguous run within 8 of the day's peak", () => {
    const w = bestBoatWindow([
      h(8, 40),
      h(9, 55),
      h(10, 80),
      h(11, 82),
      h(12, 78),
      h(13, 50),
      h(14, 84),
    ])!;
    expect(w.startIso).toBe("2026-06-03T10:00:00Z");
    expect(w.endIso).toBe("2026-06-03T13:00:00.000Z"); // last hour (12:00) + 1h
    expect(w.score).toBe(82);
  });

  it("returns null with no hours", () => {
    expect(bestBoatWindow([])).toBeNull();
  });
});
