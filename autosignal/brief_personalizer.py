# brief_personalizer.py
# Takes cluster opportunities from the pipeline
# and filters/weights them for a specific creator.
# The creator profile from channel_auditor.py feeds into this.

import logging
import re
from typing import Any, Dict, List, Optional, Tuple
from collections import defaultdict
from channel_auditor import SUBNICHE_DISPLAY
from shared_utils import VEHICLE_MAKES as _VEHICLE_MAKES
try:
    from cluster_research import _get_embedding_centroids
except ImportError:
    def _get_embedding_centroids(niche: str = "automotive"):
        return None

log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# SUB-NICHE DETECTION FOR OPPORTUNITIES
# Same logic as channel audit — applied to pipeline opportunities
# ─────────────────────────────────────────────────────────────

def detect_opportunity_subniche(cluster: Dict, niche: str = "automotive") -> str:
    """
    Which sub-niche does this cluster opportunity belong to?
    Uses embedding similarity to the niche's topic centroids.
    """
    centroids = _get_embedding_centroids(niche)
    if not centroids:
        return "general_maintenance"
        
    text_parts = [cluster.get("cluster_label", "")]
    for title in cluster.get("top_titles", []):
        text_parts.append(title)
        
    for video in cluster.get("videos", [])[:5] + cluster.get("top_videos", [])[:5]:
        if isinstance(video, dict):
            text_parts.append(video.get("title", ""))
        
    text = " ".join(text_parts).strip()
    if not text:
        return "general_maintenance"
        
    try:
        import numpy as np
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("all-MiniLM-L6-v2")
        vec = model.encode([text], convert_to_numpy=True, normalize_embeddings=True)[0]
        
        best_topic = "general_maintenance"
        best_score = -1.0
        
        for topic, centroid in centroids.items():
            score = np.dot(vec, centroid)
            if score > best_score:
                best_score = score
                best_topic = topic
                
        return best_topic if best_score > 0.3 else "general_maintenance"
    except ImportError:
        return "general_maintenance"


def detect_opportunity_vehicles(cluster: Dict) -> List[str]:
    """
    Which vehicles does this cluster opportunity reference?
    """
    text_parts = [cluster.get("label", "")]
    for title in cluster.get("top_titles", []):
        text_parts.append(title)

    text = " ".join(text_parts)
    text_lower = text.lower()
    
    detected_vehicles = [
        make for make, terms in _VEHICLE_MAKES.items()
        if any(term in text_lower for term in terms)
    ]

    return detected_vehicles if detected_vehicles else ["general"]


# ─────────────────────────────────────────────────────────────
# PERSONALIZATION ENGINE
# ─────────────────────────────────────────────────────────────

class BriefPersonalizer:
    """
    Filters and weights cluster opportunities
    based on a specific creator's profile.

    Input:
        all_clusters     — ranked list from cluster_ranker.py
        creator_profile  — from channel_auditor.py

    Output:
        personalized_opportunities — ranked for THIS creator
    """

    # How many briefs to generate per batch
    BRIEF_BATCH_SIZE = 5

    # Brief allocation rules
    # Primary subniche gets majority of briefs
    # Secondary gets a few
    # One wildcard (highest alpha regardless of subniche)
    ALLOCATION = {
        "primary":   3,   # 3/5 briefs from primary subniche
        "secondary": 1,   # 1/5 from secondary subniche
        "wildcard":  1    # 1/5 highest alpha — any subniche
    }

    def __init__(self, creator_profile: Dict[str, Any]):
        self.profile = creator_profile
        self.primary_subniche   = creator_profile.get("primary_subniche", "general_maintenance")
        self.secondary_subniche = creator_profile.get("secondary_subniche")
        self.tertiary_subniche  = creator_profile.get("tertiary_subniche")
        self.subniche_dist      = creator_profile.get("subniche_distribution", {})
        self.subniche_perf      = creator_profile.get("subniche_performance", {})
        self.vehicles_covered   = set(creator_profile.get("vehicles_covered", []))
        self.avoid_vehicles     = set(creator_profile.get("avoid_vehicles", []))
        self.never_send         = set(creator_profile.get("never_send_subniches", []))
        self.low_priority       = set(creator_profile.get("low_priority_subniches", []))

    # ── HARD FILTER ───────────────────────────────────────────

    def passes_hard_filter(self, cluster: Dict) -> Tuple[bool, str]:
        """
        Hard NO — creator cannot or should not cover this topic.
        Return (passes, reason_if_rejected)
        """
        niche = self.profile.get("niche", "automotive")
        subniche = cluster.get("_opp_subniche") or detect_opportunity_subniche(cluster, niche)
        vehicles = cluster.get("_opp_vehicles") or detect_opportunity_vehicles(cluster)

        # Never send subniches they've never touched
        if subniche in self.never_send:
            return False, f"Sub-niche '{subniche}' never covered by this creator"

        # If opportunity is vehicle-specific and creator has never
        # covered that vehicle — skip it
        if vehicles != ["general"]:
            creator_covers_any = any(
                v in self.vehicles_covered for v in vehicles
            )
            if not creator_covers_any and len(self.vehicles_covered) > 3:
                # Only hard filter if creator HAS a clear vehicle specialization
                return False, f"Vehicles {vehicles} not in creator's coverage history"

        return True, ""

    # ── SOFT SCORING ──────────────────────────────────────────

    def calculate_creator_fit_score(self, cluster: Dict) -> float:
        """
        How well does this opportunity fit this creator?
        Returns multiplier: 0.3 (poor fit) to 2.0 (perfect fit)

        Applied ON TOP of the cluster's alpha score.
        """
        niche = self.profile.get("niche", "automotive")
        subniche = cluster.get("_opp_subniche") or detect_opportunity_subniche(cluster, niche)
        vehicles = cluster.get("_opp_vehicles") or detect_opportunity_vehicles(cluster)

        multiplier = 1.0

        # ── Contamination Penalty ─────────────────────────────
        # Check if the cluster was flagged as non-automotive
        top_video = (cluster.get("top_videos") or [{}])[0]
        if top_video.get("contamination_flag"):
            multiplier *= 0.2 # Heavy penalty for non-automotive content

        # ── Sub-niche fit (biggest factor) ────────────────────

        creator_share = self.subniche_dist.get(subniche, 0.0)

        if subniche == self.primary_subniche:
            # Creator's home territory — massive boost
            multiplier *= 1.8
        elif subniche == self.secondary_subniche:
            # They do this too — good boost
            multiplier *= 1.4
        elif subniche == self.tertiary_subniche:
            # Occasional topic — moderate boost
            multiplier *= 1.2
        elif creator_share >= 0.10:
            # They make some content here
            multiplier *= 1.1
        elif subniche in self.low_priority:
            # Rarely covered — penalty
            multiplier *= 0.6
        else:
            # Unknown territory — significant penalty
            multiplier *= 0.4

        # ── Sub-niche performance fit ─────────────────────────
        # Does this sub-niche PERFORM WELL for this creator?
        subniche_avg = self.subniche_perf.get(subniche, {}).get("avg_views", 0)
        channel_avg  = self.profile.get("avg_views", 1)

        if subniche_avg > 0 and channel_avg > 0:
            perf_ratio = subniche_avg / channel_avg
            if perf_ratio >= 1.5:
                # This subniche crushes for them
                multiplier *= 1.3
            elif perf_ratio >= 1.0:
                # Performs at or above average
                multiplier *= 1.1
            elif perf_ratio >= 0.7:
                # Slightly underperforms
                multiplier *= 0.9
            else:
                # Consistently underperforms for them
                multiplier *= 0.7

        # ── Vehicle fit ────────────────────────────────────────
        if vehicles != ["general"]:
            vehicle_matches = [
                v for v in vehicles if v in self.vehicles_covered
            ]
            if vehicle_matches:
                # Creator covers these exact vehicles
                # Boost proportional to how often they cover them
                for v in vehicle_matches:
                    v_share = self.profile.get(
                        "vehicle_distribution", {}
                    ).get(v, 0)
                    multiplier *= (1.0 + v_share * 0.5)
            else:
                # Creator doesn't cover these vehicles
                multiplier *= 0.5

        # ── Topic gap fit ──────────────────────────────────────────────
        # Boost topics that are high opportunity but not already covered
        creator_topics = set(extract_topics_from_creator(self.profile))
        topic = cluster.get("cluster_label") or cluster.get("topic")
        if topic and topic not in creator_topics:
            # It's a content gap! Give it a massive discovery boost
            multiplier *= 1.5

        return round(min(multiplier, 2.5), 4)

    # ── MASTER PERSONALIZATION ────────────────────────────────

    def personalize(
        self,
        all_ranked_clusters: List[Dict],
        batch_size: int = 5
    ) -> List[Dict]:
        """
        MASTER FUNCTION.

        Takes all ranked clusters from pipeline.
        Returns the best N opportunities for this specific creator.

        Distribution enforced:
        - Majority from primary sub-niche
        - Some from secondary sub-niche
        - One wildcard (best alpha regardless of sub-niche)
        """
        if not all_ranked_clusters:
            log.warning("No clusters to personalize from.")
            return []

        # Step 1: Detect subniche and vehicles for each cluster
        niche = self.profile.get("niche", "automotive")
        for cluster in all_ranked_clusters:
            cluster["_opp_subniche"] = detect_opportunity_subniche(cluster, niche)
            cluster["_opp_vehicles"] = detect_opportunity_vehicles(cluster)

        # Step 2: Apply hard filters
        passing_clusters = []
        rejected = []
        for cluster in all_ranked_clusters:
            passes, reason = self.passes_hard_filter(cluster)
            if passes:
                passing_clusters.append(cluster)
            else:
                rejected.append((cluster.get("cluster_label", "unknown"), reason))
                log.debug("Rejected cluster '%s': %s", cluster.get("cluster_label", "unknown"), reason)

        log.info(
            "%d clusters passed filter, %d rejected for creator '%s'",
            len(passing_clusters), len(rejected),
            self.profile.get("channel_name", "unknown")
        )

        # Step 3: Calculate creator-adjusted score for each cluster
        for cluster in passing_clusters:
            fit_score  = self.calculate_creator_fit_score(cluster)
            base_score = float((cluster.get("opportunity_metrics") or {}).get("opportunity_score", 0) or cluster.get("cluster_score10", 0))
            cluster["creator_fit_score"]     = fit_score
            cluster["creator_adjusted_score"] = round(base_score * fit_score, 4)

        # Step 4: Sort by creator-adjusted score
        passing_clusters.sort(
            key=lambda c: c["creator_adjusted_score"],
            reverse=True
        )

        # Step 5: Enforce distribution
        final_briefs = self._enforce_distribution(
            passing_clusters, batch_size
        )

        log.info(
            "Final brief selection for '%s': %s",
            self.profile.get("channel_name", "?"),
            [(b.get("cluster_label", "unknown"), b.get("_opp_subniche", "unknown")) for b in final_briefs]
        )

        return final_briefs

    def _enforce_distribution(
        self,
        ranked_clusters: List[Dict],
        batch_size: int
    ) -> List[Dict]:
        """
        Enforce sub-niche distribution in the brief batch.

        For a 5-brief batch:
        → 3 briefs: primary sub-niche (or high-weight sub-niches)
        → 1 brief:  secondary sub-niche
        → 1 brief:  wildcard (highest creator-adjusted score)
        """

        result = []
        used_cluster_ids = set()

        def take_next(
            from_clusters: List[Dict],
            subniche_filter: Optional[str] = None,
            exclude_ids: Optional[set] = None
        ) -> Optional[Dict]:
            """Take the next best cluster matching criteria."""
            for c in from_clusters:
                if exclude_ids and c.get("cluster_id") in exclude_ids:
                    continue
                if subniche_filter and c["_opp_subniche"] != subniche_filter:
                    continue
                return c
            return None

        # ── Slot 1-3: Primary sub-niche ───────────────────────
        primary_count = min(
            max(batch_size - 2, 1),  # At least 1, at most batch_size - 2
            3
        )

        for _ in range(primary_count):
            cluster = take_next(
                ranked_clusters,
                subniche_filter=self.primary_subniche,
                exclude_ids=used_cluster_ids
            )
            if cluster:
                result.append(cluster)
                used_cluster_ids.add(cluster["cluster_id"])

        # If primary sub-niche doesn't have enough opportunities,
        # fill from high-weight secondary sub-niches
        while len(result) < primary_count:
            # Try top sub-niches by distribution weight
            for subniche in list(self.subniche_dist.keys())[:3]:
                if subniche == self.primary_subniche:
                    continue
                cluster = take_next(
                    ranked_clusters,
                    subniche_filter=subniche,
                    exclude_ids=used_cluster_ids
                )
                if cluster:
                    result.append(cluster)
                    used_cluster_ids.add(cluster["cluster_id"])
                    break
            else:
                break  # No more options

        # ── Slot 4: Secondary sub-niche ───────────────────────
        if self.secondary_subniche and len(result) < batch_size - 1:
            cluster = take_next(
                ranked_clusters,
                subniche_filter=self.secondary_subniche,
                exclude_ids=used_cluster_ids
            )
            if cluster:
                result.append(cluster)
                used_cluster_ids.add(cluster["cluster_id"])

        # ── Slot 5: Wildcard ───────────────────────────────────
        # Best creator-adjusted score regardless of sub-niche
        if len(result) < batch_size:
            cluster = take_next(
                ranked_clusters,
                subniche_filter=None,
                exclude_ids=used_cluster_ids
            )
            if cluster:
                result.append(cluster)
                used_cluster_ids.add(cluster["cluster_id"])

        # If we still need more, fill with best remaining
        while len(result) < batch_size:
            cluster = take_next(
                ranked_clusters,
                exclude_ids=used_cluster_ids
            )
            if not cluster:
                break
            result.append(cluster)
            used_cluster_ids.add(cluster["cluster_id"])

        return result[:batch_size]


# ─────────────────────────────────────────────────────────────
# ASYNC PIPELINE COORDINATOR
# ─────────────────────────────────────────────────────────────

class PipelineCoordinator:
    """
    Runs channel audit and market pipeline simultaneously.
    When both complete, merges results into personalized briefs.

    This is the async architecture you asked for:
    "audit runs while pipeline processes in backend"
    """

    def __init__(self, youtube_api_key: str, db_client=None):
        self.youtube_api_key = youtube_api_key
        self.db = db_client  # Supabase or any storage

    async def onboard_creator(
        self,
        channel_id: str,
        channel_url: str
    ) -> Dict[str, Any]:
        """
        Called when a creator signs up.

        Runs simultaneously:
        1. Channel audit (analyze their content history)
        2. Market pipeline (fetch trending opportunities)

        When both done: generate personalized briefs.
        """
        import asyncio

        log.info("Starting parallel onboarding for: %s", channel_id)

        # Run both in parallel
        audit_task    = asyncio.create_task(
            self._run_audit(channel_id)
        )
        pipeline_task = asyncio.create_task(
            self._run_pipeline()
        )

        # Wait for both
        creator_profile, cluster_intelligence = await asyncio.gather(
            audit_task,
            pipeline_task
        )

        # Save creator profile
        if self.db:
            self.db.table("creator_profiles").upsert(
                creator_profile
            ).execute()

        # Generate personalized briefs
        personalizer = BriefPersonalizer(creator_profile)
        all_clusters = cluster_intelligence.get("all_clusters_ranked", [])
        personalized = personalizer.personalize(all_clusters, batch_size=5)

        # Update cluster intelligence with personalized selection
        cluster_intelligence["personalized_clusters"] = personalized
        cluster_intelligence["creator_profile"] = creator_profile

        return {
            "creator_profile":      creator_profile,
            "cluster_intelligence": cluster_intelligence,
            "ready_for_briefs":     len(personalized) > 0
        }

    async def _run_audit(self, channel_id: str) -> Dict:
        """Run channel audit asynchronously."""
        import asyncio
        from channel_auditor import ChannelAuditor

        loop = asyncio.get_event_loop()
        auditor = ChannelAuditor()

        # Run blocking audit in thread pool
        creator_profile = await loop.run_in_executor(
            None,
            auditor.run_audit,
            channel_id
        )
        return creator_profile

    async def _run_pipeline(self) -> Dict:
        """Run market pipeline asynchronously."""
        import asyncio

        loop = asyncio.get_event_loop()

        # Run blocking pipeline in thread pool
        cluster_intelligence = await loop.run_in_executor(
            None,
            self._execute_pipeline
        )
        return cluster_intelligence

    def _execute_pipeline(self) -> Dict:
        """Synchronous pipeline execution (runs in thread pool)."""
        # This calls your existing pipeline:
        # metadata_fetch → semantic_engine → cluster_ranker
        from cluster_research import get_cluster_intelligence

        # Load latest market data
        import json
        from pipeline_paths import get_paths
        with get_paths("automotive").merged_semantic.open("r", encoding="utf-8") as f:
            data = json.load(f)

        videos = data.get("videos", [])
        cluster_labels = {
            v.get("semantic_cluster"): v.get("cluster_label")
            for v in videos
            if v.get("semantic_cluster") is not None
        }

        return get_cluster_intelligence(
            videos,
            cluster_labels,
            creator_profile=None,  # No profile yet — raw opportunities
            top_videos_n=10
        )


# ─────────────────────────────────────────────────────────────
# CREATOR AUDIT IMPROVEMENTS
# ─────────────────────────────────────────────────────────────

def extract_topics_from_clusters(clusters: List[Dict]) -> List[str]:
    """Extract all unique topic labels from cluster intelligence."""
    topics = set()
    for c in clusters:
        topic = c.get("cluster_label") or c.get("topic")
        if topic:
            topics.add(topic)
    return list(topics)

def extract_topics_from_creator(creator_profile: Dict) -> List[str]:
    """Extract all topics the creator has covered based on subniche distribution."""
    # Maps from creator's subniches or cluster_topics_ranked
    topics = set(creator_profile.get("cluster_topics_ranked", []))
    
    # Also extract the labels from subniches if cluster_topics is missing
    if not topics:
        for subniche in creator_profile.get("subniche_distribution", {}).keys():
            topics.add(SUBNICHE_DISPLAY.get(subniche, subniche))
            
    return list(topics)

def calculate_competitor_overlap(creator_profile: Dict, all_clusters: List[Dict]) -> Dict:
    """
    Extract top 5 channels by view count from market data,
    and measure overlap with creator's primary topics.
    """
    from collections import defaultdict
    
    channel_views = defaultdict(int)
    channel_videos = defaultdict(list)
    
    for cluster in all_clusters:
        for video in cluster.get("top_videos", []):
            channel = video.get("channel_title", "Unknown")
            views = video.get("view_count", 0)
            channel_views[channel] += views
            channel_videos[channel].append(video)
            
    top_channels = sorted(channel_views.keys(), key=lambda k: channel_views[k], reverse=True)[:5]
    
    overlap_report = {}
    creator_topics = set(extract_topics_from_creator(creator_profile))
    
    for channel in top_channels:
        # Extract topics this competitor focuses on
        channel_topics = set()
        for v in channel_videos[channel]:
            # Guess topic from cluster if available
            topic = v.get("cluster_label") or "general_maintenance"
            channel_topics.add(topic)
            
        overlap = creator_topics.intersection(channel_topics)
        overlap_report[channel] = {
            "total_market_views": channel_views[channel],
            "overlap_topics": list(overlap),
            "overlap_score": len(overlap) / max(len(creator_topics), 1)
        }
        
    return overlap_report

# ─────────────────────────────────────────────────────────────
# SYNCHRONOUS VERSION (For MVP — no async needed yet)
# ─────────────────────────────────────────────────────────────

def get_personalized_opportunities(
    creator_profile: Dict[str, Any],
    cluster_intelligence: Dict[str, Any],
    batch_size: int = 5
) -> List[Dict]:
    """
    Simple synchronous version for MVP.

    Call this after both audit and pipeline complete.
    Returns personalized cluster list ready for brief generation.
    """
    personalizer = BriefPersonalizer(creator_profile)
    all_clusters = cluster_intelligence.get("all_clusters_ranked", [])

    return personalizer.personalize(all_clusters, batch_size=batch_size)


# ─────────────────────────────────────────────────────────────
# AUDIT SUMMARY FOR DASHBOARD / CONSOLE
# ─────────────────────────────────────────────────────────────

def print_audit_summary(creator_profile: Dict) -> None:
    """
    Print a clean summary of the channel audit.
    Use this for your internal review and for
    the creator's onboarding screen.
    """
    print("\n" + "═" * 60)
    print(f"  CHANNEL AUDIT: {creator_profile['channel_name']}")
    print("═" * 60)

    print(f"\n  SIZE:        {creator_profile['size_tier']}")
    print(f"  TYPE:        {creator_profile['niche_depth']}")
    print(f"  PRIMARY:     {SUBNICHE_DISPLAY.get(creator_profile['primary_subniche'], 'N/A')}")
    if creator_profile.get("secondary_subniche"):
        print(f"  SECONDARY:   {SUBNICHE_DISPLAY.get(creator_profile['secondary_subniche'], 'N/A')}")

    print(f"\n  SUBSCRIBERS: {creator_profile['subscribers']:,}")
    print(f"  AVG VIEWS:   {creator_profile['avg_views']:,}")
    print(f"  BEST VIDEO:  {creator_profile['best_views']:,} views")
    print(f"  UPLOADS:     {creator_profile['upload_frequency']}")
    print(f"  BEST DAY:    {creator_profile['best_upload_day'].capitalize()}")

    print(f"\n  SUB-NICHE DISTRIBUTION:")
    for subniche, share in list(creator_profile["subniche_distribution"].items())[:5]:
        bar = "█" * int(share * 30)
        label = SUBNICHE_DISPLAY.get(subniche, subniche)
        print(f"  {label:<25} {bar} {share*100:.0f}%")

    print(f"\n  TOP VEHICLES:")
    for vehicle in creator_profile["vehicles_covered"][:4]:
        print(f"  → {vehicle.replace('_', ' ').title()}")

    print(f"\n  PERFORMANCE BY SUB-NICHE:")
    for subniche, perf in list(creator_profile["subniche_performance"].items())[:4]:
        label = SUBNICHE_DISPLAY.get(subniche, subniche)
        print(f"  {label:<25} avg {perf['avg_views']:>7,} views  "
              f"(best: {perf['best_views']:,})")

    print(f"\n  CONSTRAINTS (never send):")
    for s in creator_profile["never_send_subniches"][:5]:
        print(f"  × {SUBNICHE_DISPLAY.get(s, s)}")

    print("\n" + "═" * 60)
    print(f"  Videos analyzed: {creator_profile['total_videos_analyzed']}")
    print("═" * 60 + "\n")

def print_creator_dashboard(opportunities: List[Dict]) -> None:
    """
    Print the Creator Dashboard output requested by the user.
    Extremely concise, focused on action.
    """
    print("\n" + "═" * 60)
    print("  CREATOR DASHBOARD: TOP OPPORTUNITIES")
    print("═" * 60)

    for idx, opp in enumerate(opportunities, start=1):
        # Extract best video for title/evidence
        top_videos = opp.get("top_videos", [])
        best_video = top_videos[0] if top_videos else {}
        ref_title = best_video.get("title", opp.get("cluster_label", "Unknown Topic"))
        ref_views = best_video.get("view_count", 0)
        
        # Calculate why and evidence
        metrics = opp.get("opportunity_metrics", {})
        demand = metrics.get("demand", 0)
        competition = metrics.get("competition", 0)
        fit = opp.get("creator_fit_score", 0) * 10
        
        why = f"High demand ({demand}/10) with low competition pressure ({competition}/10). Perfect match for your channel's technical depth ({fit:.1f}/10 fit)."
        evidence = f"Reference video '{ref_title[:40]}...' generated {ref_views:,} views."
        
        # Angle based on the subniche and topic
        subniche = opp.get("_opp_subniche", opp.get("topic", "general"))
        angle = f"Focus on {subniche.replace('_', ' ')} with clear diagnostic steps and a strong visual hook showing the broken component."

        print(f"\n  Opportunity #{idx}: {opp.get('cluster_label', 'Unknown Topic').upper()}")
        print(f"  Title Strategy:  Similar to '{ref_title}'")
        print(f"  Why:             {why}")
        print(f"  Evidence:        {evidence}")
        print(f"  Suggested Angle: {angle}")

    print("\n" + "═" * 60 + "\n")

def print_audit_improvements(creator_profile: Dict, cluster_intel: Dict) -> None:
    """Print the Creator Audit Improvements (gaps and competitor overlap)."""
    clusters = cluster_intel.get("all_clusters_ranked", [])
    
    # 1. Content Gaps
    cluster_topics = set(extract_topics_from_clusters(clusters))
    creator_topics = set(extract_topics_from_creator(creator_profile))
    gaps = cluster_topics - creator_topics
    
    print("\n" + "═" * 60)
    print("  CREATOR AUDIT IMPROVEMENTS")
    print("═" * 60)
    
    print(f"\n  CONTENT GAPS (High opportunity, never covered):")
    if gaps:
        for gap in list(gaps)[:5]:
            print(f"  → {gap}")
    else:
        print("  → No major gaps found.")
        
    # 2. Competitor Overlap
    overlap_report = calculate_competitor_overlap(creator_profile, clusters)
    print(f"\n  COMPETITOR OVERLAP (Top 5 Channels in Market):")
    for channel, data in overlap_report.items():
        score = data["overlap_score"] * 100
        print(f"  → {channel[:20]:<20} | {score:>3.0f}% topic overlap | {data['total_market_views']:>10,} views")
        
    print("\n" + "═" * 60 + "\n")


if __name__ == "__main__":
    import asyncio
    import json
    import os

    # Load API key
    api_key = None
    env_path = os.path.join(os.path.dirname(__file__), "api_keys.txt")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("YOUTUBE_API_KEY="):
                    api_key = line.split("=", 1)[1].strip()
                    break
    
    if not api_key:
        print("Error: YOUTUBE_API_KEY not found in api_keys.txt")
        exit(1)

    print("Running brief personalizer for @themechanic868...")
    
    # 1. Audit channel
    from channel_auditor import ChannelAuditor
    auditor = ChannelAuditor()
    creator_profile = auditor.run_audit("UCf3Vtm8OTBsyjJwYfmF2trw") # themechanic868 channel ID
    print_audit_summary(creator_profile)

    # 2. Get clusters
    from cluster_research import get_cluster_intelligence
    cluster_intel = get_cluster_intelligence()

    # 3. Print Audit Improvements (Gaps & Competitors)
    print_audit_improvements(creator_profile, cluster_intel)

    # 4. Personalize (Topic Recommendations filtered by creator_fit + not_already_covered)
    opportunities = get_personalized_opportunities(creator_profile, cluster_intel, batch_size=3)

    # 5. Print Dashboard
    print_creator_dashboard(opportunities)