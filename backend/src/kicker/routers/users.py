import contextlib
import hashlib
import io
import secrets
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from PIL import Image, ImageOps
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..config import get_settings
from ..db import get_db

router = APIRouter(prefix="/api/users", tags=["users"])


def _can_manage(actor: models.User, target: models.User) -> bool:
    """Check if actor can manage target (edit password, avatar, etc.)."""
    if actor.id == target.id:
        return True
    if actor.role == "admin":
        return True
    return actor.role == "moderator" and actor.organization_id == target.organization_id


_IMAGE_MAGIC: list[tuple[bytes, str]] = [
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpg"),
]

_AVATAR_URL_PREFIX = "/api/avatars/"


def _sniff_image(data: bytes) -> str | None:
    for prefix, ext in _IMAGE_MAGIC:
        if data.startswith(prefix):
            return ext
    if len(data) >= 12 and data[0:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


_AVATAR_MAX_PX = 256


def _resize_avatar(data: bytes) -> bytes:
    """Resize to at most 256x256, center-crop to square, and encode as WebP."""
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    else:
        img = img.convert("RGB")
    # Center-crop to square
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    # Downscale
    if side > _AVATAR_MAX_PX:
        img = img.resize((_AVATAR_MAX_PX, _AVATAR_MAX_PX), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=85)
    return buf.getvalue()


def _delete_avatar_file(url: str | None, storage_dir: str) -> None:
    """Best-effort delete of a stored avatar. No-op for external URLs or missing files."""
    if not url or not url.startswith(_AVATAR_URL_PREFIX):
        return
    filename = url[len(_AVATAR_URL_PREFIX) :]
    if "/" in filename or filename in ("", ".", ".."):
        return
    with contextlib.suppress(OSError):
        (Path(storage_dir) / "avatars" / filename).unlink(missing_ok=True)


@router.get("")
def list_users(
    org_id: int = Depends(auth.get_org_id_public),
    db: Session = Depends(get_db),
) -> list[schemas.UserOut]:
    rows = (
        db.query(models.User)
        .filter(models.User.deleted_at.is_(None), models.User.organization_id == org_id)
        .order_by(models.User.name)
        .all()
    )
    return [schemas.UserOut.from_user(u) for u in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: schemas.UserCreateIn,
    actor: models.User = Depends(auth.require_moderator_or_admin),
    org_id: int = Depends(auth.get_org_id),
    db: Session = Depends(get_db),
) -> schemas.UserCreateOut:
    if actor.role == "moderator" and payload.role == "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Moderators cannot create admins")
    user = models.User(
        name=payload.name,
        role=payload.role,
        password_hash=auth.hash_password(payload.password) if payload.password else None,
        organization_id=org_id,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Name already exists") from None
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
    is_self = actor.id == user_id
    is_admin = actor.role == "admin"
    is_mod_for_target = (
        actor.role == "moderator" and actor.organization_id == target.organization_id
    )
    if not is_admin and not is_mod_for_target and not is_self:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot edit other users")
    if payload.role is not None:
        if not is_admin and not is_mod_for_target:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot change role")
        if actor.role == "moderator" and payload.role == "admin":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Moderators cannot promote to admin")
    if payload.name is not None and not is_admin and not is_mod_for_target:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot change name")
    provided = payload.model_dump(exclude_unset=True)
    for field in ("name", "role"):
        if field in provided:
            setattr(target, field, provided[field])
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Name already exists") from None
    db.refresh(target)
    return schemas.UserOut.from_user(target)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    actor: models.User = Depends(auth.require_moderator_or_admin),
    db: Session = Depends(get_db),
) -> None:
    if actor.id == user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete yourself")
    target = db.get(models.User, user_id)
    if target is None or target.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if actor.role == "moderator" and target.organization_id != actor.organization_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Cannot delete users from other organizations"
        )
    target.deleted_at = models.utcnow()
    db.query(models.Session).filter(models.Session.user_id == user_id).delete()
    db.commit()


@router.post("/{user_id}/password")
def change_password(
    user_id: int,
    payload: schemas.PasswordChangeIn,
    actor: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    target = db.get(models.User, user_id)
    if target is None or target.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if not _can_manage(actor, target):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot change other users' password")
    if actor.id == user_id and (
        not payload.current_password
        or target.password_hash is None
        or not auth.verify_password(target.password_hash, payload.current_password)
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password incorrect")
    target.password_hash = auth.hash_password(payload.new_password)
    db.commit()
    return {"ok": True}


@router.delete("/{user_id}/avatar")
def delete_avatar(
    user_id: int,
    actor: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
) -> schemas.UserOut:
    target = db.get(models.User, user_id)
    if target is None or target.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if not _can_manage(actor, target):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot change other users' avatar")

    previous = target.avatar_url
    target.avatar_url = None
    db.commit()
    db.refresh(target)
    _delete_avatar_file(previous, get_settings().storage_dir)
    return schemas.UserOut.from_user(target)


@router.post("/{user_id}/avatar")
def upload_avatar(
    user_id: int,
    file: UploadFile = File(...),
    actor: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
) -> schemas.UserOut:
    target = db.get(models.User, user_id)
    if target is None or target.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if not _can_manage(actor, target):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot change other users' avatar")

    settings = get_settings()
    data = file.file.read(settings.avatar_max_bytes + 1)
    if len(data) > settings.avatar_max_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Image exceeds {settings.avatar_max_bytes // 1024}KB",
        )
    ext = _sniff_image(data)
    if ext is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only PNG, JPEG or WebP allowed"
        )

    data = _resize_avatar(data)
    avatars_dir = Path(settings.storage_dir) / "avatars"
    avatars_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{secrets.token_hex(16)}.webp"
    (avatars_dir / filename).write_bytes(data)

    previous = target.avatar_url
    target.avatar_url = f"{_AVATAR_URL_PREFIX}{filename}"
    db.commit()
    db.refresh(target)
    _delete_avatar_file(previous, settings.storage_dir)
    return schemas.UserOut.from_user(target)


@router.post("/{user_id}/password-link")
def issue_password_link(
    user_id: int,
    actor: models.User = Depends(auth.require_moderator_or_admin),
    db: Session = Depends(get_db),
) -> dict:
    target = db.get(models.User, user_id)
    if target is None or target.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if not _can_manage(actor, target):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Cannot manage users from other organizations"
        )
    db.query(models.PasswordSetToken).filter(
        models.PasswordSetToken.user_id == user_id,
        models.PasswordSetToken.used_at.is_(None),
    ).delete()
    token = auth.create_password_set_token(db, target)
    return {"password_set_url": auth.password_set_url(token)}


password_router = APIRouter(prefix="/api/password", tags=["password"])


@password_router.post("/lookup")
def lookup_password_token(
    payload: schemas.PasswordLookupIn, db: Session = Depends(get_db)
) -> schemas.UserOut:
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    row = db.get(models.PasswordSetToken, token_hash)
    now = datetime.now(UTC)
    if row is None or row.used_at is not None or row.expires_at.replace(tzinfo=UTC) < now:
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
