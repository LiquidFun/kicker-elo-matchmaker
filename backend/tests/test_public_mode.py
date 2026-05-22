"""Public-mode behavior: anon can read + create matches; admin-only stays locked."""

import pytest

from kicker.config import get_settings


@pytest.fixture
def public_client(client):
    settings = get_settings()
    settings.public_mode = True
    try:
        yield client
    finally:
        settings.public_mode = False


@pytest.fixture
def two_users(session_factory):
    from kicker.models import User

    with session_factory() as s:
        users = [User(name="Alice"), User(name="Bob"), User(name="Carol"), User(name="Dan")]
        s.add_all(users)
        s.commit()
        return [u.id for u in users]


def test_config_endpoint_reflects_mode(public_client):
    assert public_client.get("/api/config").json() == {"public_mode": True}


def test_config_endpoint_works_without_auth(client):
    # Even outside public mode, /api/config itself is unauthenticated.
    assert client.get("/api/config").status_code == 200


def test_anon_can_list_users_in_public_mode(public_client, two_users):
    r = public_client.get("/api/users")
    assert r.status_code == 200
    assert len(r.json()) == 4


def test_anon_can_create_match_in_public_mode(public_client, two_users):
    a, b, c, d = two_users
    r = public_client.post(
        "/api/matches",
        json={
            "mode": "doubles",
            "goals_to_win": 5,
            "team1_score": 5,
            "team2_score": 3,
            "players": [
                {"user_id": a, "team": 1, "position": "attacker"},
                {"user_id": b, "team": 1, "position": "defender"},
                {"user_id": c, "team": 2, "position": "attacker"},
                {"user_id": d, "team": 2, "position": "defender"},
            ],
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["created_by_user_id"] is None


def test_anon_cannot_create_user(public_client):
    # User management still requires admin even in public mode.
    r = public_client.post("/api/users", json={"name": "Hacker"})
    assert r.status_code == 401


def test_anon_cannot_delete_match(public_client, two_users):
    a, b, c, d = two_users
    r = public_client.post(
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
    assert public_client.delete(f"/api/matches/{match_id}").status_code == 401


def test_anon_can_read_stats(public_client):
    assert public_client.get("/api/stats/global").status_code == 200
    assert public_client.get("/api/stats/leaderboard?mode=attacker").status_code == 200


def test_public_mode_off_still_requires_auth(client):
    # Sanity: with public_mode=False the existing behavior is unchanged.
    assert client.get("/api/users").status_code == 401
    assert client.post("/api/matches", json={}).status_code == 401
