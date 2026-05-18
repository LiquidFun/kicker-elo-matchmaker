"""Seed the public-demo instance: 10 animal players + ~500 simulated games.

Tiger is the admin (gets the password you pass in); the other nine are
password-less guests.

Idempotent for the player roster (re-running updates avatars + Tiger's
password in place). Match simulation is skipped if any matches already exist —
delete the DB file by hand if you want a clean re-seed.

Usage:
  uv run python -m kicker.seed_public --admin-password PW [--games N] [--seed S]
"""

from __future__ import annotations

import argparse
import random
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import elo
from .auth import hash_password
from .config import get_settings
from .db import SessionLocal, engine
from .models import Base, Match, MatchPlayer, User

ANIMAL_ASSETS_DIR = Path(__file__).resolve().parent / "assets" / "animals"
ADMIN_ANIMAL = "Tiger"


@dataclass(frozen=True)
class Animal:
    name: str
    # "true" skills the simulation samples from; current Elo ratings will trend
    # toward these as games accumulate.
    attacker: float
    defender: float
    singles: float


ANIMALS: list[Animal] = [
    Animal("Tiger",    1750, 1700, 1750),
    Animal("Lion",     1750, 1500, 1700),
    Animal("Bear",     1600, 1750, 1650),
    Animal("Wolf",     1680, 1680, 1700),
    Animal("Elephant", 1550, 1700, 1600),
    Animal("Eagle",    1650, 1550, 1650),
    Animal("Fox",      1600, 1600, 1650),
    Animal("Rabbit",   1620, 1450, 1500),
    Animal("Mouse",    1480, 1480, 1450),
    Animal("Turtle",   1420, 1620, 1480),
]


def _stage_avatar(animal: Animal, storage_dir: Path) -> str:
    src = ANIMAL_ASSETS_DIR / f"{animal.name.lower()}.svg"
    if not src.is_file():
        raise FileNotFoundError(f"missing avatar asset: {src}")
    avatars_dir = storage_dir / "avatars"
    avatars_dir.mkdir(parents=True, exist_ok=True)
    filename = f"animal-{animal.name.lower()}.svg"
    shutil.copyfile(src, avatars_dir / filename)
    return f"/api/avatars/{filename}"


def _upsert_animals(
    db: Session, storage_dir: Path, admin_password: str
) -> dict[str, User]:
    """Upsert the 10 animals. Tiger gets admin role + ``admin_password``."""
    out: dict[str, User] = {}
    for a in ANIMALS:
        user = (
            db.query(User).filter(func.lower(User.name) == a.name.lower()).one_or_none()
        )
        avatar_url = _stage_avatar(a, storage_dir)
        is_admin = a.name == ADMIN_ANIMAL
        if user is None:
            user = User(
                name=a.name,
                avatar_url=avatar_url,
                role="admin" if is_admin else "user",
                password_hash=hash_password(admin_password) if is_admin else None,
            )
            db.add(user)
        else:
            user.avatar_url = avatar_url
            if is_admin:
                user.role = "admin"
                user.password_hash = hash_password(admin_password)
        out[a.name] = user
    db.flush()
    return out


def _true_ratings(animals_by_name: dict[str, Animal]) -> dict[str, dict[str, float]]:
    return {
        a.name: {"attacker": a.attacker, "defender": a.defender, "singles": a.singles}
        for a in animals_by_name.values()
    }


def _sample_loser_score(win_prob_winner: float, goals: int, rng: random.Random) -> int:
    # Loser's goals as Binomial(2*goals, 1-p_winner), clipped below goals-1.
    # Gives ~4 goals at even matchups, ~1 at lopsided ones.
    p_loser = max(0.05, min(0.95, 1.0 - win_prob_winner))
    trials = 2 * goals
    score = sum(1 for _ in range(trials) if rng.random() < p_loser)
    return min(goals - 1, score)


def _simulate_doubles(
    db: Session,
    players: list[User],
    true_skills: dict[str, dict[str, float]],
    goals: int,
    rng: random.Random,
) -> None:
    chosen = rng.sample(players, 4)
    # Random attacker/defender assignment within each pair
    t1a, t1d = chosen[0], chosen[1]
    t2a, t2d = chosen[2], chosen[3]

    # True team strength uses the player's TRUE attacker/defender skill, so the
    # simulated outcome is anchored to underlying skill rather than the (still
    # converging) Elo. The Elo update itself uses current ratings, as in prod.
    t1_true = (true_skills[t1a.name]["attacker"] + true_skills[t1d.name]["defender"]) / 2
    t2_true = (true_skills[t2a.name]["attacker"] + true_skills[t2d.name]["defender"]) / 2
    win_prob_t1 = elo.expected_score(t1_true, t2_true)

    t1_wins = rng.random() < win_prob_t1
    if t1_wins:
        t1_score, t2_score = goals, _sample_loser_score(win_prob_t1, goals, rng)
    else:
        t1_score, t2_score = _sample_loser_score(1 - win_prob_t1, goals, rng), goals

    lineup = elo.DoublesLineup(
        team1_attacker=_player_ratings(t1a),
        team1_defender=_player_ratings(t1d),
        team2_attacker=_player_ratings(t2a),
        team2_defender=_player_ratings(t2d),
    )
    deltas = elo.doubles_deltas(lineup, t1_score, t2_score)

    match = Match(
        mode="doubles",
        goals_to_win=goals,
        team1_score=t1_score,
        team2_score=t2_score,
        winner_team=1 if t1_score > t2_score else 2,
        created_by_user_id=None,
    )
    db.add(match)
    db.flush()

    for user, team, position in (
        (t1a, 1, "attacker"),
        (t1d, 1, "defender"),
        (t2a, 2, "attacker"),
        (t2d, 2, "defender"),
    ):
        delta = deltas[(user.id, position)]
        before = getattr(user, f"rating_{position}")
        after = before + delta
        setattr(user, f"rating_{position}", after)
        setattr(user, f"games_{position}", getattr(user, f"games_{position}") + 1)
        db.add(
            MatchPlayer(
                match_id=match.id,
                user_id=user.id,
                team=team,
                position=position,
                rating_before=before,
                rating_after=after,
                rating_delta=delta,
            )
        )


def _simulate_singles(
    db: Session,
    players: list[User],
    true_skills: dict[str, dict[str, float]],
    goals: int,
    rng: random.Random,
) -> None:
    p1, p2 = rng.sample(players, 2)
    win_prob_p1 = elo.expected_score(
        true_skills[p1.name]["singles"], true_skills[p2.name]["singles"]
    )
    p1_wins = rng.random() < win_prob_p1
    if p1_wins:
        s1, s2 = goals, _sample_loser_score(win_prob_p1, goals, rng)
    else:
        s1, s2 = _sample_loser_score(1 - win_prob_p1, goals, rng), goals

    lineup = elo.SinglesLineup(player1=_player_ratings(p1), player2=_player_ratings(p2))
    deltas = elo.singles_deltas(lineup, s1, s2)

    match = Match(
        mode="singles",
        goals_to_win=goals,
        team1_score=s1,
        team2_score=s2,
        winner_team=1 if s1 > s2 else 2,
        created_by_user_id=None,
    )
    db.add(match)
    db.flush()

    for user, team in ((p1, 1), (p2, 2)):
        delta = deltas[(user.id, "singles")]
        before = user.rating_singles
        after = before + delta
        user.rating_singles = after
        user.games_singles += 1
        db.add(
            MatchPlayer(
                match_id=match.id,
                user_id=user.id,
                team=team,
                position="singles",
                rating_before=before,
                rating_after=after,
                rating_delta=delta,
            )
        )


def _player_ratings(user: User) -> elo.PlayerRatings:
    return elo.PlayerRatings(
        user_id=user.id,
        attacker=user.rating_attacker,
        defender=user.rating_defender,
        singles=user.rating_singles,
        games_attacker=user.games_attacker,
        games_defender=user.games_defender,
        games_singles=user.games_singles,
    )


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--admin-password", required=True, help=f"password for {ADMIN_ANIMAL} (admin)")
    ap.add_argument("--games", type=int, default=500, help="number of games to simulate")
    ap.add_argument("--goals-to-win", type=int, default=5)
    ap.add_argument("--seed", type=int, default=42, help="rng seed for reproducibility")
    args = ap.parse_args(argv[1:])

    if len(args.admin_password) < 12:
        print(
            "refusing weak admin password (<12 chars). This is a publicly reachable instance.",
            file=sys.stderr,
        )
        return 2

    storage_dir = Path(get_settings().storage_dir)
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        users_by_name = _upsert_animals(db, storage_dir, args.admin_password)
        db.commit()

        existing = db.query(Match).count()
        if existing > 0:
            print(f"{existing} matches already exist — skipping simulation")
            return 0

        rng = random.Random(args.seed)
        true_skills = _true_ratings({a.name: a for a in ANIMALS})
        players = list(users_by_name.values())

        for _ in range(args.games):
            if rng.random() < 0.8:
                _simulate_doubles(db, players, true_skills, args.goals_to_win, rng)
            else:
                _simulate_singles(db, players, true_skills, args.goals_to_win, rng)
        db.commit()

    print(
        f"seeded {len(ANIMALS)} animals ({ADMIN_ANIMAL} as admin), "
        f"simulated {args.games} games"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
