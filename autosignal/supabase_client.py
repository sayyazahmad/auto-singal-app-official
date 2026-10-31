"""
supabase_client.py
==================
Server-side Supabase bridge for the AutoSignal pipeline.
Uses the SERVICE ROLE key — bypasses RLS, never expose this client to the browser.

Loaded by:
  feedback_loop.py       — saves brief performance verdicts
  brief_generator.py     — saves generated briefs
  channel_auditor.py     — upserts creator profiles
  opportunity_scorer.py  — writes scored opportunities
  run_pipeline.py        — writes pipeline_run rows

Key loading priority:
  1. SUPABASE_SERVICE_ROLE_KEY env var
  2. SUPABASE_URL env var  (for URL)
  3. .env file in project root
  4. Raises clearly — never silently skips
"""

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent

_client = None

def _get_client():
    """Lazy-load the Supabase Python client. Raises on first use if creds missing."""
    global _client
    if _client is not None:
        return _client

    # Load .env file from the project root to make this module self-contained.
    # This is more robust than relying on the calling script to load it.
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass  # python-dotenv not installed, rely on environment variables

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    # --- Development Fallback (Not for production) ---
    # If environment variables are not found, use these hardcoded values.
    # WARNING: Never commit service role keys to Git. Use .env or environment variables.
    if not url:
        log.warning("SUPABASE_URL not found in environment, using hardcoded fallback.")
        url = "https://mnglppciyllpcybbqmce.supabase.co"
    if not key:
        log.warning("SUPABASE_SERVICE_ROLE_KEY not found, using hardcoded fallback. DO NOT COMMIT THIS.")
        key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZ2xwcGNpeWxscGN5YmJxbWNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTYyMDk4NSwiZXhwIjoyMDk3MTk2OTg1fQ.fTzN52zMtaSkvufgDHqz4Qvv4Y31VR6kfS_CBcd9IHQ"

    if not url or not key:
        raise EnvironmentError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment or .env\n"
            "  Never put the service role key in api_keys.txt or commit it to git."
        )

    try:
        from supabase import create_client
    except ImportError:
        raise ImportError(
            "supabase-py not installed. Run: pip install supabase"
        )

    _client = create_client(url, key)
    log.info("Supabase service client initialised → %s", url)
    return _client


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_execute(description: str, fn):
    """Run a Supabase operation, log on failure, never crash the pipeline."""
    try:
        result = fn()
        return result
    except Exception as exc:
        log.error("Supabase write failed (%s): %s", description, exc)
        return None


# ── pipeline_runs ─────────────────────────────────────────────────────────────

def start_pipeline_run(run_type: str, niche_slug: Optional[str] = None) -> Optional[str]:
    """
    Insert a pipeline_run row with status='running'.
    Returns the run UUID to pass to finish_pipeline_run() later.
    """
    db = _get_client()

    # Resolve niche_id from slug
    niche_id = None
    if niche_slug:
        resp = _safe_execute(
            f"resolve niche_id for {niche_slug}",
            lambda: db.table("niches").select("id").eq("slug", niche_slug).maybe_single().execute()
        )
        if resp and resp.data:
            niche_id = resp.data.get("id")

    row = {"run_type": run_type, "status": "running"}
    if niche_id:
        row["niche_id"] = niche_id

    resp = _safe_execute(
        "insert pipeline_run",
        lambda: db.table("pipeline_runs").insert(row).execute()
    )
    if resp and resp.data:
        run_id = resp.data[0].get("id")
        log.info("Pipeline run started: %s (%s)", run_id, run_type)
        return run_id
    return None


def finish_pipeline_run(
    run_id: str,
    status: str = "success",
    stats: Optional[Dict] = None,
    error_message: Optional[str] = None,
) -> None:
    """Update a pipeline_run row to success/failed/partial with stats."""
    if not run_id:
        return
    db = _get_client()
    from datetime import datetime, timezone
    update = {
        "status": status,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    if stats:
        update["stats"] = stats
    if error_message:
        update["error_message"] = error_message[:2000]  # DB column limit

    _safe_execute(
        "finish pipeline_run",
        lambda: db.table("pipeline_runs").update(update).eq("id", run_id).execute()
    )


# ── api_key_usage ─────────────────────────────────────────────────────────────

def log_api_key_usage(key_label: str, service: str) -> None:
    """
    Increment the request counter for a key label.
    key_label must be a human label like 'youtube_key_1' — never the actual key.
    """
    db = _get_client()
    _safe_execute(
        f"log api_key_usage {key_label}",
        lambda: db.rpc("increment_api_key_usage", {
            "p_key_label": key_label,
            "p_service": service,
        }).execute()
    )


# ── videos ────────────────────────────────────────────────────────────────────

def upsert_videos(videos: List[Dict[str, Any]], niche_slug: str = "automotive") -> int:
    """
    Upsert a list of parsed video dicts into the unified `videos` table.
    Resolves niche_id from slug. Skips videos missing video_id.
    Returns the count of rows upserted.
    """
    db = _get_client()

    niche_resp = _safe_execute(
        f"resolve niche for {niche_slug}",
        lambda: db.table("niches").select("id").eq("slug", niche_slug).maybe_single().execute()
    )
    if not niche_resp or not niche_resp.data:
        log.error("Cannot upsert videos: niche '%s' not found in DB", niche_slug)
        return 0

    niche_id = niche_resp.data["id"]
    rows = []

    for v in videos:
        vid = v.get("video_id")
        if not vid:
            continue

        # Map pipeline fields → DB schema
        row = {
            "video_id":           vid,
            "niche_id":           niche_id,
            "title":              v.get("title"),
            "channel_id":         v.get("channel_id"),
            "channel_title":      v.get("channel_title"),
            "view_count":         int(v.get("view_count") or 0),
            "views_per_hour":     float(v.get("views_per_hour") or 0),
            "engagement_score":   float(v.get("engagement_score") or 0),
            "breakout_probability": float(v.get("breakout_probability") or 0),
            "intent_label":       v.get("intent_label"),
            "trend_score_7d":     float(v.get("trend_score_7d") or 0),
            "cluster_label":      v.get("topic_primary") or v.get("cluster_label"),
            "duration_seconds":   int(v.get("duration_seconds") or 0) or None,
            "like_count":         int(v.get("like_count") or 0) or None,
            "comment_count":      int(v.get("comment_count") or 0) or None,
            "tags":               v.get("tags") or [],
            "embedding":          v.get("semantic_embedding"),
            "raw_metadata":       {
                "analysis_score_10":   v.get("analysis_score_10"),
                "repair_similarity":   v.get("repair_similarity"),
                "topic_confidence":    v.get("topic_confidence"),
                "discovery_sources":   v.get("discovery_sources", []),
            },
        }
        # Remove None embedding (can't upsert None into vector col)
        if not row["embedding"]:
            del row["embedding"]

        rows.append(row)

    if not rows:
        return 0

    # Batch in chunks of 500 to avoid request size limits
    total = 0
    for i in range(0, len(rows), 500):
        chunk = rows[i:i+500]
        resp = _safe_execute(
            f"upsert videos chunk {i//500}",
            lambda c=chunk: db.table("videos").upsert(c, on_conflict="video_id").execute()
        )
        if resp and resp.data:
            total += len(resp.data)

    log.info("Upserted %d/%d videos to Supabase (niche: %s)", total, len(rows), niche_slug)
    return total


# ── clusters + opportunities ──────────────────────────────────────────────────

def upsert_cluster(cluster: Dict[str, Any], niche_slug: str, run_id: Optional[str] = None) -> Optional[str]:
    """
    Upsert a cluster row. Returns the cluster UUID.
    """
    db = _get_client()

    niche_resp = _safe_execute(
        "resolve niche for cluster",
        lambda: db.table("niches").select("id").eq("slug", niche_slug).maybe_single().execute()
    )
    if not niche_resp or not niche_resp.data:
        return None
    niche_id = niche_resp.data["id"]

    row = {
        "niche_id":      niche_id,
        "cluster_key":   str(cluster.get("cluster_id") or cluster.get("topic", "unknown")),
        "topic_summary": cluster.get("cluster_label"),
        "video_count":   cluster.get("video_count", 0),
    }
    if run_id:
        row["run_id"] = run_id

    resp = _safe_execute(
        "upsert cluster",
        lambda: db.table("clusters")
            .upsert(row, on_conflict="niche_id,cluster_key")
            .execute()
    )
    if resp and resp.data:
        return resp.data[0].get("id")
    return None


def upsert_opportunity(
    opportunity: Dict[str, Any],
    cluster_id: str,
    niche_slug: str,
) -> Optional[str]:
    """
    Upsert one scored opportunity. Returns the opportunity UUID.
    """
    db = _get_client()

    niche_resp = _safe_execute(
        "resolve niche for opportunity",
        lambda: db.table("niches").select("id").eq("slug", niche_slug).maybe_single().execute()
    )
    if not niche_resp or not niche_resp.data:
        return None
    niche_id = niche_resp.data["id"]

    row = {
        "cluster_id":       cluster_id,
        "niche_id":         niche_id,
        "demand_score":     opportunity.get("demand"),
        "growth_score":     opportunity.get("trending_score"),
        "competition_score": opportunity.get("search_gap_score"),
        "creator_fit_score": opportunity.get("opportunity_metrics", {}).get("creator_fit"),
        "trend_velocity":   opportunity.get("trending_score"),
        "seasonal_signal":  {
            "seasonal_score": opportunity.get("seasonal_score"),
            "is_boosted":     opportunity.get("seasonal_boost", False),
            "window":         opportunity.get("window"),
        },
        "composite_score":  opportunity.get("final_score"),
    }

    resp = _safe_execute(
        "upsert opportunity",
        lambda: db.table("opportunities").upsert(row).execute()
    )
    if resp and resp.data:
        return resp.data[0].get("id")
    return None


# ── creator_profiles ──────────────────────────────────────────────────────────

def upsert_creator_profile(profile: Dict[str, Any], user_id: Optional[str] = None) -> bool:
    """
    Upsert a creator profile from channel_auditor.run_audit() output.
    user_id is optional — set when the creator has a Supabase Auth account.
    """
    db = _get_client()

    niche_slug = profile.get("niche", "automotive")
    niche_resp = _safe_execute(
        "resolve niche for creator",
        lambda: db.table("niches").select("id").eq("slug", niche_slug).maybe_single().execute()
    )
    niche_id = niche_resp.data.get("id") if niche_resp and niche_resp.data else None

    tier_info = profile.get("creator_tier", {})
    tier_label = tier_info.get("tier_key", "rising") if isinstance(tier_info, dict) else "rising"

    row = {
        "channel_id":       profile["channel_id"],
        "channel_name":     profile.get("channel_name"),
        "subscriber_count": profile.get("subscribers", 0),
        "creator_tier":     tier_label,
        "avg_views":        profile.get("avg_views", 0),
        "primary_subniche": profile.get("primary_subniche"),
        "profile_json":     profile,
        "detected_niche":   niche_slug,
        "niche_confidence": float(profile.get("niche_confidence", 1.0)),
        "niche_confirmed":  False,
    }
    if niche_id:
        row["niche_id"] = niche_id
    if user_id:
        row["user_id"] = user_id

    from datetime import datetime, timezone
    row["last_audited_at"] = datetime.now(timezone.utc).isoformat()

    resp = _safe_execute(
        f"upsert creator_profile {profile['channel_id']}",
        lambda: db.table("creator_profiles")
            .upsert(row, on_conflict="channel_id")
            .execute()
    )
    success = bool(resp and resp.data)
    if success:
        log.info("Upserted creator profile: %s", profile.get("channel_name"))
    return success


# ── briefs ────────────────────────────────────────────────────────────────────

def save_brief(brief_result: Dict[str, Any]) -> Optional[str]:
    """
    Save a generated brief to Supabase, extracting seo_tags and upload_timing
    into their own columns alongside the full brief_json.
    Returns the Supabase UUID of the inserted row.
    """
    db = _get_client()
    from datetime import datetime, timezone

    brief_json = brief_result.get("brief_json", {})

    # Extract seo_tags from brief_json.tags
    seo_tags = brief_json.get("tags", [])
    if isinstance(seo_tags, list):
        seo_tags = [str(t) for t in seo_tags if t]
    else:
        seo_tags = []

    # Extract upload_timing as JSON object
    upload_timing = brief_json.get("upload_timing")

    # Determine recommended title
    titles = brief_json.get("titles", {})
    recommended_key = titles.get("recommended_title", "title_1_search_match")
    recommended_title = titles.get(recommended_key) or next(iter(titles.values()), None)

    # "niche" is the correct slug (automotive/finance/technology/productivity).
    # "cluster_topic" (e.g. "engine", "diesel") is a SUB-topic within a niche —
    # never use it as the niche value, it won't match any row in public.niches.
    niche_slug = brief_result.get("niche") or "automotive"

    row = {
        "channel_id":        brief_result.get("creator_channel"),
        "cluster_label":     brief_result.get("cluster_label"),
        "opportunity_score": float(brief_result.get("opportunity_score") or 0),
        "brief_json":        brief_json,
        "niche":             niche_slug,
        "brief_type":        "new_content",
        "status":            "draft",
        "seo_tags":          seo_tags if seo_tags else None,
        "upload_timing":     upload_timing,
        "model_used":        brief_result.get("model"),
        "temperature":       0.2,
        "generated_at":      brief_result.get("generated_at", datetime.now(timezone.utc).isoformat()),
    }

    # Remove None values to avoid type errors on non-nullable columns
    row = {k: v for k, v in row.items() if v is not None}

    resp = _safe_execute(
        "insert brief",
        lambda: db.table("briefs").insert(row).execute()
    )
    if resp and resp.data:
        supabase_id = resp.data[0].get("id")
        log.info("Saved brief to Supabase: %s (cluster: %s)", supabase_id, brief_result.get("cluster_label"))
        return supabase_id
    return None


# ── brief_performance ─────────────────────────────────────────────────────────

def save_brief_performance(perf: Dict[str, Any]) -> bool:
    """
    Save a 48h performance evaluation to Supabase.
    Called by feedback_loop.evaluate_48h_performance().

    Expected keys: brief_id, channel_id, video_id, views_48h,
                   creator_avg_views, performance_ratio, verdict
    """
    db = _get_client()

    # Resolve the Supabase brief UUID from the local brief_id (UUID string)
    brief_uuid = perf.get("brief_id")

    row = {
        "channel_id":        perf.get("channel_id"),
        "video_id":          perf.get("video_id"),
        "views_48h":         int(perf.get("views_48h") or 0),
        "creator_avg_views": int(perf.get("creator_avg_views") or 0),
        "performance_ratio": float(perf.get("performance_ratio") or 0),
        "verdict":           perf.get("verdict"),
    }

    if brief_uuid:
        row["brief_id"] = brief_uuid

    resp = _safe_execute(
        "insert brief_performance",
        lambda: db.table("brief_performance").insert(row).execute()
    )
    success = bool(resp and resp.data)
    if success:
        log.info(
            "Saved brief performance: %s — %s (%.2fx avg)",
            perf.get("brief_id", "?"), perf.get("verdict"), perf.get("performance_ratio", 0)
        )
    return success