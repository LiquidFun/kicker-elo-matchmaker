import math

import pytest

from kicker.elo import (
    K_FACTOR,
    PROVISIONAL_BONUS,
    PROVISIONAL_GAMES,
    DoublesLineup,
    PlayerRatings,
    SinglesLineup,
    TwoVsOneLineup,
    best_balanced_lineup,
    best_balanced_twovone_lineup,
    compute_delta,
    doubles_deltas,
    enumerate_doubles_lineups,
    enumerate_twovone_lineups,
    expected_score,
    k_for_games,
    preview_outcomes,
    singles_deltas,
    twovone_deltas,
)


def pr(uid: int, a=1000.0, d=1000.0, s=1000.0) -> PlayerRatings:
    return PlayerRatings(user_id=uid, attacker=a, defender=d, singles=s)


def test_expected_score_equal_is_half():
    assert expected_score(1000, 1000) == pytest.approx(0.5)


def test_expected_score_400_diff_is_91_percent():
    # Classic Elo: +400 rating ≈ 10x win probability ≈ 0.909
    assert expected_score(1400, 1000) == pytest.approx(10.0 / 11.0, abs=1e-3)


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
    keys = {
        (lu.team1_attacker, lu.team1_defender, lu.team2_attacker, lu.team2_defender)
        for lu in lineups
    }
    assert len(keys) == 12
    # Team 1 always contains the lowest id
    for lu in lineups:
        assert 1 in (lu.team1_attacker, lu.team1_defender)


def test_balance_picks_closest_to_50_50():
    # Strong/weak/strong/weak — pairing strong+weak vs strong+weak should be ~50/50.
    players = [
        pr(1, a=1200, d=1200),
        pr(2, a=800, d=800),
        pr(3, a=1200, d=1200),
        pr(4, a=800, d=800),
    ]
    best, _ = best_balanced_lineup(players)
    assert abs(best.win_prob_team1 - 0.5) < 0.05


def test_balance_unfair_lineup_when_two_strong_grouped():
    players = [
        pr(1, a=1300, d=1300),
        pr(2, a=1300, d=1300),
        pr(3, a=800, d=800),
        pr(4, a=800, d=800),
    ]
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


def test_delta_magnitude_bounded_by_k():
    # |actual - expected| ≤ 1, so |delta| ≤ K.
    for ra, rb, sa, sb in [(1000, 1000, 5, 0), (1500, 800, 5, 4), (700, 1500, 5, 1)]:
        assert abs(compute_delta(ra, rb, sa, sb)) <= K_FACTOR + 1e-9


def test_zero_zero_is_safe_and_tie_at_equal_ratings_is_zero():
    # 0-0 shouldn't happen but the formula must not divide by zero.
    assert compute_delta(1000, 1000, 0, 0) == pytest.approx(0.0)
    # 5-5 is also a tie; equal-rated players see no movement.
    assert compute_delta(1000, 1000, 5, 5) == pytest.approx(0.0)


def test_underdog_gains_when_losing_close():
    # 1900 vs 1500, underdog loses 4-5. Expected for the underdog is ~0.091,
    # actual is 4/9 ≈ 0.444 → underdog gains rating despite losing.
    delta_underdog = compute_delta(1500, 1900, 4, 5)
    assert delta_underdog > 0


def test_favorite_loses_when_barely_winning():
    # 1900 vs 1500, favorite wins 5-4. Expected 0.909, actual 5/9 ≈ 0.556 →
    # favorite drops rating because they were supposed to win by more.
    delta_favorite = compute_delta(1900, 1500, 5, 4)
    assert delta_favorite < 0


def test_k_for_games_endpoints():
    assert k_for_games(0) == pytest.approx(K_FACTOR + PROVISIONAL_BONUS)
    assert k_for_games(PROVISIONAL_GAMES) == K_FACTOR
    assert k_for_games(PROVISIONAL_GAMES * 5) == K_FACTOR
    # Linear in between.
    mid = k_for_games(PROVISIONAL_GAMES // 2)
    assert mid == pytest.approx(K_FACTOR + PROVISIONAL_BONUS / 2)


def test_rookie_singles_swing_is_larger_than_veteran():
    rookie = PlayerRatings(
        user_id=1,
        attacker=1000,
        defender=1000,
        singles=1000,
        games_attacker=0,
        games_defender=0,
        games_singles=0,
    )
    veteran = pr(2)  # defaults to established
    deltas = singles_deltas(SinglesLineup(rookie, veteran), 5, 4)
    rookie_delta = deltas[(1, "singles")]
    veteran_delta = deltas[(2, "singles")]
    # Same diff, scaled by K(0)=64 vs K(established)=32 → exactly 2x.
    assert abs(rookie_delta) == pytest.approx(2 * abs(veteran_delta))


def test_rookie_doubles_teammate_moves_more_than_veteran_teammate():
    rookie = PlayerRatings(
        user_id=1,
        attacker=1000,
        defender=1000,
        singles=1000,
        games_attacker=0,
        games_defender=0,
        games_singles=0,
    )
    vet_partner = pr(2)
    vet_a = pr(3)
    vet_b = pr(4)
    deltas = doubles_deltas(DoublesLineup(rookie, vet_partner, vet_a, vet_b), 5, 4)
    # Both team-1 players see the same diff sign; rookie's |delta| is 2x.
    assert abs(deltas[(1, "attacker")]) == pytest.approx(2 * abs(deltas[(2, "defender")]))


def test_underdog_still_loses_on_blowout():
    # 1900 vs 1500, underdog gets shut out 0-5 — actual 0 < expected 0.091.
    delta_underdog = compute_delta(1500, 1900, 0, 5)
    assert delta_underdog < 0


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


# ---------------------------------------------------------------------------
# 2v1 mode
# ---------------------------------------------------------------------------


def test_twovone_deltas_solo_gets_two_positions():
    lineup = TwoVsOneLineup(pr(1), pr(2), pr(3), penalty=50.0)
    deltas, _ = twovone_deltas(lineup, 5, 2)
    assert (3, "attacker") in deltas
    assert (3, "defender") in deltas
    # Pair gets one entry each
    assert (1, "attacker") in deltas
    assert (2, "defender") in deltas


def test_twovone_penalty_increases_when_pair_wins():
    lineup = TwoVsOneLineup(pr(1), pr(2), pr(3), penalty=50.0)
    _, penalty_delta = twovone_deltas(lineup, 5, 0)
    assert penalty_delta > 0


def test_twovone_penalty_decreases_when_solo_wins():
    lineup = TwoVsOneLineup(pr(1), pr(2), pr(3), penalty=50.0)
    _, penalty_delta = twovone_deltas(lineup, 0, 5)
    assert penalty_delta < 0


def test_twovone_solo_total_delta_comparable_to_pair_individual():
    lineup = TwoVsOneLineup(pr(1), pr(2), pr(3), penalty=0.0)
    deltas, _ = twovone_deltas(lineup, 5, 3)
    solo_total = abs(deltas[(3, "attacker")] + deltas[(3, "defender")])
    pair_individual = abs(deltas[(1, "attacker")])
    # Solo total should be roughly equal to one pair member (same K, ~same diff).
    assert solo_total == pytest.approx(pair_individual, rel=0.01)


def test_enumerate_twovone_lineups_count():
    players = [pr(1), pr(2), pr(3)]
    lineups = enumerate_twovone_lineups(players, 50.0)
    assert len(lineups) == 6  # 3 solo choices × 2 pair orderings


def test_best_balanced_twovone_lineup_is_fairest():
    players = [pr(1, a=1200, d=1100), pr(2, a=900, d=1000), pr(3, a=1050, d=1050)]
    best, alternatives = best_balanced_twovone_lineup(players, 50.0)
    for alt in alternatives:
        assert abs(best.win_prob_team1 - 0.5) <= abs(alt.win_prob_team1 - 0.5) + 1e-9


def test_twovone_preview_outcomes():
    lineup = TwoVsOneLineup(pr(1), pr(2), pr(3, a=1100, d=1100), penalty=50.0)
    win_prob, outcomes = preview_outcomes(lineup, goals_to_win=5)
    assert 0 < win_prob < 1
    assert len(outcomes) == 10
    for _, _, per_user in outcomes:
        # Solo player aggregated into one entry
        assert 3 in per_user
