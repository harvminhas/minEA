from pathlib import Path

from dotenv import load_dotenv
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

    # Database
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/minea"
    database_ssl: bool = False  # set true for Cloud SQL public IP

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Firebase
    firebase_project_id: str = "minea-a1d4c"
    firebase_credentials_path: str = "fb_svc_acct.json"
    firebase_service_account_json: str = ""

    # Anthropic
    anthropic_api_key: str = ""

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # Resend
    resend_api_key: str = ""
    email_from: str = "minEA <onboarding@resend.dev>"

    # Web app URL (verification links, invites)
    web_app_url: str = "http://localhost:3001"

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://minea-a1d4c.web.app",
        "https://minea-a1d4c.firebaseapp.com",
    ]


settings = Settings()
