"""Pure Elo rating math. No DB, no I/O — fully testable.

Rating model:
- Each player has three independent ratings: attacker, defender, singles.
- Doubles team rating = (attacker's attacker-rating + defender's defender-rating) / 2.
- Singles team rating = the player's singles-rating.
- A doubles match updates only the position rating each player used; singles
  ratings are untouched, and vice versa.
- Updates are zero-sum within a match: side A's total delta equals -(side B's).
- "Actual" is goal-ratio score_a/(score_a+score_b), not binary win/loss — so a
  heavy underdog who keeps the score close still gains rating, and a favorite
  who barely scrapes a win can lose rating. This matches the legacy system's
  feel where dominant teams couldn't farm easy wins.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
from typing import Literal

K_FACTOR = 32.0
INITIAL_RATING = 1600.0
# Blend of binary win and goal-ratio. Tuned so the strongest doubles pair on
# our roster (~200 rating-point gap over the weakest) can still gain rating
# on a close 4-5 loss; pure binary would never allow that, pure goal-ratio
# would shrink balanced 5-4 deltas to ~1.8.
WIN_WEIGHT = 0.2

Position = Literal["attacker", "defender", "singles"]


def expected_score(rating_a: float, rating_b: float) -> float:
    """Probability side A beats side B under the logistic Elo model."""
    return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / 400.0))


def compute_delta(
    rating_a: float, rating_b: float, score_a: int, score_b: int, k: float = K_FACTOR
) -> float:
    """Delta applied to side A's rating. Side B gets the negation."""
    total = score_a + score_b
    ratio = 0.5 if total == 0 else score_a / total
    binary = 1.0 if score_a > score_b else 0.0 if score_a < score_b else 0.5
    actual = WIN_WEIGHT * binary + (1.0 - WIN_WEIGHT) * ratio
    expected = expected_score(rating_a, rating_b)
    return k * (actual - expected)


@dataclass(frozen=True)
class PlayerRatings:
    user_id: int
    attacker: float
    defender: float
    singles: float


@dataclass(frozen=True)
class DoublesLineup:
    team1_attacker: PlayerRatings
    team1_defender: PlayerRatings
    team2_attacker: PlayerRatings
    team2_defender: PlayerRatings

    @property
    def team1_rating(self) -> float:
        return (self.team1_attacker.attacker + self.team1_defender.defender) / 2.0

    @property
    def team2_rating(self) -> float:
        return (self.team2_attacker.attacker + self.team2_defender.defender) / 2.0

    def win_prob_team1(self) -> float:
        return expected_score(self.team1_rating, self.team2_rating)


@dataclass(frozen=True)
class SinglesLineup:
    player1: PlayerRatings
    player2: PlayerRatings

    @property
    def team1_rating(self) -> float:
        return self.player1.singles

    @property
    def team2_rating(self) -> float:
        return self.player2.singles

    def win_prob_team1(self) -> float:
        return expected_score(self.team1_rating, self.team2_rating)


def doubles_deltas(
    lineup: DoublesLineup, team1_score: int, team2_score: int
) -> dict[tuple[int, Position], float]:
    """Return {(user_id, position): delta} for a doubles match.

    The same delta applies to both members of each team — by construction
    the team's expected score is shared.
    """
    delta_team1 = compute_delta(
        lineup.team1_rating, lineup.team2_rating, team1_score, team2_score
    )
    return {
        (lineup.team1_attacker.user_id, "attacker"): delta_team1,
        (lineup.team1_defender.user_id, "defender"): delta_team1,
        (lineup.team2_attacker.user_id, "attacker"): -delta_team1,
        (lineup.team2_defender.user_id, "defender"): -delta_team1,
    }


def singles_deltas(
    lineup: SinglesLineup, p1_score: int, p2_score: int
) -> dict[tuple[int, Position], float]:
    delta = compute_delta(lineup.team1_rating, lineup.team2_rating, p1_score, p2_score)
    return {
        (lineup.player1.user_id, "singles"): delta,
        (lineup.player2.user_id, "singles"): -delta,
    }


@dataclass(frozen=True)
class Lineup:
    """A concrete 4-player assignment for the balance endpoint."""

    team1_attacker: int
    team1_defender: int
    team2_attacker: int
    team2_defender: int
    win_prob_team1: float


def enumerate_doubles_lineups(players: list[PlayerRatings]) -> list[Lineup]:
    """All distinct ways to split 4 players into 2 teams × 2 positions.

    C(4,2)/2 = 3 partitions; positions matter (attacker uses attacker-rating,
    defender uses defender-rating), so each partition has 2 × 2 = 4 ordered
    variants → 12 lineups. Team labels (1 vs 2) are factored out — we always
    assign the pair containing the lowest player id as team 1.
    """
    assert len(players) == 4
    by_id = {p.user_id: p for p in players}
    ids = sorted(by_id.keys())
    seen: set[tuple[int, int, int, int]] = set()
    out: list[Lineup] = []
    for team1 in combinations(ids, 2):
        team2 = tuple(i for i in ids if i not in team1)
        # canonicalize: team1 is the pair containing the smallest id
        if ids[0] not in team1:
            continue
        for t1a, t1d in [(team1[0], team1[1]), (team1[1], team1[0])]:
            for t2a, t2d in [(team2[0], team2[1]), (team2[1], team2[0])]:
                key = (t1a, t1d, t2a, t2d)
                if key in seen:
                    continue
                seen.add(key)
                lineup = DoublesLineup(
                    team1_attacker=by_id[t1a],
                    team1_defender=by_id[t1d],
                    team2_attacker=by_id[t2a],
                    team2_defender=by_id[t2d],
                )
                out.append(
                    Lineup(
                        team1_attacker=t1a,
                        team1_defender=t1d,
                        team2_attacker=t2a,
                        team2_defender=t2d,
                        win_prob_team1=lineup.win_prob_team1(),
                    )
                )
    return out


def best_balanced_lineup(players: list[PlayerRatings]) -> tuple[Lineup, list[Lineup]]:
    lineups = enumerate_doubles_lineups(players)
    lineups.sort(key=lambda lu: abs(lu.win_prob_team1 - 0.5))
    return lineups[0], lineups[1:]


def preview_outcomes(
    lineup: DoublesLineup | SinglesLineup,
    goals_to_win: int,
) -> tuple[float, list[tuple[int, int, dict[int, float]]]]:
    """Return (win_prob_team1, list of (t1_score, t2_score, {user_id: delta})).

    Generates the standard 'win to N, opponent had M' outcomes for M = 0..N-1
    on each side. For doubles, each player's delta is the team delta — we
    don't split by position because both teammates' position ratings move by
    the same amount.
    """
    win_prob = lineup.win_prob_team1()
    outcomes: list[tuple[int, int, dict[int, float]]] = []

    if isinstance(lineup, DoublesLineup):
        def per_user(t1: int, t2: int) -> dict[int, float]:
            ds = doubles_deltas(lineup, t1, t2)
            return {
                lineup.team1_attacker.user_id: ds[(lineup.team1_attacker.user_id, "attacker")],
                lineup.team1_defender.user_id: ds[(lineup.team1_defender.user_id, "defender")],
                lineup.team2_attacker.user_id: ds[(lineup.team2_attacker.user_id, "attacker")],
                lineup.team2_defender.user_id: ds[(lineup.team2_defender.user_id, "defender")],
            }
    else:
        def per_user(t1: int, t2: int) -> dict[int, float]:
            ds = singles_deltas(lineup, t1, t2)
            return {
                lineup.player1.user_id: ds[(lineup.player1.user_id, "singles")],
                lineup.player2.user_id: ds[(lineup.player2.user_id, "singles")],
            }

    for loser in range(goals_to_win):
        outcomes.append((goals_to_win, loser, per_user(goals_to_win, loser)))
    for loser in range(goals_to_win):
        outcomes.append((loser, goals_to_win, per_user(loser, goals_to_win)))

    return win_prob, outcomes
