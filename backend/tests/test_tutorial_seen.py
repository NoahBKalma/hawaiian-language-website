from conftest import TestSession
from models import TutorialSeen


def put(client, auth, page):
    return client.put("/tutorial-seen", json={"page": page}, headers=auth)


def test_requires_auth(client):
    assert client.put("/tutorial-seen", json={"page": "flashcards"}).status_code == 401


def test_default_is_empty_and_keeps_existing_keys(client, auth):
    body = client.get("/signed-in-user", headers=auth).json()
    assert body == {"username": "tester", "email": "t@example.com", "tutorials_seen": []}


def test_put_then_listed(client, auth):
    assert put(client, auth, "writing").json() == {"page": "writing"}
    put(client, auth, "flashcards")
    assert client.get("/signed-in-user", headers=auth).json()["tutorials_seen"] == ["flashcards", "writing"]


def test_duplicate_put_is_idempotent(client, auth):
    assert put(client, auth, "flashcards").status_code == 200
    assert put(client, auth, "flashcards").status_code == 200
    with TestSession() as s:
        assert s.query(TutorialSeen).count() == 1


def test_invalid_page_rejected(client, auth):
    assert put(client, auth, "quiz").status_code == 422
    assert client.put("/tutorial-seen", json={}, headers=auth).status_code == 422


def test_per_user_isolation(client, auth):
    put(client, auth, "flashcards")
    client.post("/register", json={"username": "other", "email": "o@example.com", "password": "pw"})
    token = client.post("/login", json={"username": "other", "password": "pw"}).json()["access_token"]
    other = {"Authorization": f"Bearer {token}"}
    assert client.get("/signed-in-user", headers=other).json()["tutorials_seen"] == []


def test_delete_account_removes_rows(client, auth):
    put(client, auth, "flashcards")
    put(client, auth, "writing")
    assert client.post("/delete-account", json={"password": "pw"}, headers=auth).status_code == 200
    with TestSession() as s:
        assert s.query(TutorialSeen).count() == 0
