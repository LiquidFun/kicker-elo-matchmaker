import math

import pytest

from kicker.elo import (
    DoublesLineup,
    K_FACTOR,
    PlayerRatings,
    SinglesLineup,
    best_balanced_lineup,
    compute_delta,
    doubles_deltas,
    enumerate_doubles_lineups,
    expected_score,
    mov_multiplier,
    preview_outcomes,
    singles_deltas,
)


def pr(uid: int, a=1000.0, d=1000.0, s=1000.0) -> PlayerRatings:
    return PlayerRatings(user_id=uid, attacker=a, defender=d, singles=s)


def test_expected_score_equal_is_half():
    assert expected_score(1000, 1000) == pytest.approx(0.5)


def test_expected_score_400_diff_is_91_percent():
    # Classic Elo: +400 rating ≈ 10x win probability ≈ 0.909
    assert expected_score(1400, 1000) == pytest.approx(10.0 / 11.0, abs=1e-3)


def test_mov_multiplier_monotonic_in_goal_diff():
    vals = [mov_multiplier(d, 0) for d in range(1, 10)]
    assert vals == sorted(vals)


def test_mov_multiplier_damps_favored_blowouts():
    # Winning 5-0 as a heavy favorite should yield smaller mov than as the underdog.
    fav = mov_multiplier(5, 400)   # favorite won by 5
    upset = mov_multiplier(5, -400)  # underdog won by 5
    assert upset > fav


def test_compute_delta_zero_sum_doubles():
    delta = compute_delta(1000, 1000, 5, 3)
    # equal ratings, win → positive delta for winner
    assert delta > 0
    # and the opponent loses the same magnitude
    opp = compute_delta(1000, 1000, 3, 5)
    assert delta == pytest.approx(-opp)


def test_compute_delta_upset_bigger_than_expected_win():
    expected_win = compute_delta(1200, 1000, 5, 3)
    upset = compute_delta(1000, 1200, 5, 3)
    assert upset > expected_win


def test_doubles_deltas_zero_sum():
    lineup = DoublesLineup(pr(1), pr(2, d=1100), pr(3), pr(4, d=900))
    deltas = doubles_deltas(lineup, 5, 2)
    assert sum(deltas.values()) == pytest.approx(0.0)


def test_singles_deltas_zero_sum():
    lineup = SinglesLineup(pr(1, s=1050), pr(2, s=950))
    deltas = singles_deltas(lineup, 5, 3)
    assert sum(deltas.values()) == pytest.approx(0.0)


def test_doubles_only_touches_position_used():
    """Updating attacker/defender ratings must not implicitly include singles."""
    lineup = DoublesLineup(pr(1), pr(2), pr(3), pr(4))
    deltas = doubles_deltas(lineup, 5, 0)
    keys = set(deltas.keys())
    assert keys == {(1, "attacker"), (2, "defender"), (3, "attacker"), (4, "defender")}


def test_enumerate_lineups_count_is_twelve():
    players = [pr(1), pr(2), pr(3), pr(4)]
    lineups = enumerate_doubles_lineups(players)
    # 3 team partitions × 2 t1 orderings × 2 t2 orderings = 12
    assert len(lineups) == 12
    keys = {(lu.team1_attacker, lu.team1_defender, lu.team2_attacker, lu.team2_defender) for lu in lineups}
    assert len(keys) == 12
    # Team 1 always contains the lowest id
    for lu in lineups:
        assert 1 in (lu.team1_attacker, lu.team1_defender)


def test_balance_picks_closest_to_50_50():
    # Strong/weak/strong/weak — pairing strong+weak vs strong+weak should be ~50/50.
    players = [pr(1, a=1200, d=1200), pr(2, a=800, d=800), pr(3, a=1200, d=1200), pr(4, a=800, d=800)]
    best, _ = best_balanced_lineup(players)
    assert abs(best.win_prob_team1 - 0.5) < 0.05


def test_balance_unfair_lineup_when_two_strong_grouped():
    players = [pr(1, a=1300, d=1300), pr(2, a=1300, d=1300), pr(3, a=800, d=800), pr(4, a=800, d=800)]
    best, alternatives = best_balanced_lineup(players)
    # 1+2 vs 3+4 is unavoidable — there's no balanced split here.
    # Best lineup will still be the least lopsided.
    worst = max(alternatives, key=lambda lu: abs(lu.win_prob_team1 - 0.5))
    assert abs(worst.win_prob_team1 - 0.5) > abs(best.win_prob_team1 - 0.5)


def test_preview_outcomes_count_and_zero_sum():
    lineup = DoublesLineup(pr(1), pr(2), pr(3, a=1100), pr(4, d=1100))
    win_prob, outcomes = preview_outcomes(lineup, goals_to_win=5)
    assert 0 < win_prob < 1
    # 5 win-cases per side = 10 outcomes
    assert len(outcomes) == 10
    for _, _, per_user in outcomes:
        assert sum(per_user.values()) == pytest.approx(0.0)


def test_preview_singles_only_two_players():
    lineup = SinglesLineup(pr(1, s=1050), pr(2, s=950))
    _, outcomes = preview_outcomes(lineup, goals_to_win=3)
    assert len(outcomes) == 6  # 3 win-cases × 2 sides
    for _, _, per_user in outcomes:
        assert set(per_user.keys()) == {1, 2}


def test_delta_magnitude_bounded_by_k_times_mov():
    # Sanity: |delta| ≤ K * mov_multiplier (since |actual - expected| ≤ 1)
    for ra, rb, sa, sb in [(1000, 1000, 5, 0), (1500, 800, 5, 4), (700, 1500, 5, 1)]:
        d = compute_delta(ra, rb, sa, sb)
        winner_diff = (ra - rb) if sa > sb else (rb - ra)
        mov = mov_multiplier(abs(sa - sb), winner_diff)
        assert abs(d) <= K_FACTOR * mov + 1e-9


def test_mov_zero_goal_diff_returns_one():
    # Tie defense — shouldn't occur in this app but the formula should be safe.
    assert mov_multiplier(0, 0) == 1.0
    # Tie delta is exactly zero at equal ratings.
    assert compute_delta(1000, 1000, 5, 5) == pytest.approx(0.0)


def test_realistic_rating_progression():
    # Equal-rated player A beats player B 5-0. After ten such results in a row,
    # A should have gained noticeably but with diminishing returns as the gap grows.
    ra, rb = 1000.0, 1000.0
    last_delta = math.inf
    for _ in range(10):
        d = compute_delta(ra, rb, 5, 0)
        assert d < last_delta or abs(d - last_delta) < 1e-6  # non-increasing
        last_delta = d
        ra += d
        rb -= d
    assert ra > 1000 and rb < 1000
    assert ra + rb == pytest.approx(2000.0)  # exact zero-sum preserved
