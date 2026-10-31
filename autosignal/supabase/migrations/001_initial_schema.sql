-- ============================================================
-- AutoSignal — Supabase Database Schema
-- Migration: 001_initial_schema.sql
-- ============================================================
-- How to apply:
--   1. Open your Supabase project dashboard
--   2. Go to SQL Editor
--   3. Paste this entire file and click Run
-- ============================================================

-- ── Enable UUID generation ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ── Creator Profiles ──────────────────────────────────────────────────────────
-- Stores audited creator profiles. Re-running an audit upserts the row.
-- Cached profiles make brief generation near-instant for returning creators.
CREATE TABLE IF NOT EXISTS creator_profiles (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id       TEXT UNIQUE NOT NULL,
    channel_name     TEXT,
    subscriber_count INTEGER      DEFAULT 0,
    creator_tier     TEXT         DEFAULT 'rising',   -- micro / rising / established / major
    avg_views        INTEGER      DEFAULT 0,
    primary_subniche TEXT,
    profile_json     JSONB,                           -- full CreatorProfile dict
    last_audited_at  TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_profiles_channel_id ON creator_profiles(channel_id);
CREATE INDEX IF NOT EXISTS idx_creator_profiles_tier       ON creator_profiles(creator_tier);


-- ── Generated Briefs ──────────────────────────────────────────────────────────
-- Every brief generated for any creator is stored here.
-- Enables cross-device access and historical brief tracking.
CREATE TABLE IF NOT EXISTS briefs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id       TEXT REFERENCES creator_profiles(channel_id) ON DELETE CASCADE,
    cluster_label    TEXT,
    opportunity_score FLOAT DEFAULT 0.0,
    brief_json       JSONB,                           -- full brief object from Gemini
    generated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_briefs_channel_id    ON briefs(channel_id);
CREATE INDEX IF NOT EXISTS idx_briefs_generated_at  ON briefs(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_briefs_opp_score     ON briefs(opportunity_score DESC);


-- ── Brief Performance (Feedback Loop) ────────────────────────────────────────
-- Populated by feedback_loop.py after 48 hours.
-- verdict: OUTPERFORMED (>1.5x avg), MATCHED (0.8-1.5x), UNDERPERFORMED (<0.8x)
CREATE TABLE IF NOT EXISTS brief_performance (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brief_id           UUID REFERENCES briefs(id) ON DELETE CASCADE,
    channel_id         TEXT,
    video_id           TEXT,
    views_48h          INTEGER    DEFAULT 0,
    creator_avg_views  INTEGER    DEFAULT 0,
    performance_ratio  FLOAT      DEFAULT 0.0,
    verdict            TEXT,      -- OUTPERFORMED / MATCHED / UNDERPERFORMED
    checked_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brief_perf_channel_id ON brief_performance(channel_id);
CREATE INDEX IF NOT EXISTS idx_brief_perf_verdict     ON brief_performance(verdict);
CREATE INDEX IF NOT EXISTS idx_brief_perf_checked_at  ON brief_performance(checked_at DESC);


-- ── YouTube Videos ────────────────────────────────────────────────────────────
-- Replaces the local youtube_automotive.db for production deployments.
-- Nightly pipeline upserts here; brief generation reads from here.
CREATE TABLE IF NOT EXISTS youtube_videos (
    video_id             TEXT PRIMARY KEY,
    title                TEXT,
    channel_id           TEXT,
    channel_title        TEXT,
    view_count           INTEGER   DEFAULT 0,
    views_per_hour       FLOAT     DEFAULT 0.0,
    engagement_score     FLOAT     DEFAULT 0.0,
    breakout_probability FLOAT     DEFAULT 0.0,
    intent_label         TEXT,
    trend_score_7d       FLOAT     DEFAULT 0.0,
    cluster_label        TEXT,
    fetched_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yt_videos_cluster     ON youtube_videos(cluster_label);
CREATE INDEX IF NOT EXISTS idx_yt_videos_view_count  ON youtube_videos(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_yt_videos_trend_score ON youtube_videos(trend_score_7d DESC);
CREATE INDEX IF NOT EXISTS idx_yt_videos_breakout    ON youtube_videos(breakout_probability DESC);
CREATE INDEX IF NOT EXISTS idx_yt_videos_fetched_at  ON youtube_videos(fetched_at DESC);


-- ── Row Level Security (RLS) ──────────────────────────────────────────────────
-- Enable RLS on all tables so creators only see their own data.
-- The service role key (used server-side) bypasses RLS.

ALTER TABLE creator_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE brief_performance  ENABLE ROW LEVEL SECURITY;
-- youtube_videos is read-only for all authenticated users (market data)
ALTER TABLE youtube_videos     ENABLE ROW LEVEL SECURITY;

-- Creators can read/write their own profile
CREATE POLICY "creator_profiles_own" ON creator_profiles
    FOR ALL
    USING (auth.uid()::text = channel_id);

-- Creators can read/write their own briefs
CREATE POLICY "briefs_own" ON briefs
    FOR ALL
    USING (auth.uid()::text = channel_id);

-- Creators can read their own performance records
CREATE POLICY "brief_performance_own" ON brief_performance
    FOR SELECT
    USING (auth.uid()::text = channel_id);

-- YouTube video data is readable by all authenticated users
CREATE POLICY "youtube_videos_read_all" ON youtube_videos
    FOR SELECT
    USING (auth.role() = 'authenticated');


-- ── Helpful views ─────────────────────────────────────────────────────────────

-- Creator performance summary (used by dashboard)
CREATE OR REPLACE VIEW creator_performance_summary AS
SELECT
    cp.channel_id,
    cp.channel_name,
    cp.creator_tier,
    cp.subscriber_count,
    cp.avg_views,
    COUNT(DISTINCT b.id)        AS total_briefs_generated,
    COUNT(DISTINCT bp.id)       AS total_briefs_evaluated,
    AVG(bp.performance_ratio)   AS avg_performance_ratio,
    SUM(CASE WHEN bp.verdict = 'OUTPERFORMED' THEN 1 ELSE 0 END) AS outperformed_count,
    SUM(CASE WHEN bp.verdict = 'MATCHED'      THEN 1 ELSE 0 END) AS matched_count,
    SUM(CASE WHEN bp.verdict = 'UNDERPERFORMED' THEN 1 ELSE 0 END) AS underperformed_count
FROM creator_profiles cp
LEFT JOIN briefs           b  ON b.channel_id  = cp.channel_id
LEFT JOIN brief_performance bp ON bp.channel_id = cp.channel_id
GROUP BY cp.channel_id, cp.channel_name, cp.creator_tier, cp.subscriber_count, cp.avg_views;
