# NrNMusic API

Base URL: `http://127.0.0.1:8000`. Interactive docs: `/api/docs`, schema: `/api/openapi.json`.

All routes are `GET` (plus `HEAD`/`OPTIONS`). Responses are JSON except the audio stream, which is a byte range. Every error uses one envelope:

```json
{"error": {"code": "stream_upstream_error", "message": "...", "retryable": true}}
```

| code | HTTP | meaning |
| --- | --- | --- |
| `invalid_request` | 400 | bad parameter |
| `not_found` | 404 | resource has no YouTube Music data |
| `rate_limited` | 429 | `RATE_LIMIT_PER_MINUTE` exceeded (`Retry-After`) |
| `upstream_unavailable` | 502 | YouTube Music responded with an error |
| `stream_upstream_error` | 502 | audio CDN rejected the request |
| `internal_error` | 500 | unexpected failure (logged, never exposes internals) |

## Meta

| Route | Query | Returns |
| --- | --- | --- |
| `GET /api/health` | – | `{status, version, region, dependencies, cacheEntries}` |

## Search

| Route | Query | Returns |
| --- | --- | --- |
| `GET /api/search` | `q` (1–200), `type=all\|songs\|videos\|artists\|albums\|playlists`, `limit` (1–50), `scope` | `{query, type, results[]}` |
| `GET /api/suggest` | `q` (1–80) | `{suggestions:[{text, kind, track?}]}` |

## Catalog

| Route | Query | Returns |
| --- | --- | --- |
| `GET /api/home` | `limit` (1–20) | `{sections:[{title, items[]}]}` |
| `GET /api/explore` | – | explore shelves (genres/moods) |
| `GET /api/charts` | `region` (ISO-3166 alpha-2) | `{playlists[], artists[], countries[], selectedCountry}` |
| `GET /api/song/{videoId}` | – | `{track}` (metadata only; no audio URL) |
| `GET /api/album/{browseId}` | – | `{album, tracks[], related[], otherVersions[]}` |
| `GET /api/artist/{channelId}` | – | `{artist, sections[]}` |
| `GET /api/artist/{channelId}/albums` | `params` (required), `shelf`, `limit` (1–100), `kind=albums\|singles` | `{albums[]}` |
| `GET /api/playlist/{playlistId}` | – | `{playlist, tracks[], suggestions[]}` |
| `GET /api/watch/{videoId}` | – | `{playlistId, lyricsBrowseId, relatedBrowseId, tracks[]}` — powers autoplay/radio without an account |

`/api/watch` is the only way to obtain a lyrics handle; `lyricsBrowseId` starts with `MPLYt`.

## Lyrics

| Route | Query | Returns |
| --- | --- | --- |
| `GET /api/lyrics/{browseId}` | `timed=true` for synchronized lines | `{synced, lines:[{text, startMs?}]}` |

The `browseId` must be an `MPLYt…` handle from `/api/watch`; anything else returns 404.

## Stream

| Route | Query | Returns |
| --- | --- | --- |
| `GET /api/stream/{videoId}/meta` | `ext=auto\|m4a\|webm` | `{url, ext, expiresAt, duration, …}` (for debugging; browser cannot call `googlevideo.com` directly) |
| `GET /api/stream/{videoId}` | `ext`, `redirect=true` | audio bytes, supports `Range` (`206` + `Content-Range`) |

Behaviour:

* The resolver (`yt-dlp`) is called in a thread pool and cached for `STREAM_CACHE_TTL` (default 1800 s) with a `STREAM_REFRESH_MARGIN` re-resolve window, because URLs expire in ~6 hours.
* Default path is the **proxy**: the backend forwards `Range`/`If-Range` to the CDN and streams the body through, adding `X-Stream-Video-Id`. `googlevideo.com` sends no `Access-Control-Allow-Origin`, so a same-origin proxy is required for the SPA.
* `redirect=true` + `ENABLE_STREAM_REDIRECT=1` returns `302` instead (useful for `curl`/external players).
* `PROXY_STREAM=0` forces the `302` path even without the query flag.
* The upstream response is consumed lazily; the HTTP client is closed only after the generator finishes, so the declared `Content-Length` always matches what is sent.

## Rate limiting & caching

* In-memory sliding-window limiter per client IP, `RATE_LIMIT_PER_MINUTE` (default 240, `0` disables).
* Metadata cache: TTL `METADATA_CACHE_TTL` (300 s), capped by `CACHE_MAX_ENTRIES`; bounded LRU for resolved stream URLs.
* All upstream calls are cached on a stable `cache_key`, so repeated UI navigation does not hammer YouTube Music.

## SPA hosting

`main.py` mounts `frontend/dist` and falls back to `index.html` for unknown non-`/api` paths (deep links such as `/album/MPREb_…` work on reload). If `frontend/dist` is missing, the fallback is skipped and the API still answers `/api/*`.
