from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import auth, elo, models, schemas
from ..db import get_db
from .settings_router import get_twovone_penalty

router = APIRouter(prefix="/api", tags=["balance"])


def _load_players(db: Session, ids: list[int]) -> dict[int, models.User]:
    rows = (
        db.query(models.User)
        .filter(models.User.id.in_(set(ids)), models.User.deleted_at.is_(None))
        .all()
    )
    by_id = {u.id: u for u in rows}
    missing = set(ids) - by_id.keys()
    if missing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown players: {sorted(missing)}")
    return by_id


def _to_ratings(users: list[models.User]) -> list[elo.PlayerRatings]:
    return [
        elo.PlayerRatings(
            user_id=u.id,
            attacker=u.rating_attacker,
            defender=u.rating_defender,
            singles=u.rating_singles,
            games_attacker=u.games_attacker,
            games_defender=u.games_defender,
            games_singles=u.games_singles,
        )
        for u in users
    ]


def _lineup_to_schema(lu: elo.Lineup) -> schemas.LineupOut:
    return schemas.LineupOut(
        team1_attacker=lu.team1_attacker,
        team1_defender=lu.team1_defender,
        team2_attacker=lu.team2_attacker,
        team2_defender=lu.team2_defender,
        win_prob_team1=lu.win_prob_team1,
    )


def _twovone_lineup_to_schema(lu: elo.TwoVsOneLineupSummary) -> schemas.TwoVsOneLineupOut:
    return schemas.TwoVsOneLineupOut(
        team1_attacker=lu.team1_attacker,
        team1_defender=lu.team1_defender,
        solo=lu.solo,
        win_prob_team1=lu.win_prob_team1,
    )


@router.post("/balance")
def balance(
    payload: schemas.BalanceIn,
    org_id: int = Depends(auth.get_org_id_public),
    db: Session = Depends(get_db),
) -> schemas.BalanceOut:
    if len(set(payload.player_ids)) != 4:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Need 4 distinct players")
    users = _load_players(db, payload.player_ids)
    if any(u.organization_id != org_id for u in users.values()):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "All players must belong to the same organization"
        )
    ratings = _to_ratings([users[i] for i in payload.player_ids])
    best, alternatives = elo.best_balanced_lineup(ratings)
    return schemas.BalanceOut(
        best=_lineup_to_schema(best),
        alternatives=[_lineup_to_schema(lu) for lu in alternatives],
    )


@router.post("/balance/2v1")
def balance_twovone(
    payload: schemas.TwoVsOneBalanceIn,
    org_id: int = Depends(auth.get_org_id_public),
    db: Session = Depends(get_db),
) -> schemas.TwoVsOneBalanceOut:
    if len(set(payload.player_ids)) != 3:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Need 3 distinct players")
    users = _load_players(db, payload.player_ids)
    if any(u.organization_id != org_id for u in users.values()):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "All players must belong to the same organization"
        )
    penalty = get_twovone_penalty(db, org_id)
    ratings = _to_ratings([users[i] for i in payload.player_ids])
    best, alternatives = elo.best_balanced_twovone_lineup(ratings, penalty)
    return schemas.TwoVsOneBalanceOut(
        best=_twovone_lineup_to_schema(best),
        alternatives=[_twovone_lineup_to_schema(lu) for lu in alternatives],
    )


@router.post("/preview")
def preview(
    payload: schemas.PreviewIn,
    org_id: int = Depends(auth.get_org_id_public),
    db: Session = Depends(get_db),
) -> schemas.PreviewOut:
    ids = [p.user_id for p in payload.players]
    if len(set(ids)) != len(ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Duplicate players")
    if payload.mode == "doubles" and len(ids) != 4:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Doubles requires 4 players")
    if payload.mode == "singles" and len(ids) != 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Singles requires 2 players")
    if payload.mode == "2v1" and len(ids) != 3:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "2v1 requires 3 players")

    users = _load_players(db, ids)
    if any(u.organization_id != org_id for u in users.values()):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "All players must belong to the same organization"
        )
    ratings = {
        uid: elo.PlayerRatings(
            user_id=uid,
            attacker=u.rating_attacker,
            defender=u.rating_defender,
            singles=u.rating_singles,
            games_attacker=u.games_attacker,
            games_defender=u.games_defender,
            games_singles=u.games_singles,
        )
        for uid, u in users.items()
    }

    lineup: elo.DoublesLineup | elo.SinglesLineup | elo.TwoVsOneLineup
    if payload.mode == "doubles":
        slots: dict[tuple[int, str], elo.PlayerRatings] = {}
        for p in payload.players:
            slots[(p.team, p.position)] = ratings[p.user_id]
        try:
            lineup = elo.DoublesLineup(
                team1_attacker=slots[(1, "attacker")],
                team1_defender=slots[(1, "defender")],
                team2_attacker=slots[(2, "attacker")],
                team2_defender=slots[(2, "defender")],
            )
        except KeyError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Missing slot: {e}") from e
    elif payload.mode == "2v1":
        penalty = get_twovone_penalty(db, org_id)
        by_slot: dict[tuple[int, str], elo.PlayerRatings] = {}
        solo_player: elo.PlayerRatings | None = None
        for p in payload.players:
            if p.position == "solo":
                solo_player = ratings[p.user_id]
            else:
                by_slot[(p.team, p.position)] = ratings[p.user_id]
        if solo_player is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "2v1 needs one solo player")
        try:
            lineup = elo.TwoVsOneLineup(
                team1_attacker=by_slot[(1, "attacker")],
                team1_defender=by_slot[(1, "defender")],
                solo=solo_player,
                penalty=penalty,
            )
        except KeyError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Missing slot: {e}") from e
    else:
        try:
            p1 = next(p for p in payload.players if p.team == 1)
            p2 = next(p for p in payload.players if p.team == 2)
        except StopIteration as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Need one player per team") from e
        lineup = elo.SinglesLineup(player1=ratings[p1.user_id], player2=ratings[p2.user_id])

    win_prob, outcomes = elo.preview_outcomes(lineup, payload.goals_to_win)
    return schemas.PreviewOut(
        win_prob_team1=win_prob,
        outcomes=[
            schemas.PreviewOutcome(team1_score=t1, team2_score=t2, deltas=per_user)
            for t1, t2, per_user in outcomes
        ],
    )
