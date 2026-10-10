"""Documentation contract: docs/API.md must match the routes FastAPI serves.

The plan (PLAN.md, section "Integration") calls for an endpoint contract test.
We compare the generated OpenAPI paths against the markdown table so the docs
cannot silently drift from the implementation.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.main import app

DOC = Path(__file__).resolve().parents[2] / "docs" / "API.md"
METHOD = "get"


def _shape(path: str) -> str:
    """Normalize ``/api/song/{video_id}`` and ``/api/song/{videoId}`` to one form."""
    return re.sub(r"\{[^}]*\}", "{}", path)


def openapi_paths() -> set[str]:
    return {_shape(p) for p, ops in app.openapi()["paths"].items() if METHOD in ops}


def documented_paths() -> set[str]:
    text = DOC.read_text(encoding="utf-8")
    found = set()
    for match in re.finditer(r"`(GET\s+[^`]+)`", text):
        raw = match.group(1).split(None, 1)[1].strip()
        found.add(_shape(raw.split("?")[0].strip()))
    return found


def test_docs_exist() -> None:
    assert DOC.is_file(), "docs/API.md is missing"


def test_every_documented_endpoint_is_served() -> None:
    missing = documented_paths() - openapi_paths()
    assert not missing, f"docs list endpoints the app does not serve: {sorted(missing)}"


def test_every_served_endpoint_is_documented() -> None:
    undocumented = openapi_paths() - documented_paths()
    assert not undocumented, f"undocumented endpoints: {sorted(undocumented)}"
