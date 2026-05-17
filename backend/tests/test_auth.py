def test_unauth_returns_401(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/users").status_code == 401


def test_login_logout_me(client, admin_user):
    r = client.post("/api/auth/login", json={"name": "Admin", "password": "adminpw123"})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Admin"
    assert body["role"] == "admin"
    assert body["has_password"] is True

    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["name"] == "Admin"

    r = client.post("/api/auth/logout")
    assert r.status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_login_is_case_insensitive(client, admin_user):
    r = client.post("/api/auth/login", json={"name": "admin", "password": "adminpw123"})
    assert r.status_code == 200


def test_login_bad_password(client, admin_user):
    r = client.post("/api/auth/login", json={"name": "Admin", "password": "wrong"})
    assert r.status_code == 401


def test_login_unknown_user(client):
    r = client.post("/api/auth/login", json={"name": "ghost", "password": "x"})
    assert r.status_code == 401


def test_login_rate_limited_after_repeated_failures(client, admin_user):
    from kicker.routers import auth as auth_router

    auth_router._login_failures.clear()
    for _ in range(auth_router._LOGIN_MAX_FAILURES):
        r = client.post("/api/auth/login", json={"name": "Admin", "password": "wrong"})
        assert r.status_code == 401
    r = client.post("/api/auth/login", json={"name": "Admin", "password": "wrong"})
    assert r.status_code == 429
    # Even the correct password is rejected while throttled.
    r = client.post("/api/auth/login", json={"name": "Admin", "password": "adminpw123"})
    assert r.status_code == 429
    auth_router._login_failures.clear()


def test_login_success_clears_failure_counter(client, admin_user):
    from kicker.routers import auth as auth_router

    auth_router._login_failures.clear()
    for _ in range(auth_router._LOGIN_MAX_FAILURES - 1):
        client.post("/api/auth/login", json={"name": "Admin", "password": "wrong"})
    r = client.post("/api/auth/login", json={"name": "Admin", "password": "adminpw123"})
    assert r.status_code == 200
    # Counter cleared, so a subsequent wrong attempt is 401, not 429.
    r = client.post("/api/auth/login", json={"name": "Admin", "password": "wrong"})
    assert r.status_code == 401
    auth_router._login_failures.clear()


def test_guest_user_cannot_login(client, admin_client):
    r = admin_client.post("/api/users", json={"name": "Guest"})
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["has_password"] is False
    assert body["password_set_url"] is not None
    admin_client.post("/api/auth/logout")
    r = admin_client.post("/api/auth/login", json={"name": "Guest", "password": ""})
    assert r.status_code == 401
