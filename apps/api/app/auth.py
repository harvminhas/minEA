"""
Clerk JWT verification for FastAPI.

Clerk issues JWTs signed with RS256. We fetch Clerk's JWKS, verify the token,
and extract org_id + user_id claims for use in route handlers.
"""
import uuid
from typing import Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

bearer_scheme = HTTPBearer(auto_error=False)

_jwks_cache: dict[str, Any] | None = None


async def _get_jwks() -> dict[str, Any]:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    # Derive JWKS URL from Clerk secret key prefix (sk_live_xxx / sk_test_xxx)
    # In production, set CLERK_JWKS_URL env var directly.
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{settings.supabase_url}/.well-known/jwks.json")
        if resp.status_code != 200:
            # Fallback: attempt Clerk's standard endpoint
            instance_id = settings.clerk_secret_key.split("_")[-1][:8] if settings.clerk_secret_key else "local"
            resp = await client.get(f"https://api.clerk.dev/v1/jwks")
    _jwks_cache = resp.json()
    return _jwks_cache


class AuthContext:
    """Validated claims extracted from the Clerk JWT."""

    def __init__(self, user_id: str, org_id: str, email: str = ""):
        self.user_id = user_id
        self.org_id = org_id
        self.email = email


async def get_auth_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthContext:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token = credentials.credentials

    # In development with no Clerk configured, accept a mock token
    if settings.debug and token.startswith("dev_"):
        parts = token.split("_")
        return AuthContext(user_id=parts[1] if len(parts) > 1 else "dev-user", org_id=parts[2] if len(parts) > 2 else "dev-org")

    try:
        # Decode without verification first to get kid
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")

        jwks = await _get_jwks()
        key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
        if not key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token key")

        claims = jwt.decode(token, key, algorithms=["RS256"])
        user_id = claims.get("sub", "")
        org_id = claims.get("org_id", "") or claims.get("o", {}).get("id", "")
        email = claims.get("email", "")

        if not user_id or not org_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing user or org claim")

        return AuthContext(user_id=user_id, org_id=org_id, email=email)

    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")
