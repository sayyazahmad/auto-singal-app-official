"""
fetch_channel_metadata.py
=========================
Fetches a reference channel's videos and audit summary for a given niche.
Replaces the legacy themechanic868_metadata.py script.

Usage:
  python fetch_channel_metadata.py automotive
  python fetch_channel_metadata.py finance --channel UCxxxxxx
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from channel_auditor import ChannelAuditor
from pipeline_paths import get_paths, get_reference_channel, resolve_niche

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s")
log = logging.getLogger("fetch_channel_metadata")


def build_channel_dataset(
    channel_id: str,
    niche: str,
    max_videos: int = 100,
) -> dict:
    auditor = ChannelAuditor()
    profile = auditor.run_audit(channel_id, max_videos=max_videos, niche=niche)
    videos, channel_meta = auditor.fetch_channel_videos(channel_id, max_videos)

    subniches = Counter()
    for video in videos:
        tag = video.get("_subniche") or video.get("primary_subniche")
        if tag:
            subniches[tag] += 1

    top_keywords = []
    word_counts: Counter = Counter()
    for video in videos:
        title = str(video.get("title", "")).lower()
        for word in title.split():
            if len(word) > 3:
                word_counts[word] += 1
    top_keywords = [{"term": term, "count": count} for term, count in word_counts.most_common(12)]

    final_scores = [float(v.get("final_score") or 0) for v in videos if v.get("final_score")]
    avg_final = sum(final_scores) / len(final_scores) if final_scores else 0.0

    return {
        "niche": niche,
        "channel": profile.get("channel_name") or channel_meta.get("channel_name", channel_id),
        "channel_id": channel_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_saved": len(videos),
        "videos": videos,
        "metadata": profile,
        "analysis_summary": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_videos": len(videos),
            "channels_represented": 1,
            "avg_final_score": round(avg_final, 2),
            "viral_count": sum(1 for v in videos if v.get("is_outlier")),
            "top_triggered_keywords": top_keywords,
            "top_subniches": [
                {"term": term, "count": count}
                for term, count in subniches.most_common(8)
            ],
        },
    }


def main(niche: str = "automotive", channel_id: str | None = None, max_videos: int = 100) -> None:
    resolved = resolve_niche(niche)
    paths = get_paths(resolved)
    paths.ensure_dirs()

    channel = channel_id or get_reference_channel(resolved)
    log.info("Fetching channel metadata for niche=%s channel=%s", resolved, channel)

    payload = build_channel_dataset(channel, resolved, max_videos=max_videos)

    with paths.channel_metadata.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)

    log.info(
        "Saved %d videos → %s",
        len(payload.get("videos", [])),
        paths.channel_metadata,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch reference channel metadata for a niche")
    parser.add_argument("niche", nargs="?", default="automotive", help="Niche key (automotive, finance, ...)")
    parser.add_argument("--channel", dest="channel_id", default=None, help="YouTube channel ID (UC...)")
    parser.add_argument("--max-videos", type=int, default=100)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    try:
        main(niche=args.niche, channel_id=args.channel_id, max_videos=args.max_videos)
    except Exception as exc:
        log.error("fetch_channel_metadata failed: %s", exc)
        sys.exit(1)
