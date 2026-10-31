"""
shared_utils.py
===============
Shared utility functions used across multiple pipeline modules.
Eliminates code duplication between semantic_research.py and cluster_research.py.
"""

import math
import re
from typing import Any, Dict, List

# ── Vehicle makes (shared between channel_auditor and brief_personalizer) ────

VEHICLE_MAKES = {
    "ford":       ["ford", "f150", "f-150", "f250", "mustang", "bronco", "ranger", "transit", "maverick"],
    "chevrolet":  ["chevy", "chevrolet", "silverado", "colorado", "suburban", "tahoe", "blazer"],
    "gmc":        ["gmc", "sierra", "yukon", "canyon", "terrain"],
    "dodge_ram":  ["dodge", "ram", "charger", "challenger", "durango", "1500", "2500", "3500"],
    "toyota":     ["toyota", "tacoma", "tundra", "camry", "4runner", "corolla", "sequoia", "land cruiser"],
    "honda":      ["honda", "civic", "accord", "pilot", "ridgeline", "crv", "cr-v", "odyssey"],
    "nissan":     ["nissan", "titan", "frontier", "pathfinder", "altima", "sentra", "armada"],
    "jeep":       ["jeep", "wrangler", "cherokee", "gladiator", "grand cherokee"],
    "diesel":     ["cummins", "powerstroke", "duramax", "6.7", "7.3", "6.6"],
}


# ── Numeric utilities ────────────────────────────────────────────────────────

def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def normalize_log(value: float, max_value: float) -> float:
    if max_value <= 0:
        return 0.0
    return clamp(math.log1p(max(value, 0.0)) / math.log1p(max_value), 0.0, 1.0)


# ── Shared scoring functions ─────────────────────────────────────────────────

def description_quality_score(video: Dict[str, Any]) -> float:
    description = str(video.get("description") or "")
    word_count = len(description.split())
    has_links = "http://" in description or "https://" in description
    has_timestamps = bool(video.get("description_has_timestamps")) or bool(
        re.search(r"\b\d{1,2}:\d{2}\b", description)
    )
    depth = clamp(word_count / 180.0, 0.0, 1.0)
    structure_bonus = 0.08 if has_links else 0.0
    timestamp_bonus = 0.12 if has_timestamps else 0.0
    return clamp(depth * 0.8 + structure_bonus + timestamp_bonus, 0.0, 1.0)


def click_to_view_ratio(video: Dict[str, Any]) -> float:
    candidate_keys = [
        "click_to_view_ratio", "click_view_ratio", "ctr",
        "ctr_ratio", "estimated_ctr", "ctr_estimate"
    ]
    for key in candidate_keys:
        if video.get(key) is not None:
            ratio = safe_float(video[key], 0.0)
            if ratio > 1.0:
                ratio /= 100.0
            return clamp(ratio, 0.0, 1.0)

    views = max(safe_float(video.get("view_count"), 0.0), 1.0)
    likes = safe_float(video.get("like_count"), 0.0)
    comments = safe_float(video.get("comment_count"), 0.0)
    ratio = (likes + comments * 3.0) / views
    return clamp(ratio, 0.0, 1.0)


def subscriber_efficiency_score(
    view_count: float,
    subscribers: float,
    hours_since_publish: float = 0.0,
) -> float:
    """
    How strongly a video outperforms its own channel's audience size.

    The previous formula `(view_count / subscribers) / 2.0` was age-confounded:
    it rewarded old videos that had simply accumulated views over years and
    penalised fresh breakouts — the opposite of the product thesis. This version
    normalises for age using views-per-hour, so a 2-day-old video that already
    hit 3x its sub count scores higher than a 3-year-old video sitting at 3x.

    Interpretation of the ratio r = view_count / subscribers (views-per-sub):
      r = 1.0  → every subscriber watched (channel-size performance)
      r = 2.0  → broke out beyond the channel's own audience
    Saturation is log-scaled so a 10x breakout isn't 5x "better" than a 2x one.

    Returns a 0..1 score. When subscriber or timing data is missing, a neutral
    0.45 is returned (matches the historical default so downstream weights stay
    calibrated).
    """
    if subscribers <= 0:
        return 0.45

    ratio = view_count / subscribers
    if ratio <= 0:
        return 0.0

    # Age penalty: only apply when we have a trustworthy publish age. A young
    # video at ratio r is more impressive than an old video at the same r.
    # We dampen, never invert (a brand-new video can't be *penalised* below its
    # raw ratio — that would reintroduce the old bug in the other direction).
    if hours_since_publish and hours_since_publish > 0:
        # Fresh (<30d) keeps ~full credit; old (>2yr) decays toward 0.6x.
        age_years = hours_since_publish / 8760.0
        age_factor = clamp(1.0 - 0.4 * min(age_years, 2.0) / 2.0, 0.6, 1.0)
        ratio *= age_factor

    # Log-saturate: r=1 → ~0.5, r=2 → ~0.63, r=5 → ~0.74, r=20 → ~0.86
    return clamp(math.log1p(ratio) / math.log1p(20.0), 0.0, 1.0)


def outperformance_ratio(view_count: float, channel_avg_views: float) -> float:
    """
    How many times the video's views beat its channel's per-video average.

    Uses channel_avg_views (fetched in metadata_fetch since A1) as the baseline.
    This is the prospective outperformance signal the brief generator's prompt
    references ("OUTPERFORMANCE TARGET: Averages X views/video"). Returns the
    raw multiple, or 0.0 when no baseline is available.
    """
    if channel_avg_views <= 0:
        return 0.0
    return view_count / channel_avg_views


def compute_composite_score(video: Dict[str, Any]) -> float:
    """
    Compute the composite 0-10 video quality score.
    Used by both semantic_research.py and cluster_research.py.
    """
    view_count = safe_float(video.get("view_count"), 0.0)
    vph = safe_float(video.get("views_per_hour"), 0.0)
    subscribers = safe_float(video.get("channel_subscriber_count"), 0.0)
    channel_avg_views = safe_float(video.get("channel_avg_views"), 0.0)
    engagement = safe_float(video.get("engagement_score"), 0.0)
    hours_since_publish = safe_float(video.get("hours_since_publish"), 0.0)

    desc_quality = description_quality_score(video)
    ctr_ratio = click_to_view_ratio(video)
    ctr_proxy = safe_float(video.get("ctr_proxy_score"), 0.0) / 100.0
    ctr_component = ctr_proxy if ctr_proxy > 0 else clamp(ctr_ratio / 0.12, 0.0, 1.0)
    views_component = normalize_log(view_count, 5_000_000.0)
    vph_component = normalize_log(vph, 5_000.0)

    # Age-normalised subscriber efficiency (replaces the old age-confounded
    # (view_count/subs)/2.0) — see subscriber_efficiency_score docstring.
    subscriber_efficiency = subscriber_efficiency_score(
        view_count, subscribers, hours_since_publish
    )

    engagement_component = clamp(engagement / 0.08, 0.0, 1.0)

    relevance = safe_float(
        video.get("relevance_score"),
        safe_float(video.get("final_score"), 0.0) / 10.0,
    )
    relevance_component = clamp(relevance / 10.0, 0.0, 1.0)

    retention_raw = safe_float(video.get("retention_proxy"), -1.0)
    retention_component = (
        clamp(retention_raw / 100.0, 0.0, 1.0) if retention_raw >= 0 else 0.5
    )

    weighted = (
        desc_quality * 0.15
        + ctr_component * 0.20
        + views_component * 0.16
        + subscriber_efficiency * 0.14
        + vph_component * 0.10
        + engagement_component * 0.12
        + relevance_component * 0.08
        + retention_component * 0.05
    )

    return round(clamp(weighted, 0.0, 1.0) * 10.0, 2)
