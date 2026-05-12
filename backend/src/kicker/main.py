from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import engine
from .models import Base
from .routers import auth as auth_router
from .routers import balance as balance_router
from .routers import matches as matches_router
from .routers import settings_router
from .routers import stats as stats_router
from .routers import users as users_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
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
    app.include_router(users_router.router)
    app.include_router(users_router.password_router)
    app.include_router(matches_router.router)
    app.include_router(balance_router.router)
    app.include_router(settings_router.router)
    app.include_router(stats_router.router)
    return app


app = create_app()
