import pytest


def _create_user(client, username: str) -> int:
    r = client.post(
        "/api/users",
        json={"username": username, "display_name": username.title(), "password": "pw12345678"},
    )
    return r.json()["user"]["id"]


@pytest.fixture
def players(admin_client) -> list[int]:
    return [_create_user(admin_client, n) for n in ["alice", "bob", "carol", "dave"]]


def _doubles(admin_client, players, t1, t2):
    a, b, c, d = players
    return admin_client.post(
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
    ).json()


def test_leaderboard_only_returns_active_players(admin_client, players):
    r = admin_client.get("/api/stats/leaderboard?mode=attacker")
    assert r.status_code == 200
    assert r.json() == []  # no games played yet
    _doubles(admin_client, players, 5, 2)
    r = admin_client.get("/api/stats/leaderboard?mode=attacker")
    body = r.json()
    assert len(body) == 2  # two players played as attacker
    assert body[0]["rating_attacker"] > body[1]["rating_attacker"]


def test_user_stats_history_and_totals(admin_client, players):
    a, b, c, d = players
    _doubles(admin_client, players, 5, 2)
    _doubles(admin_client, players, 5, 0)

    r = admin_client.get(f"/api/stats/users/{a}")
    assert r.status_code == 200
    body = r.json()
    assert len(body["history"]["attacker"]) == 2
    assert body["history"]["defender"] == []
    assert body["totals"]["attacker"]["wins"] == 2
    assert body["totals"]["attacker"]["losses"] == 0

    r = admin_client.get(f"/api/stats/users/{c}")
    assert r.json()["totals"]["attacker"]["losses"] == 2


def test_global_stats(admin_client, players):
    _doubles(admin_client, players, 5, 3)
    r = admin_client.get("/api/stats/global")
    body = r.json()
    assert body["total_matches"] == 1
    assert body["doubles_matches"] == 1
    assert body["singles_matches"] == 0
    assert body["active_players"] == 4
