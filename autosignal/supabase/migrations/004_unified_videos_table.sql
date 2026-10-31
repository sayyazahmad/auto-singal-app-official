-- ============================================================
-- AutoSignal — Supabase Schema Migration
-- Migration: 004_unified_videos_table.sql
-- ============================================================
-- WHY THIS MIGRATION EXISTS (resolves audit finding C3 / R1)
--
-- Three layers disagreed on where video data lives:
--   * supabase_client.upsert_videos() writes a single `videos` table with
--     niche_id, embedding (vector), tags, raw_metadata.
--   * app.js reads `.from('videos')` with niche_id.
--   * migrations 001/002 created `youtube_videos` + per-niche `*_videos`
--     tables that nothing in the app actually reads.
--
-- This migration makes the single `videos` table the source of truth
-- (matching the Python writer and the JS reader), enables pgvector for
-- semantic embeddings, adds RLS, and drops the unused legacy tables.
--
-- Run AFTER 003_fix_rls_and_app_tables.sql.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "vector";

-- ── Unified videos table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id             TEXT UNIQUE NOT NULL,
    niche_id             UUID REFERENCES niches(id) ON DELETE CASCADE,
    title                TEXT,
    channel_id           TEXT,
    channel_title        TEXT,
    view_count           BIGINT  DEFAULT 0,
    views_per_hour       FLOAT   DEFAULT 0.0,
    engagement_score     FLOAT   DEFAULT 0.0,
    breakout_probability FLOAT   DEFAULT 0.0,
    intent_label         TEXT,
    trend_score_7d       FLOAT   DEFAULT 0.0,
    cluster_label        TEXT,
    duration_seconds     INTEGER,
    like_count           INTEGER,
    comment_count        INTEGER,
    tags                 TEXT[]  DEFAULT '{}',
    embedding            VECTOR(384),   -- all-MiniLM-L6-v2 dimensionality
    raw_metadata         JSONB,
    fetched_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_niche       ON videos(niche_id);
CREATE INDEX IF NOT EXISTS idx_videos_channel     ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_view_count  ON videos(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_videos_trend       ON videos(trend_score_7d DESC);
CREATE INDEX IF NOT EXISTS idx_videos_breakout    ON videos(breakout_probability DESC);
CREATE INDEX IF NOT EXISTS idx_videos_fetched_at  ON videos(fetched_at DESC);

-- Approximate-nearest-neighbour index for semantic search over embeddings.
CREATE INDEX IF NOT EXISTS idx_videos_embedding
    ON videos USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── RLS: market data, read-only for authenticated users ─────────────────────
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "videos_read_all" ON videos;
CREATE POLICY "videos_read_all" ON videos
    FOR SELECT USING (auth.role() = 'authenticated');

-- ── Drop the unused legacy video tables ──────────────────────────────────
-- These were never read by app.js or supabase_client.py. Drop them so the
-- schema has exactly one place video data lives.
DROP TABLE IF EXISTS youtube_videos     CASCADE;
DROP TABLE IF EXISTS finance_videos      CASCADE;
DROP TABLE IF EXISTS technology_videos   CASCADE;
DROP TABLE IF EXISTS productivity_videos CASCADE;
