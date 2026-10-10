from __future__ import annotations

from fastapi import APIRouter, Query

from .. import normalize
from ..errors import InvalidRequest
from ..schemas import SearchType
from ..services import ytmusic

router = APIRouter(prefix="/api", tags=["search"])


def _map_result(item: dict, result_type: str | None) -> dict | None:
    kind = (result_type or item.get("resultType") or "").lower()
    if kind in {"song", "video", "track"}:
        mapped = normalize.track(item, source="search")
        return {"kind": "track", "item": mapped} if mapped else None
    if kind in {"artist", "profile"}:
        mapped = normalize.artist(item)
        return {"kind": "artist", "item": mapped} if mapped else None
    if kind == "album":
        mapped = normalize.album(item)
        return {"kind": "album", "item": mapped} if mapped else None
    if kind == "playlist":
        mapped = normalize.playlist(item)
        return {"kind": "playlist", "item": mapped} if mapped else None
    if kind in {"top", "station", ""}:
        if item.get("videoId"):
            mapped = normalize.track(item, source="search")
            return {"kind": "track", "item": mapped} if mapped else None
        if item.get("browseId") and item.get("subscribers") is not None:
            mapped = normalize.artist(item)
            return {"kind": "artist", "item": mapped} if mapped else None
        if item.get("playlistId"):
            mapped = normalize.playlist(item)
            return {"kind": "playlist", "item": mapped} if mapped else None
        if item.get("browseId"):
            mapped = normalize.album(item)
            return {"kind": "album", "item": mapped} if mapped else None
    return None


@router.get("/search")
def search(
    q: str = Query(min_length=1, max_length=200),
    type: SearchType = Query(default="all"),
    limit: int = Query(default=20, ge=1, le=50),
    scope: str | None = Query(default=None, description="Optional YouTube Music scope filter"),
) -> dict:
    query = q.strip()
    if not query:
        raise InvalidRequest("Search query must not be empty.")

    kwargs: dict = {"limit": limit, "ignore_spelling": False}
    if type != "all":
        kwargs["filter"] = type
    if scope:
        kwargs["scope"] = scope

    results = ytmusic.call("search", query, cache_key=f"search:{type}:{limit}:{query.lower()}", **kwargs)

    if type == "all":
        mapped = []
        for item in results if isinstance(results, list) else []:
            entry = _map_result(item, item.get("resultType") if isinstance(item, dict) else None)
            if entry:
                mapped.append(entry)
        return {"query": query, "type": type, "results": mapped[: limit * 3]}

    singular = {"songs": "song", "videos": "video", "artists": "artist", "albums": "album", "playlists": "playlist"}[type]
    output = []
    for item in results if isinstance(results, list) else []:
        entry = _map_result(item, singular)
        if entry:
            output.append(entry)

    return {"query": query, "type": type, "results": output[:limit]}


@router.get("/suggest")
def suggest(q: str = Query(min_length=1, max_length=80)) -> dict:
    query = q.strip()
    raw = ytmusic.call("get_search_suggestions", query, cache_key=f"suggest:{query.lower()}")
    suggestions: list[dict] = []
    if isinstance(raw, list):
        for entry in raw:
            if isinstance(entry, str):
                suggestions.append({"text": entry, "kind": "query"})
            elif isinstance(entry, dict):
                text = entry.get("query") or entry.get("text") or entry.get("suggestion")
                if text:
                    suggestions.append({"text": str(text), "kind": entry.get("category") or "query"})
                for track in entry.get("results") or []:
                    mapped = normalize.track(track, source="search")
                    if mapped:
                        suggestions.append({"text": mapped["title"], "kind": "track", "track": mapped})
    return {"query": query, "suggestions": suggestions[:12]}
