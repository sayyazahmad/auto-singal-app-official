"""
brief_generator.py
==================
THE core product file. This is what all other pipeline files feed into.

Takes cluster intelligence from cluster_research.py and a creator profile
from channel_auditor.py, calls the Gemini API (google.genai) with the production
system prompt, validates the output, and returns a production-ready brief.

Usage:
    from brief_generator import BriefGenerator
    gen = BriefGenerator()
    briefs = gen.generate_for_creator(channel_id="UCxxxxxx", count=5)
"""

import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ── .env loading ──────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from pipeline_paths import get_paths, resolve_niche

# ── Gemini import — NEW google.genai package only ────────────────────────────
# Install: pip install google-genai
# Do NOT use google-generativeai — it is deprecated and has a different API
from google import genai
from google.genai import types as genai_types

try:
    from niche_config import get_niche_config
    _NICHE_CONFIG_AVAILABLE = True
except ImportError:
    _NICHE_CONFIG_AVAILABLE = False
    def get_niche_config(niche):
        return {}

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s")
log = logging.getLogger("BriefGenerator")

ROOT = Path(__file__).resolve().parent

# ── API Key Loading ───────────────────────────────────────────────────────────

def _load_gemini_api_key() -> Optional[str]:
    """
    Load Gemini API key from .env file first, then fall back to environment variables.
    Priority: .env (GOOGLE_GEMINI_KEY / GEMINI_API_KEY) > env vars.
    NOTE: GOOGLE_API_KEY is intentionally lower priority — it is often set to a
    YouTube Data API key which cannot be used for Gemini and causes 400 errors.
    """
    # 1. Check .env file first for Gemini-specific keys
    env_path = ROOT / ".env"
    if env_path.exists():
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key in ("GOOGLE_GEMINI_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY") and val:
                    log.info("Loaded Gemini API key from .env file.")
                    return val

    # 2. Fall back to environment variables (Gemini-specific names first)
    api_key = (
        os.getenv("GOOGLE_GEMINI_KEY")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
    )
    if api_key:
        log.info("Loaded Gemini API key from environment.")
        return api_key

    raise RuntimeError(
        "No Gemini API key found.\n"
        "Add one of these to your .env file:\n"
        "  GOOGLE_GEMINI_KEY=your_key_here\n"
        "Get a key at: https://aistudio.google.com/apikey"
    )


# ── Initialise Gemini client at module level ──────────────────────────────────
# The new google.genai package uses a Client object, not genai.configure()
try:
    API_KEY = _load_gemini_api_key()
    _gemini_client = genai.Client(api_key=API_KEY)
    log.info("Gemini client initialised successfully.")
except RuntimeError as e:
    API_KEY = None
    _gemini_client = None
    log.warning("Gemini client not initialised: %s", e)


try:
    from rate_limiter import RateLimiter, BudgetExceededError, get_rate_limiter
    _RATE_LIMITER_AVAILABLE = True
except ImportError:
    _RATE_LIMITER_AVAILABLE = False
    class BudgetExceededError(Exception): pass

try:
    from supabase_client import save_brief as _supabase_save_brief
    _SUPABASE_AVAILABLE = True
except ImportError:
    _SUPABASE_AVAILABLE = False
    log.warning("supabase_client not found — briefs will only be saved to SQLite/JSON.")


# ── Gemini System Prompt ──────────────────────────────────────────────────────

BRIEF_SYSTEM_PROMPT = """
You are an elite YouTube content strategist. Your ONLY job is to generate production-ready content briefs for YouTube creators, returned as a single valid JSON object.

Your expertise spans:
— How the YouTube algorithm surfaces content across all niches
— What triggers a viewer to click at the exact moment they need a solution
— The psychology of intent-driven search (fix-now vs. comparison vs. educational)
— Seasonal demand shifts and how to frame urgency around them
— The precise difference between a $300K-view video and a 300-view video on the EXACT same topic
— How to tailor content strategy by creator tier (Micro / Rising / Established / Major)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1: THE DATA CONTRACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every brief you generate must be built EXCLUSIVELY from the data provided.
If the data does not contain enough information for a section, write "INSUFFICIENT DATA" for that field.
Do NOT fill gaps with plausible-sounding estimates. The creator will film a video based on your brief.
A wrong number or an invented competitor wastes a day of their life. That is unacceptable.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2: NON-NEGOTIABLE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULE 1 — OUTPERFORMANCE IS THE ONLY METRIC THAT MATTERS
Every title, hook, thumbnail, and upload timing recommendation must be justified:
"Why will this specific video outperform this creator's average views?"

RULE 2 — CREATOR TIER DEFINES STRATEGY
- MICRO (<10K subs): SEO-literal titles. Niche down hard. Exact topic + symptom in title.
- RISING (10K-100K): Combine SEO precision with click-through hooks.
- ESTABLISHED (100K-500K): Compete on angle differentiation. Cover gaps competitors missed.
- MAJOR (500K+): Authority framing. Definitive content on high-volume topics.

RULE 3 — BE DIRECTIVE, NOT SUGGESTIVE
WRONG: "You might consider leading with the symptom"
RIGHT: "Open with: 'If you are dealing with [specific problem], stop and watch this first.'"

RULE 4 — EVERY CLAIM HAS A SOURCE IN THE DATA
If you write a view count, it exists in the provided data.
If you reference a competitor video, it is in the provided data.

RULE 5 — NICHE SPECIFICITY IS MANDATORY
WRONG: "Talk about this topic generally"
RIGHT: "Focus on [specific sub-topic] — N of M top videos reference this exact angle"

RULE 6 — BANNED PHRASES
"You might want to...", "Consider using...", "Could potentially...",
"Generally speaking...", "It's worth noting...", "Keep in mind that..."
Any sentence that applies to ANY video on this topic — not specifically THIS one — is banned.

RULE 7 — HOOK IS SPOKEN WORDS
The hook_script must be the EXACT words the creator speaks in the first 15-20 seconds.
Not a description. The actual script. In natural spoken English.

RULE 8 — TITLE MATCHES REAL SEARCH BEHAVIOR
The title is the exact query the viewer types, made compelling enough to beat competing results.

RULE 9 — THUMBNAIL REFERENCES A SPECIFIC COMPETITOR
"Reference: '[EXACT video title from data]' — highest converting in cluster. Differentiate by [element]."

RULE 10 — TIMING USES CREATOR DATA
Upload timing must reference the creator's actual best_upload_day. Never invent a best time.

RULE 11 — SEASONAL CONTEXT IS MANDATORY
If current month signals are provided, integrate them. Frame urgency around the season.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3: OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output a single valid JSON object with EXACTLY these keys.
Escape all internal newlines in strings as \\n for valid JSON.

{
    "cluster_signal": {
        "topic_cluster": "string",
        "cluster_score": "float (0-10)",
        "avg_vph": "string",
        "competition": "string",
        "window": "string (URGENT, EVERGREEN, or SEASONAL)"
    },
    "topic_angle": "string",
    "search_intent": {
        "intent_type": "string",
        "viewer_state": "string"
    },
    "titles": {
        "title_1_search_match": "string",
        "title_2_curiosity": "string",
        "title_3_value": "string",
        "recommended_title": "string",
        "reason": "string"
    },
    "hook_script": "string (exact spoken words, 15-20 seconds)",
    "thumbnail_direction": {
        "primary_image": "string",
        "text_overlay": "string",
        "color_signal": "string",
        "reference": "string"
    },
    "key_points": [
        {"point": "string", "why": "string"}
    ],
    "what_to_avoid": [
        {"avoid": "string", "why": "string"}
    ],
    "tags": ["string"],
    "upload_timing": {
        "upload_by": "string",
        "day": "string",
        "time": "string",
        "reasoning": "string"
    },
    "performance_forecast": {
        "channel_baseline": "string",
        "expected_performance": "string",
        "confidence_level": "string (HIGH, MEDIUM, or LOW)",
        "reasoning": "string"
    }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4: SELF-CORRECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before outputting, verify: all keys present, nesting correct, strings properly escaped.
Fix any errors before final output.
"""

SELF_CORRECTION_SYSTEM_PROMPT = """
You are a JSON repair utility. Fix the provided text to be a single valid JSON object.
1. Fix syntax errors: unterminated strings, missing commas, incorrect quoting.
2. Add missing required keys with value "INSUFFICIENT DATA".
3. Do not change existing valid data.
4. Output ONLY the corrected JSON. No markdown, no explanation.
"""

# ── Structured-output schema (Gemini response_schema) ─────────────────────────
# This mirrors SECTION 3 of BRIEF_SYSTEM_PROMPT exactly. Passing it as
# `response_schema` (with response_mime_type="application/json") forces the model
# to emit JSON that parses AND conforms to this shape, eliminating the malformed-
# output cases that previously triggered the slow self-correction retry.
# Values use uppercase Gemini type names (OBJECT/STRING/NUMBER/ARRAY) and enums
# on the two fields the prompt already constrains (window, confidence_level).
BRIEF_RESPONSE_SCHEMA: Dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "cluster_signal": {
            "type": "OBJECT",
            "properties": {
                "topic_cluster": {"type": "STRING"},
                "cluster_score": {"type": "NUMBER"},
                "avg_vph": {"type": "STRING"},
                "competition": {"type": "STRING"},
                "window": {"type": "STRING", "enum": ["URGENT", "EVERGREEN", "SEASONAL"]},
            },
            "required": ["topic_cluster", "cluster_score", "avg_vph",
                         "competition", "window"],
        },
        "topic_angle": {"type": "STRING"},
        "search_intent": {
            "type": "OBJECT",
            "properties": {
                "intent_type": {"type": "STRING"},
                "viewer_state": {"type": "STRING"},
            },
            "required": ["intent_type", "viewer_state"],
        },
        "titles": {
            "type": "OBJECT",
            "properties": {
                "title_1_search_match": {"type": "STRING"},
                "title_2_curiosity": {"type": "STRING"},
                "title_3_value": {"type": "STRING"},
                "recommended_title": {"type": "STRING"},
                "reason": {"type": "STRING"},
            },
            "required": ["title_1_search_match", "title_2_curiosity", "title_3_value",
                         "recommended_title", "reason"],
        },
        "hook_script": {"type": "STRING"},
        "thumbnail_direction": {
            "type": "OBJECT",
            "properties": {
                "primary_image": {"type": "STRING"},
                "text_overlay": {"type": "STRING"},
                "color_signal": {"type": "STRING"},
                "reference": {"type": "STRING"},
            },
            "required": ["primary_image", "text_overlay", "color_signal", "reference"],
        },
        "key_points": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "point": {"type": "STRING"},
                    "why": {"type": "STRING"},
                },
                "required": ["point", "why"],
            },
        },
        "what_to_avoid": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "avoid": {"type": "STRING"},
                    "why": {"type": "STRING"},
                },
                "required": ["avoid", "why"],
            },
        },
        "tags": {"type": "ARRAY", "items": {"type": "STRING"}},
        "upload_timing": {
            "type": "OBJECT",
            "properties": {
                "upload_by": {"type": "STRING"},
                "day": {"type": "STRING"},
                "time": {"type": "STRING"},
                "reasoning": {"type": "STRING"},
            },
            "required": ["upload_by", "day", "time", "reasoning"],
        },
        "performance_forecast": {
            "type": "OBJECT",
            "properties": {
                "channel_baseline": {"type": "STRING"},
                "expected_performance": {"type": "STRING"},
                "confidence_level": {
                    "type": "STRING",
                    "enum": ["HIGH", "MEDIUM", "LOW"],
                },
                "reasoning": {"type": "STRING"},
            },
            "required": ["channel_baseline", "expected_performance",
                         "confidence_level", "reasoning"],
        },
    },
    "required": ["cluster_signal", "topic_angle", "search_intent", "titles",
                 "hook_script", "thumbnail_direction", "key_points",
                 "what_to_avoid", "tags", "upload_timing", "performance_forecast"],
}

# ── Config ────────────────────────────────────────────────────────────────────

GEMINI_MODEL          = "gemini-2.5-flash"
MAX_TOKENS            = 4096
TEMPERATURE           = 0.2
MAX_RETRIES           = 2
BRIEFS_PER_BATCH      = 5
BRIEF_QUALITY_THRESHOLD = 5


# ── Niche-aware specificity keywords (for score_brief_quality) ────────────────
# A "specific" title is one that names a concrete entity a viewer would search.
# The old list hard-coded automotive entities (f-150, p0, obd, torque) alongside
# a few finance/tech ones, so specificity was scored inconsistently across niches.
# Each niche now lists its own signaling entities; numbers are always specific.
SPECIFICITY_KEYWORDS_BY_NICHE: Dict[str, List[str]] = {
    "automotive": [
        "f-150", "silverado", "p0", "obd", "torque", "psi", "rpm", "amp",
        "cummins", "powerstroke", "duramax", "5.3", "5.7", "4.6", "civic",
        "camry", "accord", "altima", "silverado", "ram 1500",
    ],
    "finance": [
        "index fund", "s&p", "sp500", "vtsax", "vanguard", "bitcoin", "ethereum",
        "roth ira", "401k", "dividend", "etf", "compound interest", "voo",
        "fidelity", "schwab", "bogleheads", "4% rule", "fire",
    ],
    "technology": [
        "chatgpt", "claude", "gemini", "openai", "python", "react", "javascript",
        "typescript", "next.js", "vs code", "github", "cursor", "v0", "lovable",
        "api", "llm", "gpt-4", "vercel", "supabase", "stripe",
    ],
    "productivity": [
        "notion", "obsidian", "roam", "todoist", "things 3", "evernote",
        "pomodoro", "gtd", "getting things done", "zettelkasten", "second brain",
        "deep work", "atomic habits", "5 am", "5am", "gantt", "calendar",
    ],
}

# ── Niche-aware competitor-gap taxonomy (for _extract_competitor_gaps) ─────────
# The gaps a finance/tech/productivity creator should spot are NOT the same as a
# mechanic's (no "torque specifications" or "OBD codes" in finance content).
# Each niche has its own coverage checklist + the keyword signals that indicate
# a competitor already covered that gap.
GAP_TAXONOMY_BY_NICHE: Dict[str, Dict[str, List[str]]] = {
    "automotive": {
        "exact part numbers":            ["part number", "oem", "part #"],
        "cost comparison dealer vs DIY": ["dealer", "shop quote", "cost", "price"],
        "common mistakes to avoid":      ["mistake", "wrong", "avoid", "don't"],
        "symptoms checklist":            ["symptom", "sign", "warning light"],
        "torque specifications":         ["torque", "ft-lb", "nm", "lb-ft"],
        "obd codes covered":             [],   # handled via regex below
        "diagnostic steps shown":        ["diagnose", "test", "multimeter", "scan"],
    },
    "finance": {
        "exact dollar amounts":            ["$", "dollars", "invested", "earned", "saved"],
        "cost / fee comparison":           ["fee", "expense ratio", "cost", "free", "minimum"],
        "common mistakes to avoid":        ["mistake", "wrong", "avoid", "don't"],
        "step-by-step action checklist":   ["step", "checklist", "how to start", "action"],
        "real numbers / case study":       ["case study", "real", "example", "results", "portfolio"],
        "tax implications":                ["tax", "irs", "deduction", "write off"],
        "risk / disclaimer framing":       ["risk", "not financial advice", "disclaimer", "guarantee"],
    },
    "technology": {
        "exact tool / version names":      ["version", "v2", "v3", "gpt-4", "claude", "react 18"],
        "cost / pricing comparison":       ["free", "price", "cost", "tier", "per month", "$"],
        "common mistakes to avoid":        ["mistake", "wrong", "avoid", "don't", "gotcha"],
        "code / setup shown":              ["code", "github", "repo", "setup", "install", "terminal"],
        "before and after / benchmark":    ["benchmark", "before", "after", "comparison", "vs"],
        "alternatives listed":             ["alternative", "instead", "other options", "competitor"],
        "step-by-step tutorial":           ["step", "tutorial", "walkthrough", "step by step"],
    },
    "productivity": {
        "exact tool / app names":          ["notion", "obsidian", "todoist", "apple notes", "google calendar"],
        "time / schedule specifics":       ["minutes", "hours", "schedule", "6am", "5am", "time block"],
        "common mistakes to avoid":        ["mistake", "wrong", "avoid", "don't", "pitfall"],
        "real personal example / case":    ["my", "i", "personal", "real", "story", "experience"],
        "measurable outcome / before-after":["results", "before", "after", "changed", "transformed"],
        "system / framework named":        ["system", "framework", "method", "process", "workflow"],
        "step-by-step setup":              ["step", "setup", "how to", "step by step", "guide"],
    },
}

DEFAULT_SPECIFICITY_KEYWORDS = SPECIFICITY_KEYWORDS_BY_NICHE["automotive"]
DEFAULT_GAP_TAXONOMY = GAP_TAXONOMY_BY_NICHE["automotive"]
# Year strings are universally specific — always count them.
_YEAR_PATTERN = re.compile(r"\b(19|20)\d{2}\b")


# ── Brief quality scoring ─────────────────────────────────────────────────────

def score_brief_quality(brief: Dict[str, Any], cluster: Dict[str, Any], niche: str = "automotive") -> Dict[str, Any]:
    scores: Dict[str, float] = {}

    titles = brief.get("titles", {})
    title_text = " ".join(str(v) for v in titles.values() if isinstance(v, str)).lower()
    has_number = bool(re.search(r"\d", title_text))
    # Niche-aware specificity: a concrete entity the viewer would search for.
    # Years are universally specific across all niches.
    specificity_words = SPECIFICITY_KEYWORDS_BY_NICHE.get(niche, DEFAULT_SPECIFICITY_KEYWORDS)
    has_specific = (
        bool(_YEAR_PATTERN.search(title_text))
        or any(w in title_text for w in specificity_words)
    )
    scores["specificity"] = min(2.0, (1.0 if has_number else 0.0) + (1.0 if has_specific else 0.0))

    cluster_view_counts: set = set()
    for v in cluster.get("top_videos", []):
        vc = v.get("view_count")
        if vc:
            cluster_view_counts.add(int(float(vc)))

    brief_text_all = json.dumps(brief).lower()
    view_mentions = re.findall(r"(\d[\d,]+)\s*(?:views|view)", brief_text_all)
    invented_count = 0
    for mention in view_mentions:
        val = int(mention.replace(",", ""))
        grounded = any(abs(val - cv) / max(cv, 1) < 0.25 for cv in cluster_view_counts)
        if not grounded and cluster_view_counts:
            invented_count += 1
    scores["data_grounding"] = max(0.0, 2.0 - invented_count * 0.5)

    hook = str(brief.get("hook_script", ""))
    hook_score = 0.0
    if len(hook) > 40:
        hook_score += 1.0
    description_phrases = ["open with", "start by", "begin with", "say something",
                           "mention", "introduce", "address the viewer", "script:", "hook:"]
    if not any(p in hook.lower() for p in description_phrases):
        hook_score += 1.0
    scores["hook_quality"] = hook_score

    tags = brief.get("tags", [])
    cluster_topic = (cluster.get("topic") or cluster.get("cluster_label", "")).lower().replace("_", " ")
    relevant_tags = sum(
        1 for t in tags
        if isinstance(t, str) and (cluster_topic in t.lower() or t.lower() in cluster_topic)
    )
    scores["tag_relevance"] = min(2.0, relevant_tags * 0.5)

    required_fields = [
        "cluster_signal", "topic_angle", "search_intent", "titles",
        "hook_script", "thumbnail_direction", "key_points",
        "what_to_avoid", "tags", "upload_timing", "performance_forecast",
    ]
    generic_phrases = ["insufficient data", "n/a", "see metrics", "general",
                       "your topic here", "insert", "placeholder"]
    completeness_score = 2.0
    for field in required_fields:
        val = brief.get(field)
        if not val:
            completeness_score -= 0.2
            continue
        val_str = str(val).lower()
        if any(ph in val_str for ph in generic_phrases):
            completeness_score -= 0.1
    scores["completeness"] = max(0.0, completeness_score)

    composite = sum(scores.values())
    return {
        "axis_scores": scores,
        "brief_quality_score": round(composite, 2),
        "quality_label": "HIGH" if composite >= 7 else ("MEDIUM" if composite >= 5 else "LOW"),
    }


def compute_confidence_level(cluster: Dict[str, Any]) -> str:
    video_count  = cluster.get("video_count", 0)
    avg_breakout = float(cluster.get("avg_breakout_prob") or 0.0)
    opportunity  = float((cluster.get("opportunity_metrics") or {}).get("opportunity_score", 0))

    if video_count >= 8 and avg_breakout >= 0.35 and opportunity >= 6.0:
        return "HIGH"
    elif video_count >= 3 and (avg_breakout >= 0.2 or opportunity >= 4.0):
        return "MEDIUM"
    else:
        return "LOW"


# ── Prompt builder ────────────────────────────────────────────────────────────

def build_user_prompt(cluster: Dict[str, Any], creator_profile: dict = None, niche: str = "automotive") -> str:
    opp       = cluster.get("opportunity_metrics") or {}
    opp_score = float(opp.get("opportunity_score") or cluster.get("cluster_score10") or 0)
    avg_vph   = 0.0
    comp_lvl  = "UNKNOWN"

    top_videos = cluster.get("top_videos") or []
    if top_videos:
        avg_vph = sum(float(v.get("views_per_hour") or 0) for v in top_videos) / len(top_videos)

    competition_score = float(opp.get("competition") or 5)
    if   competition_score <= 3: comp_lvl = "HIGH (saturated)"
    elif competition_score <= 5: comp_lvl = "MEDIUM"
    elif competition_score <= 7: comp_lvl = "LOW (room to grow)"
    else:                        comp_lvl = "VERY LOW (wide open)"

    demand_score = float(opp.get("demand") or 5)
    growth_score = float(opp.get("growth") or 5)
    if   growth_score >= 7: window = "URGENT"
    elif demand_score >= 6: window = "EVERGREEN"
    else:                   window = "SEASONAL"

    competitor_block = ""
    for i, v in enumerate(top_videos[:10], 1):
        competitor_block += f"""\nVIDEO {i}:
  Title:          "{v.get('title', 'N/A')}"
  Channel:        {v.get('channel_title', 'N/A')}
  Views:          {int(v.get('view_count', 0) or 0):,}
  VPH:            {float(v.get('views_per_hour', 0) or 0):.1f}
  Score (0-10):   {float(v.get('score10', 0) or 0):.2f}
  Intent:         {v.get('intent_label', 'unknown')}
  Breakout prob:  {float(v.get('breakout_probability') or 0):.0%}
  Trend score 7d: {float(v.get('trend_score_7d') or 0):.1f}
  URL:            {v.get('video_url', 'N/A')}
"""

    month_names = {1:"January",2:"February",3:"March",4:"April",5:"May",6:"June",
                   7:"July",8:"August",9:"September",10:"October",11:"November",12:"December"}
    month_name = month_names.get(datetime.now().month, "Unknown")

    creator_block = "No creator profile provided — generate for general audience."
    if creator_profile:
        subniche_perf = creator_profile.get("subniche_performance", {})
        primary_sub   = creator_profile.get("primary_subniche", "general_maintenance")
        primary_perf  = subniche_perf.get(primary_sub, {})
        tier_info     = creator_profile.get("creator_tier", {})
        tier_label    = tier_info.get("label", "Rising Creator") if isinstance(tier_info, dict) else "Rising Creator"
        tier_strategy = tier_info.get("strategy", "") if isinstance(tier_info, dict) else ""

        creator_block = f"""
  Channel:          {creator_profile.get('channel_name', 'N/A')}
  Subscribers:      {creator_profile.get('subscribers', 0):,}
  CREATOR TIER:     {tier_label.upper()}
  TIER STRATEGY:    {tier_strategy}
  Avg views:        {creator_profile.get('avg_views', 0):,}
  Median views:     {creator_profile.get('median_views', 0):,}
  Best video:       {creator_profile.get('best_views', 0):,} views
  Top 10% avg:      {creator_profile.get('top_10pct_avg', 0):,} views
  Upload frequency: {creator_profile.get('upload_frequency', 'unknown')}
  Best upload day:  {creator_profile.get('best_upload_day', 'INSUFFICIENT DATA')}
  Best day boost:   {creator_profile.get('best_day_multiplier', 1.0):.2f}x vs average
  Primary niche:    {creator_profile.get('primary_label', 'General')}
  Vehicles covered: {', '.join(creator_profile.get('vehicles_covered', [])[:5]) or 'General'}
  Current month:    {month_name} — apply seasonal framing
  NICHE:            {creator_profile.get('niche_display', 'Automotive Repair')}
  NICHE STRATEGY:   {creator_profile.get('tier_strategy', '')}

  OUTPERFORMANCE TARGET: Averages {creator_profile.get('avg_views', 0):,} views/video.
  Every recommendation must increase the probability of BEATING that average.

  SUB-NICHE PERFORMANCE:
  {primary_sub}: avg {primary_perf.get('avg_views', 0):,} views, best {primary_perf.get('best_views', 0):,} views
"""
        if creator_profile.get('reoptimizing_video_title'):
            creator_block += f"""
  RE-OPTIMIZATION TARGET:
  Original Title: "{creator_profile.get('reoptimizing_video_title')}"
  Provide a clear upgrade path from this original.
"""

    gap_block = _extract_competitor_gaps(top_videos, niche=niche)

    return f"""\
Generate ONE production brief from this pipeline data.
Use ONLY the data below. Reference specific video titles and numbers.
Do NOT invent any data not present here.

══════════════════════════════════════════════════════════════
CLUSTER INTELLIGENCE
══════════════════════════════════════════════════════════════

TOPIC CLUSTER:  {cluster.get('cluster_label', cluster.get('topic', 'unknown'))}
Cluster score:  {opp_score:.2f} / 10
Avg VPH:        {avg_vph:.1f} views/hour
Competition:    {comp_lvl}
Window:         {window}
Demand score:   {demand_score:.1f} / 10
Growth score:   {growth_score:.1f} / 10
Video count:    {cluster.get('video_count', 0)}
Channel count:  {cluster.get('channels', 0)}

══════════════════════════════════════════════════════════════
TOP COMPETITOR VIDEOS
══════════════════════════════════════════════════════════════
{competitor_block}

══════════════════════════════════════════════════════════════
WHAT COMPETITORS MISSED (use as content_gap)
══════════════════════════════════════════════════════════════
{gap_block}

══════════════════════════════════════════════════════════════
CREATOR PROFILE
══════════════════════════════════════════════════════════════
{creator_block}

══════════════════════════════════════════════════════════════
INSTRUCTION
══════════════════════════════════════════════════════════════
Generate ONE brief in the specified JSON format.
Every number must exist in the data above.
Every competitor video referenced must be from the list above.
Self-check before outputting.
"""


def _extract_competitor_gaps(top_videos: List[Dict], niche: str = "automotive") -> str:
    # Niche-aware coverage checklist. Previously this was entirely automotive
    # (torque specs, OBD codes, dealer-vs-DIY), so finance/tech/productivity
    # clusters got gap analysis that could never apply to their content.
    taxonomy = GAP_TAXONOMY_BY_NICHE.get(niche, DEFAULT_GAP_TAXONOMY)

    covered: set = set()
    for video in top_videos:
        text = f"{video.get('title','').lower()} {str(video.get('description',''))[:500].lower()}"
        for topic, signals in taxonomy.items():
            if not signals:
                continue
            if topic in covered:
                continue
            if any(sig in text for sig in signals):
                covered.add(topic)

    # Automotive OBD codes need regex detection (no keyword hits them cleanly).
    if niche == "automotive" and "obd codes covered" not in covered:
        for video in top_videos:
            text = f"{video.get('title','')} {str(video.get('description',''))[:500]}".lower()
            if re.search(r"p0\d{3}|c0\d{3}|u0\d{3}", text):
                covered.add("obd codes covered")
                break

    gaps = [t for t in taxonomy.keys() if t not in covered][:6]
    if not gaps:
        return "— No specific gaps detected. Focus on deeper depth than competitors."
    return "\n".join(f"— {gap}" for gap in gaps)


# ── Core Gemini call — FIXED for google.genai (new package) ──────────────────

def _call_gemini(system_prompt: str, user_prompt: str, response_schema: Optional[Dict] = None) -> str:
    """
    Make a single Gemini API call using the new google.genai Client pattern.
    Returns raw response text.

    When `response_schema` is given (a dict Gemini schema), it is passed with
    response_mime_type="application/json" so the model is constrained to emit
    JSON conforming to that exact shape — i.e. structured output.
    """
    if _gemini_client is None:
        raise RuntimeError("Gemini client not initialised. Check your API key.")

    config_kwargs: Dict[str, Any] = dict(
        system_instruction=system_prompt,
        response_mime_type="application/json",
        temperature=TEMPERATURE,
        max_output_tokens=MAX_TOKENS,
    )
    if response_schema is not None:
        config_kwargs["response_schema"] = response_schema

    response = _gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=user_prompt,
        config=genai_types.GenerateContentConfig(**config_kwargs),
    )
    return response.text.strip()


def _parse_and_validate(response_text: str, cluster: Dict) -> Dict:
    """
    Parse JSON response, attempt self-correction if invalid.
    """
    required_keys = {
        "cluster_signal", "topic_angle", "search_intent", "titles",
        "hook_script", "thumbnail_direction", "key_points",
        "what_to_avoid", "tags", "upload_timing", "performance_forecast",
    }

    # First parse attempt
    try:
        brief_json = json.loads(response_text)
    except json.JSONDecodeError as e:
        log.warning("Initial JSON parse failed: %s — attempting self-correction...", e)
        # Ask Gemini to fix its own output. With structured output now enforced on
        # the main call this branch should rarely fire; we still pass the schema so
        # a repaired brief is also forced into contract conformance.
        correction_prompt = (
            f"Fix this invalid JSON. Required keys: {list(required_keys)}\n\n"
            f"BROKEN JSON:\n{response_text}"
        )
        try:
            fixed_text = _call_gemini(
                SELF_CORRECTION_SYSTEM_PROMPT, correction_prompt,
                response_schema=BRIEF_RESPONSE_SCHEMA,
            )
            brief_json = json.loads(fixed_text)
            log.info("Self-correction succeeded.")
        except Exception as e2:
            raise ValueError(f"JSON parse failed after self-correction: {e2}") from e

    # Validate required keys
    missing = required_keys - set(brief_json.keys())
    if missing:
        raise ValueError(f"Missing required keys after validation: {missing}")

    # Validate nested structure
    titles = brief_json.get("titles", {})
    if not isinstance(titles, dict) or "title_1_search_match" not in titles:
        raise ValueError("titles field malformed or missing title_1_search_match")

    tags = brief_json.get("tags", [])
    if tags == "INSUFFICIENT DATA":
        brief_json["tags"] = []
        tags = []

    if not isinstance(tags, list):
        raise ValueError(f"tags must be a list, got: {tags}")

    if len(tags) < 3:
        log.warning(f"tags list has fewer than 3 items ({len(tags)}), but allowing it.")

    key_points = brief_json.get("key_points", [])
    if key_points == "INSUFFICIENT DATA":
        brief_json["key_points"] = []
        key_points = []

    if not isinstance(key_points, list):
        raise ValueError(f"key_points must be a list, got: {key_points}")

    if len(key_points) < 2:
        log.warning(f"key_points must have at least 2 items, but got {len(key_points)}. Allowing it.")

    return brief_json


def generate_brief_with_genai(
    cluster: Dict[str, Any],
    creator_profile: Optional[Dict[str, Any]] = None,
    niche: str = "automotive",
) -> Dict[str, Any]:
    """
    Generate a brief using the Gemini API.
    Uses the new google.genai Client pattern.
    """
    # Build niche-aware system prompt
    niche_addon = ""
    if _NICHE_CONFIG_AVAILABLE:
        if creator_profile:
            profile_niche = creator_profile.get("niche", niche)
            if profile_niche and profile_niche != "auto":
                niche = profile_niche
        niche_addon = get_niche_config(niche).get("system_prompt_addon", "")

    system_prompt = BRIEF_SYSTEM_PROMPT + ("\n\n" + niche_addon if niche_addon else "")
    user_prompt   = build_user_prompt(cluster, creator_profile, niche=niche)

    # Rate limiting check
    if _RATE_LIMITER_AVAILABLE:
        get_rate_limiter().check_budget()

    # API call — structured output via response_schema so the model is forced
    # to emit JSON that both parses AND conforms to the documented contract.
    response_text = _call_gemini(system_prompt, user_prompt, response_schema=BRIEF_RESPONSE_SCHEMA)

    # Track usage (best-effort)
    if _RATE_LIMITER_AVAILABLE:
        try:
            get_rate_limiter().record_usage(
                input_tokens=len(system_prompt + user_prompt) // 4,   # rough estimate
                output_tokens=len(response_text) // 4,
                model=GEMINI_MODEL,
                cluster_label=cluster.get("cluster_label", "unknown"),
            )
        except Exception as e:
            log.debug("Could not record usage: %s", e)

    # Parse and validate
    brief_json = _parse_and_validate(response_text, cluster)

    log.info("✅ Gemini brief generated successfully")
    quality = score_brief_quality(brief_json, cluster, niche=niche)
    log.info(
        "  Quality: %.1f/10 (%s) | axes: %s",
        quality["brief_quality_score"],
        quality["quality_label"],
        {k: round(v, 1) for k, v in quality["axis_scores"].items()},
    )
    return {"brief": brief_json, "source": "gemini", "success": True, "quality": quality}


def generate_rule_based_brief(
    cluster: Dict[str, Any],
    creator_profile: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Fallback brief when Gemini is unavailable."""
    top_videos    = cluster.get("top_videos", [])
    opp           = cluster.get("opportunity_metrics", {})
    cluster_label = cluster.get("cluster_label", cluster.get("topic", "unknown"))
    top_title     = top_videos[0].get("title", "N/A") if top_videos else "N/A"
    top_channel   = top_videos[0].get("channel_title", "N/A") if top_videos else "N/A"
    avg_views     = creator_profile.get("avg_views", 0) if creator_profile else 0
    topic_clean   = cluster_label.replace("_", " ").title()

    return {
        "cluster_signal": {
            "topic_cluster": cluster_label,
            "cluster_score": float(opp.get("opportunity_score", 0)),
            "avg_vph": "See competitor data",
            "competition": "See metrics",
            "window": "EVERGREEN",
        },
        "topic_angle": f"Cover {topic_clean} with deeper technical detail than: '{top_title}'",
        "search_intent": {
            "intent_type": cluster.get("top_intent", "fix_now"),
            "viewer_state": "Looking for a solution to their specific problem",
        },
        "titles": {
            "title_1_search_match": f"How to Fix {topic_clean} — Complete Guide",
            "title_2_curiosity":    f"Why Most {topic_clean} Videos Get This Wrong",
            "title_3_value":        f"{topic_clean} — DIY vs Dealer Cost Breakdown",
            "recommended_title":    "title_1_search_match",
            "reason":               "Rule-based fallback. Search match titles have highest floor for channels under 100K subs.",
        },
        "hook_script": (
            f"If you're dealing with a {topic_clean.lower()} issue right now, "
            f"this video will save you time and money. I'm going to show you the exact steps the pros use, "
            f"and why most people get this wrong."
        ),
        "thumbnail_direction": {
            "primary_image": "Close-up of the part or problem with clear before/after contrast",
            "text_overlay":  "2-3 words — the symptom or cost savings",
            "color_signal":  "Red for urgency, green for savings",
            "reference":     f"Reference: '{top_title}' by {top_channel}",
        },
        "key_points": [
            {"point": "Start with symptoms the viewer is experiencing",
             "why": "Validates they are in the right video within 30 seconds"},
            {"point": "Show the diagnostic process step-by-step",
             "why": "Builds trust and watch time before the fix"},
            {"point": "Include part numbers and costs",
             "why": "Gap found in competitor analysis — viewers search for this"},
            {"point": "Common mistakes section",
             "why": "Increases retention and share rate"},
        ],
        "what_to_avoid": [
            {"avoid": "Generic intro longer than 15 seconds",
             "why": "Destroys retention on fix-now intent videos"},
            {"avoid": "Skipping diagnosis to jump to replacement",
             "why": "Viewers need validation they have the right problem"},
        ],
        "tags": [
            topic_clean.lower(),
            f"{topic_clean.lower()} repair",
            f"how to fix {topic_clean.lower()}",
            f"{topic_clean.lower()} diy",
            f"{topic_clean.lower()} symptoms",
            f"{topic_clean.lower()} cost",
        ],
        "upload_timing": {
            "upload_by": "Within 7 days",
            "day":       creator_profile.get("best_upload_day", "INSUFFICIENT DATA") if creator_profile else "INSUFFICIENT DATA",
            "time":      "6-8 AM local time for search-intent content",
            "reasoning": "Rule-based default — check your own analytics for your audience peak.",
        },
        "performance_forecast": {
            "channel_baseline":     f"{avg_views:,} views" if avg_views else "INSUFFICIENT DATA",
            "expected_performance": "1.2-1.8x channel average (rule-based estimate)",
            "confidence_level":     "LOW",
            "reasoning":            "Rule-based fallback. Ensure Gemini API key is configured for AI-optimised briefs.",
        },
    }


def _format_brief_to_text(brief: Dict[str, Any], cluster_label: str) -> str:
    cs = brief.get("cluster_signal", {})
    si = brief.get("search_intent", {})
    t  = brief.get("titles", {})
    td = brief.get("thumbnail_direction", {})
    ut = brief.get("upload_timing", {})
    pf = brief.get("performance_forecast", {})

    key_points_str = "\n".join(
        f"{i}. {kp.get('point','N/A')}\n   WHY IT MATTERS: {kp.get('why','N/A')}" if isinstance(kp, dict) else f"{i}. {kp}"
        for i, kp in enumerate(brief.get("key_points", []), 1)
    )
    avoid_str = "\n".join(
        f"× AVOID: {wa.get('avoid','N/A')} — {wa.get('why','N/A')}" if isinstance(wa, dict) else f"× AVOID: {wa}"
        for wa in brief.get("what_to_avoid", [])
    )
    tags_str = ", ".join(brief.get("tags", []))

    return f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRIEF — {cs.get('topic_cluster', cluster_label).upper()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CLUSTER SIGNAL:
Topic cluster:  {cs.get('topic_cluster','N/A')}
Cluster score:  {cs.get('cluster_score','N/A')}
Avg VPH:        {cs.get('avg_vph','N/A')}
Competition:    {cs.get('competition','N/A')}
Window:         {cs.get('window','N/A')}

─────────────────────────────────────────────────────────────
TOPIC ANGLE
─────────────────────────────────────────────────────────────
{brief.get('topic_angle','N/A')}

─────────────────────────────────────────────────────────────
SEARCH INTENT
─────────────────────────────────────────────────────────────
Intent type:  {si.get('intent_type','N/A')}
Viewer state: {si.get('viewer_state','N/A')}

─────────────────────────────────────────────────────────────
TITLES
─────────────────────────────────────────────────────────────
TITLE 1 — [SEARCH MATCH]:
{t.get('title_1_search_match','N/A')}

TITLE 2 — [CURIOSITY HOOK]:
{t.get('title_2_curiosity','N/A')}

TITLE 3 — [COST/VALUE]:
{t.get('title_3_value','N/A')}

USE: {t.get('recommended_title','N/A')}
REASON: {t.get('reason','N/A')}

─────────────────────────────────────────────────────────────
HOOK SCRIPT (First 15-20 seconds — exact words)
─────────────────────────────────────────────────────────────
"{brief.get('hook_script','N/A')}"

─────────────────────────────────────────────────────────────
THUMBNAIL DIRECTION
─────────────────────────────────────────────────────────────
Primary image:  {td.get('primary_image','N/A')}
Text overlay:   {td.get('text_overlay','N/A')}
Color signal:   {td.get('color_signal','N/A')}
Reference:      {td.get('reference','N/A')}

─────────────────────────────────────────────────────────────
KEY POINTS
─────────────────────────────────────────────────────────────
{key_points_str}

─────────────────────────────────────────────────────────────
WHAT TO AVOID
─────────────────────────────────────────────────────────────
{avoid_str}

─────────────────────────────────────────────────────────────
TAGS
─────────────────────────────────────────────────────────────
{tags_str}

─────────────────────────────────────────────────────────────
UPLOAD TIMING
─────────────────────────────────────────────────────────────
Upload by:  {ut.get('upload_by','N/A')}
Day:        {ut.get('day','N/A')}
Time:       {ut.get('time','N/A')}
Reasoning:  {ut.get('reasoning','N/A')}

─────────────────────────────────────────────────────────────
PERFORMANCE FORECAST
─────────────────────────────────────────────────────────────
Channel baseline:     {pf.get('channel_baseline','N/A')}
Expected performance: {pf.get('expected_performance','N/A')}
Confidence level:     {pf.get('confidence_level','N/A')}
Reasoning:            {pf.get('reasoning','N/A')}
"""


# ── BriefGenerator class ──────────────────────────────────────────────────────

class BriefGenerator:
    """
    Generates production briefs connecting cluster intelligence to Gemini API.

    Usage:
        gen     = BriefGenerator()
        results = gen.generate_for_creator(channel_id="UCxxxxxx", count=5)
        gen.save_briefs(results)
    """

    def __init__(self):
        if not _gemini_client:
            raise RuntimeError(
                "BriefGenerator cannot initialise: Gemini client not configured.\n"
                "Ensure GOOGLE_API_KEY or GOOGLE_GEMINI_KEY is set in your .env file."
            )

    def generate_single(
        self,
        cluster: Dict[str, Any],
        creator_profile: Optional[Dict[str, Any]] = None,
        attempt: int = 1,
    ) -> Dict[str, Any]:
        brief_id      = str(uuid.uuid4())[:8]
        cluster_label = cluster.get("cluster_label", cluster.get("topic", "unknown"))
        niche         = (creator_profile or {}).get("niche", "automotive")

        log.info("Generating brief [%s] for cluster: '%s'", brief_id, cluster_label)
        start = time.time()

        try:
            result = generate_brief_with_genai(
                cluster=cluster,
                creator_profile=creator_profile,
                niche=niche,
            )
        except BudgetExceededError:
            log.error("Daily budget exceeded — stopping brief generation.")
            return {"brief_id": brief_id, "cluster_label": cluster_label,
                    "status": "budget_exceeded", "error": "Daily API budget exceeded"}
        except Exception as e:
            log.error("Brief generation failed for '%s': %s", cluster_label, e)
            return {"brief_id": brief_id, "cluster_label": cluster_label,
                    "status": "error", "error": str(e)}

        # Auto-retry if quality is below threshold
        quality       = result.get("quality", {})
        quality_score = quality.get("brief_quality_score", 10)
        if (result["success"] and result.get("source") == "gemini"
                and quality_score < BRIEF_QUALITY_THRESHOLD and attempt < MAX_RETRIES):
            log.warning(
                "Quality %.1f/10 below threshold %d — retrying (attempt %d/%d)...",
                quality_score, BRIEF_QUALITY_THRESHOLD, attempt + 1, MAX_RETRIES
            )
            return self.generate_single(cluster, creator_profile, attempt=attempt + 1)

        if not result["success"]:
            return {"brief_id": brief_id, "cluster_label": cluster_label,
                    "status": "error", "error": result.get("error", "Unknown error")}

        brief    = result["brief"]
        elapsed  = round(time.time() - start, 2)
        opp      = cluster.get("opportunity_metrics", {})
        quality  = result.get("quality", {})

        return {
            "brief_id":            brief_id,
            "cluster_label":       cluster_label,
            "cluster_topic":       cluster.get("topic"),
            "niche":               niche,
            "cluster_score":       cluster.get("cluster_score10", 0),
            "opportunity_score":   float(opp.get("opportunity_score", 0)),
            "demand_score":        float(opp.get("demand", 0)),
            "competition":         float(opp.get("competition", 5)),
            "creator_channel":     (creator_profile or {}).get("channel_name"),
            "status":              "success",
            "brief_text":          _format_brief_to_text(brief, cluster_label),
            "brief_json":          brief,
            "elapsed_seconds":     elapsed,
            "generated_at":        datetime.now(timezone.utc).isoformat(),
            "model":               GEMINI_MODEL,
            "source":              result["source"],
            "brief_quality_score": quality.get("brief_quality_score"),
            "brief_quality_label": quality.get("quality_label"),
            "quality_axis_scores": quality.get("axis_scores"),
            "confidence_level":    compute_confidence_level(cluster),
        }

    def generate_batch(
        self,
        clusters: List[Dict[str, Any]],
        creator_profile: Optional[Dict[str, Any]] = None,
        count: int = BRIEFS_PER_BATCH,
    ) -> List[Dict[str, Any]]:
        sorted_clusters = sorted(
            clusters,
            key=lambda c: float(
                (c.get("opportunity_metrics") or {}).get("opportunity_score", 0)
                or c.get("cluster_score10", 0)
            ),
            reverse=True,
        )[:count]

        results = []
        for i, cluster in enumerate(sorted_clusters, 1):
            log.info("Generating brief %d/%d: '%s'", i, len(sorted_clusters),
                     cluster.get("cluster_label", "unknown"))
            result = self.generate_single(cluster, creator_profile)
            results.append(result)
            if result.get("status") == "budget_exceeded":
                log.warning("Budget exceeded — stopping batch early.")
                break
            if i < len(sorted_clusters):
                time.sleep(4)

        valid = sum(1 for r in results if r.get("status") == "success")
        log.info("Batch complete: %d/%d briefs generated.", valid, len(results))
        return results

    def generate_for_creator(
        self,
        channel_id: Optional[str] = None,
        creator_profile: Optional[Dict[str, Any]] = None,
        count: int = BRIEFS_PER_BATCH,
        cluster_file: Optional[str] = None,
        niche: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        # Resolve niche: explicit arg > creator_profile > channel_id detection > default
        profile_niche = (creator_profile or {}).get("niche")
        niche_key    = resolve_niche(profile_niche or niche or "automotive", channel_id)
        cluster_path = get_paths(niche_key).clusters
        if cluster_file:
            cluster_path = ROOT / cluster_file

        if not cluster_path.exists():
            raise FileNotFoundError(
                f"Cluster file not found: {cluster_path}\n"
                "Run: python run_pipeline.py --from cluster"
            )

        with cluster_path.open("r", encoding="utf-8") as f:
            cluster_data = json.load(f)

        clusters = cluster_data.get("all_clusters_ranked", cluster_data.get("clusters", []))
        if not clusters:
            raise ValueError("No clusters found. Re-run cluster_research.py.")

        log.info("Loaded %d clusters from %s", len(clusters), cluster_path.name)

        if creator_profile is None and channel_id:
            from channel_auditor import ChannelAuditor
            log.info("Running channel audit for %s...", channel_id)
            creator_profile = ChannelAuditor().run_audit(channel_id)

        if creator_profile:
            from brief_personalizer import get_personalized_opportunities
            log.info("Personalising clusters for '%s'...", creator_profile.get("channel_name"))
            personalized = get_personalized_opportunities(
                creator_profile=creator_profile,
                cluster_intelligence={"all_clusters_ranked": clusters},
                batch_size=count,
            )
            log.info("Selected %d personalised clusters.", len(personalized))
            return self.generate_batch(personalized, creator_profile, count=len(personalized))

        results = self.generate_batch(clusters, creator_profile, count=count)
        if _RATE_LIMITER_AVAILABLE:
            get_rate_limiter().log_daily_summary()
        return results

    def save_briefs(
        self,
        briefs: List[Dict[str, Any]],
        output_path: Optional[str] = None,
    ) -> Path:
        output_dir = ROOT / "output"
        output_dir.mkdir(exist_ok=True)

        if output_path is None:
            ts          = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            output_path = f"briefs_{ts}.json"

        path = output_dir / output_path
        with path.open("w", encoding="utf-8") as f:
            json.dump({
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "brief_count":  len(briefs),
                "valid_count":  sum(1 for b in briefs if b.get("status") == "success"),
                "briefs":       briefs,
            }, f, indent=2, ensure_ascii=False)

        # SQLite
        try:
            import sqlite3
            conn   = sqlite3.connect(ROOT / "youtube_automotive.db")
            cursor = conn.cursor()
            for b in briefs:
                if b.get("status") == "success":
                    bj = b.get("brief_json", {})
                    cursor.execute("""
                        INSERT OR REPLACE INTO briefs (
                            brief_id, channel_id, cluster_id, generated_at,
                            title_recommended, thumbnail_style_recommended, was_used
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        b.get("brief_id"),
                        b.get("creator_channel", "general"),
                        bj.get("cluster_signal", {}).get("topic_cluster", b.get("cluster_topic", "unknown")),
                        b.get("generated_at"),
                        bj.get("titles", {}).get("recommended_title", "N/A"),
                        bj.get("thumbnail_direction", {}).get("primary_image", "N/A"),
                        0,
                    ))
            conn.commit()
            conn.close()
            log.info("Saved %d briefs to SQLite", len(briefs))
        except Exception as e:
            log.error("SQLite save failed (non-fatal): %s", e)

        # Supabase
        if _SUPABASE_AVAILABLE:
            saved = 0
            for b in briefs:
                if b.get("status") == "success" and b.get("brief_json"):
                    try:
                        _supabase_save_brief(b)
                        saved += 1
                    except Exception as e:
                        log.error("Supabase save failed (non-fatal): %s", e)
            log.info("Saved %d/%d briefs to Supabase", saved, len(briefs))

        log.info("Saved %d briefs → %s", len(briefs), path.name)
        return path

    def print_brief(self, brief_result: Dict[str, Any]) -> None:
        sep = "=" * 64
        status = brief_result.get('status', 'unknown')
        label  = brief_result.get('cluster_label', 'unknown').upper()
        print(f"\n{sep}")
        print(f"  BRIEF: {label}")
        print(f"  Score: {brief_result.get('cluster_score', 0):.2f}/10"
              f"  |  Opp: {brief_result.get('opportunity_score', 0):.1f}/10"
              f"  |  Status: {status}")
        print(sep)
        if status != 'success':
            print(f"  [Brief not generated — {brief_result.get('error', 'unknown error')}]")
        else:
            print(brief_result.get("brief_text", "[No brief text found]"))
            print(f"\n  Time: {brief_result.get('elapsed_seconds', 0)}s"
                  f"  |  Model: {brief_result.get('model', GEMINI_MODEL)}"
                  f"  |  Quality: {brief_result.get('brief_quality_score', '?')}/10")
        print(sep + "\n")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    import argparse
    import sys
    # Force UTF-8 output on Windows to avoid cp1252 UnicodeEncodeError
    # when printing box-drawing or emoji characters to the console.
    if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        except AttributeError:
            pass  # Python < 3.7 fallback — ignore

    parser = argparse.ArgumentParser(description="Generate content briefs via Gemini")
    parser.add_argument("--channel",      type=str,  default=None)
    parser.add_argument("--count",        type=int,  default=5)
    parser.add_argument("--save",         action="store_true")
    parser.add_argument("--cluster-file", type=str,  default=None)
    parser.add_argument("--niche",        type=str,  default="automotive",
                        help="Niche to generate briefs for (automotive, finance, technology, productivity)")
    args = parser.parse_args()

    gen     = BriefGenerator()
    results = gen.generate_for_creator(
        channel_id=args.channel,
        count=args.count,
        cluster_file=args.cluster_file,
        niche=args.niche,
        
    )

    for result in results:
        gen.print_brief(result)

    if args.save:
        path = gen.save_briefs(results)
        print(f"\n  Saved to: {path}")

    valid = sum(1 for r in results if r.get("status") == "success")
    print(f"\n  Summary: {valid}/{len(results)} briefs generated successfully.")


if __name__ == "__main__":
    main()