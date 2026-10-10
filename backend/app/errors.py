"""Application errors and the FastAPI handlers that translate them.

The frontend only ever sees a stable JSON envelope:

    {"error": {"code": "...", "message": "...", "retryable": true|false}}
"""

from __future__ import annotations

import logging

from fastapi import Request
from fastapi.responses import JSONResponse

log = logging.getLogger("nrnmusic.error")


class ApiError(Exception):
    """Base class for every error that is safe to surface to the client."""

    status_code = 500
    code = "internal_error"
    retryable = False

    def __init__(self, message: str, *, code: str | None = None, retryable: bool | None = None):
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if retryable is not None:
            self.retryable = retryable


class NotFoundError(ApiError):
    status_code = 404
    code = "not_found"
    retryable = False


class UpstreamError(ApiError):
    """YouTube Music answered with something we cannot use."""

    status_code = 502
    code = "upstream_error"
    retryable = True


class UpstreamTimeout(ApiError):
    status_code = 504
    code = "upstream_timeout"
    retryable = True


class RateLimited(ApiError):
    status_code = 429
    code = "rate_limited"
    retryable = True


class InvalidRequest(ApiError):
    status_code = 400
    code = "invalid_request"
    retryable = False


class StreamUnavailable(ApiError):
    status_code = 502
    code = "stream_unavailable"
    retryable = True


async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    if exc.status_code >= 500:
        log.warning("%s: %s", exc.code, exc.message)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "retryable": exc.retryable}},
    )


async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": "Unexpected server error.",
                "retryable": True,
            }
        },
    )
