from conftest import TestSession
from models import UnitProgress

ZEROS = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}


def put(client, auth, c, n, **extra):
    return client.put("/unit-progress", json={"target": c, "done_count": n, **extra}, headers=auth)


def test_requires_auth(client):
    assert client.get("/unit-progress").status_code == 401
    assert client.put("/unit-progress", json={"target": 1, "done_count": 1}).status_code == 401


def test_default_is_zeros(client, auth):
    assert client.get("/unit-progress", headers=auth).json() == {"level": 1, "targets": ZEROS}


def test_upsert_is_idempotent_and_updates(client, auth):
    put(client, auth, 1, 4)
    assert put(client, auth, 2, 3).json() == {"level": 1, "target": 2, "done_count": 3}
    put(client, auth, 2, 3)
    put(client, auth, 2, 4)
    assert client.get("/unit-progress", headers=auth).json()["targets"] == {**ZEROS, "1": 4, "2": 4}
    with TestSession() as s:
        assert s.query(UnitProgress).count() == 2


def test_reset_is_put_zero(client, auth):
    put(client, auth, 1, 3)
    put(client, auth, 1, 0)
    assert client.get("/unit-progress", headers=auth).json()["targets"] == ZEROS


def test_bounds_level_and_target_rejected(client, auth):
    assert put(client, auth, 1, 5).status_code == 422
    assert put(client, auth, 1, -1).status_code == 422
    assert put(client, auth, 0, 1).status_code == 422
    assert put(client, auth, 6, 1).status_code == 422
    assert put(client, auth, 1, 2, level=2).status_code == 422
    assert client.get("/unit-progress", headers=auth).json()["targets"] == ZEROS


def test_users_are_isolated(client, auth):
    put(client, auth, 1, 4); put(client, auth, 2, 4); put(client, auth, 3, 2)
    client.post("/register", json={"username": "other", "email": "o@example.com", "password": "pw"})
    token = client.post("/login", json={"username": "other", "password": "pw"}).json()["access_token"]
    other = {"Authorization": f"Bearer {token}"}
    assert client.get("/unit-progress", headers=other).json()["targets"] == ZEROS
    put(client, other, 1, 3)
    assert client.get("/unit-progress", headers=auth).json()["targets"]["3"] == 2


def test_delete_account_removes_progress(client, auth):
    put(client, auth, 1, 4)
    put(client, auth, 2, 3)
    assert client.post("/delete-account", json={"password": "pw"}, headers=auth).json() == {"deleted": True}
    with TestSession() as s:
        assert s.query(UnitProgress).count() == 0


def test_out_of_order_target_rejected_but_reset_allowed(client, auth):
    assert put(client, auth, 2, 1).status_code == 422
    put(client, auth, 1, 3)
    assert put(client, auth, 2, 1).status_code == 422
    put(client, auth, 1, 4)
    assert put(client, auth, 2, 1).status_code == 200
    assert put(client, auth, 5, 1).status_code == 422
    assert put(client, auth, 5, 0).status_code == 200
    assert client.get("/unit-progress", headers=auth).json()["targets"] == {**ZEROS, "1": 4, "2": 1}
