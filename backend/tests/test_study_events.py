import sqlite3
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import pytest
from jose import jwt
from sqlalchemy import text

import auth as auth_module
import main
from analytics_views import create_views
from conftest import test_engine
from export_analytics import export_analytics

V1 = "11111111-1111-4111-8111-111111111111"
V2 = "22222222-2222-4222-8222-222222222222"
V3 = "33333333-3333-4333-8333-333333333333"

ANALYTICS_VIEWS = {"v_set_status", "v_set_funnel", "v_first_try", "v_set_accuracy", "v_word_accuracy"}


def set_event(visitor, event_type, set_key="cat:a", mode="writing", level=1, **extra):
    return {"kind": "set", "visitor_id": visitor, "set_key": set_key, "min_frequency": level,
            "mode": mode, "event_type": event_type, **extra}


def attempt(visitor, word, outcome, retry=False, set_key="cat:a", mode="writing", level=1, **extra):
    return {"kind": "attempt", "visitor_id": visitor, "set_key": set_key, "min_frequency": level,
            "mode": mode, "word_hawaiian": word, "outcome": outcome, "is_retry": retry, **extra}


def send(client, events, headers=None):
    return client.post("/study-events", json={"events": events}, headers=headers or {})


def rows(sql, **params):
    with test_engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(sql), params).mappings()]


# ---------------------------------------------------------------- structure

def test_tables_and_views_exist_and_views_are_recreated_idempotently():
    create_views(test_engine)
    create_views(test_engine)
    names = {(r["type"], r["name"]) for r in rows("SELECT type, name FROM sqlite_master")}
    assert ("table", "set_events") in names and ("table", "attempt_events") in names
    for view in ANALYTICS_VIEWS:
        assert ("view", view) in names
    assert len([r for r in rows("SELECT name FROM sqlite_master WHERE type='view'")]) == len(ANALYTICS_VIEWS)


def test_wal_and_busy_timeout_configured():
    with main.engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA journal_mode").scalar() == "wal"
        assert connection.exec_driver_sql("PRAGMA busy_timeout").scalar() == 5000


def test_sqlite_wal_is_opt_in(tmp_path, monkeypatch):
    from sqlalchemy import create_engine
    import database as database_module

    def journal_mode(wal_env):
        if wal_env is None:
            monkeypatch.delenv("SQLITE_WAL", raising=False)
        else:
            monkeypatch.setenv("SQLITE_WAL", wal_env)
        engine = create_engine(f"sqlite:///{tmp_path / 'mode.db'}")
        database_module.configure_sqlite(engine)
        try:
            with engine.connect() as connection:
                return connection.exec_driver_sql("PRAGMA journal_mode").scalar()
        finally:
            engine.dispose()

    assert journal_mode("1") == "wal"
    # the mode is stored in the file, so turning WAL off converts an existing WAL database back
    assert journal_mode(None) == "delete"


def test_concurrent_activity_and_study_events_do_not_lock(client, auth):
    def call(i):
        if i % 2:
            return client.post("/activity", json={"type": "card_graded", "local_date": "2026-01-02"},
                               headers=auth).status_code
        return send(client, [attempt(V1, f"w{i}", "correct")]).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        assert set(pool.map(call, range(40))) == {200}
    assert rows("SELECT COUNT(*) AS n FROM attempt_events")[0]["n"] == 20


# ---------------------------------------------------------------- endpoint

def test_anonymous_and_account_rows(client, auth):
    assert send(client, [set_event(V1, "set_opened")]).json() == {"stored": 1}
    assert send(client, [set_event(V1, "set_started")], auth).status_code == 200
    first, second = rows("SELECT * FROM set_events ORDER BY id")
    assert first["user_id"] is None and first["source"] == "anonymous"
    assert second["user_id"] is not None and second["source"] == "account"
    assert first["visitor_id"] == second["visitor_id"] == V1


def test_invalid_expired_and_deleted_tokens_are_anonymous(client, auth):
    bad = {"Authorization": "Bearer not-a-token"}
    expired = {"Authorization": "Bearer " + jwt.encode(
        {"user_id": 1, "exp": datetime.utcnow() - timedelta(minutes=5)}, auth_module.SECRET_KEY, algorithm="HS256")}
    assert send(client, [set_event(V1, "set_opened")], bad).status_code == 200
    assert send(client, [set_event(V1, "set_opened")], expired).status_code == 200

    # a valid token whose account was deleted
    assert client.post("/delete-account", json={"password": "pw"}, headers=auth).json() == {"deleted": True}
    assert send(client, [set_event(V2, "set_opened")], auth).status_code == 200
    assert {r["source"] for r in rows("SELECT source FROM set_events WHERE visitor_id = :v", v=V2)} == {"anonymous"}
    assert all(r["source"] == "anonymous" for r in rows("SELECT source FROM set_events WHERE visitor_id = :v", v=V1))


@pytest.mark.parametrize("bad_event", [
    {"kind": "set", "visitor_id": V1, "set_key": "cat:a", "mode": "writing"},                       # no event_type
    {"kind": "attempt", "visitor_id": V1, "set_key": "cat:a", "mode": "writing",
     "outcome": "correct", "is_retry": False},                                                       # no word
    {"kind": "attempt", "visitor_id": V1, "set_key": "cat:a", "mode": "writing",
     "word_hawaiian": "a", "is_retry": False},                                                       # no outcome
    {"kind": "attempt", "visitor_id": V1, "set_key": "cat:a", "mode": "writing",
     "word_hawaiian": "a", "outcome": "correct"},                                                    # no is_retry
    {"kind": "attempt", "visitor_id": V1, "set_key": "cat:a", "mode": "writing",
     "word_hawaiian": "a", "outcome": "perfect", "is_retry": False},                                 # unknown outcome
    {"kind": "set", "visitor_id": "not-a-uuid", "set_key": "cat:a", "mode": "writing", "event_type": "set_opened"},
    {"kind": "set", "visitor_id": V1, "set_key": "x" * 201, "mode": "writing", "event_type": "set_opened"},
    {"kind": "set", "visitor_id": V1, "set_key": "bad\x00key", "mode": "writing", "event_type": "set_opened"},
    {"kind": "set", "visitor_id": V1, "set_key": "cat:a", "mode": "writing", "event_type": "set_opened",
     "source": "account"},                                                                           # client-chosen source
    {"kind": "set", "visitor_id": V1, "set_key": "cat:a", "mode": "writing", "event_type": "set_opened",
     "user_id": 1},
    {"kind": "set", "visitor_id": V1, "set_key": "cat:a", "mode": "writing", "event_type": "set_opened",
     "client_time": "2026-01-01T00:00:00"},
])
def test_invalid_events_rejected_and_nothing_stored(client, bad_event):
    assert send(client, [bad_event]).status_code == 422
    assert rows("SELECT COUNT(*) AS n FROM set_events")[0]["n"] == 0
    assert rows("SELECT COUNT(*) AS n FROM attempt_events")[0]["n"] == 0


def test_batch_size_limits(client):
    assert send(client, []).status_code == 422
    assert send(client, [set_event(V1, "set_opened")] * 51).status_code == 422
    assert send(client, [set_event(V1, "set_opened")] * 50).status_code == 200


def test_rate_limit_returns_429(client, monkeypatch):
    monkeypatch.setattr(main, "STUDY_EVENTS_PER_MINUTE", 3)
    for _ in range(3):
        assert send(client, [set_event(V1, "set_opened")]).status_code == 200
    assert send(client, [set_event(V1, "set_opened")]).status_code == 429
    assert rows("SELECT COUNT(*) AS n FROM set_events")[0]["n"] == 3


def test_rate_limiter_evicts_stale_clients():
    stale = time.monotonic() - 1000
    for i in range(1001):
        main._rate_hits[f"ip{i}"] = deque([stale])
    assert main._rate_limited("fresh", 1) is False
    assert set(main._rate_hits) == {"fresh"}


# ---------------------------------------------------------------- deletion

def test_account_deletion_anonymizes_events(client, auth):
    send(client, [set_event(V1, "set_opened"), attempt(V1, "aloha", "correct")], auth)
    send(client, [attempt(V3, "aloha", "incorrect")], auth)      # same account, another browser
    send(client, [attempt(V2, "aloha", "correct")])              # unrelated anonymous visitor

    assert client.post("/delete-account", json={"password": "pw"}, headers=auth).json() == {"deleted": True}

    assert rows("SELECT COUNT(*) AS n FROM attempt_events WHERE user_id IS NOT NULL")[0]["n"] == 0
    deleted = rows("SELECT visitor_id, source FROM attempt_events WHERE source = 'deleted' "
                   "UNION ALL SELECT visitor_id, source FROM set_events WHERE source = 'deleted'")
    assert len(deleted) == 3
    assert len({r["visitor_id"] for r in deleted}) == 1
    assert deleted[0]["visitor_id"] not in (V1, V3)
    untouched = rows("SELECT * FROM attempt_events WHERE visitor_id = :v", v=V2)
    assert len(untouched) == 1 and untouched[0]["source"] == "anonymous"


def test_account_deletion_rolls_back_events_with_the_account(client, auth, monkeypatch):
    send(client, [attempt(V1, "aloha", "correct")], auth)

    def failing_commit(self):
        raise RuntimeError("boom")

    with monkeypatch.context() as patched:
        patched.setattr("sqlalchemy.orm.Session.commit", failing_commit)
        with pytest.raises(RuntimeError):
            client.post("/delete-account", json={"password": "pw"}, headers=auth)

    row = rows("SELECT * FROM attempt_events")[0]
    assert row["user_id"] is not None and row["source"] == "account" and row["visitor_id"] == V1
    assert client.get("/signed-in-user", headers=auth).status_code == 200


# ---------------------------------------------------------------- views

def test_set_status_and_funnel(client, auth):
    send(client, [set_event(V1, "set_opened")])
    send(client, [set_event(V1, "set_started")], auth)           # logs in mid-set: still one browser
    send(client, [set_event(V2, "set_opened")])
    send(client, [set_event(V3, "set_opened"), set_event(V3, "set_started"), set_event(V3, "set_completed")])

    status = {r["visitor_id"]: r for r in rows("SELECT * FROM v_set_status")}
    assert len(status) == 3
    assert status[V1]["status"] == "started" and status[V1]["user_id"] is not None and status[V1]["source"] == "account"
    assert status[V2]["status"] == "opened" and status[V2]["started_at"] is None
    assert status[V3]["status"] == "completed"

    funnel = rows("SELECT * FROM v_set_funnel")
    assert len(funnel) == 1
    assert (funnel[0]["opened"], funnel[0]["started"], funnel[0]["completed"]) == (3, 2, 1)
    assert (funnel[0]["opened_not_started"], funnel[0]["started_not_completed"]) == (1, 1)


def test_levels_and_modes_are_separate_decks(client):
    send(client, [set_event(V1, "set_opened", level=1), set_event(V1, "set_opened", level=3),
                  set_event(V1, "set_opened", mode="flashcards")])
    assert len(rows("SELECT * FROM v_set_funnel")) == 3


def test_accuracy_views_match_hand_counts(client):
    send(client, [
        attempt(V1, "aloha", "correct"),                                     # first try right
        attempt(V1, "mahalo", "incorrect"),
        attempt(V1, "mahalo", "correct_helped"),                             # missed first
        attempt(V1, "ʻohana", "hint_blanks"),
        attempt(V1, "ʻohana", "gave_up"),
        attempt(V1, "ʻohana", "correct_helped", retry=True),                 # retry round
        # flashcards: V1 grades incorrect then re-grades correct; V2 grades correct
        attempt(V1, "aloha", "incorrect", mode="flashcards"),
        attempt(V1, "aloha", "correct", mode="flashcards"),
        attempt(V2, "aloha", "correct", mode="flashcards"),
    ])

    writing = rows("SELECT * FROM v_set_accuracy WHERE mode = 'writing'")[0]
    assert (writing["attempts"], writing["correct"], writing["incorrect"]) == (5, 3, 2)
    assert (writing["hints"], writing["retry_attempts"]) == (1, 1)
    assert (writing["words_seen"], writing["first_try_correct_words"]) == (3, 1)
    assert writing["first_pass_incorrect_rate"] == pytest.approx(2 / 3)

    cards = rows("SELECT * FROM v_set_accuracy WHERE mode = 'flashcards'")[0]
    assert (cards["attempts"], cards["correct"], cards["incorrect"]) == (3, 2, 1)
    assert (cards["words_seen"], cards["first_try_correct_words"]) == (2, 1)
    assert cards["first_pass_incorrect_rate"] == pytest.approx(0.5)
    assert cards["distinct_visitors"] == 2

    ohana = rows("SELECT * FROM v_word_accuracy WHERE word_hawaiian = 'ʻohana'")[0]
    assert (ohana["attempts"], ohana["incorrect"], ohana["hints"], ohana["gave_up"]) == (2, 1, 1, 1)
    assert (ohana["retry_attempts"], ohana["words_seen"], ohana["first_try_correct_words"]) == (1, 1, 0)


def test_gameplay_accounting_is_unaffected_by_study_events(client, auth):
    before = client.get("/progress", params={"today": "2026-01-02"}, headers=auth).json()
    send(client, [attempt(V1, "aloha", "correct"), set_event(V1, "set_completed")], auth)
    after = client.get("/progress", params={"today": "2026-01-02"}, headers=auth).json()
    assert before["stats"] == after["stats"]
    assert before["achievements"] == after["achievements"]


# ---------------------------------------------------------------- export

def test_export_contains_only_analytics_data(client, auth, tmp_path):
    send(client, [set_event(V1, "set_opened"), attempt(V1, "aloha", "correct")], auth)
    source = test_engine.url.database
    out = tmp_path / "analytics.db"

    counts = export_analytics(source, out)
    assert counts == {"set_events": 1, "attempt_events": 1}

    exported = sqlite3.connect(out)
    try:
        objects = {(kind, name) for kind, name in exported.execute("SELECT type, name FROM sqlite_master WHERE type IN ('table','view')")}
        assert {name for kind, name in objects if kind == "table"} == {"set_events", "attempt_events"}
        assert {name for kind, name in objects if kind == "view"} == ANALYTICS_VIEWS
        columns = {row[1].lower() for table in ("set_events", "attempt_events")
                   for row in exported.execute(f"PRAGMA table_info({table})")}
        assert not any("password" in c or "email" in c for c in columns)
        assert exported.execute("SELECT status FROM v_set_status").fetchone()[0] == "opened"
        assert exported.execute("SELECT COUNT(*) FROM attempt_events").fetchone()[0] == 1
    finally:
        exported.close()

    with pytest.raises(FileExistsError):
        export_analytics(source, out)
    assert export_analytics(source, out, force=True) == counts


def test_export_missing_source(tmp_path):
    with pytest.raises(FileNotFoundError):
        export_analytics(tmp_path / "nope.db", tmp_path / "out.db")
