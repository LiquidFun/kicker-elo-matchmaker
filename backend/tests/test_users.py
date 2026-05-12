from urllib.parse import parse_qs, urlparse


def test_non_admin_cannot_create_user(client, admin_client):
    admin_client.post(
        "/api/users",
        json={
            "username": "alice",
            "display_name": "Alice",
            "password": "alicepw12345",
        },
    )
    admin_client.post("/api/auth/logout")
    admin_client.post("/api/auth/login", json={"username": "alice", "password": "alicepw12345"})
    r = admin_client.post(
        "/api/users", json={"username": "bob", "display_name": "Bob", "password": "bobpw1234"}
    )
    assert r.status_code == 403


def test_create_user_with_password_no_link(admin_client):
    r = admin_client.post(
        "/api/users",
        json={"username": "alice", "display_name": "Alice", "password": "alicepw12345"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["password_set_url"] is None
    assert body["user"]["has_password"] is True


def test_password_set_link_flow(client, admin_client):
    r = admin_client.post(
        "/api/users", json={"username": "guest", "display_name": "Guest"}
    )
    set_url = r.json()["password_set_url"]
    token = parse_qs(urlparse(set_url).query)["token"][0]

    # Anonymous client (no cookie) can set password
    anon = client
    anon.post("/api/auth/logout")  # ensure no session
    r = anon.post("/api/password/set", json={"token": token, "new_password": "newguestpw"})
    assert r.status_code == 200

    # Now can log in
    r = anon.post("/api/auth/login", json={"username": "guest", "password": "newguestpw"})
    assert r.status_code == 200

    # Token cannot be reused
    r = anon.post("/api/password/set", json={"token": token, "new_password": "anotherpw"})
    assert r.status_code == 400


def test_duplicate_username_rejected(admin_client):
    admin_client.post(
        "/api/users", json={"username": "x", "display_name": "X", "password": "xpw12345"}
    )
    r = admin_client.post(
        "/api/users", json={"username": "x", "display_name": "X2", "password": "xpw12345"}
    )
    assert r.status_code == 409


def test_admin_cannot_delete_self(admin_client, admin_user):
    r = admin_client.delete(f"/api/users/{admin_user.id}")
    assert r.status_code == 400


def test_admin_can_delete_other(admin_client):
    r = admin_client.post(
        "/api/users", json={"username": "doomed", "display_name": "Doomed", "password": "dpw12345"}
    )
    uid = r.json()["user"]["id"]
    r = admin_client.delete(f"/api/users/{uid}")
    assert r.status_code == 204
    # No longer listed
    r = admin_client.get("/api/users")
    assert all(u["id"] != uid for u in r.json())


def test_reset_password_link(admin_client):
    r = admin_client.post(
        "/api/users", json={"username": "rp", "display_name": "RP", "password": "rppw12345"}
    )
    uid = r.json()["user"]["id"]
    r = admin_client.post(f"/api/users/{uid}/password-link")
    assert r.status_code == 200
    assert "password_set_url" in r.json()
