"""Normalisation helpers.

ytmusicapi responses are convenient but inconsistent: optional keys appear or
disappear depending on the shelf, timed lyrics come back as dataclasses, and
durations arrive as strings. The frontend deserves one stable shape, so every
router passes payloads through these functions.
"""

from __future__ import annotations

from typing import Any


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        parts = [_text(item) for item in value]
        return ", ".join(part for part in parts if part) or None
    if isinstance(value, dict):
        return _text(value.get("name") or value.get("text") or value.get("title"))
    return str(value)


def _id(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("id", "browseId", "playlistId", "videoId", "channelId"):
            if value.get(key):
                return str(value[key])
    return None


def _seconds(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value).strip()
    if text.isdigit():
        return int(text)
    parts = text.split(":")
    if not parts or any(not p.isdigit() for p in parts):
        return None
    total = 0
    for part in parts:
        total = total * 60 + int(part)
    return total


def seconds_to_text(total: int | None) -> str | None:
    if total is None:
        return None
    minutes, seconds = divmod(int(total), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def thumbnails(item: Any) -> list[dict[str, Any]]:
    if not isinstance(item, dict):
        return []
    raw = item.get("thumbnails") or []
    out: list[dict[str, Any]] = []
    for thumb in raw:
        if not isinstance(thumb, dict) or not thumb.get("url"):
            continue
        out.append({"url": thumb["url"], "width": thumb.get("width"), "height": thumb.get("height")})
    return out


def artists(item: Any) -> list[dict[str, Any]]:
    """Accepts ``[{"name":..,"id":..}]``, ``["Name"]`` or a single dict."""
    if item is None:
        return []
    if isinstance(item, dict):
        item = [item]
    if not isinstance(item, list):
        name = _text(item)
        return [{"name": name, "id": None}] if name else []
    out: list[dict[str, Any]] = []
    for entry in item:
        if isinstance(entry, str):
            if entry:
                out.append({"name": entry, "id": None})
            continue
        if isinstance(entry, dict):
            name = entry.get("name") or entry.get("artist") or _text(entry.get("text"))
            if name:
                out.append({"name": str(name), "id": _id(entry)})
    return out


def album_of(item: Any) -> dict[str, Any] | None:
    raw = item.get("album") if isinstance(item, dict) else None
    if not raw:
        return None
    if isinstance(raw, str):
        return {"name": raw, "id": None, "thumbnails": []}
    name = _text(raw.get("name") or raw.get("title"))
    if not name:
        return None
    return {"name": name, "id": _id(raw), "thumbnails": thumbnails(raw)}


def track(item: Any, *, source: str = "search") -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    video_id = item.get("videoId")
    if not video_id and item.get("id") and isinstance(item.get("id"), str):
        video_id = item["id"]
    if not video_id:
        return None
    duration = _seconds(item.get("duration_seconds") or item.get("duration"))
    title = _text(item.get("title"))
    if not title:
        return None
    return {
        "id": str(video_id),
        "title": title,
        "artists": artists(item.get("artists")),
        "album": album_of(item),
        "duration": duration,
        "durationText": seconds_to_text(duration) or (item.get("duration") if isinstance(item.get("duration"), str) else None),
        "thumbnails": thumbnails(item),
        "views": _text(item.get("views")),
        "year": _text(item.get("year")),
        "explicit": bool(item.get("isExplicit")),
        "available": item.get("isAvailable", True) is not False,
        "source": source,
    }


def artist(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    channel_id = item.get("browseId") or item.get("channelId") or item.get("id")
    name = _text(item.get("artist") or item.get("name") or item.get("title"))
    if not channel_id or not name:
        return None
    return {
        "id": str(channel_id),
        "name": name,
        "subscribers": _text(item.get("subscribers")),
        "monthlyListeners": _text(item.get("monthlyListeners")),
        "thumbnails": thumbnails(item),
        "source": "youtube-music",
    }


def album(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    browse_id = item.get("browseId") or item.get("id")
    title = _text(item.get("title"))
    if not title:
        return None
    return {
        "id": str(browse_id) if browse_id else None,
        "title": title,
        "artists": artists(item.get("artists")),
        "year": _text(item.get("year")),
        "type": _text(item.get("type")),
        "thumbnails": thumbnails(item),
        "explicit": bool(item.get("isExplicit")),
        "source": "youtube-music",
    }


def playlist(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    browse_id = item.get("browseId") or item.get("playlistId") or item.get("id")
    title = _text(item.get("title"))
    if not title:
        return None
    return {
        "id": str(browse_id) if browse_id else None,
        "title": title,
        "author": _text(item.get("author")),
        "itemCount": item.get("itemCount") if isinstance(item.get("itemCount"), int) else _text(item.get("itemCount")),
        "description": _text(item.get("description")),
        "thumbnails": thumbnails(item),
        "source": "youtube-music",
    }


def dedupe(items: list[dict[str, Any]], key: str = "id") -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for item in items:
        value = item.get(key)
        marker = str(value) if value else item.get("title")
        if marker is None or marker in seen:
            continue
        seen.add(marker)
        out.append(item)
    return out


def compact_list(items: Any, mapper, *, limit: int | None = None) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    out: list[dict[str, Any]] = []
    for item in items:
        mapped = mapper(item)
        if mapped:
            out.append(mapped)
        if limit is not None and len(out) >= limit:
            break
    return dedupe(out)
