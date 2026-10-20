"""
OpenID Connect ID-token verification for "Sign in with Google / Apple".

The mobile client signs in with the provider's SDK and sends us the resulting
ID token (a JWT). We check its signature against the provider's public keys
(JWKS), then its issuer, audience and expiry. Accepted audiences come from the
environment: GOOGLE_CLIENT_IDS and APPLE_CLIENT_IDS (comma-separated).
"""
import os
from typing import Dict, List

import jwt
from jwt import PyJWKClient

PROVIDERS = {
    "google": {
        "issuers": ["https://accounts.google.com", "accounts.google.com"],
        "jwks_uri": "https://www.googleapis.com/oauth2/v3/certs",
        "audience_env": "GOOGLE_CLIENT_IDS",
    },
    "apple": {
        "issuers": ["https://appleid.apple.com"],
        "jwks_uri": "https://appleid.apple.com/auth/keys",
        "audience_env": "APPLE_CLIENT_IDS",
    },
}


class OIDCError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# One client per provider: PyJWKClient caches the fetched keys.
_jwks_clients: Dict[str, PyJWKClient] = {}


def _jwks_client(provider: str) -> PyJWKClient:
    if provider not in _jwks_clients:
        _jwks_clients[provider] = PyJWKClient(PROVIDERS[provider]["jwks_uri"], cache_keys=True)
    return _jwks_clients[provider]


def audiences(provider: str) -> List[str]:
    raw = os.getenv(PROVIDERS[provider]["audience_env"], "")
    return [a.strip() for a in raw.split(",") if a.strip()]


def verify_id_token(provider: str, token: str) -> dict:
    """Return the verified claims of an ID token, or raise OIDCError."""
    if provider not in PROVIDERS:
        raise OIDCError(400, "Unsupported provider")

    auds = audiences(provider)
    if not auds:
        raise OIDCError(503, f"Sign in with {provider.title()} is not configured on this server")

    try:
        signing_key = _jwks_client(provider).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=auds,
            issuer=PROVIDERS[provider]["issuers"],
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise OIDCError(401, "ID token expired")
    except jwt.PyJWTError:
        raise OIDCError(401, "Invalid ID token")
    except Exception:
        # Network failure while fetching the provider's keys, etc.
        raise OIDCError(502, f"Could not verify the {provider.title()} token, try again")

    return claims


def verified_email(claims: dict) -> str:
    """The token's email, only if the provider vouches for it."""
    email = claims.get("email")
    # Apple sends email_verified as the string "true"; Google as a boolean.
    verified = claims.get("email_verified") in (True, "true")
    if not email or not verified:
        raise OIDCError(400, "No verified email address on this account")
    return str(email).strip().lower()
