import json
import logging
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional

from metadata_fetch import OUTPUT_FILE
from shared_utils import safe_float as _safe_float, clamp as _clamp, normalize_log as _normalize_log
from shared_utils import description_quality_score as _description_quality_score
from shared_utils import click_to_view_ratio as _click_to_view_ratio
from shared_utils import compute_composite_score
from shared_utils import subscriber_efficiency_score as _subscriber_efficiency_score
from shared_utils import outperformance_ratio as _outperformance_ratio

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s")
log = logging.getLogger(__name__)

HAS_TRANSFORMER = False
HAS_SKLEARN = False
HAS_HDBSCAN = False

try:
    from sentence_transformers import SentenceTransformer
    HAS_TRANSFORMER = True
except ImportError:
    log.warning("sentence-transformers not installed. Semantic features will be disabled.")

try:
    import numpy as np
    from sklearn.cluster import KMeans
    from sklearn.metrics.pairwise import cosine_similarity
    HAS_SKLEARN = True
except ImportError:
    log.warning("scikit-learn and numpy not installed. Semantic clustering will be disabled.")

try:
    import hdbscan
    HAS_HDBSCAN = True
except ImportError:
    log.info("hdbscan not installed, fallback clustering will use KMeans if needed.")

MODEL_NAME = "all-MiniLM-L6-v2"

# Search-intent keyword rules, per niche.
# IMPORTANT: each niche's rules must use words that are SIGNALING in that niche.
# The old single table leaked automotive terms ("check engine", "oil", "scan")
# into finance/tech/productivity, so a productivity video titled "fix your
# morning routine" was classified with automotive intent. Niche-aware keys fix
# that — and the labels are kept identical across niches where the intent
# concept transfers (fix_now / diagnosis / maintenance / comparison / myth_busting)
# so downstream consumers don't need per-niche branches.
INTENT_RULES_BY_NICHE: Dict[str, Dict[str, List[str]]] = {
    "automotive": {
        "fix_now":      ["fix", "won't start", "no start", "not working", "repair now", "urgent", "broken", "leak"],
        "diagnosis":    ["diagnose", "diagnosis", "symptom", "code", "scan", "check engine", "misfire", "noise"],
        "maintenance":  ["maintenance", "service", "replace", "interval", "preventive", "oil change", "fluid"],
        "comparison":   ["vs", "compare", "better", "best", "which", "difference", "review"],
        "myth_busting": ["myth", "truth", "mistake", "wrong", "scam", "avoid", "never do"],
    },
    "finance": {
        "fix_now":      ["pay off", "get out of debt", "emergency", "broke", "stop losing", "fix my budget", "urgent"],
        "diagnosis":    ["analyze", "analysis", "breakdown", "explained", "how it works", "understand", "evaluate"],
        "maintenance":  ["budget", "save", "saving", "plan", "strategy", "routine", "track", "manage"],
        "comparison":   ["vs", "compare", "better", "best", "which", "difference", "review", "versus"],
        "myth_busting": ["myth", "truth", "mistake", "wrong", "scam", "avoid", "lie", "fake"],
    },
    "technology": {
        "fix_now":      ["fix", "debug", "error", "not working", "broken", "crash", "solve", "troubleshoot"],
        "diagnosis":    ["how it works", "explained", "understand", "deep dive", "behind the scenes", "architecture"],
        "maintenance":  ["setup", "configure", "deploy", "update", "workflow", "automate", "best practice"],
        "comparison":   ["vs", "compare", "better", "best", "which", "difference", "review", "versus", "alternative"],
        "myth_busting": ["myth", "truth", "mistake", "wrong", "scam", "avoid", "stop using", "overrated"],
    },
    "productivity": {
        "fix_now":      ["fix", "overcome", "stop", "break", "quit", "cure", "solve", "reset"],
        "diagnosis":    ["why", "reason", "cause", "understand", "explained", "science of", "psychology"],
        "maintenance":  ["system", "routine", "habit", "schedule", "plan", "daily", "workflow", "method"],
        "comparison":   ["vs", "compare", "better", "best", "which", "difference", "review", "versus"],
        "myth_busting": ["myth", "truth", "mistake", "wrong", "avoid", "overrated", "stop doing"],
    },
}

# Default intent rules — generic, niche-neutral. Used if a niche has no entry.
DEFAULT_INTENT_RULES = INTENT_RULES_BY_NICHE["automotive"]

# Core stop-words that apply to ALL niches
_STOP_WORDS_COMMON = {
    "the", "a", "an", "for", "of", "to", "and", "in", "on", "with", "is",
    "your", "this", "that", "how", "when", "what",
}

# Automotive-only stop-words — these words carry zero signal for finance/tech
_STOP_WORDS_AUTOMOTIVE = {"car", "auto", "vehicle", "repair", "fix"}

# Default: include automotive terms (backward-compatible)
STOP_WORDS = _STOP_WORDS_COMMON | _STOP_WORDS_AUTOMOTIVE


def get_stop_words(niche: str = "automotive") -> set:
    """Return the appropriate stop-word set for a given niche."""
    if niche == "automotive":
        return _STOP_WORDS_COMMON | _STOP_WORDS_AUTOMOTIVE
    return _STOP_WORDS_COMMON


def load_model(model_name: str = MODEL_NAME):
    if not HAS_TRANSFORMER:
        raise RuntimeError("sentence-transformers is required for semantic embedding.")
    return SentenceTransformer(model_name)


def embed_texts(texts: List[str], model_name: str = MODEL_NAME):
    model = load_model(model_name)
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False, normalize_embeddings=True)
    return embeddings


def build_text(video: Dict[str, Any]) -> str:
    title = video.get("title") or ""
    # Clean channel-specific SEO tags to prevent artificial semantic clusters
    title = re.sub(r"\[.*?\]", "", title).strip()
    
    description = video.get("description") or ""
    if description:
        return f"{title}. {description}"
    return title


def add_semantic_embeddings(videos: List[Dict[str, Any]], model_name: str = MODEL_NAME):
    if not HAS_TRANSFORMER:
        raise RuntimeError("Semantic embedding model is unavailable.")

    # Identify videos that need embedding
    videos_to_embed = [v for v in videos if not v.get("semantic_embedding")]
    if not videos_to_embed:
        log.info("All %d videos already have embeddings. Skipping calculation.", len(videos))
        # Still need to return all embeddings for downstream clustering
        all_embeddings = np.array([v["semantic_embedding"] for v in videos])
        return all_embeddings

    log.info("Calculating embeddings for %d out of %d videos.", len(videos_to_embed), len(videos))
    texts = [build_text(video) for video in videos_to_embed]
    new_embeddings = embed_texts(texts, model_name=model_name)

    # Add new embeddings to the respective videos
    emb_iter = iter(new_embeddings)
    for video in videos:
        # Check for empty list or no key
        if not video.get("semantic_embedding"):
            video["semantic_embedding"] = next(emb_iter).tolist()

    # Reconstruct the full embeddings array in the correct order
    all_embeddings = np.array([v["semantic_embedding"] for v in videos])
    return all_embeddings


def cluster_embeddings(embeddings: Any, min_cluster_size: int = 3) -> List[int]:
    if not HAS_SKLEARN:
        raise RuntimeError("scikit-learn is required for clustering.")

    if len(embeddings) < 2:
        return [0] * len(embeddings)

    if HAS_HDBSCAN:
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            metric="euclidean",
            cluster_selection_method="eom",
            min_samples=1,
            cluster_selection_epsilon=0.15
        )
        labels = clusterer.fit_predict(embeddings)
        noise_fraction = float((labels == -1).sum()) / len(labels)
        if noise_fraction <= 0.7:
            log.info("Using HDBSCAN (%d clusters, %.2f noise).", len(set(labels)) - (1 if -1 in labels else 0), noise_fraction)
            return labels.tolist()
        log.info("HDBSCAN noise %.2f exceeded 70%%, falling back to KMeans.", noise_fraction)

    n_clusters = max(2, min(10, len(embeddings) // 10))
    if n_clusters >= len(embeddings):
        n_clusters = max(1, len(embeddings) // 2)

    kmeans = KMeans(n_clusters=n_clusters, random_state=42)
    labels = kmeans.fit_predict(embeddings)
    log.info("Using KMeans clustering (%d clusters).", n_clusters)
    return labels.tolist()


def semantic_neighbors(videos: List[Dict[str, Any]], embeddings: Any, top_n: int = 3):
    if not HAS_SKLEARN:
        raise RuntimeError("scikit-learn is required for semantic neighbors.")

    sims = cosine_similarity(embeddings)
    for index, video in enumerate(videos):
        similarity_scores = list(enumerate(sims[index]))
        similarity_scores = [pair for pair in similarity_scores if pair[0] != index]
        similarity_scores.sort(key=lambda pair: pair[1], reverse=True)

        neighborhood = []
        for neighbor_idx, score in similarity_scores[:top_n]:
            neighbor = videos[neighbor_idx]
            neighborhood.append({
                "video_id": neighbor.get("video_id"),
                "title": neighbor.get("title"),
                "score": round(float(score), 4)
            })
        video["semantic_neighbors"] = neighborhood



def _compute_composite_video_score(video: Dict[str, Any]) -> None:
    """Compute and store composite score + breakdown on the video dict."""
    score_10 = compute_composite_score(video)
    video["analysis_score_10"] = score_10

    # Build breakdown for transparency
    view_count = _safe_float(video.get("view_count"), 0.0)
    subscribers = _safe_float(video.get("channel_subscriber_count"), 0.0)
    channel_avg_views = _safe_float(video.get("channel_avg_views"), 0.0)
    hours_since_publish = _safe_float(video.get("hours_since_publish"), 0.0)
    engagement = _safe_float(video.get("engagement_score"), 0.0)

    desc_quality = _description_quality_score(video)
    ctr_ratio = _click_to_view_ratio(video)
    ctr_proxy = _safe_float(video.get("ctr_proxy_score"), 0.0) / 100.0
    ctr_component = ctr_proxy if ctr_proxy > 0 else _clamp(ctr_ratio / 0.12, 0.0, 1.0)
    views_component = _normalize_log(view_count, 5_000_000.0)
    vph_component = _normalize_log(_safe_float(video.get("views_per_hour"), 0.0), 5_000.0)
    # Age-normalised subscriber efficiency — shared helper (was a buggy inline
    # (view_count/subs)/2.0 that rewarded old videos over fresh breakouts).
    subscriber_efficiency = _subscriber_efficiency_score(
        view_count, subscribers, hours_since_publish
    )
    engagement_component = _clamp(engagement / 0.08, 0.0, 1.0)
    relevance_component = _clamp(_safe_float(video.get("relevance_score"), 0.0) / 10.0, 0.0, 1.0)
    retention_proxy = _safe_float(video.get("retention_proxy"), -1.0)
    retention_component = _clamp(retention_proxy / 100.0, 0.0, 1.0) if retention_proxy >= 0 else 0.5

    # Prospective outperformance vs the channel's own per-video average.
    # channel_avg_views landed in metadata_fetch (A1); this is the exact baseline
    # the brief generator's prompt cites ("OUTPERFORMANCE TARGET: averages X").
    outperf = _outperformance_ratio(view_count, channel_avg_views)
    video["outperformance_ratio"] = round(outperf, 3)

    video["analysis_score_breakdown"] = {
        "description_quality": round(desc_quality * 10, 2),
        "click_to_view": round(_clamp(ctr_ratio / 0.12, 0.0, 1.0) * 10, 2),
        "ctr_proxy": round(ctr_component * 10, 2),
        "views": round(views_component * 10, 2),
        "views_per_hour": round(vph_component * 10, 2),
        "views_vs_subscribers": round(subscriber_efficiency * 10, 2),
        "views_vs_channel_avg": round(min(outperf, 10.0) * 10, 2) if outperf > 0 else 0.0,
        "engagement": round(engagement_component * 10, 2),
        "relevance": round(relevance_component * 10, 2),
        "retention": round(retention_component * 10, 2)
    }


def _top_videos(videos: List[Dict[str, Any]], *, key_name: str, limit: int = 10) -> List[Dict[str, Any]]:
    ranked = sorted(videos, key=lambda video: _safe_float(video.get(key_name), 0.0), reverse=True)[:limit]
    output = []
    for idx, video in enumerate(ranked, start=1):
        output.append({
            "rank": idx,
            "video_id": video.get("video_id"),
            "title": video.get("title"),
            "channel_title": video.get("channel_title"),
            "score": round(_safe_float(video.get(key_name), 0.0), 2),
            "final_score": round(_safe_float(video.get("final_score"), 0.0), 2),
            "view_count": int(_safe_float(video.get("view_count"), 0.0))
        })
    return output


def _normalized_topic_from_title(title: str, niche: str = "automotive") -> str:
    stop = get_stop_words(niche)
    tokens = re.findall(r"[a-zA-Z]{3,}", (title or "").lower())
    filtered = [token for token in tokens if token not in stop]
    if not filtered:
        return "general_repair"
    return filtered[0]


def _get_primary_topic(video: Dict[str, Any]) -> str:
    semantic_cluster = video.get("semantic_cluster")
    if semantic_cluster is not None:
        return f"cluster_{semantic_cluster}"

    subniches = video.get("subniches") or []
    if subniches:
        return str(subniches[0])

    tags = video.get("tags") or []
    if tags:
        first_tag = str(tags[0]).strip().lower().replace(" ", "_")
        return first_tag if first_tag else "general_repair"

    return _normalized_topic_from_title(video.get("title", ""))


def _classify_intent(video: Dict[str, Any], niche: str = "automotive") -> None:
    text = f"{video.get('title', '')} {video.get('description', '')}".lower()

    # Niche-aware rules prevent automotive terms ("check engine", "oil", "scan")
    # from leaking into finance/tech/productivity intent labels.
    intent_rules = INTENT_RULES_BY_NICHE.get(niche, DEFAULT_INTENT_RULES)

    scored_intents = {}
    for label, terms in intent_rules.items():
        count = sum(1 for term in terms if term in text)
        if count > 0:
            scored_intents[label] = count

    if not scored_intents:
        video["intent_label"] = "general_explainer"
        video["intent_confidence"] = 0.35
        return

    intent_label = max(scored_intents, key=scored_intents.get)
    confidence = min(0.95, 0.42 + scored_intents[intent_label] * 0.14)
    video["intent_label"] = intent_label
    video["intent_confidence"] = round(confidence, 3)


def _trend_forecast(video: Dict[str, Any]) -> None:
    vph = _safe_float(video.get("views_per_hour"), 0.0)
    view_count = _safe_float(video.get("view_count"), 0.0)
    hours = max(_safe_float(video.get("hours_since_publish"), 1.0), 1.0)
    engagement = _safe_float(video.get("engagement_score"), 0.0)

    expected_vph = max(view_count / hours, 0.1)
    velocity_delta = (vph - expected_vph) / max(expected_vph, 1.0)

    recency_boost = 1.18 if hours <= 72 else 1.05 if hours <= 720 else 0.92
    trend_score_7d = min(100.0, max(0.0, (math.log1p(vph) * 10.0 + engagement * 280 + velocity_delta * 15) * recency_boost))

    breakout_probability = 1 / (1 + math.exp(-((trend_score_7d - 80) / 10 + velocity_delta)))

    video["trend_score_7d"] = round(trend_score_7d, 2)
    video["velocity_delta"] = round(velocity_delta, 3)
    video["breakout_probability"] = round(float(breakout_probability), 3)


def _channel_size_bucket(subs: float) -> str:
    if subs >= 1_000_000:
        return "xl"
    if subs >= 100_000:
        return "l"
    if subs >= 10_000:
        return "m"
    return "s"


def _apply_cohort_outliers(videos: List[Dict[str, Any]]) -> None:
    cohorts = defaultdict(list)

    for video in videos:
        subs = _safe_float(video.get("channel_subscriber_count"), 0.0)
        # Broader cohort for more stable statistics (removed topic)
        cohort_id = f"{video.get('age_bucket', 'unknown')}|{_channel_size_bucket(subs)}"
        video["cohort_id"] = cohort_id
        cohorts[cohort_id].append(_safe_float(video.get("final_score"), 0.0))

    cohort_stats = {}
    for cohort_id, scores in cohorts.items():
        if len(scores) < 5:  # Need at least 5 videos for meaningful stats
            continue
        mean = sum(scores) / len(scores)
        variance = sum((score - mean) ** 2 for score in scores) / max(len(scores), 1)
        std = math.sqrt(variance) if variance > 0 else 1.0
        cohort_stats[cohort_id] = (mean, std)

    for video in videos:
        if video["cohort_id"] in cohort_stats:
            mean, std = cohort_stats[video["cohort_id"]]
            score = _safe_float(video.get("final_score"), 0.0)
            zscore = (score - mean) / std if std > 0 else 0.0
            video["cohort_zscore"] = round(zscore, 3)
            video["cohort_outlier_flag"] = abs(zscore) >= 1.5
        else:
            video["cohort_zscore"] = 0.0
            video["cohort_outlier_flag"] = False


def _multimodal_score(video: Dict[str, Any]) -> None:
    title = str(video.get("title") or "")
    title_lower = title.lower()

    has_number = bool(re.search(r"\d", title))
    has_question = "?" in title
    caps_words = sum(1 for token in title.split() if len(token) >= 3 and token.isupper())

    hook_type = "direct_fix"
    if "how to" in title_lower or "step" in title_lower:
        hook_type = "tutorial"
    elif has_question:
        hook_type = "question_hook"
    elif has_number:
        hook_type = "list_hook"
    elif any(term in title_lower for term in ["mistake", "scam", "avoid", "wrong"]):
        hook_type = "warning_hook"

    thumbnail_style = "mechanical_closeup"
    if video.get("thumbnail_has_face"):
        thumbnail_style = "face_reaction"
    elif video.get("thumbnail_has_text"):
        thumbnail_style = "text_overlay"

    ctr_proxy_score = 45.0
    ctr_proxy_score += 10 if has_number else 0
    ctr_proxy_score += 8 if has_question else 0
    ctr_proxy_score += min(caps_words * 3, 9)
    ctr_proxy_score += min(len(video.get("title_emotional_triggers", [])) * 4, 12)
    ctr_proxy_score += 8 if thumbnail_style == "face_reaction" else 4 if thumbnail_style == "text_overlay" else 0

    video["hook_type"] = hook_type
    video["thumbnail_style"] = thumbnail_style
    video["ctr_proxy_score"] = round(min(100.0, ctr_proxy_score), 2)


def _retention_proxy(video: Dict[str, Any]) -> None:
    duration = _safe_float(video.get("duration_seconds"), 0.0)
    word_count = len(str(video.get("title") or "").split())
    has_timestamps = bool(video.get("description_has_timestamps"))

    duration_score = 1 - min(abs(duration - 900) / 900, 1.0)
    title_clarity = 1.0 if 6 <= word_count <= 16 else 0.75 if 4 <= word_count <= 20 else 0.55
    structure_bonus = 0.1 if has_timestamps else 0.0

    retention_proxy = (duration_score * 0.55 + title_clarity * 0.35 + structure_bonus) * 100

    pacing_risk = "medium"
    if duration < 240 or duration > 2200:
        pacing_risk = "high"
    elif 420 <= duration <= 1500:
        pacing_risk = "low"

    intro_strength = "medium"
    if video.get("hook_type") in {"question_hook", "warning_hook"} or _safe_float(video.get("ctr_proxy_score"), 0.0) >= 72:
        intro_strength = "high"
    elif _safe_float(video.get("ctr_proxy_score"), 0.0) < 52:
        intro_strength = "low"

    video["retention_proxy"] = round(max(0.0, min(100.0, retention_proxy)), 2)
    video["pacing_risk"] = pacing_risk
    video["intro_strength"] = intro_strength


def _build_viewer_journey(videos: List[Dict[str, Any]]) -> Dict[str, Any]:
    video_map = {video.get("video_id"): video for video in videos}
    edge_weights = defaultdict(float)
    topic_outbound = defaultdict(float)

    for video in videos:
        source_topic = video.get("topic_primary") or "general_repair"
        for neighbor in video.get("semantic_neighbors") or []:
            target_video = video_map.get(neighbor.get("video_id"))
            if not target_video:
                continue
            target_topic = target_video.get("topic_primary") or "general_repair"
            score = _safe_float(neighbor.get("score"), 0.0)
            edge_weights[(source_topic, target_topic)] += score
            topic_outbound[source_topic] += score

    for video in videos:
        source_topic = video.get("topic_primary") or "general_repair"
        candidates = []
        for (src, dst), weight in edge_weights.items():
            if src == source_topic and dst != source_topic:
                candidates.append({"topic": dst, "weight": round(weight, 3)})
        candidates.sort(key=lambda item: item["weight"], reverse=True)
        video["next_best_topics"] = candidates[:3]

    top_edges = [
        {"from": src, "to": dst, "weight": round(weight, 3)}
        for (src, dst), weight in sorted(edge_weights.items(), key=lambda item: item[1], reverse=True)[:12]
    ]

    top_topics = [
        {"topic": topic, "centrality": round(weight, 3)}
        for topic, weight in sorted(topic_outbound.items(), key=lambda item: item[1], reverse=True)[:10]
    ]

    return {
        "top_edges": top_edges,
        "topic_centrality": top_topics
    }


def _competitive_gaps(videos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    topic_stats = defaultdict(lambda: {"supply": 0, "demand": 0.0})

    for video in videos:
        topic = video.get("topic_primary") or "general_repair"
        topic_stats[topic]["supply"] += 1
        topic_stats[topic]["demand"] += max(_safe_float(video.get("views_per_hour"), 0.0), 1.0)

    gaps = []
    for topic, stats in topic_stats.items():
        supply = stats["supply"]
        demand = stats["demand"]
        gap_score = demand / max(supply, 1)
        gaps.append({
            "topic": topic,
            "demand_score": round(demand, 2),
            "supply_score": supply,
            "gap_score": round(gap_score, 2),
            "priority_rank": 0
        })

    gaps.sort(key=lambda item: item["gap_score"], reverse=True)
    for idx, gap in enumerate(gaps, start=1):
        gap["priority_rank"] = idx
    return gaps[:15]


def apply_intelligence_layers(videos: List[Dict[str, Any]], niche: str = "automotive") -> Dict[str, Any]:
    log.info("Applying intelligence layers to %d videos (niche=%s)", len(videos), niche)
    top10_before_analysis = _top_videos(videos, key_name="final_score", limit=10)

    for video in videos:
        _classify_intent(video, niche=niche)
        _trend_forecast(video)
        _multimodal_score(video)

    _apply_cohort_outliers(videos)

    for video in videos:
        _retention_proxy(video)
        _compute_composite_video_score(video)

    for idx, video in enumerate(sorted(videos, key=lambda item: _safe_float(item.get("analysis_score_10"), 0.0), reverse=True), start=1):
        video["analysis_rank"] = idx

    top10_after_analysis = _top_videos(videos, key_name="analysis_score_10", limit=10)

    intent_distribution = Counter(video.get("intent_label", "unknown") for video in videos)
    top_trends = sorted(videos, key=lambda video: video.get("trend_score_7d", 0), reverse=True)[:12]

    viewer_journey = _build_viewer_journey(videos)
    competitive_gaps = _competitive_gaps(videos)

    top_outliers = sorted(
        videos,
        key=lambda video: abs(_safe_float(video.get("cohort_zscore"), 0.0)),
        reverse=True
    )[:10]

    summary = {
        "methods_applied": [
            "intent_classification",
            "trend_velocity_forecasting",
            "cohort_outlier_detection",
            "multimodal_ctr_proxy",
            "viewer_journey_graph",
            "retention_proxy_model",
            "competitive_gap_scanner",
            "composite_video_score_10"
        ],
        "score_model": {
            "name": "composite_video_score_10",
            "range": "0-10",
            "factors": [
                "description_quality",
                "click_to_view_ratio_or_ctr_proxy",
                "view_count",
                "views_per_hour",
                "views_vs_subscribers",
                "views_vs_channel_avg",
                "engagement",
                "relevance",
                "retention_proxy"
            ]
        },
        "top10_before_analysis": top10_before_analysis,
        "top10_after_analysis": top10_after_analysis,
        "intent_distribution": [{"label": label, "count": count} for label, count in intent_distribution.most_common()],
        "top_trends": [
            {
                "video_id": video.get("video_id"),
                "title": video.get("title"),
                "topic": video.get("topic_primary"),
                "trend_score_7d": video.get("trend_score_7d"),
                "breakout_probability": video.get("breakout_probability")
            }
            for video in top_trends
        ],
        "cohort_outliers": [
            {
                "video_id": video.get("video_id"),
                "title": video.get("title"),
                "cohort_id": video.get("cohort_id"),
                "cohort_zscore": video.get("cohort_zscore")
            }
            for video in top_outliers
        ],
        "viewer_journey": viewer_journey,
        "competitive_gaps": competitive_gaps
    }

    return summary


def semantic_search(query: str, videos: List[Dict[str, Any]], embeddings: Optional[Any] = None, model_name: str = MODEL_NAME, top_n: int = 10) -> List[Dict[str, Any]]:
    if not HAS_TRANSFORMER:
        raise RuntimeError("sentence-transformers is required for semantic search.")

    if embeddings is None:
        embeddings = [video.get("semantic_embedding") for video in videos]
        if any(item is None for item in embeddings):
            embeddings = None

    if embeddings is None:
        model = load_model(model_name)
        videos_text = [build_text(video) for video in videos]
        embeddings = model.encode(videos_text, convert_to_numpy=True, show_progress_bar=False, normalize_embeddings=True)
    else:
        embeddings = np.array(embeddings)

    model = load_model(model_name)
    query_embedding = model.encode([query], convert_to_numpy=True, normalize_embeddings=True)

    scores = np.inner(embeddings, query_embedding[0])
    top_indices = list(scores.argsort()[::-1][:top_n])

    results = []
    for idx in top_indices:
        results.append({
            "video_id": videos[idx].get("video_id"),
            "title": videos[idx].get("title"),
            "channel_title": videos[idx].get("channel_title"),
            "score": float(scores[idx]),
            "video_url": videos[idx].get("video_url")
        })
    return results


def enrich_videos(videos: List[Dict[str, Any]], model_name: str = MODEL_NAME, niche: str = "automotive") -> Dict[str, Any]:
    try:
        embeddings = add_semantic_embeddings(videos, model_name=model_name)
        labels = cluster_embeddings(embeddings)

        for video, label in zip(videos, labels):
            video["semantic_cluster"] = int(label) if label != -1 else None

        semantic_neighbors(videos, embeddings)
    except Exception as exc:
        log.warning("Semantic steps failed or unavailable: %s. Proceeding with intelligence layers.", exc)

    intelligence_summary = apply_intelligence_layers(videos, niche=niche)
    return intelligence_summary


def write_json(path: str, data: Any) -> None:
    with open(path, "w", encoding="utf-8") as file_obj:
        json.dump(data, file_obj, indent=2, ensure_ascii=False)


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8-sig") as file_obj:
        return json.load(file_obj)


def main(niche: str = "automotive", target: str = "merged") -> None:
    from pipeline_paths import get_paths, resolve_niche

    resolved = resolve_niche(niche)
    paths = get_paths(resolved)
    paths.ensure_dirs()

    if target == "top100":
        in_path = paths.top_100
        out_path = paths.top_100_semantic
        label = "top_100"
    else:
        in_path = paths.merged
        out_path = paths.merged_semantic
        label = "merged"

    log.info("semantic_research.py running for niche=%s target=%s", resolved, label)

    if not in_path.exists():
        log.error("Input file not found: %s. Run the prior pipeline step first.", in_path)
        raise FileNotFoundError(f"Input file not found: {in_path}. Run the prior pipeline step first.")

    data = load_json(str(in_path))
    videos = data.get("videos", [])
    if not videos:
        raise ValueError(f"No videos found in {in_path}")

    log.info("Loaded %d videos from %s", len(videos), in_path.name)
    intelligence_summary = enrich_videos(videos, model_name=MODEL_NAME, niche=resolved)

    metadata = data.get("metadata", {})
    metadata["niche"] = resolved
    metadata["semantic_target"] = label
    metadata["intelligence_summary"] = intelligence_summary
    metadata["intelligence_model"] = {
        "semantic_model": MODEL_NAME,
        "methods_count": 8,
    }

    output = {
        "metadata": metadata,
        "videos": videos,
    }

    write_json(str(out_path), output)
    log.info("Saved semantic dataset with intelligence layers to %s", out_path)

if __name__ == "__main__":
    import sys

    niche_arg = sys.argv[1] if len(sys.argv) > 1 else "automotive"
    target_arg = sys.argv[2] if len(sys.argv) > 2 else "merged"
    main(niche_arg, target=target_arg)
