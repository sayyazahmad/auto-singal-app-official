"""
tests/audit_dataset_quality.py
==============================
Read-only data-quality audit for a niche's pipeline output.

This is NOT a unit test — it's a diagnostic you run after a pipeline run to
answer: "is what we fetched actually high-signal data, or junk?" It prints a
human-readable quality report and exits non-zero if the dataset fails minimum
quality bars, so it can gate a CI/nightly job.

Usage:
    python tests/audit_dataset_quality.py productivity
    python tests/audit_dataset_quality.py automotive

It inspects every JSON artifact under data/<niche>/ and reports:
  - dataset size (admitted videos, discarded videos, channels)
  - admission funnel (what got rejected and why)
  - field completeness (the fields that drive scoring + outlier detection:
    channel_subscriber_count, channel_avg_views, views_per_hour, etc.)
  - data-distribution red flags:
      * median video age (a stale dataset means the age gate is dead)
      * median relevance / quality scores (is everything borderline?)
      * subscriber-coverage % (core thesis breaks if subs are missing)
      * small-channel-outlier presence (the signal the product sells on)
  - off-niche leakage heuristics (automotive keywords in a productivity set, etc.)
"""

import json
import math
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Niches whose keywords are "foreign" to each target niche — used for leakage
# heuristics. A productivity dataset with lots of "alternator/oil change" titles
# is a red flag that the admission gate or centroid is mis-scoped.
OFF_NICHE_KEYWORDS = {
    "automotive": ["stock", "invest", "dividend", "etf", "crypto", "notion", "study with me"],
    "productivity": ["alternator", "oil change", "transmission", "brake pad", "spark plug", "diesel", "cummins"],
    "finance": ["alternator", "oil change", "notion setup", "morning routine"],
    "technology": ["alternator", "oil change", "dividend", "study with me"],
}


def _load_json(path: Path):
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        return {"_error": f"{type(exc).__name__}: {exc}"}


def _videos_from_payload(payload):
    """Accept both {videos:[...]} and a bare list."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("videos", "items", "data"):
            if isinstance(payload.get(key), list):
                return payload[key]
    return []


def _age_days(v):
    h = v.get("hours_since_publish")
    if h is None or h <= 0:
        return None
    try:
        return float(h) / 24.0
    except (TypeError, ValueError):
        return None


def _pct(numerator, denominator):
    if not denominator:
        return 0.0
    return 100.0 * numerator / denominator


def audit(niche: str) -> int:
    base = ROOT / "data" / niche
    print()
    print("═" * 72)
    print(f"  DATA-QUALITY AUDIT  ·  niche = {niche}")
    print(f"  path = {base}")
    print("═" * 72)
    if not base.exists():
        print(f"  ✗ No data directory found at {base}.")
        print("    Run the pipeline first: python run_pipeline.py --niche " + niche + " --nightly")
        return 2

    # ── 1. Inventory ────────────────────────────────────────────────────────
    print("\n── Artifact inventory ─────────────────────────────────────────────────")
    artifacts = sorted(p for p in base.glob("*.json"))
    for p in artifacts:
        size = p.stat().st_size
        print(f"  {p.name:<42} {size:>10,} bytes")
    cat_dir = base / "categorized_videos"
    if cat_dir.exists():
        cat_files = list(cat_dir.glob("*.json"))
        print(f"  categorized_videos/                       {len(cat_files)} files")

    # ── 2. Fetch the primary dataset (semantic merge preferred) ─────────────
    candidates = [
        base / "merged_videos_semantic.json",
        base / "merged_videos.json",
        base / "top_100_videos.json",
    ]
    dataset_path = next((p for p in candidates if p.exists()), None)
    if not dataset_path:
        print("\n  ✗ No video dataset JSON found (none of merged_videos_semantic,")
        print("    merged_videos, top_100_videos). Pipeline may not have completed.")
        return 3
    payload = _load_json(dataset_path)
    videos = _videos_from_payload(payload)
    print(f"\n── Primary dataset: {dataset_path.name} ─────────────────────────────────")
    print(f"  total admitted videos: {len(videos)}")
    if not videos:
        print("  ✗ Dataset is EMPTY. Admission gates rejected everything, or fetch failed.")
        return 4

    # ── 3. Field completeness (the fields scoring depends on) ───────────────
    print("\n── Field completeness (drives scoring + outlier detection) ────────────")
    critical_fields = [
        "view_count",
        "channel_subscriber_count",
        "channel_avg_views",
        "views_per_hour",
        "engagement_score",
        "hours_since_publish",
        "repair_similarity",
        "junk_similarity",
        "relevance_score",
        "description",
    ]
    completeness = {}
    for field in critical_fields:
        present = sum(
            1 for v in videos
            if v.get(field) is not None
            and not (isinstance(v.get(field), str) and v.get(field) == "")
            and not (isinstance(v.get(field), (int, float)) and v.get(field) <= 0 and field in {
                "view_count", "channel_subscriber_count", "channel_avg_views",
                "views_per_hour", "engagement_score",
            })
        )
        completeness[field] = present
        bar = "█" * int(present / len(videos) * 30)
        print(f"  {field:<30} {present:>5}/{len(videos)}  {_pct(present, len(videos)):5.1f}%  {bar}")

    # ── 4. Admission funnel ─────────────────────────────────────────────────
    print("\n── Admission funnel ───────────────────────────────────────────────────")
    disc_path = base / "discarded_videos.json"
    if disc_path.exists():
        disc_payload = _load_json(disc_path)
        discards = disc_payload.get("discarded", []) if isinstance(disc_payload, dict) else []
        print(f"  discarded videos on record: {len(discards)}")
        reasons = Counter(v.get("discard_reason", "unknown") for v in discards)
        for reason, count in reasons.most_common(10):
            label = reason[:60]
            print(f"    {count:>5} × {label}")
    else:
        print("  (no discarded_videos.json — either nothing was rejected, or fetch")
        print("   did not reach the admission-gate stage.)")

    # ── 5. Distribution signals ──────────────────────────────────────────────
    print("\n── Distribution red flags ─────────────────────────────────────────────")

    ages = [d for d in (_age_days(v) for v in videos) if d is not None]
    if ages:
        med_age = median(ages)
        print(f"  median video age:           {med_age:8.0f} days ({med_age/365:.1f} years)")
        over_3yr = _pct(sum(1 for d in ages if d > 365 * 3), len(ages))
        print(f"  % older than 3 years:       {over_3yr:8.1f}%")
        if med_age > 365 * 2:
            print(f"    ⚠ STALE DATASET — median age > 2yr; age gate may be too loose or dead.")

    rels = [v.get("repair_similarity") for v in videos if isinstance(v.get("repair_similarity"), (int, float))]
    if rels:
        print(f"  median repair_similarity:   {median(rels):8.3f}   (min {min(rels):.3f})")

    subs = [v.get("channel_subscriber_count") for v in videos
            if isinstance(v.get("channel_subscriber_count"), (int, float)) and v.get("channel_subscriber_count") > 0]
    if subs:
        sub_coverage = _pct(len(subs), len(videos))
        print(f"  subscriber coverage:        {sub_coverage:8.1f}%  ({len(subs)}/{len(videos)} videos)")
        if sub_coverage < 80:
            print(f"    ⚠ LOW SUB COVERAGE — core outlier-thesis signal is broken without subs.")
        small_channels = sum(1 for s in subs if s < 5000)
        print(f"  small channels (<5K subs):  {small_channels:>8}  ({_pct(small_channels, len(subs)):.1f}%)")

    # Outlier detection — videos outperforming their channel average.
    outliers = []
    for v in videos:
        views = v.get("view_count") or 0
        avg = v.get("channel_avg_views") or 0
        subs_v = v.get("channel_subscriber_count") or 0
        if isinstance(views, (int, float)) and isinstance(avg, (int, float)) and avg > 0:
            if views > avg * 3:
                outliers.append((views / avg, v))
        elif isinstance(views, (int, float)) and isinstance(subs_v, (int, float)) and subs_v > 0:
            if views > subs_v * 3:
                outliers.append((views / subs_v, v))
    outliers.sort(key=lambda x: -x[0])
    print(f"  outliers (>3x channel avg/subs): {len(outliers)}")
    for ratio, v in outliers[:5]:
        title = (v.get("title") or "")[:50]
        print(f"    {ratio:>6.1f}×  {title}")

    # ── 6. Off-niche leakage heuristic ──────────────────────────────────────
    print("\n── Off-niche leakage heuristic ────────────────────────────────────────")
    leak_keywords = OFF_NICHE_KEYWORDS.get(niche, [])
    if leak_keywords:
        leaks = Counter()
        for v in videos:
            text = f"{v.get('title', '')} {v.get('description', '')}".lower()
            for kw in leak_keywords:
                if kw in text:
                    leaks[kw] += 1
        if leaks:
            print(f"  ⚠ Potential off-niche leakage ({niche} dataset):")
            for kw, count in leaks.most_common():
                print(f"    {count:>4} videos mention '{kw}'")
        else:
            print(f"  ✓ no off-niche keyword leakage detected (scanned {len(leak_keywords)} markers).")

    # ── 7. Verdict ──────────────────────────────────────────────────────────
    print("\n── Verdict ────────────────────────────────────────────────────────────")
    issues = []
    if completeness.get("channel_subscriber_count", 0) / len(videos) < 0.8:
        issues.append("low subscriber coverage")
    if ages and median(ages) > 365 * 2:
        issues.append("stale dataset (median age > 2yr)")
    if rels and median(rels) < 0.3:
        issues.append("weak semantic relevance (median repair_similarity < 0.30)")
    if len(videos) < 30:
        issues.append("dataset too small (<30 videos)")

    if issues:
        print("  ⚠ ISSUES FOUND:")
        for i in issues:
            print(f"    - {i}")
        return 1
    else:
        print("  ✓ Dataset passes minimum quality bars.")
        print(f"    {len(videos)} videos, healthy field coverage, on-niche, fresh.")
        return 0


if __name__ == "__main__":
    niche = sys.argv[1] if len(sys.argv) > 1 else "automotive"
    sys.exit(audit(niche))
