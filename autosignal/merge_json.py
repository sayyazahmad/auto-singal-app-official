"""
merge_json.py
=============
Merges all raw video data sources into one clean, deduplicated dataset.

Sources merged (in priority order — richer data wins field conflicts):
  1. data/{niche}/top_100_videos.json      — metadata_fetch output
  2. data/{niche}/channel_metadata.json    — optional reference channel videos
  3. data/{niche}/discovered_channels.json — discovered channel IDs (future)

Pipeline position: Runs AFTER metadata_fetch.py, BEFORE semantic_research.py
"""
import json
import logging
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List

from pipeline_paths import get_paths, resolve_niche

DAYS_AGO_FILTER = 730

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s")
log = logging.getLogger(__name__)


def load_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def merge_dict(base: dict, extra: dict) -> dict:
    for key, value in extra.items():
        if value is None or value == "" or value == [] or value == {}:
            continue
        if key not in base or base[key] in (None, "", [], {}):
            base[key] = value
            continue

        if isinstance(value, list) and isinstance(base[key], list):
            # Safe deduplication for primitives, preserve list of dicts from base if exists
            combined = base[key] + value
            if all(isinstance(x, (str, int, float, bool)) for x in combined):
                base[key] = list(dict.fromkeys(combined))
            else:
                base[key] = base[key] if base[key] else value
            continue

        if isinstance(value, str) and isinstance(base[key], str):
            if len(value) > len(base[key]):
                base[key] = value
            continue

        if key == "video_url" and base.get("video_id") and not base.get("video_url"):
            base[key] = value
            continue

    return base


def normalize_video(video: dict) -> dict:
    normalized = video.copy()
    normalized["video_id"] = video.get("video_id") or video.get("id") or ""
    if not normalized.get("video_url") and normalized.get("video_id"):
        normalized["video_url"] = f"https://www.youtube.com/watch?v={normalized['video_id']}"
    
    normalized.setdefault("tags", [])
    normalized.setdefault("semantic_neighbors", [])
    normalized.setdefault("semantic_embedding", [])
    normalized.setdefault("source_files", [])
    
    # Map common CamelCase API fields to the internal snake_case schema
    fallbacks = {
        "viewCount": "view_count",
        "likeCount": "like_count",
        "commentCount": "comment_count",
        "subscriberCount": "channel_subscriber_count",
        "videoCount": "channel_total_videos",
        "categoryId": "category_id",
        "channelId": "channel_id",
        "channelTitle": "channel_title",
        "publishedAt": "published_at"
    }
    
    for camel, snake in fallbacks.items():
        if snake not in normalized and camel in normalized:
            normalized[snake] = normalized[camel]
            
    return normalized


def combine_metadata(parts: List[tuple]) -> dict:
    metadata: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_files": [],
        "total_videos": 0,
        "sources": {},
        "metadata": {},
    }

    all_keywords: Counter = Counter()
    all_subniches: Counter = Counter()

    for path, data in parts:
        fname = Path(path).name
        metadata["source_files"].append(fname)
        metadata["sources"][fname] = {
            "top_level_keys": list(data.keys())[:10],
            "video_count": len(data.get("videos", [])),
        }

        analysis = data.get("analysis_summary", {})
        for kw in analysis.get("top_triggered_keywords", []):
            all_keywords[kw.get("term")] += kw.get("count", 0)
        for sub in analysis.get("top_subniches", []):
            all_subniches[sub.get("term")] += sub.get("count", 0)

    metadata["keywords"] = [
        {"term": term, "count": count}
        for term, count in all_keywords.most_common(20)
    ]
    metadata["subniches"] = [
        {"term": term, "count": count}
        for term, count in all_subniches.most_common(20)
    ]
    return metadata


def _extract_videos_from_payload(data: dict, filename: str) -> List[dict]:
    """
    Extract a flat list of videos from a JSON payload.
    Handles both the standard {videos: [...]} schema and the discovered_channels
    schema where videos are nested per-channel.
    """
    # Standard schema: top-level "videos" key
    if "videos" in data and isinstance(data["videos"], list):
        return data["videos"]

    # discovered_channels.json schema: {channels: [{videos: [...]}]}
    if "channels" in data and isinstance(data["channels"], list):
        videos: List[dict] = []
        for ch in data["channels"]:
            ch_videos = ch.get("videos") or ch.get("recent_videos") or []
            for v in ch_videos:
                # Tag with channel info if missing
                if not v.get("channel_id") and ch.get("channel_id"):
                    v["channel_id"] = ch["channel_id"]
                if not v.get("channel_title") and ch.get("channel_title"):
                    v["channel_title"] = ch["channel_title"]
            videos.extend(ch_videos)
        return videos

    log.warning(f"Could not extract videos from {filename} (unknown schema).")
    return []


def main(niche: str = "automotive") -> None:
    resolved = resolve_niche(niche)
    paths = get_paths(resolved)
    paths.ensure_dirs()

    merged_videos: Dict[str, dict] = {}
    sources = []

    input_specs = [
        (paths.top_100.name, paths.top_100),
        (paths.channel_metadata.name, paths.channel_metadata),
    ]

    for filename, path in input_specs:
        if not path.exists():
            log.warning(f"Source file not found, skipping: {path}")
            continue
        log.info(f"Loading videos from: {path}")
        data = load_json(str(path))
        sources.append((str(path), data))
        videos = _extract_videos_from_payload(data, filename)
        before = len(merged_videos)
        for raw_video in videos:
            video_id = raw_video.get("video_id") or raw_video.get("id")
            if not video_id:
                continue
            normalized = normalize_video(raw_video)
            existing = merged_videos.get(video_id, {})
            merged_videos[video_id] = merge_dict(existing or {}, normalized)
            merged_videos[video_id].setdefault("source_files", [])
            if filename not in merged_videos[video_id]["source_files"]:
                merged_videos[video_id]["source_files"].append(filename)
        added = len(merged_videos) - before
        log.info(f"  -> Found {len(videos)} raw videos, {added} new after dedup.")

    if not merged_videos:
        log.error("No videos found in any source files. Aborting merge.")
        raise ValueError("No videos found in any source files. Aborting merge.")

    # Filter out videos older than the staleness threshold
    cutoff = datetime.now(timezone.utc) - timedelta(days=DAYS_AGO_FILTER)
    fresh_videos = {}
    stale_videos = []
    
    log.info(f"Filtering videos older than {DAYS_AGO_FILTER} days (before {cutoff.date()})...")
    for vid, data in merged_videos.items():
        pub = data.get("published_at", "")
        if pub:
            try:
                pub_dt = datetime.fromisoformat(pub.replace("Z", "+00:00"))
                if pub_dt < cutoff:
                    data["discard_reason"] = f"Stale (older than {DAYS_AGO_FILTER} days)"
                    stale_videos.append(data)
                    continue
            except (ValueError, TypeError):
                pass
        fresh_videos[vid] = data

    if stale_videos:
        log.info(f"Filtered out {len(stale_videos)} stale videos.")
        
        # Save discarded to root for review
        discard_file = paths.discarded_videos
        existing_discards = []
        if discard_file.exists():
            try:
                existing_discards = load_json(str(discard_file)).get("discarded", [])
            except Exception:
                pass
        
        # Avoid duplicate discards in the log
        seen_ids = {v.get("video_id") or v.get("id") for v in existing_discards if (v.get("video_id") or v.get("id"))}
        for v in stale_videos:
            vid = v.get("video_id") or v.get("id")
            if vid and vid not in seen_ids:
                existing_discards.append(v)
                
        with open(discard_file, "w", encoding="utf-8") as f:
            json.dump({"last_updated": datetime.now(timezone.utc).isoformat(), "discarded": existing_discards}, f, indent=2, ensure_ascii=False)

    final_videos = list(fresh_videos.values())
    final_videos.sort(key=lambda item: (item.get("channel_title") or "", item.get("title") or ""))
    log.info(f"Total fresh videos to be merged: {len(final_videos)}")

    metadata = combine_metadata(sources)
    metadata["niche"] = resolved
    metadata["total_videos"] = len(final_videos)

    output = {
        "metadata": metadata,
        "videos": final_videos,
    }

    with paths.merged.open("w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    log.info(f"Merged {len(final_videos)} videos into {paths.merged}")


if __name__ == "__main__":
    import sys
    niche_arg = sys.argv[1] if len(sys.argv) > 1 else "automotive"
    main(niche_arg)
