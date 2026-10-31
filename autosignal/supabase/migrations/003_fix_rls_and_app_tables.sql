-- ============================================================
-- AutoSignal — Supabase Schema Migration
-- Migration: 003_fix_rls_and_app_tables.sql
-- ============================================================
-- WHY THIS MIGRATION EXISTS
--
-- Migrations 001/002 enabled Row Level Security with policies that
-- compare auth.uid() (a Supabase Auth UUID) to channel_id (a YouTube
-- channel id like 'UCxxxx'). Those values are NEVER equal, so the
-- policies silently blocked every browser client from its own rows,
-- breaking tenant isolation and the whole frontend data layer.
--
-- This migration:
--   1. Creates the application tables the frontend (app.js) actually
--      queries but that were never committed: profiles, niches,
--      user_tracked_niches, opportunities. (videos/clusters live in
--      004 once the videos-table shape is finalised.)
--   2. Adds the user_id ownership column the app relies on.
--   3. Replaces the broken RLS policies with correct, user_id-based
--      ones, including WITH CHECK clauses on writes.
--
-- Run AFTER 001_initial_schema.sql and 002_niche_tables.sql.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── profiles ───────────────────────────────────────────────────────────────
-- One row per authenticated user. id == auth.users.id.
CREATE TABLE IF NOT EXISTS profiles (
    id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name               TEXT,
    plan_tier               TEXT    DEFAULT 'beta',
    onboarding_completed     BOOLEAN DEFAULT FALSE,
    scan_frequency_hours     INTEGER DEFAULT 24,
    auto_generate_hooks      BOOLEAN DEFAULT FALSE,
    include_competitor_tags  BOOLEAN DEFAULT FALSE,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create a profile row when a new auth user signs up.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── niches ────────────────────────────────────────────────────────────────
-- Public catalog of supported niches (read-only market metadata).
CREATE TABLE IF NOT EXISTS niches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT UNIQUE NOT NULL,   -- 'automotive', 'finance', ...
    name        TEXT NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO niches (slug, name, is_active) VALUES
    ('automotive',   'Automotive Repair',      TRUE),
    ('finance',      'Finance & Investing',    TRUE),
    ('technology',   'Technology & Software',   TRUE),
    ('productivity', 'Productivity & Growth',   TRUE)
ON CONFLICT (slug) DO NOTHING;

-- ── user_tracked_niches ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_tracked_niches (
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    niche_id   UUID NOT NULL REFERENCES niches(id)      ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, niche_id)
);

-- ── opportunities ──────────────────────────────────────────────────────
-- Scored opportunities written by opportunity_scorer.py via supabase_client.
CREATE TABLE IF NOT EXISTS clusters (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    niche_id      UUID REFERENCES niches(id) ON DELETE CASCADE,
    cluster_key   TEXT NOT NULL,
    topic_summary TEXT,
    video_count   INTEGER DEFAULT 0,
    run_id        UUID,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (niche_id, cluster_key)
);

CREATE TABLE IF NOT EXISTS opportunities (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id        UUID REFERENCES clusters(id) ON DELETE CASCADE,
    niche_id          UUID REFERENCES niches(id)   ON DELETE CASCADE,
    demand_score      FLOAT,
    growth_score      FLOAT,
    competition_score FLOAT,
    creator_fit_score FLOAT,
    trend_velocity    FLOAT,
    seasonal_signal   JSONB,
    composite_score   FLOAT DEFAULT 0.0,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_niche      ON opportunities(niche_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_composite  ON opportunities(composite_score DESC);

-- ── creator_profiles: add the real ownership column ──────────────────────────
ALTER TABLE creator_profiles
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_creator_profiles_user_id ON creator_profiles(user_id);

ALTER TABLE briefs
    ADD COLUMN IF NOT EXISTS opportunity_id     UUID,
    ADD COLUMN IF NOT EXISTS brief_type         TEXT DEFAULT 'new_content',
    ADD COLUMN IF NOT EXISTS status             TEXT DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS target_video_id    TEXT,
    ADD COLUMN IF NOT EXISTS seo_tags           TEXT[],
    ADD COLUMN IF NOT EXISTS upload_timing      JSONB,
    ADD COLUMN IF NOT EXISTS model_used         TEXT,
    ADD COLUMN IF NOT EXISTS temperature        FLOAT;

-- ══ RLS: fix the broken policies ═════════════════════════════════════════
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE niches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tracked_niches ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters            ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities       ENABLE ROW LEVEL SECURITY;

-- profiles: a user can see and edit only their own profile row.
DROP POLICY IF EXISTS "profiles_own" ON profiles;
CREATE POLICY "profiles_own" ON profiles
    FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- niches: public read for any authenticated user.
DROP POLICY IF EXISTS "niches_read_all" ON niches;
CREATE POLICY "niches_read_all" ON niches
    FOR SELECT USING (auth.role() = 'authenticated');

-- user_tracked_niches: a user manages only their own tracking rows.
DROP POLICY IF EXISTS "user_tracked_niches_own" ON user_tracked_niches;
CREATE POLICY "user_tracked_niches_own" ON user_tracked_niches
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- clusters + opportunities: market data, read-only for authenticated users.
DROP POLICY IF EXISTS "clusters_read_all" ON clusters;
CREATE POLICY "clusters_read_all" ON clusters
    FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "opportunities_read_all" ON opportunities;
CREATE POLICY "opportunities_read_all" ON opportunities
    FOR SELECT USING (auth.role() = 'authenticated');

-- creator_profiles: replace the broken channel_id policy with user_id ownership.
DROP POLICY IF EXISTS "creator_profiles_own" ON creator_profiles;
CREATE POLICY "creator_profiles_select_own" ON creator_profiles
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "creator_profiles_modify_own" ON creator_profiles
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- briefs: ownership flows through the creator_profile the user owns.
DROP POLICY IF EXISTS "briefs_own" ON briefs;
CREATE POLICY "briefs_own" ON briefs
    FOR ALL
    USING (channel_id IN (SELECT channel_id FROM creator_profiles WHERE user_id = auth.uid()))
    WITH CHECK (channel_id IN (SELECT channel_id FROM creator_profiles WHERE user_id = auth.uid()));

-- brief_performance: read-only for the owning creator.
DROP POLICY IF EXISTS "brief_performance_own" ON brief_performance;
CREATE POLICY "brief_performance_own" ON brief_performance
    FOR SELECT
    USING (channel_id IN (SELECT channel_id FROM creator_profiles WHERE user_id = auth.uid()));
