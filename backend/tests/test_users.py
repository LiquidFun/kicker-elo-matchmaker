from urllib.parse import parse_qs, urlparse


def test_non_admin_cannot_create_user(client, admin_client):
    admin_client.post(
        "/api/users",
        json={"name": "Alice", "password": "alicepw12345"},
    )
    admin_client.post("/api/auth/logout")
    admin_client.post("/api/auth/login", json={"name": "Alice", "password": "alicepw12345"})
    r = admin_client.post(
        "/api/users", json={"name": "Bob", "password": "bobpw1234"}
    )
    assert r.status_code == 403


def test_create_user_with_password_no_link(admin_client):
    r = admin_client.post(
        "/api/users",
        json={"name": "Alice", "password": "alicepw12345"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["password_set_url"] is None
    assert body["user"]["has_password"] is True


def test_password_set_link_flow(client, admin_client):
    r = admin_client.post("/api/users", json={"name": "Guest"})
    set_url = r.json()["password_set_url"]
    token = parse_qs(urlparse(set_url).query)["token"][0]

    anon = client
    anon.post("/api/auth/logout")
    r = anon.post("/api/password/set", json={"token": token, "new_password": "newguestpw"})
    assert r.status_code == 200

    r = anon.post("/api/auth/login", json={"name": "Guest", "password": "newguestpw"})
    assert r.status_code == 200

    r = anon.post("/api/password/set", json={"token": token, "new_password": "anotherpw"})
    assert r.status_code == 400


def test_duplicate_name_rejected(admin_client):
    admin_client.post("/api/users", json={"name": "X", "password": "xpw12345"})
    r = admin_client.post("/api/users", json={"name": "X", "password": "xpw12345"})
    assert r.status_code == 409


def test_duplicate_name_case_insensitive(admin_client):
    admin_client.post("/api/users", json={"name": "Casey", "password": "xpw12345"})
    r = admin_client.post("/api/users", json={"name": "casey", "password": "xpw12345"})
    assert r.status_code == 409


def test_admin_cannot_delete_self(admin_client, admin_user):
    r = admin_client.delete(f"/api/users/{admin_user.id}")
    assert r.status_code == 400


def test_admin_can_delete_other(admin_client):
    r = admin_client.post(
        "/api/users", json={"name": "Doomed", "password": "dpw12345"}
    )
    uid = r.json()["user"]["id"]
    r = admin_client.delete(f"/api/users/{uid}")
    assert r.status_code == 204
    r = admin_client.get("/api/users")
    assert all(u["id"] != uid for u in r.json())


def test_reset_password_link(admin_client):
    r = admin_client.post(
        "/api/users", json={"name": "RP", "password": "rppw12345"}
    )
    uid = r.json()["user"]["id"]
    r = admin_client.post(f"/api/users/{uid}/password-link")
    assert r.status_code == 200
    assert "password_set_url" in r.json()


def test_admin_can_change_role(admin_client):
    r = admin_client.post(
        "/api/users", json={"name": "Promo", "password": "pw12345678"}
    )
    uid = r.json()["user"]["id"]
    r = admin_client.patch(f"/api/users/{uid}", json={"role": "admin"})
    assert r.status_code == 200
    assert r.json()["role"] == "admin"
