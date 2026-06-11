import { describe, it, expect } from "vitest";
import {
  byHourFromHistory,
  levelFromBoats,
  parseBoatFeed,
  predictTraffic,
  type BoatFeed,
} from "@/lib/sources/boatTraffic";

const TZ = "America/New_York";

describe("parseBoatFeed", () => {
  it("pulls latest + history out of the published feed", () => {
    const json: BoatFeed = {
      latest: { capturedAtLocal: "2026-06-13T15:00:00-04:00", totalBoats: 12, level: "busy" },
      history: [{ t: "2026-06-13T15:00:00-04:00", hour: 15, boats: 12, level: "busy" }],
    };
    const { latest, history } = parseBoatFeed(json);
    expect(latest?.totalBoats).toBe(12);
    expect(history).toHaveLength(1);
  });

  it("degrades gracefully on missing or junk input", () => {
    expect(parseBoatFeed(null)).toEqual({ latest: null, history: [] });
    expect(parseBoatFeed({})).toEqual({ latest: null, history: [] });
    expect(parseBoatFeed({ history: "nope" } as unknown)).toEqual({ latest: null, history: [] });
  });
});

describe("levelFromBoats", () => {
  it("maps per-view counts to the shared level bands", () => {
    expect(levelFromBoats(0)).toBe("quiet");
    expect(levelFromBoats(1)).toBe("quiet");
    expect(levelFromBoats(2)).toBe("light");
    expect(levelFromBoats(4)).toBe("light");
    expect(levelFromBoats(5)).toBe("moderate");
    expect(levelFromBoats(9)).toBe("moderate");
    expect(levelFromBoats(10)).toBe("busy");
    expect(levelFromBoats(19)).toBe("busy");
    expect(levelFromBoats(20)).toBe("packed");
    expect(levelFromBoats(50)).toBe("packed");
  });
});

describe("byHourFromHistory", () => {
  it("averages boats per local hour and only keeps hours with >= 2 samples", () => {
    const out = byHourFromHistory([
      { hour: 9, boats: 2, level: "light" },
      { hour: 9, boats: 6, level: "moderate" }, // avg 4 -> light
      { hour: 14, boats: 24, level: "packed" }, // single sample -> dropped
    ]);
    expect(out).toHaveLength(1);
    expect(out![0]).toMatchObject({ hour: 9, boats: 4, level: "light", samples: 2 });
  });

  it("falls back to the level rank when counts are absent, sorts by hour", () => {
    const out = byHourFromHistory([
      { hour: 16, level: "busy" },
      { hour: 16, level: "packed" }, // rank (3+4)/2=3.5 -> packed
      { hour: 8, level: "quiet" },
      { hour: 8, level: "light" }, // rank (0+1)/2=0.5 -> light
    ]);
    expect(out!.map((b) => b.hour)).toEqual([8, 16]);
    expect(out!.find((b) => b.hour === 8)).toMatchObject({ level: "light", samples: 2 });
    expect(out!.find((b) => b.hour === 16)).toMatchObject({ level: "packed", samples: 2 });
  });

  it("returns undefined when no hour clears the sample threshold", () => {
    expect(byHourFromHistory([])).toBeUndefined();
    expect(byHourFromHistory([{ hour: 10, boats: 3 }])).toBeUndefined();
  });
});

describe("predictTraffic (deterministic calendar model)", () => {
  // Helper: an ISO instant that lands on a known LOCAL wall-clock hour in EDT.
  // EDT is UTC-4 in summer, so local hour h => UTC hour h+4 (rolling past midnight
  // into the next UTC day when needed).
  const at = (dateLocal: string, hour: number) =>
    new Date(Date.parse(`${dateLocal}T00:30:00.000Z`) + (hour + 4) * 3_600_000);

  it("is quiet overnight on weekdays", () => {
    // 2026-06-15 is a Monday; 3 AM and 11 PM local -> quiet.
    expect(predictTraffic(at("2026-06-15", 3), TZ).level).toBe("quiet");
    expect(predictTraffic(at("2026-06-15", 23), TZ).level).toBe("quiet");
    // The weekend bump still applies overnight (quiet base + 1 = light).
    expect(predictTraffic(at("2026-06-13", 3), TZ).level).toBe("light");
  });

  it("ramps through the weekday daypart curve", () => {
    // 2026-06-15 is a Monday.
    expect(predictTraffic(at("2026-06-15", 7), TZ).level).toBe("light"); // 6-8 morning
    expect(predictTraffic(at("2026-06-15", 10), TZ).level).toBe("moderate"); // 9-10
    expect(predictTraffic(at("2026-06-15", 14), TZ).level).toBe("moderate"); // 11-16
    expect(predictTraffic(at("2026-06-15", 18), TZ).level).toBe("light"); // 17-19
  });

  it("bumps one level on weekends", () => {
    // 2026-06-13 is a Saturday; a morning hour (light) bumps to moderate.
    expect(predictTraffic(at("2026-06-13", 7), TZ).level).toBe("moderate");
  });

  it("bumps a SECOND level on summer weekend afternoons (sandbar Saturdays)", () => {
    // Saturday June 13, 2 PM local: base moderate(2) + weekend(+1) + summer-afternoon(+1) = packed.
    expect(predictTraffic(at("2026-06-13", 14), TZ).level).toBe("packed");
    // Sunday afternoon in July is packed too.
    expect(predictTraffic(at("2026-07-12", 14), TZ).level).toBe("packed");
  });

  it("does NOT apply the summer-afternoon bump outside May-September", () => {
    // Saturday Jan 10, 2026, 2:30 PM local (EST = UTC-5): base moderate(2) + weekend(+1)
    // = busy, but the summer bump does NOT fire, so it stops at busy (not packed).
    const jan = predictTraffic(new Date("2026-01-10T19:30:00.000Z"), TZ);
    expect(jan.level).toBe("busy");
    expect(jan.note).toBe("typical for a Saturday afternoon in January");
  });

  it("writes a plain-English note with weekday, daypart, and month", () => {
    const r = predictTraffic(at("2026-06-13", 14), TZ);
    expect(r.note).toBe("typical for a Saturday afternoon in June");
  });
});
