"""
process_brief_requests.py
=========================
THE MISSING LINK between the web app and the brief generator.

When a user clicks "Generate Brief" in app.html/app.js, the frontend inserts
a row into Supabase `briefs` with status='draft' and brief_json=NULL, then
polls every 4s for it to be filled in.

Nothing in this repo was watching for those rows — this script is that
missing piece. It:

  1. Polls Supabase for pending draft briefs (status='draft', brief_json IS NULL)
  2. Loads cluster intelligence for the brief's niche (disk JSON first, Supabase fallback)
  3. Loads/builds the creator's profile from Supabase (or runs a fresh audit)
  4. Runs BriefGenerator.generate_single() — the real Gemini call, temp=0.2
  5. Writes the completed brief back into the SAME row (UPDATE, not INSERT —
     the row already exists from the frontend's insert)
  6. The frontend's poll picks it up on its next 4s cycle

Run modes:
  python process_brief_requests.py            # process once, exit
  python process_brief_requests.py --watch     # loop forever (daemon mode)
  python process_brief_requests.py --watch --interval 15

Deployment:
  Local dev:  run in a second terminal alongside the frontend
  Render:     set as a Background Worker / Web Service start command:
                python process_brief_requests.py --watch --interval 15
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("BriefProcessor")

ROOT = Path(__file__).resolve().parent


def _die(msg: str) -> None:
    log.critical(msg)
    sys.exit(1)


try:
    from supabase_client import _get_client
except ImportError:
    _die("supabase_client.py not found. It must be in the same directory as this script.")

try:
    from brief_generator import BriefGenerator
except ImportError:
    _die("brief_generator.py not found. Run this from the project root.")

try:
    from pipeline_paths import get_paths, resolve_niche
except ImportError:
    _die("pipeline_paths.py not found. Run this from the project root.")


# ── Cluster loading ────────────────────────────────────────────────────────────

def _load_clusters_from_disk(niche: str) -> List[Dict]:
    """Load pre-built cluster JSON from the last nightly pipeline run for this niche."""
    path = get_paths(niche).clusters
    if path.exists():
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        clusters = data.get("all_clusters_ranked", data.get("clusters", []))
        log.info("Loaded %d clusters from %s", len(clusters), path.name)
        return clusters
    return []


def _load_clusters_from_supabase(niche: str) -> List[Dict]:
    """
    Build cluster dicts from the Supabase opportunities + videos tables.
    Fallback for when no disk cluster file is present (e.g. fresh Render deploy
    that hasn't run the nightly pipeline locally on this machine).
    """
    db = _get_client()

    niche_resp = db.table("niches").select("id").eq("slug", niche).maybe_single().execute()
    if not niche_resp.data:
        log.error("Niche '%s' not found in Supabase public.niches", niche)
        return []
    niche_id = niche_resp.data["id"]

    opps_resp = db.table("opportunities").select(
        "*, clusters(cluster_key, topic_summary, video_count)"
    ).eq("niche_id", niche_id).order("composite_score", desc=True).limit(20).execute()

    if not opps_resp.data:
        log.warning("No opportunities found for niche '%s' in Supabase.", niche)
        return []

    clusters = []
    for opp in opps_resp.data:
        cluster_info = opp.get("clusters") or {}
        cluster_key = cluster_info.get("cluster_key", "unknown")

        vids_resp = db.table("videos").select(
            "video_id,title,channel_id,channel_title,view_count,views_per_hour,"
            "engagement_score,breakout_probability,intent_label,trend_score_7d,raw_metadata"
        ).eq("niche_id", niche_id).eq("cluster_label", cluster_key).order(
            "breakout_probability", desc=True
        ).limit(10).execute()

        top_videos = []
        for v in (vids_resp.data or []):
            raw = v.get("raw_metadata") or {}
            top_videos.append({
                "video_id": v.get("video_id"),
                "title": v.get("title"),
                "channel_title": v.get("channel_title"),
                "view_count": v.get("view_count", 0),
                "views_per_hour": v.get("views_per_hour", 0),
                "score10": raw.get("analysis_score_10", 0),
                "intent_label": v.get("intent_label"),
                "breakout_probability": v.get("breakout_probability", 0),
                "trend_score_7d": v.get("trend_score_7d", 0),
                "video_url": f"https://youtube.com/watch?v={v.get('video_id')}",
            })

        clusters.append({
            "cluster_id": opp.get("cluster_id"),
            "cluster_label": cluster_info.get("topic_summary", cluster_key),
            "topic": cluster_key,
            "niche": niche,
            "video_count": cluster_info.get("video_count", 0),
            "channels": len({v.get("channel_id") for v in top_videos}),
            "cluster_score10": float(opp.get("composite_score") or 0),
            "opportunity_metrics": {
                "demand": float(opp.get("demand_score") or 0),
                "growth": float(opp.get("growth_score") or 0),
                "competition": float(opp.get("competition_score") or 0),
                "creator_fit": float(opp.get("creator_fit_score") or 0),
                "opportunity_score": float(opp.get("composite_score") or 0),
            },
            "top_videos": top_videos,
        })

    log.info("Built %d clusters from Supabase opportunities", len(clusters))
    return clusters


def load_clusters(niche: str) -> List[Dict]:
    """Disk first (fast, what the nightly pipeline writes), Supabase fallback."""
    clusters = _load_clusters_from_disk(niche)
    if not clusters:
        log.info("No disk cluster file for '%s' — trying Supabase...", niche)
        clusters = _load_clusters_from_supabase(niche)
    # Stamp niche onto every cluster so downstream code (brief_generator's
    # result dict) can reliably report which niche this brief belongs to.
    for c in clusters:
        c.setdefault("niche", niche)
    if not clusters:
        log.error(
            "No cluster data available for niche '%s'.\n"
            "  Fix: python run_pipeline.py --nightly --niche %s",
            niche, niche
        )
    return clusters


# ── Creator profile loading ────────────────────────────────────────────────────

def load_creator_profile(channel_id: str) -> Optional[Dict]:
    """Load from Supabase profile_json; run a fresh audit if missing/incomplete."""
    db = _get_client()
    resp = db.table("creator_profiles").select("*").eq("channel_id", channel_id).maybe_single().execute()

    if resp.data and resp.data.get("profile_json"):
        log.info("Loaded creator profile for %s from Supabase", channel_id)
        profile = resp.data["profile_json"]
        profile.setdefault("channel_id", resp.data["channel_id"])
        profile.setdefault("channel_name", resp.data.get("channel_name"))
        profile.setdefault("subscribers", resp.data.get("subscriber_count", 0))
        profile.setdefault("avg_views", resp.data.get("avg_views", 0))
        profile.setdefault("niche", resp.data.get("detected_niche", "automotive"))
        return profile

    log.info("No cached profile for %s — running channel audit...", channel_id)
    try:
        from channel_auditor import ChannelAuditor
        auditor = ChannelAuditor()
        profile = auditor.run_audit(channel_id)
        log.info("Audit complete for %s", channel_id)
        return profile
    except Exception as e:
        log.error("Channel audit failed for %s: %s", channel_id, e)
        return None


# ── Brief processing ───────────────────────────────────────────────────────────

def pick_best_cluster(
    clusters: List[Dict],
    opportunity_id: Optional[str],
) -> Optional[Dict]:
    """Match a specific opportunity if given, else use the top-ranked cluster."""
    if not clusters:
        return None

    if opportunity_id:
        db = _get_client()
        opp_resp = db.table("opportunities").select(
            "*, clusters(cluster_key)"
        ).eq("id", opportunity_id).maybe_single().execute()

        if opp_resp.data:
            cluster_key = (opp_resp.data.get("clusters") or {}).get("cluster_key")
            if cluster_key:
                for c in clusters:
                    if str(c.get("topic")) == cluster_key or str(c.get("cluster_id")) == cluster_key:
                        log.info("Matched cluster to opportunity_id: %s", cluster_key)
                        return c

    return clusters[0]


def mark_brief_processing(brief_id: str) -> None:
    db = _get_client()
    db.table("briefs").update({"status": "processing"}).eq("id", brief_id).execute()


def write_brief_result(brief_id: str, result: Dict) -> None:
    """
    Write the completed brief back into the SAME row the frontend already
    created. Critical: UPDATE, not INSERT — frontend is polling this id.
    """
    db = _get_client()
    brief_json = result.get("brief_json", {})

    seo_tags = brief_json.get("tags", [])
    upload_timing = brief_json.get("upload_timing")

    update = {
        "brief_json": brief_json,
        "status": "approved",
        "model_used": result.get("model"),
        "temperature": 0.2,
        "seo_tags": [str(t) for t in seo_tags if t] or None,
        "upload_timing": upload_timing,
        "cluster_label": result.get("cluster_label"),
        "opportunity_score": float(result.get("opportunity_score") or 0),
        "generated_at": result.get("generated_at", datetime.now(timezone.utc).isoformat()),
    }
    update = {k: v for k, v in update.items() if v is not None}

    db.table("briefs").update(update).eq("id", brief_id).execute()
    log.info("✅ Brief written to Supabase: %s", brief_id)


def mark_brief_failed(brief_id: str, error: str) -> None:
    db = _get_client()
    db.table("briefs").update({
        "status": "failed",
        "brief_json": {"error": error[:500], "failed_at": datetime.now(timezone.utc).isoformat()},
    }).eq("id", brief_id).execute()
    log.error("Brief %s marked as failed: %s", brief_id, error)


def process_one(brief_row: Dict, gen: BriefGenerator) -> None:
    brief_id = brief_row["id"]
    channel_id = brief_row.get("channel_id")
    raw_niche = brief_row.get("niche") or "automotive"
    niche = resolve_niche(raw_niche, channel_id)
    opportunity_id = brief_row.get("opportunity_id")

    log.info("─── Processing brief %s (channel: %s, niche: %s)", brief_id, channel_id, niche)

    mark_brief_processing(brief_id)

    clusters = load_clusters(niche)
    if not clusters:
        mark_brief_failed(brief_id, f"No cluster data available for niche '{niche}'. Run the nightly pipeline first.")
        return

    creator_profile = None
    if channel_id:
        creator_profile = load_creator_profile(channel_id)

    cluster = pick_best_cluster(clusters, opportunity_id)
    if not cluster:
        mark_brief_failed(brief_id, "Could not select a cluster for this brief.")
        return

    log.info("Selected cluster: %s (score: %s)", cluster.get("cluster_label"), cluster.get("cluster_score10"))

    try:
        result = gen.generate_single(cluster, creator_profile)
    except Exception as e:
        mark_brief_failed(brief_id, str(e))
        return

    if result.get("status") != "success":
        mark_brief_failed(brief_id, result.get("error", "Unknown generator error"))
        return

    write_brief_result(brief_id, result)
    log.info(
        "Brief processed in %.1fs — quality: %s/10",
        result.get("elapsed_seconds", 0),
        result.get("brief_quality_score", "?"),
    )


def fetch_pending_briefs(limit: int = 5) -> List[Dict]:
    db = _get_client()
    resp = db.table("briefs").select(
        "id,channel_id,niche,opportunity_id,brief_type,target_video_id,status"
    ).eq("status", "draft").is_("brief_json", "null").order(
        "generated_at", desc=False
    ).limit(limit).execute()
    return resp.data or []


def run_once() -> int:
    pending = fetch_pending_briefs()
    if not pending:
        log.info("No pending briefs.")
        return 0

    log.info("Found %d pending brief(s) to process.", len(pending))
    gen = BriefGenerator()
    processed = 0

    for row in pending:
        try:
            process_one(row, gen)
            processed += 1
        except Exception as e:
            log.error("Unexpected error on brief %s: %s", row.get("id"), e)
            try:
                mark_brief_failed(row["id"], str(e))
            except Exception:
                pass

    return processed


def main() -> None:
    parser = argparse.ArgumentParser(description="AutoSignal — Brief Request Processor")
    parser.add_argument("--watch", action="store_true", help="Run in daemon mode (loop forever)")
    parser.add_argument("--interval", type=int, default=15, help="Polling interval in seconds (default: 15)")
    args = parser.parse_args()

    log.info("══ AutoSignal Brief Processor ══")

    if args.watch:
        log.info("Watch mode: polling every %ds. Ctrl+C to stop.", args.interval)
        while True:
            try:
                count = run_once()
                if count:
                    log.info("Processed %d brief(s) this cycle.", count)
            except KeyboardInterrupt:
                log.info("Stopped.")
                break
            except Exception as e:
                log.error("Cycle error (will retry next interval): %s", e)
            time.sleep(args.interval)
    else:
        count = run_once()
        log.info("Done. Processed %d brief(s).", count)


if __name__ == "__main__":
    main()