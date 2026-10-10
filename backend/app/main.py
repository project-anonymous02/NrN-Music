"""FastAPI application factory for the NrNMusic API."""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .errors import ApiError, RateLimited, api_error_handler, unhandled_error_handler
from .routers import catalog, health, lyrics, search, stream

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("nrnmusic")

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("NrNMusic API starting (region=%s, language=%s)", settings.region, settings.language)
    yield
    log.info("NrNMusic API stopped")


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "HEAD", "OPTIONS"],
    allow_headers=["*"],
)

app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Keep the same error envelope for query validation failures."""
    first = exc.errors()[0] if exc.errors() else {}
    location = ".".join(str(part) for part in first.get("loc", ()) if part != "query")
    message = first.get("msg", "Invalid request.")
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "invalid_request",
                "message": f"{location or 'request'}: {message}",
                "retryable": False,
            }
        },
    )

_request_log: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    """Sliding-window limit so a runaway client cannot hammer YouTube Music."""
    path = request.url.path
    if path.startswith("/api/") and not path.startswith("/api/stream/"):
        now = time.monotonic()
        bucket = _request_log[request.client.host if request.client else "unknown"]
        while bucket and now - bucket[0] > 60:
            bucket.popleft()
        if len(bucket) >= settings.rate_limit_per_minute:
            return JSONResponse(
                status_code=429,
                content={"error": {"code": "rate_limited", "message": "Too many requests, slow down.", "retryable": True}},
            )
        bucket.append(now)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    return response


for router in (health.router, search.router, catalog.router, lyrics.router, stream.router):
    app.include_router(router)


@app.get("/api", include_in_schema=False)
def api_root() -> dict:
    return {"service": settings.app_name, "version": settings.version, "docs": "/api/docs"}


if FRONTEND_DIST.is_dir():
    assets = FRONTEND_DIST / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        index = FRONTEND_DIST / "index.html"
        return FileResponse(index) if index.is_file() else JSONResponse({"error": "frontend_missing"}, status_code=404)
