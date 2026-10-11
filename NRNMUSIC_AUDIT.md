# NrNMusic audit

## Scope

Audited the existing tracked application, README/PLAN/API contract, frontend package, backend routers/services, settings, test suite and CI configuration before feature work. Existing local untracked `.agents/` and `skills-lock.json` from skill installation were preserved. No repository remote or Git history was changed.

## Existing architecture

- Frontend: React 19, TypeScript, Vite, React Router, Zustand, Motion, Lucide and Capacitor Android wrapper (`frontend/package.json`, `frontend/src/App.tsx`, `frontend/src/main.tsx`). Routes cover Home, Search, Library, Settings, Artist, Album and Playlist.
- Backend: FastAPI + ytmusicapi for metadata and yt-dlp for stream resolution, with same-origin JSON/audio endpoints (`backend/app/main.py`, `routers/*`, `services/ytmusic.py`, `services/stream.py`). The backend is important for browser CORS and short-lived stream URL handling.
- Persistence: IndexedDB key/value stores for settings, library, history, queue, metadata and local audio (`frontend/src/lib/db.ts`); localStorage holds API-base configuration (`frontend/src/lib/api.ts`). Data is device/origin-local with memory fallback when IndexedDB is unavailable.
- Audio: one HTMLAudioElement abstraction (`frontend/src/lib/audio.ts`) feeds a Zustand player (`stores/player.ts`), which uses queue helpers and persists queue state. Media Session handlers are registered when supported. The Android Capacitor package requires a reachable backend; it is not a self-contained streaming backend.
- CI: `.github/workflows/ci.yml` checks FastAPI, runs pytest, runs TS/Vitest/build, assembles a debug Android APK on push/manual dispatch, and provides external-network E2E only on manual dispatch.

## Verified feature status

| Area | Current state | Gaps/limits |
| --- | --- | --- |
| Home/discovery | Implemented: API home/charts/explore, recent plays, local-history-based recommendation and first-run state (`pages/Home.tsx`, `lib/recommend.ts`) | Catalog depends on upstream/network; data quality varies. Existing chart artwork may be noisy at small card sizes; avoid replacing functional catalog design without visual regression review |
| Search | Implemented: typed search, suggestions/history and result kinds (`pages/Search.tsx`, `backend/app/routers/search.py`) | Depends on backend/upstream; offline search is not a full local catalog search |
| Artist/album/playlist | Implemented public detail routes and local playlist detail (`pages/ArtistAlbum.tsx`, `pages/Playlist.tsx`, `backend/app/routers/catalog.py`) | No account-backed private catalog; public endpoints may omit fields |
| Playback | Implemented play/pause/previous/next/seek/progress/error retry/speed/sleep timer/lyrics; local imported audio and remote proxy streams (`stores/player.ts`, `lib/audio.ts`, `components/FullPlayer.tsx`) | Browser/Capacitor background playback remains OS-dependent; no true streamed-audio download/offline cache |
| Queue | Implemented shuffle/repeat modes, add/next/remove/reorder/clear, state persistence and radio continuation (`lib/queue.ts`, `stores/player.ts`, `components/QueueSheet.tsx`) | Persisted queue restores list/state but session resume semantics are preference-dependent; shuffle order changes on edits by design |
| Library | Implemented local liked songs, playlists, followed artists, saved albums, recent/top tracks and imported local audio (`stores/library.ts`, `pages/Library.tsx`, `lib/localMusic.ts`) | Local-only, no device sync. “Cached” is a metadata marker and not downloaded audio. Local imported audio blobs are not included in library JSON export |
| Lyrics/context | Implemented lyrics/details/context menu and playlist picker (`components/FullPlayer.tsx`, `SongMenu.tsx`, backend lyrics route) | Lyrics availability depends on upstream; no guarantee all tracks have lyrics |
| Settings | Implemented configurable accent, motion, supported playback controls, privacy/personalization, language, backend endpoint, reset and storage display (`stores/settings.ts`, `pages/Settings.tsx`) | Canvas is fixed to absolute black and green accents are rejected; inactive crossfade/normalization/queue-policy controls were removed; sleep default now affects player choices; full backup includes history and queue |
| No-login requirement | Satisfied: app has no mandatory account/login flow; likes/playlists/history/settings are local | Remote catalog/playback availability still depends on public upstream and reachable backend; no cross-device sync |
| Tests | Existing pytest/Vitest/TypeScript tests and E2E script (`backend/tests`, `frontend/src/**/*.test.ts`, `scripts/e2e_smoke.py`) | E2E requires backend, external access and browser; Android build needs SDK/JDK |

## Keep, improve, avoid rewriting

- Keep `api.ts`/FastAPI boundary, ytmusicapi and yt-dlp integration, existing audio engine/queue helpers, IndexedDB stores, route set, i18n and CI.
- Improve user-data portability and wire animation settings consistently across JS and CSS motion; these meet explicit offline/no-account and smooth/reduced-motion goals without replacing architecture.
- Avoid an Android-native rewrite: this project is a React/Vite PWA packaged with Capacitor and uses Python for metadata/streaming. Media3 code is not portable directly.
- Do not label stream history/cache markers as offline audio downloads. User-imported audio is the current real offline path.
- Do not add authentication, payment, account sync or a new required backend service.

## Constraints and observations

The app can play public content through a FastAPI proxy but is not independent of YouTube Music/yt-dlp/upstream availability. `frontend/android` contains only the Capacitor wrapper, so Android installation still needs an accessible NrNMusic backend. IndexedDB/localStorage data is tied to the app origin/device and has browser quota/eviction constraints. Local audio files can consume significant storage. Before this pass, Settings allowed a light theme/custom background and only warned on green accent input; the updated store now enforces the black canvas and normalizes green accents.

## Security and privacy review

- No authentication, account, payment, analytics, or credential flow was added. NrNMusic's local library remains usable without login.
- Metrolist source and assets remain outside this repository. Only architectural and interaction observations are documented.
- Full backup imports are parsed as JSON and checked for app/kind/version plus settings, library, history, and queue shapes before applying state. Imported text is never evaluated as code. Queue import stops existing playback and restores the queue idle until the user presses play.
- A backup deliberately excludes local audio blobs, backend URL configuration, transient stream URLs, and stream cache. The JSON is not encrypted. Local library data does not sync between devices.
- Catalog/audio availability and upstream protocol changes remain existing architectural constraints; no universal catalog or offline stream availability is claimed.
