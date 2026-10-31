"""
cluster_research.py
===================
Builds ranked topic clusters from merged video datasets.

Pipeline position: Runs AFTER semantic_research.py
  merged_videos_semantic.json → cluster intelligence → video_clusters_semantic.json + SQLite

Exports:
  build_clusters()            — groups and ranks topic clusters
  get_cluster_intelligence()  — used by brief_personalizer.py to load ranked clusters
"""

import json
import logging
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

from shared_utils import safe_float as _safe_float, clamp as _clamp, normalize_log as _normalize_log
from shared_utils import description_quality_score as _description_quality
from shared_utils import click_to_view_ratio as _click_to_view_ratio
from shared_utils import compute_composite_score
from pipeline_paths import get_paths, resolve_niche

try:
    from niche_config import get_niche_config
    _NICHE_CONFIG_AVAILABLE = True
except ImportError:
    _NICHE_CONFIG_AVAILABLE = False
    def get_niche_config(niche):
        return {}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# Active niche (set by main() or externally; defaults to automotive)
_ACTIVE_NICHE = "automotive"

# ── Source files (priority order — richer semantic files first) ───────────────
SOURCE_FILE = "merged_videos_semantic.json"

OUTPUT_FILE = "video_clusters_semantic.json"

# ── Niche-aware taxonomy loader ───────────────────────────────────────────────
# These are the automotive defaults. For non-automotive niches, _load_niche_taxonomy()
# replaces them dynamically from niche_config at runtime.

_AUTOMOTIVE_REPRESENTATIVE_TITLES: Dict[str, List[str]] = {
    "diesel":          ["diesel engine repair", "cummins injector replacement", "duramax head gasket", "powerstroke turbo rebuild", "def dpf delete", "diesel truck", "turbo diesel"],
    "heavy_equipment": ["caterpillar excavator maintenance", "skid steer loader repair", "john deere tractor fix", "bulldozer track replacement", "backhoe hydraulics"],
    "performance_engine": ["porsche engine rebuild", "bmw m3 engine swap", "sports car engine modification", "v8 engine swap", "turbocharger install"],
    "oil":             ["how to change oil", "synthetic oil change", "oil filter replacement", "engine oil flush", "check oil level"],
    "brakes":          ["brake pad replacement", "brake rotor change", "how to bleed brakes", "abs module repair", "caliper sticking"],
    "battery":         ["car battery replacement", "alternator testing", "parasitic draw test", "starter motor rebuild", "charging system diagnosis"],
    "engine":          ["engine misfire diagnosis", "spark plug replacement", "timing belt replacement", "head gasket repair", "engine rebuild"],
    "transmission":    ["transmission fluid change", "clutch replacement", "cvt transmission rebuild", "automatic transmission slipping", "torque converter"],
    "diagnostics":     ["obd2 scanner tutorial", "check engine light diagnosis", "p0171 code fix", "multimeter car testing", "can bus diagnosis"],
    "suspension":      ["strut replacement", "control arm bushing", "wheel alignment", "shock absorber install", "tie rod end replacement"],
    "tires":           ["how to patch a tire", "tire mounting and balancing", "tpms sensor replacement", "winter tire review", "tire pressure check"],
    "ac_hvac":         ["ac recharge", "ac compressor replacement", "heater core flush", "blower motor repair", "ac leak test"],
    "electrical":      ["wiring harness repair", "finding a short circuit", "fuse box diagram", "relay testing", "electrical troubleshooting"],
    "fuel_system":     ["fuel pump replacement", "fuel injector cleaning", "high pressure fuel pump", "fuel filter change", "fuel pressure test"],
    "cooling":         ["radiator replacement", "thermostat change", "coolant flush", "water pump replacement", "overheating diagnosis"],
}

_AUTOMOTIVE_NON_REPAIR_KEYWORDS: set = {
    "manufacturing", "factory tour", "how it's made", "how it is made",
    "forging", "production line", "assembly line", "cnc machining",
    "mass production", "making of", "how brake pads are made"
}

_AUTOMOTIVE_PENALTY_KEYWORDS: set = {
    "bugatti", "koenigsegg", "pagani", "mclaren", "ferrari", "lamborghini",
    "aston martin", "rolls royce", "bentley", "supercar", "hypercar", "porsche"
}

# Module-level taxonomy state (populated by _load_niche_taxonomy on first call)
REPRESENTATIVE_TITLES: Dict[str, List[str]] = dict(_AUTOMOTIVE_REPRESENTATIVE_TITLES)
TOPIC_DISPLAY: Dict[str, str] = {}          # populated by _load_niche_taxonomy
ALLOWED_LABELS: set = set()                 # populated by _load_niche_taxonomy
NON_REPAIR_KEYWORDS: set = set(_AUTOMOTIVE_NON_REPAIR_KEYWORDS)
SUPERCAR_KEYWORDS: set = set(_AUTOMOTIVE_PENALTY_KEYWORDS)


def _load_niche_taxonomy(niche: str) -> None:
    """
    Populate module-level taxonomy dicts from niche_config.
    For automotive, uses the hardcoded defaults above.
    For other niches, derives topic labels from their subniches dict and
    generates representative search strings from their centroids.
    Clears automotive-specific penalty/filter keyword sets for non-automotive niches.
    """
    global REPRESENTATIVE_TITLES, TOPIC_DISPLAY, ALLOWED_LABELS
    global NON_REPAIR_KEYWORDS, SUPERCAR_KEYWORDS

    if niche == "automotive" or not _NICHE_CONFIG_AVAILABLE:
        # Use automotive defaults as-is
        REPRESENTATIVE_TITLES = dict(_AUTOMOTIVE_REPRESENTATIVE_TITLES)
        TOPIC_DISPLAY = {
            "performance_engine": "Performance Engines",
            "oil":             "Oil & Lubrication",
            "brakes":          "Brakes & Stopping",
            "battery":         "Battery & Electrical",
            "engine":          "Engine & Performance",
            "transmission":    "Transmission & Gearbox",
            "diagnostics":     "Diagnostics & OBD",
            "suspension":      "Suspension & Steering",
            "tires":           "Tires & Wheels",
            "ac_hvac":         "AC & HVAC",
            "electrical":      "Electrical & Wiring",
            "diesel":          "Diesel & Trucks",
            "heavy_equipment": "Heavy Equipment",
            "fuel_system":     "Fuel System",
            "cooling":         "Cooling System",
            "general_repair":  "General Repair",
        }
        NON_REPAIR_KEYWORDS = set(_AUTOMOTIVE_NON_REPAIR_KEYWORDS)
        SUPERCAR_KEYWORDS    = set(_AUTOMOTIVE_PENALTY_KEYWORDS)
    else:
        cfg = get_niche_config(niche)
        subniches  = cfg.get("subniches", {})
        centroids  = cfg.get("centroids", {})

        # TOPIC_DISPLAY — use subniche key → human label from niche_config
        TOPIC_DISPLAY = {**subniches, "general": f"General {cfg.get('display_name', niche.title())}"}

        # REPRESENTATIVE_TITLES — derive from centroid search strings
        REPRESENTATIVE_TITLES = {}
        for topic_key, centroid_str in centroids.items():
            # Split centroid string into representative short phrases
            phrases = [p.strip() for p in centroid_str.split(",") if p.strip()]
            if not phrases:
                phrases = centroid_str.split()[:5]  # fallback: first 5 words
            REPRESENTATIVE_TITLES[topic_key] = phrases[:5]

        # Non-automotive niches have no "non-repair" or "supercar" concept
        NON_REPAIR_KEYWORDS = set()
        SUPERCAR_KEYWORDS    = set()

        log.info("Loaded %d topic labels for niche '%s' from niche_config.", len(TOPIC_DISPLAY), niche)

    # Always include general fallback + build allowed set
    ALLOWED_LABELS = set(TOPIC_DISPLAY.keys()) | {"general_repair", "general"}


# Centroid cache — cleared whenever niche changes
_centroids: Dict[str, Any] = None  # type: ignore
_centroids_niche: str = ""


def _get_embedding_centroids(niche: str = "automotive") -> Dict[str, Any]:
    global _centroids, _centroids_niche
    if _centroids is not None and _centroids_niche == niche:
        return _centroids

    try:
        import numpy as np
        from sentence_transformers import SentenceTransformer

        log.info("Pre-computing embedding centroids for niche '%s'...", niche)
        model = SentenceTransformer("all-MiniLM-L6-v2")
        _centroids = {}
        for topic, titles in REPRESENTATIVE_TITLES.items():
            if not titles:
                continue
            embeddings = model.encode(titles, convert_to_numpy=True, normalize_embeddings=True)
            centroid = np.mean(embeddings, axis=0)
            norm = np.linalg.norm(centroid)
            if norm > 0:
                centroid = centroid / norm
            _centroids[topic] = centroid
        _centroids_niche = niche
        return _centroids
    except ImportError:
        log.warning("sentence-transformers or numpy not installed, cannot compute embedding centroids.")
        _centroids = {}
        _centroids_niche = niche
        return {}


STOP_WORDS = {
    "the", "a", "an", "for", "of", "to", "and", "in", "on", "with",
    "is", "your", "this", "that", "how", "what", "when", "why", "video",
}


# ── Utility functions (delegated to shared_utils) ────────────────────────────


def compute_score_10(video: Dict[str, Any]) -> float:
    existing = _safe_float(video.get("analysis_score_10"), -1.0)
    if existing >= 0:
        return round(existing, 2)
    return compute_composite_score(video)


def _normalize_token(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9_]+", "_", value.lower()).strip("_")
    return cleaned or "general_repair"


def infer_topic(video: Dict[str, Any], niche: str = "automotive") -> str:
    """Classify video to a canonical topic using cosine similarity to pre-computed centroids."""
    video_embedding = video.get("semantic_embedding")
    fallback = "general_repair" if niche == "automotive" else "general"

    if video_embedding and len(video_embedding) > 0:
        centroids = _get_embedding_centroids(niche)
        if centroids:
            import numpy as np
            vec = np.array(video_embedding)

            best_topic = fallback
            best_score = -1.0

            for topic, centroid in centroids.items():
                score = float(np.dot(vec, centroid))
                if score > best_score:
                    best_score = score
                    best_topic = topic

            if best_score > 0.3:
                return best_topic

    # Semantic embedding unavailable — return niche-appropriate fallback.
    return fallback


# ── FIX: generate_ai_cluster_label — was called but never defined ─────────────

def generate_ai_cluster_label(top_videos: List[Dict], fallback: str = "general_repair") -> str:
    """
    Generate a human-readable cluster label from the top video titles.
    Strictly maps to the active niche taxonomy to prevent hallucinations.
    TOPIC_DISPLAY is populated by _load_niche_taxonomy() before this is called.
    """
    display_mapping = {**TOPIC_DISPLAY, "general_repair": "General Maintenance & Repair", "general": "General"}
    return display_mapping.get(fallback, fallback.replace("_", " ").title())


# ── Data loading ──────────────────────────────────────────────────────────────

def _load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8-sig") as fh:
        payload = json.load(fh)
    if isinstance(payload, list):
        return {"videos": payload, "metadata": {}}
    if isinstance(payload, dict):
        return payload
    return {"videos": [], "metadata": {}}


def _video_identity(video: Dict[str, Any]) -> str:
    if video.get("video_id"):
        return f"id::{video['video_id']}"
    title   = str(video.get("title")         or "").strip().lower()
    channel = str(video.get("channel_title") or "").strip().lower()
    return f"tc::{title}::{channel}"


def _choose_base_video(
    current: Dict[str, Any], incoming: Dict[str, Any]
) -> Dict[str, Any]:
    current_score  = _safe_float(current.get("analysis_score_10"),  _safe_float(current.get("final_score"),  0.0))
    incoming_score = _safe_float(incoming.get("analysis_score_10"), _safe_float(incoming.get("final_score"), 0.0))
    return incoming if incoming_score > current_score else current


def load_all_videos(root: Path, niche: str) -> Tuple[List[Dict[str, Any]], List[str], List[str]]:
    """
    Load videos from the primary semantic data file produced by the previous pipeline step.
    Returns (videos, found_files, missing_files).
    """
    paths = get_paths(niche)
    source_path = paths.merged_semantic
    source_file = source_path.name
    if not source_path.exists():
        log.error("Primary source file '%s' not found. Run semantic_research.py first.", source_path)
        return [], [], [str(source_path)]

    log.info("Loading videos from %s", source_file)
    payload = _load_json(source_path)
    raw_videos = payload.get("videos", [])
    
    videos = []
    discarded = []
    
    for v in raw_videos:
        if NON_REPAIR_KEYWORDS:  # only filter when the keyword set is non-empty (automotive)
            text = (str(v.get("title", "")) + " " + str(v.get("description", ""))).lower()
            # Find the exact keyword that triggered the discard
            matched_keyword = next((kw for kw in NON_REPAIR_KEYWORDS if kw in text), None)
            if matched_keyword:
                v["discard_reason"] = f"Keyword match: '{matched_keyword}'"
                discarded.append(v)
                continue
        videos.append(v)
        
    if discarded:
        log.info(f"Filtered out {len(discarded)} non-repair/manufacturing videos.")
        
        # Save discarded to root for review
        discard_file = root / "discarded_videos.json"
        existing_discards = []
        if discard_file.exists():
            try:
                with discard_file.open("r", encoding="utf-8") as f:
                    existing_discards = json.load(f).get("discarded", [])
            except Exception:
                pass
                
        # Avoid duplicate discards in the log
        seen_ids = {v.get("video_id") or v.get("id") for v in existing_discards if (v.get("video_id") or v.get("id"))}
        for v in discarded:
            vid = v.get("video_id") or v.get("id")
            if vid and vid not in seen_ids:
                existing_discards.append(v)
                
        with discard_file.open("w", encoding="utf-8") as f:
            from datetime import datetime, timezone
            json.dump({"last_updated": datetime.now(timezone.utc).isoformat(), "discarded": existing_discards}, f, indent=2, ensure_ascii=False)

    # The analysis_score_10 and topic_primary fields are already computed
    # in semantic_research.py, so no need to re-calculate them here.
    # We just need to ensure the list is sorted for consistent processing.
    videos.sort(
        key=lambda v: _safe_float(v.get("analysis_score_10"), 0.0),
        reverse=True
    )
    for idx, video in enumerate(videos, start=1):
        video["analysis_rank"] = idx

    log.info("Loaded %d valid videos.", len(videos))
    return videos, [source_file], []


# ── Cluster building ──────────────────────────────────────────────────────────

def _compute_opportunity_metrics(cluster_videos: List[Dict[str, Any]]) -> Dict[str, float]:
    if not cluster_videos:
        return {"demand": 0.0, "growth": 0.0, "competition": 0.0, "creator_fit": 0.0, "opportunity_score": 0.0}

    # 1. Demand (Views & VPH ceiling)
    top_videos = sorted(
        cluster_videos,
        key=lambda v: _safe_float(v.get("view_count"), 0.0),
        reverse=True,
    )[:10]
    avg_views = sum(_safe_float(v.get("view_count"), 0.0) for v in top_videos) / max(len(top_videos), 1)
    avg_vph = sum(_safe_float(v.get("views_per_hour"), 0.0) for v in top_videos) / max(len(top_videos), 1)
    demand_score = (_normalize_log(avg_views, 5_000_000.0) * 0.5) + (_normalize_log(avg_vph, 5_000.0) * 0.5)

    # 2. Growth (Trend velocity & Breakout probability)
    trend_scores = [_safe_float(v.get("trend_score_7d"), 0.0) for v in cluster_videos]
    avg_trend = (sum(trend_scores) / len(trend_scores)) / 100.0 if trend_scores else 0.0
    breakout_probs = [_safe_float(v.get("breakout_probability"), 0.0) for v in cluster_videos]
    avg_breakout = sum(breakout_probs) / len(breakout_probs) if breakout_probs else 0.0
    growth_score = (avg_trend * 0.4) + (avg_breakout * 0.6)

    # 3. Competition (Saturation & Channel diversity vs Execution Gap)
    # Good opportunity = high execution gap (bad existing videos) + diverse channels (not monopolized)
    channels = {str(v.get("channel_id") or v.get("channel_title")) for v in cluster_videos}
    # Reward topics with multiple channels covering them, rather than a raw ratio which favors 1-video clusters.
    channel_diversity = _clamp(len(channels) / 5.0, 0.0, 1.0)
    
    scores = [_safe_float(v.get("analysis_score_10"), 0.0) for v in cluster_videos]
    avg_video_score = sum(scores) / max(len(scores), 1)
    quality_gap = _clamp(1.0 - (avg_video_score / 10.0), 0.0, 1.0) # higher gap is better
    competition_score = (channel_diversity * 0.5) + (quality_gap * 0.5)

    # 4. Creator Fit (Beta Tester Relevance)
    # Does this cluster match the beta tester's strengths? Technical depth + Relevance
    # Uses repair_similarity for relevance and topic_confidence for technical depth.
    relevance_scores = [_safe_float(v.get("repair_similarity"), 0.0) for v in cluster_videos]
    technical_scores = [_safe_float(v.get("topic_confidence"), 0.0) for v in cluster_videos]
    avg_relevance = sum(relevance_scores) / max(len(relevance_scores), 1)
    avg_technical = sum(technical_scores) / max(len(technical_scores), 1)
    # The new fields are already 0-1, so no division by 10 is needed.
    creator_fit_score = (_clamp(avg_relevance, 0.0, 1.0) * 0.5) + (_clamp(avg_technical, 0.0, 1.0) * 0.5)

    # Final Opportunity Score (Weighting)
    # Give a massive penalty to clusters with fewer than 3 videos, as they are not proven trends.
    volume_penalty = 1.0 if len(cluster_videos) >= 3 else (0.5 if len(cluster_videos) == 2 else 0.2)

    # We prioritize the execution gap (competition) and creator fit over raw demand.
    # A topic with massive demand is useless if it's the wrong audience or impossible to compete in.
    final_score = (
        demand_score * 0.20 +       # Is there an audience? (Weight: 20%)
        growth_score * 0.20 +       # Is it trending? (Weight: 20%)
        competition_score * 0.30 +  # Is there a gap for a better video? (Weight: 30%)
        creator_fit_score * 0.30    # Is it relevant to our target creator? (Weight: 30%)
    ) * volume_penalty

    # --- Domain Relevance Penalty ---
    # Penalize topics that are high-demand but irrelevant to the core DIY audience.
    cluster_text = " ".join([v.get("title", "").lower() for v in top_videos])
    penalty = 1.0
    if SUPERCAR_KEYWORDS:  # Only applies to automotive niche; other niches have empty set
        for keyword in SUPERCAR_KEYWORDS:
            if keyword in cluster_text:
                log.warning("Applying domain penalty to cluster. Found keyword: '%s'", keyword)
                penalty = 0.3  # Apply a 70% penalty to the score
                break

    final_score *= penalty

    return {
        "demand": round(_clamp(demand_score, 0.0, 1.0) * 10.0, 2),
        "growth": round(_clamp(growth_score, 0.0, 1.0) * 10.0, 2),
        "competition": round(_clamp(competition_score, 0.0, 1.0) * 10.0, 2),
        "creator_fit": round(_clamp(creator_fit_score, 0.0, 1.0) * 10.0, 2),
        "opportunity_score": round(_clamp(final_score, 0.0, 1.0) * 10.0, 2)
    }

def _cluster_score(cluster_videos: List[Dict[str, Any]]) -> float:
    metrics = _compute_opportunity_metrics(cluster_videos)
    return metrics["opportunity_score"]


def _top_video_payload(videos: List[Dict[str, Any]], limit: int = 10) -> List[Dict[str, Any]]:
    ranked = sorted(
        videos,
        key=lambda v: _safe_float(v.get("analysis_score_10"), 0.0),
        reverse=True,
    )[:limit]

    return [
        {
            "rank":          idx,
            "video_id":      v.get("video_id"),
            "title":         v.get("title"),
            "channel_title": v.get("channel_title"),
            "score10":       round(_safe_float(v.get("analysis_score_10"), 0.0), 2),
            "final_score":   round(_safe_float(v.get("final_score"),       0.0), 2),
            "view_count":    int(_safe_float(v.get("view_count"),          0.0)),
            "views_per_hour": round(_safe_float(v.get("views_per_hour"),   0.0), 2),
            "video_url":     v.get("video_url"),
            # Intelligence fields (populated after semantic_research.py runs)
            "intent_label":         v.get("intent_label"),
            "breakout_probability": v.get("breakout_probability"),
            "trend_score_7d":       v.get("trend_score_7d"),
        }
        for idx, v in enumerate(ranked, start=1)
    ]


def build_clusters(videos: List[Dict[str, Any]], active_niche: str = "automotive") -> Dict[str, Any]:
    """Group videos into topic clusters and rank them by cluster quality score."""
    fallback_topic = "general_repair" if active_niche == "automotive" else "general"
    grouped: Dict[str, List[Dict]] = defaultdict(list)
    for video in videos:
        # Only re-classify if the video doesn't already have a confident topic
        existing_topic = video.get("topic_primary")
        existing_confidence = _safe_float(video.get("topic_confidence"), 0.0)

        if not existing_topic or existing_topic in ("rejected", "") or existing_confidence < 0.5:
            video["topic_primary"] = infer_topic(video, niche=active_niche)

        topic = str(video.get("topic_primary") or fallback_topic)
        # Contamination check — only flag topics that are truly outside the active niche taxonomy.
        # ALLOWED_LABELS is populated from niche_config by _load_niche_taxonomy().
        if topic not in ALLOWED_LABELS:
            video["contamination_flag"] = True
            video["reason"] = f"Topic '{topic}' outside allowed labels for niche '{active_niche}'"

        # Group by canonical topic only — merging HDBSCAN sub-clusters into
        # coherent topic groups for statistically meaningful scoring
        grouped[topic].append(video)

    clusters: List[Dict[str, Any]] = []

    for cluster_key, cluster_videos in grouped.items():
        cluster_videos_sorted = sorted(
            cluster_videos,
            key=lambda v: _safe_float(v.get("analysis_score_10"), 0.0),
            reverse=True,
        )
        top10 = _top_video_payload(cluster_videos_sorted, limit=10)

        channels     = {str(v.get("channel_id") or v.get("channel_title") or "unknown") for v in cluster_videos_sorted}
        
        # Get the canonical topic for this sub-cluster based on majority vote
        topic_counts = Counter(str(v.get("topic_primary") or "general_repair") for v in cluster_videos_sorted)
        primary_topic = topic_counts.most_common(1)[0][0] if topic_counts else "general_repair"

        semantic_mix = Counter(
            str(v.get("semantic_cluster"))
            for v in cluster_videos_sorted
            if v.get("semantic_cluster") is not None
        )
        avg_score = (
            sum(_safe_float(v.get("analysis_score_10"), 0.0) for v in cluster_videos_sorted)
            / max(len(cluster_videos_sorted), 1)
        )

        # Average intelligence signals across the cluster
        intent_counts = Counter(
            v.get("intent_label") for v in cluster_videos_sorted
            if v.get("intent_label")
        )
        avg_breakout = (
            sum(_safe_float(v.get("breakout_probability"), 0.0) for v in cluster_videos_sorted)
            / max(len(cluster_videos_sorted), 1)
        )

        # Pass the primary canonical topic as fallback for label generation
        ai_label = generate_ai_cluster_label(top10, fallback=primary_topic)
        opportunity_metrics = _compute_opportunity_metrics(cluster_videos_sorted)

        clusters.append({
            "cluster_id":          cluster_key,
            "topic":               primary_topic,
            "cluster_label":       ai_label,
            "video_count":         len(cluster_videos_sorted),
            "channels":            len(channels),
            "avg_score10":         round(avg_score, 2),
            "cluster_score10":     opportunity_metrics["opportunity_score"],
            "opportunity_metrics": opportunity_metrics,
            "avg_breakout_prob":   round(avg_breakout, 3),
            "top_intent":          intent_counts.most_common(1)[0][0] if intent_counts else None,
            "semantic_cluster_mix": [
                {"semantic_cluster": k, "count": c}
                for k, c in semantic_mix.most_common(5)
            ],
            "top_videos": top10,
        })

    clusters.sort(
        key=lambda c: (c.get("cluster_score10", 0), c.get("video_count", 0)),
        reverse=True,
    )
    for idx, cluster in enumerate(clusters, start=1):
        cluster["cluster_rank"] = idx

    # Only surface clusters with enough data to be actionable for brief generation
    viable_clusters = [c for c in clusters if c.get("video_count", 0) >= 3]

    return {
        "best_clusters_top5": viable_clusters[:5],
        "all_clusters_ranked": clusters,      # ← used by brief_personalizer.py
        "clusters":            clusters,
    }


# ── FIX: get_cluster_intelligence — was missing, imported by brief_personalizer ──

def get_cluster_intelligence(
    videos: List[Dict[str, Any]] = None,
    cluster_labels: Dict = None,
    creator_profile: Dict = None,
    top_videos_n: int = 10,
    niche: str = "automotive",
) -> Dict[str, Any]:
    """
    Load and return ranked cluster intelligence.
    Called by brief_personalizer.PipelineCoordinator._execute_pipeline().

    If videos are passed in, builds clusters from them directly.
    Otherwise loads the latest video_clusters_semantic.json from disk.
    """
    if videos is not None:
        # Build fresh from provided video list
        active_niche = (creator_profile or {}).get("niche", "automotive") if creator_profile else "automotive"
        _load_niche_taxonomy(active_niche)
        cluster_payload = build_clusters(videos, active_niche=active_niche)
        return {
            "all_clusters_ranked": cluster_payload.get("all_clusters_ranked", []),
            "best_clusters_top5":  cluster_payload.get("best_clusters_top5",  []),
            "total_clusters":      len(cluster_payload.get("clusters", [])),
            "total_videos":        len(videos),
        }

    # Load from the output file written by main()
    resolved = resolve_niche((creator_profile or {}).get("niche", niche))
    paths = get_paths(resolved)
    output_path = paths.clusters

    if not output_path.exists():
        log.error(
            "Cluster output file not found: %s. Run cluster_research.py first.",
            output_path,
        )
        return {"all_clusters_ranked": [], "best_clusters_top5": [], "total_clusters": 0}

    with output_path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)

    clusters = data.get("clusters", [])
    log.info(
        "get_cluster_intelligence: loaded %d clusters from %s",
        len(clusters), output_path.name,
    )
    return {
        "all_clusters_ranked": clusters,
        "best_clusters_top5":  data.get("best_clusters_top5", clusters[:5]),
        "total_clusters":      len(clusters),
        "total_videos":        data.get("metadata", {}).get("total_unique_videos", 0),
        "generated_at":        data.get("metadata", {}).get("generated_at"),
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main(niche: str = _ACTIVE_NICHE) -> None:
    resolved = resolve_niche(niche)
    paths = get_paths(resolved)
    paths.ensure_dirs()

    # Load niche taxonomy first so all downstream functions see correct labels
    _load_niche_taxonomy(resolved)
    log.info("cluster_research.py running for niche: %s", resolved)

    root = Path(__file__).resolve().parent
    videos, found_files, missing_files = load_all_videos(root, resolved)

    if not videos:
        raise ValueError(
            "No videos found from any source file. "
            "Run metadata_fetch.py and semantic_research.py first."
        )

    if missing_files:
        log.warning("Missing source files (skipped): %s", ", ".join(missing_files))

    cluster_payload = build_clusters(videos, active_niche=resolved)
    clusters        = cluster_payload.get("clusters", [])

    output = {
        "metadata": {
            "niche":              resolved,
            "generated_at":       datetime.now(timezone.utc).isoformat(),
            "script":             "cluster_research.py",
            "methods": [
                "multi_source_merge",
                "topic_inference",
                "semantic_cluster_mix",
                "composite_video_score_10",
                "cluster_quality_ranking",
                "ai_cluster_label_generation",
            ],
            "sources_found":      found_files,
            "sources_missing":    missing_files,
            "total_unique_videos": len(videos),
            "total_clusters":     len(clusters),
        },
        "best_clusters_top5":  cluster_payload.get("best_clusters_top5", []),
        "all_clusters_ranked": clusters,
        "clusters":            clusters,
    }

    with paths.clusters.open("w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2, ensure_ascii=False)

    log.info("Saved cluster intelligence → %s", paths.clusters)

    log.info(
        "Unique videos: %d | Clusters: %d | Top cluster: %s (score: %s)",
        len(videos),
        len(clusters),
        clusters[0].get("cluster_label", "—") if clusters else "—",
        clusters[0].get("cluster_score10",  "—") if clusters else "—",
    )

    # SQLite export is now handled by the data_store.py step in the main pipeline.


if __name__ == "__main__":
    import sys
    _niche_arg = sys.argv[1] if len(sys.argv) > 1 else "automotive"
    main(niche=_niche_arg)
