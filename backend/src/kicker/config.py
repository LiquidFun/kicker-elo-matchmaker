from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="KICKER_", extra="ignore")

    database_url: str = "sqlite:///./kicker.db"
    secret_key: str = "dev-secret-change-me"
    session_lifetime_days: int = 30
    password_link_lifetime_hours: int = 72
    public_base_url: str = "http://localhost:5173"
    cors_origins: list[str] = ["http://localhost:5173"]
    cookie_secure: bool = False
    cookie_name: str = "kicker_session"
    storage_dir: str = "./storage"
    avatar_max_bytes: int = 2 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
