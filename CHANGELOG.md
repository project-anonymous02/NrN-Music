# Changelog

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
