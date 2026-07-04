from pathlib import Path
import os

from dotenv import load_dotenv
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(API_ROOT / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=API_ROOT / ".env",
        extra="ignore",
    )

    # App
    app_name: str = "minEA API"
    debug: bool = False
    # Signs email-verification links. Prefer a dedicated secret in production.
    # Falls back to RESEND_API_KEY when unset (needed for sending anyway).
    app_secret: str = ""

    # Database
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/minea"
    database_ssl: bool = False  # set true for Cloud SQL public IP / managed Postgres
    # Cloud SQL server CA PEM (path or inline). Prefer this on Vercel for verified TLS.
    database_ssl_ca: str = ""
    # Encrypted TLS without CA verification — use on Vercel if you skip DATABASE_SSL_CA.
    database_ssl_verify: bool = True

    @field_validator("database_ssl_ca", mode="before")
    @classmethod
    def normalize_database_ssl_ca(cls, value: object) -> str:
        if not value or not isinstance(value, str):
            return ""
        pem = value.strip().strip('"').strip("'")
        if "\\n" in pem:
            pem = pem.replace("\\n", "\n")
        return pem
    redis_url: str = "redis://localhost:6379"

    # Firebase
    firebase_project_id: str = "minea-a1d4c"
    firebase_credentials_path: str = "fb_svc_acct.json"
    firebase_service_account_json: str = ""

    # Google Gemini
    google_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # Resend
    resend_api_key: str = ""
    email_from: str = "minEA <onboarding@resend.dev>"

    # Web app URL (verification links, invites)
    web_app_url: str = "http://localhost:3001"

    # Stripe (Solo self-serve checkout)
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_solo_price_id: str = ""

    # CORS — override in production via env, e.g.
    # CORS_ORIGINS=["https://your-web.vercel.app","http://localhost:3000"]
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:3001",
            "https://minea-a1d4c.web.app",
            "https://minea-a1d4c.firebaseapp.com",
        ]
    )


settings = Settings()


def is_vercel() -> bool:
    return os.getenv("VERCEL") == "1"


def effective_cors_origins() -> list[str]:
    """Allowed browser origins — includes WEB_APP_URL and this deployment's Vercel URL."""
    origins: list[str] = []
    seen: set[str] = set()

    def add(origin: str | None) -> None:
        if not origin:
            return
        normalized = origin.rstrip("/")
        if normalized and normalized not in seen:
            seen.add(normalized)
            origins.append(normalized)

    for origin in settings.cors_origins:
        add(origin)
    add(settings.web_app_url)

    vercel_url = os.getenv("VERCEL_URL")
    if vercel_url:
        add(f"https://{vercel_url}")

    return origins
