# NrNMusic audit

## Scope

Audited the existing tracked application, README/PLAN/API contract, frontend package, backend routers/services, settings, test suite and CI configuration before feature work. Existing local untracked `.agents/` and `skills-lock.json` from skill installation were preserved. No repository remote or Git history was changed.

## Original architecture (before native Android replacement)

- Frontend: React 19, TypeScript, Vite, React Router, Zustand, Motion, Lucide and Capacitor Android wrapper (`frontend/package.json`, `frontend/src/App.tsx`, `frontend/src/main.tsx`). Routes cover Home, Search, Library, Settings, Artist, Album and Playlist.
- Backend: FastAPI + ytmusicapi for metadata and yt-dlp for stream resolution, with same-origin JSON/audio endpoints (`backend/app/main.py`, `routers/*`, `services/ytmusic.py`, `services/stream.py`). The backend is important for browser CORS and short-lived stream URL handling.
- Persistence: IndexedDB key/value stores for settings, library, history, queue, metadata and local audio (`frontend/src/lib/db.ts`); localStorage holds API-base configuration (`frontend/src/lib/api.ts`). Data is device/origin-local with memory fallback when IndexedDB is unavailable.
- Audio: one HTMLAudioElement abstraction (`frontend/src/lib/audio.ts`) feeds a Zustand player (`stores/player.ts`), which uses queue helpers and persists queue state. The former Capacitor APK called the FastAPI service and was not standalone.
- CI: `.github/workflows/ci.yml` checks FastAPI, runs pytest, runs TS/Vitest/build, and now assembles the native Android app in `native-android` on push/manual dispatch. External-network E2E remains manual.

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

## Android architecture decision

- The user explicitly requested a total Android architecture replacement. `native-android` now contains the GPL-3.0 native application and `:innertube` module, with direct InnerTube access and Media3 playback. CI builds this module; it no longer builds the Capacitor wrapper as the Android app.
- The React/FastAPI web deployment is retained separately for now. It is not bundled or called by the native APK. This keeps the existing web implementation while removing its backend requirement from Android.
- Native implementation uses upstream Metrolist source as a fork. Upstream copyright/license notices are retained; the Android build uses NrNMusic application ID, app label, and launcher assets.
- Do not label stream history/cache markers as offline audio downloads. User-imported audio is the current real offline path.
- Do not add authentication, payment, account sync or a new required backend service.

## Constraints and observations

The native APK no longer requires NrNMusic FastAPI, but it still depends on internet access and YouTube's undocumented InnerTube protocol for remote catalog/playback. Upstream changes can break playback or discovery. Native local data is stored on-device. The retained web build still requires FastAPI for remote catalog and streams; it has a separate architecture and is not the Android APK.

## Security and privacy review

- No authentication, account, payment, analytics, or credential flow was added. NrNMusic's local library remains usable without login.
- The native app source is a GPL-3.0 fork of Metrolist and retains upstream copyright notices; see `native-android/LICENSE` and `native-android/FORK_NOTICE.md`.
- Full backup imports are parsed as JSON and checked for app/kind/version plus settings, library, history, and queue shapes before applying state. Imported text is never evaluated as code. Queue import stops existing playback and restores the queue idle until the user presses play.
- A backup deliberately excludes local audio blobs, backend URL configuration, transient stream URLs, and stream cache. The JSON is not encrypted. Local library data does not sync between devices.
- Catalog/audio availability and upstream protocol changes remain existing architectural constraints; no universal catalog or offline stream availability is claimed.
