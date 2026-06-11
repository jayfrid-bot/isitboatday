import type { Location, LocationPublic } from "@/lib/types";

/**
 * The whole multi-town design lives here: adding a boating town = adding one entry.
 * Everything downstream (data fetching, scoring, routing, UI) is driven off this list.
 *
 * To add a town you need: lat/lon (at the inlet/marina), the nearest NOAA tide
 * station id, the nearest NDBC buoy id, the NWS coastal marine forecast zone id
 * (for boater warnings), and its cams.
 */
export const LOCATIONS: Location[] = [
  {
    slug: "boca-raton",
    name: "Boca Raton",
    region: "Palm Beach County, FL",
    lat: 26.3587,
    lon: -80.0686,
    timezone: "America/New_York",
    noaaTideStationId: "8722816", // Boca Raton
    noaaTideStationFallbackId: "8722670", // Lake Worth Pier
    ndbcBuoyId: "LKWF1", // Lake Worth Pier C-MAN (nearest)
    ndbcBuoyFallbackId: "FWYF1", // Fowey Rocks
    // NWS coastal waters from Jupiter Inlet to Deerfield Beach FL out 20 NM —
    // the offshore zone Boca's inlet opens into; drives the marine warnings.
    nwsMarineZoneId: "AMZ650",

    // Cams ordered for boaters: the inlet and Lake Boca come first — you check
    // the inlet channel and the staging basin before you ever leave the dock.
    cams: [
      {
        // Live still resolved from video-monitoring.com's latest.json (view s4 =
        // the main inlet shot), proxied same-origin via /api/cam/boca-inlet.
        // The money shot: how the inlet mouth looks before you commit to it.
        id: "boca-inlet",
        name: "Boca Raton Inlet Cam",
        provider: "Palm Beach County ERM / video-monitoring.com",
        embedType: "image",
        url: "https://video-monitoring.com/beachcams/bocainlet/",
        snapshotFeed: {
          base: "http://video-monitoring.com/beachcams/bocainlet",
          view: "s4",
        },
        attribution: "Live still courtesy Palm Beach County ERM / video-monitoring.com",
        lat: 26.3354,
        lon: -80.0703,
      },
      {
        // Same bocainlet feed, view s12 = the rock jetty / inlet channel — the
        // tell for channel chop: ebb tide against an east wind stacks up here.
        id: "boca-inlet-jetty",
        name: "Boca Raton Inlet — Jetty",
        provider: "Palm Beach County ERM / video-monitoring.com",
        embedType: "image",
        url: "https://video-monitoring.com/beachcams/bocainlet/",
        snapshotFeed: {
          base: "http://video-monitoring.com/beachcams/bocainlet",
          view: "s12",
        },
        attribution: "Live still courtesy Palm Beach County ERM / video-monitoring.com",
        lat: 26.3354,
        lon: -80.0703,
      },
      {
        // Same bocainlet feed, view s16 = surf & shoreline just outside the
        // mouth — the swell you'll punch through clearing the inlet.
        id: "boca-inlet-surf",
        name: "Boca Raton Inlet — Surf & Shoreline",
        provider: "Palm Beach County ERM / video-monitoring.com",
        embedType: "image",
        url: "https://video-monitoring.com/beachcams/bocainlet/",
        snapshotFeed: {
          base: "http://video-monitoring.com/beachcams/bocainlet",
          view: "s16",
        },
        attribution: "Live still courtesy Palm Beach County ERM / video-monitoring.com",
        lat: 26.3354,
        lon: -80.0703,
      },
      {
        // Same bocainlet feed, view s8 = the north side of the inlet & beach.
        id: "boca-inlet-north",
        name: "Boca Raton Inlet — North Side",
        provider: "Palm Beach County ERM / video-monitoring.com",
        embedType: "image",
        url: "https://video-monitoring.com/beachcams/bocainlet/",
        snapshotFeed: {
          base: "http://video-monitoring.com/beachcams/bocainlet",
          view: "s8",
        },
        attribution: "Live still courtesy Palm Beach County ERM / video-monitoring.com",
        lat: 26.3354,
        lon: -80.0703,
      },
      {
        // Live still at most_recent_image.php looking over Lake Boca Raton —
        // the staging basin where boats raft up; a quick read on wind on the
        // water before you head for the inlet. Proxied via /api/cam/lake-boca.
        id: "lake-boca",
        name: "Lake Boca Cam",
        provider: "lakebocacam.com",
        embedType: "image",
        url: "http://lakebocacam.com/",
        snapshotUrl: "http://lakebocacam.com/most_recent_image.php",
        attribution: "Live still courtesy lakebocacam.com",
        lat: 26.3387,
        lon: -80.0716,
      },
      {
        // view s4 = "Main Shot" on video-monitoring.com/beachcams/boca/ — the
        // open-ocean look just south of the inlet (sea state offshore).
        id: "boca-south",
        name: "Boca Raton South Beach Cam",
        provider: "Palm Beach County ERM / video-monitoring.com",
        embedType: "image",
        url: "https://video-monitoring.com/beachcams/boca/",
        snapshotFeed: {
          base: "http://video-monitoring.com/beachcams/boca",
          view: "s4",
        },
        attribution: "Live still courtesy Palm Beach County ERM / video-monitoring.com",
        lat: 26.3456,
        lon: -80.0701,
      },
      {
        // Same boca feed, view s11 = the close shoreline & surf south of the inlet.
        id: "boca-south-surf",
        name: "Boca Raton South Beach — Shoreline & Surf",
        provider: "Palm Beach County ERM / video-monitoring.com",
        embedType: "image",
        url: "https://video-monitoring.com/beachcams/boca/",
        snapshotFeed: {
          base: "http://video-monitoring.com/beachcams/boca",
          view: "s11",
        },
        attribution: "Live still courtesy Palm Beach County ERM / video-monitoring.com",
        lat: 26.3456,
        lon: -80.0701,
      },
      {
        // bocasurfcam.com publishes a fresh full-res JPEG at most_recent_image.php;
        // proxied via /api/cam/boca-surf so it serves same-origin over https.
        id: "boca-surf",
        name: "Boca Surf Cam",
        provider: "bocasurfcam.com",
        embedType: "image",
        url: "http://www.bocasurfcam.com/",
        snapshotUrl: "http://bocasurfcam.com/most_recent_image.php",
        attribution: "Live still courtesy bocasurfcam.com",
        lat: 26.3492,
        lon: -80.0701,
      },
    ],
  },
];

export function listLocations(): Location[] {
  return LOCATIONS;
}

export function getLocation(slug: string): Location | undefined {
  return LOCATIONS.find((l) => l.slug === slug);
}

export function toPublicLocation(l: Location): LocationPublic {
  return {
    slug: l.slug,
    name: l.name,
    region: l.region,
    lat: l.lat,
    lon: l.lon,
    timezone: l.timezone,
  };
}
