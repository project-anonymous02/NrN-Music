from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.stream import resolver
from app.errors import InvalidRequest


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def error_envelope(response) -> dict:
    body = response.json()
    assert "error" in body, f"expected error envelope, got {body}"
    return body["error"]


def test_health_reports_dependencies(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "ytmusicapi" in payload["dependencies"]
    assert "yt-dlp" in payload["dependencies"]


def test_search_requires_query(client: TestClient):
    response = client.get("/api/search", params={"q": ""})
    assert response.status_code == 422
    error = error_envelope(response)
    assert error["code"] == "invalid_request"
    assert error["retryable"] is False


@pytest.mark.live
def test_search_returns_normalised_tracks(client: TestClient):
    response = client.get("/api/search", params={"q": "bohemian rhapsody", "type": "songs", "limit": 5})
    assert response.status_code == 200
    results = response.json()["results"]
    assert results, "search returned no results"
    assert results[0]["kind"] == "track"
    track = results[0]["item"]
    assert track["id"] and len(track["id"]) == 11
    assert track["title"]
    assert track["artists"][0]["name"]
    assert isinstance(track["duration"], int)


@pytest.mark.live
def test_search_all_mixes_kinds(client: TestClient):
    response = client.get("/api/search", params={"q": "daft punk", "type": "all", "limit": 10})
    assert response.status_code == 200
    kinds = {entry["kind"] for entry in response.json()["results"]}
    assert kinds & {"track", "artist", "album", "playlist"}


@pytest.mark.live
def test_suggestions(client: TestClient):
    response = client.get("/api/suggest", params={"q": "flaw"})
    assert response.status_code == 200
    suggestions = response.json()["suggestions"]
    assert suggestions and all("text" in item for item in suggestions)


@pytest.mark.live
def test_album_detail(client: TestClient):
    search = client.get("/api/search", params={"q": "random access memories", "type": "albums"}).json()
    album_id = search["results"][0]["item"]["id"]
    response = client.get(f"/api/album/{album_id}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["album"]["title"]
    assert len(payload["tracks"]) > 1
    assert payload["tracks"][0]["id"]


@pytest.mark.live
def test_artist_detail_and_shelf(client: TestClient):
    search = client.get("/api/search", params={"q": "flawed mangoes", "type": "artists"}).json()
    channel_id = search["results"][0]["item"]["id"]
    response = client.get(f"/api/artist/{channel_id}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["artist"]["name"]
    assert payload["topSongs"], "artist top songs missing"
    if payload["singlesShelf"] and payload["singlesParams"]:
        shelf = client.get(
            f"/api/artist/{channel_id}/albums",
            params={"shelf": payload["singlesShelf"], "params": payload["singlesParams"], "kind": "singles", "limit": 5},
        )
        assert shelf.status_code == 200
        assert shelf.json()["albums"]


@pytest.mark.live
def test_watch_context_and_lyrics(client: TestClient):
    search = client.get("/api/search", params={"q": "bohemian rhapsody", "type": "songs"}).json()
    video_id = search["results"][0]["item"]["id"]
    watch = client.get(f"/api/watch/{video_id}")
    assert watch.status_code == 200
    payload = watch.json()
    assert payload["tracks"], "watch playlist should propose follow-up tracks"

    lyrics_handle = payload["lyricsBrowseId"]
    assert lyrics_handle and lyrics_handle.startswith("MPLYt")
    lyrics = client.get(f"/api/lyrics/{lyrics_handle}")
    assert lyrics.status_code == 200
    assert lyrics.json()["available"] is True
    assert lyrics.json()["lines"]

    timed = client.get(f"/api/lyrics/{lyrics_handle}", params={"timed": True})
    assert timed.status_code == 200
    assert timed.json()["synced"] is True
    assert timed.json()["lines"][0]["startTimeMs"] >= 0


def test_lyrics_rejects_non_handle(client: TestClient):
    response = client.get("/api/lyrics/videoIdValue")
    assert response.status_code == 404
    assert error_envelope(response)["code"] == "not_found"


def test_invalid_video_id_is_rejected_before_upstream(client: TestClient):
    # 4 characters: fails the 11-character YouTube id rule, so no upstream call.
    response = client.get("/api/stream/abc/meta")
    assert response.status_code == 400
    error = error_envelope(response)
    assert error["code"] == "invalid_request"
    assert error["retryable"] is False


def test_resolver_rejects_bad_input():
    with pytest.raises(InvalidRequest):
        resolver.resolve("short", "auto")
    with pytest.raises(InvalidRequest):
        resolver.resolve("Yjbepc8pECI", "flac")


@pytest.mark.live
def test_unknown_video_id_returns_404(client: TestClient):
    """Eleven legal characters that do not exist must not be treated as a server error."""
    response = client.get("/api/stream/zzzzzzzzzzz/meta")
    assert response.status_code == 404
    assert error_envelope(response)["retryable"] is False


@pytest.mark.live
def test_stream_meta_and_range_proxy(client: TestClient):
    search = client.get("/api/search", params={"q": "flawed mangoes the beginning", "type": "songs"}).json()
    video_id = search["results"][0]["item"]["id"]

    meta = client.get(f"/api/stream/{video_id}/meta")
    assert meta.status_code == 200
    payload = meta.json()
    assert payload["contentType"] in {"audio/mp4", "audio/webm"}
    assert payload["expiresIn"] > 0

    ranged = client.get(f"/api/stream/{video_id}", headers={"Range": "bytes=0-1023"})
    assert ranged.status_code == 206
    assert ranged.headers["content-range"].startswith("bytes 0-1023/")
    assert len(ranged.content) == 1024
    assert ranged.headers["content-type"].startswith("audio/")

    second = client.get(f"/api/stream/{video_id}", headers={"Range": "bytes=5000-5999"})
    assert second.status_code == 206
    assert len(second.content) == 1000

    assert client.headers is not None
    redirect = client.get(f"/api/stream/{video_id}", params={"redirect": True}, follow_redirects=False)
    assert redirect.status_code == 302
    assert "googlevideo.com" in redirect.headers["location"]
