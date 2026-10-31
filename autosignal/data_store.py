"""
data_store.py
=============
Do not run directly. Import get_db_connection() and ensure_tables_exist() from this module.
This is a thin utility that centralizes database connection and schema creation.
"""

import logging
import sqlite3
from pathlib import Path

# Import schemas from the single source of truth to avoid duplication
from json_to_sqlite import (BRIEFS_SCHEMA, CLUSTER_SNAPSHOTS_SCHEMA,
                            PATTERNS_SCHEMA, SCHEMA)

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s")
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent


def _default_db_path() -> Path:
    """Resolve the active niche DB via pipeline_paths so all modules share one
    database per niche. Falls back to the legacy root path if unavailable."""
    try:
        from pipeline_paths import get_paths
        return get_paths("automotive").db
    except Exception:
        return ROOT / "youtube_automotive.db"


DB_PATH = _default_db_path()

def get_db_connection() -> sqlite3.Connection:
    """Opens and returns a connection to youtube_automotive.db."""
    return sqlite3.connect(DB_PATH)

def ensure_tables_exist(conn: sqlite3.Connection) -> None:
    """
    Creates all required tables in the database if they don't already exist,
    using the schemas defined in json_to_sqlite.py.
    """
    cursor = conn.cursor()
    
    schemas_to_create = [
        ("videos", SCHEMA),
        ("briefs", BRIEFS_SCHEMA),
        ("patterns", PATTERNS_SCHEMA),
        ("cluster_snapshots", CLUSTER_SNAPSHOTS_SCHEMA),
    ]
    
    for table_name, schema_dict in schemas_to_create:
        # Using quotes around column names for safety with keywords
        columns_sql = ", ".join([f'"{col_name}" {col_type}' for col_name, col_type in schema_dict.items()])
        cursor.execute(f"CREATE TABLE IF NOT EXISTS {table_name} ({columns_sql})")
            
    conn.commit()
    log.info("All database tables ensured to exist.")

# No main() function, this module is for import only.