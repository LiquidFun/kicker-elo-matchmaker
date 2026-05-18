import contextlib
import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session as SASession

from . import models
from .config import get_settings
from .db import get_db

_hasher = PasswordHasher()
_settings = get_settings()

# Hash of a random string; used to keep failed-login timing constant
# regardless of whether the user exists.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(hash_: str, password: str) -> bool:
    try:
        _hasher.verify(hash_, password)
        return True
    except VerifyMismatchError:
        return False


def dummy_verify() -> None:
    """Run an Argon2 verify against a constant hash to equalize login timing."""
    with contextlib.suppress(VerifyMismatchError):
        _hasher.verify(_DUMMY_HASH, "x")


def _new_session_id() -> str:
    return secrets.token_urlsafe(32)


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def create_session(db: SASession, user: models.User, user_agent: str | None) -> str:
    sid = _new_session_id()
    expires = datetime.now(UTC) + timedelta(days=_settings.session_lifetime_days)
    db.add(
        models.Session(
            id=sid, user_id=user.id, expires_at=expires, user_agent=user_agent
        )
    )
    db.commit()
    return sid


def set_session_cookie(response: Response, sid: str) -> None:
    response.set_cookie(
        key=_settings.cookie_name,
        value=sid,
        httponly=True,
        secure=_settings.cookie_secure,
        samesite="lax",
        max_age=_settings.session_lifetime_days * 24 * 3600,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=_settings.cookie_name, path="/")


def _resolve_session_user(db: SASession, session_id: str | None) -> models.User | None:
    if not session_id:
        return None
    sess = db.get(models.Session, session_id)
    now = datetime.now(UTC)
    if not sess or sess.expires_at.replace(tzinfo=UTC) < now:
        return None
    user = db.get(models.User, sess.user_id)
    if not user or user.deleted_at is not None:
        return None
    sess.last_seen_at = now
    db.commit()
    return user


def get_current_user(
    request: Request,
    db: SASession = Depends(get_db),
    session_id: str | None = Cookie(default=None, alias=_settings.cookie_name),
) -> models.User:
    user = _resolve_session_user(db, session_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def public_or_user(
    request: Request,
    db: SASession = Depends(get_db),
    session_id: str | None = Cookie(default=None, alias=_settings.cookie_name),
) -> models.User | None:
    """Allow anonymous access when ``public_mode`` is on, else require a session.

    Returns the resolved user, or ``None`` for anonymous calls in public mode.
    Endpoints that need to attribute writes (e.g. ``created_by_user_id``) should
    fall back to ``None`` when the actor is anonymous.
    """
    user = _resolve_session_user(db, session_id)
    if user is not None:
        return user
    if _settings.public_mode:
        return None
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user


def create_password_set_token(db: SASession, user: models.User) -> str:
    raw = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw)
    expires = datetime.now(UTC) + timedelta(hours=_settings.password_link_lifetime_hours)
    db.add(models.PasswordSetToken(token_hash=token_hash, user_id=user.id, expires_at=expires))
    db.commit()
    return raw


def consume_password_set_token(db: SASession, raw: str) -> models.User:
    token = db.get(models.PasswordSetToken, _hash_token(raw))
    now = datetime.now(UTC)
    if (
        token is None
        or token.used_at is not None
        or token.expires_at.replace(tzinfo=UTC) < now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token"
        )
    user = db.get(models.User, token.user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found")
    token.used_at = now
    return user


def password_set_url(token: str) -> str:
    return f"{_settings.public_base_url.rstrip('/')}/set-password?token={token}"
