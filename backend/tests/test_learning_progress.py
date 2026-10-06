from conftest import TestSession
from models import LearningProgress


def put(client, auth, n, **extra):
    return client.put("/learning-progress", json={"done_count": n, **extra}, headers=auth)


def test_requires_auth(client):
    assert client.get("/learning-progress").status_code == 401
    assert client.put("/learning-progress", json={"done_count": 1}).status_code == 401


def test_default_is_zero(client, auth):
    assert client.get("/learning-progress", headers=auth).json() == {"level": 1, "done_count": 0}


def test_upsert_is_idempotent_and_updates(client, auth):
    assert put(client, auth, 3).json() == {"level": 1, "done_count": 3}
    put(client, auth, 3)
    put(client, auth, 4)
    assert client.get("/learning-progress", headers=auth).json()["done_count"] == 4
    with TestSession() as s:
        assert s.query(LearningProgress).count() == 1


def test_reset_is_put_zero(client, auth):
    put(client, auth, 5)
    put(client, auth, 0)
    assert client.get("/learning-progress", headers=auth).json()["done_count"] == 0


def test_bounds_and_level_rejected(client, auth):
    assert put(client, auth, 6).status_code == 422
    assert put(client, auth, -1).status_code == 422
    assert put(client, auth, 2, level=2).status_code == 422
    assert client.get("/learning-progress", headers=auth).json()["done_count"] == 0


def test_users_are_isolated(client, auth):
    put(client, auth, 2)
    client.post("/register", json={"username": "other", "email": "o@example.com", "password": "pw"})
    token = client.post("/login", json={"username": "other", "password": "pw"}).json()["access_token"]
    other = {"Authorization": f"Bearer {token}"}
    assert client.get("/learning-progress", headers=other).json()["done_count"] == 0
    put(client, other, 5)
    assert client.get("/learning-progress", headers=auth).json()["done_count"] == 2


def test_delete_account_removes_progress(client, auth):
    put(client, auth, 4)
    assert client.post("/delete-account", json={"password": "pw"}, headers=auth).json() == {"deleted": True}
    with TestSession() as s:
        assert s.query(LearningProgress).count() == 0
