"""
Tests for the live-dictation token helper (api/voice.py).

Run with: python scripts/test_voice_token.py
No external dependencies required - AssemblyAI is replaced by a stdlib HTTP server.
"""
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.append(str(Path(__file__).resolve().parents[1]))

from api import voice

received = []
reply = {"status": 200, "body": {"token": "tmp-token", "expires_in_seconds": 60}}


class FakeAssemblyAI(BaseHTTPRequestHandler):
    def do_GET(self):
        received.append({"path": self.path, "auth": self.headers.get("Authorization")})
        self.send_response(reply["status"])
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(reply["body"]).encode())

    def log_message(self, *args):
        pass


server = HTTPServer(("127.0.0.1", 0), FakeAssemblyAI)
threading.Thread(target=server.serve_forever, daemon=True).start()
os.environ["AAI_STREAMING_BASE"] = f"http://127.0.0.1:{server.server_port}"


def test_service_keys():
    os.environ.pop("VOICE_SERVICE_KEYS", None)
    assert not voice.service_key_valid("anything"), "unset keys must close the endpoint"
    os.environ["VOICE_SERVICE_KEYS"] = "alpha, beta"
    assert voice.service_key_valid("alpha")
    assert voice.service_key_valid("beta")
    assert not voice.service_key_valid("gamma")
    assert not voice.service_key_valid("")
    assert not voice.service_key_valid(None)


def test_session_cap_is_bounded():
    for raw, expected in [("30", 60), ("180", 180), ("99999", 10800), ("nope", 180)]:
        os.environ["VOICE_MAX_SESSION_SECONDS"] = raw
        assert voice.max_session_seconds() == expected, (raw, voice.max_session_seconds())
    os.environ["VOICE_MAX_SESSION_SECONDS"] = "120"


def test_token_request():
    received.clear()
    result = voice.create_stream_token("secret-key")
    call = received[0]
    query = parse_qs(urlparse(call["path"]).query)
    assert urlparse(call["path"]).path == "/v3/token"
    assert call["auth"] == "secret-key", "the API key goes in Authorization, without Bearer"
    assert query == {"expires_in_seconds": ["60"], "max_session_duration_seconds": ["120"]}
    assert result["token"] == "tmp-token"
    assert result["max_session_seconds"] == 120
    assert result["websocket_url"] == f"ws://127.0.0.1:{server.server_port}/v3/ws"
    assert "secret-key" not in json.dumps(result), "the API key must never reach the partner"


def test_upstream_errors():
    for status, expected in [(429, 429), (401, 502), (500, 502)]:
        reply.update(status=status, body={"error": "x"})
        try:
            voice.create_stream_token("k")
        except voice.VoiceError as e:
            assert e.status == expected, (status, e.status)
        else:
            raise AssertionError(f"{status} should raise")
    reply.update(status=200, body={})
    try:
        voice.create_stream_token("k")
    except voice.VoiceError as e:
        assert e.status == 502
    else:
        raise AssertionError("a reply without token should raise")
    reply.update(status=200, body={"token": "tmp-token", "expires_in_seconds": 60})


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok  {name}")
    server.shutdown()
