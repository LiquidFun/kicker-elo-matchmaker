from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="KICKER_", extra="ignore")

    database_url: str = "sqlite:///./storage/kicker.db"
    secret_key: str = "dev-secret-change-me"
    session_lifetime_days: int = 30
    password_link_lifetime_hours: int = 72
    public_base_url: str = "http://localhost:5173"
    cors_origins: list[str] = ["http://localhost:5173"]
    cookie_secure: bool = False
    cookie_name: str = "kicker_session"
    storage_dir: str = "./storage"
    avatar_max_bytes: int = 10 * 1024 * 1024
    # Public-demo mode: skip auth on read endpoints and on match creation,
    # so anonymous visitors can try the app. Admin login is still required
    # for user management, match deletion, and settings changes.
    public_mode: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
