import json
import sqlite3
import os
import logging
from datetime import datetime, timezone

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger(__name__)

# --- Configuration ---
JSON_FILE_PATH = os.path.join(os.path.dirname(__file__), "merged_videos_semantic.json")
DB_FILE_PATH = os.path.join(os.path.dirname(__file__), "youtube_automotive.db")
TABLE_NAME = "videos"
CATEGORIZED_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "categorized_videos")

# --- Database Schema Definition ---
# Mapping from JSON key to SQLite column name and type.
# For list-like fields, they will be stored as TEXT after json.dumps()
SCHEMA = {
    "video_id": "TEXT PRIMARY KEY",
    "video_url": "TEXT",
    "channel_id": "TEXT",
    "channel_title": "TEXT",
    "published_at": "TEXT",
    "category_id": "TEXT",
    "title": "TEXT",
    "title_length_chars": "INTEGER",
    "title_word_count": "INTEGER",
    "title_has_number": "INTEGER", # Boolean (0 or 1)
    "title_has_question": "INTEGER", # Boolean (0 or 1)
    "title_has_year": "INTEGER", # Boolean (0 or 1)
    "title_uppercase_words": "TEXT", # Stored as JSON string
    "title_bracket_content": "TEXT", # Stored as JSON string
    "title_emotional_triggers": "TEXT", # Stored as JSON string
    "title_starts_with": "TEXT",
    "title_pattern": "TEXT",
    "description": "TEXT",
    "description_length": "INTEGER",
    "description_first_100": "TEXT",
    "description_has_timestamps": "INTEGER", # Boolean (0 or 1)
    "description_timestamp_count": "INTEGER",
    "description_link_count": "INTEGER",
    "description_hashtags": "TEXT", # Stored as JSON string
    "tags": "TEXT", # Stored as JSON string
    "tag_count": "INTEGER",
    "tag_total_chars": "INTEGER",
    "long_tail_tags": "TEXT", # Stored as JSON string
    "short_tags": "TEXT", # Stored as JSON string
    "duration_seconds": "INTEGER",
    "duration_iso": "TEXT",
    "thumbnail_url": "TEXT",
    "definition": "TEXT",
    "caption": "INTEGER", # Boolean (0 or 1)
    "default_audio_language": "TEXT",
    "view_count": "INTEGER",
    "like_count": "INTEGER",
    "comment_count": "INTEGER",
    "hours_since_publish": "REAL",
    "views_per_hour": "REAL",
    "views_per_day": "REAL",
    "age_bucket": "TEXT",
    "vph_tier": "TEXT",
    "is_still_growing": "INTEGER", # Boolean (0 or 1)
    "like_rate": "REAL",
    "comment_rate": "REAL",
    "engagement_score": "REAL",
    "thumbnail_has_face": "INTEGER", # Boolean (0 or 1)
    "thumbnail_face_count": "INTEGER",
    "thumbnail_has_text": "INTEGER", # Boolean (0 or 1)
    "thumbnail_text_content": "TEXT",
    "thumbnail_tags": "TEXT", # Stored as JSON string
    "thumbnail_dominant_colors": "TEXT", # Stored as JSON string
    "thumbnail_visual_style": "TEXT",
    "thumbnail_urgency_indicators": "INTEGER", # Boolean (0 or 1)
    "relevance_score": "INTEGER",
    "technical_depth_score": "INTEGER",
    "exclusion_score": "INTEGER",
    "final_score": "REAL",
    "discovery_sources": "TEXT", # Stored as JSON string
    "subniches": "TEXT", # Stored as JSON string
    "audience_type": "TEXT",
    "channel_total_views": "INTEGER",
    "channel_total_videos": "INTEGER",
    "channel_subscriber_count": "INTEGER",
    "channel_avg_views": "REAL",
    "views_48h": "INTEGER",
    "views_7d": "INTEGER",
    "brief_generated": "INTEGER", # Boolean
    "brief_followed": "INTEGER", # Boolean
    "channel_registered_keywords": "TEXT",
    "channel_sample_size_for_outlier": "INTEGER",
    "sample_outlier_score": "REAL",
    "is_sample_outlier": "INTEGER", # Boolean (0 or 1)
    "channel_niche_hit_rate": "REAL",
    "rank": "INTEGER",
    # Semantic Intelligence Fields
    "semantic_cluster": "INTEGER",
    "intent_label": "TEXT",
    "intent_confidence": "REAL",
    "trend_score_7d": "REAL",
    "velocity_delta": "REAL",
    "breakout_probability": "REAL",
    "cohort_id": "TEXT",
    "cohort_zscore": "REAL",
    "ctr_proxy_score": "REAL",
    "retention_proxy": "REAL",
    "next_best_topics": "TEXT", # JSON string
    "semantic_neighbors": "TEXT", # JSON string
    "analysis_score_10": "REAL",
    "last_run_date": "TEXT",
    "first_seen_date": "TEXT",
}

BRIEFS_SCHEMA = {
    "brief_id": "TEXT PRIMARY KEY",
    "channel_id": "TEXT",
    "cluster_id": "TEXT",
    "generated_at": "TEXT",
    "title_recommended": "TEXT",
    "thumbnail_style_recommended": "TEXT",
    "was_used": "INTEGER DEFAULT 0",
    "target_video_id": "TEXT",
    "video_published_at": "TEXT",
    "video_views_48h": "INTEGER",
    "brief_score": "REAL",
    "feedback_notes": "TEXT",
    "actual_performance": "TEXT"
}

PATTERNS_SCHEMA = {
    "pattern_id": "TEXT PRIMARY KEY",
    "pattern_type": "TEXT",
    "pattern_value": "TEXT",
    "confidence_score": "REAL",
    "win_count": "INTEGER DEFAULT 0",
    "loss_count": "INTEGER DEFAULT 0",
    "last_updated": "TEXT"
}

CLUSTER_SNAPSHOTS_SCHEMA = {
    "snapshot_id": "TEXT PRIMARY KEY", # run_date || '::' || cluster_id
    "run_date": "TEXT NOT NULL",
    "cluster_id": "TEXT NOT NULL",
    "cluster_label": "TEXT",
    "video_count": "INTEGER",
    "opportunity_score": "REAL",
    "demand": "REAL",
    "growth": "REAL",
    "competition": "REAL",
    "creator_fit": "REAL",
    "avg_score10": "REAL",
    "avg_breakout_prob": "REAL",
}

def insert_cluster_snapshots(cursor: sqlite3.Cursor, clusters: list, run_date: str) -> None:
    """
    Appends one row per cluster per run to cluster_snapshots.
    Call this after building clusters each run to build trend history.
    """
    columns_sql = ", ".join(
        f"{col} {dtype}" for col, dtype in CLUSTER_SNAPSHOTS_SCHEMA.items()
    )
    cursor.execute(f"CREATE TABLE IF NOT EXISTS cluster_snapshots ({columns_sql})")

    for cluster in clusters:
        cluster_id = cluster.get("cluster_id")
        if not cluster_id:
            continue
        
        snapshot_id = f"{run_date}::{cluster_id}"
        keys = list(CLUSTER_SNAPSHOTS_SCHEMA.keys())
        values = []

        # Get nested opportunity metrics
        opp_metrics = cluster.get("opportunity_metrics", {})

        for k in keys:
            if k == "snapshot_id":
                values.append(snapshot_id)
            elif k == "run_date":
                values.append(run_date)
            elif k in opp_metrics: # Check the nested dict first
                values.append(opp_metrics.get(k))
            else:
                values.append(cluster.get(k))
                
        placeholders = ", ".join(["?"] * len(keys))
        cursor.execute(f"INSERT OR REPLACE INTO cluster_snapshots ({', '.join(keys)}) VALUES ({placeholders})", tuple(values))

def get_cluster_trends(cursor: sqlite3.Cursor) -> list[dict]:
    """
    Computes week-over-week opportunity_score delta per cluster.
    Returns list sorted by delta descending (fastest rising clusters first).
    Requires at least 2 runs to produce meaningful output.
    """
    cursor.execute(
        """
        SELECT 
            a.cluster_id, a.cluster_label,
            a.run_date AS current_date, b.run_date AS prev_date,
            a.opportunity_score AS current_score, b.opportunity_score AS prev_score,
            ROUND(a.opportunity_score - b.opportunity_score, 3) AS score_delta,
            a.video_count AS current_video_count, b.video_count AS prev_video_count,
            a.video_count - b.video_count AS count_delta
        FROM cluster_snapshots a
        JOIN cluster_snapshots b ON a.cluster_id = b.cluster_id
        WHERE a.run_date = (SELECT MAX(run_date) FROM cluster_snapshots)
          AND b.run_date = (
              SELECT run_date FROM cluster_snapshots 
              ORDER BY run_date DESC LIMIT 1 OFFSET 1
          )
        ORDER BY score_delta DESC
        """
    )
    cols = [d[0] for d in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]

def create_tables(cursor: sqlite3.Cursor):
    """Creates all required tables if they don't exist."""
    for table, schema in [("videos", SCHEMA), ("briefs", BRIEFS_SCHEMA), ("patterns", PATTERNS_SCHEMA)]:
        columns_sql = ", ".join([f"{col_name} {col_type}" for col_name, col_type in schema.items()])
        cursor.execute(f"CREATE TABLE IF NOT EXISTS {table} ({columns_sql})")
        log.info(f"Table '{table}' ensured to exist in '{DB_FILE_PATH}'.")

# Fields that store JSON strings and should be deserialized when fetched from DB
JSON_TEXT_FIELDS = [
    "title_uppercase_words",
    "title_bracket_content",
    "title_emotional_triggers",
    "description_hashtags",
    "tags",
    "long_tail_tags",
    "short_tags",
    "thumbnail_tags",
    "thumbnail_dominant_colors",
    "discovery_sources",
    "subniches",
]

def insert_video_data(cursor: sqlite3.Cursor, video_data: dict):
    """Inserts a single video's data into the database."""
    columns = []
    values = []
    placeholders = []

    for json_key, db_type in SCHEMA.items():
        value = video_data.get(json_key)
        
        # Handle None values and type conversions
        if value is None:
            # For booleans (stored as INTEGER), map None to 0 or NULL
            if "INTEGER" in db_type and (
                "_has_" in json_key or
                "is_" in json_key or
                json_key == "caption" or
                json_key == "thumbnail_urgency_indicators"
            ):
                value = 0 # Default to false for booleans if not present
            else:
                value = None # Keep as NULL for other types
        elif isinstance(value, (list, dict)):
            value = json.dumps(value, ensure_ascii=False)
        elif isinstance(value, bool):
            value = int(value) # Convert boolean to 0 or 1 for INTEGER type

        columns.append(json_key)
        values.append(value)
        placeholders.append("?")

    # Use INSERT OR REPLACE to handle cases where a video_id might already exist
    # This is useful if running the script multiple times or with overlapping data.
    today = datetime.now(timezone.utc).date().isoformat()

    all_columns = columns + ["last_run_date", "first_seen_date"]
    all_placeholders = placeholders + ["?", "?"]
    all_values = values + [today, today]

    cursor.execute(
        f"INSERT OR IGNORE INTO {TABLE_NAME} ({', '.join(all_columns)}) "
        f"VALUES ({', '.join(all_placeholders)})",
        tuple(all_values),
    )

    update_pairs = [f"{col} = ?" for col in columns if col != "video_id"]
    update_vals = [v for col, v in zip(columns, values) if col != "video_id"]
    cursor.execute(
        f"UPDATE {TABLE_NAME} SET {', '.join(update_pairs)}, last_run_date = ? "
        f"WHERE video_id = ?",
        tuple(update_vals) + (today, video_data.get("video_id")),
    )

def _fetch_videos_from_db(cursor: sqlite3.Cursor, query: str, params: tuple = ()) -> list[dict]:
    """
    Fetches videos from the database based on a query and deserializes JSON fields.
    """
    cursor.execute(query, params)
    rows = cursor.fetchall()
    cols = [description[0] for description in cursor.description]
    
    videos = []
    for row in rows:
        video = {}
        for i, col_name in enumerate(cols):
            value = row[i]
            if col_name in JSON_TEXT_FIELDS:
                try:
                    # Attempt to de-serialize JSON string back to Python object
                    video[col_name] = json.loads(value) if value is not None else []
                except (json.JSONDecodeError, TypeError):
                    log.warning(f"Failed to decode JSON for column '{col_name}' with value: {value}. Storing as raw text or empty list.")
                    video[col_name] = value if value is not None else []
            elif SCHEMA.get(col_name) == "INTEGER" and (
                "_has_" in col_name or
                "is_" in col_name or
                col_name == "caption" or
                col_name == "thumbnail_urgency_indicators"
            ):
                video[col_name] = bool(value) if value is not None else False
            else:
                video[col_name] = value
        videos.append(video)
    return videos

def export_categorized_videos(conn: sqlite3.Connection, categorized_dir: str, index_path: str):
    """
    Queries the database for different categories of videos and exports them to JSON files.
    Also writes a categorized_index.json manifest for the dashboard/API.
    """
    log.info("Starting categorization and export of videos...")
    cursor = conn.cursor()
    
    os.makedirs(categorized_dir, exist_ok=True)

    # Define categories and their queries
    categories = {
        "top_10_by_views": {
            "query": f"SELECT * FROM {TABLE_NAME} ORDER BY view_count DESC LIMIT 10",
            "description": "Top 10 videos by view count"
        },
        "top_10_by_vph": {
            "query": f"SELECT * FROM {TABLE_NAME} ORDER BY views_per_hour DESC LIMIT 10",
            "description": "Top 10 videos by views per hour (fastest growth)"
        },
        "top_10_by_final_score": {
            "query": f"SELECT * FROM {TABLE_NAME} ORDER BY final_score DESC LIMIT 10",
            "description": "Top 10 videos by calculated final score"
        },
        "outlier_videos": {
            "query": f"SELECT * FROM {TABLE_NAME} WHERE is_sample_outlier = 1 ORDER BY sample_outlier_score DESC",
            "description": "Videos identified as channel outliers (performing significantly better than channel average)"
        },
        "high_engagement_videos": {
            "query": f"SELECT * FROM {TABLE_NAME} WHERE engagement_score > 0.015 ORDER BY engagement_score DESC LIMIT 10",
            "description": "Top 10 videos with high engagement (likes + comments / views)"
        },
        "how_to_videos": {
            "query": f"SELECT * FROM {TABLE_NAME} WHERE title_pattern = 'how_to' ORDER BY final_score DESC LIMIT 10",
            "description": "Top 10 'How-To' videos based on title pattern"
        },
        "recent_viral": {
            "query": f"SELECT * FROM {TABLE_NAME} WHERE age_bucket = 'New (< 24h)' OR age_bucket = 'Recent (< 1 Week)' ORDER BY views_per_hour DESC LIMIT 10",
            "description": "Top 10 recent videos by views per hour"
        },
        "diagnostics_subniche": {
            "query": f"SELECT * FROM {TABLE_NAME} WHERE subniches LIKE '%\"diagnostics\"%' ORDER BY final_score DESC LIMIT 10",
            "description": "Top 10 videos categorized under 'diagnostics' sub-niche"
        },
        "diy_auto_repair_subniche": {
            "query": f"SELECT * FROM {TABLE_NAME} WHERE subniches LIKE '%\"diy_auto_repair\"%' ORDER BY final_score DESC LIMIT 10",
            "description": "Top 10 videos categorized under 'DIY Auto Repair' sub-niche"
        },
        "diesel_truck_subniche": {
            "query": f"SELECT * FROM {TABLE_NAME} WHERE subniches LIKE '%\"diesel_truck\"%' ORDER BY final_score DESC LIMIT 10",
            "description": "Top 10 videos categorized under 'Diesel Truck' sub-niche"
        },
    }

    for category_name, category_info in categories.items():
        log.info(f"Exporting '{category_info['description']}'...")
        try:
            videos_for_category = _fetch_videos_from_db(cursor, category_info["query"])
            
            output_file_path = os.path.join(categorized_dir, f"{category_name}.json")
            
            output_data = {
                "category": category_name,
                "description": category_info["description"],
                "total_videos": len(videos_for_category),
                "videos": videos_for_category
            }
            
            with open(output_file_path, "w", encoding="utf-8") as f:
                json.dump(output_data, f, indent=2, ensure_ascii=False)
            
            log.info(f"  Saved {len(videos_for_category)} videos to {output_file_path}")

        except sqlite3.Error as e:
            log.error(f"Error exporting category '{category_name}': {e}")
        except Exception as e:
            log.error(f"An unexpected error occurred during export of '{category_name}': {e}")

    index_entries = []
    for category_name, category_info in categories.items():
        index_entries.append({
            "category": category_name,
            "description": category_info["description"],
            "file": f"{category_name}.json",
        })

    with open(index_path, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "categories": index_entries,
        }, f, indent=2, ensure_ascii=False)

    log.info("Video categorization and export complete.")


def main(niche: str = "automotive"):
    from pipeline_paths import get_paths, resolve_niche

    resolved = resolve_niche(niche)
    paths = get_paths(resolved)
    paths.ensure_dirs()

    json_file_path = str(paths.merged_semantic)
    db_file_path = str(paths.db)
    categorized_output_dir = str(paths.categorized_dir)
    categorized_index_path = str(paths.categorized_index)

    if not os.path.exists(json_file_path):
        log.error(f"JSON file not found at: {json_file_path}")
        log.error("Please ensure merged_videos_semantic.json exists for this niche.")
        return

    try:
        with open(json_file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        log.error(f"Error decoding JSON from '{json_file_path}': {e}")
        return
    except IOError as e:
        log.error(f"Error reading JSON file '{json_file_path}': {e}")
        return

    videos_to_insert = data.get("videos", [])
    if not videos_to_insert:
        log.warning("No videos found in the JSON file to insert.")
        return

    log.info(f"Connecting to SQLite database: {db_file_path}")
    conn = None
    try:
        conn = sqlite3.connect(db_file_path)
        cursor = conn.cursor()

        create_tables(cursor)

        # --- Cleanup stale rows from old pipeline runs ---
        log.info("Cleaning up stale rows from previous pipeline runs...")
        cleanup_query = """
        DELETE FROM videos 
        WHERE intent_label IS NULL 
        AND trend_score_7d IS NULL 
        AND breakout_probability IS NULL
        """
        cursor.execute(cleanup_query)
        deleted_count = cursor.rowcount
        conn.commit()
        if deleted_count > 0:
            log.info(f"Deleted {deleted_count} stale rows from the 'videos' table.")
        else:
            log.info("No stale rows found to delete.")

        log.info(f"Inserting {len(videos_to_insert)} video records into '{TABLE_NAME}'...")
        inserted_count = 0
        for i, video_data in enumerate(videos_to_insert):
            try:
                insert_video_data(cursor, video_data)
                inserted_count += 1
                if (i + 1) % 10 == 0:
                    log.info(f"  Processed {i + 1}/{len(videos_to_insert)} records.")
            except Exception as e:
                log.error(f"Error inserting video_id '{video_data.get('video_id', 'unknown')}' (index {i}): {e}")
                # Depending on strictness, you might want to continue or break here
                continue 
        
        conn.commit()
        log.info(f"Successfully inserted/updated {inserted_count} video records.")

        # Write cluster snapshot for trend tracking
        cluster_file = str(paths.clusters)
        if os.path.exists(cluster_file):
            try:
                with open(cluster_file, "r", encoding="utf-8") as f:
                    cluster_data = json.load(f)
                clusters = cluster_data.get("clusters", [])
                if clusters:
                    run_date = datetime.now(timezone.utc).date().isoformat()
                    insert_cluster_snapshots(cursor, clusters, run_date)
                    log.info("Cluster trend snapshot written for %s", run_date)
            except Exception as e:
                log.error(f"Failed to write cluster snapshot: {e}")

        # All database writes are done, now export the reports using the same connection
        export_categorized_videos(conn, categorized_output_dir, categorized_index_path)

    except sqlite3.Error as e:
        log.error(f"SQLite error: {e}")
        if conn:
            conn.rollback()
    except Exception as e:
        log.error(f"An unexpected error occurred: {e}")
    finally:
        if conn:
            conn.close()
            log.info("SQLite connection closed.")

    log.info("Database creation and population complete.")

if __name__ == "__main__":
    import sys
    niche_arg = sys.argv[1] if len(sys.argv) > 1 else "automotive"
    main(niche_arg)