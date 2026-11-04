"""Limits for the unauthenticated guest routes, which spend our API credits.

The API runs as a single uvicorn process (see Dockerfile), so an in-memory
counter is enough. It resets on restart, which is acceptable for this purpose.
"""
import os
import threading
import time
from typing import Dict, Optional, Tuple

from fastapi import Request
from fastapi.responses import JSONResponse

WINDOW_SECONDS = 3600
MAX_TRACKED_KEYS = 10_000

CHAT_LIMIT_PER_HOUR = int(os.getenv("GUEST_CHAT_LIMIT_PER_HOUR", "30"))
TRANSCRIBE_LIMIT_PER_HOUR = int(os.getenv("GUEST_TRANSCRIBE_LIMIT_PER_HOUR", "10"))

# Far above what the 5 MB guest audio limit can produce.
MAX_TRANSCRIPT_CHARS = 100_000
MAX_MESSAGE_CHARS = 4_000

_lock = threading.Lock()
_windows: Dict[Tuple[str, str], Tuple[float, int]] = {}


def client_ip(request: Request) -> str:
    """The caller's address, as seen by the reverse proxy.

    The proxy appends the address it saw to X-Forwarded-For, so only the last
    entry can be trusted: everything before it is supplied by the client.
    """
    last = request.headers.get("x-forwarded-for", "").rsplit(",", 1)[-1].strip()
    if last:
        return last
    return request.client.host if request.client else "unknown"


def seconds_until_allowed(route: str, ip: str, limit: int, now: Optional[float] = None) -> int:
    """Count this request. Returns 0 if it is allowed, else the seconds to wait."""
    now = time.monotonic() if now is None else now
    key = (route, ip)
    with _lock:
        if len(_windows) >= MAX_TRACKED_KEYS:
            for stale in [k for k, (start, _) in _windows.items() if now - start >= WINDOW_SECONDS]:
                del _windows[stale]
            if len(_windows) >= MAX_TRACKED_KEYS:
                # Too many live addresses to track: refuse rather than spend without a limit.
                return WINDOW_SECONDS

        start, count = _windows.get(key, (now, 0))
        if now - start >= WINDOW_SECONDS:
            start, count = now, 0
        if count >= limit:
            return max(1, int(WINDOW_SECONDS - (now - start)))
        _windows[key] = (start, count + 1)
        return 0


def rejection(request: Request, route: str, limit: int) -> Optional[JSONResponse]:
    """A 429 response if this caller is over the limit, else None."""
    wait = seconds_until_allowed(route, client_ip(request), limit)
    if not wait:
        return None
    return JSONResponse(
        status_code=429,
        content={
            "error": "Trop de demandes en mode invité. Réessayez plus tard, ou créez un compte.",
            "upgrade_required": True,
        },
        headers={"Retry-After": str(wait)},
    )


def reset() -> None:
    """Clear all counters (used by the tests)."""
    with _lock:
        _windows.clear()
