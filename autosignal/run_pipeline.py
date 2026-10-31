"""
run_pipeline.py
===============
Master orchestrator for the YouTube Intelligence Pipeline.
Pipeline order:
  1. metadata_fetch.py      — Collect videos from YouTube API & initial semantic filtering.
  2. channel_expander.py    — Expand and refine the list of channels for future runs.
  3. merge_json.py          — Merge all data sources into one clean, deduplicated dataset.
  4. semantic_research.py   — Compute embeddings, cluster, and apply intelligence layers.
  5. cluster_research.py    — Build and score topic clusters from the enriched dataset.
  6. opportunity_scorer.py  — Apply final scoring models and rank opportunities.
  7. json_to_sqlite.py      — Persist all data and generate categorized reports.

Usage:
  python run_pipeline.py                  # Full pipeline
  python run_pipeline.py --skip-fetch     # Skip API calls, re-run analysis only
  python run_pipeline.py --from semantic  # Start from a specific step
"""

import subprocess
import sys
import time
import logging
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass # Key errors will be raised by the individual scripts

from pipeline_paths import get_paths, resolve_niche

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("PipelineMaster")

ROOT = Path(__file__).resolve().parent
CHECKPOINT_FILE = ROOT / ".pipeline_checkpoint"

# ── Pipeline definition ───────────────────────────────────────────────────────
# Each step: (script_name, description, short_alias)
PIPELINE_STEPS = [
    (
        "metadata_fetch.py",
        "Fetch trending automotive videos from YouTube API and perform initial semantic filtering",
        "fetch",
    ),

    (
        "channel_expander.py",
        "Validate and expand the seed channel list from discovered channels",
        "expand",
    ),
    (
        "merge_json.py",
        "Merge all data sources into one clean, deduplicated dataset",
        "merge",
    ),
   
    (
        "semantic_research.py",
        "Compute embeddings, cluster videos, and apply all intelligence layers",
        "semantic",
    ),
    (
        "cluster_research.py",
        "Build and score topic clusters from the enriched video dataset",
        "cluster",
    ),
    (
        "opportunity_scorer.py",
        "Apply final scoring models and rank all identified opportunities",
        "score",
    ),
    (
        "json_to_sqlite.py",
        "Persist enriched data to database and export categorized reports",
        "report",
    ),
    (
        "feedback_loop.py",
        "Tracks the usage and performance of generated briefs",
        "feedback",
    )
]

# Steps that run nightly (heavy, not creator-specific)
NIGHTLY_STEPS = ["fetch", "merge", "semantic", "cluster", "score", "report"]

# Steps that run per-creator (fast, creator-specific, ~60 seconds)
CREATOR_STEPS = ["feedback"]

STEP_ALIASES = {step[2]: i for i, step in enumerate(PIPELINE_STEPS)}


# ── Pre-flight check ──────────────────────────────────────────────────────────

def preflight_check(steps: list[tuple]) -> bool:
    """Verify all script files exist before starting the pipeline."""
    log.info("Running pre-flight checks...")
    root = Path(__file__).resolve().parent
    all_ok = True

    for script_name, _, _ in steps:
        path = root / script_name
        if not path.exists():
            log.error("  ✗ Missing: %s", script_name)
            all_ok = False
        else:
            log.info("  ✓ Found:   %s", script_name)

    try:
        import sentence_transformers
        import sklearn
        import hdbscan
        log.info("  ✓ ML Dependencies: sentence-transformers, scikit-learn, hdbscan found.")
    except ImportError as e:
        log.warning("  ! ML Dependencies Missing: %s", e)
        log.warning("    (semantic_research.py will fall back to basic logic, but clustering may be degraded)")

    return all_ok


# ── Checkpoint helpers ────────────────────────────────────────────────────────

def _write_checkpoint(alias: str) -> None:
    data = {"last_completed_alias": alias, "timestamp": datetime.now(timezone.utc).isoformat()}
    CHECKPOINT_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    log.info("  ✓ Checkpoint saved -> stage '%s'", alias)

def _read_checkpoint() -> dict:
    if not CHECKPOINT_FILE.exists():
        return {}
    try:
        return json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}

def _clear_checkpoint() -> None:
    if CHECKPOINT_FILE.exists():
        CHECKPOINT_FILE.unlink()


# ── Script runner ─────────────────────────────────────────────────────────────

def run_script(script_name: str, description: str, step_num: str, total: int, script_args: list[str] = None) -> tuple[bool, float]:
    """
    Run a single pipeline script as a subprocess.
    Streams output in real-time to the console.
    Returns True on success, False on failure.
    """
    log.info("")
    log.info("─" * 56)
    log.info("  Step %s: %s", step_num, script_name)
    log.info("  %s", description)
    log.info("─" * 56)

    start_time = time.time()
    root = Path(__file__).resolve().parent
    command = [sys.executable, str(root / script_name)]
    if script_args:
        command.extend(script_args)

    try:
        # subprocess.run with no stdout/stderr capture streams live to console
        result = subprocess.run(
            command,
            check=True,
            text=True,
            cwd=str(root),          # Run from project root so relative paths work
        )
        duration = time.time() - start_time
        log.info("  ✅ Completed in %.1fs\n", duration)
        return True, duration

    except subprocess.CalledProcessError as e:
        duration = time.time() - start_time
        log.error("  ❌ Failed with exit code %d after %.1fs", e.returncode, duration)
        log.error("     Check the output above for the specific error.")
        return False, duration

    except FileNotFoundError:
        log.error("  ❌ Could not find script: %s", script_name)
        log.error("     Make sure you are running from the project root directory.")
        return False, 0.0


# ── Argument parsing ──────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="YouTube Intelligence Pipeline Orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_pipeline.py                   Full pipeline from start
  python run_pipeline.py --skip-fetch      Skip YouTube API calls, re-run analysis
  python run_pipeline.py --from merge      Start after fetching and expanding channels
  python run_pipeline.py --from semantic   Start from semantic_research.py onwards
  python run_pipeline.py --from cluster    Re-run clustering only (fastest)
  python run_pipeline.py --from score      Re-run final opportunity scoring only
  python run_pipeline.py --generate-briefs --brief-channel-id UC...
  python run_pipeline.py --from report     Re-generate reports from existing data
        """,
    )
    parser.add_argument(
        "--skip-fetch",
        action="store_true",
        help="Skip metadata_fetch.py (no API calls)",
    )
    parser.add_argument(
        "--from",
        dest="from_step",
        choices=list(STEP_ALIASES.keys()),
        metavar="STEP",
        help="Start pipeline from a specific step. Choices: "
             + ", ".join(STEP_ALIASES.keys()),
    )
    parser.add_argument(
        "--generate-briefs",
        action="store_true",
        help="Generate content briefs after the main pipeline completes successfully.",
    )
    parser.add_argument(
        "--brief-channel-id",
        type=str,
        default=None,
        help="Channel ID for generating personalized briefs (used with --generate-briefs).",
    )
    parser.add_argument(
        "--brief-count",
        type=int,
        default=3,
        help="Number of briefs to generate (used with --generate-briefs).",
    )
    parser.add_argument(
        "--nightly",
        action="store_true",
        help="Run only the nightly data pipeline (fetch -> score). No brief generation. Used for scheduled runs.",
    )
    parser.add_argument(
        "--creator-mode",
        action="store_true",
        help="Run only creator-specific steps: audit -> personalize -> generate briefs. Fast (~60s). Requires --brief-channel-id.",
    )
    parser.add_argument(
        "--discover-related-channels",
        action="store_true",
        help="Discover high-quality automotive repair channels from seed"
    )
    parser.add_argument(
        "--seed-channel",
        default="UCf3Vtm8OTBsyjJwYfmF2trw", # themechanic868
        help="Seed channel ID or handle for discovery (e.g., 'UCf3Vtm8OTBsyjJwYfmF2trw' or '@themechanic868'). "
             "Using the 'UC...' ID is recommended for accuracy."
    )
    parser.add_argument(
        "--discovery-limit",
        type=int,
        default=20,
        help="Max number of new channels to add from a discovery run."
    )
    parser.add_argument(
        "--setup",
        action="store_true",
        help="Run the interactive first-run setup wizard.",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from the last successful checkpoint (reads .pipeline_checkpoint).",
    )
    parser.add_argument(
        "--niche",
        type=str,
        default="auto",
        choices=["auto", "automotive", "finance", "technology", "productivity"],
        help=(
            "Which niche to run the pipeline for. "
            "'auto' detects from the creator's channel videos (default). "
            "Use a specific value to skip detection and force a niche."
        ),
    )
    return parser.parse_args()


def _run_channel_discovery(args: argparse.Namespace) -> None:
    """Handles the channel discovery and seed file update process."""
    log.info("\n[DISCOVERY] Finding channels recommended with @%s...", args.seed_channel)
    try:
        from channel_discovery import discover_and_validate_seed_channels, generate_seed_channel_config

        discovered = discover_and_validate_seed_channels(
            seed_channel_ids=[args.seed_channel],
            output_dir="./discovery_results",
            min_subscribers=100000,
            validate_repair=True,
            min_repair_ratio=0.5,
            verbose=True
        )

        # Generate config for review
        generate_seed_channel_config(
            discovered,
            output_file="./seed_channels_config.json"
        )

        # Add to pipeline by updating seed_channels.json
        new_ids = {ch["id"] for ch in discovered[:args.discovery_limit]}
        root = Path(__file__).resolve().parent
        seed_file_path = root / "seed_channels.json"

        if seed_file_path.exists():
            try:
                with open(seed_file_path, "r", encoding="utf-8") as f:
                    seed_data = json.load(f)
                existing_ids = set(seed_data.get("channel_ids", []))
            except (json.JSONDecodeError, ValueError):
                log.warning("Seed channel file %s is empty or malformed. Starting fresh.", seed_file_path.name)
                existing_ids = set()
        else:
            seed_data = {"description": "Master list of seed channels for the YouTube Intelligence Pipeline."}
            existing_ids = set()

        added_count = len(new_ids - existing_ids)
        combined_ids = sorted(list(existing_ids.union(new_ids)))

        seed_data["channel_ids"] = combined_ids
        seed_data["last_updated"] = datetime.now(timezone.utc).isoformat()
        seed_data["total_channels"] = len(combined_ids)

        with open(seed_file_path, "w", encoding="utf-8") as f:
            json.dump(seed_data, f, indent=2)

        log.info(f"\n[DISCOVERY] Added {added_count} new channels to {seed_file_path.name} (limit was {args.discovery_limit})")
        log.info(f"[DISCOVERY] Total pipeline channels: {len(combined_ids)}")
    except ImportError:
        log.error("[DISCOVERY] Failed: google-api-python-client is required. Please run: pip install google-api-python-client")
    except Exception as e:
        log.error(f"[DISCOVERY] An error occurred during channel discovery: {e}")

# ── Niche resolution ─────────────────────────────────────────────────────────

def _resolve_pipeline_niche(args: argparse.Namespace) -> str:
    """Resolve 'auto' to a concrete niche before passing to pipeline scripts."""
    channel_id = getattr(args, "brief_channel_id", None)
    return resolve_niche(getattr(args, "niche", "automotive"), channel_id)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    args = parse_args()

    # Intercept setup wizard
    if getattr(args, "setup", False):
        try:
            import onboarding
            onboarding.run_wizard()
            sys.exit(0)
        except ImportError:
            log.critical("onboarding.py not found. Cannot run setup wizard.")
            sys.exit(1)

    # Resolve niche once for the entire run
    active_niche = _resolve_pipeline_niche(args)

    # Log active niche
    log.info("")
    log.info("══ AutoSignal Pipeline ══ Niche: %s ══", active_niche.upper())
    log.info("  Data directory: %s", get_paths(active_niche).base)
    log.info("")

    # Channel discovery (optional, run once or first time)
    if args.discover_related_channels:
        _run_channel_discovery(args)

    # ── Hybrid architecture mode handling ──
    # --nightly: runs heavy pipeline steps (nightly job)
    # --creator-mode: runs only brief generation (fast, on-demand per creator)
    if args.creator_mode:
        if not args.brief_channel_id:
            log.critical("--creator-mode requires --brief-channel-id. Example: --creator-mode --brief-channel-id UC...")
            sys.exit(1)
        log.info("")
        log.info("══ CREATOR MODE (fast, on-demand) ══")
        log.info("Running: channel audit -> personalization -> brief generation")
        log.info("Channel: %s", args.brief_channel_id)
        log.info("")
        args.generate_briefs = True
        args.from_step = "feedback"  # Skip all nightly steps
        args.skip_fetch = True

    # Determine which steps to run
    steps = list(PIPELINE_STEPS)
    if args.nightly:
        # Nightly mode: only run data pipeline steps, no brief generation
        steps = [s for s in PIPELINE_STEPS if s[2] in NIGHTLY_STEPS]
        log.info("══ NIGHTLY MODE: Running %d data pipeline steps ══", len(steps))
        args.generate_briefs = False

    if args.skip_fetch:
        steps = [(s, d, a) for s, d, a in steps if a != "fetch"]
        log.info("--skip-fetch: Skipping YouTube API collection steps.")

    if args.from_step:
        start_idx = STEP_ALIASES.get(args.from_step, 0)
        steps = steps[start_idx:]
        log.info("--from %s: Starting at step %d.", args.from_step, start_idx + 1)

    # ── Checkpoint resume ──────────────────────────────────────────
    if getattr(args, "resume", False):
        checkpoint = _read_checkpoint()
        last_alias = checkpoint.get("last_completed_alias")
        if last_alias and last_alias in STEP_ALIASES:
            resume_idx = STEP_ALIASES[last_alias] + 1
            steps = [s for s in PIPELINE_STEPS if STEP_ALIASES.get(s[2], -1) >= resume_idx]
            if steps:
                log.info(
                    "Resuming from checkpoint: last completed '%s' at %s. Skipping to step %d.",
                    last_alias, checkpoint.get("timestamp", "?"), resume_idx + 1
                )
            else:
                log.info("All steps already completed per checkpoint.")
                sys.exit(0)
        else:
            log.warning("No valid checkpoint found — running full pipeline.")

    log.info("")
    log.info("══════════════════════════════════════════════════════")
    log.info("   YouTube Intelligence Pipeline")
    log.info("   Running %d of %d steps", len(steps), len(PIPELINE_STEPS))
    log.info("══════════════════════════════════════════════════════")

    # Pre-flight: verify all scripts exist
    if not preflight_check(steps):
        log.critical("Pre-flight failed. Fix missing files then retry.")
        sys.exit(1)

    total_start = time.time()
    results = []

    # Start pipeline_run row in Supabase (non-fatal if Supabase isn't configured yet)
    _run_id = None
    try:
        from supabase_client import start_pipeline_run
        _run_id = start_pipeline_run(
            run_type="nightly" if getattr(args, "nightly", False) else "manual",
            niche_slug=args.niche if args.niche != "auto" else None,
        )
    except Exception:
        pass

    for i, (script_name, description, alias) in enumerate(steps, start=1):
        script_args = [active_niche]

        success, duration = run_script(script_name, description, f"{i}/{len(steps)}", len(steps), script_args=script_args)
        results.append((script_name, success, duration))

        if success:
            _write_checkpoint(alias)
        else:
            log.critical("")
            log.critical("Pipeline aborted at step %d/%d: %s", i, len(steps), script_name)
            log.critical("Fix the error then re-run:")
            log.critical("  python run_pipeline.py --resume   (continue from checkpoint)")
            log.critical("  python run_pipeline.py --from %s  (manual step select)", alias)
            _print_summary(results, success=False)
            sys.exit(1)

    total_duration = time.time() - total_start

    # --- Optional: Brief Generation ---
    # TODO: pass niche=args.niche through to brief_personalizer and brief_generator
    # This is handled automatically via the creator_profile["niche"] field set by run_audit()
    success = all(res[1] for res in results)
    if success and args.generate_briefs:
        brief_args = ["--count", str(args.brief_count), "--save", "--niche", active_niche]
        if args.brief_channel_id:
            brief_args.append("--channel")
            brief_args.append(args.brief_channel_id)
        brief_success, brief_duration = run_script(
            "brief_generator.py",
            "Generate content briefs from cluster intelligence",
            "Briefs",
            len(steps) + 1,
            script_args=brief_args
        )
        results.append(("brief_generator.py", brief_success, brief_duration))
        total_duration += brief_duration

    if success:
        _clear_checkpoint()

    # Finish pipeline_run row in Supabase
    if _run_id:
        try:
            from supabase_client import finish_pipeline_run
            step_stats = {s: {"ok": ok, "duration_s": round(d, 1)} for s, ok, d in results}
            finish_pipeline_run(
                _run_id,
                status="success" if success else "failed",
                stats={"steps": step_stats, "total_seconds": round(total_duration, 1)},
            )
        except Exception:
            pass

    _print_summary(results, success=success, total=total_duration, niche=active_niche)

    # Log run mode for clarity
    if getattr(args, 'creator_mode', False):
        log.info("")
        log.info("══ CREATOR MODE COMPLETE ══")
        log.info("  Briefs generated for channel: %s", args.brief_channel_id)
        log.info("  Check briefs_*.json or Supabase 'briefs' table for results.")
    elif getattr(args, 'nightly', False):
        log.info("")
        log.info("══ NIGHTLY RUN COMPLETE ══")
        log.info("  Cluster data refreshed. Creator brief generation ready.")
        log.info("  Schedule: python run_pipeline.py --nightly")


def _print_summary(
    results: list[tuple],
    success: bool,
    total: float = 0.0,
    niche: str = "automotive",
) -> None:
    """Print a clean step-by-step summary at the end."""
    log.info("")
    log.info("══════════════════════════════════════════════════════")
    log.info("  PIPELINE SUMMARY")
    log.info("══════════════════════════════════════════════════════")

    for script_name, step_ok, duration in results:
        status = "✅" if step_ok else "❌"
        log.info("  %s  %-40s %.1fs", status, script_name, duration)

    log.info("──────────────────────────────────────────────────────")
    if success:
        paths = get_paths(niche)
        log.info("  🎉 All steps completed in %.1f minutes", total / 60)
        log.info("")
        log.info("  Outputs written under: %s", paths.base)
        log.info("    -> merged_videos_semantic.json  (enriched video dataset)")
        log.info("    -> video_clusters_semantic.json (ranked topic clusters)")
        log.info("    -> youtube.db                    (SQLite database)")
        log.info("    -> categorized_videos/          (subniche breakdowns)")
        log.info("    -> briefs_*.json                (generated content briefs)")
    else:
        log.info("  ❌ Pipeline did not complete. See error above.")
    log.info("══════════════════════════════════════════════════════")


if __name__ == "__main__":
    main()