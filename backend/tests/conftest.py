import os

os.environ["KICKER_DATABASE_URL"] = "sqlite:///:memory:"
os.environ["KICKER_SECRET_KEY"] = "test-secret"
os.environ["KICKER_PUBLIC_BASE_URL"] = "http://test"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from kicker import db as db_module
from kicker.auth import hash_password
from kicker.main import create_app
from kicker.models import Base, User


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )

    @event.listens_for(eng, "connect")
    def _fk(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    Base.metadata.create_all(bind=eng)
    yield eng
    eng.dispose()


@pytest.fixture
def session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@pytest.fixture
def client(engine, session_factory, monkeypatch):
    monkeypatch.setattr(db_module, "engine", engine)
    monkeypatch.setattr(db_module, "SessionLocal", session_factory)

    app = create_app()

    def override_get_db():
        s = session_factory()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[db_module.get_db] = override_get_db
    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin_user(session_factory) -> User:
    with session_factory() as s:
        u = User(
            name="Admin",
            role="admin",
            password_hash=hash_password("adminpw123"),
        )
        s.add(u)
        s.commit()
        s.refresh(u)
        return u


@pytest.fixture
def admin_client(client, admin_user) -> "TestClient":
    r = client.post("/api/auth/login", json={"name": "Admin", "password": "adminpw123"})
    assert r.status_code == 200, r.text
    return client
