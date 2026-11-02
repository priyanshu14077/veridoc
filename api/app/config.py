from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://crosscheck:crosscheck@localhost:5433/crosscheck"
    session_ttl_hours: int = 12
    cookie_secure: bool = False
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    # Only trust X-Forwarded-For when the API sits behind our own proxy (Next.js rewrite / LB).
    trust_proxy: bool = True
    login_max_attempts: int = 5
    login_window_seconds: int = 60

    # Extraction
    storage_dir: str = "storage"
    max_upload_mb: int = 15
    max_pages: int = 10
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash"
    # Tried in order when the primary model is overloaded (503) or rate-limited (429).
    gemini_fallback_models: list[str] = Field(
        default_factory=lambda: [
            "gemini-3.8-flash",
            "gemini-flash-latest",
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite",
        ]
    )
    gemini_timeout_s: int = 90
    gemini_rpm: int = 8  # stay under the free-tier per-minute limit
    confidence_threshold: float = 0.85  # PRD A6
    worker_poll_s: float = 1.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
