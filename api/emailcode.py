"""
Passwordless sign-in by e-mailed one-time code.

The user asks for a code, we mail a 6-digit number valid for a few minutes, and
exchanging it for tokens proves they control the address. Only a keyed hash of
the code is stored, and a code dies after a handful of wrong guesses.
"""
import hashlib
import hmac
import secrets

from api.auth import SECRET_KEY
from api.mailer import send_email

CODE_TTL_MINUTES = 10
MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60
MAX_CODES_PER_HOUR = 5


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(email: str, code: str) -> str:
    """Keyed hash, bound to the address so a code can't be replayed for another."""
    return hmac.new(SECRET_KEY.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


def codes_match(email: str, code: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_code(email, code.strip()), expected_hash)


def send_login_code(to_email: str, code: str) -> bool:
    text = f"""Your MemoMind sign-in code is {code}

It expires in {CODE_TTL_MINUTES} minutes. If you didn't ask for it, you can ignore this email.

Votre code de connexion MemoMind : {code}
Il expire dans {CODE_TTL_MINUTES} minutes. Si vous ne l'avez pas demandé, ignorez cet e-mail.
"""
    html = f"""<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a">
  <div style="max-width:480px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 16px">MemoMind</h2>
    <p>Your sign-in code / Votre code de connexion :</p>
    <p style="font-size:36px;font-weight:700;letter-spacing:8px;margin:24px 0">{code}</p>
    <p style="color:#64748b;font-size:14px">
      Expires in {CODE_TTL_MINUTES} minutes. If you didn't ask for it, ignore this email.<br>
      Expire dans {CODE_TTL_MINUTES} minutes. Si vous ne l'avez pas demandé, ignorez cet e-mail.
    </p>
  </div>
</body></html>"""
    return send_email(to_email, f"{code} is your MemoMind code", text, html)
