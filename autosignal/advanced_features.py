"""
Advanced YouTube Intelligence Features - Quant-Level Architecture
=================================================================

Capabilities upgraded to probabilistic modeling and portfolio theory:

1. Thumbnail + Title Generator
   - Analyzes winning thumbnails and titles with confidence scores
   - Generates specific recommendations

2. Quant-Level Trend Prediction
   - Models viral probability using exponential curves
   - Calculates Momentum vs. Competition Pressure
   - Generates a single "Alpha" Opportunity Score

3. Hedge Fund Content Portfolio
   - Builds a balanced production pipeline
   - Allocates: High Conviction, Medium Bets, Experimental Plays

Usage:
    from advanced_features import ThumbnailGenerator, QuantPredictor, PortfolioPlanner
    
    # After running fetch_automotive_videos.py
    import json
    with open("top_100_automotive_videos.json") as f:
        data = json.load(f)
    
    thumb_gen = ThumbnailGenerator(data["videos"])
    quant = QuantPredictor(data["videos"])
    planner = PortfolioPlanner(data["videos"], channel_id="your_channel_id")
"""

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any
import sqlite3
import uuid
from dataclasses import dataclass

try:
    import numpy as np
except ImportError:
    print("Error: numpy is required for quant modeling. Run: pip install numpy")
    raise


# ─────────────────────────────────────────────
# DATA CLASSES
# ─────────────────────────────────────────────

@dataclass
class ThumbnailPattern:
    style: str
    has_face: bool
    has_text: bool
    dominant_colors: list[str]
    urgency_indicators: bool
    confidence_score: float
    example_videos: list[str]
    description: str


@dataclass
class QuantOpportunity:
    topic: str
    top_video_id: str
    top_video_title: str
    viral_probability: float  # 0.0 to 1.0
    momentum_score: float
    competition_pressure: float
    alpha_score: float  # The ultimate metric
    projected_views_48h: int
    related_topics: list[str]


@dataclass
class PortfolioAllocation:
    conviction_level: str  # High, Medium, Experimental
    allocation_percent: int
    recommendations: list[QuantOpportunity]


@dataclass
class HedgeFundPortfolio:
    channel_id: str
    week_starting: str
    total_alpha: float
    allocations: dict[str, PortfolioAllocation]
    risk_profile: str


# ─────────────────────────────────────────────
# 1. THUMBNAIL GENERATOR (Retained & Optimized)
# ─────────────────────────────────────────────

class ThumbnailGenerator:
    """Analyzes winning thumbnails and generates specific recommendations."""
    
    def __init__(self, videos: list[dict]):
        self.videos = videos
        self.winning_videos = self._filter_winners()
        
    def _filter_winners(self) -> list[dict]:
        sorted_videos = sorted(
            self.videos,
            key=lambda v: (v.get("engagement_score", 0), v.get("views_per_hour", 0)),
            reverse=True
        )
        return sorted_videos[:20]
    
    def _extract_color_palette(self, video: dict) -> list[str]:
        tags = video.get("thumbnail_tags", [])
        if not tags:
            return ["red", "yellow", "black"]
        
        color_map = {
            "red": ["urgent", "warning", "danger", "broken"],
            "yellow": ["attention", "caution", "bright"],
            "black": ["contrast", "professional"],
            "white": ["clean", "contrast"],
            "blue": ["technical", "professional"],
            "orange": ["warning", "energy"],
        }
        
        colors_found = []
        for tag in tags:
            tag_lower = tag.lower()
            for color, associations in color_map.items():
                if any(assoc in tag_lower for assoc in associations):
                    colors_found.append(color)
        
        return list(set(colors_found))[:3] or ["red", "yellow", "black"]
    
    def _classify_thumbnail_style(self, video: dict) -> str:
        full_text = f"{video.get('title', '')} {video.get('description', '')}".lower()
        
        if any(word in full_text for word in ["before", "after", "transformation", "destroy", "fixed"]):
            return "before_after_transformation"
        if any(word in full_text for word in ["diagnosis", "scan", "code", "reading", "display"]):
            return "diagnostic_screen_or_gauge"
        if any(word in full_text for word in ["broken", "crack", "damage", "failure", "problem"]):
            return "close_up_broken_part"
        if any(word in full_text for word in ["engine", "motor", "rebuild", "overhaul", "inside"]):
            return "internal_component_closeup"
        if any(word in full_text for word in ["shocked", "wow", "amazing", "unbelievable"]):
            return "person_reacting_surprised"
        if any(word in full_text for word in ["arrow", "point", "direction", "shows"]):
            return "diagram_with_arrows_and_text"
        if any(word in full_text for word in ["warning", "danger", "caution", "stop"]):
            return "warning_symbol_emphasis"
        return "generic_mechanical_closeup"
    
    def analyze_patterns(self) -> dict[str, ThumbnailPattern]:
        patterns = {}
        style_counter = Counter()
        color_counter = Counter()
        text_counter = Counter()
        face_counter = Counter()
        urgency_counter = Counter()
        
        for video in self.winning_videos:
            style = self._classify_thumbnail_style(video)
            style_counter[style] += 1
            for color in self._extract_color_palette(video):
                color_counter[color] += 1
            
            if video.get("thumbnail_has_text"): text_counter["has_text"] += 1
            if video.get("thumbnail_has_face"): face_counter["has_face"] += 1
            
            triggers = video.get("title_emotional_triggers", [])
            if any(t in triggers for t in ["warning", "stop", "destroy"]):
                urgency_counter["urgent"] += 1
        
        for style, count in style_counter.most_common(5):
            video_ids = [v["video_id"] for v in self.winning_videos if self._classify_thumbnail_style(v) == style][:3]
            patterns[style] = ThumbnailPattern(
                style=style,
                has_face=face_counter.get("has_face", 0) / len(self.winning_videos) > 0.3,
                has_text=text_counter.get("has_text", 0) / len(self.winning_videos) > 0.6,
                dominant_colors=[c for c, _ in color_counter.most_common(3)],
                urgency_indicators=urgency_counter.get("urgent", 0) / len(self.winning_videos) > 0.4,
                confidence_score=(count / len(self.winning_videos)) * 100,
                example_videos=video_ids,
                description=style.replace("_", " ").title()
            )
        return patterns
    
    def generate_brief(self) -> dict[str, Any]:
        patterns = self.analyze_patterns()
        if not patterns:
            return {"status": "insufficient_data"}
        
        style_name, pattern = list(patterns.items())[0]
        return {
            "status": "success",
            "primary_recommendation": {
                "style": style_name,
                "confidence": f"{pattern.confidence_score:.1f}%",
                "colors_to_use": pattern.dominant_colors,
                "include_text": pattern.has_text,
                "include_face": pattern.has_face,
                "use_urgency_markers": pattern.urgency_indicators,
            }
        }


# ─────────────────────────────────────────────
# 2. QUANT PREDICTOR (The Core Math Upgrade)
# ─────────────────────────────────────────────

REPRESENTATIVE_TITLES = {
    "no_start": ["no crank no start diagnosis", "engine won't turn over", "starter clicking noise"],
    "rough_idle": ["engine misfire and rough idle", "car shaking at stop light", "p0300 random misfire fix"],
    "overheating": ["car overheating in idle", "coolant boiling over", "blown head gasket symptoms"],
    "engine_knock": ["rod knock sound", "engine ticking noise", "lifter tick diagnosis"],
    "transmission": ["automatic transmission slipping", "hard shift from 1st to 2nd", "cvt transmission whine"],
    "brakes": ["grinding noise when braking", "spongy brake pedal fix", "brake caliper sticking"],
    "diagnostics": ["how to use obd2 scanner", "check engine light flashing", "can bus communication error"],
    "head_gasket": ["white smoke from exhaust", "oil and coolant mixed", "block tester head gasket check"],
}

_centroids = None

def _get_embedding_centroids() -> dict:
    global _centroids
    if _centroids is not None:
        return _centroids
    try:
        import numpy as np
        from sentence_transformers import SentenceTransformer
        print("Pre-computing embedding centroids for QuantPredictor topics...")
        model = SentenceTransformer("all-MiniLM-L6-v2")
        _centroids = {}
        for topic, titles in REPRESENTATIVE_TITLES.items():
            embeddings = model.encode(titles, convert_to_numpy=True, normalize_embeddings=True)
            centroid = np.mean(embeddings, axis=0)
            _centroids[topic] = centroid / np.linalg.norm(centroid)
        return _centroids
    except ImportError:
        return {}

class QuantPredictor:
    """Uses probabilistic modeling to find Alpha (High Reward / Low Competition)."""
    
    def __init__(self, videos: list[dict]):
        self.videos = videos
        self.now = datetime.now(timezone.utc)
        self.topic_groups = self._group_by_topic()
        
    def _extract_topic(self, video: dict) -> str:
        embedding = video.get("semantic_embedding")
        if embedding and len(embedding) > 0:
            centroids = _get_embedding_centroids()
            if centroids:
                import numpy as np
                vec = np.array(embedding)
                best_topic = "general_repair"
                best_score = -1.0
                for topic, centroid in centroids.items():
                    score = np.dot(vec, centroid)
                    if score > best_score:
                        best_score = score
                        best_topic = topic
                if best_score > 0.3:
                    return best_topic

        title = video.get("title", "").lower()
        topics = {
            "no_start": ["no start", "no crank", "won't start"],
            "rough_idle": ["rough idle", "misfire", "shaking"],
            "overheating": ["overheating", "coolant", "radiator"],
            "engine_knock": ["knock", "ping", "rod knock"],
            "transmission": ["transmission", "slipping", "hard shift"],
            "brakes": ["brake", "stopping", "caliper"],
            "diagnostics": ["diagnosis", "scan tool", "code", "p0"],
            "head_gasket": ["head gasket", "coolant leak"],
        }
        for topic, keywords in topics.items():
            if any(kw in title for kw in keywords):
                return topic
        return "general_repair"

    def _group_by_topic(self) -> dict[str, list[dict]]:
        groups = defaultdict(list)
        for v in self.videos:
            groups[self._extract_topic(v)].append(v)
        return groups

    def viral_probability(self, video: dict) -> float:
        """Calculates P(Viral | Features) using a Sigmoid function."""
        score = 0.0
        
        vph = video.get("views_per_hour", 0)
        score += np.log1p(vph) * 0.4
        
        hours = video.get("hours_since_publish", 1) or 1
        score += max(0, (24 - hours)) * 0.1
        
        score += video.get("engagement_score", 0) * 0.3
        
        triggers = len(video.get("title_emotional_triggers", []))
        score += triggers * 0.2
        
        # Sigmoid: 1 / (1 + e^-x) - bounds score between 0.0 and 1.0
        return 1 / (1 + np.exp(-score / 2.5))

    def trend_momentum(self, video: dict) -> float:
        """Calculates velocity and acceleration."""
        vph = video.get("views_per_hour", 0)
        hours = video.get("hours_since_publish", 1) or 1
        
        velocity = vph / (hours + 1)
        acceleration = np.log1p(vph) / (hours + 1)
        
        return (velocity * 0.6) + (acceleration * 0.4)

    def competition_pressure(self, topic_videos: list[dict]) -> float:
        """Models saturation pressure."""
        total = len(topic_videos)
        if total == 0: return 0.1
        
        avg_vph = np.mean([v.get("views_per_hour", 0) for v in topic_videos])
        
        # Log-smoothing prevents huge channels from breaking the math
        return total * np.log1p(avg_vph) * 0.1

    def opportunity_score(self, video: dict, topic_videos: list[dict]) -> float:
        """THE ALPHA: (Viral Probability * Momentum) / Competition"""
        p_viral = self.viral_probability(video)
        momentum = self.trend_momentum(video)
        competition = self.competition_pressure(topic_videos)
        
        # Add 1 to competition to avoid division by zero
        return (p_viral * momentum) / (1 + competition)

    def find_opportunities(self) -> list[QuantOpportunity]:
        opportunities = []
        
        for topic, videos in self.topic_groups.items():
            if not videos: continue
            
            top_video = max(videos, key=lambda v: v.get("views_per_hour", 0))
            
            p_viral = self.viral_probability(top_video)
            momentum = self.trend_momentum(top_video)
            comp_pressure = self.competition_pressure(videos)
            alpha = self.opportunity_score(top_video, videos)
            
            vph = top_video.get("views_per_hour", 0)
            proj_views = int(vph * 48 * p_viral) # Expected views in 48h
            
            opportunities.append(QuantOpportunity(
                topic=topic,
                top_video_id=top_video.get("video_id", ""),
                top_video_title=top_video.get("title", ""),
                viral_probability=p_viral,
                momentum_score=momentum,
                competition_pressure=comp_pressure,
                alpha_score=alpha,
                projected_views_48h=proj_views,
                related_topics=[]
            ))
            
        return sorted(opportunities, key=lambda o: o.alpha_score, reverse=True)


# ─────────────────────────────────────────────
# 3. PORTFOLIO PLANNER (Hedge Fund Approach)
# ─────────────────────────────────────────────

class PortfolioPlanner:
    """Builds a balanced content portfolio using Quant opportunities."""
    
    def __init__(self, videos: list[dict], channel_id: str = ""):
        self.channel_id = channel_id
        self.quant = QuantPredictor(videos)
        self.opportunities = self.quant.find_opportunities()
        
    def build_portfolio(self) -> HedgeFundPortfolio:
        week_start = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()[:10]
        
        # Sort by Alpha for Conviction mapping
        high_conviction = []
        medium_bets = []
        experimental = []
        
        for opp in self.opportunities:
            # High Alpha, Low Competition
            if opp.alpha_score > 1.5 and opp.competition_pressure < 5.0:
                high_conviction.append(opp)
            # High Viral Prob, but High Competition
            elif opp.viral_probability > 0.6 and opp.competition_pressure >= 5.0:
                medium_bets.append(opp)
            # High Momentum, Low/Unknown Viral Prob (New trend)
            elif opp.momentum_score > 2.0 and opp.viral_probability <= 0.6:
                experimental.append(opp)
            else:
                medium_bets.append(opp) # Fallback
                
        # Calculate Total Alpha
        total_alpha = sum(o.alpha_score for o in self.opportunities[:10])
                
        allocations = {
            "High Conviction": PortfolioAllocation(
                conviction_level="High Conviction (Low Risk / High Alpha)",
                allocation_percent=50,
                recommendations=high_conviction[:2]
            ),
            "Medium Bets": PortfolioAllocation(
                conviction_level="Medium Bets (Established Trends / High Comp)",
                allocation_percent=30,
                recommendations=medium_bets[:2]
            ),
            "Experimental Plays": PortfolioAllocation(
                conviction_level="Experimental (High Risk / Breakout Potential)",
                allocation_percent=20,
                recommendations=experimental[:1]
            )
        }
        
        return HedgeFundPortfolio(
            channel_id=self.channel_id,
            week_starting=week_start,
            total_alpha=round(total_alpha, 2),
            allocations=allocations,
            risk_profile="Aggressive Growth" if total_alpha > 10.0 else "Balanced Accumulation"
        )
        
    def export_brief(self, portfolio: HedgeFundPortfolio) -> dict[str, Any]:
        
        def format_opp(opp: QuantOpportunity) -> dict:
            return {
                "topic": opp.topic,
                "target_video": opp.top_video_title,
                "stats": {
                    "alpha_score": round(opp.alpha_score, 2),
                    "viral_probability": f"{opp.viral_probability * 100:.1f}%",
                    "competition_pressure": round(opp.competition_pressure, 2),
                    "expected_48h_views": f"{opp.projected_views_48h:,}"
                },
                "strategy": f"Alpha {round(opp.alpha_score, 2)} implies " + 
                            ("strong return on time invested." if opp.alpha_score > 1.0 else "a risky play.")
            }
            
        return {
            "status": "portfolio_ready",
            "week_starting": portfolio.week_starting,
            "system_alpha": portfolio.total_alpha,
            "recommended_risk_profile": portfolio.risk_profile,
            "allocations": {
                name: {
                    "strategy": alloc.conviction_level,
                    "time_allocation": f"{alloc.allocation_percent}%",
                    "videos_to_make": [format_opp(o) for o in alloc.recommendations]
                }
                for name, alloc in portfolio.allocations.items() if alloc.recommendations
            }
        }


# ─────────────────────────────────────────────
# 4. FEEDBACK LOOP MANAGER (Machine Learning Core)
# ─────────────────────────────────────────────

class FeedbackLoopManager:
    """
    Closes the loop between prediction and reality.
    Persists generated briefs and patterns, and evaluates them against actual video performance
    to continuously adjust confidence scores using Bayesian smoothing.
    """
    
    def __init__(self, db_path: str = "youtube_automotive.db"):
        self.db_path = db_path

    def log_pattern(self, pattern_type: str, pattern_value: str, initial_confidence: float) -> None:
        """Registers a discovered pattern into the DB without overwriting its historical win/loss data."""
        pattern_id = f"{pattern_type}_{pattern_value}".lower().replace(" ", "_")
        
        query = """
        INSERT INTO patterns (pattern_id, pattern_type, pattern_value, confidence_score, win_count, loss_count, last_updated)
        VALUES (?, ?, ?, ?, 0, 0, ?)
        ON CONFLICT(pattern_id) DO NOTHING
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(query, (pattern_id, pattern_type, pattern_value, initial_confidence, datetime.now(timezone.utc).isoformat()))

    def log_brief(self, channel_id: str, topic: str, title_rec: str, thumb_rec: str) -> str:
        """Saves a generated brief to the database so it can be tracked later."""
        brief_id = str(uuid.uuid4())
        query = """
        INSERT INTO briefs (brief_id, channel_id, cluster_id, generated_at, title_recommended, thumbnail_style_recommended, was_used, target_video_id, actual_performance)
        VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL)
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(query, (brief_id, channel_id, topic, datetime.now(timezone.utc).isoformat(), title_rec, thumb_rec))
        return brief_id
        
    def ingest_portfolio(self, portfolio: HedgeFundPortfolio, thumb_patterns: dict) -> None:
        """Helper method to log all patterns and generated briefs directly from your Planner classes."""
        # Log the thumbnail patterns
        for style_name, pattern_data in thumb_patterns.items():
            self.log_pattern("thumbnail_style", style_name, pattern_data.confidence_score / 100.0)
            
        # Log the recommended briefs
        for alloc_name, allocation in portfolio.allocations.items():
            for opp in allocation.recommendations:
                self.log_brief(
                    channel_id=portfolio.channel_id,
                    topic=opp.topic,
                    title_rec=f"Optimized Title for: {opp.top_video_title}",
                    thumb_rec=list(thumb_patterns.keys())[0] if thumb_patterns else "unknown"
                )

    def close_the_loop(self) -> int:
        """
        The core learning mechanism.
        Finds all briefs marked as 'was_used' that haven't been evaluated yet.
        Cross-references with the 'videos' table to determine actual performance.
        Updates pattern win/loss counts and recalculates Bayesian confidence.
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Fetch unevaluated briefs linked to uploaded videos
            cursor.execute('''
                SELECT b.brief_id, b.thumbnail_style_recommended, b.title_recommended, v.is_sample_outlier, v.final_score
                FROM briefs b
                JOIN videos v ON b.target_video_id = v.video_id
                WHERE b.was_used = 1 AND b.actual_performance IS NULL
            ''')
            unevaluated = cursor.fetchall()
            
            evaluated_count = 0
            for row in unevaluated:
                # 1. Define a "Win" (Did it achieve Alpha?)
                is_win = row["is_sample_outlier"] == 1 or (row["final_score"] and row["final_score"] >= 50.0)
                perf_status = "WIN" if is_win else "LOSS"
                
                # 2. Extract patterns used in this brief
                patterns_used = []
                if row["thumbnail_style_recommended"]:
                    patterns_used.append(("thumbnail_style", row["thumbnail_style_recommended"]))
                
                # 3. Update pattern statistics
                for p_type, p_value in patterns_used:
                    p_id = f"{p_type}_{p_value}".lower().replace(" ", "_")
                    
                    if is_win:
                        cursor.execute("UPDATE patterns SET win_count = win_count + 1 WHERE pattern_id = ?", (p_id,))
                    else:
                        cursor.execute("UPDATE patterns SET loss_count = loss_count + 1 WHERE pattern_id = ?", (p_id,))
                    
                    # 4. Recalculate Bayesian Confidence 
                    # We add a "prior" of 5 wins and 5 losses. This prevents 1-0 records from locking in 100% confidence.
                    cursor.execute('''
                        UPDATE patterns 
                        SET confidence_score = ROUND(CAST((win_count + 5) AS REAL) / (win_count + loss_count + 10), 3),
                            last_updated = ?
                        WHERE pattern_id = ?
                    ''', (datetime.now(timezone.utc).isoformat(), p_id))
                
                # 5. Mark brief as evaluated
                cursor.execute(
                    "UPDATE briefs SET actual_performance = ? WHERE brief_id = ?", 
                    (perf_status, row["brief_id"])
                )
                evaluated_count += 1
            
            conn.commit()
            return evaluated_count


# ─────────────────────────────────────────────
# USAGE EXAMPLE
# ─────────────────────────────────────────────

if __name__ == "__main__":
    try:
        with open("top_100_automotive_videos.json", "r") as f:
            data = json.load(f)
        
        videos = data.get("videos", [])
        
        print("\n" + "="*70)
        print("YOUTUBE INTELLIGENCE - QUANT-LEVEL ARCHITECTURE")
        print("="*70)
        
        # 1. QUANT PREDICTIONS
        print("\n[1] CALCULATING ALPHA & THUMBNAIL PATTERNS...")
        quant = QuantPredictor(videos)
        opps = quant.find_opportunities()
        
        thumb_gen = ThumbnailGenerator(videos)
        patterns = thumb_gen.analyze_patterns()
        
        print(f"Total topics analyzed: {len(opps)} | Thumbnail Patterns Extracted: {len(patterns)}")
        
        if opps:
            top = opps[0]
            print(f"Top Opportunity: '{top.topic}' (Alpha: {top.alpha_score:.2f})")
            print(f"  → Viral Probability: {top.viral_probability*100:.1f}%")
        
        # 2. HEDGE FUND PORTFOLIO
        print("\n[2] GENERATING CONTENT PORTFOLIO...")
        print("-" * 70)
        planner = PortfolioPlanner(videos, channel_id="themechanic868")
        portfolio = planner.build_portfolio()
        brief = planner.export_brief(portfolio)
        
        print(json.dumps(brief, indent=2))
        
        # 3. THE FEEDBACK LOOP
        print("\n[3] LOGGING TO MACHINE LEARNING FEEDBACK LOOP...")
        try:
            feedback_manager = FeedbackLoopManager()
            feedback_manager.ingest_portfolio(portfolio, patterns)
            eval_count = feedback_manager.close_the_loop()
            print("Successfully logged briefs and patterns to SQLite database.")
            print(f"Evaluated {eval_count} past videos against their generated briefs.")
        except Exception as db_err:
            print(f"Feedback Loop skipped: Database not found or initialized. ({db_err})")
        
    except FileNotFoundError:
        print("Error: top_100_automotive_videos.json not found.")
        print("Run fetch_automotive_videos.py first to generate the data file.")
    except Exception as e:
        print(f"An error occurred: {e}")
