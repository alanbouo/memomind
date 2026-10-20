"""
Outgoing e-mail through Resend (https://resend.com).

Configuration (environment variables):
    RESEND_API_KEY   API key (re_...). Unset = nothing is sent and the message is
                     printed to the log instead, which is what you want in development.
    MAIL_FROM        Sender, e.g. "MemoMind <login@memomind.space>". Its domain must be
                     verified in Resend; "onboarding@resend.dev" only delivers to the
                     address that owns the Resend account, which is fine for a first test.
"""
import json
import os
import urllib.error
import urllib.request

RESEND_URL = "https://api.resend.com/emails"


def send_email(to_email: str, subject: str, text: str, html: str) -> bool:
    """Send a message. Returns False (never raises) on failure."""
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        print(f"[DEV MODE] Email to {to_email}: {subject}\n{text}", flush=True)
        return True

    body = json.dumps({
        "from": os.getenv("MAIL_FROM", "MemoMind <onboarding@resend.dev>"),
        "to": [to_email],
        "subject": subject,
        "text": text,
        "html": html,
    }).encode()
    request = urllib.request.Request(
        RESEND_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "memomind-api/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15):
            pass
        print(f"[EMAIL] Sent to {to_email}", flush=True)
        return True
    except urllib.error.HTTPError as e:
        print(f"[EMAIL ERROR] Resend answered {e.code}: {e.read().decode(errors='replace')}", flush=True)
        return False
    except Exception as e:
        print(f"[EMAIL ERROR] {type(e).__name__}: {e}", flush=True)
        return False
