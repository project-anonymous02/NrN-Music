"""Query schemas shared by the routers."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SearchType = Literal["all", "songs", "artists", "albums", "playlists", "videos"]


class SearchQuery(BaseModel):
    q: str = Field(min_length=1, max_length=200)
    type: SearchType = "all"
    limit: int = Field(default=20, ge=1, le=50)


class ErrorBody(BaseModel):
    code: str
    message: str
    retryable: bool
