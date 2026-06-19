"""Auth helpers — verification email delivery."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import AuthContext, get_auth_context
from app.config import settings
from app.database import get_db
from app.services.auth_status import get_auth_status
from app.services.confirm_email_verification import confirm_email_verification
from app.services.verification_email import send_verification_email
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/auth", tags=["auth"])


class VerificationEmailResponse(BaseModel):
    message: str
    email_sent: bool
    verification_link: str | None = None


class ConfirmEmailVerificationRequest(BaseModel):
    token: str


class ConfirmEmailVerificationResponse(BaseModel):
    message: str
    verified: bool = True


class SendVerificationEmailRequest(BaseModel):
    app_origin: str | None = None


class AuthMeResponse(BaseModel):
    email: str
    email_verified: bool
    requires_email_verification: bool
    providers: list[str]
    email_verified_at: datetime | None = None


@router.get("/me", response_model=AuthMeResponse)
async def auth_me(
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> AuthMeResponse:
    status_payload = await get_auth_status(db, auth.firebase_uid)
    return AuthMeResponse(
        email=str(status_payload["email"]),
        email_verified=bool(status_payload["email_verified"]),
        requires_email_verification=bool(status_payload["requires_email_verification"]),
        providers=list(status_payload["providers"]),
        email_verified_at=status_payload["email_verified_at"],  # type: ignore[arg-type]
    )


@router.post("/send-verification-email", response_model=VerificationEmailResponse)
async def send_verification_email_endpoint(
    body: SendVerificationEmailRequest | None = None,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> VerificationEmailResponse:
    status_payload = await get_auth_status(db, auth.firebase_uid)
    if not status_payload["requires_email_verification"]:
        return VerificationEmailResponse(
            message="Email already verified.",
            email_sent=False,
        )

    email = str(status_payload["email"]) or auth.email
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No email on account")

    app_origin = body.app_origin.strip() if body and body.app_origin else None
    if app_origin:
        app_origin = app_origin.rstrip("/")

    try:
        email_sent, message, verification_link = send_verification_email(
            auth.firebase_uid,
            email,
            app_origin=app_origin,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We could not send the verification email right now. Please try again in a few minutes.",
        ) from exc

    if not email_sent and verification_link is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=message,
        )

    return VerificationEmailResponse(
        message=message,
        email_sent=email_sent,
        verification_link=verification_link,
    )


@router.post("/confirm-email-verification", response_model=ConfirmEmailVerificationResponse)
async def confirm_email_verification_endpoint(
    body: ConfirmEmailVerificationRequest,
    db: AsyncSession = Depends(get_db),
) -> ConfirmEmailVerificationResponse:
    token = body.token.strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing verification token")

    try:
        message = await confirm_email_verification(db, token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return ConfirmEmailVerificationResponse(message=message)


@router.post("/dev-verification-link", response_model=VerificationEmailResponse)
async def dev_verification_link(
    auth: AuthContext = Depends(get_auth_context),
) -> VerificationEmailResponse:
    """Deprecated — use /send-verification-email. Kept for older clients."""
    if not settings.debug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return await send_verification_email_endpoint(auth)
