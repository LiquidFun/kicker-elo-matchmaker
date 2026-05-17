from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..config import get_settings
from ..db import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

# In-process sliding-window limiter. Single-process SQLite deployment, so a
# shared dict is sufficient; switch to Redis if we ever scale out.
_LOGIN_WINDOW_SECONDS = 900
_LOGIN_MAX_FAILURES = 10
_login_failures: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_login_lock = Lock()


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def _check_login_rate(ip: str, name: str) -> None:
    now = monotonic()
    cutoff = now - _LOGIN_WINDOW_SECONDS
    key = (ip, name.lower())
    with _login_lock:
        attempts = _login_failures[key]
        while attempts and attempts[0] < cutoff:
            attempts.popleft()
        if len(attempts) >= _LOGIN_MAX_FAILURES:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many failed attempts; try again later",
            )


def _record_login_failure(ip: str, name: str) -> None:
    with _login_lock:
        _login_failures[(ip, name.lower())].append(monotonic())


def _clear_login_failures(ip: str, name: str) -> None:
    with _login_lock:
        _login_failures.pop((ip, name.lower()), None)


@router.post("/login")
def login(
    payload: schemas.LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> schemas.UserOut:
    ip = _client_ip(request)
    _check_login_rate(ip, payload.name)
    user = db.query(models.User).filter(models.User.name == payload.name).one_or_none()
    if user is None or user.deleted_at is not None or user.password_hash is None:
        auth.dummy_verify()
        _record_login_failure(ip, payload.name)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not auth.verify_password(user.password_hash, payload.password):
        _record_login_failure(ip, payload.name)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    _clear_login_failures(ip, payload.name)
    sid = auth.create_session(db, user, request.headers.get("user-agent"))
    auth.set_session_cookie(response, sid)
    return schemas.UserOut.from_user(user)


@router.post("/logout")
def logout(response: Response, request: Request, db: Session = Depends(get_db)) -> dict:
    sid = request.cookies.get(get_settings().cookie_name)
    if sid:
        sess = db.get(models.Session, sid)
        if sess is not None:
            db.delete(sess)
            db.commit()
    auth.clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(user: models.User = Depends(auth.get_current_user)) -> schemas.UserOut:
    return schemas.UserOut.from_user(user)
