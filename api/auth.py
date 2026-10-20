"""
Authentication utilities
"""
from datetime import datetime, timedelta
import jwt
import os

SECRET_KEY = os.getenv("JWT_SECRET", "supersecret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours
REFRESH_TOKEN_EXPIRE_DAYS = 7


def create_token(data: dict, expires_delta: timedelta) -> str:
    """Create a JWT token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(username: str) -> str:
    """Create an access token"""
    return create_token(
        {"sub": username}, 
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )


def create_refresh_token(username: str) -> str:
    """Create a refresh token"""
    return create_token(
        {"sub": username}, 
        timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    )


def decode_token(token: str) -> dict:
    """Decode and verify a JWT token"""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
