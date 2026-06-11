#!/usr/bin/env python3
"""
Count BOATS on the water from the Boca Inlet + Lake Boca webcams using a
FALLBACK CHAIN of free vision APIs. Runs OFF Netlify in a GitHub Action; writes a
tiny boat_traffic.json the web app reads. Pure stdlib (urllib/base64/json/zoneinfo).

ZERO-SECRETS DEFAULT: the chain leads with `github` (GitHub Models), which in CI
authenticates with the job's own GITHUB_TOKEN once the workflow grants
`permissions: models: read`. That means this job works out of the box with NO
API keys to manage — github is the only guaranteed provider. The others
(gemini/groq/openrouter) light up automatically if you ever add their keys, with
no code change. With NO provider configured at all, the script preserves the
previously published feed and exits 0 (never blanks the feed).

Reliability: each image is tried against each configured provider in order until
one answers, so one provider being rate-limited/down doesn't blank the feed. Free
vision APIs return 429 (quota) / 5xx (overload) under load; both are usually
transient, so we retry with exponential backoff and space the per-cam calls.

Three cameras feed the read:
  - "Boca Inlet — main"          video-monitoring feed, view s4
  - "Boca Inlet — jetty channel" video-monitoring feed, view s12
  - "Lake Boca sandbar"          direct still (lakebocacam.com)

The OVERALL level is the WORST cam level (Lake Boca sandbar raft-ups dominate the
boat-day signal), matching the shared level semantics the app codes to.
"""
import base64
import datetime as dt
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")  # 2.0-flash has no free tier
OUT = os.environ.get("BOAT_TRAFFIC_OUT", "boat_traffic.json")
TZ = ZoneInfo(os.environ.get("CAM_TZ", "America/New_York"))

# Free vision APIs return 429 (quota/rate) and 503 (overloaded) under load; both
# are usually transient, so we retry with exponential backoff. We also space the
# per-cam calls so a burst doesn't trip a per-minute limit.
RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_RETRIES = int(os.environ.get("GEMINI_RETRIES", "3"))
CAM_GAP_S = float(os.environ.get("CAM_GAP", "5"))
# api.groq.com sits behind Cloudflare, which blocks the default "Python-urllib"
# User-Agent with a 403 (error 1010). Send a normal browser UA so API calls go
# through. Other providers ignore the UA, so one value is safe everywhere.
HTTP_UA = os.environ.get(
    "HTTP_UA",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
)

# --- vision providers ------------------------------------------------------
# Reliability comes from a FALLBACK CHAIN: try each configured provider in order
# until one returns a valid reading. A provider is "configured" only if its key is
# present. The DEFAULT order leads with github (GitHub Models) because in CI it
# uses the job's own GITHUB_TOKEN — no signup, no secret to manage. The rest are
# OpenAI chat-compatible (image as a base64 data URI), so they share one adapter.
# Free tiers (mid-2026):
#   github      GITHUB_MODELS_TOKEN  ~50 req/day   (uses the Action's own token)
#   gemini      GEMINI_API_KEY       ~250 req/day  (Google AI Studio)
#   groq        GROQ_API_KEY         ~14,400/day   (Llama 4 Scout; no credit card)
#   openrouter  OPENROUTER_API_KEY   ~20 req/min   (many :free vision models)
# Override the order with VISION_PROVIDERS="gemini,github,groq,openrouter".
PROVIDER_ORDER = [
    p.strip()
    for p in os.environ.get("VISION_PROVIDERS", "github,gemini,groq,openrouter").split(",")
    if p.strip()
]
OPENAI_PROVIDERS = {
    "groq": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "model": os.environ.get("GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct"),
        "key": os.environ.get("GROQ_API_KEY", "").strip(),
    },
    "openrouter": {
        "url": "https://openrouter.ai/api/v1/chat/completions",
        "model": os.environ.get(
            "OPENROUTER_MODEL", "meta-llama/llama-3.2-11b-vision-instruct:free"
        ),
        "key": os.environ.get("OPENROUTER_API_KEY", "").strip(),
    },
    "github": {
        # GitHub Models — free with a token that has `models: read`. In Actions the
        # job's GITHUB_TOKEN works once `permissions: models: read` is set, so this
        # is the zero-secrets default provider.
        "url": os.environ.get(
            "GITHUB_MODELS_URL", "https://models.github.ai/inference/chat/completions"
        ),
        "model": os.environ.get("GITHUB_MODELS_MODEL", "openai/gpt-4o-mini"),
        "key": (os.environ.get("GITHUB_MODELS_TOKEN", "").strip()
                or os.environ.get("GITHUB_TOKEN", "").strip()),
    },
}

# The currently published feed — we MERGE the new reading into its rolling history
# before re-publishing, so the by-hour pattern accumulates over time.
PREV_URL = os.environ.get(
    "BOAT_TRAFFIC_PREV_URL",
    "https://raw.githubusercontent.com/jayfrid-bot/isitboatday/boat-traffic-data/boat_traffic.json",
)

CAMS = [
    {"id": "boca-inlet-main", "name": "Boca Inlet — main",
     "feed": "http://video-monitoring.com/beachcams/bocainlet", "view": "s4"},
    {"id": "boca-inlet-jetty", "name": "Boca Inlet — jetty channel",
     "feed": "http://video-monitoring.com/beachcams/bocainlet", "view": "s12"},
    # Lake Boca sandbar — direct still. Weekend raft-ups here dominate the level.
    {"id": "lake-boca-sandbar", "name": "Lake Boca sandbar",
     "still": "http://lakebocacam.com/most_recent_image.php"},
]

# Shared level semantics — per-VIEW boat counts map to a category. The overall
# level is the WORST cam level (a packed sandbar makes for a packed boat day even
# if the inlet is quiet).
LEVELS = ("quiet", "light", "moderate", "busy", "packed")
LEVEL_RANK = {lv: i for i, lv in enumerate(LEVELS)}
MAX_HISTORY = 480  # rolling raw reads (~1+ month) the app derives by-hour from


def level_for_count(n: int) -> str:
    """Map a per-view boat count to a level: 0-1 quiet ... 20+ packed."""
    if n <= 1:
        return "quiet"
    if n <= 4:
        return "light"
    if n <= 9:
        return "moderate"
    if n <= 19:
        return "busy"
    return "packed"


PROMPT = (
    "This is a live webcam photo of a boating waterway (an ocean inlet or a lake "
    "sandbar in Boca Raton, Florida). Count the BOATS visible ON THE WATER. "
    "Return strict JSON only: "
    '{"boats":<integer>,"underway":<integer>,"anchored":<integer>,'
    '"level":"quiet|light|moderate|busy|packed","note":"<=10 words"}. '
    "Count ONLY boats floating on the water. IGNORE boats that are docked at a "
    "pier, in dry-storage racks, or on trailers, and IGNORE paddleboards, kayaks, "
    "and swimmers. underway = boats moving / making a wake. anchored = boats "
    "anchored, moored, rafted together, or drifting (not moving). boats should "
    "equal underway + anchored. "
    "level by total boats on the water: 0-1=quiet, 2-4=light, 5-9=moderate, "
    "10-19=busy, 20+=packed. "
    "note = a short plain-English observation, e.g. 'raft-up forming on the sandbar' "
    "or 'one boat heading out the inlet'."
)


def _get(url: str, timeout: int = 25) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "isitboatday"})
    return urllib.request.urlopen(req, timeout=timeout).read()


def fetch_still(cam: dict) -> bytes:
    """Grab the latest still for a cam.

    Direct-still cams expose one URL. video-monitoring feeds publish a tiny
    latest.json mapping each view (s4, s12, ...) to its most-recent image under
    the key `mr`, so we resolve that first then fetch the named frame.
    """
    if cam.get("still"):
        return _get(cam["still"])
    feed = json.loads(_get(f"{cam['feed']}/latest.json").decode("utf-8", "replace"))
    return _get(f"{cam['feed']}/{feed[cam['view']]['mr']}")


def _post(url: str, body: bytes, headers: dict | None = None, timeout: int = 40) -> bytes:
    """POST JSON, retrying transient quota (429) / overload (5xx) with backoff."""
    hdrs = {"Content-Type": "application/json", "User-Agent": HTTP_UA, **(headers or {})}
    delay = 2.0
    for attempt in range(MAX_RETRIES + 1):
        req = urllib.request.Request(url, data=body, headers=hdrs)
        try:
            return urllib.request.urlopen(req, timeout=timeout).read()
        except urllib.error.HTTPError as e:
            # Surface the provider's error detail (e.g. API_KEY_INVALID vs quota).
            detail = e.read().decode("utf-8", "replace")[:200]
            if e.code in RETRY_STATUSES and attempt < MAX_RETRIES:
                time.sleep(delay + random.uniform(0, 0.75))
                delay *= 2.2
                continue
            raise RuntimeError(f"HTTP {e.code}: {detail}") from None
        except urllib.error.URLError as e:
            if attempt < MAX_RETRIES:
                time.sleep(delay + random.uniform(0, 0.75))
                delay *= 2.2
                continue
            raise RuntimeError(f"network error: {e}") from None
    raise RuntimeError("unreachable")  # pragma: no cover


def _extract_json(text: str) -> dict:
    """Parse a model's text reply into JSON, tolerating ```json fences / prose."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\s*", "", t).rstrip("`").strip()
    i, j = t.find("{"), t.rfind("}")
    if i != -1 and j > i:
        t = t[i : j + 1]
    return json.loads(t)


def _int(v: object) -> int | None:
    """A non-negative integer, or None when missing/invalid."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return max(0, int(round(v)))


def _parse_out(out: dict) -> dict:
    """Validate a raw model reply and normalize to our per-cam reading shape.

    We trust the model's boat count and re-derive the level from it (per the
    shared semantics) so the level is always consistent with the count, even if
    the model's own `level` field drifts.
    """
    boats = _int(out.get("boats"))
    if boats is None:
        raise ValueError(f"bad boats: {out.get('boats')!r}")
    underway = _int(out.get("underway"))
    anchored = _int(out.get("anchored"))
    return {
        "boats": boats,
        "underway": underway,
        "anchored": anchored,
        "level": level_for_count(boats),  # re-derived from the count, not trusted raw
        "note": str(out.get("note", ""))[:80],
    }


def _gemini_out(img: bytes) -> dict:
    body = json.dumps({
        "contents": [{"parts": [
            {"text": PROMPT},
            {"inline_data": {"mime_type": "image/jpeg",
                             "data": base64.b64encode(img).decode()}},
        ]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }).encode()
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{MODEL}:generateContent?key={API_KEY}")
    resp = json.loads(_post(url, body))
    return _extract_json(resp["candidates"][0]["content"]["parts"][0]["text"])


def _openai_out(cfg: dict, img: bytes) -> dict:
    """One adapter for every OpenAI chat-compatible vision API (GitHub/Groq/OpenRouter)."""
    data_uri = "data:image/jpeg;base64," + base64.b64encode(img).decode()
    body = json.dumps({
        "model": cfg["model"],
        "temperature": 0,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": data_uri}},
        ]}],
    }).encode()
    resp = json.loads(_post(cfg["url"], body, headers={"Authorization": f"Bearer {cfg['key']}"}))
    return _extract_json(resp["choices"][0]["message"]["content"])


def _enabled_providers() -> list[tuple[str, str]]:
    """[(name, model)] for each configured provider, in fallback order."""
    out = []
    for name in PROVIDER_ORDER:
        if name == "gemini":
            if API_KEY:
                out.append((name, MODEL))
        elif name in OPENAI_PROVIDERS and OPENAI_PROVIDERS[name]["key"]:
            out.append((name, OPENAI_PROVIDERS[name]["model"]))
    return out


def assess_with(name: str, img: bytes) -> dict:
    """Read one image with exactly ONE named provider (for per-provider eval)."""
    if name == "gemini":
        if not API_KEY:
            raise RuntimeError("gemini not configured")
        raw, model = _gemini_out(img), MODEL
    else:
        cfg = OPENAI_PROVIDERS.get(name)
        if not cfg or not cfg["key"]:
            raise RuntimeError(f"{name} not configured")
        raw, model = _openai_out(cfg, img), cfg["model"]
    result = _parse_out(raw)
    result["provider"] = name
    result["model"] = model
    return result


def assess(img: bytes) -> dict:
    """Read one image, falling through the provider chain until one succeeds."""
    errors = []
    for name, _model in _enabled_providers():
        try:
            return assess_with(name, img)
        except Exception as e:  # noqa: BLE001 — try the next provider
            errors.append(f"{name}: {e}")
    if not errors:
        raise RuntimeError("no vision providers configured (set GITHUB_MODELS_TOKEN/"
                           "GITHUB_TOKEN or another key)")
    raise RuntimeError("all vision providers failed -> " + " | ".join(errors))


def worst_level(cams: list[dict]) -> dict | None:
    """The overall reading = the WORST cam level (sandbar raft-ups dominate).

    Returns the busiest cam's {level, boats, underway, anchored, note}. Ties on
    level are broken by the higher boat count.
    """
    valid = [c for c in cams if c.get("level") in LEVEL_RANK]
    if not valid:
        return None
    b = max(valid, key=lambda c: (LEVEL_RANK[c["level"]], c.get("boats") or -1))
    return {
        "level": b["level"],
        "boats": b.get("boats"),
        "underway": b.get("underway"),
        "anchored": b.get("anchored"),
        "note": b.get("note") or None,
    }


def fetch_prev() -> dict:
    """Fetch the currently published feed so we can merge into its history."""
    try:
        return json.loads(_get(PREV_URL).decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001
        return {}


def capture_now(now_local: dt.datetime) -> dict | None:
    """Read all cams once; return the per-cam readings + the worst-level summary."""
    readings = []
    for i, cam in enumerate(CAMS):
        if i:
            time.sleep(CAM_GAP_S)  # space calls to respect the per-minute limit
        try:
            r = assess(fetch_still(cam))
            readings.append({"id": cam["id"], "name": cam["name"], **r})
            print(f"  {cam['id']}: boats={r['boats']} "
                  f"(underway={r.get('underway')} anchored={r.get('anchored')}) "
                  f"level={r['level']} via {r.get('provider')}")
        except Exception as e:  # noqa: BLE001
            print(f"  warn {cam['id']}: {e}", file=sys.stderr)
    if not readings:
        return None
    overall = worst_level(readings) or {}
    return {
        "capturedAtLocal": now_local.isoformat(timespec="minutes"),
        "hour": now_local.hour,
        "level": overall.get("level"),
        "boats": overall.get("boats"),
        "underway": overall.get("underway"),
        "anchored": overall.get("anchored"),
        "note": overall.get("note"),
        "cams": readings,
    }


def main() -> int:
    now_local = dt.datetime.now(TZ)
    providers = _enabled_providers()
    prev = fetch_prev()

    if providers:
        print(f"vision providers (in order): {', '.join(n for n, _ in providers)}")
    current = capture_now(now_local) if providers else None
    if current is None and not providers:
        print("no vision providers configured — preserving any existing readings",
              file=sys.stderr)

    # The published `latest` reflects the most recent successful capture; on a
    # no-op run we carry forward the previously published latest unchanged.
    latest = current or (prev.get("latest") if isinstance(prev.get("latest"), dict) else None)

    # Rolling RAW history of overall reads -> the app derives the by-hour pattern.
    # Each entry records the worst level + total boats seen across the cams in that
    # capture, plus the local timestamp/hour so the app can bucket by hour.
    history = prev.get("history") if isinstance(prev.get("history"), list) else []
    if current:
        history = history + [{
            "t": current["capturedAtLocal"],
            "hour": current["hour"],
            "boats": current.get("boats"),
            "level": current.get("level"),
        }]
        history = history[-MAX_HISTORY:]

    out = {
        # Build the published feed in the contract shape. `latest` mirrors the
        # contract's latest object; `cams` carries the per-cam breakdown.
        "latest": {
            "capturedAtLocal": (latest or {}).get("capturedAtLocal"),
            "totalBoats": (latest or {}).get("boats"),
            "underway": (latest or {}).get("underway"),
            "anchored": (latest or {}).get("anchored"),
            "level": (latest or {}).get("level"),
            "note": (latest or {}).get("note"),
            "cams": (latest or {}).get("cams", []),
        } if latest else None,
        "history": history,
    }

    # Non-destructive: never overwrite the published feed with an empty document.
    # `latest` carries forward prev's good data, so `out` is empty only when this
    # run got nothing AND there was no prior reading — in that case write nothing
    # so the publish step leaves the last good feed untouched.
    if not out["latest"] and not history:
        print("no fresh readings and no prior good data — leaving published feed "
              "unchanged (not writing output)", file=sys.stderr)
        return 0

    with open(OUT, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    fresh = "fresh" if current else "preserved (no fresh capture this run)"
    lv = (out["latest"] or {}).get("level")
    print(f"wrote {OUT} [{fresh}]: level={lv} history={len(history)} entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
