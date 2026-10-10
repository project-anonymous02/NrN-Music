#!/usr/bin/env python3
"""End-to-end smoke test: FastAPI backend + built SPA driven by headless Chromium.

Everything runs inside this one foreground process — the server lives in a
daemon thread, Chromium is a child process, and both are torn down on exit.

It drives Chromium over the DevTools protocol so it can wait for real renders
instead of racing them (``--dump-dom`` returns before React hydrates).

Usage:  python scripts/e2e_smoke.py [--shots DIR]
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
DIST = ROOT / "frontend" / "dist"
PORT = 8123
DEBUG_PORT = 9223
BASE = f"http://127.0.0.1:{PORT}"

sys.path.insert(0, str(BACKEND))

import httpx  # noqa: E402
import uvicorn  # noqa: E402
from websockets.sync.client import connect  # noqa: E402

from app.main import app  # noqa: E402


def start_server() -> uvicorn.Server:
    config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    threading.Thread(target=server.run, daemon=True).start()
    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            if httpx.get(f"{BASE}/api/health", timeout=2).status_code == 200:
                return server
        except Exception:  # noqa: BLE001 - not listening yet
            time.sleep(0.3)
    raise SystemExit("backend did not become healthy")


class Page:
    """Tiny synchronous CDP client: navigate, wait, read, screenshot."""

    def __init__(self, ws_url: str) -> None:
        self.ws = connect(ws_url, open_timeout=15, close_timeout=5, max_size=32 * 1024 * 1024)
        self.errors: list[str] = []
        self.responses: list[tuple[str, int]] = []
        self._id = 0
        self.call("Runtime.enable")
        self.call("Log.enable")
        self.call("Page.enable")
        self.call("Network.enable")

    def call(self, method: str, params: dict | None = None) -> dict:
        self._id += 1
        message_id = self._id
        self.ws.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
        while True:
            payload = json.loads(self.ws.recv())
            if payload.get("id") == message_id:
                if "error" in payload:
                    raise RuntimeError(f"{method}: {payload['error']}")
                return payload.get("result", {})
            self._record(payload)

    def _record(self, payload: dict) -> None:
        method = payload.get("method", "")
        params = payload.get("params", {})
        if method == "Runtime.exceptionThrown":
            detail = params.get("exceptionDetails", {})
            text = detail.get("text", "exception")
            error = detail.get("exception", {}).get("description") or detail.get("url", "")
            self.errors.append(f"{text} {error}".strip())
        elif method == "Log.entryAdded":
            entry = params.get("entry", {})
            if entry.get("level") == "error":
                source = entry.get("url") or entry.get("source") or ""
                self.errors.append(f"console: {entry.get('text')} [{source}]")
        elif method == "Network.responseReceived":
            response = params.get("response", {})
            self.responses.append((response.get("url", ""), int(response.get("status", 0) or 0)))
        elif method == "Runtime.consoleAPICalled" and params.get("type") == "error":
            args = " ".join(str(arg.get("value", arg.get("description", ""))) for arg in params.get("args", []))
            self.errors.append(f"console.error: {args}")

    def navigate(self, url: str) -> None:
        self.call("Page.navigate", {"url": url})
        self._drain(1.0)

    def _drain(self, seconds: float) -> None:
        deadline = time.time() + seconds
        while time.time() < deadline:
            try:
                raw = self.ws.recv(timeout=max(0.05, deadline - time.time()))
            except TimeoutError:
                return
            self._record(json.loads(raw))

    def wait_for(self, expression: str, timeout: float = 25.0) -> bool:
        """Poll a JS boolean until it is true (or the timeout expires)."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            self._drain(0.2)
            try:
                result = self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True})
            except RuntimeError:
                time.sleep(0.2)
                continue
            if result.get("result", {}).get("value") is True:
                return True
            time.sleep(0.25)
        return False

    def evaluate(self, expression: str):
        result = self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True})
        return result.get("result", {}).get("value")

    def screenshot(self, path: Path) -> None:
        shot = self.call("Page.captureScreenshot", {"format": "png"})
        path.write_bytes(base64.b64decode(shot["data"]))

    def close(self) -> None:
        try:
            self.ws.close()
        except Exception:  # noqa: BLE001 - already gone
            pass


def new_target(url: str) -> str:
    endpoint = f"http://127.0.0.1:{DEBUG_PORT}/json/new?{urllib.parse.quote(url, safe='')}"
    request = urllib.request.Request(endpoint, method="PUT")
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)["webSocketDebuggerUrl"]



def playback_check(page: Page, shots: Path | None) -> list[str]:
    """Search for a song, start it, and prove audio really reaches the app."""
    failures: list[str] = []
    page.navigate(f"{BASE}/search")
    if not page.wait_for("!!document.querySelector('.search-bar input')", 20):
        return ["playback: the search field never rendered"]

    page.evaluate(
        "(() => {"
        " const input = document.querySelector('.search-bar input');"
        " const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;"
        " setter.call(input, 'flawed mangoes');"
        " input.dispatchEvent(new Event('input', { bubbles: true }));"
        " document.querySelector('.search-bar').requestSubmit();"
        " return true; })()"
    )
    # Wait for rendered titles: .track-row is also used by the loading
    # skeletons, which have no play button.
    if not page.wait_for("document.querySelectorAll('.track-title').length > 0", 60):
        return ["playback: search returned no song results"]

    page.evaluate("document.querySelector('.track-row .track-main').click(); true")
    if not page.wait_for("!!document.querySelector('.mini-player')", 25):
        return ["playback: the mini-player never appeared after tapping a song"]

    deadline = time.time() + 60
    stream_ok = False
    while time.time() < deadline:
        page._drain(0.5)
        if any("/api/stream/" in url and status in (200, 206) for url, status in page.responses):
            stream_ok = True
            break
    if not stream_ok:
        failures.append("playback: the /api/stream request never returned 200/206")

    first = page.evaluate("document.querySelector('.mini-progress')?.style.width ?? '0%'")
    page._drain(3)
    second = page.evaluate("document.querySelector('.mini-progress')?.style.width ?? '0%'")
    if first == second:
        detail = page.evaluate(
            "JSON.stringify({sub: document.querySelector('.mini-sub')?.textContent, width: %s})" % json.dumps(first)
        )
        failures.append(f"playback: the playhead did not advance ({detail})")
    else:
        print(f"ok    playback advances the playhead ({first} -> {second})")

    if shots:
        page.screenshot(shots / "playback.png")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--shots", type=Path, default=None, help="directory for screenshots")
    args = parser.parse_args()

    if not DIST.is_dir():
        print("frontend/dist is missing - run `npm run build` first")
        return 2
    if args.shots:
        args.shots.mkdir(parents=True, exist_ok=True)

    failures: list[str] = []
    shots = args.shots
    server = start_server()
    print(f"server ready on {BASE}")

    # CI runners ship google-chrome instead of chromium; override with NRN_CHROME.
    chrome = os.environ.get("NRN_CHROME", "chromium")

    browser = subprocess.Popen(
        [
            chrome,
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--hide-scrollbars",
            "--window-size=412,915",
            "--autoplay-policy=no-user-gesture-required",
            f"--remote-debugging-port={DEBUG_PORT}",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        ws_url = ""
        for _ in range(60):
            try:
                ws_url = new_target(f"{BASE}/")
                break
            except Exception:  # noqa: BLE001 - debug server not up yet
                time.sleep(0.5)
        if not ws_url:
            raise SystemExit("chromium DevTools endpoint never became available")

        page = Page(ws_url)

        with httpx.Client(base_url=BASE, timeout=30) as client:
            if client.get("/api/health").status_code != 200:
                failures.append("/api/health did not return 200")
            for path in ("/", "/settings", "/library", "/search"):
                if client.get(path).status_code != 200:
                    failures.append(f"{path} did not return 200")
            if 'id="root"' not in client.get("/").text:
                failures.append("index.html has no #root mount point")

        checks: list[tuple[str, str, list[str], str | None]] = [
            (
                "home renders the app shell",
                f"{BASE}/",
                ["app-shell", "app-main", "bottom-nav", "Home", "Search", "Library"],
                # Give the home feed a chance to swap skeletons for real rows
                # and to pull the lazy artwork inside the viewport; a slow
                # upstream must not fail the smoke test.
                "(() => {"
                " const visible = [...document.images].filter((img) => {"
                "   const box = img.getBoundingClientRect();"
                "   return box.width > 0 && box.bottom > 0 && box.top < window.innerHeight;"
                " });"
                " return !document.querySelector('.skeleton')"
                "   && visible.length > 0"
                "   && visible.every((img) => img.complete && img.naturalWidth > 0);"
                " })()",
            ),
            (
                "settings renders its panels",
                f"{BASE}/settings",
                ["settings-group", "setting-row", "switch", "Appearance", "Playback"],
                None,
            ),
            (
                "search renders the search bar",
                f"{BASE}/search",
                ["search-bar", "bottom-nav"],
                None,
            ),
            (
                "deep route falls back to the SPA",
                f"{BASE}/artist/UC_not_a_real_channel",
                ["app-shell"],
                None,
            ),
        ]

        for label, url, needles, settle in checks:
            page.navigate(url)
            ready = page.wait_for("document.readyState === 'complete' && !!document.querySelector('#root > *')")
            if settle:
                page.wait_for(settle, timeout=30)
            if not ready:
                failures.append(f"{label}: the app never rendered")
                print(f"FAIL  {label} (nothing rendered)")
                continue
            missing = []
            for needle in needles:
                probe = (
                    "(() => { const n = "
                    + json.dumps(needle)
                    + "; return document.body.textContent.includes(n) || !!document.querySelector('.' + n); })()"
                )
                if not page.evaluate(probe):
                    missing.append(needle)
            if missing:
                failures.append(f"{label}: missing {missing}")
                print(f"FAIL  {label}: missing {missing}")
            else:
                print(f"ok    {label}")
            if shots:
                page.screenshot(shots / (label.split()[0] + ".png"))

        failures += playback_check(page, shots)

        # The deep-route check deliberately points at a channel that does not
        # exist, so its upstream failure is an expected 502, not a regression.
        for error in page.errors:
            if "UC_not_a_real_channel" in error:
                print(f"note  expected upstream failure: {error}")
                continue
            failures.append(error)
        page.close()
    finally:
        browser.terminate()
        try:
            browser.wait(timeout=10)
        except subprocess.TimeoutExpired:
            browser.kill()
        server.should_exit = True

    print()
    if failures:
        print("E2E FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("E2E OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
