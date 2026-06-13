from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..db import get_db

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULT_GOALS_TO_WIN = 5
KEY_GOALS_TO_WIN = "default_goals_to_win"
KEY_TWOVONE_PENALTY = "twovone_penalty"
DEFAULT_TWOVONE_PENALTY = 50.0


def _get_goals_to_win(db: Session, org_id: int) -> int:
    row = db.get(models.Setting, (org_id, KEY_GOALS_TO_WIN))
    if row is None:
        return DEFAULT_GOALS_TO_WIN
    try:
        return int(row.value)
    except ValueError:
        return DEFAULT_GOALS_TO_WIN


def get_twovone_penalty(db: Session, org_id: int) -> float:
    row = db.get(models.Setting, (org_id, KEY_TWOVONE_PENALTY))
    if row is None:
        return DEFAULT_TWOVONE_PENALTY
    try:
        return float(row.value)
    except ValueError:
        return DEFAULT_TWOVONE_PENALTY


def set_twovone_penalty(db: Session, org_id: int, value: float) -> None:
    row = db.get(models.Setting, (org_id, KEY_TWOVONE_PENALTY))
    if row is None:
        db.add(
            models.Setting(
                organization_id=org_id,
                key=KEY_TWOVONE_PENALTY,
                value=str(value),
            )
        )
    else:
        row.value = str(value)


@router.get("")
def get_settings_endpoint(
    org_id: int = Depends(auth.get_org_id_public),
    db: Session = Depends(get_db),
) -> schemas.SettingsOut:
    return schemas.SettingsOut(
        default_goals_to_win=_get_goals_to_win(db, org_id),
        twovone_penalty=get_twovone_penalty(db, org_id),
    )


@router.put("")
def put_settings(
    payload: schemas.SettingsIn,
    _: models.User = Depends(auth.require_moderator_or_admin),
    org_id: int = Depends(auth.get_org_id),
    db: Session = Depends(get_db),
) -> schemas.SettingsOut:
    row = db.get(models.Setting, (org_id, KEY_GOALS_TO_WIN))
    if row is None:
        db.add(
            models.Setting(
                organization_id=org_id,
                key=KEY_GOALS_TO_WIN,
                value=str(payload.default_goals_to_win),
            )
        )
    else:
        row.value = str(payload.default_goals_to_win)
    if payload.twovone_penalty is not None:
        set_twovone_penalty(db, org_id, payload.twovone_penalty)
    db.commit()
    return schemas.SettingsOut(
        default_goals_to_win=payload.default_goals_to_win,
        twovone_penalty=get_twovone_penalty(db, org_id),
    )
