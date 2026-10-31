"""
youtube_api_utils.py
====================
Shared utilities for interacting with the YouTube Data API v3.
"""

import os
import re
import logging
import time
import threading
from typing import Any
from datetime import datetime, timezone, timedelta

# Load secrets from api_keys.txt file if present
env_path = os.path.join(os.path.dirname(__file__), "api_keys.txt")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

import requests

# YouTube Data API v3 base URLs
YT_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"
YT_SEARCH_URL   = "https://www.googleapis.com/youtube/v3/search"
YT_VIDEOS_URL   = "https://www.googleapis.com/youtube/v3/videos"
YT_PLAYLIST_URL = "https://www.googleapis.com/youtube/v3/playlistItems"

# Shared logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

_session = requests.Session()

class ApiKeyManager:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.keys: list[str] = []
        keys_dict = {}
        for k, v in os.environ.items():
            if k.startswith("YOUTUBE_API_KEY") and v.strip():
                keys_dict[k] = v.strip()
                
        for k in sorted(keys_dict.keys()):
            self.keys.append(keys_dict[k])
        
        if not self.keys:
            raise EnvironmentError(
                "No YOUTUBE_API_KEY found.\n"
                "Please add one or more keys (e.g., YOUTUBE_API_KEY_1=...) to your api_keys.txt file."
            )
            
        self.current_idx = 0
        
    def get_current_key(self) -> str:
        with self.lock:
            return self.keys[self.current_idx]
        
    def rotate_key(self) -> bool:
        with self.lock:
            if self.current_idx < len(self.keys) - 1:
                self.current_idx += 1
                log.warning("API Quota exceeded. Rotating to API Key #%d", self.current_idx + 1)
                return True
            log.error("All %d API keys have exhausted their quota.", len(self.keys))
            return False

_api_manager: ApiKeyManager | None = None
_api_manager_lock = threading.Lock()

def get_api_manager() -> ApiKeyManager:
    global _api_manager
    if _api_manager is None:
        with _api_manager_lock:
            if _api_manager is None:
                _api_manager = ApiKeyManager()
    return _api_manager

def get_api_key() -> str:
    return get_api_manager().get_current_key()

def safe_json_response(resp: requests.Response) -> dict:
    try:
        return resp.json()
    except ValueError:
        return {}

def request_with_retry(url: str, params: dict[str, Any], timeout: int = 15, max_retries: int = 4) -> dict:
    retry_statuses = {500, 502, 503, 504}
    api_manager = get_api_manager()

    for attempt in range(1, max_retries + 1):
        try:
            req_params = {**params, "key": api_manager.get_current_key()}
            resp = _session.get(url, params=req_params, timeout=timeout)
            data = safe_json_response(resp)

            if resp.status_code < 400:
                return data

            reason = ""
            if "error" in data and "errors" in data["error"] and len(data["error"]["errors"]) > 0:
                reason = data["error"]["errors"][0].get("reason", "")
                
            if resp.status_code in {403, 429} and reason in {"quotaExceeded", "rateLimitExceeded"}:
                if api_manager.rotate_key():
                    continue
                else:
                    return {}

            if resp.status_code in retry_statuses and attempt < max_retries:
                time.sleep(1.0 * (2 ** (attempt - 1)))
                continue

            log.warning("API request failed: %s %s (status=%d, reason=%s)", url, reason, resp.status_code, reason or "unknown")
            return {}
        except requests.RequestException:
            if attempt < max_retries:
                time.sleep(1.0 * (2 ** (attempt - 1)))
                continue
            return {}
    return {}


def parse_iso8601_duration(duration_str: str) -> timedelta:
    """Parses an ISO 8601 duration string (e.g., 'PT15M30S') into a timedelta."""
    if not duration_str or not duration_str.startswith("PT"):
        return timedelta()

    # More efficient regex to capture H, M, S in one pass
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration_str)
    if not match:
        return timedelta()

    hours, minutes, seconds = match.groups()

    return timedelta(
        hours=int(hours) if hours else 0,
        minutes=int(minutes) if minutes else 0,
        seconds=int(seconds) if seconds else 0,
    )


def detect_triggers(title: str) -> list[str]:
    """Detects emotional or clickbait triggers in titles."""
    pattern = r"\b(secret|destroy|rebuild|amazing|genius|shocking|expert|broken|insane|perfect|worst|best|cheap|expensive|scam)\b"
    matches = re.findall(pattern, title.lower())
    return list(set(matches))


def classify_title_pattern(title: str) -> str:
    """Classifies the title into common YouTube formats."""
    t = title.lower()
    if re.search(r'\b(how to|diy|guide|tutorial|step by step)\b', t):
        return "how_to"
    if re.search(r'\b(warning|stop|don\'t|never|mistake|avoid|watch out)\b', t):
        return "warning"
    if re.search(r'\b(top\s*\d+|\d+\s*things|list|reasons)\b', t):
        return "list"
    if re.search(r'\b(fix|problem|broken|repair|issue|noise|symptom|rebuild)\b', t):
        return "problem"
    return "general"


def classify_age(hours: float | None) -> str:
    """Classifies video age based on hours since publish."""
    if hours is None: return "Unknown"
    if hours < 24: return "New (< 24h)"
    if hours < 168: return "Recent (< 1 Week)"
    if hours < 720: return "Month (< 30 Days)"
    return "Old (> 30 Days)"


def classify_vph(vph: float) -> str:
    """Classifies the velocity tier of the video."""
    if vph > 1000: return "Viral"
    if vph > 100: return "High"
    if vph > 10: return "Medium"
    return "Low"


def is_still_growing(hours: float | None, vph: float) -> bool:
    """Dynamic growth detection instead of fixed window."""
    h = hours or 0
    if h < 24 and vph > 100: return True
    if h < 72 and vph > 200: return True
    if h < 168 and vph > 500: return True
    if h < 336 and vph > 1000: return True
    return False



try:
    from google.cloud import vision
    VISION_AVAILABLE = True
except ImportError:
    VISION_AVAILABLE = False

_vision_client = None

def get_vision_client():
    global _vision_client
    if not VISION_AVAILABLE:
        return None
    if _vision_client is None:
        _vision_client = vision.ImageAnnotatorClient()
    return _vision_client


def parse_video(item: dict) -> dict | None:
    snippet = item.get("snippet", {})
    statistics = item.get("statistics", {})
    content_details = item.get("contentDetails", {})
    video_id = item.get("id", "")

    if not video_id or not snippet:
        return None

    published_str = snippet.get("publishedAt", "")
    try:
        published_dt = datetime.fromisoformat(published_str.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        published_dt = None

    now = datetime.now(timezone.utc)
    hours_since = (
        round((now - published_dt).total_seconds() / 3600, 2)
        if published_dt else None
    )

    view_count = int(statistics.get("viewCount", 0) or 0)
    like_count = int(statistics.get("likeCount", 0) or 0)
    comment_count = int(statistics.get("commentCount", 0) or 0)

    views_per_hour = (
        round(view_count / hours_since, 2)
        if hours_since and hours_since > 0 else 0.0
    )

    thumbnails = snippet.get("thumbnails", {})
    thumbnail = thumbnails.get("maxres", thumbnails.get("high", thumbnails.get("medium", {}))).get("url", "")

    duration_iso = content_details.get("duration", "")
    duration_td = parse_iso8601_duration(duration_iso)
    duration_seconds = int(duration_td.total_seconds())

    title = snippet.get("title", "")
    description = snippet.get("description", "")
    tags = snippet.get("tags", [])  # often missing in public API output

    raw_video_data = {
        "video_id": video_id,
        "video_url": f"https://www.youtube.com/watch?v={video_id}",
        "channel_id": snippet.get("channelId", ""),
        "channel_title": snippet.get("channelTitle", ""),
        "published_at": published_str,
        "category_id": snippet.get("categoryId", ""),

        "title": title,
        "title_emotional_triggers": detect_triggers(title),
        "title_pattern": classify_title_pattern(title),

        "description": description,
        "description_has_timestamps": bool(re.search(r"\d+:\d+", description)),
        "description_link_count": len(re.findall(r"https?://\S+", description)),
        "description_hashtags": re.findall(r"#\w+", description),

        "tags": tags,

        "duration_seconds": duration_seconds,
        "thumbnail_url": thumbnail,
        "definition": content_details.get("definition", ""),
        "caption": content_details.get("caption", "false") == "true",
        "default_audio_language": snippet.get("defaultAudioLanguage", ""),

        "view_count": view_count,
        "like_count": like_count,
        "comment_count": comment_count,
        "hours_since_publish": hours_since,
        "views_per_hour": views_per_hour,
        "age_bucket": classify_age(hours_since),
        "vph_tier": classify_vph(views_per_hour),
        "is_still_growing": is_still_growing(hours_since, views_per_hour),

        "like_rate": round(like_count / max(view_count, 1), 4),
        "comment_rate": round(comment_count / max(view_count, 1), 4),
        "engagement_score": round((like_count + comment_count) / max(view_count, 1), 4),
    }

    # Clean up empty or null values
    return {k: v for k, v in raw_video_data.items() if v not in (None, "", [], {})}


def analyze_thumbnail(image_url: str) -> dict:
    if not VISION_AVAILABLE or not image_url:
        return {}

    try:
        client = get_vision_client()
        image = vision.Image()
        image.source.image_uri = image_url

        response = client.annotate_image({
            "image": image,
            "features": [
                {"type_": vision.Feature.Type.FACE_DETECTION},
                {"type_": vision.Feature.Type.TEXT_DETECTION},
                {"type_": vision.Feature.Type.LABEL_DETECTION},
            ]
        })

        faces = response.face_annotations
        texts = response.text_annotations
        labels = response.label_annotations

        return {
            "thumbnail_has_face": len(faces) > 0,
            "thumbnail_face_count": len(faces),
            "thumbnail_has_text": len(texts) > 0,
            "thumbnail_text_content": texts[0].description.replace("\n", " ") if texts else "",
            "thumbnail_tags": [label.description for label in labels[:5]]
        }
    except Exception as e:
        log.warning("Vision API error for thumbnail %s: %s", image_url, e)
        return {}
