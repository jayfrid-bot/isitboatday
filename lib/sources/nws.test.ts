import { describe, it, expect } from "vitest";
import { parseAlerts } from "@/lib/sources/nws";

describe("parseAlerts", () => {
  it("maps active alerts to event/severity/headline/ends", () => {
    const a = parseAlerts({
      features: [
        {
          properties: {
            event: "Hurricane Warning",
            severity: "Extreme",
            headline: "Hurricane Warning until Friday",
            ends: "2026-06-05T20:00:00-04:00",
          },
        },
        { properties: { event: "Heat Advisory", severity: "Minor" } },
        { properties: {} }, // no event -> dropped
      ],
    });
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ event: "Hurricane Warning", severity: "Extreme" });
    expect(a[1].event).toBe("Heat Advisory");
  });

  it("falls back to `expires` when `ends` is absent", () => {
    const a = parseAlerts({
      features: [
        {
          properties: {
            event: "Small Craft Advisory",
            severity: "Minor",
            expires: "2026-06-12T20:00:00-04:00",
          },
        },
      ],
    });
    expect(a[0].ends).toBe("2026-06-12T20:00:00-04:00");
  });

  it("parses a marine-zone Small Craft Advisory into the compact shape", () => {
    // Mirrors a real api.weather.gov/alerts/active?zone=AMZ650 GeoJSON feature.
    const a = parseAlerts({
      features: [
        {
          properties: {
            event: "Small Craft Advisory",
            severity: "Minor",
            headline:
              "Small Craft Advisory issued June 11 at 3:41AM EDT until June 12 at 8:00PM EDT by NWS Miami FL",
            ends: "2026-06-12T20:00:00-04:00",
            expires: "2026-06-11T15:45:00-04:00",
          },
        },
      ],
    });
    expect(a).toHaveLength(1);
    expect(a[0]).toEqual({
      event: "Small Craft Advisory",
      severity: "Minor",
      headline:
        "Small Craft Advisory issued June 11 at 3:41AM EDT until June 12 at 8:00PM EDT by NWS Miami FL",
      ends: "2026-06-12T20:00:00-04:00", // `ends` preferred over `expires`
    });
  });

  it("returns an empty list when there are no features", () => {
    expect(parseAlerts({})).toEqual([]);
    expect(parseAlerts({ features: [] })).toEqual([]);
  });
});
