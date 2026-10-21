"""
Push notifications through the Expo push service.

The mobile app registers its Expo push token (POST /push/register); when a
background transcription ends we send a short notification to every device the
user registered. Failures are logged and never affect the transcription.
"""
import json
import os
import urllib.request
from typing import List

from api.database import PushToken, SessionLocal

EXPO_PUSH_URL = os.getenv("EXPO_PUSH_URL", "https://exp.host/--/api/v2/push/send")


def is_expo_token(token: str) -> bool:
    return token.startswith(("ExponentPushToken[", "ExpoPushToken[")) and token.endswith("]")


def _post(messages: List[dict]) -> List[dict]:
    request = urllib.request.Request(
        EXPO_PUSH_URL,
        data=json.dumps(messages).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read()).get("data", [])


def notify_user(user_id: int, title: str, body: str, data: dict) -> None:
    """Send a notification to all of a user's devices; drop tokens Expo reports as dead."""
    db = SessionLocal()
    try:
        tokens = [t.token for t in db.query(PushToken).filter(PushToken.user_id == user_id).all()]
        if not tokens:
            return
        messages = [{"to": t, "title": title, "body": body, "data": data, "sound": "default"} for t in tokens]
        try:
            tickets = _post(messages)
        except Exception as e:
            print(f"[PUSH] Send failed: {e}", flush=True)
            return
        for token, ticket in zip(tokens, tickets):
            if ticket.get("status") == "error" and (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                db.query(PushToken).filter(PushToken.token == token).delete()
        db.commit()
    finally:
        db.close()
