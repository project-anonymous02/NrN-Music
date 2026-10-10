"""Regression test for the stream proxy body lifetime.

``TestClient`` buffers the ASGI response inside ``client.send``, which hides a
real-server bug: when the endpoint's ``httpx.AsyncClient`` context manager
closed on return, ``StreamingResponse`` delivered zero bytes while still
declaring Content-Length. This test runs uvicorn for real, so the same
mistake cannot come back unnoticed.
"""

from __future__ import annotations

import socket
import threading
import time

import httpx
import pytest
import uvicorn
from fastapi.testclient import TestClient

from app.main import app


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture(scope="module")
def live_server():
    port = _free_port()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            if httpx.get(f"http://127.0.0.1:{port}/api/health", timeout=2).status_code == 200:
                break
        except Exception:  # noqa: BLE001 - still starting up
            time.sleep(0.3)
    else:  # pragma: no cover - environment problem
        raise RuntimeError("uvicorn did not start")

    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    thread.join(timeout=15)


@pytest.mark.live
def test_proxy_delivers_every_declared_byte(live_server: str):
    with TestClient(app) as client:
        search = client.get("/api/search", params={"q": "flawed mangoes the beginning", "type": "songs"}).json()
    video_id = search["results"][0]["item"]["id"]

    with httpx.Client(timeout=60) as http:
        with http.stream(
            "GET",
            f"{live_server}/api/stream/{video_id}",
            headers={"Range": "bytes=0-65535"},
        ) as response:
            assert response.status_code == 206
            declared = int(response.headers["content-length"])
            received = 0
            for chunk in response.iter_raw():
                received += len(chunk)

    assert declared == 65536
    assert received == declared, f"proxy truncated the body: {received}/{declared} bytes"
