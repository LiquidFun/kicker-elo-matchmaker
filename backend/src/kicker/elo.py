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
# Provisional period: a player's first PROVISIONAL_GAMES games at a position
# use a boosted K so the rating converges faster. K starts at
# K_FACTOR + PROVISIONAL_BONUS and decays linearly to K_FACTOR. Each position
# is tracked independently — a doubles veteran is still provisional at singles.
PROVISIONAL_GAMES = 10
PROVISIONAL_BONUS = 32.0

Position = Literal["attacker", "defender", "singles"]


def expected_score(rating_a: float, rating_b: float) -> float:
    """Probability side A beats side B under the logistic Elo model."""
    return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / 400.0))


def k_for_games(games: int) -> float:
    if games >= PROVISIONAL_GAMES:
        return K_FACTOR
    return K_FACTOR + PROVISIONAL_BONUS * (1.0 - games / PROVISIONAL_GAMES)


def compute_diff(rating_a: float, rating_b: float, score_a: int, score_b: int) -> float:
    """Side A's (actual − expected); multiply by K to get a rating delta."""
    total = score_a + score_b
    ratio = 0.5 if total == 0 else score_a / total
    binary = 1.0 if score_a > score_b else 0.0 if score_a < score_b else 0.5
    actual = WIN_WEIGHT * binary + (1.0 - WIN_WEIGHT) * ratio
    return actual - expected_score(rating_a, rating_b)


def compute_delta(
    rating_a: float, rating_b: float, score_a: int, score_b: int, k: float = K_FACTOR
) -> float:
    """Delta applied to side A's rating with a single uniform K."""
    return k * compute_diff(rating_a, rating_b, score_a, score_b)


@dataclass(frozen=True)
class PlayerRatings:
    user_id: int
    attacker: float
    defender: float
    singles: float
    # Default to the established threshold so existing tests that don't care
    # about the provisional path keep getting K=K_FACTOR.
    games_attacker: int = PROVISIONAL_GAMES
    games_defender: int = PROVISIONAL_GAMES
    games_singles: int = PROVISIONAL_GAMES


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

    Each player's delta is `±diff · K(games_at_position)`, so a rookie moves
    more than a veteran even when they're teammates. The sign flips between
    teams; magnitudes can differ per player.
    """
    diff = compute_diff(lineup.team1_rating, lineup.team2_rating, team1_score, team2_score)
    t1a, t1d = lineup.team1_attacker, lineup.team1_defender
    t2a, t2d = lineup.team2_attacker, lineup.team2_defender
    return {
        (t1a.user_id, "attacker"): k_for_games(t1a.games_attacker) * diff,
        (t1d.user_id, "defender"): k_for_games(t1d.games_defender) * diff,
        (t2a.user_id, "attacker"): -k_for_games(t2a.games_attacker) * diff,
        (t2d.user_id, "defender"): -k_for_games(t2d.games_defender) * diff,
    }


def singles_deltas(
    lineup: SinglesLineup, p1_score: int, p2_score: int
) -> dict[tuple[int, Position], float]:
    diff = compute_diff(lineup.team1_rating, lineup.team2_rating, p1_score, p2_score)
    p1, p2 = lineup.player1, lineup.player2
    return {
        (p1.user_id, "singles"): k_for_games(p1.games_singles) * diff,
        (p2.user_id, "singles"): -k_for_games(p2.games_singles) * diff,
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


# ---------------------------------------------------------------------------
# 2v1 mode
# ---------------------------------------------------------------------------

K_PENALTY = 8.0  # Learning rate for the 2v1 solo penalty (¼ of K_FACTOR).


@dataclass(frozen=True)
class TwoVsOneLineup:
    """Pair (team 1) vs solo player (team 2)."""

    team1_attacker: PlayerRatings
    team1_defender: PlayerRatings
    solo: PlayerRatings
    penalty: float

    @property
    def team1_rating(self) -> float:
        return (self.team1_attacker.attacker + self.team1_defender.defender) / 2.0

    @property
    def team2_effective_rating(self) -> float:
        return (self.solo.attacker + self.solo.defender) / 2.0 - self.penalty

    def win_prob_team1(self) -> float:
        return expected_score(self.team1_rating, self.team2_effective_rating)


def twovone_deltas(
    lineup: TwoVsOneLineup, team1_score: int, team2_score: int
) -> tuple[dict[tuple[int, Position], float], float]:
    """Return ({(user_id, position): delta}, penalty_delta) for a 2v1 match.

    The pair (team 1) gets standard K-weighted deltas.  The solo player's
    delta is split evenly across attacker and defender so their total change
    is comparable to one regular doubles player.

    ``penalty_delta`` should be *added* to the org's stored penalty.
    """
    diff = compute_diff(
        lineup.team1_rating, lineup.team2_effective_rating, team1_score, team2_score
    )
    t1a, t1d, solo = lineup.team1_attacker, lineup.team1_defender, lineup.solo
    deltas: dict[tuple[int, Position], float] = {
        (t1a.user_id, "attacker"): k_for_games(t1a.games_attacker) * diff,
        (t1d.user_id, "defender"): k_for_games(t1d.games_defender) * diff,
        (solo.user_id, "attacker"): -k_for_games(solo.games_attacker) * diff / 2.0,
        (solo.user_id, "defender"): -k_for_games(solo.games_defender) * diff / 2.0,
    }
    penalty_delta = K_PENALTY * diff
    return deltas, penalty_delta


@dataclass(frozen=True)
class TwoVsOneLineupSummary:
    """A concrete 3-player assignment for the 2v1 balance endpoint."""

    team1_attacker: int
    team1_defender: int
    solo: int
    win_prob_team1: float


def enumerate_twovone_lineups(
    players: list[PlayerRatings], penalty: float
) -> list[TwoVsOneLineupSummary]:
    """All ways to split 3 players into a pair (with positions) and a solo.

    3 solo choices × 2 pair orderings = 6 lineups.
    """
    assert len(players) == 3
    out: list[TwoVsOneLineupSummary] = []
    for solo in players:
        pair = [p for p in players if p.user_id != solo.user_id]
        for t1a, t1d in [(pair[0], pair[1]), (pair[1], pair[0])]:
            lineup = TwoVsOneLineup(
                team1_attacker=t1a,
                team1_defender=t1d,
                solo=solo,
                penalty=penalty,
            )
            out.append(
                TwoVsOneLineupSummary(
                    team1_attacker=t1a.user_id,
                    team1_defender=t1d.user_id,
                    solo=solo.user_id,
                    win_prob_team1=lineup.win_prob_team1(),
                )
            )
    return out


def best_balanced_twovone_lineup(
    players: list[PlayerRatings], penalty: float
) -> tuple[TwoVsOneLineupSummary, list[TwoVsOneLineupSummary]]:
    lineups = enumerate_twovone_lineups(players, penalty)
    lineups.sort(key=lambda lu: abs(lu.win_prob_team1 - 0.5))
    return lineups[0], lineups[1:]


# ---------------------------------------------------------------------------
# Preview (all modes)
# ---------------------------------------------------------------------------


def preview_outcomes(
    lineup: DoublesLineup | SinglesLineup | TwoVsOneLineup,
    goals_to_win: int,
) -> tuple[float, list[tuple[int, int, dict[int, float]]]]:
    """Return (win_prob_team1, list of (t1_score, t2_score, {user_id: delta})).

    Generates the standard 'win to N, opponent had M' outcomes for M = 0..N-1
    on each side. Each player's delta is scaled by their own K (provisional
    players see larger swings), so teammates' values may differ.
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

    elif isinstance(lineup, TwoVsOneLineup):

        def per_user(t1: int, t2: int) -> dict[int, float]:
            ds, _ = twovone_deltas(lineup, t1, t2)
            result: dict[int, float] = {}
            for (uid, _pos), delta in ds.items():
                result[uid] = result.get(uid, 0.0) + delta
            return result

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
