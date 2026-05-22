from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..db import get_db

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


@router.get("/current")
def current_organization(
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
) -> schemas.OrganizationOut:
    org = db.get(models.Organization, user.organization_id)
    return schemas.OrganizationOut.model_validate(org)


@router.get("")
def list_organizations(
    _: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
) -> list[schemas.OrganizationOut]:
    rows = db.query(models.Organization).order_by(models.Organization.name).all()
    return [schemas.OrganizationOut.model_validate(r) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: schemas.OrganizationCreateIn,
    _: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
) -> schemas.OrganizationOut:
    org = models.Organization(name=payload.name)
    db.add(org)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Name already exists") from None
    db.refresh(org)
    return schemas.OrganizationOut.model_validate(org)


@router.patch("/{org_id}")
def update_organization(
    org_id: int,
    payload: schemas.OrganizationUpdateIn,
    _: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
) -> schemas.OrganizationOut:
    org = db.get(models.Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    org.name = payload.name
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Name already exists") from None
    db.refresh(org)
    return schemas.OrganizationOut.model_validate(org)


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_organization(
    org_id: int,
    _: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
) -> None:
    org = db.get(models.Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    if org_id == 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete the Default organization")
    user_count = (
        db.query(models.User)
        .filter(models.User.organization_id == org_id, models.User.deleted_at.is_(None))
        .count()
    )
    if user_count > 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Organization still has {user_count} active user(s)",
        )
    db.delete(org)
    db.commit()
