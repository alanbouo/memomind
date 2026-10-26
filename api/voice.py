"""Live dictation for partner apps: short-lived AssemblyAI streaming tokens.

The AssemblyAI key never leaves this server. A partner app's *server* asks for
a token with its service key; its client then streams audio straight to
AssemblyAI with that token. Each token opens sessions for `TOKEN_TTL_SECONDS`
only, and every session it opens is capped at `VOICE_MAX_SESSION_SECONDS`.

Per-user limits are the partner's job: this server does not know its users.
"""
import hmac
import json
import os
import urllib.error
import urllib.parse
import urllib.request

TOKEN_TTL_SECONDS = 60
# AssemblyAI accepts 60 to 10800 seconds; dictating into a form field is short.
DEFAULT_MAX_SESSION_SECONDS = 180
STREAMING_BASE = "https://streaming.assemblyai.com"


class VoiceError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def service_key_valid(presented: str | None) -> bool:
    """True when the key is one of VOICE_SERVICE_KEYS (comma-separated). Unset: nobody gets in."""
    if not presented:
        return False
    allowed = [k.strip() for k in os.getenv("VOICE_SERVICE_KEYS", "").split(",") if k.strip()]
    return any(hmac.compare_digest(presented.encode(), k.encode()) for k in allowed)


def max_session_seconds() -> int:
    try:
        value = int(os.getenv("VOICE_MAX_SESSION_SECONDS", DEFAULT_MAX_SESSION_SECONDS))
    except ValueError:
        value = DEFAULT_MAX_SESSION_SECONDS
    return min(max(value, 60), 10800)


def streaming_base() -> str:
    # Override for tests, or to use a regional host.
    return os.getenv("AAI_STREAMING_BASE", STREAMING_BASE).rstrip("/")


def create_stream_token(api_key: str) -> dict:
    """Ask AssemblyAI for a temporary streaming token; returns what the client needs to connect."""
    session = max_session_seconds()
    query = urllib.parse.urlencode({"expires_in_seconds": TOKEN_TTL_SECONDS, "max_session_duration_seconds": session})
    request = urllib.request.Request(f"{streaming_base()}/v3/token?{query}", headers={"Authorization": api_key})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        # 429 stays a 429 so the partner can back off; anything else is our upstream failing.
        raise VoiceError(429 if e.code == 429 else 502, f"AssemblyAI token request failed ({e.code})") from e
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        raise VoiceError(502, "AssemblyAI token request failed") from e

    token = body.get("token")
    if not token:
        raise VoiceError(502, "AssemblyAI returned no token")
    websocket = streaming_base().replace("https://", "wss://").replace("http://", "ws://") + "/v3/ws"
    return {
        "token": token,
        "expires_in_seconds": body.get("expires_in_seconds", TOKEN_TTL_SECONDS),
        "max_session_seconds": session,
        "websocket_url": websocket,
    }
