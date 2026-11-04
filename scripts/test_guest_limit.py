"""
Tests for the limits on the guest routes (api/guest_limit.py, /chat/guest, /transcribe/guest).

Run with: python scripts/test_guest_limit.py
Needs the project's requirements. The model is replaced by a stub, so nothing is spent.
"""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

# The app creates inputs/, outputs/ and a local database in the working directory.
os.chdir(tempfile.mkdtemp())
os.environ.pop("DATABASE_URL", None)

from fastapi.testclient import TestClient

from api import guest_limit, llm
from api.app import app

client = TestClient(app)
llm_calls = []
llm.reply = lambda system, messages: llm_calls.append(messages) or "ok"
os.environ.pop("AAI_API_KEY", None)
os.environ.pop("ASSEMBLYAI_API_KEY", None)


def chat(ip="203.0.113.1", message="Bonjour", transcript="Texte", forwarded=None):
    return client.post(
        "/chat/guest",
        data={"message": message, "transcript_text": transcript},
        headers={"X-Forwarded-For": forwarded or ip},
    )


def setup():
    guest_limit.reset()
    llm_calls.clear()


def test_chat_blocked_after_limit():
    setup()
    for _ in range(guest_limit.CHAT_LIMIT_PER_HOUR):
        assert chat().status_code == 200
    response = chat()
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0
    assert "error" in response.json()
    assert len(llm_calls) == guest_limit.CHAT_LIMIT_PER_HOUR


def test_limit_is_per_ip():
    setup()
    for _ in range(guest_limit.CHAT_LIMIT_PER_HOUR):
        chat(ip="203.0.113.1")
    assert chat(ip="203.0.113.1").status_code == 429
    assert chat(ip="203.0.113.2").status_code == 200


def test_spoofed_forwarded_entries_do_not_bypass():
    setup()
    for i in range(guest_limit.CHAT_LIMIT_PER_HOUR):
        assert chat(forwarded=f"10.0.0.{i}, 203.0.113.1").status_code == 200
    assert chat(forwarded="10.9.9.9, 203.0.113.1").status_code == 429


def test_too_long_text_is_refused_without_spending_or_counting():
    setup()
    long_transcript = "x" * (guest_limit.MAX_TRANSCRIPT_CHARS + 1)
    long_message = "x" * (guest_limit.MAX_MESSAGE_CHARS + 1)
    assert chat(transcript=long_transcript).status_code == 400
    assert chat(message=long_message).status_code == 400
    assert llm_calls == []
    assert guest_limit._windows == {}


def test_longest_allowed_text_passes():
    setup()
    response = chat(
        message="x" * guest_limit.MAX_MESSAGE_CHARS,
        transcript="x" * guest_limit.MAX_TRANSCRIPT_CHARS,
    )
    assert response.status_code == 200


def test_window_resets():
    setup()
    for _ in range(2):
        assert guest_limit.seconds_until_allowed("r", "ip", 2, now=0.0) == 0
    assert guest_limit.seconds_until_allowed("r", "ip", 2, now=10.0) == guest_limit.WINDOW_SECONDS - 10
    assert guest_limit.seconds_until_allowed("r", "ip", 2, now=float(guest_limit.WINDOW_SECONDS)) == 0


def test_full_table_drops_stale_keys_then_refuses():
    setup()
    for i in range(guest_limit.MAX_TRACKED_KEYS):
        guest_limit.seconds_until_allowed("r", str(i), 5, now=0.0)
    assert guest_limit.seconds_until_allowed("r", "new", 5, now=1.0) == guest_limit.WINDOW_SECONDS
    assert guest_limit.seconds_until_allowed("r", "new", 5, now=float(guest_limit.WINDOW_SECONDS)) == 0
    guest_limit.reset()


def test_transcribe_guest_limit():
    """Without an AssemblyAI key the route stops before the limit, so set one and stub the work."""
    setup()
    os.environ["AAI_API_KEY"] = "test"
    import api.app as app_module

    def boom(*args, **kwargs):
        raise RuntimeError("stub: no real conversion")

    original = app_module.convert_to_mp3
    app_module.convert_to_mp3 = boom
    try:
        codes = [
            client.post(
                "/transcribe/guest",
                files={"file": ("a.mp3", b"abc", "audio/mpeg")},
                headers={"X-Forwarded-For": "203.0.113.9"},
            ).status_code
            for _ in range(guest_limit.TRANSCRIBE_LIMIT_PER_HOUR + 1)
        ]
    finally:
        app_module.convert_to_mp3 = original
        os.environ.pop("AAI_API_KEY", None)
    assert codes[-1] == 429
    assert 429 not in codes[:-1]


def test_transcribe_oversized_file_is_not_counted():
    setup()
    os.environ["AAI_API_KEY"] = "test"
    try:
        response = client.post(
            "/transcribe/guest",
            files={"file": ("a.mp3", b"x" * (5 * 1024 * 1024 + 1), "audio/mpeg")},
            headers={"X-Forwarded-For": "203.0.113.10"},
        )
    finally:
        os.environ.pop("AAI_API_KEY", None)
    assert response.status_code == 400
    assert guest_limit._windows == {}


if __name__ == "__main__":
    tests = [(name, fn) for name, fn in sorted(globals().items()) if name.startswith("test_") and callable(fn)]
    for name, fn in tests:
        fn()
        print(f"ok  {name}")
    print(f"{len(tests)} tests passed")
