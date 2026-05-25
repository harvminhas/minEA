"""
Firebase ID token verification for FastAPI.

Firebase handles passwords/sessions. We verify the ID token and map firebase_uid → User.
Org/workspace context is derived from URL path — never from JWT claims.
"""
import json
from pathlib import Path
from typing import Any

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings, API_ROOT

bearer_scheme = HTTPBearer(auto_error=False)


def _resolve_credentials_path(path: str) -> Path:
    cred_path = Path(path)
    if not cred_path.is_absolute():
        cred_path = API_ROOT / cred_path
    return cred_path


def _default_credentials_path() -> Path | None:
    for name in ("fb_svc_acct.json", "fb_svc_account.json", "serviceAccountKey.json"):
        candidate = API_ROOT / name
        if candidate.exists():
            return candidate
    return None


def _find_credentials_path() -> Path | None:
    if settings.firebase_service_account_json:
        return None  # inline JSON configured
    if settings.firebase_credentials_path:
        cred_path = _resolve_credentials_path(settings.firebase_credentials_path)
        if cred_path.exists():
            return cred_path
    return _default_credentials_path()


def firebase_credentials_status() -> tuple[bool, Path | None]:
    if settings.firebase_service_account_json:
        return True, None
    cred_path = _find_credentials_path()
    return (cred_path is not None and cred_path.exists()), cred_path


def init_firebase() -> None:
    """Initialize Firebase Admin once at app startup."""
    _ensure_firebase()


def _ensure_firebase() -> None:
    if firebase_admin._apps:
        return

    cred = None

    if settings.firebase_service_account_json:
        cred = credentials.Certificate(json.loads(settings.firebase_service_account_json))
    else:
        cred_path = _find_credentials_path()

        if cred_path is None or not cred_path.exists():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Firebase auth not configured. Set FIREBASE_CREDENTIALS_PATH in apps/api/.env "
                    f"or place fb_svc_acct.json in {API_ROOT}"
                ),
            )
        cred = credentials.Certificate(str(cred_path))

    firebase_admin.initialize_app(cred, {"projectId": settings.firebase_project_id})


class AuthContext:
    """Validated identity from Firebase ID token — no tenant scope."""

    def __init__(
        self,
        firebase_uid: str,
        email: str = "",
        email_verified: bool = False,
        full_name: str | None = None,
    ):
        self.firebase_uid = firebase_uid
        self.email = email
        self.email_verified = email_verified
        self.full_name = full_name


async def get_auth_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthContext:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token = credentials.credentials

    # Dev bypass: dev_{firebase_uid}
    if settings.debug and token.startswith("dev_"):
        uid = token.removeprefix("dev_")
        return AuthContext(firebase_uid=uid, email=f"{uid}@dev.local", email_verified=True)

    try:
        _ensure_firebase()
        decoded: dict[str, Any] = firebase_auth.verify_id_token(token)
        uid = decoded.get("uid") or decoded.get("sub", "")
        if not uid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing uid claim")

        return AuthContext(
            firebase_uid=uid,
            email=decoded.get("email", "") or "",
            email_verified=bool(decoded.get("email_verified", False)),
            full_name=decoded.get("name"),
        )
    except firebase_auth.InvalidIdTokenError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")
