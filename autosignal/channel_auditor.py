"""
channel_auditor.py
==================
Audits a creator's channel and builds a CreatorProfile.
Runs BEFORE brief generation — tells the personalizer
exactly what this creator makes and what to never send.

Uses keyword classification (correct for this job —
fast, cheap, interpretable for 100 videos).

The SUBNICHE_TO_CLUSTER_TOPIC mapping at the bottom bridges
this file's 15 subniche labels to cluster_research.py's
14 topic labels, fixing the brief_personalizer scoring.
"""

import re
import json
import logging
import math
import requests
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path

# Use the shared API manager for key rotation
from youtube_api_utils import get_api_manager, request_with_retry

from shared_utils import VEHICLE_MAKES as _VEHICLE_MAKES

try:
    from cluster_research import _get_embedding_centroids
except ImportError:
    def _get_embedding_centroids(niche: str = "automotive"):
        return None

try:
    from niche_config import get_niche_config, NICHE_CONFIGS
    _NICHE_CONFIG_AVAILABLE = True
except ImportError:
    _NICHE_CONFIG_AVAILABLE = False
    NICHE_CONFIGS = {}
    def get_niche_config(niche):
        return {}

# ── Creator tier definitions ──────────────────────────────────────────────────
CREATOR_TIERS = {
    "micro":       {"min": 0,        "max": 9_999,   "label": "Micro Creator",       "strategy": "SEO-focused titles targeting long-tail searches. Niche down hard — specificity beats reach at this size."},
    "rising":      {"min": 10_000,   "max": 99_999,  "label": "Rising Creator",       "strategy": "Balance SEO with click-through hooks. You have enough authority for problem-specific titles. Lead with vehicle + symptom."},
    "established": {"min": 100_000, "max": 499_999, "label": "Established Creator",   "strategy": "Compete on differentiation. Cover angles competitors missed. Your brand pulls clicks — titles can be more compelling than search-literal."},
    "major":       {"min": 500_000, "max": None,    "label": "Major Creator",         "strategy": "Authority play. Cover definitive versions of high-volume topics. Trending stories and industry-first content compounds your reach."},
}

def get_creator_tier(subscribers: int) -> dict:
    """
    Classify a creator into a tier based on subscriber count.
    Returns the full tier dict including label and brief strategy hint.
    """
    for tier_key, tier in CREATOR_TIERS.items():
        max_subs = tier["max"]
        if max_subs is None or subscribers <= max_subs:
            return {"tier_key": tier_key, **tier}
    return {"tier_key": "major", **CREATOR_TIERS["major"]}

log = logging.getLogger(__name__)

YT_CHANNELS_URL      = "https://www.googleapis.com/youtube/v3/channels"
YT_PLAYLIST_URL      = "https://www.googleapis.com/youtube/v3/playlistItems"
YT_VIDEOS_URL        = "https://www.googleapis.com/youtube/v3/videos"


# ── Subniche taxonomy ─────────────────────────────────────────────────────────


SUBNICHE_DISPLAY = {
    "engine_repair":          "Engine Repair",
    "transmission_repair":    "Transmission Repair",
    "brake_system":           "Brake System",
    "suspension_steering":    "Suspension & Steering",
    "electrical_electronics": "Electrical & Electronics",
    "cooling_system":         "Cooling System",
    "exhaust_system":         "Exhaust System",
    "fuel_system":            "Fuel System",
    "hvac_system":            "HVAC & Climate",
    "drivetrain":             "Drivetrain & 4WD",
    "general_maintenance":    "General Maintenance",
    "diesel_specific":        "Diesel Specialist",
    "performance_tuning":     "Performance & Tuning",
    "classic_restoration":    "Classic Restoration",
    "off_road":               "Off-Road & Overlanding",
}

def get_subniche_display(niche: str = "automotive") -> dict:
    """Returns subniche display names for the given niche."""
    if _NICHE_CONFIG_AVAILABLE:
        cfg = get_niche_config(niche)
        return cfg.get("subniches", SUBNICHE_DISPLAY)
    return SUBNICHE_DISPLAY

SUBNICHE_TO_CLUSTER_TOPIC = {
    "engine_repair":          "engine",
    "transmission_repair":    "transmission",
    "brake_system":           "brakes",
    "suspension_steering":    "suspension",
    "electrical_electronics": "electrical",
    "cooling_system":         "cooling",
    "fuel_system":            "fuel_system",
    "hvac_system":            "ac_hvac",
    "diesel_specific":        "diesel",
    "general_maintenance":    "oil",
    "diagnostics":            "diagnostics",
    "drivetrain":             "transmission",
    "performance_tuning":     "engine",
    "classic_restoration":    "engine",
    "off_road":               "heavy_equipment",
    "exhaust_system":         "fuel_system",
}


# ── ChannelAuditor ────────────────────────────────────────────────────────────

class ChannelAuditor:
    """
    Audits a YouTube channel and builds a complete CreatorProfile.

    Usage:
        auditor = ChannelAuditor()
        profile = auditor.run_audit("UCxxxxxx")

    The profile feeds directly into brief_personalizer.BriefPersonalizer
    to filter and weight cluster opportunities.
    """

    def __init__(self):
        # Uses shared ApiKeyManager — auto-rotates across all 5 keys
        self._api_manager = get_api_manager()

    def _get(self, url: str, params: Dict) -> Dict:
        """
        Shared HTTP call with key rotation and retry.
        Replaces direct requests.get() calls that had no error handling.
        """
        return request_with_retry(url, params)

    # ── Step 1: Fetch channel videos ─────────────────────────────────────────

    def fetch_channel_videos(
        self, channel_id: str, max_videos: int = 100
    ) -> Tuple[List[Dict], Dict]:
        """
        Pull up to max_videos recent uploads from the channel.
        Uses uploads playlist (1 quota unit per 50 videos vs 100 for search).
        """
        # Get channel metadata + uploads playlist ID
        channel_data = self._get(YT_CHANNELS_URL, {
            "part": "contentDetails,statistics,snippet",
            "id": channel_id,
        })

        items = channel_data.get("items", [])
        if not items:
            raise ValueError(
                f"Channel not found or API error for channel_id='{channel_id}'. "
                f"Check the channel ID and API key quota."
            )

        item        = items[0]
        uploads_id  = item["contentDetails"]["relatedPlaylists"]["uploads"]
        stats       = item.get("statistics", {})
        subscribers = int(stats.get("subscriberCount", 0))
        total_views = int(stats.get("viewCount", 0))
        channel_name = item["snippet"]["title"]

        log.info("Fetching videos for '%s' (%.0fK subs)", channel_name, subscribers / 1000)

        # Page through uploads playlist
        videos: List[Dict] = []
        next_page_token: Optional[str] = None

        while len(videos) < max_videos:
            params: Dict[str, Any] = {
                "part":       "snippet,contentDetails",
                "playlistId": uploads_id,
                "maxResults": 50,
            }
            if next_page_token:
                params["pageToken"] = next_page_token

            playlist_resp = self._get(YT_PLAYLIST_URL, params)
            playlist_items = playlist_resp.get("items", [])

            if not playlist_items:
                break

            video_ids = [
                it["contentDetails"]["videoId"]
                for it in playlist_items
                if it.get("contentDetails", {}).get("videoId")
            ]

            if not video_ids:
                break

            # Fetch full stats for this batch
            stats_resp = self._get(YT_VIDEOS_URL, {
                "part": "statistics,snippet,contentDetails",
                "id":   ",".join(video_ids),
            })

            for v in stats_resp.get("items", []):
                snippet    = v.get("snippet", {})
                vstats     = v.get("statistics", {})
                content    = v.get("contentDetails", {})
                videos.append({
                    "video_id":      v["id"],
                    "title":         snippet.get("title", ""),
                    "description":   snippet.get("description", ""),
                    "tags":          snippet.get("tags", []),
                    "published_at":  snippet.get("publishedAt", ""),
                    "view_count":    int(vstats.get("viewCount",   0) or 0),
                    "like_count":    int(vstats.get("likeCount",   0) or 0),
                    "comment_count": int(vstats.get("commentCount",0) or 0),
                    "duration":      content.get("duration", ""),
                })

            next_page_token = playlist_resp.get("nextPageToken")
            if not next_page_token:
                break

        log.info("Fetched %d videos from '%s'", len(videos), channel_name)

        # Batch compute semantic embeddings
        if videos:
            try:
                from sentence_transformers import SentenceTransformer
                log.info("Computing semantic embeddings for %d videos...", len(videos))
                model = SentenceTransformer("all-MiniLM-L6-v2")
                texts = [f"{v.get('title', '')} {v.get('description', '')[:500]}" for v in videos]
                embeddings = model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
                for v, emb in zip(videos, embeddings):
                    v["semantic_embedding"] = emb.tolist()
            except ImportError:
                log.warning("sentence-transformers not installed, skipping batch embeddings.")

        channel_meta = {
            "channel_id":   channel_id,
            "channel_name": channel_name,
            "subscribers":  subscribers,
            "total_views":  total_views,
        }
        return videos, channel_meta

    # ── Step 2: Classify each video ──────────────────────────────────────────

    def classify_video_subniche(self, video: Dict) -> Tuple[str, float]:
        """
        Embedding-based subniche classification.
        Uses cosine similarity against pre-computed topic centroids.
        No keyword lists. Falls back to metadata fields if embedding is absent.
        """
        embedding = video.get("semantic_embedding")

        if embedding and len(embedding) > 0:
            centroids = _get_embedding_centroids(getattr(self, "_audit_niche", "automotive"))
            if centroids:
                import numpy as np
                vec = np.array(embedding, dtype=np.float32)
                norm = np.linalg.norm(vec)
                if norm > 0:
                    vec = vec / norm

                best_topic, best_score = "general_maintenance", 0.0
                for topic, centroid in centroids.items():
                    score = float(np.dot(vec, centroid))
                    if score > best_score:
                        best_score, best_topic = score, topic

                if best_score > 0.3:
                    return best_topic, round(best_score, 4)

        # Fallback 1: use topic already assigned by metadata_fetch or cluster_research
        topic = video.get("topic_primary")
        if topic and topic not in ("rejected", "general_repair", ""):
            return str(topic), 0.5

        # Fallback 2: use cluster label if available
        cluster = video.get("semantic_cluster")
        if cluster is not None:
            return f"cluster_{cluster}", 0.4

        return "general_maintenance", 0.0

    def detect_vehicles(self, video: Dict) -> List[str]:
        """Which vehicles does this video reference?"""
        text = f"{video.get('title', '')} {video.get('description', '')}".lower()
        
        detected_vehicles = [
            make for make, terms in _VEHICLE_MAKES.items()
            if any(term in text for term in terms)
        ]

        return detected_vehicles if detected_vehicles else ["general"]

    # ── Step 3: Build distributions ──────────────────────────────────────────

    def build_subniche_distribution(self, videos: List[Dict]) -> Dict[str, float]:
        """
        % of content per subniche, weighted 60% by count + 40% by views.
        Also stamps each video with _subniche for downstream methods.
        """
        subniche_counts: Counter = Counter()
        subniche_views:  Dict[str, int] = defaultdict(int)

        for video in videos:
            subniche, confidence = self.classify_video_subniche(video)
            video["_subniche"]            = subniche
            video["_subniche_confidence"] = confidence
            subniche_counts[subniche]    += 1
            subniche_views[subniche]     += video.get("view_count", 0)

        total       = max(len(videos), 1)
        total_views = max(sum(v.get("view_count", 0) for v in videos), 1)

        raw = {
            s: (subniche_counts[s] / total) * 0.60
             + (subniche_views[s] / total_views) * 0.40
            for s in subniche_counts
        }

        total_weight = sum(raw.values()) or 1.0
        distribution = {
            k: round(v / total_weight, 4)
            for k, v in sorted(raw.items(), key=lambda x: x[1], reverse=True)
        }
        return distribution

    def build_vehicle_distribution(self, videos: List[Dict]) -> Dict[str, float]:
        vehicle_counts: Counter = Counter()
        vehicle_views:  Dict[str, int] = defaultdict(int)

        for video in videos:
            vehicles = self.detect_vehicles(video)
            video["_vehicles"] = vehicles
            for v in vehicles:
                vehicle_counts[v] += 1
                vehicle_views[v]  += video.get("view_count", 0)

        total       = max(len(videos), 1)
        total_views = max(sum(v.get("view_count", 0) for v in videos), 1)

        raw = {
            v: (vehicle_counts[v] / total) * 0.60
             + (vehicle_views[v] / total_views) * 0.40
            for v in vehicle_counts
            if v != "general"
        }

        total_weight = sum(raw.values()) or 1.0
        return {
            k: round(v / total_weight, 4)
            for k, v in sorted(raw.items(), key=lambda x: x[1], reverse=True)
        }

    # ── Step 4: Performance metrics ──────────────────────────────────────────

    def calculate_performance_metrics(self, videos: List[Dict]) -> Dict[str, Any]:
        if not videos:
            return {}

        view_counts = sorted(v.get("view_count", 0) for v in videos)
        total       = len(view_counts)
        avg_views   = sum(view_counts) / total
        median_views = view_counts[total // 2]

        top_10_start = max(1, total * 9 // 10)
        top_views_avg = sum(view_counts[top_10_start:]) / max(len(view_counts[top_10_start:]), 1)

        bot_20_end    = max(1, total // 5)
        bot_views_avg = sum(view_counts[:bot_20_end]) / max(len(view_counts[:bot_20_end]), 1)

        # Upload frequency from last 20 videos
        dates: List[datetime] = []
        for v in videos:
            pub = v.get("published_at", "")
            if pub:
                try:
                    dates.append(datetime.fromisoformat(pub.replace("Z", "+00:00")))
                except Exception:
                    pass

        upload_frequency = "unknown"
        if len(dates) >= 2:
            dates.sort(reverse=True)
            recent = dates[:20]
            span_days = max((recent[0] - recent[-1]).days, 1)
            vpw = len(recent) / span_days * 7
            if   vpw >= 3:   upload_frequency = "3+ per week"
            elif vpw >= 1.5: upload_frequency = "2x per week"
            elif vpw >= 0.8: upload_frequency = "weekly"
            elif vpw >= 0.4: upload_frequency = "2x per month"
            else:            upload_frequency = "monthly or less"

        # Best upload day by average views
        day_views: Dict[str, List[int]] = defaultdict(list)
        for v in videos:
            pub = v.get("published_at", "")
            if pub:
                try:
                    dt = datetime.fromisoformat(pub.replace("Z", "+00:00"))
                    day_views[dt.strftime("%A").lower()].append(v.get("view_count", 0))
                except Exception:
                    pass

        day_avg = {
            day: sum(views) / len(views)
            for day, views in day_views.items()
        }
        best_day   = max(day_avg, key=day_avg.get) if day_avg else "tuesday"
        best_day_mult = round(day_avg.get(best_day, avg_views) / max(avg_views, 1), 2)

        return {
            "avg_views":             round(avg_views),
            "median_views":          round(median_views),
            "best_views":            max(view_counts),
            "worst_views":           min(view_counts),
            "top_10pct_avg":         round(top_views_avg),
            "bottom_20pct_avg":      round(bot_views_avg),
            "upload_frequency":      upload_frequency,
            "best_upload_day":       best_day,
            "best_day_multiplier":   best_day_mult,
            "total_videos_analyzed": total,
        }

    def subniche_performance_breakdown(self, videos: List[Dict]) -> Dict[str, Dict]:
        """Which subniches perform best for THIS creator."""
        subniche_data: Dict[str, List[int]] = defaultdict(list)
        for video in videos:
            # Depends on _subniche set by build_subniche_distribution()
            subniche = video.get("_subniche", "general_maintenance")
            subniche_data[subniche].append(video.get("view_count", 0))

        return {
            subniche: {
                "avg_views":    round(sum(views) / len(views)),
                "best_views":   max(views),
                "video_count":  len(views),
                "display_name": SUBNICHE_DISPLAY.get(subniche, subniche),
                "cluster_topic": subniche,
            }
            for subniche, views in subniche_data.items()
            if views
        }

    # ── Step 5: Constraints ───────────────────────────────────────────────────

    def detect_constraints(
        self,
        subniche_distribution: Dict[str, float],
        vehicle_distribution:  Dict[str, float],
    ) -> Dict[str, List]:
        """
        What should we NEVER or rarely send this creator?

        Hard never_send: subniches with ZERO presence in their content.
        Low priority: subniches with less than 5% of their content.

        NOTE: does NOT block subniches they've covered occasionally —
        only blocks truly alien topics they've never touched.
        """
        all_subniches     = set(SUBNICHE_DISPLAY.keys())
        covered_subniches = set(subniche_distribution.keys())
        never_send        = list(all_subniches - covered_subniches)

        all_vehicles     = set(_VEHICLE_MAKES.keys())
        covered_vehicles = set(vehicle_distribution.keys())
        avoid_vehicles   = list(all_vehicles - covered_vehicles)

        low_priority = [
            s for s, w in subniche_distribution.items()
            if w < 0.05
        ]

        return {
            "never_send":     never_send,
            "avoid_vehicles": avoid_vehicles,
            "low_priority":   low_priority,
        }

    # ── Step 6: Classify channel ──────────────────────────────────────────────

    def classify_channel(
        self,
        subscribers: int,
        subniche_distribution: Dict[str, float],
    ) -> Dict[str, str]:
        if   subscribers >= 500_000: size, size_detail = "LARGE",        f"{subscribers/1_000_000:.1f}M subscribers"
        elif subscribers >= 100_000: size, size_detail = "MEDIUM-LARGE", f"{subscribers/1_000:.0f}K subscribers"
        elif subscribers >= 25_000:  size, size_detail = "MEDIUM",       f"{subscribers/1_000:.0f}K subscribers"
        elif subscribers >= 5_000:   size, size_detail = "SMALL-MEDIUM", f"{subscribers/1_000:.0f}K subscribers"
        else:                        size, size_detail = "SMALL",        f"{subscribers:,} subscribers"

        top_share = max(subniche_distribution.values()) if subniche_distribution else 0.0

        if   top_share >= 0.65: depth, depth_detail = "DEEP SPECIALIST", f"{top_share*100:.0f}% content in one sub-niche"
        elif top_share >= 0.45: depth, depth_detail = "SPECIALIST",      f"{top_share*100:.0f}% content focused"
        elif top_share >= 0.30: depth, depth_detail = "SEMI-GENERALIST", f"Covers 2-3 sub-niches primarily"
        else:                   depth, depth_detail = "GENERALIST",      f"Broad automotive coverage"

        primary = list(subniche_distribution.keys())[0] if subniche_distribution else "general_maintenance"

        return {
            "size_tier":    size,
            "size_detail":  size_detail,
            "niche_depth":  depth,
            "depth_detail": depth_detail,
            "primary_label": SUBNICHE_DISPLAY.get(primary, primary),
        }

    # ── Master audit ──────────────────────────────────────────────────────────

    def run_audit(self, channel_id: str, max_videos: int = 100, niche: str = "auto") -> Dict:
        """
        Run complete channel audit. Returns full CreatorProfile.
        Called on creator signup. Runs while market pipeline processes in background.
        """
        # ── Niche detection ──────────────────────────────────────────────────
        if niche == "auto":
            try:
                from niche_detector import NicheDetector
                detector = NicheDetector()
                # We'll detect from videos after fetching — using titles
                _niche_to_detect_later = True
            except ImportError:
                log.warning("niche_detector not available, defaulting to automotive")
                niche = "automotive"
                _niche_to_detect_later = False
        else:
            _niche_to_detect_later = False

        log.info("ChannelAuditor.run_audit: niche=%s, channel=%s", niche, channel_id)
        log.info("Starting audit for channel: %s", channel_id)

        videos, channel_meta = self.fetch_channel_videos(channel_id, max_videos)

        # Auto-detect niche from fetched videos if requested
        niche_detection_result = {}
        if _niche_to_detect_later and videos:
            try:
                from niche_detector import NicheDetector
                detector = NicheDetector()
                niche_detection_result = detector.detect_from_videos(videos)
                niche = niche_detection_result.get("niche", "automotive")
                log.info(
                    "Auto-detected niche: '%s' (%.0f%% confidence)",
                    niche, niche_detection_result.get("confidence", 0) * 100
                )
            except Exception as e:
                log.warning("Niche auto-detection failed: %s — defaulting to automotive", e)
                niche = "automotive"

        if not videos:
            raise ValueError(f"No videos found for channel '{channel_id}'.")

        # Remember the resolved niche so embedding-based classification picks the
        # correct centroid set for this channel.
        self._audit_niche = niche

        # Build distributions (stamps _subniche on each video)
        subniche_dist = self.build_subniche_distribution(videos)
        vehicle_dist  = self.build_vehicle_distribution(videos)

        # Performance (depends on _subniche from above)
        perf          = self.calculate_performance_metrics(videos)
        subniche_perf = self.subniche_performance_breakdown(videos)

        # Constraints and classification
        constraints    = self.detect_constraints(subniche_dist, vehicle_dist)
        classification = self.classify_channel(channel_meta["subscribers"], subniche_dist)

        top_subniches = list(subniche_dist.keys())[:3]
        top_vehicles  = list(vehicle_dist.keys())[:5]

        creator_profile: Dict[str, Any] = {
            # Identity
            "channel_id":   channel_id,
            "channel_name": channel_meta["channel_name"],
            "subscribers":  channel_meta["subscribers"],
            "total_views":  channel_meta["total_views"],

            # Classification
            "size_tier":    classification["size_tier"],
            "size_detail":  classification["size_detail"],
            "niche_depth":  classification["niche_depth"],
            "depth_detail": classification["depth_detail"],
            "primary_label": classification["primary_label"],

            # Subniche profile (channel_auditor labels)
            "primary_subniche":   top_subniches[0] if top_subniches else "general_maintenance",
            "secondary_subniche": top_subniches[1] if len(top_subniches) > 1 else None,
            "tertiary_subniche":  top_subniches[2] if len(top_subniches) > 2 else None,
            "subniche_distribution": subniche_dist,
            "subniche_performance":  subniche_perf,

            # Cluster topic labels (for brief_personalizer scoring)
            "cluster_topics_ranked": [
                SUBNICHE_TO_CLUSTER_TOPIC.get(s, s) for s in top_subniches
            ],

            # Vehicle profile
            "primary_vehicle":    top_vehicles[0] if top_vehicles else "general",
            "vehicles_covered":   top_vehicles,
            "vehicle_distribution": vehicle_dist,

            # Performance baseline
            "avg_views":           perf.get("avg_views", 0),
            "median_views":        perf.get("median_views", 0),
            "best_views":          perf.get("best_views", 0),
            "top_10pct_avg":       perf.get("top_10pct_avg", 0),
            "upload_frequency":    perf.get("upload_frequency", "unknown"),
            "best_upload_day":     perf.get("best_upload_day", "tuesday"),
            "best_day_multiplier": perf.get("best_day_multiplier", 1.0),
            "total_videos_analyzed": perf.get("total_videos_analyzed", 0),

            # Constraints
            "never_send_subniches":   constraints["never_send"],
            "avoid_vehicles":         constraints["avoid_vehicles"],
            "low_priority_subniches": constraints["low_priority"],

            # Niche data
            "niche":               niche,
            "niche_display":       get_niche_config(niche).get("display_name", "Automotive Repair") if _NICHE_CONFIG_AVAILABLE else "Automotive Repair",
            "niche_icon":          get_niche_config(niche).get("icon", "\U0001f527") if _NICHE_CONFIG_AVAILABLE else "\U0001f527",
            "niche_ui_color":      get_niche_config(niche).get("ui_color", "#6c63ff") if _NICHE_CONFIG_AVAILABLE else "#6c63ff",
            "niche_confidence":    niche_detection_result.get("confidence", 1.0),
            "niche_scores":        niche_detection_result.get("scores", {}),
            "tier_strategy":       get_niche_config(niche).get("tier_strategies", {}).get(
                                       get_creator_tier(channel_meta["subscribers"]).get("tier_key", "rising"),
                                       ""
                                   ) if _NICHE_CONFIG_AVAILABLE else "",

            # Metadata
            "audit_complete": True,
            # Creator tier (for brief personalization)
            "creator_tier": get_creator_tier(channel_meta["subscribers"]),
            "audit_version":  "1.2",
        }
        # Persist to Supabase (non-fatal — local profile dict is still returned)
        try:
            from supabase_client import upsert_creator_profile
            upsert_creator_profile(creator_profile)
        except Exception as e:
            log.warning("Supabase creator profile upsert failed (non-fatal): %s", e)

        return creator_profile
        
