"""
Fetch related/recommended channels from a seed channel.

Strategy:
1. Get top N videos from seed channel (ranked by view count)
2. For each video, find related channels via YouTube's recommendation API
3. Collect all unique related channels
4. Fetch detailed stats (subscribers, total views, video count)
5. Filter by minimum subscriber threshold
6. Rank by total views (descending)
7. Optional: validate repair content ratio

Output: Ranked list of qualified channels suitable for pipeline expansion
"""

import json
from typing import List, Dict, Optional
import time
from youtube_api_utils import request_with_retry, YT_SEARCH_URL, YT_CHANNELS_URL

def _resolve_channel_handle(handle_or_id: str) -> Optional[str]:
    """
    Resolves a channel handle (e.g., @ChrisFix) to its ID (e.g., UC...).
    If the input already looks like an ID, it's returned directly.
    """
    if handle_or_id.startswith("UC"):
        return handle_or_id  # It's already an ID
    try:
        params = {
            "part": "snippet",
            "q": handle_or_id,
            "type": "channel",
            "maxResults": 1,
        }
        search_response = request_with_retry(YT_SEARCH_URL, params=params)
        
        items = search_response.get("items", [])
        if items and items[0].get("snippet", {}).get("channelId"):
            found_title = items[0].get("snippet", {}).get("title", "")
            clean_handle = handle_or_id.replace("@", "").lower()
            if clean_handle in found_title.lower():
                return items[0]["snippet"]["channelId"]
    except Exception as e:
        print(f"   ⚠ Could not resolve channel handle '{handle_or_id}': {e}")
    return None


def fetch_related_channels_from_seed(
    seed_channel_id: str,
    top_seed_videos: int = 10,
    related_per_video: int = 20,
    batch_size: int = 50,
    verbose: bool = True
) -> List[Dict]:
    """
    Discover channels recommended alongside a seed channel's top videos.
    
    Args:
        seed_channel_id: Channel ID to use as discovery seed (e.g., "themechanic868")
        top_seed_videos: Number of top videos from seed channel to analyze
        related_per_video: Number of related channels per video (YouTube limit: 50)
        batch_size: Batch size for channels().list() API calls (max 50)
        verbose: Print progress to stdout
        
    Returns:
        List of dicts: [
            {
                "id": "channel_id",
                "name": "Channel Name",
                "subscriber_count": 123456,
                "total_views": 1234567890,
                "video_count": 456,
                "discovery_source": "video_id_1,video_id_2"  # Which seed videos led here
            },
            ...
        ]
        Sorted by total_views descending.
    """
    
    if verbose:
        print(f"\n{'='*70}")
        print(f"FETCHING RELATED CHANNELS FROM SEED: {seed_channel_id}")
        print(f"{'='*70}")
    
    # New Step 0: Resolve handle to ID to make the function robust
    if verbose:
        print(f"\n[1/5] Resolving seed channel (if handle provided)...")
    resolved_channel_id = _resolve_channel_handle(seed_channel_id)
    if not resolved_channel_id:
        print(f"ERROR: Could not resolve '{seed_channel_id}' to a valid channel ID. Please use the 'UC...' format.")
        return []
    if verbose:
        print(f"   ✓ Resolved to ID: {resolved_channel_id}")
    
    # Step 1: Get top videos from seed channel
    if verbose:
        print(f"\n[2/5] Fetching top {top_seed_videos} videos from {resolved_channel_id}...")
    
    params = {
        "part": "id,snippet",
        "channelId": resolved_channel_id,
        "order": "viewCount",
        "maxResults": min(top_seed_videos, 50),
        "type": "video",
    }
    seed_videos_response = request_with_retry(YT_SEARCH_URL, params=params)
    if not seed_videos_response:
        print(f"ERROR: Failed to fetch seed channel videos for {resolved_channel_id}")
        return []

    seed_videos = seed_videos_response.get("items", [])
    if not seed_videos:
        print(f"ERROR: No videos found for seed channel {resolved_channel_id}")
        return []
    
    if verbose:
        print(f"   ✓ Found {len(seed_videos)} seed videos")
        for i, video in enumerate(seed_videos[:3], 1):
            title = video["snippet"]["title"][:50]
            print(f"     {i}. {title}...")
    
    # Step 2: Fetch related channels for each seed video
    if verbose:
        print(f"\n[3/5] Fetching related channels ({related_per_video} per video)...")
    
    related_channel_ids = {}  # channel_id -> [source_video_ids]
    
    for video_idx, video in enumerate(seed_videos, 1):
        video_id = video["id"]["videoId"]
        
        params = {
            "part": "snippet",
            "relatedToVideoId": video_id,
            "type": "channel",
            "maxResults": min(related_per_video, 50),
            "order": "relevance",
        }
        related_response = request_with_retry(YT_SEARCH_URL, params=params, timeout=5)
        if not related_response:
            print(f"   ⚠ Failed to fetch related channels for video {video_id}")
            continue
        
        related_items = related_response.get("items", [])
        for item in related_items:
            channel_id = item["snippet"]["channelId"]
            if channel_id not in related_channel_ids:
                related_channel_ids[channel_id] = []
            related_channel_ids[channel_id].append(video_id)
        
        if verbose and video_idx % 3 == 0:
            print(f"   ✓ Processed {video_idx}/{len(seed_videos)} videos ({len(related_channel_ids)} unique channels found)")
    
    if verbose:
        print(f"   ✓ Found {len(related_channel_ids)} unique related channels")
    
    # Step 3: Fetch detailed stats for all related channels
    if verbose:
        print(f"\n[4/5] Fetching channel details (subscribers, views, video count)...")
    
    channels_with_stats = []
    failed_channels = []
    
    # Process in batches (YouTube API limit: 50 per request)
    channel_ids_list = list(related_channel_ids.keys())
    
    for batch_idx in range(0, len(channel_ids_list), batch_size):
        batch = channel_ids_list[batch_idx:batch_idx + batch_size]
        
        params = {
            "part": "snippet,statistics",
            "id": ",".join(batch),
        }
        stats_response = request_with_retry(YT_CHANNELS_URL, params=params, timeout=10)
        if not stats_response:
            print(f"   ⚠ Failed to fetch stats for batch {batch_idx//batch_size + 1}")
            failed_channels.extend(batch)
            continue
        
        for item in stats_response.get("items", []):
            try:
                channel_id = item["id"]
                stats = item.get("statistics", {})
                snippet = item.get("snippet", {})
                
                subscriber_count = int(stats.get("subscriberCount", 0))
                total_views = int(stats.get("viewCount", 0))
                video_count = int(stats.get("videoCount", 0))
                
                channels_with_stats.append({
                    "id": channel_id,
                    "name": snippet.get("title", "Unknown"),
                    "subscriber_count": subscriber_count,
                    "total_views": total_views,
                    "video_count": video_count,
                    "discovery_source": ",".join(related_channel_ids[channel_id][:3])  # First 3 videos
                })
            except Exception as e:
                print(f"   ⚠ Failed to parse channel {item.get('id')}: {e}")
        
        if verbose and (batch_idx // batch_size + 1) % 2 == 0:
            print(f"   ✓ Fetched stats for {min(batch_idx + batch_size, len(channel_ids_list))}/{len(channel_ids_list)} channels")
    
    if verbose:
        print(f"   ✓ Successfully fetched stats for {len(channels_with_stats)} channels")
        if failed_channels:
            print(f"   ⚠ Failed to fetch stats for {len(failed_channels)} channels")
    
    # Step 4: Filter and rank
    if verbose:
        print(f"\n[5/5] Filtering and ranking by total views...")
    
    # The min_subscribers filter is now applied in the calling function `discover_and_validate_seed_channels`
    # after semantic validation, but we can still sort here.
    ranked = sorted(channels_with_stats, key=lambda x: x.get("total_views", 0), reverse=True)
    
    # Filter for logging purposes to show what would qualify on subs alone
    min_subscribers = 100000 # This value is from channel_discovery.py
    qualified_by_subs = [ch for ch in ranked if ch.get("subscriber_count", 0) >= min_subscribers]
    
    if verbose:
        print(f"   ✓ Found {len(qualified_by_subs)} channels with >= {min_subscribers:,} subscribers (before semantic validation).")
        print(f"\n{'='*70}")
        print("TOP 15 RELATED CHANNELS (BY TOTAL VIEWS)")
        print(f"{'='*70}")
        print(f"{'Rank':<5} {'Channel':<35} {'Subs':<12} {'Total Views':<15} {'Videos':<8}")
        print("-" * 70)
        
        for rank, ch in enumerate(ranked[:15], 1):
            name = ch.get("name", "N/A")[:32]
            subs = f"{ch.get('subscriber_count', 0):,}"
            views = f"{ch.get('total_views', 0):,}"
            videos = ch.get("video_count", 0)
            print(f"{rank:<5} {name:<35} {subs:<12} {views:<15} {videos:<8}")
        
        if len(ranked) > 15:
            print(f"... and {len(ranked) - 15} more channels")
        print(f"{'='*70}\n")
    
    return ranked


def validate_repair_content_ratio(
    channels: List[Dict],
    semantic_filter,
    sample_videos: int = 5,
    min_repair_ratio: float = 0.5,
    verbose: bool = True
) -> List[Dict]:
    """
    Validate that channels have sufficient repair-related content.
    
    Strategy:
    - For each channel, fetch top N videos by view count
    - Extract titles and descriptions
    - Count how many match repair keywords
    - Calculate repair_content_ratio = (passed videos) / (total videos)
    
    Args:
        channels: List of channel dicts to validate.
        semantic_filter: An initialized SemanticFilter instance.
        sample_videos: Number of top videos to sample per channel.
        min_repair_ratio: Minimum ratio to qualify (0.0-1.0)
        verbose: Print progress
        
    Returns:
        A new list containing only the channels that passed validation.
    """
    
    if verbose:
        print(f"\n{'='*70}")
        print(f"VALIDATING REPAIR CONTENT RATIO (using Semantic Filter)")
        print(f"{'='*70}")
        print(f"Sample size: {sample_videos} videos per channel")
        print(f"Min repair ratio: {min_repair_ratio * 100:.0f}%\n")
    
    validated_channels = []
    
    for idx, channel in enumerate(channels, 1):
        channel_id = channel["id"]
        channel_name = channel["name"]
        
        params = {
            "part": "snippet",
            "channelId": channel_id,
            "order": "viewCount",
            "maxResults": sample_videos,
            "type": "video",
        }
        videos_response = request_with_retry(YT_SEARCH_URL, params=params)
        if not videos_response or not videos_response.get("items"):
            if verbose:
                print(f"   ⚠ {channel_name}: Failed to fetch videos for validation")
            continue
        
        videos = videos_response.get("items", [])
        if not videos:
            if verbose:
                print(f"   ⚠ {channel_name}: No videos found")
            continue
            
        # Build payload for semantic scoring
        videos_to_score = [{
            "title": v.get("snippet", {}).get("title", ""),
            "description": v.get("snippet", {}).get("description", ""),
            "video_id": v.get("id", {}).get("videoId"),
        } for v in videos]

        if not videos_to_score:
            continue
            
        scores = semantic_filter.score_videos_batch(videos_to_score)
        passed_count = sum(1 for score in scores if score["passed"])
        repair_ratio = passed_count / len(videos_to_score) if videos_to_score else 0.0
        
        channel["repair_content_ratio"] = repair_ratio
        channel["repair_videos_sampled"] = passed_count
        channel["total_videos_sampled"] = len(videos)
        
        if repair_ratio >= min_repair_ratio:
            validated_channels.append(channel)
            status = "✓"
        else:
            status = "✗"
        
        if verbose and idx % 5 == 0:
            print(f"   {status} {channel_name[:30]:<30}: {repair_ratio*100:.0f}% repair content ({passed_count}/{len(videos)} videos)")
    
    if verbose:
        print(f"\n✓ Validated {len(validated_channels)} channels pass repair content threshold")
        print(f"{'='*70}\n")
    
    return validated_channels


def save_channels_to_json(channels: List[Dict], output_file: str) -> None:
    """Save discovered channels to JSON file for inspection/manual review."""
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(channels, f, indent=2)
    print(f"✓ Saved {len(channels)} channels to {output_file}")


def load_channels_from_json(input_file: str) -> List[Dict]:
    """Load previously discovered channels from JSON file."""
    with open(input_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"✓ Loaded channels from {input_file}")
    return data


if __name__ == "__main__":
    print("This is a module to be imported by channel_discovery.py")