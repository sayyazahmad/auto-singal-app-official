"""
pipeline_paths.py
=================
Single source of truth for per-niche data directories and pipeline artifact paths.

Layout:
  data/
    automotive/
      top_100_videos.json
      merged_videos.json
      merged_videos_semantic.json
      top_100_semantic.json
      video_clusters_semantic.json
      channel_metadata.json
      opportunities.json
      discovered_channels.json
      categorized_videos/
      youtube.db
    finance/
      ...
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from niche_config import NICHE_CONFIGS, list_niches

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent
DATA_ROOT = ROOT / "data"

# Reference channel used for channel_metadata fetch when none is specified
DEFAULT_REFERENCE_CHANNELS = {
    "automotive": "UCf3Vtm8OTBsyjJwYfmF2trw",  # TheMechanic868
    "finance": "UCL8w_A8p8P1HozDIpYNaZMg",      # Graham Stephan
    "technology": "UCsBjURrPoezykLs9EqgamOA",    # Fireship
    "productivity": "UCG-KntY7aVnIGXYEBQvmBAQ",  # Thomas Frank
}

STANDARD_ARTIFACTS = [
    "top_100_videos.json",
    "top_100_semantic.json",
    "merged_videos.json",
    "merged_videos_semantic.json",
    "video_clusters_semantic.json",
    "channel_metadata.json",
    "opportunities.json",
    "discovered_channels.json",
    "categorized_index.json",
]


def resolve_niche(niche: Optional[str] = None, channel_id: Optional[str] = None) -> str:
    """
    Normalize a niche key. Resolves 'auto' via NicheDetector when channel_id is given,
    otherwise defaults to automotive.
    """
    key = (niche or "automotive").strip().lower()

    if key == "auto":
        if channel_id:
            try:
                from niche_detector import NicheDetector

                detected = NicheDetector().detect_from_channel(channel_id)
                return detected.get("niche", "automotive")
            except Exception as exc:
                log.warning("Niche auto-detection failed (%s); using automotive", exc)
        return "automotive"

    if key not in NICHE_CONFIGS:
        log.warning("Unknown niche '%s' — falling back to automotive", key)
        return "automotive"

    return key


@dataclass(frozen=True)
class NichePaths:
    niche: str
    base: Path

    @property
    def top_100(self) -> Path:
        return self.base / "top_100_videos.json"

    @property
    def top_100_semantic(self) -> Path:
        return self.base / "top_100_semantic.json"

    @property
    def merged(self) -> Path:
        return self.base / "merged_videos.json"

    @property
    def merged_semantic(self) -> Path:
        return self.base / "merged_videos_semantic.json"

    @property
    def clusters(self) -> Path:
        return self.base / "video_clusters_semantic.json"

    @property
    def channel_metadata(self) -> Path:
        return self.base / "channel_metadata.json"

    @property
    def opportunities(self) -> Path:
        return self.base / "opportunities.json"

    @property
    def discovered_channels(self) -> Path:
        return self.base / "discovered_channels.json"

    @property
    def categorized_dir(self) -> Path:
        return self.base / "categorized_videos"

    @property
    def categorized_index(self) -> Path:
        return self.base / "categorized_index.json"

    @property
    def db(self) -> Path:
        return self.base / "youtube.db"

    @property
    def discarded_videos(self) -> Path:
        return self.base / "discarded_videos.json"

    def ensure_dirs(self) -> None:
        self.base.mkdir(parents=True, exist_ok=True)
        self.categorized_dir.mkdir(parents=True, exist_ok=True)

    def artifact_path(self, filename: str) -> Path:
        return self.base / filename

    def list_artifacts(self) -> List[Path]:
        return [self.base / name for name in STANDARD_ARTIFACTS]


def get_paths(niche: str = "automotive", channel_id: Optional[str] = None) -> NichePaths:
    resolved = resolve_niche(niche, channel_id)
    return NichePaths(niche=resolved, base=DATA_ROOT / resolved)


def get_reference_channel(niche: str) -> str:
    resolved = resolve_niche(niche)
    cfg = NICHE_CONFIGS.get(resolved, {})
    seeds = cfg.get("seed_channels") or []
    if seeds:
        return seeds[0]
    return DEFAULT_REFERENCE_CHANNELS.get(resolved, DEFAULT_REFERENCE_CHANNELS["automotive"])


def all_niche_keys() -> List[str]:
    return list_niches()


def resolve_dataset_file(niche: str, filename: str) -> Optional[Path]:
    """
    Resolve a dataset filename for API/static serving.
    Checks the niche data directory first, then legacy root locations.
    """
    paths = get_paths(niche)
    candidates = [
        paths.base / filename,
        ROOT / "public" / niche / filename,
        ROOT / filename,
        ROOT / f"{niche}_{filename}",
        # Legacy automotive naming (pre data/ layout)
        ROOT / filename.replace("top_100_videos", "top_100_automotive_videos"),
        ROOT / "themechanic868_metadata.json" if filename == "channel_metadata.json" else None,
    ]

    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate
    return None
