"""
Integration module: channel discovery & validation for run_pipeline.py

Usage in run_pipeline.py:
    from channel_discovery import discover_and_validate_seed_channels
    
    # Before main pipeline
    if args.discover_related_channels:
        seed_channels = discover_and_validate_seed_channels(
            youtube_api=youtube,
            seed_channel_ids=["themechanic868"],
            output_dir="./discovery_results"
        )
        SEED_CHANNEL_IDS.extend([ch["id"] for ch in seed_channels])
"""

import os
import json
from typing import List, Dict
from pathlib import Path
from fetch_related_channels import (
    fetch_related_channels_from_seed,
    validate_repair_content_ratio,
    save_channels_to_json
)


def discover_and_validate_seed_channels(
    seed_channel_ids: List[str],
    output_dir: str = "./discovery_results",
    min_subscribers: int = 100000,
    validate_repair: bool = True,
    min_repair_ratio: float = 0.5,
    verbose: bool = True
) -> List[Dict]:
    """
    Orchestrate channel discovery and validation pipeline.
    
    For each seed channel:
    1. Fetch related channels via YouTube recommendations
    2. Filter by subscriber count
    3. Optionally validate repair content ratio
    4. Return ranked list
    
    Args:
        seed_channel_ids: List of seed channel IDs to discover from
        output_dir: Directory to save discovery results
        min_subscribers: Minimum subscriber count threshold
        validate_repair: Whether to validate repair content ratio
        min_repair_ratio: Minimum repair content ratio (0.0-1.0)
        verbose: Print progress
        
    Returns:
        List of discovered channels, sorted by total views (descending)
    """
    
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    all_discovered = []
    
    for seed_id in seed_channel_ids:
        if verbose:
            print(f"\n{'#'*70}")
            print(f"DISCOVERING CHANNELS FROM SEED: {seed_id}")
            print(f"{'#'*70}")
        
        # Step 1: Fetch related channels
        related = fetch_related_channels_from_seed(
            seed_channel_id=seed_id,
            top_seed_videos=10,
            verbose=verbose
        )
        
        if not related:
            print(f"⚠ No channels discovered from {seed_id}")
            continue
        
        # Step 2: Optionally validate repair content
        if validate_repair:
            from metadata_fetch import SemanticFilter
            semantic_filter = SemanticFilter()
            validated = validate_repair_content_ratio(
                channels=related,
                semantic_filter=semantic_filter,
                sample_videos=5,
                min_repair_ratio=min_repair_ratio,
                verbose=verbose
            )
        else:
            validated = related
        
        # Step 3: Save to JSON for inspection
        output_file = os.path.join(output_dir, f"discovered_channels_{seed_id}.json")
        save_channels_to_json(validated, output_file)
        
        all_discovered.extend(validated)
    
    # Deduplicate (in case multiple seed channels lead to same related channels)
    unique_discovered = {}
    for ch in all_discovered:
        if ch["id"] not in unique_discovered:
            unique_discovered[ch["id"]] = ch
    
    # Re-rank by total views
    final = sorted(
        unique_discovered.values(),
        key=lambda x: x["total_views"],
        reverse=True
    )
    
    if verbose:
        print(f"\n{'='*70}")
        print(f"DISCOVERY COMPLETE")
        print(f"{'='*70}")
        print(f"Total unique channels discovered: {len(final)}")
        print(f"\nTop 10 channels for pipeline expansion:")
        print(f"{'Rank':<5} {'Channel':<35} {'Subs':<12} {'Total Views':<15}")
        print("-" * 70)
        
        for rank, ch in enumerate(final[:10], 1):
            name = ch["name"][:32]
            subs = f"{ch['subscriber_count']:,}"
            views = f"{ch['total_views']:,}"
            print(f"{rank:<5} {name:<35} {subs:<12} {views:<15}")
        
        print(f"{'='*70}\n")
    
    return final


def generate_seed_channel_config(
    discovered_channels: List[Dict],
    output_file: str = "./seed_channels_config.json"
) -> Dict:
    """
    Generate a config file for your pipeline with discovered channels.
    
    Output format:
    {
        "seed_channels": [
            {"id": "channel_id_1", "name": "Channel Name 1", "tier": "tier_1"},
            ...
        ],
        "tier_1": ["id_1", "id_2"],  # Top 5 by views
        "tier_2": ["id_3", "id_4"],  # Next 5
        "tier_3": ["id_5", ...]      # Rest
    }
    """
    
    config = {
        "seed_channels": [],
        "tier_1": [],  # Top 5
        "tier_2": [],  # Next 5
        "tier_3": [],  # Rest
        "metadata": {
            "total_channels": len(discovered_channels),
            "discovery_date": None,  # Will be set on pipeline run
            "min_subscribers": None
        }
    }
    
    for idx, ch in enumerate(discovered_channels):
        channel_entry = {
            "id": ch["id"],
            "name": ch["name"],
            "subscriber_count": ch["subscriber_count"],
            "total_views": ch["total_views"],
            "video_count": ch["video_count"]
        }
        
        if "repair_content_ratio" in ch:
            channel_entry["repair_content_ratio"] = ch["repair_content_ratio"]
        
        config["seed_channels"].append(channel_entry)
        
        # Tier assignment
        if idx < 5:
            tier = "tier_1"
        elif idx < 10:
            tier = "tier_2"
        else:
            tier = "tier_3"
        
        config[tier].append(ch["id"])
    
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    
    print(f"\n✓ Generated seed channel config: {output_file}")
    print(f"  Tier 1 (top 5): {len(config['tier_1'])} channels")
    print(f"  Tier 2 (next 5): {len(config['tier_2'])} channels")
    print(f"  Tier 3 (rest): {len(config['tier_3'])} channels")
    
    return config


if __name__ == "__main__":
    print("This is a module to be imported by run_pipeline.py")