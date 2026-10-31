"""
channel_expander.py
===================
Expands and validates the seed channel list using channels discovered
during the last metadata_fetch run.

Pipeline position: Runs AFTER metadata_fetch.py, BEFORE merge_json.py
  discovered_channels.json → validate → update seed_channels.json

What it does:
  1. Loads channel IDs that passed semantic filtering in metadata_fetch
     (written to discovered_channels.json)
  2. For each new channel, fetches basic stats via YouTube API
  3. Scores them on upload frequency + subscriber count + relevance
  4. Adds channels that pass threshold to seed_channels.json
  5. Removes channels that haven't uploaded in 90 days (dormant)

This runs fast (<30s) — it only makes API calls for NEW channels
not already in seed_channels.json.
"""

import json
import logging
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from youtube_api_utils import get_api_manager, request_with_retry
from pipeline_paths import get_paths, resolve_niche

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent

YT_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"

# Master seed list (shared across niches, used primarily by automotive).
SEED_CHANNELS_FILE     = ROOT / "seed_channels.json"
# DISCOVERED_FILE is resolved per-niche inside main() — see _discovered_file_for(niche).
# The old ROOT-level default was a bug: it read a file that never existed, so
# channel expansion only ever saw an empty discovered list for every niche
# except where a stray root file happened to land.

# Thresholds for adding a new channel to the seed list
MIN_SUBSCRIBERS        = 5_000       # minimum subs to be worth seeding
MIN_RECENT_VIDEOS      = 3           # must have uploaded ≥3 videos in last 90 days
MAX_SEED_CHANNELS      = 100         # cap total seed list size
DORMANT_DAYS           = 90          # flag channels inactive for this many days
BATCH_SIZE             = 50          # YouTube API channels.list batch size


def _load_json_safe(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        log.warning("Could not read %s: %s", path.name, e)
        return {}


def _save_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def fetch_channel_details(channel_ids: List[str]) -> List[Dict[str, Any]]:
    """
    Batch-fetch channel metadata from YouTube API.
    Returns a list of channel dicts with id, title, subscriber_count,
    video_count, and latest_upload_at.
    """
    api = get_api_manager()
    results = []

    for i in range(0, len(channel_ids), BATCH_SIZE):
        batch = channel_ids[i:i + BATCH_SIZE]
        params = {
            "part":       "snippet,statistics,contentDetails",
            "id":         ",".join(batch),
            "maxResults": BATCH_SIZE,
        }
        data = request_with_retry(YT_CHANNELS_URL, params)
        if not data:
            log.warning("No response for channel batch starting at index %d", i)
            continue

        for item in data.get("items", []):
            stats   = item.get("statistics", {})
            snippet = item.get("snippet", {})
            results.append({
                "channel_id":       item["id"],
                "channel_title":    snippet.get("title", ""),
                "subscriber_count": int(stats.get("subscriberCount", 0) or 0),
                "video_count":      int(stats.get("videoCount", 0) or 0),
                "published_at":     snippet.get("publishedAt", ""),
                "uploads_playlist": (
                    item.get("contentDetails", {})
                        .get("relatedPlaylists", {})
                        .get("uploads", "")
                ),
            })
        time.sleep(0.2)

    return results


def count_recent_uploads(
    uploads_playlist_id: str,
    days: int = DORMANT_DAYS
) -> Tuple[int, Optional[str]]:
    """
    Count how many videos the channel uploaded in the last `days` days.
    Returns (count, latest_published_at_iso).
    Only fetches 1 page (50 videos) — enough to detect activity.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    params = {
        "part":       "contentDetails,snippet",
        "playlistId": uploads_playlist_id,
        "maxResults": 50,
    }
    data = request_with_retry(
        "https://www.googleapis.com/youtube/v3/playlistItems", params
    )
    if not data:
        return 0, None

    recent = 0
    latest = None
    for item in data.get("items", []):
        pub = item.get("snippet", {}).get("publishedAt", "")
        if not pub:
            continue
        try:
            dt = datetime.fromisoformat(pub.replace("Z", "+00:00"))
        except ValueError:
            continue
        if latest is None or dt > datetime.fromisoformat(latest.replace("Z", "+00:00")):
            latest = pub
        if dt >= cutoff:
            recent += 1

    return recent, latest


def score_channel(ch: Dict[str, Any], recent_uploads: int) -> float:
    """
    Score a channel 0-10 on suitability as a seed channel.
    Higher = better source of training videos.
    """
    score = 0.0

    # Subscriber range (sweet spot: 10K–500K — big enough for signal, small enough to be DIY)
    subs = ch["subscriber_count"]
    if   subs >= 500_000:  score += 3.0
    elif subs >= 100_000:  score += 5.0
    elif subs >= 25_000:   score += 7.0
    elif subs >= 10_000:   score += 6.0
    elif subs >= 5_000:    score += 4.0
    else:                  score += 1.0

    # Upload activity
    if   recent_uploads >= 10: score += 3.0
    elif recent_uploads >= 5:  score += 2.0
    elif recent_uploads >= 3:  score += 1.0
    else:                      score -= 2.0

    return round(min(10.0, max(0.0, score)), 2)


def load_seed_channels() -> Dict[str, Any]:
    data = _load_json_safe(SEED_CHANNELS_FILE)
    if not isinstance(data.get("channel_ids"), list):
        data["channel_ids"] = []
    return data


def save_seed_channels(data: Dict[str, Any]) -> None:
    data["last_updated"]    = datetime.now(timezone.utc).isoformat()
    data["total_channels"]  = len(data.get("channel_ids", []))
    _save_json(SEED_CHANNELS_FILE, data)
    log.info(
        "Saved %d seed channels → %s",
        data["total_channels"], SEED_CHANNELS_FILE.name
    )


def _discovered_file_for(niche: str) -> Path:
    """Resolve the per-niche discovered_channels.json path.

    metadata_fetch writes one discovered_channels.json per niche under
    data/<niche>/. The expander must read that same per-niche file — not a
    root-level one — otherwise it silently sees an empty list every run.
    """
    resolved = resolve_niche(niche)
    return get_paths(resolved).discovered_channels


def main(niche: str = "automotive") -> None:
    resolved = resolve_niche(niche)
    log.info("channel_expander.py running for niche: %s", resolved)

    # ── Load existing seed list ────────────────────────────────────────────────
    seed_data   = load_seed_channels()
    existing_ids: set = set(seed_data.get("channel_ids", []))
    log.info("Current seed list: %d channels", len(existing_ids))

    # ── Load channels discovered in the last metadata_fetch run ───────────────
    # Per-niche path (was: a non-existent ROOT/discovered_channels.json).
    discovered_file = _discovered_file_for(resolved)
    discovered_data = _load_json_safe(discovered_file)
    discovered_ids: List[str] = discovered_data.get("channel_ids", [])

    if not discovered_ids:
        log.info("No channels in %s — skipping expansion.", discovered_file.name)
        # Still run dormancy check on existing seeds
        _check_dormant(existing_ids, seed_data)
        return

    # Only process channels we haven't seen before
    new_ids = [cid for cid in discovered_ids if cid not in existing_ids]
    log.info(
        "Discovered: %d total, %d new (not yet in seed list)",
        len(discovered_ids), len(new_ids)
    )

    if not new_ids:
        log.info("No new channels to evaluate.")
        _check_dormant(existing_ids, seed_data)
        return

    # ── Fetch metadata for new channels ───────────────────────────────────────
    log.info("Fetching metadata for %d new channels...", len(new_ids))
    channel_details = fetch_channel_details(new_ids)

    # ── Score and filter ───────────────────────────────────────────────────────
    additions: List[Dict[str, Any]] = []

    for ch in channel_details:
        if ch["subscriber_count"] < MIN_SUBSCRIBERS:
            log.debug(
                "Skip %s — only %d subs (min %d)",
                ch["channel_title"], ch["subscriber_count"], MIN_SUBSCRIBERS
            )
            continue

        playlist_id = ch.get("uploads_playlist")
        if not playlist_id:
            continue

        recent_count, latest_pub = count_recent_uploads(playlist_id)
        ch["recent_uploads_90d"] = recent_count
        ch["latest_upload_at"]   = latest_pub

        if recent_count < MIN_RECENT_VIDEOS:
            log.debug(
                "Skip %s — only %d uploads in 90d (min %d)",
                ch["channel_title"], recent_count, MIN_RECENT_VIDEOS
            )
            continue

        ch["seed_score"] = score_channel(ch, recent_count)
        additions.append(ch)
        time.sleep(0.3)  # be a good API citizen

    additions.sort(key=lambda c: c["seed_score"], reverse=True)
    log.info(
        "%d channels passed validation (scored ≥threshold)",
        len(additions)
    )

    # ── Add to seed list (respecting cap) ────────────────────────────────────
    added_count = 0
    channel_meta = seed_data.get("channel_meta", {})

    for ch in additions:
        if len(existing_ids) >= MAX_SEED_CHANNELS:
            log.info(
                "Seed list at cap (%d). Not adding further channels.",
                MAX_SEED_CHANNELS
            )
            break
        existing_ids.add(ch["channel_id"])
        channel_meta[ch["channel_id"]] = {
            "title":        ch["channel_title"],
            "subscribers":  ch["subscriber_count"],
            "seed_score":   ch["seed_score"],
            "added_at":     datetime.now(timezone.utc).isoformat(),
        }
        added_count += 1

    log.info("Added %d new channels to seed list.", added_count)

    # ── Dormancy check on full seed list ──────────────────────────────────────
    _check_dormant(existing_ids, seed_data)

    seed_data["channel_ids"]  = sorted(existing_ids)
    seed_data["channel_meta"] = channel_meta
    save_seed_channels(seed_data)


def _check_dormant(
    channel_ids: set,
    seed_data: Dict[str, Any],
) -> None:
    """
    Flag channels that haven't uploaded in DORMANT_DAYS days.
    Marks them in seed_data['dormant'] list but does NOT auto-remove them
    (human review step — removing a seed channel that just went on holiday
    would destroy signal continuity).
    """
    channel_meta = seed_data.get("channel_meta", {})
    # Only re-check channels whose last-seen date is older than DORMANT_DAYS
    cutoff = (datetime.now(timezone.utc) - timedelta(days=DORMANT_DAYS)).isoformat()

    to_check = [
        cid for cid in channel_ids
        if channel_meta.get(cid, {}).get("last_seen_at", "2000-01-01") < cutoff
    ]

    if not to_check:
        return

    # Limit to 20 channels per run to stay within quota
    to_check = to_check[:20]
    log.info("Checking %d channels for dormancy...", len(to_check))

    details = fetch_channel_details(to_check)
    dormant = seed_data.get("dormant", [])

    for ch in details:
        playlist_id = ch.get("uploads_playlist")
        if not playlist_id:
            continue
        recent, latest = count_recent_uploads(playlist_id)
        cid = ch["channel_id"]
        if cid in channel_meta:
            channel_meta[cid]["last_seen_at"] = datetime.now(timezone.utc).isoformat()
            channel_meta[cid]["recent_uploads_90d"] = recent

        if recent == 0:
            if cid not in dormant:
                dormant.append(cid)
                log.warning(
                    "DORMANT: %s (%s) — 0 uploads in %d days. "
                    "Consider removing from seed list.",
                    ch["channel_title"], cid, DORMANT_DAYS
                )

    seed_data["dormant"] = dormant
    if dormant:
        log.warning(
            "%d seed channels are dormant. Review seed_channels.json['dormant'] "
            "and remove them manually when ready.",
            len(dormant)
        )


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s")
    niche_arg = sys.argv[1] if len(sys.argv) > 1 else "automotive"
    main(niche_arg)