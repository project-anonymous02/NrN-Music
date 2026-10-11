# Metrolist source analysis

## Scope and method

Repository `https://github.com/MetrolistGroup/Metrolist` was cloned read-only to `/workspace/Metrolist`, outside NrNMusic. The checkout is on `main` at commit `76fa5a78b5110674442884b6f21c0cef51cdb782` (2026-10-11). No Metrolist code, assets, or branding were copied into NrNMusic. This is a source audit of architecture and representative end-to-end feature paths, not a line-by-line review of every one of the 821 Kotlin files.

## Architecture

Metrolist is a native Android application written primarily in Kotlin. Its UI is Jetpack Compose with Material 3 and Navigation Compose. The project has Android application module `:app` and a separate `:innertube` module containing the YouTube/YouTube Music client. Gradle Kotlin DSL and `gradle/libs.versions.toml` manage build configuration and dependencies. Current app configuration uses Android Gradle Plugin 9.4.1, Kotlin 2.4.20, Compose 1.12.1, minSdk 26, compileSdk 37, and Java 21 (`app/build.gradle.kts`, `gradle/libs.versions.toml`, `settings.gradle.kts`). Product flavors are FOSS, GMS, and Izzy; they conditionally include Google Cast/updater functionality.

The main application uses Hilt for dependency injection; ViewModels expose coroutine `Flow`/`StateFlow`; Room is the durable music database and DataStore stores preferences. The application shell and route graph are in `app/src/main/kotlin/com/metrolist/music/App.kt` and `ui/screens/NavigationBuilder.kt`. `ui/component/AppNavigation.kt` chooses Material navigation bar or rail; `ui/component/BottomSheet.kt`, `BottomSheetMenu.kt`, and `BottomSheetPage.kt` provide reusable sheet primitives. Pages compose screens and share app-level database, player, navigation, and download dependencies.

The data and network path is split between `:innertube` (YouTube Music browse/search/watch protocol), app repositories/services and ViewModels, Room DAO/entities, and UI. `db/MusicDatabase.kt`, `db/DatabaseDao.kt`, `db/entities/*`, and `db/Converters.kt` describe local persistence. `utils/DataStore.kt` and `constants/PreferenceKeys.kt` define preferences. Network setup is in `di/NetworkModule.kt`; application wiring is in `di/AppModule.kt` and `di/WrappedModule.kt`.

## Playback and queue implementation

Playback is owned by Android `MediaLibraryService` in `playback/MusicService.kt`, with Media3 ExoPlayer, MediaSession, notification controls, audio focus/lifecycle handling, playback analytics, stream resolution, caching, optional audio processors, and settings-driven playback behavior. `playback/PlayerConnection.kt` exposes player state and database-backed current song/lyrics/format flows to the Compose UI. `playback/StreamUrlCache.kt` caches resolved stream URLs; `playback/DownloadUtil.kt` and `ExoDownloadService.kt` handle downloads and persistent download jobs.

Queue is a model rather than just a screen list: `playback/queues/Queue.kt` defines initial state and continuation-page contracts. `ListQueue`, `YouTubeQueue`, `YouTubePlaylistQueue`, `YouTubeAlbumRadio`, and `LocalAlbumRadio` represent local lists, remotely continued playlists, and radio sources. `YouTubeQueue` retries initial/continuation fetches and requests related songs when a radio response has too few items. The service translates queue results into Media3 items and persists/restores playback state according to preferences. `ui/player/Queue.kt` provides reorderable/up-next and related content UI; `ui/player/Player.kt` is the expanded player; `ui/player/MiniPlayer.kt` is the collapsed player.

## UI/UX patterns

- Navigation is route-based and adapts to screen width with a bottom bar or rail (`ui/screens/NavigationBuilder.kt`, `ui/component/AppNavigation.kt`). Home, search, library, online catalog/detail pages, settings, history, charts, genre/mood, and account pages are distinct destinations.
- Home (`ui/screens/HomeScreen.kt`, `viewmodels/HomeViewModel.kt`) combines recent/local items, personalized/account-aware shelves, and online recommendations. Search has local and online paths (`ui/screens/search/*`, `viewmodels/OnlineSearchViewModel.kt`); artist, album, and playlist pages have dedicated screens and ViewModels.
- Library is subdivided into songs, playlists, artists, albums, podcast, and mixes (`ui/screens/library/*`, `viewmodels/LibraryViewModels.kt`). Context menus, player actions, queue and lyrics are shared components (`ui/menu/*`, `ui/player/*`, `ui/component/Lyrics*`). Settings are separated into appearance, content, player, privacy, storage, backup/restore, integrations, and about (`ui/screens/settings/*`).
- Material 3 components, artwork-led layouts, app bars, adaptive navigation, bottom sheets, expandable content, and Compose animation APIs establish hierarchy and interaction. Player artwork can influence the player palette (`ui/theme/PlayerColorExtractor.kt`, `ui/theme/Theme.kt`). Player and queue include seek/progress, transport, repeat/shuffle, lyrics, track actions, and related/up-next content.
- Loading/error behavior is generally driven by ViewModel state and Compose loading indicators; playback errors have a dedicated model/UI (`ui/player/PlaybackError.kt`). The app also has crash handling (`utils/CrashHandler.kt`).

## Verified feature inventory

| Feature | Implementation and flow | Auth/data/dependencies | NrNMusic adaptation |
| --- | --- | --- | --- |
| Home and discovery | `HomeScreen.kt` ← `HomeViewModel.kt` → Innertube browse and Room-backed local state | Public browse can work without account; network and protocol availability required | Existing `/api/home`, charts, explore, and local recommendations already cover web equivalent |
| Search | `ui/screens/search/*` → `OnlineSearchViewModel.kt` / `LocalSearchViewModel.kt` → Innertube and database | Public online search; local search uses Room | Existing `/api/search` and frontend search/history cover core behavior |
| Artist/album/playlist details | `ui/screens/artist/*`, `AlbumScreen.kt`, `ui/screens/playlist/*` plus corresponding ViewModels | Public browse for public catalog; private/library actions may require account | Existing backend catalog endpoints and React detail routes cover main public detail paths |
| Playback | `playback/MusicService.kt`, `PlayerConnection.kt`, `StreamUrlCache.kt`, `utils/InnerTubeXPlayer.kt` | Media3 + Innertube/stream sources; network or cached/downloaded media | Use existing FastAPI + yt-dlp proxy and single HTMLAudioElement; native service cannot be transplanted into a browser |
| Queue, radio, continuation | `playback/queues/*`, service queue restoration, `ui/player/Queue.kt` | Public watch/playlist/related endpoints; API continuation can fail/change | Existing `lib/queue.ts`, persisted queue, `/api/watch` radio append; not a server-side persistent queue |
| Mini/full player and system controls | `ui/player/MiniPlayer.kt`, `Player.kt`, `MusicService.kt` | Native foreground service + MediaSession; Android notification, lock-screen, headset controls | Existing mini/full player and browser Media Session API; Capacitor WebView behavior varies by OS/background policy |
| Lyrics | `viewmodels/LyricsViewModel.kt`, `lyrics/*`, `ui/component/Lyrics*`, player | Provider and catalog availability; timed/plain lyric formats | Existing `/api/lyrics` and player lyric panel; lyrics are not guaranteed for every track |
| Library and playlists | `db/MusicDatabase.kt`, `DatabaseDao.kt`, `db/entities/*`, library screens/ViewModels | Local Room storage; optional YouTube account synchronization for remote library | Existing IndexedDB local likes, playlists, saved albums/artists and import/export; no account required |
| Account sync | `ui/screens/LoginScreen.kt`, `AccountScreen.kt`, `AccountSettings.kt`, `viewmodels/Account*`, `App.kt` auth initialization | Optional YouTube account cookie; enables remote library/account-only features. Login route exists but is not the only app entry point | Do not port; NrNMusic must stay usable without login. Clearly label local-only library semantics |
| Downloads and cache | `ExoDownloadService.kt`, `DownloadUtil.kt`, Media3 cache dependencies, `StorageSettings.kt` | Device storage; external audio source and Android download service | NrNMusic imports user-owned local audio to IndexedDB; streaming cache marker is metadata only, not an offline audio download |
| History and stats | `HistoryScreen.kt`, `StatsScreen.kt`, `HistoryViewModel.kt`, Room event/play count entities | Local history; scrobble integrations optional | Existing local history and recommendations; combined backup should include it |
| Settings and backup | `ui/screens/settings/*`, `BackupAndRestoreViewModel.kt`, DataStore and Room | Most preferences/local backup are local; integrations can have credentials | Existing settings and separate settings/library JSON backup; history is currently not included in Settings export/import |
| Integrations | `discord/*`, Last.fm settings/service, Listen Together, OpenRouter/DeepL services | Third-party integrations require their own credentials/account/network; not required for core playback | Not needed for requested parity; don't add external auth or credentials |
| Lyrics/metadata/audio providers | `innertube/`, `lyrics/`, `playback/`, plus selected provider adapters | Unofficial endpoints and third-party providers can change or be unavailable | Keep existing FastAPI/ytmusicapi/yt-dlp boundary; no direct browser call to Google media hosts |
| CI and tests | `.github/workflows/build*.yml`, `app/src/test`, Android instrumentation tests | Gradle builds FOSS/GMS/Izzy variants; unit tests cover queues, database, playback and utilities | NrNMusic's `.github/workflows/ci.yml` already tests backend/frontend, builds Android wrapper, and has manual E2E |

## Authentication and limitations

Metrolist supports guest/public catalog usage and includes an optional login/switch-account flow. Source evidence includes the separately navigated `login` route in `ui/screens/NavigationBuilder.kt`, WebView/auth handling in `ui/screens/LoginScreen.kt`, and startup propagation of `InnerTubeCookieKey` to `YouTube.authUser` in `App.kt`. Account ViewModels and account-aware Home/Library code use that state to sync private account library content. Therefore features such as the signed-in user's liked songs, private playlists, and account library cannot be assumed to work as guest. Local Room data and public catalog browsing are separate from account synchronization.

Metrolist also has native-only capabilities not directly portable to NrNMusic: Android foreground playback service, lock-screen/notification controls, Android Auto, widgets, Cast in the GMS flavor, native downloads, and device audio processors. NrNMusic can approximate some via Media Session/Web Audio/Capacitor, but browser/WebView lifecycle and OS restrictions apply. Public YouTube Music content, stream resolution, lyrics, recommendations and charts are not guaranteed; upstream protocol/source changes, geographic restrictions, and rights/terms remain constraints. The checked-out Metrolist repository is GPL-3.0 (`LICENSE`); this work uses it as behavioral reference and does not copy implementation or assets.

## Source path index

All paths below are relative to the external clone `/workspace/Metrolist`.

- Build/modules/dependencies: `settings.gradle.kts`, `build.gradle.kts`, `app/build.gradle.kts`, `gradle/libs.versions.toml`, `app/src/main/AndroidManifest.xml`
- App shell/routes/navigation: `app/src/main/kotlin/com/metrolist/music/App.kt`, `ui/screens/NavigationBuilder.kt`, `ui/component/AppNavigation.kt`
- Playback/session/queue: `playback/MusicService.kt`, `playback/PlayerConnection.kt`, `playback/StreamUrlCache.kt`, `playback/queues/Queue.kt`, `playback/queues/YouTubeQueue.kt`, `playback/queues/YouTubePlaylistQueue.kt`, `ui/player/MiniPlayer.kt`, `ui/player/Player.kt`, `ui/player/Queue.kt`
- Data and preferences: `db/MusicDatabase.kt`, `db/DatabaseDao.kt`, `db/entities/`, `utils/DataStore.kt`, `constants/PreferenceKeys.kt`
- Main catalog pages: `ui/screens/HomeScreen.kt`, `viewmodels/HomeViewModel.kt`, `ui/screens/search/`, `viewmodels/OnlineSearchViewModel.kt`, `ui/screens/AlbumScreen.kt`, `ui/screens/artist/ArtistScreen.kt`, `ui/screens/playlist/OnlinePlaylistScreen.kt`
- Lyrics/settings/backup/auth: `lyrics/`, `ui/component/Lyrics.kt`, `ui/screens/settings/`, `viewmodels/BackupRestoreViewModel.kt`, `ui/screens/LoginScreen.kt`, `ui/screens/AccountScreen.kt`, `viewmodels/AccountViewModel.kt`
- Android-specific features/tests/CI: `playback/ExoDownloadService.kt`, `ui/screens/settings/AndroidAutoSettings.kt`, `widget/`, `app/src/test/kotlin/`, `app/src/androidTest/`, `.github/workflows/`

## Recommendations for NrNMusic

1. Preserve the current React/FastAPI split and public-data service boundary; the platform difference is fundamental.
2. Keep library, likes, playlist, history, queue and preferences local and accessible before/without authentication. State clearly that data is per-device unless manually exported.
3. Focus parity on queue operations, radio continuation, player state, local library/detail views, lyrics, useful loading/error states, and a coherent responsive shell. Do not claim native background playback, true offline streaming downloads, or account synchronization unless implemented and tested on target devices.
4. Prefer cohesive full local-data export/import and consistent settings-driven/reduced-motion behavior over recreating Metrolist's entire native feature set.
5. Treat remote stream/catalog failures as normal states. Do not silently imply that metadata availability guarantees a playable stream or lyrics.

## Follow-up implementation decision

The initial recommendation to retain the React/FastAPI/Capacitor path for Android was superseded after the user requested a standalone app with no server URL. The Android APK now uses the native Metrolist application and `:innertube` module as a GPL-3.0 fork in `native-android`, with NrNMusic app identity and a native GitHub Actions build. The web/FastAPI deployment remains separate. APK compile and device playback verification are still pending.
