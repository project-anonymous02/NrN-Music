"""Thin, defensive wrapper around ytmusicapi.

Responsibilities:
  * own a single YTMusic client (a requests.Session is reused for every call),
  * serialise calls so the upstream is not hammered,
  * translate upstream failures into the ApiError hierarchy,
  * normalise responses (dataclasses, None values) into JSON-safe dicts.

No endpoint logic lives here: routers stay declarative.
"""

from __future__ import annotations

import dataclasses
import logging
import threading
import time
from collections.abc import Callable
from typing import Any

import requests
from ytmusicapi import YTMusic

from ..cache import TTLCache
from ..config import get_settings
from ..errors import NotFoundError, UpstreamError, UpstreamTimeout

log = logging.getLogger("nrnmusic.ytmusic")

_client: YTMusic | None = None
_client_lock = threading.Lock()
_call_lock = threading.Lock()

settings = get_settings()
metadata_cache: TTLCache[Any] = TTLCache(
    max_entries=settings.cache_max_entries, ttl=settings.metadata_cache_ttl
)


def get_client() -> YTMusic:
    """Lazily build the shared client (importing ytmusicapi is not free)."""
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = YTMusic(language=settings.language)
    return _client


def reset_client() -> None:
    """Used by tests to drop cached state."""
    global _client
    with _client_lock:
        _client = None
    metadata_cache.clear()


def _jsonify(value: Any) -> Any:
    """ytmusicapi returns dataclasses for timed lyrics; make them serialisable."""
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {field.name: _jsonify(getattr(value, field.name)) for field in dataclasses.fields(value)}
    if isinstance(value, dict):
        return {key: _jsonify(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonify(item) for item in value]
    return value


def call(method: str, *args: Any, cache_key: str | None = None, **kwargs: Any) -> Any:
    """Invoke ``YTMusic.<method>`` with caching and error translation."""
    client = get_client()
    func: Callable[..., Any] = getattr(client, method, None)
    if func is None:
        raise NotFoundError(f"Unknown resource: {method}")

    if cache_key is not None:
        cached = metadata_cache.get(cache_key)
        if cached is not None:
            return cached

    started = time.monotonic()
    try:
        with _call_lock:
            result = func(*args, **kwargs)
    except requests.exceptions.Timeout as exc:
        raise UpstreamTimeout("YouTube Music did not answer in time.") from exc
    except requests.exceptions.ConnectionError as exc:
        raise UpstreamError("Could not reach YouTube Music.", code="network_error") from exc
    except requests.exceptions.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status == 404:
            raise NotFoundError("The requested item does not exist.") from exc
        raise UpstreamError(
            f"YouTube Music rejected the request (HTTP {status or 'unknown'}).",
            code="upstream_http_error",
        ) from exc
    except Exception as exc:  # ytmusicapi raises its own error types
        message = str(exc)
        lowered = message.lower()
        if "authentication" in lowered:
            raise NotFoundError(
                "This resource requires a signed-in YouTube Music account, which NrNMusic does not use.",
                code="auth_required",
            ) from exc
        if "could not find" in lowered or "does not exist" in lowered:
            raise NotFoundError("The requested item does not exist.") from exc
        raise UpstreamError(f"YouTube Music error: {message}", code="upstream_error") from exc

    elapsed = time.monotonic() - started
    if elapsed > 2:
        log.info("slow call %s took %.2fs", method, elapsed)

    result = _jsonify(result)
    if cache_key is not None:
        metadata_cache.set(cache_key, result)
    return result
