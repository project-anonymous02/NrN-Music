"""Audio endpoints.

The browser cannot talk to ``googlevideo.com`` directly: the CDN answers
without ``Access-Control-Allow-Origin`` (RESEARCH.md §2.3), so NrNMusic relays
the bytes through this router while preserving HTTP range semantics.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import RedirectResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool

from ..config import get_settings
from ..errors import InvalidRequest, StreamUnavailable
from ..services.stream import resolver

log = logging.getLogger("nrnmusic.stream.router")

router = APIRouter(prefix="/api/stream", tags=["stream"])
settings = get_settings()

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-encoding",
    "content-length",
}

FORWARD_REQUEST_HEADERS = ("range", "user-agent", "accept", "accept-encoding")
FORWARD_RESPONSE_HEADERS = ("content-type", "content-range", "accept-ranges", "content-length", "cache-control", "etag")


@router.get("/{video_id}/meta")
async def stream_meta(video_id: str, ext: str = Query(default="auto")) -> dict:
    info = await run_in_threadpool(resolver.resolve, video_id, ext)
    return info.as_dict()


async def _fetch(client: httpx.AsyncClient, url: str, request: Request) -> httpx.Response:
    headers = {name: request.headers[name] for name in FORWARD_REQUEST_HEADERS if name in request.headers}
    headers.setdefault("accept", "*/*")
    # Audio must never be transcoded by an intermediary.
    headers["accept-encoding"] = "identity"
    upstream = client.build_request("GET", url, headers=headers)
    return await client.send(upstream, stream=True)


@router.get("/{video_id}")
async def stream(video_id: str, request: Request, ext: str = Query(default="auto"), redirect: bool = Query(default=False)):
    info = await run_in_threadpool(resolver.resolve, video_id, ext)

    if redirect and settings.enable_stream_redirect:
        return RedirectResponse(url=info.url, status_code=302)

    if not settings.proxy_stream:
        return RedirectResponse(url=info.url, status_code=302)

    timeout = httpx.Timeout(settings.upstream_timeout, read=30.0)
    # The client must outlive this handler: the body is streamed by
    # StreamingResponse *after* we return, so it is closed by the generator
    # below instead of by a context manager here (that would abort the body
    # after the first chunk and break Content-Length).
    # follow_redirects=True: the CDN sometimes answers 302 to a stale host;
    # without it we would relay that redirect to the browser instead of audio.
    client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)
    try:
        response = await _fetch(client, info.url, request)

        if response.status_code in (403, 410, 400):
            # The resolved URL expired or the IP was rotated; resolve once.
            await response.aclose()
            log.info("re-resolving expired stream for %s", video_id)
            info = await run_in_threadpool(resolver.resolve, video_id, ext, force=True)
            response = await _fetch(client, info.url, request)

        if response.status_code >= 400:
            status = response.status_code
            await response.aclose()
            raise StreamUnavailable(
                f"The audio source refused the request (HTTP {status}).",
                code="stream_upstream_error",
            )
    except BaseException:
        await client.aclose()
        raise

    out_headers = {
        name: response.headers[name]
        for name in FORWARD_RESPONSE_HEADERS
        if name in response.headers and response.headers[name] is not None
    }
    out_headers["X-Stream-Video-Id"] = video_id
    out_headers["X-Stream-Codec"] = info.acodec
    out_headers.setdefault("cache-control", "private, max-age=3600")
    # Range responses must keep their status (206) and Content-Range header.
    chunks = response.aiter_raw() if "content-encoding" not in response.headers else response.aiter_bytes()

    async def body():
        try:
            async for chunk in chunks:
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(
        body(),
        status_code=response.status_code,
        headers=out_headers,
        media_type=response.headers.get("content-type", "application/octet-stream"),
    )


async def stream_error_guard(exc: Exception) -> None:  # pragma: no cover - defensive
    log.debug("stream error: %s", exc)
    if isinstance(exc, (InvalidRequest, StreamUnavailable)):
        raise exc
    raise StreamUnavailable("The audio source could not be reached.") from exc
