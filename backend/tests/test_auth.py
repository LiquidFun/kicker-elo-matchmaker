def test_unauth_returns_401(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/users").status_code == 401


def test_login_logout_me(client, admin_user):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "adminpw123"})
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == "admin"
    assert body["role"] == "admin"
    assert body["has_password"] is True

    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == "admin"

    r = client.post("/api/auth/logout")
    assert r.status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_login_bad_password(client, admin_user):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401


def test_login_unknown_user(client):
    r = client.post("/api/auth/login", json={"username": "ghost", "password": "x"})
    assert r.status_code == 401


def test_guest_user_cannot_login(client, admin_client):
    r = admin_client.post(
        "/api/users",
        json={"username": "guest", "display_name": "Guest"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["has_password"] is False
    assert body["password_set_url"] is not None
    admin_client.post("/api/auth/logout")
    r = admin_client.post("/api/auth/login", json={"username": "guest", "password": ""})
    assert r.status_code == 401
