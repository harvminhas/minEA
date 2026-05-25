"""Auth helpers — dev verification link only (Firebase sends auth emails)."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import AuthContext, get_auth_context
from app.config import settings
from app.services.verification_email import generate_verification_link

router = APIRouter(prefix="/auth", tags=["auth"])


class VerificationLinkResponse(BaseModel):
    message: str
    verification_link: str


@router.post("/dev-verification-link", response_model=VerificationLinkResponse)
async def dev_verification_link(
    auth: AuthContext = Depends(get_auth_context),
) -> VerificationLinkResponse:
    """DEBUG-only fallback when Firebase email has not arrived."""
    if not settings.debug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    if not auth.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No email on account")

    if auth.email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already verified")

    try:
        link = generate_verification_link(auth.email)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not generate verification link: {exc}",
        ) from exc

    return VerificationLinkResponse(
        message="Local dev fallback — click the link below to verify.",
        verification_link=link,
    )
