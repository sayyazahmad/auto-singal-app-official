-- ============================================================
-- AutoSignal — Supabase Schema Migration
-- Migration: 002_niche_tables.sql
-- Adds separate video tables for: Finance, Technology, Productivity
-- ============================================================
-- How to apply:
--   1. Open your Supabase project dashboard
--   2. Go to SQL Editor
--   3. Paste this entire file and click Run
--   (Run AFTER 001_initial_schema.sql)
-- ============================================================

-- ── Shared base columns (same schema as youtube_videos) ───────────────────────

-- ── Finance Videos ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_videos (
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
    subniche             TEXT,     -- investing_basics, stock_market, crypto_defi, etc.
    fetched_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_videos_cluster      ON finance_videos(cluster_label);
CREATE INDEX IF NOT EXISTS idx_finance_videos_view_count   ON finance_videos(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_finance_videos_trend_score  ON finance_videos(trend_score_7d DESC);
CREATE INDEX IF NOT EXISTS idx_finance_videos_breakout     ON finance_videos(breakout_probability DESC);
CREATE INDEX IF NOT EXISTS idx_finance_videos_subniche     ON finance_videos(subniche);
CREATE INDEX IF NOT EXISTS idx_finance_videos_fetched_at   ON finance_videos(fetched_at DESC);


-- ── Technology Videos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS technology_videos (
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
    subniche             TEXT,     -- ai_tools, software_tutorials, coding_dev, etc.
    fetched_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tech_videos_cluster      ON technology_videos(cluster_label);
CREATE INDEX IF NOT EXISTS idx_tech_videos_view_count   ON technology_videos(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_tech_videos_trend_score  ON technology_videos(trend_score_7d DESC);
CREATE INDEX IF NOT EXISTS idx_tech_videos_breakout     ON technology_videos(breakout_probability DESC);
CREATE INDEX IF NOT EXISTS idx_tech_videos_subniche     ON technology_videos(subniche);
CREATE INDEX IF NOT EXISTS idx_tech_videos_fetched_at   ON technology_videos(fetched_at DESC);


-- ── Productivity Videos ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productivity_videos (
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
    subniche             TEXT,     -- time_management, note_taking_pkm, habits_routines, etc.
    fetched_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_videos_cluster      ON productivity_videos(cluster_label);
CREATE INDEX IF NOT EXISTS idx_prod_videos_view_count   ON productivity_videos(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_prod_videos_trend_score  ON productivity_videos(trend_score_7d DESC);
CREATE INDEX IF NOT EXISTS idx_prod_videos_breakout     ON productivity_videos(breakout_probability DESC);
CREATE INDEX IF NOT EXISTS idx_prod_videos_subniche     ON productivity_videos(subniche);
CREATE INDEX IF NOT EXISTS idx_prod_videos_fetched_at   ON productivity_videos(fetched_at DESC);


-- ── Creator Profiles: add niche columns ──────────────────────────────────────
-- Add niche tracking to existing creator_profiles table
ALTER TABLE creator_profiles
    ADD COLUMN IF NOT EXISTS detected_niche       TEXT DEFAULT 'automotive',
    ADD COLUMN IF NOT EXISTS niche_confidence     FLOAT DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS niche_confirmed      BOOLEAN DEFAULT FALSE;  -- True if creator manually confirmed/overrode

CREATE INDEX IF NOT EXISTS idx_creator_profiles_niche ON creator_profiles(detected_niche);


-- ── Briefs: add niche column ──────────────────────────────────────────────────
ALTER TABLE briefs
    ADD COLUMN IF NOT EXISTS niche TEXT DEFAULT 'automotive';

CREATE INDEX IF NOT EXISTS idx_briefs_niche ON briefs(niche);


-- ── Brief Performance: add niche column ───────────────────────────────────────
ALTER TABLE brief_performance
    ADD COLUMN IF NOT EXISTS niche TEXT DEFAULT 'automotive';


-- ── Enable RLS on new tables ──────────────────────────────────────────────────
ALTER TABLE finance_videos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE technology_videos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE productivity_videos ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read niche video data (it's market data, not PII)
CREATE POLICY "finance_videos_read_all" ON finance_videos
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "technology_videos_read_all" ON technology_videos
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "productivity_videos_read_all" ON productivity_videos
    FOR SELECT USING (auth.role() = 'authenticated');


-- ── Cross-niche performance summary view ─────────────────────────────────────
-- Extends the view from 001 to include niche breakdown
CREATE OR REPLACE VIEW creator_niche_performance AS
SELECT
    cp.channel_id,
    cp.channel_name,
    cp.detected_niche,
    cp.niche_confidence,
    cp.creator_tier,
    cp.subscriber_count,
    cp.avg_views,
    COUNT(DISTINCT b.id)          AS total_briefs_generated,
    COUNT(DISTINCT bp.id)         AS total_briefs_evaluated,
    AVG(bp.performance_ratio)     AS avg_performance_ratio,
    SUM(CASE WHEN bp.verdict = 'OUTPERFORMED'   THEN 1 ELSE 0 END) AS outperformed_count,
    SUM(CASE WHEN bp.verdict = 'MATCHED'         THEN 1 ELSE 0 END) AS matched_count,
    SUM(CASE WHEN bp.verdict = 'UNDERPERFORMED'  THEN 1 ELSE 0 END) AS underperformed_count
FROM creator_profiles cp
LEFT JOIN briefs           b  ON b.channel_id  = cp.channel_id
LEFT JOIN brief_performance bp ON bp.channel_id = cp.channel_id
GROUP BY
    cp.channel_id, cp.channel_name, cp.detected_niche, cp.niche_confidence,
    cp.creator_tier, cp.subscriber_count, cp.avg_views;
