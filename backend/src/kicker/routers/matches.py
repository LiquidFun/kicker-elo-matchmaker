from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .. import auth, elo, models, schemas
from ..db import get_db

router = APIRouter(prefix="/api/matches", tags=["matches"])

NON_ADMIN_LIMIT_MAX = 500


def _load_players_or_404(db: Session, ids: list[int]) -> dict[int, models.User]:
    unique = set(ids)
    rows = db.query(models.User).filter(models.User.id.in_(unique)).all()
    by_id = {u.id: u for u in rows if u.deleted_at is None}
    missing = unique - by_id.keys()
    if missing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown players: {sorted(missing)}")
    return by_id


def _validate_lineup(payload: schemas.MatchCreateIn) -> None:
    ids = [p.user_id for p in payload.players]
    if len(set(ids)) != len(ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Duplicate players")

    high, low = (
        max(payload.team1_score, payload.team2_score),
        min(payload.team1_score, payload.team2_score),
    )
    if high != payload.goals_to_win or low >= payload.goals_to_win:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Exactly one side must reach {payload.goals_to_win} goals",
        )
    if payload.team1_score == payload.team2_score:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No ties allowed")

    if payload.mode == "doubles":
        if len(payload.players) != 4:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Doubles requires 4 players")
        for team in (1, 2):
            team_players = [p for p in payload.players if p.team == team]
            if len(team_players) != 2:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Each team needs 2 players")
            positions = sorted(p.position for p in team_players)
            if positions != ["attacker", "defender"]:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, "Each team needs one attacker and one defender"
                )
    else:  # singles
        if len(payload.players) != 2:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Singles requires 2 players")
        for p in payload.players:
            if p.position != "singles":
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, "Singles players must use position 'singles'"
                )
        if {p.team for p in payload.players} != {1, 2}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Singles needs one player per team")


def _player_ratings(users: dict[int, models.User]) -> dict[int, elo.PlayerRatings]:
    return {
        u.id: elo.PlayerRatings(
            user_id=u.id,
            attacker=u.rating_attacker,
            defender=u.rating_defender,
            singles=u.rating_singles,
            games_attacker=u.games_attacker,
            games_defender=u.games_defender,
            games_singles=u.games_singles,
        )
        for u in users.values()
    }


def _build_doubles_lineup(
    payload: schemas.MatchCreateIn, ratings: dict[int, elo.PlayerRatings]
) -> elo.DoublesLineup:
    by_slot: dict[tuple[int, str], elo.PlayerRatings] = {}
    for p in payload.players:
        by_slot[(p.team, p.position)] = ratings[p.user_id]
    return elo.DoublesLineup(
        team1_attacker=by_slot[(1, "attacker")],
        team1_defender=by_slot[(1, "defender")],
        team2_attacker=by_slot[(2, "attacker")],
        team2_defender=by_slot[(2, "defender")],
    )


def _build_singles_lineup(
    payload: schemas.MatchCreateIn, ratings: dict[int, elo.PlayerRatings]
) -> elo.SinglesLineup:
    p1 = next(p for p in payload.players if p.team == 1)
    p2 = next(p for p in payload.players if p.team == 2)
    return elo.SinglesLineup(player1=ratings[p1.user_id], player2=ratings[p2.user_id])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_match(
    payload: schemas.MatchCreateIn,
    actor: models.User | None = Depends(auth.public_or_user),
    org_id: int = Depends(auth.get_org_id_public),
    db: Session = Depends(get_db),
) -> schemas.MatchOut:
    _validate_lineup(payload)
    users = _load_players_or_404(db, [p.user_id for p in payload.players])
    # Validate all players belong to the effective org
    player_orgs = {u.organization_id for u in users.values()}
    if player_orgs != {org_id}:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "All players must belong to the same organization"
        )
    ratings = _player_ratings(users)

    if payload.mode == "doubles":
        lineup = _build_doubles_lineup(payload, ratings)
        deltas = elo.doubles_deltas(lineup, payload.team1_score, payload.team2_score)
    else:
        lineup = _build_singles_lineup(payload, ratings)
        deltas = elo.singles_deltas(lineup, payload.team1_score, payload.team2_score)

    winner_team = 1 if payload.team1_score > payload.team2_score else 2
    match = models.Match(
        mode=payload.mode,
        goals_to_win=payload.goals_to_win,
        team1_score=payload.team1_score,
        team2_score=payload.team2_score,
        winner_team=winner_team,
        created_by_user_id=actor.id if actor is not None else None,
        organization_id=org_id,
    )
    db.add(match)
    db.flush()

    for p in payload.players:
        user = users[p.user_id]
        delta = deltas[(p.user_id, p.position)]
        before = getattr(user, f"rating_{p.position}")
        after = before + delta
        setattr(user, f"rating_{p.position}", after)
        setattr(user, f"games_{p.position}", getattr(user, f"games_{p.position}") + 1)
        db.add(
            models.MatchPlayer(
                match_id=match.id,
                user_id=p.user_id,
                team=p.team,
                position=p.position,
                rating_before=before,
                rating_after=after,
                rating_delta=delta,
            )
        )

    db.commit()
    db.refresh(match)
    return schemas.MatchOut.model_validate(match)


@router.get("")
def list_matches(
    actor: models.User | None = Depends(auth.public_or_user),
    org_id: int = Depends(auth.get_org_id_public),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1),
    offset: int = Query(0, ge=0),
    mode: schemas.Mode | None = None,
    user_id: int | None = None,
) -> schemas.MatchListOut:
    is_privileged = actor is not None and actor.role in ("admin", "moderator")
    if not is_privileged and limit > NON_ADMIN_LIMIT_MAX:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"limit must be <= {NON_ADMIN_LIMIT_MAX} for non-admins",
        )

    filters = [models.Match.organization_id == org_id]
    if mode is not None:
        filters.append(models.Match.mode == mode)

    count_stmt = select(func.count()).select_from(models.Match)
    items_stmt = select(models.Match).options(selectinload(models.Match.players))
    if user_id is not None:
        count_stmt = count_stmt.join(models.MatchPlayer).where(
            models.MatchPlayer.user_id == user_id
        )
        items_stmt = items_stmt.join(models.MatchPlayer).where(
            models.MatchPlayer.user_id == user_id
        )
    for f in filters:
        count_stmt = count_stmt.where(f)
        items_stmt = items_stmt.where(f)

    total = db.scalar(count_stmt) or 0
    items_stmt = items_stmt.order_by(models.Match.created_at.desc()).offset(offset).limit(limit)
    rows = db.scalars(items_stmt).unique().all()
    return schemas.MatchListOut(
        items=[schemas.MatchOut.model_validate(m) for m in rows],
        total=total,
    )


@router.get("/{match_id}")
def get_match(
    match_id: int,
    org_id: int = Depends(auth.get_org_id_public),
    db: Session = Depends(get_db),
) -> schemas.MatchOut:
    m = db.get(models.Match, match_id)
    if m is None or m.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match not found")
    return schemas.MatchOut.model_validate(m)


@router.delete("/{match_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_match(
    match_id: int,
    _: models.User = Depends(auth.require_moderator_or_admin),
    org_id: int = Depends(auth.get_org_id),
    db: Session = Depends(get_db),
) -> None:
    m = db.get(models.Match, match_id)
    if m is None or m.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match not found")
    latest = (
        db.query(models.Match)
        .filter(models.Match.organization_id == org_id)
        .order_by(models.Match.id.desc())
        .first()
    )
    if latest is None or latest.id != match_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Only the most recent match can be deleted",
        )
    # Revert rating + games changes
    for mp in m.players:
        user = db.get(models.User, mp.user_id)
        if user is None:
            continue
        setattr(user, f"rating_{mp.position}", mp.rating_before)
        setattr(user, f"games_{mp.position}", getattr(user, f"games_{mp.position}") - 1)
    db.delete(m)
    db.commit()
