# Authentication

MemoMind has no passwords. A user signs in with **Google**, **Apple** or an
**e-mailed 6-digit code**, and the account is matched on the verified e-mail
address, so every method reaches the same account.

All three end the same way: the API returns a short-lived **access token** and a
longer-lived **refresh token** (JWT, `HS256`, signed with `JWT_SECRET`). Clients
send `Authorization: Bearer <access token>` and call `POST /refresh` when it expires.

## Endpoints

| Endpoint | Body | Purpose |
| --- | --- | --- |
| `POST /auth/social` | `{provider: "google" \| "apple", id_token}` | Sign in with a provider's ID token |
| `POST /auth/email/request` | `{email}` | E-mail a one-time code (same reply whether or not the address is known) |
| `POST /auth/email/verify` | `{email, code}` | Exchange the code for tokens; creates the account on first use |
| `POST /refresh` | form `refresh_token` | New access token |
| `GET /me` | | Current user |
| `DELETE /account` | | Delete the account and its data |

## Google / Apple

The app signs in with the provider's SDK and sends the resulting ID token. The API
checks its signature against the provider's public keys (JWKS), then `iss`, `aud`
and `exp` (`api/oidc.py`), and requires a verified e-mail.

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_IDS` | Comma-separated Google **web** client ID(s): the token audience |
| `APPLE_CLIENT_IDS` | Comma-separated Apple audiences: the bundle ID `space.memomind.app` |

## E-mail code

`api/emailcode.py`: 6 digits, valid 10 minutes, single use. Only an HMAC of the code
(bound to the address) is stored. A code is burned after 5 wrong guesses. Asking for
a new code invalidates the previous one, with a 60 s cooldown and at most 5 codes per
address per hour.

Mail goes out through [Resend](https://resend.com) (`api/mailer.py`): set `RESEND_API_KEY`
and `MAIL_FROM` (a sender on a domain verified in Resend, e.g. `MemoMind <login@memomind.space>`).
Without `RESEND_API_KEY` the message is printed to the server log instead, handy in development.

## Notes

- `users.hashed_password` is still a non-null column; new accounts store `!`, a value
  nothing can match. Accounts created when passwords existed keep their old hash,
  which is simply never read.
- The `password_reset_tokens` table is no longer used.
- Rate limiting is per address. There is no per-IP limit yet.
