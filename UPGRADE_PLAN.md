# NrNMusic upgrade plan

## Direction

Use Metrolist as a source-verified interaction reference, adapting concepts to NrNMusic's React + TypeScript + FastAPI + Capacitor architecture. Retain the existing black/orange identity, no-login use, public catalog boundary and local-first storage. Do not import Metrolist code, assets, or brand elements.

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

## Implementation selection

P1 motion consistency and full local backup are selected for this pass. Core player, queue, library, public detail pages, lyrics, settings and local audio import already exist, so duplicating them would add regression risk without improving completeness. True server-stream downloads, cross-device sync, Cast/Android Auto and guaranteed background playback are excluded because the present platform/backend does not provide those guarantees.

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
