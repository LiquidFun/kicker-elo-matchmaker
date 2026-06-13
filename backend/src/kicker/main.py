from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .db import engine
from .models import Base
from .routers import auth as auth_router
from .routers import balance as balance_router
from .routers import matches as matches_router
from .routers import organizations as orgs_router
from .routers import settings_router
from .routers import stats as stats_router
from .routers import users as users_router


def _auto_migrate_if_needed() -> None:
    """Run pending migrations on existing SQLite databases."""
    settings = get_settings()
    url = settings.database_url
    if not url.startswith("sqlite:///"):
        return
    db_path = Path(url.removeprefix("sqlite:///"))
    if not db_path.exists():
        return  # fresh install — create_all will handle it
    import sqlite3

    con = sqlite3.connect(db_path)
    has_org_col = any(
        row[1] == "organization_id" for row in con.execute("PRAGMA table_info(users)")
    )
    has_penalty_col = any(
        row[1] == "penalty_before" for row in con.execute("PRAGMA table_info(matches)")
    )
    con.close()

    if not has_org_col:
        from .scripts.migrate_orgs import migrate

        migrate(db_path)

    if not has_penalty_col:
        from .scripts.migrate_twovone import migrate as migrate_twovone

        migrate_twovone(db_path)


@asynccontextmanager
async def lifespan(_: FastAPI):
    from .db import SessionLocal
    from .models import Organization

    _auto_migrate_if_needed()
    Base.metadata.create_all(bind=engine)
    # Ensure the Default organization exists (for fresh installs).
    with SessionLocal() as db:
        if db.get(Organization, 1) is None:
            db.add(Organization(id=1, name="Default"))
            db.commit()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Kicker Elo", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth_router.router)
    app.include_router(auth_router.config_router)
    app.include_router(users_router.router)
    app.include_router(users_router.password_router)
    app.include_router(matches_router.router)
    app.include_router(orgs_router.router)
    app.include_router(balance_router.router)
    app.include_router(settings_router.router)
    app.include_router(stats_router.router)

    avatars_dir = Path(settings.storage_dir) / "avatars"
    avatars_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/api/avatars", StaticFiles(directory=avatars_dir), name="avatars")

    return app


app = create_app()
