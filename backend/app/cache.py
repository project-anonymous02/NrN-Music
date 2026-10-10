"""Small thread-safe TTL + LRU cache.

Kept intentionally dependency free: the backend runs inside a single uvicorn
process, so an in-memory store is enough for metadata and resolved stream URLs.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from typing import Generic, TypeVar

T = TypeVar("T")


class TTLCache(Generic[T]):
    def __init__(self, max_entries: int = 512, ttl: float = 300.0, clock: Callable[[], float] = time.monotonic):
        self._max_entries = max(1, max_entries)
        self._ttl = ttl
        self._clock = clock
        self._lock = threading.Lock()
        self._data: OrderedDict[str, tuple[float, T]] = OrderedDict()

    def get(self, key: str) -> T | None:
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= self._clock():
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key: str, value: T, ttl: float | None = None) -> None:
        with self._lock:
            self._data[key] = (self._clock() + (self._ttl if ttl is None else ttl), value)
            self._data.move_to_end(key)
            while len(self._data) > self._max_entries:
                self._data.popitem(last=False)

    def pop(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._data)

    def get_or_set(self, key: str, factory: Callable[[], T], ttl: float | None = None) -> T:
        cached = self.get(key)
        if cached is not None:
            return cached
        value = factory()
        self.set(key, value, ttl=ttl)
        return value
