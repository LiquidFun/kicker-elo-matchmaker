import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..db import get_db

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("")
def list_users(
    _: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
) -> list[schemas.UserOut]:
    rows = (
        db.query(models.User)
        .filter(models.User.deleted_at.is_(None))
        .order_by(models.User.display_name)
        .all()
    )
    return [schemas.UserOut.from_user(u) for u in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: schemas.UserCreateIn,
    _: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
) -> schemas.UserCreateOut:
    user = models.User(
        username=payload.username,
        display_name=payload.display_name,
        email=payload.email,
        avatar_url=payload.avatar_url,
        role=payload.role,
        password_hash=auth.hash_password(payload.password) if payload.password else None,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Username or email already exists") from None
    db.refresh(user)

    set_url: str | None = None
    if payload.password is None:
        token = auth.create_password_set_token(db, user)
        set_url = auth.password_set_url(token)

    return schemas.UserCreateOut(user=schemas.UserOut.from_user(user), password_set_url=set_url)


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    payload: schemas.UserUpdateIn,
    actor: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
) -> schemas.UserOut:
    target = db.get(models.User, user_id)
    if target is None or target.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if actor.role != "admin" and actor.id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot edit other users")
    if payload.role is not None and actor.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot change role")
    for field in ("display_name", "email", "avatar_url", "role"):
        value = getattr(payload, field)
        if value is not None:
            setattr(target, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already exists") from None
    db.refresh(target)
    return schemas.UserOut.from_user(target)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    actor: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
) -> None:
    if actor.id == user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete yourself")
    target = db.get(models.User, user_id)
    if target is None or target.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    target.deleted_at = models.utcnow()
    db.query(models.Session).filter(models.Session.user_id == user_id).delete()
    db.commit()


@router.post("/{user_id}/password-link")
def issue_password_link(
    user_id: int,
    _: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
) -> dict:
    target = db.get(models.User, user_id)
    if target is None or target.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    db.query(models.PasswordSetToken).filter(
        models.PasswordSetToken.user_id == user_id,
        models.PasswordSetToken.used_at.is_(None),
    ).delete()
    token = auth.create_password_set_token(db, target)
    return {"password_set_url": auth.password_set_url(token)}


password_router = APIRouter(prefix="/api/password", tags=["password"])


@password_router.get("/lookup")
def lookup_password_token(token: str, db: Session = Depends(get_db)) -> schemas.UserOut:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = db.get(models.PasswordSetToken, token_hash)
    now = datetime.now(timezone.utc)
    if (
        row is None
        or row.used_at is not None
        or row.expires_at.replace(tzinfo=timezone.utc) < now
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    user = db.get(models.User, row.user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return schemas.UserOut.from_user(user)


@password_router.post("/set")
def set_password(payload: schemas.PasswordSetIn, db: Session = Depends(get_db)) -> dict:
    user = auth.consume_password_set_token(db, payload.token)
    user.password_hash = auth.hash_password(payload.new_password)
    db.commit()
    return {"ok": True}
