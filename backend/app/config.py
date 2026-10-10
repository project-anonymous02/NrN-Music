"""Runtime configuration for the NrNMusic backend.

Every value is read from the environment and falls back to a safe default so the
service can start on a clean machine without a .env file.
"""

from __future__ import annotations

import os
from functools import lru_cache


def _split_csv(raw: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in raw.split(",") if part.strip())


def _bool(raw: str, default: bool) -> bool:
    if raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    """Immutable view over the process environment."""

    def __init__(self) -> None:
        self.app_name = "NrNMusic API"
        self.host = os.getenv("HOST", "127.0.0.1")
        self.port = int(os.getenv("PORT", "8000"))
        self.log_level = os.getenv("LOG_LEVEL", "info").lower()

        # Region used by YouTube Music responses (ISO 3166-1 alpha-2).
        self.region = os.getenv("YT_REGION", "US").strip().upper() or "US"
        self.language = os.getenv("YT_LANGUAGE", "en").strip().lower() or "en"

        origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
        self.cors_origins: tuple[str, ...] = _split_csv(origins)

        self.metadata_cache_ttl = float(os.getenv("METADATA_CACHE_TTL", "300"))
        self.stream_cache_ttl = float(os.getenv("STREAM_CACHE_TTL", "1800"))
        self.cache_max_entries = int(os.getenv("CACHE_MAX_ENTRIES", "512"))

        # Seconds before an entry is considered expired inside the resolver.
        self.stream_refresh_margin = float(os.getenv("STREAM_REFRESH_MARGIN", "120"))
        self.upstream_timeout = float(os.getenv("UPSTREAM_TIMEOUT", "15"))
        self.stream_resolve_timeout = float(os.getenv("STREAM_RESOLVE_TIMEOUT", "30"))

        self.rate_limit_per_minute = int(os.getenv("RATE_LIMIT_PER_MINUTE", "240"))
        self.enable_stream_redirect = _bool(os.getenv("ENABLE_STREAM_REDIRECT", "1"), True)
        self.proxy_stream = _bool(os.getenv("PROXY_STREAM", "1"), True)

    @property
    def version(self) -> str:
        return "0.1.0"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
