import time

from conftest import TestSession
from models import ReviewState

NOW = lambda: int(time.time() * 1000)


def item(word="aloha|hello", mode="flashcards", **extra):
    return {"mode": mode, "word_key": word, "ef": 2.5, "interval_days": 1, "repetitions": 1,
            "due_at": NOW() + 86400000, "learning_step": None, "reviewed_at": NOW(), **extra}


def put(client, auth, *items):
    return client.put("/review-states", json={"items": list(items)}, headers=auth)


def get(client, auth, **params):
    return client.get("/review-states", params=params, headers=auth).json()


def other_user(client):
    client.post("/register", json={"username": "other", "email": "o@example.com", "password": "pw"})
    token = client.post("/login", json={"username": "other", "password": "pw"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_requires_auth(client):
    assert client.get("/review-states").status_code == 401
    assert client.put("/review-states", json={"items": [item()]}).status_code == 401


def test_get_default_is_empty(client, auth):
    assert get(client, auth) == {"states": {"flashcards": {}, "writing": {}}}
    assert get(client, auth, mode="writing") == {"states": {"writing": {}}}


def test_put_then_get_and_idempotent(client, auth):
    first = item(learning_step=1)
    assert put(client, auth, first).json() == {"saved": 1, "skipped": 0}
    assert put(client, auth, first).json() == {"saved": 1, "skipped": 0}
    put(client, auth, item(mode="writing"))
    with TestSession() as s:
        assert s.query(ReviewState).count() == 2
    state = get(client, auth, mode="flashcards")["states"]["flashcards"]["aloha|hello"]
    assert state == {"ef": 2.5, "interval_days": 1, "repetitions": 1, "due_at": first["due_at"], "learning_step": 1,
                     "reviewed_at": first["reviewed_at"]}
    assert list(get(client, auth)["states"]["writing"]) == ["aloha|hello"]


def test_older_reviewed_at_does_not_overwrite(client, auth):
    t = NOW()
    put(client, auth, item(reviewed_at=t, interval_days=6))
    r = put(client, auth, item(reviewed_at=t - 1000, interval_days=1))
    assert r.json() == {"saved": 0, "skipped": 0}
    assert get(client, auth)["states"]["flashcards"]["aloha|hello"]["interval_days"] == 6
    put(client, auth, item(reviewed_at=t + 1000, interval_days=15))
    assert get(client, auth)["states"]["flashcards"]["aloha|hello"]["interval_days"] == 15


def test_invalid_items_skipped_valid_saved(client, auth):
    bad = [
        item("a|b", mode="quiz"),
        item("a|b", ef=1.29),
        item("a|b", interval_days=-1),
        item("a|b", due_at=-1),
        item("a|b", due_at="tomorrow"),
        item("a|b", due_at=253402300799001),
        item("a|b", learning_step=-1),
        item("a|b", learning_step=10),
        item("x" * 400 + "|y", ),
        item("nopipe"),
        item("a|b", reviewed_at=NOW() + 6 * 60 * 1000),
        {**item("a|b"), "extra": 1},
    ]
    r = put(client, auth, *bad, item("good|word"))
    assert r.status_code == 200
    assert r.json() == {"saved": 1, "skipped": len(bad)}
    assert list(get(client, auth)["states"]["flashcards"]) == ["good|word"]


def test_future_within_five_minutes_is_accepted(client, auth):
    assert put(client, auth, item(reviewed_at=NOW() + 60 * 1000)).json() == {"saved": 1, "skipped": 0}


def test_over_500_items_rejected_and_empty_rejected(client, auth):
    assert put(client, auth, *[item(f"w{i}|e") for i in range(501)]).status_code == 422
    assert put(client, auth).status_code == 422
    assert put(client, auth, *[item(f"w{i}|e") for i in range(500)]).json() == {"saved": 500, "skipped": 0}


def test_in_batch_duplicate_keeps_highest_reviewed_at(client, auth):
    t = NOW()
    r = put(client, auth, item(reviewed_at=t - 5, interval_days=1), item(reviewed_at=t, interval_days=6),
            item(reviewed_at=t - 10, interval_days=2))
    assert r.status_code == 200
    assert r.json() == {"saved": 1, "skipped": 2}
    with TestSession() as s:
        assert s.query(ReviewState).count() == 1
    state = get(client, auth)["states"]["flashcards"]["aloha|hello"]
    assert (state["interval_days"], state["reviewed_at"]) == (6, t)


def test_users_are_isolated(client, auth):
    put(client, auth, item("mine|mine"))
    other = other_user(client)
    assert get(client, other) == {"states": {"flashcards": {}, "writing": {}}}
    put(client, other, item("mine|mine", interval_days=9))
    assert get(client, auth)["states"]["flashcards"]["mine|mine"]["interval_days"] == 1
    with TestSession() as s:
        assert s.query(ReviewState).count() == 2


def test_delete_account_removes_states(client, auth):
    put(client, auth, item("a|b"), item("c|d", mode="writing"))
    other = other_user(client)
    put(client, other, item("a|b"))
    assert client.post("/delete-account", json={"password": "pw"}, headers=auth).json() == {"deleted": True}
    with TestSession() as s:
        assert s.query(ReviewState).count() == 1
