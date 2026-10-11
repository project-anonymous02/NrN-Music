# NrNMusic upgrade plan

## Direction

The user requested a total Android replacement so the installed app opens directly, like Metrolist, without a NrNMusic backend or manually entered URL. The APK is now a native Kotlin/Jetpack Compose fork based on the locally inspected Metrolist source. It uses direct InnerTube catalog/stream paths, Media3 playback, local Android persistence, and NrNMusic app branding. The old React/FastAPI web deployment remains separate and is not called by this Android build.

## Work map

| Priority | Upgrade | Files | Risk | Success criteria |
| --- | --- | --- | --- | --- |
| P0 | Record reference analysis, current project audit and an implementation plan | `METROLIST_ANALYSIS.md`, `NRNMUSIC_AUDIT.md`, `UPGRADE_PLAN.md` | Low | Findings point to inspected source paths; platform/account constraints are stated accurately |
| P1 | Make app motion preferences govern Motion animations and give every JS transition the same reduced-motion policy; honor per-feature animation toggles and system preference | `frontend/src/main.tsx`, `frontend/src/components/{MiniPlayer,FullPlayer,Sheet,Toasts}.tsx`, optionally shared motion helper | Medium: broad visible state transitions; must keep open/close and interaction behavior correct | Typecheck/build pass; user setting and OS reduced-motion remove travel/scale motion; disabling a component toggle removes its animation |
| P1 | Enforce the mandated black canvas and prevent green accent values through Settings or imported settings | `frontend/src/stores/settings.ts`, `frontend/src/pages/Settings.tsx`, settings tests | Low: normalizes legacy light theme/background values to project identity | Root canvas remains `#000000`, dark surfaces stay active, and imported/selected green accents resolve to the default warm accent |
| P1 | Add one validated local backup format for settings, library, history and queue while retaining existing per-section import/export; clearly exclude large local audio blobs and stream cache | `frontend/src/pages/Settings.tsx`, `frontend/src/lib/backup.ts`, `frontend/src/stores/player.ts`, focused tests | Medium: imports replace local state and need version validation | Backup restores local data and queue paused; malformed or unsupported files make no changes; no server/account required |
| P2 | Review queue and player transitions after the shared motion policy | `components/QueueSheet.tsx`, `components/FullPlayer.tsx`, `lib/queue.ts` only if a concrete issue is found | Low to medium | Existing shuffle/repeat/reorder tests remain green; track changes do not reset playback unexpectedly |
| P2 | Improve any visual flaw found by source/screenshot verification, respecting black background and configurable non-green accent | CSS/pages/components only for demonstrated issue | Medium | Responsive layout, no broken controls, contrast/reduced-motion intact |
| P3 | Extend deeper playback, offline, native controls only where the backend/platform can support them and tests/device verification are available | backend/audio/Capacitor | High | No misleading download claim; documented capability and actual device/browser evidence |

## Android standalone architecture status

The standalone native implementation is integrated. Remaining work is to build it in CI, resolve compile/dependency failures, and verify launch plus online search/playback on Android. Do not reintroduce LAN discovery or a required API URL into the native APK.

The Android fork retains upstream GPL-3.0 licensing and attribution in `native-android/LICENSE` and `native-android/FORK_NOTICE.md`. InnerTubeX is a GPL-3.0 runtime dependency as specified by the upstream version catalog. Before distributing APKs, provide the corresponding source and license notices as required by GPL-3.0.

## Implementation selection

The native Android app is integrated; build and device verification remain necessary before calling the APK fully verified. The legacy web UI upgrades remain separate from the Android app and do not establish feature parity across platforms.

## Verification plan

Run frontend unit tests, typecheck, and production build as requested. Run backend tests because backend integration is part of the requirement. Run the repository E2E smoke test if local Chromium and upstream/backend conditions permit. Check `git diff` and Git status, preserve pre-existing untracked skill artifacts, and do not push.

## Completed in this pass

- Cloned and analyzed Metrolist in `/workspace/Metrolist`; documented source paths, implementation notes, account/platform constraints, and adaptation recommendations in `METROLIST_ANALYSIS.md`.
- Audited the existing NrNMusic frontend, backend, persistence, CI, and test setup in `NRNMUSIC_AUDIT.md` before implementation.
- Connected app and OS reduced-motion behavior plus per-feature settings to Motion player/sheet/toast components and CSS page transitions.
- Enforced the black canvas and rejected green accent choices in Settings updates and imports.
- Removed Settings controls for crossfade, volume normalization, and queue policy that were not connected to playback; wired the sleep timer default into the player options.
- Added versioned local backup/import for settings, library, history, and queue. Imported queues remain paused. Local audio and stream cache are excluded and disclosed in Settings.
- Verification: frontend 56 tests passed; typecheck and production build passed; backend 30 tests passed; Chromium E2E smoke passed for Home, Settings, Search, deep route, and playhead advance. `git diff --check` passed. The Android APK build was not run locally; the existing CI workflow was audited and left unchanged.

## Reassessment after Android architecture inspection (2026-10-11)

- Confirmed `frontend/android/app/src/main` is a Capacitor shell with only `LanDiscoveryPlugin`; `frontend/src/lib/api.ts` sends catalog requests to `/api/*`, and `frontend/src/stores/player.ts` streams `/api/stream/{id}`. The Android package does not bundle FastAPI.
- Confirmed Metrolist's direct path in `/workspace/Metrolist/innertube/src/main/kotlin/com/metrolist/innertube/InnerTube.kt`, `.../YouTube.kt`, `app/src/main/kotlin/com/metrolist/music/utils/InnerTubeXPlayer.kt`, and `app/src/main/kotlin/com/metrolist/music/playback/MusicService.kt`.
- Cloned InnerTubeX separately to `/workspace/innertubex` for dependency/license inspection; no external source was added to NrNMusic.
- Android backend removal is implemented by replacing the APK build target with the native application. The direct InnerTube/Media3 path has not yet been built or verified on a device in this workspace; CI and device checks are required before claiming generated APK playback works.
