"""
feedback_loop.py
================
Tracks the usage and performance of generated briefs, tunes signal weights,
and monitors seed channel health.

1. Checks if a creator published a video matching a brief (cross-run dedup aware).
2. Checks if a matched video is 48 hours old and fetches its stats.
3. Scores the brief based on 48h performance vs channel average.
4. After 20+ data points, auto-adjusts opportunity_scorer signal weights.
5. After metadata_fetch runs, flags dormant/drifted seed channels.
"""

import sqlite3
import json
import logging
import difflib
from datetime import datetime, timezone, timedelta
from pathlib import Path

from youtube_api_utils import request_with_retry, YT_VIDEOS_URL, YT_CHANNELS_URL, YT_PLAYLIST_URL

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger(__name__)

# Supabase integration
try:
    from supabase_client import save_brief_performance, log_api_key_usage
    _SUPABASE_AVAILABLE = True
    log.info("supabase_client loaded — 48h performance will sync to Supabase.")
except ImportError:
    _SUPABASE_AVAILABLE = False
    log.warning(
        "supabase_client.py not found — 48h performance verdicts will only be "
        "saved to SQLite. Copy supabase_client.py to this directory."
    )

# Performance verdict thresholds
VERDICT_OUTPERFORMED = 1.5   # 1.5x channel avg = OUTPERFORMED
VERDICT_MATCHED_MIN  = 0.8   # 0.8x-1.5x = MATCHED
# Below 0.8x = UNDERPERFORMED

# Cross-run dedup: skip cluster if briefed within this many days
DEDUP_LOOKBACK_DAYS = 14

# Weight tuning: minimum data points before adjusting weights
WEIGHT_TUNE_MIN_SAMPLES = 20
WEIGHT_TUNE_STEP        = 0.05   # ±5% per adjustment cycle

DB_PATH = Path(__file__).resolve().parent / "youtube_automotive.db"
ROOT    = Path(__file__).resolve().parent


# ── Schema helpers ──────────────────────────────────────────────────────────────

def _ensure_tables(conn: sqlite3.Connection) -> None:
    """Create any tables needed by feedback_loop that may not exist yet."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS brief_history (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            cluster_id      TEXT    NOT NULL,
            briefed_at      TEXT    NOT NULL,
            channel_id      TEXT,
            brief_id        TEXT
        );

        CREATE TABLE IF NOT EXISTS weight_tuning_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            adjusted_at     TEXT    NOT NULL,
            trigger         TEXT,
            old_weights     TEXT,
            new_weights     TEXT,
            sample_count    INTEGER
        );

        CREATE TABLE IF NOT EXISTS seed_channel_health (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            checked_at      TEXT    NOT NULL,
            channel_id      TEXT    NOT NULL,
            channel_title   TEXT,
            videos_found    INTEGER,
            avg_age_days    REAL,
            relevance_score REAL,
            status          TEXT
        );
        
        CREATE TABLE IF NOT EXISTS opportunities_archive (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            cluster_id          TEXT    NOT NULL,
            run_date            TEXT    NOT NULL,
            trending_score      REAL,
            search_gap_score    REAL,
            seasonal_score      REAL,
            breakout_score      REAL
        );
    """)
    conn.commit()

def _get(url: str, params: dict) -> dict:
    return request_with_retry(url, params)

def get_channel_uploads(channel_id: str, max_results=10) -> list[dict]:
    # 1. Get playlist ID
    channel_data = _get(YT_CHANNELS_URL, {"part": "contentDetails", "id": channel_id})
    items = channel_data.get("items", [])
    if not items:
        return []
    uploads_id = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]

    # 2. Get recent videos
    playlist_resp = _get(YT_PLAYLIST_URL, {
        "part": "snippet,contentDetails",
        "playlistId": uploads_id,
        "maxResults": max_results
    })
    
    videos = []
    for item in playlist_resp.get("items", []):
        videos.append({
            "video_id": item["contentDetails"]["videoId"],
            "title": item["snippet"]["title"],
            "published_at": item["snippet"]["publishedAt"]
        })
    return videos

def check_brief_usage(conn: sqlite3.Connection):
    """Find unused briefs and check if the creator uploaded a matching video."""
    cursor = conn.cursor()
    
    # Verify the table exists before attempting to read from it
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='briefs'")
    if not cursor.fetchone():
        log.warning("Table 'briefs' does not exist yet. Generate a brief first.")
        return

    cursor.execute("SELECT brief_id, channel_id, generated_at, title_recommended FROM briefs WHERE was_used = 0")
    unused_briefs = cursor.fetchall()
    
    if not unused_briefs:
        log.info("No unused briefs to check.")
        return

    channels_to_check = set(row[1] for row in unused_briefs if row[1] and row[1] != "unknown")
    
    channel_videos = {}
    for cid in channels_to_check:
        try:
            channel_videos[cid] = get_channel_uploads(cid, max_results=10)
        except Exception as e:
            log.error("Failed to fetch uploads for channel %s: %s", cid, e)
            channel_videos[cid] = []

    updated_count = 0
    for brief_id, cid, generated_at, title_rec_json in unused_briefs:
        if cid not in channel_videos or not generated_at:
            continue
            
        try:
            gen_dt = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
        except ValueError:
            continue
        
        try:
            title_options = json.loads(title_rec_json)
            if not isinstance(title_options, list):
                title_options = []
        except (json.JSONDecodeError, TypeError, ValueError):
            title_options = []
            
        for video in channel_videos[cid]:
            try:
                pub_dt = datetime.fromisoformat(video["published_at"].replace("Z", "+00:00"))
            except ValueError:
                continue
            
            # Video must be published after the brief was generated
            if pub_dt > gen_dt:
                # Basic similarity check
                matched = False
                for option in title_options:
                    sim = difflib.SequenceMatcher(None, option.lower(), video["title"].lower()).ratio()
                    if sim > 0.55:
                        matched = True
                        break
                
                if matched:
                    cursor.execute("""
                        UPDATE briefs
                        SET was_used = 1, target_video_id = ?, video_published_at = ?
                        WHERE brief_id = ?
                    """, (video["video_id"], video["published_at"], brief_id))
                    updated_count += 1
                    log.info("Brief %s marked as USED by video %s", brief_id, video["video_id"])
                    break
    
    conn.commit()
    log.info("Checked usage for %d briefs. %d marked as used.", len(unused_briefs), updated_count)

def evaluate_48h_performance(conn: sqlite3.Connection):
    """Check used briefs for 48h stats and score them."""
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='briefs'")
    if not cursor.fetchone():
        return

    cursor.execute("""
        SELECT brief_id, channel_id, target_video_id, video_published_at
        FROM briefs 
        WHERE was_used = 1 AND target_video_id IS NOT NULL AND video_views_48h IS NULL
    """)
    pending_evals = cursor.fetchall()
    
    if not pending_evals:
        log.info("No pending 48h evaluations.")
        return

    now = datetime.now(timezone.utc)
    evaluated_count = 0
    
    for brief_id, cid, video_id, published_at in pending_evals:
        if not published_at:
            continue
            
        try:
            pub_dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        except ValueError:
            continue
            
        age_hours = (now - pub_dt).total_seconds() / 3600.0
        
        if age_hours >= 48.0:
            try:
                # Fetch video stats
                stats_resp = _get(YT_VIDEOS_URL, {"part": "statistics", "id": video_id})
                items = stats_resp.get("items", [])
                if not items:
                    continue
                    
                views_48h = int(items[0]["statistics"].get("viewCount", 0))
                
                # Fetch channel avg views to calculate score
                cursor.execute("SELECT channel_avg_views FROM videos WHERE channel_id = ? AND channel_avg_views IS NOT NULL LIMIT 1", (cid,))
                row = cursor.fetchone()
                channel_avg_views = row[0] if row else 1000  # fallback
                
                if channel_avg_views == 0: channel_avg_views = 1
                
                # Score formula: 10/10 if 2x channel avg. Cap at 10.
                ratio = views_48h / channel_avg_views
                brief_score = round(min(10.0, ratio * 5.0), 1)

                # Determine performance verdict
                if ratio >= VERDICT_OUTPERFORMED:
                    verdict = "OUTPERFORMED"
                elif ratio >= VERDICT_MATCHED_MIN:
                    verdict = "MATCHED"
                else:
                    verdict = "UNDERPERFORMED"

                notes = (
                    f"Video reached {views_48h:,} views in 48h. "
                    f"Ratio vs channel avg: {ratio:.2f}x. "
                    f"Verdict: {verdict}"
                )

                cursor.execute("""
                    UPDATE briefs
                    SET video_views_48h = ?, brief_score = ?, feedback_notes = ?
                    WHERE brief_id = ?
                """, (views_48h, brief_score, notes, brief_id))
                evaluated_count += 1
                log.info(
                    "Evaluated brief %s: %s — Score %s/10 (%.2fx channel avg, %d views)",
                    brief_id, verdict, brief_score, ratio, views_48h
                )

                # Write to Supabase if available
                if _SUPABASE_AVAILABLE:
                    try:
                        save_brief_performance({
                            "brief_id": brief_id,
                            "channel_id": cid,
                            "video_id": video_id,
                            "views_48h": views_48h,
                            "creator_avg_views": channel_avg_views,
                            "performance_ratio": round(ratio, 4),
                            "verdict": verdict,
                        })
                    except Exception as supabase_err:
                        log.warning("Supabase write failed (non-fatal): %s", supabase_err)
                
            except Exception as e:
                log.error("Failed to evaluate brief %s: %s", brief_id, e)
                
    conn.commit()
    log.info("Evaluated 48h performance for %d briefs.", evaluated_count)

# ── Feature 3: Cross-run deduplication ──────────────────────────────────────────────

def record_brief_history(conn: sqlite3.Connection, cluster_id: str, brief_id: str, channel_id: str = None) -> None:
    """Record that a cluster was briefed. Called from brief_generator.save_briefs() or here."""
    conn.execute("""
        INSERT INTO brief_history (cluster_id, briefed_at, channel_id, brief_id)
        VALUES (?, ?, ?, ?)
    """, (cluster_id, datetime.now(timezone.utc).isoformat(), channel_id, brief_id))
    conn.commit()


def was_recently_briefed(conn: sqlite3.Connection, cluster_id: str, days: int = DEDUP_LOOKBACK_DAYS) -> dict:
    """
    Check if this cluster was briefed within the last `days` days.
    Returns {"skip": bool, "last_briefed": ISO timestamp or None, "label": str}.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    row = conn.execute("""
        SELECT briefed_at FROM brief_history
        WHERE cluster_id = ? AND briefed_at > ?
        ORDER BY briefed_at DESC LIMIT 1
    """, (cluster_id, cutoff)).fetchone()

    if row:
        return {"skip": True,  "last_briefed": row[0], "label": "RECURRING"}
    return {"skip": False, "last_briefed": None,  "label": "NEW THIS WEEK"}


def filter_deduplicated_clusters(conn: sqlite3.Connection, clusters: list) -> list:
    """
    Filter out clusters briefed within the last DEDUP_LOOKBACK_DAYS days.
    Attaches 'dedup_label' (NEW THIS WEEK / RECURRING) to each cluster.
    Returns filtered list with dedup metadata.
    """
    filtered = []
    skipped  = 0
    for c in clusters:
        cid    = str(c.get("cluster_id") or c.get("topic") or "")
        result = was_recently_briefed(conn, cid)
        c["dedup_label"]    = result["label"]
        c["last_briefed_at"] = result["last_briefed"]
        if result["skip"]:
            skipped += 1
            log.info("  [DEDUP] Skipping cluster '%s' — briefed %s days ago.",
                     c.get("cluster_label", cid),
                     (datetime.now(timezone.utc) - datetime.fromisoformat(result["last_briefed"])).days)
        else:
            filtered.append(c)
    log.info("Cross-run dedup: %d clusters available, %d skipped (briefed within %d days).",
             len(filtered), skipped, DEDUP_LOOKBACK_DAYS)
    return filtered


# ── Feature 4: Feedback → weight tuning ──────────────────────────────────────────────

def tune_signal_weights(conn: sqlite3.Connection) -> None:
    """
    After 20+ evaluated briefs, compute which of the 4 signals (trending, gap,
    seasonal, breakout) best predicted actual performance, then nudge weights
    by WEIGHT_TUNE_STEP (5%) toward the better-performing signals.

    Writes updated weights back to opportunity_scorer.py and logs the adjustment.
    """
    _ensure_tables(conn)

    rows = conn.execute("""
        SELECT b.brief_id, b.brief_score,
               o.trending_score, o.search_gap_score, o.seasonal_score, o.breakout_score
        FROM briefs b
        LEFT JOIN (
            SELECT cluster_id,
                   AVG(trending_score)    AS trending_score,
                   AVG(search_gap_score)  AS search_gap_score,
                   AVG(seasonal_score)    AS seasonal_score,
                   AVG(breakout_score)    AS breakout_score
            FROM opportunities_archive
            GROUP BY cluster_id
        ) o ON b.cluster_id = o.cluster_id
        WHERE b.brief_score IS NOT NULL AND o.trending_score IS NOT NULL
    """).fetchall()

    if len(rows) < WEIGHT_TUNE_MIN_SAMPLES:
        log.info("Weight tuning: only %d evaluated briefs (need %d). Skipping.",
                 len(rows), WEIGHT_TUNE_MIN_SAMPLES)
        return

    import statistics

    # Compute correlation of each signal with actual brief_score
    scores       = [r[1] for r in rows]
    trending_sig = [r[2] or 5.0 for r in rows]
    gap_sig      = [r[3] or 5.0 for r in rows]
    seasonal_sig = [r[4] or 5.0 for r in rows]
    breakout_sig = [r[5] or 5.0 for r in rows]

    def _corr(xs, ys):
        """Simple Pearson correlation."""
        n = len(xs)
        if n < 2:
            return 0.0
        mx, my = sum(xs)/n, sum(ys)/n
        num = sum((x-mx)*(y-my) for x, y in zip(xs, ys))
        den_x = (sum((x-mx)**2 for x in xs)) ** 0.5
        den_y = (sum((y-my)**2 for y in ys)) ** 0.5
        return num / (den_x * den_y) if den_x * den_y else 0.0

    correlations = {
        "WEIGHT_TRENDING_VELOCITY": _corr(trending_sig, scores),
        "WEIGHT_SEARCH_GAP":        _corr(gap_sig,      scores),
        "WEIGHT_SEASONAL":          _corr(seasonal_sig, scores),
        "WEIGHT_BREAKOUT":          _corr(breakout_sig, scores),
    }

    # Read current weights from opportunity_scorer.py
    scorer_path = ROOT / "opportunity_scorer.py"
    if not scorer_path.exists():
        log.warning("opportunity_scorer.py not found; cannot tune weights.")
        return

    scorer_text = scorer_path.read_text(encoding="utf-8")
    import re
    current_weights: dict = {}
    for name in correlations:
        m = re.search(rf"^{name}\s*=\s*([\d.]+)", scorer_text, re.MULTILINE)
        if m:
            current_weights[name] = float(m.group(1))

    if len(current_weights) < 4:
        log.warning("Could not parse all weights from opportunity_scorer.py. Skipping tuning.")
        return

    total_corr = sum(abs(v) for v in correlations.values()) or 1.0
    new_weights: dict = {}
    for name, old_w in current_weights.items():
        corr_ratio = abs(correlations[name]) / total_corr
        # Nudge toward better-predicting signals by TUNE_STEP, bounded to [0.05, 0.70]
        raw = old_w + (corr_ratio - 0.25) * WEIGHT_TUNE_STEP
        new_weights[name] = round(max(0.05, min(0.70, raw)), 4)

    # Normalise so they still sum to 1.0
    total_new = sum(new_weights.values())
    new_weights = {k: round(v / total_new, 4) for k, v in new_weights.items()}

    # Patch opportunity_scorer.py
    updated_text = scorer_text
    for name, val in new_weights.items():
        updated_text = re.sub(
            rf"^({name}\s*=\s*)[\d.]+",
            rf"\g<1>{val}",
            updated_text,
            flags=re.MULTILINE
        )
    scorer_path.write_text(updated_text, encoding="utf-8")

    # Log the adjustment
    conn.execute("""
        INSERT INTO weight_tuning_log (adjusted_at, trigger, old_weights, new_weights, sample_count)
        VALUES (?, ?, ?, ?, ?)
    """, (
        datetime.now(timezone.utc).isoformat(),
        f"{len(rows)} evaluated briefs",
        json.dumps(current_weights),
        json.dumps(new_weights),
        len(rows)
    ))
    conn.commit()

    log.info("Weight tuning applied (%d data points):", len(rows))
    for name in current_weights:
        log.info("  %s: %.4f → %.4f (corr=%.3f)",
                 name, current_weights[name], new_weights[name], correlations[name])


# ── Feature 5: Seed channel health monitor ──────────────────────────────────────────

def check_seed_channel_health(conn: sqlite3.Connection) -> list:
    """
    For each channel in the videos table, compute:
      - videos_found in last 90 days
      - avg_age_days of their videos
      - avg relevance_score

    Flags:
      DORMANT  — 0 videos in last 90 days
      DRIFTED  — avg relevance_score < 0.4
      HEALTHY  — everything fine

    Writes results to seed_channel_health table.
    Returns list of flagged (non-healthy) channels.
    """
    _ensure_tables(conn)

    now = datetime.now(timezone.utc)
    cutoff_90d = (now - timedelta(days=90)).isoformat()

    rows = conn.execute("""
        SELECT
            channel_id,
            MAX(channel_title) AS channel_title,
            COUNT(CASE WHEN published_at > ? THEN 1 END) AS videos_90d,
            AVG(CAST(
                (julianday('now') - julianday(published_at)) AS REAL
            )) AS avg_age_days,
            AVG(CAST(relevance_score AS REAL)) AS avg_relevance
        FROM videos
        WHERE channel_id IS NOT NULL
        GROUP BY channel_id
        HAVING COUNT(*) >= 2
    """, (cutoff_90d,)).fetchall()

    checked_at = now.isoformat()
    flagged = []

    for channel_id, channel_title, videos_90d, avg_age, avg_relevance in rows:
        avg_rel = float(avg_relevance or 0.0)
        vids_90 = int(videos_90d or 0)

        if vids_90 == 0:
            status = "DORMANT"
        elif avg_rel < 0.4:
            status = "DRIFTED"
        else:
            status = "HEALTHY"

        conn.execute("""
            INSERT INTO seed_channel_health
                (checked_at, channel_id, channel_title, videos_found, avg_age_days, relevance_score, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (checked_at, channel_id, channel_title, vids_90, avg_age, avg_rel, status))

        if status != "HEALTHY":
            flagged.append({
                "channel_id":    channel_id,
                "channel_title": channel_title,
                "videos_90d":    vids_90,
                "avg_age_days":  round(avg_age or 0, 1),
                "relevance":     round(avg_rel, 3),
                "status":        status,
            })

    conn.commit()

    total = len(rows)
    dormant  = sum(1 for f in flagged if f["status"] == "DORMANT")
    drifted  = sum(1 for f in flagged if f["status"] == "DRIFTED")
    log.info("Seed channel health: %d total | %d dormant | %d drifted | %d healthy",
             total, dormant, drifted, total - dormant - drifted)
    if flagged:
        log.warning("Flagged channels requiring attention:")
        for ch in flagged:
            log.warning("  [%s] %s (id: %s) — %d videos/90d, relevance %.2f",
                        ch["status"], ch["channel_title"] or "?", ch["channel_id"],
                        ch["videos_90d"], ch["relevance"])
        log.warning("Recommend replacing %d channels. Run --discover-related-channels.",
                    len(flagged))
    return flagged


def main(niche: str = "automotive"):
    from pipeline_paths import get_paths, resolve_niche

    resolved = resolve_niche(niche)
    db_path = get_paths(resolved).db
    if not db_path.exists():
        log.error("Database not found at %s. Run the pipeline first.", db_path)
        return

    conn = sqlite3.connect(db_path)
    _ensure_tables(conn)
    try:
        log.info("--- Starting Feedback Loop ---")
        check_brief_usage(conn)
        evaluate_48h_performance(conn)
        tune_signal_weights(conn)
        health_report = check_seed_channel_health(conn)
        if health_report:
            log.warning("Seed health report: %d channels need attention.", len(health_report))
        log.info("--- Feedback Loop Complete ---")
    finally:
        conn.close()

if __name__ == "__main__":
    import sys
    niche_arg = sys.argv[1] if len(sys.argv) > 1 else "automotive"
    main(niche_arg)
