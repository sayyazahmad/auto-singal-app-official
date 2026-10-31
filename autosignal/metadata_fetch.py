"""
metadata_fetch.py
=================
Semantic-First Niche Discovery Engine.
Phase 1 of the Advanced YouTube Analytics Pipeline.

Replaces legacy keyword-search with:
1. Seed Graph Discovery (Zero-cost, high signal)
2. Category Discovery (Broad trends)
3. Semantic Filtering (Embedding-based relevance scoring)
"""

import os
import json
import time
import logging
import concurrent.futures
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-8s %(message)s")
log = logging.getLogger(__name__)

try:
    from niche_config import get_niche_config, get_refresh_interval_days
    _NICHE_CONFIG_AVAILABLE = True
except ImportError:
    _NICHE_CONFIG_AVAILABLE = False
    def get_niche_config(niche):
        return {}
    def get_refresh_interval_days(niche):
        return 7

# Semantic embedding stack — optional. Only SemanticFilter (semantic
# scoring/embedding of candidates) needs it; the admission gates, scoring, and
# discovery functions are pure logic and must remain importable without it.
# A missing/hanging install therefore degrades the pipeline to non-semantic
# discovery (matching the graceful-degradation contract in requirements.txt)
# instead of crashing the whole module at import time.
try:
    import numpy as np
    from sentence_transformers import SentenceTransformer
    _HAS_SEMANTIC_STACK = True
except ImportError:
    _HAS_SEMANTIC_STACK = False
    np = None  # type: ignore[assignment]
    SentenceTransformer = None  # type: ignore[assignment]
    log.warning(
        "numpy / sentence-transformers not installed — semantic filtering is "
        "disabled; pipeline degrades to non-semantic discovery. "
        "Install with: pip install numpy sentence-transformers"
    )

# API keys are loaded by youtube_api_utils on import — no need to duplicate here.

from youtube_api_utils import (
    get_api_key,
    request_with_retry,
    parse_video
)
from pipeline_paths import get_paths, resolve_niche
from niche_config import get_niche_config

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────
OUTPUT_FILE = "top_100_videos.json"
MIN_DURATION_SECONDS = 3 * 60
MAX_DISCOVERY_LIMIT = 2000  # Prevent API blowout during discovery
DISCOVERED_CHANNELS_FILE = "discovered_channels.json"
SEED_CHANNELS_FILE = "seed_channels.json"

# ─────────────────────────────────────────────
# ADMISSION GATES (data-backed)
# ─────────────────────────────────────────────
# These gates filter JUNK, not performance. A video is admitted if it is
# genuinely on-niche, is a real substantive video (not a short/clip),
# and has minimum audience signal. Performance is SCORED downstream —
# we never hard-reject a small-channel outlier just because it has few views,
# because that is the product's core thesis.
#
# Thresholds derived from the production dataset distribution:
#   productivity repair_similarity: min 0.20, p25 0.29, median 0.40.
#   The old 0.20 floor admitted ~100% of candidates (it equalled the minimum).
#   The new floors sit between p25 and median, trimming the noisy tail while
#   keeping the long-tail of legitimate small-channel content.
MIN_RELEVANCE_BY_NICHE = {
    "automotive":   0.35,   # stricter — automotive has a mature centroid model
    "finance":      0.32,
    "technology":   0.30,
    "productivity": 0.30,
}
DEFAULT_MIN_RELEVANCE = 0.30

# Maximum video age (days) for admission. Niche-aware: evergreen how-to content
# (a 2018 oil-change tutorial is still correct) tolerates age, but fast-moving
# niches decay — an AI-tools video from 2 years ago is misinformation today.
# Data-backed: the production productivity dataset had a median age of 1,381 days
# (3.8 years), 53% of it over 3 years old — this gate trims that stale tail.
MAX_AGE_DAYS_BY_NICHE = {
    "automotive":   1095,   # 3 years — evergreen repair/how-to rarely goes stale
    "productivity": 730,    # 2 years — systems & routines decay moderately
    "finance":      540,    # ~18 months — tax rules, markets, rates change
    "technology":   365,    # 1 year — AI/SaaS tooling moves fastest
}
DEFAULT_MAX_AGE_DAYS = 730

# A video must clearly read as on-niche MORE than it reads as off-niche noise.
# positive similarity must beat negative similarity by at least this margin.
MIN_RELEVANCE_MARGIN = 0.08

# Substance gates — reject videos that are technically "on niche" but carry no
# useful content (shorts repackaged as videos, near-empty descriptions, etc.)
MIN_ENGAGEMENT_SCORE = 0.004   # ~4 engagements per 1000 views — below = dead/bot content
MIN_TITLE_LENGTH = 15          # rejects gibberish / placeholder titles

# A video must have at least this much audience signal to be worth analysing.
# Set LOW so small-channel outliers survive — outlier status is scored, not gated.
MIN_VIEW_COUNT = 1000

# ─────────────────────────────────────────────
# WINNER POLICY (Gate 7) — keep only videos that teach a lesson
# ─────────────────────────────────────────────
# A video enters the dataset only if it is a proven "winner" of at least one
# kind. Average evergreen videos (old + slow + unexceptional — ~77% of a naive
# automotive pull) teach nothing and dilute the briefs, so they are rejected
# here rather than merely down-scored.
#
# A video is ADMITTED if ANY of these is true:
#   1. VIRAL          — VPH in the top VIRAL_PERCENTILE of its AGE BUCKET.
#                       Thresholds are DERIVED from the candidate distribution,
#                       not hardcoded, so they auto-adapt to any niche (gaming
#                       has far higher VPH than woodworking; finance behaves
#                       differently from automotive). A new niche needs no tuning.
#   2. OUTLIER        — views >= OUTLIER_MULTIPLE × the channel's per-video avg.
#                       Catches small-channel breakouts (3K views on a 500-sub
#                       channel) that viral velocity alone would miss.
#   3. EVERGREEN WIN  — older than EVERGREEN_MIN_AGE_DAYS AND accumulated views
#                       >= EVERGREEN_WIN_MULTIPLE × channel avg (search-driven).
#
# IMPORTANT: the viral threshold cannot be decided per-video — it needs the full
# candidate pool first (to compute per-bucket VPH percentiles). So the winner
# gate is applied in a SECOND PASS over all candidates that passed gates 1–6,
# via apply_winner_policy(), NOT inside passes_admission_gates().

# Viral = top VIRAL_PERCENTILE of VPH within each age bucket.
# 0.15 = top 15%. Adaptive: a 100-video bucket needs VPH >= its 85th percentile;
# a 5-video bucket keeps the single fastest. See _age_bucket_for_velocity().
VIRAL_PERCENTILE        = 0.15

# Age buckets for the viral-velocity distribution. VPH decays ~10× from week 1
# to month 6, so videos are only compared against same-age peers (a 3-day-old
# video at 100 VPH is viral; a 6-month-old video at 100 VPH is exceptional).
AGE_BUCKETS = [
    ("fresh",       7),     # 0–6 days
    ("recent",     30),     # 7–29 days
    ("established",180),    # 30–179 days
    ("mature",     365),    # 180–364 days
    # 365d+ has no viral bucket — old videos can only qualify as outlier / evergreen winner.
]

OUTLIER_MULTIPLE         = 3.0     # views >= 3× channel avg = breakout
EVERGREEN_MIN_AGE_DAYS   = 180     # only old videos can be evergreen winners
EVERGREEN_WIN_MULTIPLE   = 5.0     # and only if >= 5× channel avg (real demand)

# Minimum candidates in an age bucket before percentile is meaningful.
# Below this we fall back to the outlier/evergreen rules (no viral admits from
# tiny buckets — a 2-video bucket's "top 15%" is noise).
MIN_BUCKET_SIZE_FOR_VIRAL = 5

# ─────────────────────────────────────────────
# SEMANTIC FILTERING CONFIG
# ─────────────────────────────────────────────
# These act as gravitational centers for cosine similarity
CENTROIDS = {
    "diagnostics": "obd2 scan tool live data electrical troubleshooting wiring diagram multimeter check engine light",
    "repair": "engine replacement fix leaking broken part installation removal how to fix",
    "rebuilds": "complete engine teardown transmission overhaul block machining rebuild",
    "maintenance": "oil change fluid flush brake pad rotor replacement regular service filter replacement",
    "oil_change": "oil change synthetic conventional motor oil drain plug oil filter how often",
    "brake_service": "brake pad replacement rotor resurfacing brake fluid flush caliper brake job diy",
    "coolant_service": "coolant flush antifreeze change radiator drain refill thermostat overheating",
    "air_filter": "air filter replacement cabin filter engine air filter dirty clogged intake",
    "transmission_service": "transmission fluid change drain fill pan drop filter automatic manual",
    "spark_plugs": "spark plug replacement ignition coil misfire rough idle timing tune up",
    "diesel": "cummins powerstroke duramax def dpf delete injector heavy duty diesel",
    "heavy_equipment": "excavator loader tractor hydraulics caterpillar john deere",
    "restoration": "classic car frame off rust repair panel welding painting barn find"
}

# Explicit maintenance search queries — ensures maintenance content
# has equal representation alongside repair content in the dataset
MAINTENANCE_SEARCH_QUERIES = [
    "oil change how to DIY",
    "air filter replacement DIY",
    "brake fluid flush DIY",
    "coolant flush antifreeze change",
    "transmission fluid change DIY",
    "spark plug replacement how to",
    "cabin air filter replacement",
    "brake pad replacement DIY",
    "tire rotation how to",
    "battery replacement car",
    "wiper blade replacement",
    "power steering fluid flush",
]

class SemanticFilter:
    def __init__(self, niche: str = "automotive"):
        if not _HAS_SEMANTIC_STACK:
            raise RuntimeError(
                "SemanticFilter requires numpy + sentence-transformers, which "
                "are not installed in this environment. Either install them "
                "(pip install numpy sentence-transformers) or run the pipeline "
                "in non-semantic mode."
            )
        self.niche = niche
        log.info("Loading SentenceTransformer for semantic filtering...")
        self.model = SentenceTransformer("all-MiniLM-L6-v2")
        self._score_cache = {}

        neg_anchors = []
        if _NICHE_CONFIG_AVAILABLE:
            niche_cfg = get_niche_config(niche)
            self.centroids = niche_cfg.get("centroids", CENTROIDS)
            neg_anchors = niche_cfg.get("negative_anchors", [])
        else:
            self.centroids = CENTROIDS

        self.topics = list(self.centroids.keys())
        pos_texts = list(self.centroids.values())

        # Fallback if config is missing
        if not neg_anchors:
            log.warning("No negative_anchors in niche_config for '%s', using generic fallback.", niche)
            neg_anchors = ["podcast", "vlog", "gaming", "reaction", "commentary", "drama"]

        self.pos_embeddings = self.model.encode(pos_texts, convert_to_numpy=True, normalize_embeddings=True)
        self.neg_embeddings = self.model.encode(neg_anchors, convert_to_numpy=True, normalize_embeddings=True)

    def score_videos_batch(self, videos: list[dict]) -> list[dict]:
        """Scores a batch of videos efficiently using vectorized embeddings."""
        if not videos:
            return []
            
        texts = [f"{v.get('title', '')} {v.get('description', '')[:500]}" for v in videos]
        # Batch encode all texts at once
        embeddings = self.model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
        
        results = []
        for vec in embeddings:
            # Calculate cosine similarities
            pos_scores = np.dot(self.pos_embeddings, vec)
            neg_scores = np.dot(self.neg_embeddings, vec)
            
            best_pos_idx = np.argmax(pos_scores)
            best_pos_score = float(pos_scores[best_pos_idx])
            best_neg_score = float(np.max(neg_scores))
            
            primary_topic = self.topics[best_pos_idx]
            
            # Core logic: Relevance must beat a threshold AND beat the negative noise
            threshold = 0.35 if self.niche == "automotive" else 0.20
            passed = (best_pos_score > threshold) and (best_pos_score > best_neg_score)
            
            results.append({
                "embedding": vec.tolist(),
                "repair_similarity": round(best_pos_score, 4),
                "junk_similarity": round(best_neg_score, 4),
                "topic_primary": primary_topic if passed else "rejected",
                "topic_confidence": round(best_pos_score, 4),
                "passed": passed
            })
        return results

    def score_video(self, title: str, description: str, video_id: str = None) -> dict:
        """Legacy single-video scoring, delegating to batched for consistency."""
        cache_key = video_id if video_id else hash(title + (description or "")[:100])
        if cache_key in self._score_cache:
            return self._score_cache[cache_key]

        result = self.score_videos_batch([{"title": title, "description": description}])[0]
        self._score_cache[cache_key] = result
        return result

# ─────────────────────────────────────────────
# DISCOVERY ENGINES
# ─────────────────────────────────────────────


def _age_bucket_for_velocity(hours_since_publish: float | None) -> str:
    """Map a video's age to the viral-velocity bucket. 365d+ returns 'evergreen'
    (old videos cannot be viral — they must qualify as outlier/evergreen winner)."""
    if hours_since_publish is None or hours_since_publish <= 0:
        return "mature"
    days = hours_since_publish / 24.0
    for name, upper_days in AGE_BUCKETS:
        if days < upper_days:
            return name
    return "evergreen"


def _filter_recently_crawled(channel_ids: list[str], discovered_file: Path, refresh_days: int) -> list[str]:
    """
    Return the subset of channel_ids NOT crawled within the last refresh_days.

    Reads per-channel last-crawl timestamps from discovered_channels.json. Two
    schema shapes are supported:
      - Rich: {"channel_crawled_at": {channel_id: iso_ts, ...}}  (preferred)
      - Legacy: {"channel_ids": [...], "discovered_at": iso_ts}  (one timestamp
        for the whole batch — every listed channel is treated as crawled then).

    Channels with no recorded timestamp, or an unparseable one, are always kept
    (never block discovery on bad data). On any read error, the full list is
    returned so the guard degrades to a no-op rather than an empty crawl.
    """
    if not channel_ids or refresh_days <= 0:
        return list(channel_ids)

    try:
        if not discovered_file.exists():
            return list(channel_ids)
        with discovered_file.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:
        log.warning("Refresh guard: could not read %s (%s) — skipping guard.", discovered_file.name, exc)
        return list(channel_ids)

    cutoff = datetime.now(timezone.utc) - timedelta(days=refresh_days)

    # Preferred: per-channel timestamps.
    per_channel = data.get("channel_crawled_at") or {}
    if isinstance(per_channel, dict) and per_channel:
        keep: list[str] = []
        for cid in channel_ids:
            ts = per_channel.get(cid)
            if not ts:
                keep.append(cid)  # never seen → crawl
                continue
            try:
                if datetime.fromisoformat(str(ts).replace("Z", "+00:00")) < cutoff:
                    keep.append(cid)  # older than window → re-crawl
            except (ValueError, TypeError):
                keep.append(cid)  # bad ts → crawl (don't block on bad data)
        return keep

    # Legacy fallback: one batch timestamp applies to every listed channel.
    batch_ts = data.get("discovered_at")
    listed = set(data.get("channel_ids") or [])
    if not batch_ts:
        return list(channel_ids)
    try:
        batch_dt = datetime.fromisoformat(str(batch_ts).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return list(channel_ids)
    if batch_dt < cutoff:
        return list(channel_ids)  # whole batch older than window → re-crawl all
    # Batch is fresh → skip only channels present in that batch.
    return [cid for cid in channel_ids if cid not in listed]


def _percentile(values: list[float], pct: float) -> float:
    """Return the pct-th percentile (0–1) of a list of values via linear interp.
    Empty list → 0.0."""
    if not values:
        return 0.0
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    # Linear interpolation between closest ranks
    k = (len(s) - 1) * pct
    f = int(k)
    c = min(f + 1, len(s) - 1)
    if f == c:
        return s[f]
    return s[f] + (s[c] - s[f]) * (k - f)


def apply_winner_policy(candidates: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    Winner Policy (Gate 7) — applied as a SECOND PASS over all candidates that
    already passed semantic gates 1–6. Returns (winners, rejected).

    A candidate is a WINNER if ANY of:
      1. VIRAL — VPH >= the VIRAL_PERCENTILE threshold computed from THIS run's
         candidate distribution, within its age bucket. Thresholds are derived
         per-run, so they auto-adapt to every niche with no manual tuning.
      2. OUTLIER — views >= OUTLIER_MULTIPLE × channel_avg_views.
      3. EVERGREEN WINNER — age > EVERGREEN_MIN_AGE_DAYS AND views >=
         EVERGREEN_WIN_MULTIPLE × channel_avg_views.

    Because the viral rule is distribution-derived, it cannot be evaluated
    one-video-at-a-time — the full candidate pool is required first. That is why
    this is a separate pass rather than part of passes_admission_gates().

    Graceful degradation: when channel_avg_views is missing (enrichment failed),
    only the viral rule can fire. We never silently admit junk, but we also
    don't falsely reject videos whose outlier signal we couldn't measure.
    """
    # ── Derive per-bucket viral VPH thresholds from the candidate distribution ──
    buckets: dict[str, list[float]] = {}
    for v in candidates:
        bucket = _age_bucket_for_velocity(v.get("hours_since_publish"))
        vph = float(v.get("views_per_hour", 0.0) or 0.0)
        buckets.setdefault(bucket, []).append(vph)

    viral_thresholds: dict[str, float] = {}
    for bucket, vphs in buckets.items():
        if len(vphs) < MIN_BUCKET_SIZE_FOR_VIRAL:
            # Too few peers to make a percentile meaningful — no viral admits
            # from this bucket; videos must qualify via outlier/evergreen.
            continue
        viral_thresholds[bucket] = round(_percentile(vphs, 1.0 - VIRAL_PERCENTILE), 2)

    if viral_thresholds:
        thr_desc = ", ".join(f"{b}: {t:.0f} vph" for b, t in sorted(viral_thresholds.items()))
        log.info("Winner policy viral thresholds (top %d%%/bucket): %s", int(VIRAL_PERCENTILE * 100), thr_desc)

    winners: list[dict] = []
    rejected: list[dict] = []
    rule_counts: dict[str, int] = defaultdict(int)

    for v in candidates:
        hours = v.get("hours_since_publish")
        vph = float(v.get("views_per_hour", 0.0) or 0.0)
        views = float(v.get("view_count", 0.0) or 0.0)
        channel_avg = float(v.get("channel_avg_views", 0.0) or 0.0)

        # Rule 1: VIRAL — distribution-derived threshold for this age bucket.
        bucket = _age_bucket_for_velocity(hours)
        floor = viral_thresholds.get(bucket)
        if floor is not None and vph >= floor:
            v["winner_rule"] = f"viral ({bucket}, {vph:.0f} vph ≥ {floor:.0f})"
            winners.append(v)
            rule_counts["viral"] += 1
            continue

        # Rules 2 & 3 need the channel baseline.
        if channel_avg <= 0:
            v["winner_rule"] = None
            v["discard_reason"] = "Admission gate: not a winner (no channel baseline)"
            rejected.append(v)
            rule_counts["no_baseline"] += 1
            continue

        # Rule 2: OUTLIER — breakout vs the channel's own per-video average.
        if views >= channel_avg * OUTLIER_MULTIPLE:
            v["winner_rule"] = f"outlier ({views/channel_avg:.1f}× channel avg)"
            winners.append(v)
            rule_counts["outlier"] += 1
            continue

        # Rule 3: EVERGREEN WINNER — old AND accumulated exceptional demand.
        if hours is not None and hours / 24.0 >= EVERGREEN_MIN_AGE_DAYS:
            if views >= channel_avg * EVERGREEN_WIN_MULTIPLE:
                v["winner_rule"] = f"evergreen winner ({views/channel_avg:.1f}× channel avg, {int(hours/24)}d old)"
                winners.append(v)
                rule_counts["evergreen"] += 1
                continue

        # Failed all three rules — average evergreen, teaches nothing.
        v["winner_rule"] = None
        v["discard_reason"] = "Admission gate: not a winner (average performance)"
        rejected.append(v)
        rule_counts["average"] += 1

    log.info(
        "Winner policy: %d admitted, %d rejected. Rules: %s",
        len(winners), len(rejected), dict(rule_counts),
    )
    return winners, rejected


def passes_admission_gates(video: dict, semantic_scores: dict, niche: str = "automotive") -> tuple[bool, str]:
    """
    Decide whether a discovered video deserves to enter the dataset.

    Philosophy: these gates filter JUNK (off-niche, non-substantive, dead
    content), NOT performance. A small-channel outlier with 3K views on a
    500-sub channel must PASS these gates — its outperformance is the product's
    core signal and is SCORED downstream, never hard-rejected on view count.

    NOTE: the winner/performance policy is a SEPARATE pass (apply_winner_policy)
    because its viral threshold is distribution-derived and needs the full
    candidate pool. This function only runs gates 1–6 (relevance, substance, age,
    audience signal) which are all per-video checks.

    Returns (passed, reason_if_rejected). Every rejection carries a human-readable
    reason so discarded_videos.json stays auditable.
    """
    # Gate 1: Relevance floor — niche-specific, above the dataset's noisy tail.
    relevance = float(semantic_scores.get("repair_similarity", 0.0))
    min_rel = MIN_RELEVANCE_BY_NICHE.get(niche, DEFAULT_MIN_RELEVANCE)
    if relevance < min_rel:
        return False, f"relevance {relevance:.3f} < {min_rel} (off-niche)"

    # Gate 2: Relevance margin — must clearly beat the off-niche noise floor.
    junk = float(semantic_scores.get("junk_similarity", 0.0))
    if relevance - junk < MIN_RELEVANCE_MARGIN:
        return False, f"relevance margin {relevance-junk:.3f} < {MIN_RELEVANCE_MARGIN} (ambiguous)"

    # Gate 3: Substance — title length (rejects placeholders/gibberish).
    title = str(video.get("title", "") or "")
    if len(title) < MIN_TITLE_LENGTH:
        return False, f"title too short ({len(title)} chars)"

    # Gate 4: Substance — engagement floor (rejects dead/bot/repackaged content).
    engagement = float(video.get("engagement_score", 0.0) or 0.0)
    if engagement < MIN_ENGAGEMENT_SCORE:
        return False, f"engagement {engagement:.4f} < {MIN_ENGAGEMENT_SCORE} (dead content)"

    # Gate 5: Age — niche-aware freshness floor. Rejects evergreen-stale content
    # in fast-moving niches (a 3-year-old AI tools video is misinformation) while
    # keeping durable how-to in evergreen niches. Without this the productivity
    # dataset admitted a median age of 3.8 years.
    age_days = video.get("hours_since_publish")
    if age_days is not None:
        max_age = MAX_AGE_DAYS_BY_NICHE.get(niche, DEFAULT_MAX_AGE_DAYS)
        if age_days / 24.0 > max_age:
            return False, f"age {int(age_days/24)}d > {max_age}d (stale)"

    # Gate 6: Minimum audience signal — deliberately LOW to preserve small-channel
    # outliers. Real junk (0-100 views repackaged shorts) is cut; a genuine
    # small-channel video at 1-3K views survives and its outlier status is scored.
    view_count = int(video.get("view_count", 0) or 0)
    if view_count < MIN_VIEW_COUNT:
        return False, f"views {view_count} < {MIN_VIEW_COUNT} (no audience signal)"

    # NOTE: the winner/performance policy is intentionally NOT here. It runs as
    # apply_winner_policy() in a second pass over all gates-1–6 survivors,
    # because its viral threshold is distribution-derived and needs the full
    # candidate pool. See main().
    return True, ""


def fetch_category_videos(api_key: str, category_id: str = "2", max_pages: int = 5) -> list[str]:
    """Fetch recent popular videos from the Autos & Vehicles category."""
    log.info("Discovering videos via YouTube Category: %s", category_id)
    video_ids = []
    page_token = None
    
    for _ in range(max_pages):
        params = {
            "key": api_key,
            "part": "id",
            "chart": "mostPopular",
            "videoCategoryId": category_id,
            "maxResults": 50,
            "regionCode": "US" # Adjust as needed
        }
        if page_token:
            params["pageToken"] = page_token
            
        data = request_with_retry("https://www.googleapis.com/youtube/v3/videos", params=params)
        if not data: break
        
        video_ids.extend([item["id"] for item in data.get("items", []) if isinstance(item.get("id"), str)])
        page_token = data.get("nextPageToken")
        if not page_token: break
        time.sleep(0.2)
        
    return video_ids

def search_videos(api_key: str, query: str, max_results: int = 50) -> list[str]:
    """Targeted search to find specific content types when trending charts are too noisy."""
    params = {
        "key": api_key,
        "q": query,
        "part": "id",
        "type": "video",
        "maxResults": max_results,
        "relevanceLanguage": "en"
    }
    data = request_with_retry("https://www.googleapis.com/youtube/v3/search", params=params)
    if not data: return []
    # Search returns a nested id object
    return [item["id"]["videoId"] for item in data.get("items", []) if item.get("id", {}).get("kind") == "youtube#video"]

def discover_seed_channels(api_key: str, semantic_filter: SemanticFilter, max_channels: int = 15) -> list[str]:
    """
    Autonomously find the top seed channels without keyword search!
    We pull trending videos from the Autos & Vehicles category (id 2),
    filter them semantically for our sub-niche, and extract the highest-scoring channels.
    """
    log.info("Autonomously discovering Top Seed Channels via Category 2 (Zero Keyword Bias)...")
    
    # Get recent videos from the category
    category_video_ids = fetch_category_videos(api_key, category_id="2", max_pages=10)
    if not category_video_ids:
        return []
        
    # Hydrate metadata
    raw_items = fetch_video_metadata(api_key, category_video_ids)
    
    channel_scores = defaultdict(float)
    
    for item in raw_items:
        snippet = item.get("snippet", {})
        title = snippet.get("title", "")
        desc = snippet.get("description", "")
        channel_id = snippet.get("channelId")
        video_id = item.get("id")
        
        if not channel_id: continue
        
        # Evaluate how "mechanic-focused" this video is
        scores = semantic_filter.score_video(title, desc, video_id=video_id)
        if scores["passed"]:
            # Aggregate the repair similarity score for the channel
            channel_scores[channel_id] += scores["repair_similarity"]

    # Sort channels by their total semantic relevance
    sorted_channels = sorted(channel_scores.items(), key=lambda x: x[1], reverse=True)
    top_channels = [cid for cid, score in sorted_channels[:max_channels]]
    
    log.info("Found %d high-signal seed channels purely from semantic category filtering.", len(top_channels))
    return top_channels

def _fetch_playlist_videos(api_key: str, playlist_id: str, max_pages: int = 2) -> list[str]:
    """Helper to fetch video IDs from a single playlist."""
    video_ids = []
    page_token = None
    for _ in range(max_pages):
        p_params = {
            "key": api_key,
            "playlistId": playlist_id,
            "part": "contentDetails",
            "maxResults": 50
        }
        if page_token:
            p_params["pageToken"] = page_token
        p_data = request_with_retry("https://www.googleapis.com/youtube/v3/playlistItems", params=p_params)
        if not p_data:
            break
        video_ids.extend([it["contentDetails"]["videoId"] for it in p_data.get("items", []) if it.get("contentDetails", {}).get("videoId")])
        page_token = p_data.get("nextPageToken")
        if not page_token:
            break
    return video_ids

def fetch_seed_channel_uploads(api_key: str, channel_ids: list[str]) -> list[str]:
    """Fetch videos from trusted seed channels via the 'uploads' playlist."""
    log.info("Fetching complete upload history for %d Seed Channels...", len(channel_ids))
    playlist_ids = []

    # 1. Get upload playlist IDs in batches of 50 (API limit)
    for i in range(0, len(channel_ids), 50):
        batch_ids = channel_ids[i:i+50]
        params = {"key": api_key, "id": ",".join(batch_ids), "part": "contentDetails"}
        data = request_with_retry("https://www.googleapis.com/youtube/v3/channels", params=params)
        if data:
            for item in data.get("items", []):
                playlist_id = item.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
                if playlist_id:
                    playlist_ids.append(playlist_id)
        time.sleep(0.2) # Be a good API citizen between batches

    # 2. Fetch videos from all playlists in parallel
    video_ids = []
    # Cap workers to avoid overwhelming the API
    max_workers = min(20, len(playlist_ids) or 1)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_playlist = {executor.submit(_fetch_playlist_videos, api_key, pid): pid for pid in playlist_ids}
        for future in concurrent.futures.as_completed(future_to_playlist):
            try:
                video_ids.extend(future.result())
            except Exception as e:
                log.warning("Error fetching playlist videos: %s", e)
    return video_ids



def _fetch_metadata_batch(api_key: str, batch: list[str]) -> list[dict]:
    params = {
        "key": api_key,
        "id": ",".join(batch),
        "part": "snippet,statistics,contentDetails"
    }
    data = request_with_retry("https://www.googleapis.com/youtube/v3/videos", params=params)
    if data:
        return data.get("items", [])
    return []

def fetch_video_metadata(api_key: str, video_ids: list[str]) -> list[dict]:
    """Hydrate video IDs with full metadata."""
    items = []
    batches = [video_ids[i:i+50] for i in range(0, len(video_ids), 50)]

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(_fetch_metadata_batch, api_key, batch): batch for batch in batches}
        for future in concurrent.futures.as_completed(futures):
            try:
                batch_items = future.result()
                items.extend(batch_items)
            except Exception as e:
                log.warning("Error fetching metadata batch: %s", e)

    return items


def fetch_channel_statistics(api_key: str, channel_ids: list[str]) -> dict[str, dict]:
    """
    Fetch subscriber count, total views, and video count for each channel.

    This is the single most important enrichment in the pipeline: without
    channel_subscriber_count the platform CANNOT compute outlier performance
    (a 100K-view video on a 5K-sub channel vs a 5M-view video on a huge channel),
    which is the product's core thesis. It also cannot build accurate cohort
    buckets for normalization.

    Batches 50 channels per call (API limit). Non-fatal on partial failure.
    Returns {channel_id: {subscriber_count, total_views, video_count, avg_views}}.
    """
    if not channel_ids:
        return {}

    unique_ids = list(dict.fromkeys(channel_ids))  # dedupe, preserve order
    stats: dict[str, dict] = {}
    batches = [unique_ids[i:i+50] for i in range(0, len(unique_ids), 50)]

    log.info("Fetching channel statistics for %d unique channels...", len(unique_ids))
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(_fetch_channel_stats_batch, api_key, batch): batch for batch in batches}
        for future in concurrent.futures.as_completed(futures):
            try:
                stats.update(future.result())
            except Exception as e:
                log.warning("Channel stats batch failed (non-fatal): %s", e)

    enriched = sum(1 for v in stats.values() if v.get("subscriber_count", 0) > 0)
    log.info("Enriched %d/%d channels with subscriber statistics.", enriched, len(unique_ids))
    return stats


def _fetch_channel_stats_batch(api_key: str, batch: list[str]) -> dict[str, dict]:
    """Fetch statistics for up to 50 channels in one call."""
    params = {
        "key": api_key,
        "id": ",".join(batch),
        "part": "statistics",
    }
    data = request_with_retry("https://www.googleapis.com/youtube/v3/channels", params=params)
    if not data:
        return {}

    result: dict[str, dict] = {}
    for item in data.get("items", []):
        cid = item.get("id")
        s = item.get("statistics", {})
        total_views = int(s.get("viewCount", 0) or 0)
        video_count = int(s.get("videoCount", 1) or 1)
        result[cid] = {
            "subscriber_count": int(s.get("subscriberCount", 0) or 0),
            "total_views": total_views,
            "video_count": video_count,
            # Channel-average views per video — used as the outperformance baseline
            "avg_views": round(total_views / max(video_count, 1)),
        }
    return result

# ─────────────────────────────────────────────
# MAIN PIPELINE
# ─────────────────────────────────────────────

def main(niche: str = "automotive"):
    niche = resolve_niche(niche)
    paths = get_paths(niche)
    paths.ensure_dirs()

    log.info("metadata_fetch running for niche: %s", niche)
    log.info("═══ Semantic-First YouTube Discovery Engine ═══")
    api_key = get_api_key()
    semantic_filter = SemanticFilter(niche=niche)
    
    # Stage 1 & 2: DISCOVERY & DEDUPLICATION
    discovery_map = defaultdict(set)
    
    # ── Step A: Seed channels (niche config first; seed_channels.json is a
    #           fallback ONLY when the niche has no dedicated seeds defined) ──
    core_seeds = list(get_niche_config(niche).get("seed_channels") or [])
    seed_file_path = os.path.join(os.path.dirname(__file__), SEED_CHANNELS_FILE)
    # Only load the global seed_channels.json when this niche has NO dedicated
    # seed channels. The file currently contains tech/finance/productivity channels
    # which would cause 100% semantic rejection for the automotive niche.
    if not core_seeds and os.path.exists(seed_file_path):
        try:
            with open(seed_file_path, "r", encoding="utf-8") as f:
                seed_data = json.load(f)
                file_seeds = seed_data.get("channel_ids", [])
            core_seeds = list(dict.fromkeys(file_seeds + core_seeds))
            log.info("Loaded %d seed channels from %s (fallback)", len(file_seeds), SEED_CHANNELS_FILE)
        except (json.JSONDecodeError, ValueError):
            log.warning("Seed channel file %s is empty or malformed.", SEED_CHANNELS_FILE)
    
    if not core_seeds:
        core_seeds = discover_seed_channels(api_key, semantic_filter, max_channels=15)
    
    seed_vids = []
    if core_seeds:
        # ── Skip-already-fetched guard ────────────────────────────────────────
        # Don't re-crawl channels already processed within the niche's refresh
        # window. Each niche has a configurable interval (high-priority 3d,
        # normal 7d, low-activity 14d). Saves quota; brand-new channels always
        # crawled. Channels whose last-crawl timestamp is missing/old are kept.
        refresh_days = get_refresh_interval_days(niche)
        fresh_channels = _filter_recently_crawled(core_seeds, paths.discovered_channels, refresh_days)
        skipped = len(core_seeds) - len(fresh_channels)
        if skipped:
            log.info("Refresh guard: skipping %d channels crawled within %dd (keeping %d).",
                     skipped, refresh_days, len(fresh_channels))
        seed_vids = fetch_seed_channel_uploads(api_key, fresh_channels)
        for vid in seed_vids:
            discovery_map[vid].add("seed_channel")
            
    # ── Step B: Category Broad Trends ──
    category_id = "2"
    if niche == "finance": category_id = "27"
    elif niche == "technology": category_id = "28"
    elif niche == "productivity": category_id = "27"
    cat_vids = fetch_category_videos(api_key, category_id=category_id)
    for vid in cat_vids:
        discovery_map[vid].add("category")

    # ── Step C: Targeted Maintenance Injection ──
    # If yield is low or we want to ensure high-signal repair data, use the defined queries
    log.info("Injecting targeted niche search queries to boost yield...")
    search_queries = []
    if niche == "automotive":
        search_queries = MAINTENANCE_SEARCH_QUERIES[:8]
    elif niche == "finance":
        search_queries = ["stock market investing", "personal finance budgeting", "crypto news", "real estate investing", "passive income ideas", "side hustle ideas"]
    elif niche == "technology":
        search_queries = ["ai tools", "software engineering", "coding tutorial", "saas review", "chatgpt tutorial"]
    elif niche == "productivity":
        search_queries = ["time management tips", "notion setup", "study with me", "morning routine", "productivity system"]

    for query in search_queries:
        search_vids = search_videos(api_key, query)
        for vid in search_vids:
            discovery_map[vid].add("targeted_search")
            
    unique_ids = list(discovery_map.keys())[:MAX_DISCOVERY_LIMIT]
    log.info("Total unique videos discovered across all sources: %d", len(unique_ids))
    
    # Fetch Metadata
    log.info("Hydrating video metadata...")
    raw_items = fetch_video_metadata(api_key, unique_ids)

    parsed_videos = []
    for item in raw_items:
        v = parse_video(item)
        if v and v.get("duration_seconds", 0) >= MIN_DURATION_SECONDS:
            v["discovery_sources"] = list(discovery_map[v["video_id"]])
            parsed_videos.append(v)

    log.info("Videos matching baseline criteria (duration): %d", len(parsed_videos))

    # ── Channel-level enrichment ──────────────────────────────────────────────
    # Fetch subscriber counts + channel average views for every unique channel.
    # Without this, outlier performance (the product's core thesis) is impossible.
    # This runs ONCE per channel regardless of how many of its videos we found.
    all_channel_ids = [v.get("channel_id") for v in parsed_videos if v.get("channel_id")]
    channel_stats = fetch_channel_statistics(api_key, all_channel_ids)
    for v in parsed_videos:
        cstat = channel_stats.get(v.get("channel_id", ""))
        if cstat:
            v["channel_subscriber_count"] = cstat["subscriber_count"]
            v["channel_total_views"] = cstat["total_views"]
            v["channel_total_videos"] = cstat["video_count"]
            v["channel_avg_views"] = cstat["avg_views"]
            # Subscriber efficiency: views relative to channel size.
            # >1.0 = video outperforms what the channel's audience alone would guarantee.
            subs = cstat["subscriber_count"]
            if subs > 0:
                v["views_to_subs_ratio"] = round(v.get("view_count", 0) / subs, 4)
            else:
                v["views_to_subs_ratio"] = 0.0

    # Stage 3: ADMISSION GATES (1–6) + SEMANTIC SCORING
    # Gates 1–6 are per-video checks (relevance, substance, age, audience signal).
    # The winner/performance policy (Gate 7) runs as a SEPARATE pass below,
    # because its viral threshold is distribution-derived and needs the full
    # candidate pool — it cannot be decided one video at a time.
    gates_passed = []
    corpus_dataset = []
    rejected_dataset = []

    # Tally rejections by reason for a transparent admission report
    rejection_counts: dict[str, int] = defaultdict(int)

    for v in parsed_videos:
        scores = semantic_filter.score_video(
            v["title"],
            v.get("description", ""),
            video_id=v.get("video_id")
        )
        v.update(scores)  # keep semantic scores on the object either way

        # First check the semantic filter's own coarse pass, then the strict
        # multi-gate admission. Rejected videos get a specific reason for audit.
        if not scores["passed"]:
            v["discard_reason"] = "Semantic filter rejection"
            rejected_dataset.append(v)
            rejection_counts["semantic_filter_reject"] += 1
            continue

        admitted, reason = passes_admission_gates(v, scores, niche=niche)
        if not admitted:
            v["discard_reason"] = f"Admission gate: {reason}"
            rejected_dataset.append(v)
            rejection_counts[reason.split(" <")[0].split(" (")[0]] += 1
            continue

        # Passed gates 1–6 — compute the quality score used for initial ranking.
        # Set on BOTH the scores dict and the video: v.update(scores) ran above
        # (before this key existed), so v must be touched directly here too,
        # otherwise the downstream sort by quality_score raises KeyError.
        quality_score = scores["repair_similarity"] - scores["junk_similarity"]
        scores["quality_score"] = quality_score
        v["quality_score"] = quality_score
        gates_passed.append(v)

    log.info("Gates 1–6: %d candidates passed, %d rejected.", len(gates_passed), len(rejected_dataset))
    if rejection_counts:
        for reason, count in sorted(rejection_counts.items(), key=lambda x: -x[1]):
            log.info("  rejected %4d × %s", count, reason)

    # Stage 3b: WINNER POLICY (Gate 7) — distribution-derived performance filter.
    # Keeps only videos that are viral (top VPH percentile per age bucket), an
    # outlier (≥3× channel avg), or a proven evergreen winner (old + ≥5× avg).
    # Thresholds are computed from THIS run's candidate distribution, so they
    # auto-adapt to any niche with no manual tuning.
    winners, winner_rejected = apply_winner_policy(gates_passed)
    final_dataset = winners
    rejected_dataset.extend(winner_rejected)
    rejection_counts["not_a_winner"] = len(winner_rejected)

    for v in final_dataset:
        corpus_dataset.append({
            "video_id": v["video_id"],
            "title": v["title"],
            "description": v.get("description", "")
        })

    log.info("After winner policy: %d final videos admitted.", len(final_dataset))

    # Save rejected videos for auditing
    if rejected_dataset:
        discard_file = paths.discarded_videos
        existing_discards = []
        if discard_file.exists():
            try:
                with discard_file.open("r", encoding="utf-8") as f:
                    existing_discards = json.load(f).get("discarded", [])
            except Exception:
                pass

        seen_ids = {v.get("video_id") or v.get("id") for v in existing_discards if (v.get("video_id") or v.get("id"))}
        for v in rejected_dataset:
            vid = v.get("video_id") or v.get("id")
            if vid and vid not in seen_ids:
                existing_discards.append(v)
        with discard_file.open("w", encoding="utf-8") as f:
            json.dump({"last_updated": datetime.now(timezone.utc).isoformat(), "discarded": existing_discards}, f, indent=2, ensure_ascii=False)
        log.info("Saved %d rejected videos to %s", len(rejected_dataset), discard_file)

    # Sort by quality score
    # To keep aligned, we need to sort both or just the main one. The corpus is usually joined by ID.
    final_dataset.sort(key=lambda x: x["quality_score"], reverse=True)

    # Stage 4: CLUSTERING (HDBSCAN is handled in cluster_research.py)
    # We pass the embeddings directly in the JSON.
    
    # Save discovered channels for next run's organic expansion.
    # Any channel whose video passed semantic filtering is worth exploring further.
    # We also record per-channel crawl timestamps so the refresh-interval guard
    # (next run) can skip channels crawled within the niche's window.
    _newly_discovered = list({v["channel_id"] for v in final_dataset if v.get("channel_id")})
    now_iso = datetime.now(timezone.utc).isoformat()

    # Merge with any existing per-channel timestamps (preserve history).
    existing_crawled = {}
    try:
        if paths.discovered_channels.exists():
            with paths.discovered_channels.open("r", encoding="utf-8") as f:
                existing_crawled = (json.load(f) or {}).get("channel_crawled_at") or {}
    except Exception:
        existing_crawled = {}

    # Every channel we actually crawled THIS run (seeds + freshly discovered).
    crawled_this_run = set(core_seeds or []) | set(_newly_discovered)
    channel_crawled_at = dict(existing_crawled)
    for cid in crawled_this_run:
        channel_crawled_at[cid] = now_iso

    with paths.discovered_channels.open("w", encoding="utf-8") as f:
        json.dump({
            "niche": niche,
            "discovered_at": now_iso,
            "total": len(_newly_discovered),
            "channel_ids": _newly_discovered,
            "channel_crawled_at": channel_crawled_at,
        }, f, indent=2)
    log.info("Saved %d discovered channels (+ %d crawl timestamps) to %s.",
             len(_newly_discovered), len(channel_crawled_at), paths.discovered_channels)

    payload = {
        "niche": niche,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_discovered": len(unique_ids),
        "total_survived_filtering": len(final_dataset),
        "videos": final_dataset
    }
    
    with paths.top_100.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        
    corpus_file = paths.base / "top_100_corpus.json"
    with corpus_file.open("w", encoding="utf-8") as f:
        json.dump(corpus_dataset, f, indent=2, ensure_ascii=False)
        
    log.info("Saved %d semantically validated videos to %s and corpus to %s", len(final_dataset), paths.top_100, corpus_file)

if __name__ == "__main__":
    import sys
    niche_arg = sys.argv[1] if len(sys.argv) > 1 else "automotive"
    main(niche=niche_arg)
