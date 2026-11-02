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


@lru_cache
def get_settings() -> Settings:
    return Settings()
