import pytest


def _create_user(client, name: str, password: str = "pw12345678") -> int:
    r = client.post(
        "/api/users",
        json={"name": name.title(), "password": password},
    )
    assert r.status_code == 201, r.text
    return r.json()["user"]["id"]


@pytest.fixture
def four_players(admin_client) -> list[int]:
    return [_create_user(admin_client, n) for n in ["alice", "bob", "carol", "dave"]]


@pytest.fixture
def two_players(admin_client) -> list[int]:
    return [_create_user(admin_client, n) for n in ["eve", "frank"]]


def test_doubles_match_updates_ratings_and_is_zero_sum(admin_client, four_players):
    a, b, c, d = four_players
    r = admin_client.post(
        "/api/matches",
        json={
            "mode": "doubles",
            "goals_to_win": 5,
            "team1_score": 5,
            "team2_score": 2,
            "players": [
                {"user_id": a, "team": 1, "position": "attacker"},
                {"user_id": b, "team": 1, "position": "defender"},
                {"user_id": c, "team": 2, "position": "attacker"},
                {"user_id": d, "team": 2, "position": "defender"},
            ],
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["winner_team"] == 1
    deltas = [p["rating_delta"] for p in body["players"]]
    assert sum(deltas) == pytest.approx(0.0)

    users = {u["id"]: u for u in admin_client.get("/api/users").json()}
    assert users[a]["rating_attacker"] > 1600
    assert users[a]["rating_defender"] == 1600  # untouched
    assert users[a]["rating_singles"] == 1600  # untouched
    assert users[b]["rating_defender"] > 1600
    assert users[c]["rating_attacker"] < 1600
    assert users[d]["rating_defender"] < 1600
    assert users[a]["games_attacker"] == 1
    assert users[a]["games_defender"] == 0


def test_singles_match_only_touches_singles(admin_client, two_players):
    e, f = two_players
    r = admin_client.post(
        "/api/matches",
        json={
            "mode": "singles",
            "goals_to_win": 5,
            "team1_score": 5,
            "team2_score": 0,
            "players": [
                {"user_id": e, "team": 1, "position": "singles"},
                {"user_id": f, "team": 2, "position": "singles"},
            ],
        },
    )
    assert r.status_code == 201, r.text
    users = {u["id"]: u for u in admin_client.get("/api/users").json()}
    assert users[e]["rating_singles"] > 1600
    assert users[f]["rating_singles"] < 1600
    assert users[e]["rating_attacker"] == 1600
    assert users[e]["rating_defender"] == 1600


def test_score_must_match_goals_to_win(admin_client, two_players):
    e, f = two_players
    r = admin_client.post(
        "/api/matches",
        json={
            "mode": "singles",
            "goals_to_win": 5,
            "team1_score": 4,
            "team2_score": 3,
            "players": [
                {"user_id": e, "team": 1, "position": "singles"},
                {"user_id": f, "team": 2, "position": "singles"},
            ],
        },
    )
    assert r.status_code == 400


def test_no_ties(admin_client, two_players):
    e, f = two_players
    r = admin_client.post(
        "/api/matches",
        json={
            "mode": "singles",
            "goals_to_win": 5,
            "team1_score": 5,
            "team2_score": 5,
            "players": [
                {"user_id": e, "team": 1, "position": "singles"},
                {"user_id": f, "team": 2, "position": "singles"},
            ],
        },
    )
    assert r.status_code == 400


def test_doubles_requires_one_attacker_one_defender_per_team(admin_client, four_players):
    a, b, c, d = four_players
    r = admin_client.post(
        "/api/matches",
        json={
            "mode": "doubles",
            "goals_to_win": 5,
            "team1_score": 5,
            "team2_score": 1,
            "players": [
                {"user_id": a, "team": 1, "position": "attacker"},
                {"user_id": b, "team": 1, "position": "attacker"},  # bad
                {"user_id": c, "team": 2, "position": "attacker"},
                {"user_id": d, "team": 2, "position": "defender"},
            ],
        },
    )
    assert r.status_code == 400


def test_balance_returns_six_lineups(admin_client, four_players):
    r = admin_client.post("/api/balance", json={"player_ids": four_players})
    assert r.status_code == 200
    body = r.json()
    assert "best" in body
    # 12 total - 1 best = 11 alternatives
    assert len(body["alternatives"]) == 11
    # All win probs are between 0 and 1
    for lu in [body["best"], *body["alternatives"]]:
        assert 0.0 < lu["win_prob_team1"] < 1.0
    # Best is closest to 50/50
    assert abs(body["best"]["win_prob_team1"] - 0.5) <= min(
        abs(lu["win_prob_team1"] - 0.5) for lu in body["alternatives"]
    )


def test_preview_returns_outcomes_for_doubles(admin_client, four_players):
    a, b, c, d = four_players
    r = admin_client.post(
        "/api/preview",
        json={
            "mode": "doubles",
            "goals_to_win": 5,
            "players": [
                {"user_id": a, "team": 1, "position": "attacker"},
                {"user_id": b, "team": 1, "position": "defender"},
                {"user_id": c, "team": 2, "position": "attacker"},
                {"user_id": d, "team": 2, "position": "defender"},
            ],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["win_prob_team1"] == pytest.approx(0.5)
    assert len(body["outcomes"]) == 10  # 5 win-cases × 2 sides
    for o in body["outcomes"]:
        deltas = list(o["deltas"].values())
        assert sum(deltas) == pytest.approx(0.0, abs=1e-9)


def test_match_delete_reverts_ratings(admin_client, four_players):
    a, b, c, d = four_players
    r = admin_client.post(
        "/api/matches",
        json={
            "mode": "doubles",
            "goals_to_win": 5,
            "team1_score": 5,
            "team2_score": 0,
            "players": [
                {"user_id": a, "team": 1, "position": "attacker"},
                {"user_id": b, "team": 1, "position": "defender"},
                {"user_id": c, "team": 2, "position": "attacker"},
                {"user_id": d, "team": 2, "position": "defender"},
            ],
        },
    )
    match_id = r.json()["id"]
    r = admin_client.delete(f"/api/matches/{match_id}")
    assert r.status_code == 204
    users = {u["id"]: u for u in admin_client.get("/api/users").json()}
    for uid in four_players:
        assert users[uid]["rating_attacker"] == 1600
        assert users[uid]["rating_defender"] == 1600
        assert users[uid]["games_attacker"] == 0
        assert users[uid]["games_defender"] == 0


def test_only_latest_match_deletable(admin_client, four_players):
    a, b, c, d = four_players
    for _ in range(2):
        admin_client.post(
            "/api/matches",
            json={
                "mode": "doubles",
                "goals_to_win": 5,
                "team1_score": 5,
                "team2_score": 0,
                "players": [
                    {"user_id": a, "team": 1, "position": "attacker"},
                    {"user_id": b, "team": 1, "position": "defender"},
                    {"user_id": c, "team": 2, "position": "attacker"},
                    {"user_id": d, "team": 2, "position": "defender"},
                ],
            },
        )
    matches = admin_client.get("/api/matches").json()["items"]
    oldest = matches[-1]["id"]
    r = admin_client.delete(f"/api/matches/{oldest}")
    assert r.status_code == 400


def test_settings_get_default_and_update(admin_client):
    r = admin_client.get("/api/settings")
    assert r.status_code == 200
    assert r.json()["default_goals_to_win"] == 5
    r = admin_client.put("/api/settings", json={"default_goals_to_win": 7})
    assert r.status_code == 200
    assert r.json()["default_goals_to_win"] == 7
    r = admin_client.get("/api/settings")
    assert r.json()["default_goals_to_win"] == 7


def test_non_admin_cannot_change_settings(client, admin_client):
    admin_client.post(
        "/api/users", json={"name": "Regular", "password": "regpw12345"}
    )
    admin_client.post("/api/auth/logout")
    admin_client.post("/api/auth/login", json={"name": "Regular", "password": "regpw12345"})
    r = admin_client.put("/api/settings", json={"default_goals_to_win": 9})
    assert r.status_code == 403


def _doubles(client, players, t1=5, t2=0):
    a, b, c, d = players
    return client.post(
        "/api/matches",
        json={
            "mode": "doubles",
            "goals_to_win": 5,
            "team1_score": t1,
            "team2_score": t2,
            "players": [
                {"user_id": a, "team": 1, "position": "attacker"},
                {"user_id": b, "team": 1, "position": "defender"},
                {"user_id": c, "team": 2, "position": "attacker"},
                {"user_id": d, "team": 2, "position": "defender"},
            ],
        },
    )


def _singles(client, players, t1=5, t2=0):
    e, f = players
    return client.post(
        "/api/matches",
        json={
            "mode": "singles",
            "goals_to_win": 5,
            "team1_score": t1,
            "team2_score": t2,
            "players": [
                {"user_id": e, "team": 1, "position": "singles"},
                {"user_id": f, "team": 2, "position": "singles"},
            ],
        },
    )


def test_list_matches_returns_items_and_total(admin_client, four_players, two_players):
    _doubles(admin_client, four_players)
    _doubles(admin_client, four_players)
    _singles(admin_client, two_players)
    body = admin_client.get("/api/matches").json()
    assert body["total"] == 3
    assert len(body["items"]) == 3
    # Newest first
    assert body["items"][0]["mode"] == "singles"


def test_list_matches_mode_filter(admin_client, four_players, two_players):
    _doubles(admin_client, four_players)
    _singles(admin_client, two_players)
    _doubles(admin_client, four_players)
    doubles = admin_client.get("/api/matches?mode=doubles").json()
    singles = admin_client.get("/api/matches?mode=singles").json()
    assert doubles["total"] == 2 and all(m["mode"] == "doubles" for m in doubles["items"])
    assert singles["total"] == 1 and all(m["mode"] == "singles" for m in singles["items"])


def test_list_matches_offset_paginates(admin_client, four_players):
    for _ in range(5):
        _doubles(admin_client, four_players)
    first = admin_client.get("/api/matches?limit=2&offset=0").json()
    second = admin_client.get("/api/matches?limit=2&offset=2").json()
    assert first["total"] == 5 and second["total"] == 5
    assert len(first["items"]) == 2 and len(second["items"]) == 2
    first_ids = {m["id"] for m in first["items"]}
    second_ids = {m["id"] for m in second["items"]}
    assert first_ids.isdisjoint(second_ids)


def test_non_admin_cannot_exceed_limit_cap(client, admin_client):
    admin_client.post("/api/users", json={"name": "Regular", "password": "regpw12345"})
    admin_client.post("/api/auth/logout")
    admin_client.post("/api/auth/login", json={"name": "Regular", "password": "regpw12345"})
    assert admin_client.get("/api/matches?limit=500").status_code == 200
    assert admin_client.get("/api/matches?limit=501").status_code == 403


def test_admin_can_exceed_limit_cap(admin_client):
    r = admin_client.get("/api/matches?limit=10000")
    assert r.status_code == 200
