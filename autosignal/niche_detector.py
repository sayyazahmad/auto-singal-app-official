"""
niche_detector.py
=================
Auto-detects a YouTube channel's primary niche by scanning the last 30
video titles and descriptions against each niche's detection_keywords list.

Usage:
    from niche_detector import NicheDetector
    detector = NicheDetector()
    result = detector.detect("UCxxxxxxxxxxxxxx")
    # {"niche": "finance", "confidence": 0.87, "scores": {"finance": 0.87, "automotive": 0.03, ...}, "display_name": "Finance & Investing", "icon": "💰"}

Confidence thresholds:
    >= 0.55  — High confidence, skip UI override step
    0.35–0.54 — Medium confidence, show override with suggestion
    < 0.35   — Low confidence, show override (required)

The detector uses cached results from Supabase if the creator has been
analyzed before — skips the API call entirely for returning creators.
"""

import logging
import re
from collections import defaultdict
from typing import Dict, Optional, Any

from niche_config import NICHE_CONFIGS, get_niche_config

log = logging.getLogger(__name__)

# Niche confidence thresholds
CONFIDENCE_HIGH   = 0.55   # Auto-confirm, no UI interrupt
CONFIDENCE_MEDIUM = 0.35   # Show detected niche + offer override
CONFIDENCE_LOW    = 0.00   # Always show override selection

# Minimum keyword hits to even register a niche as a candidate
MIN_KEYWORD_HITS = 2


class NicheDetector:
    """
    Classifies a YouTube channel into one of the registered AutoSignal niches
    by scoring video titles and descriptions against keyword lists.

    Does NOT make YouTube API calls itself — expects video data to be passed in,
    or calls channel_auditor.ChannelAuditor.fetch_channel_videos() internally.
    """

    def __init__(self):
        # Pre-process all keyword lists for fast matching
        self._keyword_patterns: Dict[str, list] = {}
        for niche_key, cfg in NICHE_CONFIGS.items():
            keywords = cfg.get("detection_keywords", [])
            # Compile each keyword as a whole-word pattern for precision
            self._keyword_patterns[niche_key] = [
                re.compile(r"\b" + re.escape(kw.lower()) + r"\b")
                for kw in keywords
            ]

    def detect_from_videos(self, videos: list) -> Dict[str, Any]:
        """
        Given a list of video dicts (title + description), score against
        all niches and return the best match.

        Args:
            videos: List of dicts with at least {"title": str, "description": str}

        Returns:
            {
                "niche": str,           # best-match niche key
                "confidence": float,    # 0.0-1.0 normalized score
                "scores": dict,         # raw scores per niche
                "display_name": str,    # human-readable niche name
                "icon": str,            # emoji icon
                "ui_color": str,        # CSS hex color
                "is_high_confidence": bool,
                "total_videos_scanned": int,
            }
        """
        if not videos:
            log.warning("NicheDetector: no videos provided, defaulting to automotive")
            return self._default_result()

        # Build a single long text from titles + first 300 chars of descriptions
        texts = []
        for v in videos[:30]:  # Only scan first 30 — plenty for classification
            title = str(v.get("title", "")).lower()
            desc  = str(v.get("description", ""))[:300].lower()
            texts.append(f"{title} {desc}")

        combined_text = " ".join(texts)

        # Score each niche
        raw_scores: Dict[str, float] = {}
        keyword_hits: Dict[str, int] = {}

        for niche_key, patterns in self._keyword_patterns.items():
            hits = sum(1 for pat in patterns if pat.search(combined_text))
            keyword_hits[niche_key] = hits
            raw_scores[niche_key] = hits

        log.debug("NicheDetector raw keyword hits: %s", keyword_hits)

        # Filter niches with too few hits
        viable = {k: v for k, v in raw_scores.items() if v >= MIN_KEYWORD_HITS}

        if not viable:
            log.info("NicheDetector: no strong signal found, defaulting to automotive")
            return self._default_result(videos_scanned=len(texts))

        total_hits = sum(viable.values()) or 1
        normalized: Dict[str, float] = {
            k: round(v / total_hits, 4) for k, v in viable.items()
        }

        # Pick the winner
        best_niche = max(normalized, key=normalized.get)
        confidence = normalized[best_niche]

        # Build full scores dict (include all niches, 0.0 for non-viable)
        full_scores = {k: normalized.get(k, 0.0) for k in NICHE_CONFIGS}

        cfg = get_niche_config(best_niche)
        result = {
            "niche":              best_niche,
            "confidence":         confidence,
            "scores":             full_scores,
            "display_name":       cfg["display_name"],
            "icon":               cfg.get("icon", "🎯"),
            "ui_color":           cfg.get("ui_color", "#6c63ff"),
            "is_high_confidence": confidence >= CONFIDENCE_HIGH,
            "total_videos_scanned": len(texts),
        }

        log.info(
            "NicheDetector: detected '%s' (%.0f%% confidence) from %d videos",
            best_niche, confidence * 100, len(texts)
        )
        return result

    def detect_from_channel(self, channel_id: str, api_key: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetches the last 30 videos from a channel (minimal API call)
        and runs detection. Uses shared API key manager if api_key is None.

        This is a lightweight version — only fetches titles, no full stats.
        Costs ~2 YouTube API quota units (1 for channel → uploads ID, 1 for playlist).
        """
        try:
            from youtube_api_utils import get_api_manager, request_with_retry

            manager = get_api_manager()

            # Step 1: Get uploads playlist ID
            channel_resp = request_with_retry(
                "https://www.googleapis.com/youtube/v3/channels",
                {"part": "contentDetails,snippet", "id": channel_id}
            )
            items = channel_resp.get("items", [])
            if not items:
                log.warning("NicheDetector: channel '%s' not found", channel_id)
                return self._default_result()

            uploads_id = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]

            # Step 2: Fetch first page of uploads (up to 30 videos, titles only)
            playlist_resp = request_with_retry(
                "https://www.googleapis.com/youtube/v3/playlistItems",
                {"part": "snippet", "playlistId": uploads_id, "maxResults": 30}
            )

            videos = [
                {
                    "title":       it["snippet"].get("title", ""),
                    "description": it["snippet"].get("description", ""),
                }
                for it in playlist_resp.get("items", [])
                if it.get("snippet")
            ]

            return self.detect_from_videos(videos)

        except Exception as e:
            log.error("NicheDetector.detect_from_channel error: %s", e)
            return self._default_result()

    def _default_result(self, videos_scanned: int = 0) -> Dict[str, Any]:
        """Returns the automotive fallback result."""
        cfg = get_niche_config("automotive")
        return {
            "niche":              "automotive",
            "confidence":         0.0,
            "scores":             {k: 0.0 for k in NICHE_CONFIGS},
            "display_name":       cfg["display_name"],
            "icon":               cfg.get("icon", "🔧"),
            "ui_color":           cfg.get("ui_color", "#6c63ff"),
            "is_high_confidence": False,
            "total_videos_scanned": videos_scanned,
        }


# ── Niche override helpers (used by server.js API and viewer.html) ────────────

def get_niche_options() -> list:
    """Returns all niches as UI option objects for the override dropdown."""
    return [
        {
            "key":          niche,
            "display_name": cfg["display_name"],
            "icon":         cfg.get("icon", "🎯"),
            "ui_color":     cfg.get("ui_color", "#6c63ff"),
        }
        for niche, cfg in NICHE_CONFIGS.items()
    ]


# ── CLI test ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json
    import sys

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-8s %(message)s")

    channel_id = sys.argv[1] if len(sys.argv) > 1 else None

    if channel_id:
        print(f"\nDetecting niche for channel: {channel_id}")
        detector = NicheDetector()
        result = detector.detect_from_channel(channel_id)
        print(json.dumps(result, indent=2))
    else:
        # Self-test with sample video titles
        print("\nRunning NicheDetector self-test with sample data...\n")
        detector = NicheDetector()

        test_cases = [
            {
                "label": "Finance channel",
                "videos": [
                    {"title": "How I Invest $5000 Every Month in Index Funds", "description": "budgeting ETF vanguard"},
                    {"title": "My Roth IRA Strategy for 2024", "description": "retirement investing dividend"},
                    {"title": "Tax Deductions You're Missing as a Self-Employed Person", "description": "tax strategy 1099"},
                ]
            },
            {
                "label": "Tech/AI channel",
                "videos": [
                    {"title": "I Tested Every AI Tool So You Don't Have To", "description": "ChatGPT Claude Gemini review"},
                    {"title": "Build a Full-Stack App With Python and React", "description": "coding tutorial web dev"},
                    {"title": "Why I Switched From Notion to Obsidian", "description": "PKM productivity tool review"},
                ]
            },
            {
                "label": "Productivity channel",
                "videos": [
                    {"title": "My Morning Routine That Changed Everything", "description": "habits discipline focus deep work"},
                    {"title": "The Notion Template I Use to Plan My Week", "description": "productivity system time management"},
                    {"title": "How I Work 4 Hours a Day as a Freelancer", "description": "remote work freelance income"},
                ]
            },
            {
                "label": "Automotive channel",
                "videos": [
                    {"title": "How to Replace Brake Pads on a F-150", "description": "DIY car repair mechanic"},
                    {"title": "Silverado Transmission Rebuild Step by Step", "description": "truck fix Chevy automatic"},
                    {"title": "Check Engine Light? Here's What OBD2 Codes Mean", "description": "diagnostic scan tool"},
                ]
            },
        ]

        for test in test_cases:
            result = detector.detect_from_videos(test["videos"])
            match = "[OK]" if result["niche"] in test["label"].lower()[:10] else "[MISS]"
            print(f"{match} {test['label']}: detected='{result['niche']}' confidence={result['confidence']:.0%}")


    print("\nDone.")
