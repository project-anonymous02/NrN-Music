from __future__ import annotations

from fastapi import APIRouter

from ..config import get_settings
from ..services import ytmusic

router = APIRouter(tags=["meta"])
settings = get_settings()


@router.get("/api/health")
def health() -> dict:
    import ytmusicapi
    import yt_dlp

    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.version,
        "region": settings.region,
        "dependencies": {
            "ytmusicapi": getattr(ytmusicapi, "__version__", "unknown"),
            "yt-dlp": yt_dlp.version.__version__,
        },
        "cacheEntries": len(ytmusic.metadata_cache),
    }
