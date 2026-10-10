"""Audio stream resolution.

ytmusicapi cannot produce playable URLs: every adaptive format returned by
``get_song`` carries a ``signatureCipher`` instead of a URL (verified in
RESEARCH.md §2.1). yt-dlp performs the player-JavaScript decryption and hands
back a direct googlevideo URL that honours HTTP range requests (RESEARCH.md §2.2).

Stream URLs expire (~6 hours), so they are cached with a safety margin and
re-resolved on demand.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from dataclasses import dataclass
from typing import Any

from yt_dlp import YoutubeDL

from ..config import get_settings
from ..errors import InvalidRequest, NotFoundError, StreamUnavailable
from ..cache import TTLCache

log = logging.getLogger("nrnmusic.stream")

settings = get_settings()

# ``ext`` -> yt-dlp format selector. Both options are pre-muxed audio-only
# streams, which matters because ffmpeg is not available in this environment.
FORMAT_SELECTORS = {
    "m4a": "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio",
    "opus": "bestaudio[ext=webm]/bestaudio[acodec^=opus]/bestaudio",
    "auto": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
}

# YouTube video ids are always 11 URL-safe characters; anything else is a bug
# or an injection attempt and is rejected before touching yt-dlp.
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


@dataclass(frozen=True)
class StreamInfo:
    video_id: str
    url: str
    ext: str
    acodec: str
    abr: float | None
    filesize: int | None
    expires_at: float

    @property
    def content_type(self) -> str:
        return "audio/mp4" if self.ext == "m4a" else ("audio/webm" if self.ext == "webm" else "application/octet-stream")

    @property
    def remaining(self) -> float:
        return max(0.0, self.expires_at - time.time())

    def as_dict(self) -> dict[str, Any]:
        return {
            "videoId": self.video_id,
            "ext": self.ext,
            "acodec": self.acodec,
            "bitrate": self.abr,
            "filesize": self.filesize,
            "contentType": self.content_type,
            "expiresIn": round(self.remaining),
        }


class StreamResolver:
    def __init__(self) -> None:
        self._cache: TTLCache[StreamInfo] = TTLCache(max_entries=128, ttl=settings.stream_cache_ttl)
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    @staticmethod
    def _key(video_id: str, ext: str) -> str:
        return f"{video_id}:{ext}"

    def _lock_for(self, video_id: str) -> threading.Lock:
        with self._locks_guard:
            if len(self._locks) > 512:
                self._locks.clear()
            lock = self._locks.get(video_id)
            if lock is None:
                lock = threading.Lock()
                self._locks[video_id] = lock
            return lock

    def invalidate(self, video_id: str) -> None:
        for ext in FORMAT_SELECTORS:
            self._cache.pop(self._key(video_id, ext))

    def resolve(self, video_id: str, ext: str = "auto", *, force: bool = False) -> StreamInfo:
        if not VIDEO_ID_RE.fullmatch(video_id or ""):
            raise InvalidRequest("A valid YouTube videoId is required.")
        if ext not in FORMAT_SELECTORS:
            raise InvalidRequest("Unsupported audio format requested.")

        key = self._key(video_id, ext)
        if not force:
            cached = self._cache.get(key)
            if cached is not None and cached.remaining > settings.stream_refresh_margin:
                return cached

        with self._lock_for(video_id):
            if not force:
                cached = self._cache.get(key)
                if cached is not None and cached.remaining > settings.stream_refresh_margin:
                    return cached
            info = self._extract(video_id, ext)
            self._cache.set(key, info)
            return info

    def _extract(self, video_id: str, ext: str) -> StreamInfo:
        url = f"https://www.youtube.com/watch?v={video_id}"
        opts: dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "skip_download": True,
            "format": FORMAT_SELECTORS[ext],
            "socket_timeout": settings.upstream_timeout,
            "retries": 2,
        }
        started = time.monotonic()
        try:
            with YoutubeDL(opts) as ydl:
                data = ydl.extract_info(url, download=False)
        except Exception as exc:  # yt-dlp raises many specialised errors
            message = str(exc)
            lowered = message.lower()
            if "unavailable" in lowered or "private" in lowered or "removed" in lowered:
                raise NotFoundError("This track is unavailable or has been removed.") from exc
            log.warning("yt-dlp failed for %s: %s", video_id, message[:300])
            raise StreamUnavailable("Could not resolve an audio source for this track.") from exc

        entry = data
        if data.get("requested_formats"):
            entry = data["requested_formats"][0]

        stream_url = entry.get("url")
        if not stream_url:
            raise StreamUnavailable("YouTube did not provide a playable audio URL.")

        duration = time.monotonic() - started
        if duration > 2:
            log.info("resolved %s in %.2fs", video_id, duration)

        expires_at = time.time() + _expiry_seconds(data, entry)
        return StreamInfo(
            video_id=video_id,
            url=stream_url,
            ext=(entry.get("ext") or "m4a"),
            acodec=(entry.get("acodec") or "unknown"),
            abr=entry.get("abr"),
            filesize=entry.get("filesize") or entry.get("filesize_approx"),
            expires_at=expires_at,
        )

    def clear(self) -> None:
        self._cache.clear()


def _expiry_seconds(data: dict[str, Any], entry: dict[str, Any]) -> float:
    """Best effort expiry: yt-dlp exposes http_headers.Expires on some formats."""
    headers = entry.get("http_headers") or data.get("http_headers") or {}
    raw = headers.get("Expires")
    if raw:
        try:
            import email.utils

            parsed = email.utils.parsedate_to_datetime(str(raw))
            return max(60.0, parsed.timestamp() - time.time())
        except Exception:
            pass
    return 3600.0 * 5  # conservative default: YouTube keeps URLs alive ~6 hours


resolver = StreamResolver()
