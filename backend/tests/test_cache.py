from __future__ import annotations

import pytest

from app.cache import TTLCache


def test_returns_none_for_missing_key():
    cache: TTLCache[str] = TTLCache(max_entries=4, ttl=10)
    assert cache.get("nope") is None


def test_stores_and_returns_value():
    cache: TTLCache[str] = TTLCache(max_entries=4, ttl=10)
    cache.set("a", "value")
    assert cache.get("a") == "value"


def test_entry_expires_after_ttl():
    now = [0.0]
    cache: TTLCache[str] = TTLCache(max_entries=4, ttl=10, clock=lambda: now[0])
    cache.set("a", "value")
    now[0] = 9.0
    assert cache.get("a") == "value"
    now[0] = 10.5
    assert cache.get("a") is None


def test_per_entry_ttl_overrides_default():
    now = [0.0]
    cache: TTLCache[str] = TTLCache(max_entries=4, ttl=100, clock=lambda: now[0])
    cache.set("short", "v", ttl=5)
    cache.set("long", "v")
    now[0] = 6.0
    assert cache.get("short") is None
    assert cache.get("long") == "v"


def test_evicts_oldest_when_full():
    cache: TTLCache[str] = TTLCache(max_entries=2, ttl=100)
    cache.set("1", "a")
    cache.set("2", "b")
    cache.set("3", "c")
    assert cache.get("1") is None
    assert cache.get("2") == "b"
    assert cache.get("3") == "c"
    assert len(cache) == 2


def test_get_refreshes_recency():
    cache: TTLCache[str] = TTLCache(max_entries=2, ttl=100)
    cache.set("1", "a")
    cache.set("2", "b")
    assert cache.get("1") == "a"  # promote 1
    cache.set("3", "c")  # evicts 2 instead of 1
    assert cache.get("1") == "a"
    assert cache.get("2") is None


def test_get_or_set_only_calls_factory_once():
    cache: TTLCache[str] = TTLCache(max_entries=4, ttl=10)
    calls = {"n": 0}

    def factory() -> str:
        calls["n"] += 1
        return "made"

    assert cache.get_or_set("k", factory) == "made"
    assert cache.get_or_set("k", factory) == "made"
    assert calls["n"] == 1


def test_pop_and_clear():
    cache: TTLCache[str] = TTLCache(max_entries=4, ttl=10)
    cache.set("a", "1")
    cache.pop("a")
    assert cache.get("a") is None
    cache.set("b", "2")
    cache.clear()
    assert len(cache) == 0
