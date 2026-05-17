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


def test_non_admin_cannot_change_own_name(client, admin_client):
    r = admin_client.post("/api/users", json={"name": "Renamer", "password": "pw12345678"})
    uid = r.json()["user"]["id"]
    admin_client.post("/api/auth/logout")
    admin_client.post("/api/auth/login", json={"name": "Renamer", "password": "pw12345678"})
    r = admin_client.patch(f"/api/users/{uid}", json={"name": "Hacked"})
    assert r.status_code == 403


def test_self_password_change_requires_current(client, admin_client):
    r = admin_client.post("/api/users", json={"name": "Pwch", "password": "oldpw12345"})
    uid = r.json()["user"]["id"]
    admin_client.post("/api/auth/logout")
    admin_client.post("/api/auth/login", json={"name": "Pwch", "password": "oldpw12345"})

    # missing current_password
    r = admin_client.post(f"/api/users/{uid}/password", json={"new_password": "newpw12345"})
    assert r.status_code == 401

    # wrong current_password
    r = admin_client.post(
        f"/api/users/{uid}/password",
        json={"current_password": "wrong", "new_password": "newpw12345"},
    )
    assert r.status_code == 401

    # correct current_password
    r = admin_client.post(
        f"/api/users/{uid}/password",
        json={"current_password": "oldpw12345", "new_password": "newpw12345"},
    )
    assert r.status_code == 200

    # can now log in with new password
    admin_client.post("/api/auth/logout")
    r = admin_client.post("/api/auth/login", json={"name": "Pwch", "password": "newpw12345"})
    assert r.status_code == 200


def test_admin_can_set_password_without_current(admin_client):
    r = admin_client.post("/api/users", json={"name": "Forced", "password": "oldpw12345"})
    uid = r.json()["user"]["id"]
    r = admin_client.post(
        f"/api/users/{uid}/password", json={"new_password": "freshpw12345"}
    )
    assert r.status_code == 200


_PNG_1X1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xfc\xff\xff?\x00\x05\xfe\x02\xfe\xa3\xb6\xe5\xc7"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


def test_self_avatar_upload(client, admin_client):
    r = admin_client.post("/api/users", json={"name": "Pic", "password": "pw12345678"})
    uid = r.json()["user"]["id"]
    admin_client.post("/api/auth/logout")
    admin_client.post("/api/auth/login", json={"name": "Pic", "password": "pw12345678"})

    r = admin_client.post(
        f"/api/users/{uid}/avatar",
        files={"file": ("a.png", _PNG_1X1, "image/png")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["avatar_url"].startswith("/api/avatars/")
    assert body["avatar_url"].endswith(".png")


def test_non_admin_cannot_upload_other_avatar(client, admin_client):
    r = admin_client.post("/api/users", json={"name": "U1", "password": "pw12345678"})
    other = admin_client.post("/api/users", json={"name": "U2", "password": "pw12345678"})
    other_id = other.json()["user"]["id"]
    admin_client.post("/api/auth/logout")
    admin_client.post("/api/auth/login", json={"name": "U1", "password": "pw12345678"})
    r = admin_client.post(
        f"/api/users/{other_id}/avatar",
        files={"file": ("a.png", _PNG_1X1, "image/png")},
    )
    assert r.status_code == 403


def test_avatar_rejects_non_image(client, admin_client, admin_user):
    r = admin_client.post(
        f"/api/users/{admin_user.id}/avatar",
        files={"file": ("evil.txt", b"hello", "text/plain")},
    )
    assert r.status_code == 415


def test_avatar_remove_clears_field_and_deletes_file(admin_client, admin_user):
    import os

    from kicker.config import get_settings

    r = admin_client.post(
        f"/api/users/{admin_user.id}/avatar",
        files={"file": ("a.png", _PNG_1X1, "image/png")},
    )
    url = r.json()["avatar_url"]
    filename = url.rsplit("/", 1)[-1]
    path = os.path.join(get_settings().storage_dir, "avatars", filename)
    assert os.path.exists(path)

    r = admin_client.patch(f"/api/users/{admin_user.id}", json={"avatar_url": None})
    assert r.status_code == 200
    assert r.json()["avatar_url"] is None
    assert not os.path.exists(path)


def test_avatar_reupload_deletes_previous(admin_client, admin_user):
    import os

    from kicker.config import get_settings

    r = admin_client.post(
        f"/api/users/{admin_user.id}/avatar",
        files={"file": ("a.png", _PNG_1X1, "image/png")},
    )
    old_file = r.json()["avatar_url"].rsplit("/", 1)[-1]
    old_path = os.path.join(get_settings().storage_dir, "avatars", old_file)
    assert os.path.exists(old_path)

    r = admin_client.post(
        f"/api/users/{admin_user.id}/avatar",
        files={"file": ("b.png", _PNG_1X1, "image/png")},
    )
    new_file = r.json()["avatar_url"].rsplit("/", 1)[-1]
    assert new_file != old_file
    assert not os.path.exists(old_path)
    assert os.path.exists(os.path.join(get_settings().storage_dir, "avatars", new_file))
