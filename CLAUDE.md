# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**AutoSignal Intelligence Studio** — a YouTube content-intelligence dashboard (originally a Google AI Studio applet; see `metadata.json`). Two layers live in one repo:

- **Root app (active):** Express + Vite + React 19 + Tailwind 4, all TypeScript. `server.ts` is the backend; `src/App.tsx` is the entire UI (one ~4.8k-line component).
- **`autosignal/` (Python pipeline + legacy frontends):** the multi-step analytics pipeline the root server shells out to, plus older standalone frontends and a Remotion promo video. It has its own `package.json`, `requirements.txt`, `.gitignore` and CI (`.gitlab-ci.yml`), and is excluded from the root `tsconfig.json`.

## Commands

Root (run from repo root):

```bash
npm install --legacy-peer-deps
npm run dev      # tsx server.ts — Express with Vite middleware, http://localhost:3000
npm run lint     # tsc --noEmit (the only lint/type check; there are no JS tests)
npm run build    # vite build -> dist/
NODE_ENV=production npm start   # serves dist/ statically instead of Vite middleware
```

Port defaults to 3000 (`--port`/`APP_PORT` override; `PORT` is deliberately ignored — in AI Studio it's the nginx proxy port 8080). Set `DISABLE_HMR=true` to turn off HMR/file watching (AI Studio convention; don't remove that logic in `vite.config.ts`).

Python pipeline (run from `autosignal/`):

```bash
pip install -r requirements.txt                       # needs Python 3.12; torch/sentence-transformers are heavy; pipeline degrades without them
python run_pipeline.py                                # full pipeline
python run_pipeline.py --skip-fetch                   # re-run analysis without YouTube API calls
python run_pipeline.py --from semantic <niche>        # resume from a step alias
python -m pytest tests/test_scoring_and_gates.py -v   # unit tests (or run the file directly; no pytest needed)
python -m pytest tests/test_scoring_and_gates.py -v -k <name>   # single test
python tests/full_audit.py                            # cross-niche data-quality audit; non-zero exit on failure
python seed_pipeline_data.py                          # regenerate synthetic benchmark data for the 4 niches
ruff check --select E9,F63,F7,F82 .                   # the blocking lint used in CI
```

Step aliases for `--from`: `fetch, expand, merge, semantic, cluster, score, report, feedback`.

## Environment

`.env` (loaded by `dotenv` in `server.ts` and by `python-dotenv` in the scripts):
- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) — brief generation. Python uses the new `google-genai` package, not `google-generativeai`.
- `YOUTUBE_API_KEY` / `YOUTUBE_API_KEY_1` — YouTube Data API v3. Can also be set at runtime via `POST /api/config/keys` (held in memory only).
- `APP_URL` — injected by AI Studio.
- `PYTHON_BIN` — interpreter `server.ts` uses for pipeline scripts (default `python3`).
- `GEMINI_MODEL` — model for every Gemini call (default `gemini-3.1-flash-lite`, the cheapest).
- `YOUTUBE_DAILY_UNIT_BUDGET` — cap on YouTube quota units the live research spends per day (default 2000). Usage and the 24h research cache live in `.cache/` (gitignored).

Keys can also be entered in Settings → API Keys: `POST /api/config/keys` checks them with Google, then upserts them into `.env` (localhost requests only).

`vite.config.ts` excludes `.venv-py312/` and `autosignal/` from the dev watcher. Without that, crawling the Python env makes the dev server hang.

## Architecture

**Data flow.** The pipeline writes per-niche JSON artifacts to `autosignal/data/<niche>/` (paths defined once in `autosignal/pipeline_paths.py`): `top_100_videos.json → merged_videos.json → merged_videos_semantic.json → video_clusters_semantic.json → opportunities.json`, plus `channel_metadata.json`, `discovered_channels.json`, `discarded_videos.json`. Generated briefs go to `autosignal/output/briefs_*.json`. The root server reads these files directly — there is no database in the active path.

**`server.ts` routes** (all consumed by `src/App.tsx` via `fetch`):
- `GET /api/niches`, `GET /api/data/:niche` — read the niche's JSON files and merge briefs from the 15 newest `output/*.json` files plus an in-memory `MEMORY_BRIEFS` cache, deduped by `brief_id`.
- `POST /api/pipeline/run-step` — maps a `stepId` to a Python script and `spawn('python3', ...)`s it with `cwd: autosignal/`. If `metadata_fetch` is requested without a YouTube key, or a script fails (e.g. missing ML deps), it falls back to `seed_pipeline_data.py`.
- `POST /api/briefs/generate`, `POST /api/youtube/search-and-save` — call Gemini/YouTube directly from Node (search-and-save also writes back into `merged_videos_semantic.json`).
- `GET /api/python-code/:filename` — returns pipeline source for the in-app code viewer (`path.basename` guards traversal).

**Video Studio (`src/VideoStudio.tsx`).** Self-contained component rendered by App for `appMode === 'video-studio'`:
- **Tabs:** Create (prompt bar, single model `gemini-omni-1.1-flash`), Templates (20 templates in 4 categories, each with a drawn `TemplatePreview` layout; one-page editor + JSON package export), Clips (link/upload/outlier source + subtitle/effect settings).
- **Not wired yet:** generation, rendering and clipping. Generate and Find clips save drafts to `localStorage`.
- **Opening it from elsewhere:** other views open a specific tab via `studioRequest` → `openRequest` prop.

**Channel Analytics (`src/ChannelAnalytics.tsx`, `channelAnalytics.ts`, charts in `src/charts.tsx`).**
- **Owner mode:** Google OAuth with `YOUTUBE_OAUTH_CLIENT_ID`/`_SECRET` (web client; redirect `http://localhost:<port>/api/channel/oauth/callback`). Tokens are stored in `.cache/youtube_oauth.json`. It reads the YouTube Analytics API (daily views/watch time/subs, traffic sources, top videos) and `estimatedRevenue`, which needs the monetary scope and a YPP channel.
- **Public mode:** `/api/channel/public?q=@handle` with the API key, about 3 units per lookup.
- **Access:** all `/api/channel/*` except `/public` is localhost-only. Analytics are cached for 1 hour.
- **Chart colors:** `--chart-*` CSS vars in `index.css`, validated for CVD per mode; keep charts single-series green, with de-emphasis gray as the only second color.

**Styling.** Colors come from two token scales defined in `src/index.css` `@theme`: `ink-*` (green-tinted neutrals, incl. `ink-850`) and `brand-*` (forest green accent). Use those classes, not hex values or Tailwind's stock grays. Dark mode is a `.dark` class on `<html>` toggled by `isDarkMode` (`@custom-variant dark` makes `dark:` follow it, not the OS). Accent text uses `text-brand-600 dark:text-brand-300`. Fonts are IBM Plex Sans/Mono.

**Live research (`liveResearch.ts`).** Used only when both `YOUTUBE_API_KEY` and `GEMINI_API_KEY` are set:
- **Flow:** one niche-wide YouTube search (most-viewed, last 30 days, `videoDuration=medium`, niche's `videoCategoryId` where one fits); a requested topic only steers the Gemini prompt, it is never searched → each channel's baseline = median views of its recent uploads → outlier ratio → top 12 sent to Gemini with a `responseSchema` matching `BriefItem`.
- **Entry points:** `POST /api/ideas/live` (Simple Idea's "Refresh Winning Idea"), and `POST /api/briefs/generate` tries it first, falling back to the old topic-only path and returning `liveError` if it fails.
- **Untouched:** `/api/youtube/search-and-save` is intentionally left as is.
- **Live briefs** add `why_it_works`, `pattern_insights`, `research`; live opportunities set `live: true` and `search_gap_percent` = share of outliers from channels under 100K subs.
- **Quota:** each run costs ~105–210 of the 10,000 daily YouTube quota units.

**Benchmark fallback is pervasive.** When a niche's files are missing or empty, `server.ts` substitutes synthetic data from `generateNicheBenchmarkData()`, and the Gemini/YouTube endpoints return canned results when keys are absent. So the UI "works" with no keys and no data — check whether you're looking at real or benchmark data before trusting what it shows.

**Niche registries are duplicated and out of sync.** `server.ts` hard-codes 20 niches (`VALID_NICHES` / `NICHE_META`), but the Python pipeline only knows the niches in `autosignal/niche_config.py` (automotive, finance, technology, productivity) — the others exist only as server-side benchmark data. `niche_config.py` is the source of truth for Python (centroids, subniches, seasonal calendar, seed channels, Gemini prompt add-ons). Adding a real niche means editing both.

**Python pipeline order** (`run_pipeline.py`, with a `.pipeline_checkpoint` file for resume): `metadata_fetch` (YouTube discovery + admission gates) → `channel_expander` → `merge_json` → `semantic_research` (embeddings/HDBSCAN; falls back when `HAS_TRANSFORMER`/`HAS_SKLEARN`/`HAS_HDBSCAN` are false) → `cluster_research` → `opportunity_scorer` → `json_to_sqlite` → `feedback_loop`. Shared scoring lives in `shared_utils.py`. Most scripts take the niche as the first positional arg (default `automotive`); `brief_generator.py` uses `--niche`, `--count`, `--save`. The product's core signal is small-channel **outliers** (`outperformance_ratio` ≥ 3); `autosignal/plan.md` documents known pipeline bugs and the quality-upgrade plan.

**Legacy / not wired to the root app:** `autosignal/server.js` (Express on 8787, Railway deploy target), `autosignal/dev_server.py`, the static `autosignal/*.html` + `app.js` frontends, `autosignal/supabase*` (optional Supabase persistence), and the Remotion video in `autosignal/src/video/` (`npm run studio` / `npm run render` inside `autosignal/`; design in `autosignal/DESIGN.md`). Loose scripts like `fix.cjs`, `fix2.cjs`, `temp.js`, `check.cjs` are one-offs.

## Deploying to Vercel

**Setup:**
- `vercel.json` builds the frontend into `dist/` with `npm run build`, using `--legacy-peer-deps` for the install.
- It rewrites `/api/*` to `api/index.ts`, which re-exports the Express app from `server.ts`. `server.ts` only calls `startServer()` when `VERCEL` is unset.
- All other paths fall back to `index.html`.
- The function bundles `autosignal/{data,output}/**` via `includeFiles`.

**Limits when `VERCEL` is set:**
- Pipeline steps skip Python and return the saved-data summary.
- File writes go through `persistJson`, which only logs on the read-only filesystem, so new briefs live in memory per instance.
- The live-research cache and quota file are in `/tmp`.
- `/api/channel/*` OAuth is localhost-only, so the deployed site shows the sample dashboard and the public lookup.
- Settings → API Keys doesn't write `.env`. Set `GEMINI_API_KEY` and `YOUTUBE_API_KEY` in the Vercel project's environment variables.

**Imports:** relative imports between server files use `.js` specifiers so they resolve after Vercel compiles them.

## Gotchas

- The server spawns `PYTHON_BIN` (default `python3`) for pipeline steps. The `requirements.txt` pins only install on Python 3.12, so point `PYTHON_BIN` at a 3.12 interpreter. If it's missing or lacks the deps, steps fail and silently fall back to seeded data.
- Root `npm install` needs `--legacy-peer-deps`: vite 8's optional esbuild peer conflicts with the pinned dev dep `esbuild@^0.25`.
- `autosignal/.gitignore` ignores `data/**/*.json`, but the four real niches' data files are committed anyway. Changes to them show up as diffs.
