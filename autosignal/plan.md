# AutoSignal — Pipeline Quality Upgrade Plan

> **Mission:** Make data quality and brief quality **excellent**. Every brief a
> creator receives must be built on genuinely viral / breakout / proven-evergreen
> videos, not average evergreen filler. The pipeline must self-adapt to any niche
> without manual threshold tuning, and never do redundant API work.

---

## 1. Product Overview (what we're working on)

AutoSignal is a YouTube content-intelligence SaaS. A 7-stage pipeline crawls
YouTube, filters and scores videos, clusters them into topic opportunities, and
generates AI content briefs for creators.

**Pipeline stages** (`run_pipeline.py`):
1. `metadata_fetch.py` — discover & semantically filter videos (YouTube API)
2. `channel_expander.py` — validate discovered channels, expand seed list
3. `merge_json.py` — dedup + freshness merge into one dataset
4. `semantic_research.py` — embeddings, clustering, intelligence layers
5. `cluster_research.py` — build & rank topic clusters
6. `opportunity_scorer.py` — final 4-signal opportunity ranking
7. `json_to_sqlite.py` — persist to SQLite + categorized reports

**Niches:** automotive, finance, technology, productivity (each has its own
config in `niche_config.py` — centroids, subniches, seasonal calendar, seeds).

**Core thesis:** small-channel **outliers** (videos that massively outperform
their channel's average) are the signal the product sells on.

---

## 2. Current State Assessment (audited 2026-07-04)

### What's working ✅
| Niche | Discovered | Survived | Clusters | Strong outliers | Leakage |
|---|---|---|---|---|---|
| automotive | — | 79 | 16 | 4 | none |
| finance | 400 | 45 | 9 | 14 | none |
| technology | 1035 | 150 | 9 | 16 | none |
| productivity | 746 | 56 | 9 | 22 | none |

- 100% field completeness on all scoring-critical fields.
- Healthy score spread (3.0–4.2 between min/max analysis_score_10).
- Topic taxonomy is correctly niche-scoped (no automotive leakage into finance).
- No title noise / no wrong-language garbage.

### What's broken ❌
1. **Brief generation was 100% broken** — invalid Gemini API key. All
   `output/briefs_*.json` files had `valid_count=0` with `400 API_KEY_INVALID`.
2. **No winner/performance filter** — the pipeline admitted ANY on-niche video
   with >1K views. Result: **77% of automotive videos were slow evergreen**
   (<10 VPH), teaching nothing. Briefs built on these teach the wrong lesson.
3. **Code bug B3** — `channel_expander.py` read a non-existent root-level
   `discovered_channels.json` instead of the per-niche file, so channel
   expansion saw an empty list every run for every niche.
4. **Code bug B1** — `json_to_sqlite.py` had hardcoded automotive category
   queries (diagnostics / diy_auto_repair / diesel_truck subniches) that return
   empty for finance/technology/productivity.
5. **Code bug B2** — `opportunity_scorer.py` carried a dead hardcoded
   `SEASONAL_CALENDAR` (keys: battery/cooling/ac_hvac) that never matched the
   niche_config centroids. Masked by `get_seasonal_multiplier()`, but a footgun.
6. **No "already fetched" guard** — `metadata_fetch` re-crawls every channel
   every run regardless of how recently it was processed (quota waste).

---

## 3. The Plan — in execution order

### ✅ DONE — Fix Gemini API key (blocks all briefs)
- Replaced the dead key (`AIzaSy...2kw`) with a working one (`AQ.Ab8RN6...`).
- Verified: `gemini-2.5-flash` returns "OK"; YouTube API returns 200.
- `.env` now holds working `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `YOUTUBE_API_KEY`.

### ✅ DONE — Fix B3: channel_expander per-niche path
- `_discovered_file_for(niche)` resolves `data/<niche>/discovered_channels.json`.
- `main()` now reads the per-niche file. Verified all 4 niches resolve correctly.

### ✅ DONE — Winner Policy (distribution-derived, NOT hardcoded)
Replaced the original fixed-threshold idea with a **self-adapting** design:

A video is admitted if ANY is true:
1. **Viral** — VPH in the top **15%** of its age bucket, threshold computed from
   **this run's** candidate distribution. Auto-adapts: automotive `established`
   floor = 195 VPH; technology `fresh` floor = 1750 VPH. No manual tuning.
2. **Outlier** — views ≥ **3×** channel average (catches small-channel breakouts).
3. **Evergreen winner** — age > **180d** AND views ≥ **5×** channel average.

Implementation:
- Removed the per-video `_is_winner`; added batch `apply_winner_policy()`.
- Gate 7 removed from `passes_admission_gates` (now a separate second pass).
- `main()` collects gates-1–6 survivors → `apply_winner_policy` → `final_dataset`.
- `_percentile()` helper (linear interpolation) computes per-bucket thresholds.
- `MIN_BUCKET_SIZE_FOR_VIRAL = 5` — tiny buckets skip the viral rule (no noise).
- Graceful degradation: no `channel_avg_views` → only viral rule can fire.

**Validated against existing data:**
| Niche | candidates | winners | rejected |
|---|---|---|---|
| automotive | 96 | 21 | 75 |
| finance | 45 | 18 | 27 |
| technology | 150 | 35 | 115 |
| productivity | 56 | 26 | 30 |

### ✅ DONE — Configurable refresh interval
- `niche_config.py`: each niche has `refresh_interval_days` (auto 3, finance 7,
  technology 3, productivity 7). Default 7.
- Added `get_refresh_interval_days(niche)` helper.

### 🔲 TODO — Skip-already-fetched guard in metadata_fetch
- Read `discovered_channels.json` per niche; check `discovered_at` timestamp.
- Channels crawled within `refresh_interval_days` are skipped (quota saved).
- Brand-new channels still always crawled. The interval is configurable per niche.

### 🔲 TODO — Fix B1: niche-aware categorized reports
- `json_to_sqlite.export_categorized_videos()` has hardcoded automotive category
  queries (diagnostics / diy_auto_repair / diesel_truck subniches).
- Replace with niche-aware categories derived from `niche_config.subniches` +
  universal categories (top-by-views, top-by-VPH, outliers, how-to, recent-viral).

### 🔲 TODO — Fix B2: remove dead SEASONAL_CALENDAR
- Delete the hardcoded `SEASONAL_CALENDAR` dict in `opportunity_scorer.py`.
- `_compute_seasonal_score` already uses `get_seasonal_multiplier()` from
  niche_config; the dead dict is misleading and a latent footgun.

### 🔲 TODO — Re-run full pipeline for all 4 niches
- `python run_pipeline.py --niche <niche> --nightly` for each.
- Confirms the winner policy + fixes produce clean, brief-worthy datasets.
- Re-run `tests/full_audit.py` to verify quality bars.

### 🔲 TODO — Generate & audit briefs for all niches
- With the working Gemini key, generate briefs per niche.
- Audit brief quality: are titles/hooks/thumbnail directions specific, actionable,
  and grounded in the cluster's actual outlier videos?

### 🔲 TODO — Honest project rating + improvement suggestions
- Delivered at the end after all fixes are verified.

---

## 4. Key Design Decisions (the "why")

- **Distribution-derived thresholds, not hardcoded numbers.** Fixed VPH floors
  (100/50/30) would drift as niches are added. Top-15%-per-age-bucket adapts
  automatically: gaming's "viral" ≠ woodworking's "viral".
- **Winner = viral OR outlier OR evergreen-winner.** Three winner types because
  the product thesis is multi-modal: trending breakouts (viral), small-channel
  surprises (outlier), and durable search demand (evergreen winner). Average
  evergreen — the 77% — is the noise we cut.
- **Second-pass architecture.** The viral threshold needs the full candidate
  pool, so the winner policy can't be a per-video gate. It runs after gates 1–6.
- **Configurable refresh.** High-priority niches (3d) vs low-activity (14d) lets
  you spend quota where velocity matters.
- **Graceful degradation preserved.** Missing channel baseline → only viral rule
  fires (never silently admit junk, never falsely reject unmeasurable outliers).

---

## 5. File Change Log

| File | Change | Status |
|---|---|---|
| `.env` | Working Gemini + YouTube keys | ✅ |
| `channel_expander.py` | Per-niche discovered file path (B3) | ✅ |
| `metadata_fetch.py` | Winner policy config + `apply_winner_policy()` + rewired `main()` | ✅ |
| `niche_config.py` | `refresh_interval_days` per niche + helper | ✅ |
| `metadata_fetch.py` | Skip-already-fetched guard | 🔲 |
| `json_to_sqlite.py` | Niche-aware categorized reports (B1) | 🔲 |
| `opportunity_scorer.py` | Remove dead `SEASONAL_CALENDAR` (B2) | 🔲 |
| `tests/full_audit.py` | Cross-niche audit harness (new) | ✅ |
