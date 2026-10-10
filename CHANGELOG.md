# Changelog

## 0.3.0 — 2026-10-10

Automatic backend discovery for the Android app — no IP typing.

### Added
- Backend UDP discovery beacon (`backend/app/discovery.py`): broadcasts `{"app":"nrnmusic","port":8000,"name":"<host>"}` to `255.255.255.255` and the directed broadcast every 2 s while the API runs. Enabled by default; tune with `DISCOVERY_ENABLED`, `DISCOVERY_PORT` (47855), `DISCOVERY_INTERVAL`.
- Native Capacitor plugin `LanDiscovery` (`frontend/android/.../LanDiscoveryPlugin.java`): listens on UDP 47855 for beacons and reports the device's own IPv4 (`localIp`) so the app can bound a subnet scan.
- Frontend `src/lib/discovery.ts`: tries the UDP beacon first, falls back to a bounded-concurrency sweep of the device's /24 on port 8000 probing `/api/health`; first healthy base is persisted via `setApiBase`.
- Boot-time auto-connect (`main.tsx`): native builds discover the backend **before** first paint, so the app opens connected instead of showing "Backend tidak terjangkau".
- Home error screen retry now re-runs discovery before reloading.

### Changed
- `HOST` now defaults to `0.0.0.0` so phones on the LAN can actually reach the API (a loopback bind made discovery useless).
- Stream proxy now follows upstream redirects (`follow_redirects=True`): the CDN sometimes answers 302 to a stale host, which was previously relayed to the browser as a non-audio response.
- `capacitor.config.ts` sets `android.allowMixedContent` so the `https://localhost` WebView can call `http://<lan-ip>:8000`.
- Settings → Server still allows a manual override; auto-discovery only fills the base when none is set or the current one is unreachable.

## 0.2.0 — 2026-10-10

Android build + CI automation.

### Added
- Capacitor 8 Android wrapper (`frontend/android`, appId `com.nrnmusic.app`, minSdk 24, target/compileSdk 36) bundling the built SPA.
- Configurable backend address: **Settings → Server** stores `nrn:apiBase` in localStorage; `api.ts` prefixes every request and stream URL with it (empty = same origin, web builds unchanged).
- CI job `android` in `.github/workflows/ci.yml`: JDK 21 + Gradle + SDK platform 36, `npx cap sync android`, `./gradlew assembleDebug`, uploads `NrNMusic-debug-<sha>.apk` as the `NrNMusic-debug-apk` artifact (push to `main` and manual dispatch; skipped on PRs).
- `NRN_CHROME` env in `scripts/e2e_smoke.py` so the E2E job can use the runner's `google-chrome`.

### Changed
- CORS defaults now include the Capacitor WebView origins (`capacitor://localhost`, `https://localhost`, `http://localhost`).
- Audio engine sets `crossOrigin` only for same-origin streams; a remote API base plays as ordinary cross-origin media.

## 0.1.0 — 2026-10-10

Initial build of NrNMusic: a Spotify-inspired player/streaming app over YouTube Music metadata.

### Research & planning
- Empirical spike for `ytmusicapi`, `yt-dlp`, and the `googlevideo.com` CDN (`RESEARCH.md`): metadata vs. stream responsibilities, URL expiry (~6 h), missing CORS headers, shelf/`params` requirements for artist pagination, OAuth limits.
- Architecture and roadmap in `PLAN.md`.

### Backend (`backend/`, FastAPI)
- Routers: `/api/health`, `/api/search`, `/api/suggest`, `/api/home`, `/api/explore`, `/api/charts`, `/api/song`, `/api/album`, `/api/artist`, `/api/artist/{id}/albums`, `/api/playlist`, `/api/watch`, `/api/lyrics`, `/api/stream/{id}/meta`, `/api/stream/{id}`.
- Bounded TTL/LRU caches, per-IP rate limiting, uniform `{"error":{code,message,retryable}}` envelope, CORS, CSP, SPA fallback for deep links.
- Range-aware audio proxy with thread-pool resolver and lazy body streaming.
- Tests: `pytest` — 32 passed (unit + `@pytest.mark.live`), including a regression test that asserts every declared byte is delivered by a real uvicorn server.

### Frontend (`frontend/`, React 19 + Vite + TypeScript)
- Pages: Home, Search, Library, Settings, Artist, Album, Playlist; persistent player shell with queue, media-session, and keyboard shortcuts.
- State: Zustand stores for player/queue, library, history, settings; IndexedDB persistence for library/history/queue; localStorage for settings.
- i18n: English + Indonesian, RTL-safe tokens, light/dark via design tokens (no green accent).
- Tests: `tsc -b` clean, `vitest` 52 tests in 5 files.

### Tooling
- `scripts/e2e_smoke.py`: boots uvicorn + built SPA under headless Chromium over CDP; asserts app shell, settings, search, deep-route fallback, and real audio playback (stream 200/206 + advancing playhead) with console-error capture and screenshots in `artifacts/`.

### Fixed during the build
- Stream proxy closed its `httpx` client before the body generator ran, producing a 0-byte response behind a real server (`ERR_CONTENT_LENGTH_MISMATCH`); `TestClient` buffered and hid the bug. The client now lives until the generator's `finally`.
- `recommend.summarize` keyed artists case-sensitively, so `scoreTrack` missed artist matches; keys are normalized.
- Search page rendered an empty "Recent searches" header when history was empty; the header now only appears with entries.

### Known limits
- Streaming depends on YouTube availability; audio quality is limited to what the CDN offers (`auto`/`m4a`/`webm`), no transcoding (ffmpeg is not assumed).
- No accounts/playlists uploads: likes, playlists, and history are stored locally; YouTube Music OAuth is optional and local-only.
