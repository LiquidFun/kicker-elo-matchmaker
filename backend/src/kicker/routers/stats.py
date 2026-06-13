from collections import Counter
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import auth, models, schemas
from ..db import get_db

router = APIRouter(prefix="/api/stats", tags=["stats"])

Mode = Literal["attacker", "defender", "singles"]


def _rating_column(mode: Mode):
    return {
        "attacker": models.User.rating_attacker,
        "defender": models.User.rating_defender,
        "singles": models.User.rating_singles,
    }[mode]


def _games_column(mode: Mode):
    return {
        "attacker": models.User.games_attacker,
        "defender": models.User.games_defender,
        "singles": models.User.games_singles,
    }[mode]


@router.get("/leaderboard")
def leaderboard(
    mode: Mode = Query("attacker"),
    limit: int = Query(100, ge=1, le=500),
    org_id: int = Depends(auth.get_org_id_public),
    db: Session = Depends(get_db),
) -> list[schemas.UserOut]:
    rating = _rating_column(mode)
    games = _games_column(mode)
    rows = (
        db.query(models.User)
        .filter(
            models.User.deleted_at.is_(None),
            models.User.organization_id == org_id,
            games > 0,
        )
        .order_by(rating.desc(), games.desc(), models.User.name)
        .limit(limit)
        .all()
    )
    return [schemas.UserOut.from_user(u) for u in rows]


@router.get("/users/{user_id}")
def user_stats(
    user_id: int,
    org_id: int = Depends(auth.get_org_id_public),
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)
    if user is None or user.deleted_at is not None or user.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    stmt = (
        select(models.MatchPlayer)
        .join(models.Match)
        .where(models.MatchPlayer.user_id == user_id)
        .options(selectinload(models.MatchPlayer.match).selectinload(models.Match.players))
        .order_by(models.Match.created_at.asc())
    )
    mps: list[models.MatchPlayer] = list(db.scalars(stmt).unique().all())

    history = {"attacker": [], "defender": [], "singles": []}
    wins = Counter()
    losses = Counter()
    partner_games: Counter[int] = Counter()
    opponent_games: Counter[int] = Counter()

    for mp in mps:
        history[mp.position].append(
            {
                "match_id": mp.match_id,
                "created_at": mp.match.created_at.isoformat(),
                "rating_after": mp.rating_after,
                "rating_delta": mp.rating_delta,
            }
        )
        won = mp.match.winner_team == mp.team
        (wins if won else losses)[mp.position] += 1
        for other in mp.match.players:
            if other.user_id == user_id:
                continue
            if other.team == mp.team:
                partner_games[other.user_id] += 1
            else:
                opponent_games[other.user_id] += 1

    def top(c: Counter[int], n: int = 5):
        return [{"user_id": uid, "games": cnt} for uid, cnt in c.most_common(n)]

    return {
        "user": schemas.UserOut.from_user(user),
        "history": history,
        "totals": {
            "attacker": {"wins": wins["attacker"], "losses": losses["attacker"]},
            "defender": {"wins": wins["defender"], "losses": losses["defender"]},
            "singles": {"wins": wins["singles"], "losses": losses["singles"]},
        },
        "top_partners": top(partner_games),
        "top_opponents": top(opponent_games),
    }


@router.get("/global")
def global_stats(
    org_id: int = Depends(auth.get_org_id_public),
    db: Session = Depends(get_db),
):
    doubles = (
        db.query(models.Match)
        .filter(models.Match.mode == "doubles", models.Match.organization_id == org_id)
        .count()
    )
    singles = (
        db.query(models.Match)
        .filter(models.Match.mode == "singles", models.Match.organization_id == org_id)
        .count()
    )
    twovone = (
        db.query(models.Match)
        .filter(models.Match.mode == "2v1", models.Match.organization_id == org_id)
        .count()
    )
    active_users = (
        db.query(models.User)
        .filter(
            models.User.deleted_at.is_(None),
            models.User.organization_id == org_id,
            (models.User.games_attacker + models.User.games_defender + models.User.games_singles)
            > 0,
        )
        .count()
    )
    return {
        "total_matches": doubles + singles + twovone,
        "doubles_matches": doubles,
        "singles_matches": singles,
        "twovone_matches": twovone,
        "active_players": active_users,
    }
