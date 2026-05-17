from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..config import get_settings
from ..db import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(
    payload: schemas.LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> schemas.UserOut:
    user = db.query(models.User).filter(models.User.name == payload.name).one_or_none()
    if user is None or user.deleted_at is not None or user.password_hash is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not auth.verify_password(user.password_hash, payload.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
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
