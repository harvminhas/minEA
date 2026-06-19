"""Auth helpers — verification email delivery."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import AuthContext, get_auth_context
from app.config import settings
from app.services.verification_email import send_verification_email

router = APIRouter(prefix="/auth", tags=["auth"])


class VerificationEmailResponse(BaseModel):
    message: str
    email_sent: bool
    verification_link: str | None = None


@router.post("/send-verification-email", response_model=VerificationEmailResponse)
async def send_verification_email_endpoint(
    auth: AuthContext = Depends(get_auth_context),
) -> VerificationEmailResponse:
    if not auth.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No email on account")

    if auth.email_verified:
        return VerificationEmailResponse(
            message="Email already verified.",
            email_sent=False,
        )

    try:
        email_sent, message, verification_link = send_verification_email(auth.email)
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


@router.post("/dev-verification-link", response_model=VerificationEmailResponse)
async def dev_verification_link(
    auth: AuthContext = Depends(get_auth_context),
) -> VerificationEmailResponse:
    """Deprecated — use /send-verification-email. Kept for older clients."""
    if not settings.debug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return await send_verification_email_endpoint(auth)
