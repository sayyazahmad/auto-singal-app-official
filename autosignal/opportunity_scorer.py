"""
opportunity_scorer.py
=====================
Loads cluster data from the previous step, re-ranks all opportunities
by their final score using 4 production-tuned signals, and saves the
official ranked list.

Signal Weights (production-tuned):
  35% — Trending velocity (VPH spike vs last week)
  30% — Search gap (demand vs competition ratio)  
  20% — Seasonal boost (month-aware multiplier)
  15% — Breakout outlier detection
"""

import json
import logging
from pathlib import Path

from pipeline_paths import get_paths, resolve_niche
import sqlite3
from datetime import datetime

try:
    from supabase_client import (
        upsert_cluster as _sb_upsert_cluster,
        upsert_opportunity as _sb_upsert_opportunity,
    )
    _SUPABASE_AVAILABLE = True
except ImportError:
    _SUPABASE_AVAILABLE = False

try:
    from niche_config import get_niche_config, get_seasonal_multiplier
    _NICHE_CONFIG_AVAILABLE = True
except ImportError:
    _NICHE_CONFIG_AVAILABLE = False
    def get_seasonal_multiplier(niche, topic, month):
        return 1.0

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s")
log = logging.getLogger(__name__)

# Define file paths
ROOT = Path(__file__).resolve().parent
INPUT_FILE = ROOT / "video_clusters_semantic.json"
OUTPUT_FILE = ROOT / "opportunities.json"
DB_FILE = ROOT / "youtube_automotive.db"

# Import cluster trend analysis from json_to_sqlite
try:
    from json_to_sqlite import get_cluster_trends
except ImportError:
    log.warning("Could not import get_cluster_trends from json_to_sqlite. Trend analysis will be disabled.")
    get_cluster_trends = None

# ── Seasonal calendar (month-aware boost multipliers) ─────────────────────────
# Repairs/maintenance that spike in specific seasons
SEASONAL_CALENDAR = {
    # Month: {topic: multiplier}
    1:  {"battery": 1.35, "cooling": 1.25, "electrical": 1.15},          # January  — cold start issues
    2:  {"battery": 1.30, "cooling": 1.20, "electrical": 1.15},          # February — winter still harsh
    3:  {"brakes": 1.25, "suspension": 1.20, "oil": 1.15},               # March    — post-winter inspection
    4:  {"brakes": 1.20, "suspension": 1.15, "oil": 1.20, "tires": 1.15},# April    — spring service
    5:  {"ac_hvac": 1.25, "cooling": 1.20, "oil": 1.15},                 # May      — pre-summer prep
    6:  {"ac_hvac": 1.40, "cooling": 1.30, "fuel_system": 1.10},         # June     — peak AC season
    7:  {"ac_hvac": 1.45, "cooling": 1.35},                              # July     — hottest month
    8:  {"ac_hvac": 1.35, "cooling": 1.25, "fuel_system": 1.10},         # August   — still hot
    9:  {"oil": 1.20, "brakes": 1.15, "suspension": 1.10},               # September — back to school
    10: {"battery": 1.25, "cooling": 1.20, "wipers": 1.15},             # October  — winterization starts
    11: {"battery": 1.30, "cooling": 1.25, "electrical": 1.15},         # November — cold prep
    12: {"battery": 1.35, "cooling": 1.30, "electrical": 1.20},         # December — peak winter demand
}

# Signal weights (sum to 1.0)
WEIGHT_TRENDING_VELOCITY = 0.35
WEIGHT_SEARCH_GAP        = 0.30
WEIGHT_SEASONAL          = 0.20
WEIGHT_BREAKOUT          = 0.15


def _compute_trending_velocity_score(cluster: dict, trends: dict) -> float:
    """
    Signal 1: Trending velocity (35% weight).
    Measures VPH spike vs last week — the strongest predictor of YouTube momentum.
    Score range: 0-10.
    """
    trend_info = trends.get(str(cluster.get("cluster_id", "")))
    if not trend_info:
        # No DB trend data — derive velocity from breakout_probability and
        # avg VPH across the top videos. This is a real signal, not a fallback guess.
        top_videos = cluster.get("top_videos", [])
        if top_videos:
            avg_vph = sum(float(v.get("views_per_hour") or 0) for v in top_videos) / len(top_videos)
            avg_breakout = sum(float(v.get("breakout_probability") or 0) for v in top_videos) / len(top_videos)
            # Log-normalize VPH (5000 VPH = max score), blend with breakout probability
            import math
            vph_score = min(10.0, math.log1p(avg_vph) / math.log1p(5000) * 10.0)
            velocity_score = (vph_score * 0.6) + (avg_breakout * 10.0 * 0.4)
            return round(min(10.0, velocity_score), 2)
        metrics = cluster.get("opportunity_metrics", {})
        return float(metrics.get("growth", 5.0))

    delta = trend_info.get("score_delta", 0.0)
    # Normalize: delta > 2.0 = max score, delta < -2.0 = minimum score
    normalized = max(0.0, min(10.0, 5.0 + delta * 2.5))
    return round(normalized, 2)


def _compute_search_gap_score(cluster: dict) -> float:
    """
    Signal 2: Search gap (30% weight).
    High demand + high competition opportunity = the golden opportunity window.

    NOTE: The 'competition' metric from cluster_research.py already represents
    opportunity (channel_diversity * 0.5 + quality_gap * 0.5). Higher = more room
    for a new entrant. We use it directly, not inverted.
    Score range: 0-10.
    """
    metrics = cluster.get("opportunity_metrics", {})
    demand      = float(metrics.get("demand", 5.0))
    competition = float(metrics.get("competition", 5.0))

    # Both demand and competition-opportunity score point in the same direction
    gap_score = (demand * 0.60) + (competition * 0.40)
    return round(min(10.0, max(0.0, gap_score)), 2)


def _compute_seasonal_score(cluster: dict, current_month: int, niche: str = "automotive") -> tuple[float, bool]:
    """
    Signal 3: Seasonal demand (20% weight).
    Uses niche_config.py SEASONAL_CALENDAR for the active niche.
    Returns (score 0-10, is_boosted bool).
    """
    topic = cluster.get("topic", "")

    # Use niche_config if available, otherwise fall back to hardcoded automotive calendar
    if _NICHE_CONFIG_AVAILABLE:
        multiplier = get_seasonal_multiplier(niche, topic, current_month)
    else:
        month_boosts = SEASONAL_CALENDAR.get(current_month, {})
        multiplier = month_boosts.get(topic, 1.0)

    is_boosted = multiplier > 1.0

    # Convert multiplier to a score: 1.0 = 5.0, 1.45 = 10.0
    score = min(10.0, (multiplier - 1.0) / 0.45 * 5.0 + 5.0)
    return round(score, 2), is_boosted


def _compute_breakout_score(cluster: dict) -> float:
    """
    Signal 4: Breakout outlier detection (15% weight).
    Detects videos massively outperforming their channel average.
    Score range: 0-10.
    """
    top_videos = cluster.get("top_videos", [])
    if not top_videos:
        return 5.0

    # Average breakout_probability across top videos
    probs = [float(v.get("breakout_probability", 0.0) or 0.0) for v in top_videos]
    if not probs:
        return 5.0

    avg_breakout_prob = sum(probs) / len(probs)
    # breakout_probability is 0-1 → scale to 0-10
    return round(min(10.0, avg_breakout_prob * 10.0), 2)


def _classify_window(trending_score: float, search_gap_score: float, is_seasonal: bool) -> str:
    """Classify the opportunity timing window."""
    if trending_score >= 7.5:
        return "URGENT"
    elif search_gap_score >= 7.0:
        return "EVERGREEN"
    elif is_seasonal:
        return "SEASONAL"
    else:
        return "NICHE"


def main(niche: str = "automotive"):
    """
    Loads cluster data, scores using 4 production signals, ranks them,
    prints a summary, and saves the ranked list.
    """
    resolved = resolve_niche(niche)
    paths = get_paths(resolved)
    paths.ensure_dirs()

    log.info("Opportunity scorer running for niche: %s", resolved)
    input_file = paths.clusters
    output_file = paths.opportunities
    db_file = paths.db
    
    if not input_file.exists():
        log.error(f"Input file not found: {input_file}")
        log.error("Please run cluster_research.py first.")
        return

    log.info(f"Loading cluster data from {input_file.name}...")
    with input_file.open("r", encoding="utf-8") as f:
        cluster_data = json.load(f)

    clusters = cluster_data.get("all_clusters_ranked", [])
    if not clusters:
        log.warning("No clusters found in the input file.")
        return

    # Fetch velocity trends from DB
    trends = {}
    if get_cluster_trends and db_file.exists():
        log.info("Fetching cluster trends from database for velocity analysis...")
        try:
            conn = sqlite3.connect(db_file)
            cursor = conn.cursor()
            trend_data = get_cluster_trends(cursor)
            conn.close()
            trends = {str(t['cluster_id']): t for t in trend_data}
            log.info(f"Found trend data for {len(trends)} clusters.")
        except Exception as e:
            log.error(f"Failed to get cluster trends from DB: {e}")
    else:
        log.warning("Cluster trend analysis disabled (DB or function not available).")

    current_month = datetime.now().month
    log.info(f"Running opportunity scoring for month {current_month} (seasonal calendar active).")

    opportunities = []

    for c in clusters:
        metrics   = c.get("opportunity_metrics", {})
        base_score = float(metrics.get("opportunity_score", 0.0))

        # Compute 4 signals
        trending_score               = _compute_trending_velocity_score(c, trends)
        search_gap_score             = _compute_search_gap_score(c)
        seasonal_score, is_seasonal  = _compute_seasonal_score(c, current_month, resolved)
        breakout_score               = _compute_breakout_score(c)

        # Weighted composite final score
        final_score = (
            trending_score   * WEIGHT_TRENDING_VELOCITY +
            search_gap_score * WEIGHT_SEARCH_GAP        +
            seasonal_score   * WEIGHT_SEASONAL          +
            breakout_score   * WEIGHT_BREAKOUT
        )
        final_score = round(min(10.0, final_score), 2)

        # Classify window
        window = _classify_window(trending_score, search_gap_score, is_seasonal)

        # Determine trend direction label
        trend_info = trends.get(str(c.get("cluster_id", "")))
        if trend_info:
            delta = trend_info.get("score_delta", 0.0)
            trend_velocity = "RISING" if delta > 0.5 else ("FALLING" if delta < -0.5 else "STABLE")
        else:
            trend_velocity = "STABLE"

        opportunities.append({
            "cluster_id":      c.get("cluster_id"),
            "cluster_label":   c.get("cluster_label"),
            "topic":           c.get("topic"),
            "video_count":     c.get("video_count", 0),
            "channels":        c.get("channels", 0),
            "top_videos":      c.get("top_videos", []),

            # Raw opportunity metrics (passed through for brief_personalizer)
            "opportunity_metrics": metrics,
            "demand":          metrics.get("demand", 0.0),
            "competition":     metrics.get("competition", 0.0),

            # 4 production signals
            "trending_score":    trending_score,
            "search_gap_score":  search_gap_score,
            "seasonal_score":    seasonal_score,
            "breakout_score":    breakout_score,

            # Composite
            "base_score":        base_score,
            "final_score":       final_score,

            # Metadata
            "seasonal_boost":    is_seasonal,
            "trend_velocity":    trend_velocity,
            "window":            window,
        })

    # Re-rank by final_score
    opportunities.sort(key=lambda x: x["final_score"], reverse=True)

    # Print top 10 summary
    log.info("")
    log.info("━━━━ Top 10 Opportunities ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    log.info(f"{'Rank':<5} {'Cluster':<32} {'Final':>6} {'Trend':>6} {'Gap':>6} {'Season':>7} {'Breakout':>8} {'Window':<10}")
    log.info("-" * 90)
    for i, opp in enumerate(opportunities[:10], 1):
        log.info(
            f"{i:<5} {opp['cluster_label']:<32.32} "
            f"{opp['final_score']:>6.1f} "
            f"{opp['trending_score']:>6.1f} "
            f"{opp['search_gap_score']:>6.1f} "
            f"{opp['seasonal_score']:>7.1f} "
            f"{opp['breakout_score']:>8.1f} "
            f"{opp['window']:<10}"
        )
    log.info("-" * 90)

    if opportunities:
        top = opportunities[0]
        log.info(
            f"\n🥇 Top opportunity: '{top['cluster_label']}' "
            f"— Final score {top['final_score']}/10 "
            f"| Window: {top['window']} "
            f"| Trend: {top['trend_velocity']}"
        )

    with output_file.open("w", encoding="utf-8") as f:
        json.dump(opportunities, f, indent=2, ensure_ascii=False)
    log.info(f"\nSaved {len(opportunities)} ranked opportunities → {output_file.name}")
    log.info(f"Signal weights: velocity={WEIGHT_TRENDING_VELOCITY:.0%}, gap={WEIGHT_SEARCH_GAP:.0%}, seasonal={WEIGHT_SEASONAL:.0%}, breakout={WEIGHT_BREAKOUT:.0%}")

    # Write scored opportunities to Supabase
    if _SUPABASE_AVAILABLE and opportunities:
        sb_written = 0
        for opp in opportunities:
            try:
                cluster_uuid = _sb_upsert_cluster(
                    {"cluster_id": opp["cluster_id"], "cluster_label": opp["cluster_label"],
                     "topic": opp["topic"], "video_count": opp["video_count"]},
                    niche_slug=resolved,
                )
                if cluster_uuid:
                    _sb_upsert_opportunity(opp, cluster_id=cluster_uuid, niche_slug=resolved)
                    sb_written += 1
            except Exception as e:
                log.error("Supabase opportunity write failed (non-fatal): %s", e)
        log.info("Wrote %d/%d opportunities to Supabase", sb_written, len(opportunities))


if __name__ == "__main__":
    import sys
    niche_arg = sys.argv[1] if len(sys.argv) > 1 else "automotive"
    main(niche=niche_arg)