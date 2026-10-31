"""
onboarding.py
=============
First-run interactive wizard.

Usage:
    python onboarding.py
    python run_pipeline.py --setup

Guides a new user through:
  1. YouTube API key entry
  2. Gemini API key entry
  3. Niche selection (automotive / finance / technology / productivity)
  4. Auto-discovery of seed channels for the selected niche
  5. First pipeline run
  6. First brief generation (shown in terminal)

Target: <5 minutes from clone to first brief.
"""

import json
import os
import sys
import subprocess
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent

# ── ANSI colour helpers ───────────────────────────────────────────────────────

def _c(code: str, text: str) -> str:
    """Wrap text in ANSI colour codes (auto-disabled on Windows without VT support)."""
    return f"\033[{code}m{text}\033[0m"

def _green(t):  return _c("92", t)
def _yellow(t): return _c("93", t)
def _cyan(t):   return _c("96", t)
def _bold(t):   return _c("1",  t)
def _red(t):    return _c("91", t)


# ── Prompt helpers ────────────────────────────────────────────────────────────

def _ask(prompt: str, default: str = "") -> str:
    """Print a styled prompt and return stripped user input."""
    suffix = f" [{default}]" if default else ""
    try:
        val = input(_cyan(f"  ▶ {prompt}{suffix}: ")).strip()
    except (EOFError, KeyboardInterrupt):
        print()
        sys.exit(0)
    return val or default


def _ask_choice(prompt: str, choices: list, default: str = "") -> str:
    """Present a numbered menu and return the selected choice key."""
    print()
    print(_bold(f"  {prompt}"))
    for i, (key, label) in enumerate(choices, 1):
        marker = "●" if key == default else "○"
        print(f"    {i}. {marker} {label}  ({key})")
    print()
    while True:
        raw = _ask("Enter number", default=str(next((i for i, (k, _) in enumerate(choices, 1) if k == default), 1)))
        try:
            idx = int(raw) - 1
            if 0 <= idx < len(choices):
                return choices[idx][0]
        except ValueError:
            pass
        print(_red("  Invalid choice. Enter a number from the list."))


def _confirm(prompt: str, default: bool = True) -> bool:
    suffix = "[Y/n]" if default else "[y/N]"
    raw = _ask(f"{prompt} {suffix}", default="y" if default else "n").lower()
    return raw in ("y", "yes", "")


# ── Step implementations ──────────────────────────────────────────────────────

def _step_api_keys() -> dict:
    """Prompt for and validate API keys. Returns {youtube_key, gemini_key}."""
    print()
    print(_bold("  STEP 1 — API Keys"))
    print("  You need two API keys to run this pipeline:")
    print("   • YouTube Data API v3  -> https://console.cloud.google.com")
    print("   • Google Gemini API    -> https://aistudio.google.com/app/apikey")
    print()

    keys_file = ROOT / "api_keys.txt"
    existing_yt, existing_gem = "", ""
    if keys_file.exists():
        for line in keys_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("YOUTUBE_API_KEY="):
                existing_yt = line.split("=", 1)[1].strip().strip('"').strip("'")
            if line.startswith("GOOGLE_GEMINI_KEY="):
                existing_gem = line.split("=", 1)[1].strip().strip('"').strip("'")

    # Also check environment
    existing_yt  = existing_yt  or os.getenv("YOUTUBE_API_KEY", "")
    existing_gem = existing_gem or os.getenv("GOOGLE_GEMINI_KEY", "")

    yt_key = _ask(
        "YouTube Data API v3 key",
        default=existing_yt or ""
    )
    if not yt_key:
        print(_red("  ✗ YouTube API key is required."))
        sys.exit(1)

    gem_key = _ask(
        "Google Gemini API key",
        default=existing_gem or ""
    )
    if not gem_key:
        print(_red("  ✗ Gemini API key is required."))
        sys.exit(1)

    # Write api_keys.txt
    api_keys_content = (
        f"YOUTUBE_API_KEY={yt_key}\n"
        f"GOOGLE_GEMINI_KEY={gem_key}\n"
    )
    keys_file.write_text(api_keys_content, encoding="utf-8")
    print(_green("  ✓ API keys saved to api_keys.txt"))

    return {"youtube_key": yt_key, "gemini_key": gem_key}


def _step_niche_selection() -> str:
    """Let user pick their content niche. Returns niche key."""
    print()
    print(_bold("  STEP 2 — Content Niche"))
    print("  The pipeline optimises content strategy for a specific niche.")
    print()

    niche_choices = [
        ("automotive",   "🔧  Automotive Repair — car repairs, maintenance, diagnostics"),
        ("finance",      "💰  Finance & Investing — stocks, crypto, budgeting, side hustles"),
        ("technology",   "💻  Technology & Software — AI tools, coding, SaaS reviews"),
        ("productivity", "🚀  Productivity & Growth — habits, Notion, morning routines"),
    ]

    niche = _ask_choice("Which niche best describes your channel?", niche_choices, default="automotive")
    print(_green(f"  ✓ Niche set to: {niche}"))
    return niche


def _step_seed_channels(niche: str) -> list:
    """
    Populate seed_channels.json from niche_config defaults, optionally
    augmented with a user-provided seed channel for discovery.
    Returns list of channel IDs written.
    """
    print()
    print(_bold("  STEP 3 — Seed Channels"))
    print("  Seed channels are the reference channels the pipeline analyses")
    print("  to find trending topics and content gaps in your niche.")
    print()

    # Load defaults from niche_config
    default_channels: list = []
    try:
        from niche_config import get_niche_config
        cfg = get_niche_config(niche)
        default_channels = cfg.get("seed_channels", [])
    except ImportError:
        pass

    if default_channels:
        print(f"  Using {len(default_channels)} default seed channels for '{niche}' from niche_config.")
    else:
        print(_yellow("  No default seed channels found for this niche in niche_config."))

    # Optionally add user's own channel
    user_ch = _ask(
        "Add your own channel ID (UC...) as a seed? (optional — press Enter to skip)",
        default=""
    )
    if user_ch and user_ch.startswith("UC"):
        if user_ch not in default_channels:
            default_channels.insert(0, user_ch)
            print(_green(f"  ✓ Added your channel: {user_ch}"))

    # Write seed_channels.json
    seed_path = ROOT / "seed_channels.json"
    seed_data = {
        "description": f"Seed channels for the {niche} niche (auto-populated by onboarding.py).",
        "channel_ids": default_channels,
        "niche": niche,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "total_channels": len(default_channels),
    }
    seed_path.write_text(json.dumps(seed_data, indent=2), encoding="utf-8")
    print(_green(f"  ✓ seed_channels.json written ({len(default_channels)} channels)"))

    # Optionally run channel discovery
    if _confirm("  Run channel discovery to find more top channels in your niche? (~1 min)", default=False):
        if default_channels:
            seed_id = default_channels[0]
            print(_yellow(f"  Running discovery from seed: {seed_id}"))
            _run(["python", "run_pipeline.py", "--discover-related-channels",
                  "--seed-channel", seed_id, "--discovery-limit", "10"])
        else:
            print(_yellow("  No seed channel available for discovery. Skipping."))

    return default_channels


def _step_first_pipeline(niche: str) -> bool:
    """Run the full pipeline (skip fetch if no data yet, else full run). Returns success."""
    print()
    print(_bold("  STEP 4 — First Pipeline Run"))
    print("  This will fetch market data, cluster topics, and score opportunities.")
    print(_yellow("  This may take 5–15 minutes depending on your internet speed."))
    print()

    if not _confirm("  Run the pipeline now?", default=True):
        print(_yellow("  Skipped. Run later with: python run_pipeline.py --niche " + niche))
        return False

    # Check if primary data file already exists (skip fetch if so)
    from pipeline_paths import get_paths
    primary_data = get_paths(niche).top_100
    skip_fetch = primary_data.exists() and primary_data.stat().st_size > 10_000

    cmd = ["python", "run_pipeline.py", "--niche", niche]
    if skip_fetch:
        cmd.append("--skip-fetch")
        print(_yellow("  Data file found — skipping API fetch, re-running analysis only."))

    success = _run(cmd)
    if success:
        print(_green("  ✓ Pipeline complete!"))
    else:
        print(_red("  ✗ Pipeline failed. See errors above. Fix then re-run:"))
        print(_red(f"    python run_pipeline.py --niche {niche} --resume"))
    return success


def _step_first_brief(niche: str) -> None:
    """Generate the first brief and display it."""
    print()
    print(_bold("  STEP 5 — First Brief"))
    print("  Let's generate your first content brief from the pipeline output.")
    print()

    if not _confirm("  Generate a brief now?", default=True):
        print(_yellow("  Skipped. Run later with: python brief_generator.py --count 1"))
        return

    channel_id = _ask(
        "Your YouTube channel ID (UC...) for a personalised brief? (optional — press Enter to skip)",
        default=""
    )

    cmd = ["python", "brief_generator.py", "--count", "1", "--save"]
    if channel_id and channel_id.startswith("UC"):
        cmd += ["--channel", channel_id]

    _run(cmd)
    print(_green("  ✓ Brief generated! Check briefs_*.json for the full output."))


# ── Utility ───────────────────────────────────────────────────────────────────

def _run(cmd: list) -> bool:
    """Run a subprocess command, streaming output. Returns True on success."""
    try:
        result = subprocess.run(
            cmd,
            cwd=str(ROOT),
            text=True,
        )
        return result.returncode == 0
    except FileNotFoundError as e:
        print(_red(f"  Command not found: {e}"))
        return False
    except KeyboardInterrupt:
        print()
        print(_yellow("  Interrupted."))
        return False


# ── Main wizard ───────────────────────────────────────────────────────────────

def run_wizard() -> None:
    """Entry point for the interactive onboarding wizard."""
    # Enable ANSI on Windows
    if sys.platform == "win32":
        os.system("")

    print()
    print("━" * 60)
    print(_bold("  AutoSignal — First-Run Setup Wizard"))
    print("━" * 60)
    print()
    print("  This wizard will set up the pipeline in under 5 minutes.")
    print("  You'll need:")
    print("   • A YouTube Data API v3 key")
    print("   • A Google Gemini API key")
    print()

    if not _confirm("  Ready to begin?", default=True):
        print(_yellow("  Setup cancelled. Re-run with: python onboarding.py"))
        sys.exit(0)

    # Step 1 — API keys
    _step_api_keys()

    # Step 2 — Niche
    niche = _step_niche_selection()

    # Step 3 — Seed channels
    _step_seed_channels(niche)

    # Step 4 — Pipeline
    pipeline_ok = _step_first_pipeline(niche)

    # Step 5 — First brief (only if pipeline succeeded)
    if pipeline_ok:
        _step_first_brief(niche)

    # Done
    print()
    print("━" * 60)
    print(_bold("  Setup Complete!"))
    print("━" * 60)
    print()
    print("  Next steps:")
    print(f"    • Daily run:   python run_pipeline.py --nightly --niche {niche}")
    print(f"    • New briefs:  python brief_generator.py --count 3")
    print( "    • Resume run:  python run_pipeline.py --resume")
    print()
    print("  Files created:")
    print("    -> api_keys.txt          (API credentials)")
    print("    -> seed_channels.json    (seed channel list)")
    print("    -> opportunities.json    (ranked opportunities)")
    print("    -> briefs_*.json         (generated briefs)")
    print()


if __name__ == "__main__":
    run_wizard()
