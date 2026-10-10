from __future__ import annotations

from fastapi import APIRouter, Query

from .. import normalize
from ..errors import InvalidRequest, NotFoundError
from ..services import ytmusic

router = APIRouter(prefix="/api", tags=["catalog"])


def _song_payload(video_id: str) -> dict:
    raw = ytmusic.call("get_song", video_id, cache_key=f"song:{video_id}")
    details = raw.get("videoDetails") or {}
    microformat = ((raw.get("microformat") or {}).get("microformatDataRenderer")) or {}
    playability = raw.get("playabilityStatus") or {}
    thumbs = normalize.thumbnails(details.get("thumbnail") and {"thumbnails": details["thumbnail"].get("thumbnails")} or microformat)
    duration = normalize._seconds(details.get("lengthSeconds"))
    item = {
        "videoId": details.get("videoId") or video_id,
        "title": details.get("title"),
        "artists": [{"name": details.get("author"), "id": None}] if details.get("author") else [],
        "album": None,
        "duration_seconds": duration,
        "duration": normalize.seconds_to_text(duration),
        "views": details.get("viewCount"),
        "thumbnails": thumbs,
        "isExplicit": False,
    }
    mapped = normalize.track(item, source="watch")
    if mapped is None:
        raise NotFoundError("This track could not be loaded.")
    return {
        "track": mapped,
        "description": details.get("shortDescription"),
        "playable": playability.get("status") == "OK",
        "playability": playability.get("status"),
        "reason": playability.get("reason"),
        "canonicalUrl": microformat.get("urlCanonical"),
        "category": microformat.get("category"),
    }


@router.get("/song/{video_id}")
def song(video_id: str) -> dict:
    return _song_payload(video_id)


@router.get("/album/{browse_id}")
def album(browse_id: str) -> dict:
    raw = ytmusic.call("get_album", browse_id, cache_key=f"album:{browse_id}")
    if not raw or not raw.get("title"):
        raise NotFoundError("Album not found.")
    tracks = normalize.compact_list(raw.get("tracks"), lambda t: normalize.track(t, source="album"))
    duration = raw.get("duration_seconds") or normalize._seconds(raw.get("duration"))
    return {
        "album": {
            "id": browse_id,
            "title": raw.get("title"),
            "type": raw.get("type"),
            "year": raw.get("year"),
            "artists": normalize.artists(raw.get("artists")),
            "thumbnails": normalize.thumbnails(raw),
            "description": raw.get("description"),
            "trackCount": raw.get("trackCount") or len(tracks),
            "duration": duration,
            "durationText": normalize.seconds_to_text(duration),
            "explicit": bool(raw.get("isExplicit")),
            "audioPlaylistId": raw.get("audioPlaylistId"),
            "source": "youtube-music",
        },
        "tracks": tracks,
        "related": normalize.compact_list(raw.get("related_recommendations"), normalize.album, limit=12),
        "otherVersions": normalize.compact_list(raw.get("other_versions"), normalize.album, limit=12),
    }


def _results(container) -> list:
    """ytmusicapi returns ``{"browseId":…, "results":[…]}`` for artist shelves."""
    if isinstance(container, dict):
        return container.get("results") or []
    if isinstance(container, list):
        return container
    return []


def _params(container) -> str | None:
    return container.get("params") if isinstance(container, dict) else None


def _author(value) -> dict | None:
    if isinstance(value, str):
        return {"name": value, "id": None}
    if isinstance(value, dict) and value.get("name"):
        return {"name": value.get("name"), "id": value.get("id")}
    return None


@router.get("/artist/{channel_id}")
def artist(channel_id: str) -> dict:
    raw = ytmusic.call("get_artist", channel_id, cache_key=f"artist:{channel_id}")
    if not raw or not raw.get("name"):
        raise NotFoundError("Artist not found.")

    albums_container = raw.get("albums") or {}
    singles_container = raw.get("singles") or {}
    payload = {
        "artist": {
            "id": channel_id,
            "name": raw.get("name"),
            "subscribers": raw.get("subscribers"),
            "monthlyListeners": raw.get("monthlyListeners"),
            "views": raw.get("views"),
            "description": raw.get("description"),
            "thumbnails": normalize.thumbnails(raw),
            "radioId": raw.get("radioId"),
            "shuffleId": raw.get("shuffleId"),
            "subscribed": bool(raw.get("subscribed")),
            "source": "youtube-music",
        },
        "topSongs": normalize.compact_list(_results(raw.get("songs")), lambda t: normalize.track(t, source="artist"), limit=10),
        "albums": normalize.compact_list(_results(albums_container), normalize.album, limit=24),
        "singles": normalize.compact_list(_results(singles_container), normalize.album, limit=24),
        "videos": normalize.compact_list(_results(raw.get("videos")), lambda t: normalize.track(t, source="artist"), limit=12),
        "related": normalize.compact_list(_results(raw.get("related")), normalize.artist, limit=12),
        "albumsParams": _params(albums_container),
        "singlesParams": _params(singles_container),
        "albumsShelf": albums_container.get("browseId"),
        "singlesShelf": singles_container.get("browseId"),
    }
    return payload


@router.get("/artist/{channel_id}/albums")
def artist_albums(
    channel_id: str,
    params: str = Query(min_length=1),
    shelf: str | None = Query(default=None, max_length=64),
    limit: int = Query(default=50, ge=1, le=100),
    kind: str = Query(default="albums", pattern="^(albums|singles)$"),
) -> dict:
    """Full album/single list for an artist.

    ``shelf`` is the ``browseId`` published next to ``params`` by
    :meth:`get_artist`; without it YouTube answers with the artist page again.
    """
    raw = ytmusic.call(
        "get_artist_albums",
        shelf or channel_id,
        params,
        limit,
        cache_key=f"artist-{kind}:{shelf or channel_id}:{limit}",
    )
    return {"albums": normalize.compact_list(raw, normalize.album)}


@router.get("/playlist/{playlist_id}")
def playlist(playlist_id: str) -> dict:
    raw = ytmusic.call("get_playlist", playlist_id, limit=100, cache_key=f"playlist:{playlist_id}")
    if not raw or not raw.get("title"):
        raise NotFoundError("Playlist not found.")
    tracks = normalize.compact_list(raw.get("tracks"), lambda t: normalize.track(t, source="playlist"))
    return {
        "playlist": {
            "id": playlist_id,
            "title": raw.get("title"),
            "description": raw.get("description"),
            "author": _author(raw.get("author")),
            "thumbnails": normalize.thumbnails(raw),
            "trackCount": raw.get("trackCount") or len(tracks),
            "duration": raw.get("duration_seconds"),
            "views": raw.get("views"),
            "source": "youtube-music",
        },
        "tracks": tracks,
        "suggestions": normalize.compact_list(
            raw.get("suggestions") or raw.get("related"),
            lambda t: normalize.track(t, source="playlist"),
            limit=12,
        ),
    }


@router.get("/charts")
def charts(region: str | None = Query(default=None, max_length=2)) -> dict:
    raw = ytmusic.call("get_charts", cache_key=f"charts:{region or 'default'}")
    videos = normalize.compact_list(raw.get("videos"), normalize.playlist, limit=12)
    artists = normalize.compact_list(raw.get("artists"), normalize.artist, limit=12)
    countries = (raw.get("countries") or {}).get("options") or []
    selected = ((raw.get("countries") or {}).get("selected") or {}).get("text")
    return {"playlists": videos, "artists": artists, "countries": countries, "selectedCountry": selected}


@router.get("/home")
def home(limit: int = Query(default=8, ge=1, le=20)) -> dict:
    sections = ytmusic.call("get_home", limit, cache_key=f"home:{limit}")
    out: list[dict] = []
    for section in sections if isinstance(sections, list) else []:
        title = section.get("title")
        items: list[dict] = []
        for entry in section.get("contents") or []:
            if not isinstance(entry, dict):
                continue
            if entry.get("videoId"):
                mapped = normalize.track(entry, source="home")
                if mapped:
                    items.append({"kind": "track", "item": mapped})
            elif entry.get("playlistId"):
                mapped = normalize.playlist(entry)
                if mapped:
                    items.append({"kind": "playlist", "item": mapped})
            elif entry.get("browseId"):
                mapped = normalize.album(entry)
                if mapped:
                    items.append({"kind": "album", "item": mapped})
        if title and items:
            out.append({"title": title, "items": items})
    return {"sections": out}


@router.get("/explore")
def explore() -> dict:
    raw = ytmusic.call("get_explore", cache_key="explore")
    return {
        "newReleases": normalize.compact_list(raw.get("new_releases"), normalize.album, limit=12),
        "newVideos": normalize.compact_list(raw.get("new_videos"), lambda t: normalize.track(t, source="explore"), limit=12),
        "trending": normalize.compact_list(raw.get("trending"), normalize.playlist, limit=12),
        "moodsAndGenres": normalize.compact_list(raw.get("moods_and_genres"), normalize.playlist, limit=24),
    }


@router.get("/watch/{video_id}")
def watch(video_id: str) -> dict:
    """Watch context: queue candidates, lyrics handle and related content.

    This is what powers autoplay/radio without an authenticated account.
    """
    raw = ytmusic.call("get_watch_playlist", videoId=video_id, cache_key=f"watch:{video_id}")
    tracks = normalize.compact_list(raw.get("tracks"), lambda t: normalize.track(t, source="radio"))
    return {
        "playlistId": raw.get("playlistId"),
        "lyricsBrowseId": raw.get("lyrics"),
        "relatedBrowseId": raw.get("related"),
        "tracks": tracks,
    }
