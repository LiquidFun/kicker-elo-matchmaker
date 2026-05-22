from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..db import get_db

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULT_GOALS_TO_WIN = 5
KEY_GOALS_TO_WIN = "default_goals_to_win"


def _get_goals_to_win(db: Session, org_id: int) -> int:
    row = db.get(models.Setting, (org_id, KEY_GOALS_TO_WIN))
    if row is None:
        return DEFAULT_GOALS_TO_WIN
    try:
        return int(row.value)
    except ValueError:
        return DEFAULT_GOALS_TO_WIN


@router.get("")
def get_settings_endpoint(
    org_id: int = Depends(auth.get_org_id_public),
    db: Session = Depends(get_db),
) -> schemas.SettingsOut:
    return schemas.SettingsOut(default_goals_to_win=_get_goals_to_win(db, org_id))


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
    db.commit()
    return schemas.SettingsOut(default_goals_to_win=payload.default_goals_to_win)
