from __future__ import annotations

from app import normalize


def test_track_parses_seconds_and_text():
    item = {
        "videoId": "Yjbepc8pECI",
        "title": "The Beginning",
        "artists": [{"name": "Flawed Mangoes", "id": "UC123"}],
        "album": {"name": "Indie", "id": "MPREb_x"},
        "duration_seconds": 175,
        "thumbnails": [{"url": "https://img", "width": 60, "height": 60}],
        "views": "1M",
        "isExplicit": False,
    }
    track = normalize.track(item)
    assert track is not None
    assert track["id"] == "Yjbepc8pECI"
    assert track["duration"] == 175
    assert track["durationText"] == "2:55"
    assert track["artists"][0]["name"] == "Flawed Mangoes"
    assert track["album"]["name"] == "Indie"
    assert track["explicit"] is False


def test_track_accepts_duration_string():
    track = normalize.track({"videoId": "abcdefghijk", "title": "X", "duration": "1:02:03"})
    assert track is not None
    assert track["duration"] == 3723
    assert track["durationText"] == "1:02:03"


def test_track_requires_id_and_title():
    assert normalize.track({"title": "no id"}) is None
    assert normalize.track({"videoId": "abcdefghijk"}) is None


def test_artists_accepts_strings_and_dicts():
    assert normalize.artists(["Solo", {"name": "Duo", "id": "UC1"}]) == [
        {"name": "Solo", "id": None},
        {"name": "Duo", "id": "UC1"},
    ]
    assert normalize.artists(None) == []
    assert normalize.artists({"name": "One"}) == [{"name": "One", "id": None}]


def test_album_and_playlist_shapes():
    album = normalize.album({"browseId": "MPREb_1", "title": "Album", "year": "2013", "artists": ["A"]})
    assert album is not None and album["id"] == "MPREb_1" and album["artists"][0]["name"] == "A"

    playlist = normalize.playlist({"browseId": "PL1", "title": "Mix", "author": "Someone", "itemCount": 20})
    assert playlist is not None and playlist["itemCount"] == 20


def test_artist_reads_subscribers():
    artist = normalize.artist({"browseId": "UC1", "title": "Name", "subscribers": "314K"})
    assert artist is not None
    assert artist["name"] == "Name"
    assert artist["subscribers"] == "314K"


def test_dedupe_keeps_first_occurrence():
    items = [{"id": "1"}, {"id": "1"}, {"id": "2"}]
    assert [i["id"] for i in normalize.dedupe(items)] == ["1", "2"]


def test_compact_list_skips_unmappable():
    def mapper(item):
        return {"id": item["ok"]} if "ok" in item else None

    raw = [{"ok": 1}, {"bad": 2}, {"ok": 3}]
    assert [x["id"] for x in normalize.compact_list(raw, mapper)] == [1, 3]


def test_seconds_to_text_edge_cases():
    assert normalize.seconds_to_text(None) is None
    assert normalize.seconds_to_text(0) == "0:00"
    assert normalize.seconds_to_text(59) == "0:59"
    assert normalize.seconds_to_text(60) == "1:00"


def test_seconds_parses_invalid_to_none():
    assert normalize._seconds("not-a-time") is None
    assert normalize._seconds(None) is None
    assert normalize._seconds(42) == 42
