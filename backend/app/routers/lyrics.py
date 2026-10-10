from __future__ import annotations

from fastapi import APIRouter, Query

from ..errors import NotFoundError
from ..services import ytmusic

router = APIRouter(prefix="/api", tags=["lyrics"])


@router.get("/lyrics/{browse_id}")
def lyrics(browse_id: str, timed: bool = Query(default=False)) -> dict:
    """Lyrics are fetched with the ``MPLYt…`` handle returned by ``/api/watch``.

    Passing a videoId here is a programming error and yields HTTP 400 upstream,
    which is why the handle is validated before the call.
    """
    if not browse_id.startswith("MPLYt"):
        raise NotFoundError("No lyrics handle is available for this track.")

    raw = ytmusic.call("get_lyrics", browse_id, timed, cache_key=f"lyrics:{browse_id}:{int(timed)}")
    if raw is None:
        raise NotFoundError("Lyrics are not available for this track.")

    payload = raw if isinstance(raw, dict) else {}
    lines = payload.get("lyrics")

    if isinstance(lines, list):  # timed lyrics: list of LyricLine dataclasses
        parsed = [
            {
                "text": getattr(line, "text", None) if not isinstance(line, dict) else line.get("text"),
                "startTimeMs": int(getattr(line, "startTimeMs", 0) if not isinstance(line, dict) else line.get("startTimeMs", 0)),
                "durationMs": int(getattr(line, "durationMs", 0) if not isinstance(line, dict) else line.get("durationMs", 0)),
            }
            for line in lines
        ]
        return {
            "available": True,
            "synced": True,
            "source": "youtube-music",
            "lines": parsed,
            "text": "\n".join(entry["text"] for entry in parsed if entry["text"]),
        }

    if isinstance(lines, str) and lines.strip():
        return {
            "available": True,
            "synced": False,
            "source": "youtube-music",
            "lines": [{"text": row, "startTimeMs": None, "durationMs": None} for row in lines.split("\n")],
            "text": lines,
        }

    raise NotFoundError("Lyrics are not available for this track.")
