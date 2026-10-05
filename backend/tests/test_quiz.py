import uuid

import pytest
from sqlalchemy import text
import sqlalchemy.orm.query as sa_query

from models import QuizResult

V1 = "11111111-1111-4111-8111-111111111111"


def body(**over):
    data = {"quiz_id": str(uuid.uuid4()), "visitor_id": V1, "set_key": "cat:a", "local_date": "2026-01-02",
            "question_count": 5, "score": 4.5, "writing_total": 2, "writing_correct": 2,
            "mc_total": 2, "mc_correct": 2, "connect_total": 1, "connect_score": 0.5, "unanswered": 0}
    data.update(over)
    return data


def perfect(**over):
    return body(score=5.0, connect_score=1.0, **over)


def submit(client, data, headers=None):
    return client.post("/quiz-results", json=data, headers=headers or {})


def rows(sql="SELECT * FROM quiz_results"):
    from conftest import test_engine
    with test_engine.connect() as connection:
        return [dict(r) for r in connection.execute(text(sql)).mappings()]


def progress(client, auth):
    return client.get("/progress", params={"today": "2026-01-02"}, headers=auth).json()


# ---------------------------------------------------------------- schema

@pytest.mark.parametrize("over", [
    {"question_count": 4},
    {"question_count": 7},
    {"writing_total": 3},                       # totals no longer sum to question_count
    {"writing_correct": 3},                     # correct > total
    {"mc_correct": 3},
    {"connect_score": 1.5, "score": 5.5},       # connect_score > connect_total
    {"score": 4.0},                             # score != per-type sum
    {"score": -1},
    {"unanswered": 5},                          # nothing answered
    {"unanswered": 6},
    {"unanswered": -1},
    {"quiz_id": "nope"},
    {"visitor_id": "nope"},
    {"set_key": ""},
    {"set_key": "bad\x00key"},
    {"local_date": "01/02/2026"},
    {"user_id": 3},                             # extra='forbid'
    {"source": "account"},
])
def test_invalid_payloads_rejected(client, over):
    assert submit(client, body(**over)).status_code == 422
    assert rows() == []


def test_valid_edge_payloads_accepted(client):
    assert submit(client, body(unanswered=4, score=0.0, writing_correct=0, mc_correct=0,
                               connect_score=0.0)).status_code == 200
    assert submit(client, body(question_count=10, writing_total=4, writing_correct=4, mc_total=4,
                               mc_correct=4, connect_total=2, connect_score=1.25, score=9.25)).status_code == 200


# ---------------------------------------------------------------- anonymous

def test_anonymous_store(client):
    data = body()
    r = submit(client, data)
    assert r.status_code == 200
    assert r.json() == {"stored": True, "duplicate": False, "streak_skipped": False, "new_achievements": []}
    [row] = rows()
    assert row["user_id"] is None and row["source"] == "anonymous" and row["visitor_id"] == V1
    assert row["quiz_id"] == data["quiz_id"] and row["score"] == 4.5 and row["local_date"] == "2026-01-02"


def test_anonymous_duplicate(client):
    data = body()
    assert submit(client, data).json()["duplicate"] is False
    r = submit(client, data)
    assert r.status_code == 200 and r.json()["duplicate"] is True and r.json()["new_achievements"] == []
    assert len(rows()) == 1


# ---------------------------------------------------------------- logged in

def test_first_quiz_unlocks_on_first_submit_and_streak(client, auth):
    r = submit(client, body(), auth).json()
    assert [a["id"] for a in r["new_achievements"]] == ["quizzes-1"]
    assert r["new_achievements"][0]["title"] == "First Quiz"
    p = progress(client, auth)
    assert p["stats"]["current_streak"] == 1 and p["stats"]["last_active_date"] == "2026-01-02"
    assert p["stats"]["quizzes_completed"] == 1 and p["stats"]["perfect_quizzes"] == 0
    [row] = rows()
    assert row["source"] == "account" and row["user_id"] is not None


def test_streak_rules_match_activity(client, auth):
    submit(client, body(local_date="2026-01-01"), auth)
    submit(client, body(local_date="2026-01-02"), auth)
    assert progress(client, auth)["stats"]["current_streak"] == 2
    submit(client, body(local_date="2026-01-02"), auth)  # same day: unchanged
    assert progress(client, auth)["stats"]["current_streak"] == 2


def test_perfect_quiz_and_ladders(client, auth):
    r = submit(client, perfect(), auth).json()
    assert {a["id"] for a in r["new_achievements"]} == {"quizzes-1", "quizperfect-1"}
    assert progress(client, auth)["stats"]["perfect_quizzes"] == 1
    # near-perfect is not perfect
    assert submit(client, body(), auth).json()["new_achievements"] == []
    for _ in range(2):
        submit(client, body(), auth)
    ids = [a["id"] for a in submit(client, body(), auth).json()["new_achievements"]]
    assert ids == ["quizzes-5"]


def test_duplicate_does_not_touch_streak_again(client, auth):
    data = body(local_date="2026-01-01")
    submit(client, data, auth)
    r = submit(client, data, auth).json()
    assert r["duplicate"] is True and r["new_achievements"] == []
    assert len(rows()) == 1
    assert progress(client, auth)["stats"]["current_streak"] == 1


@pytest.mark.parametrize("logged_in", [False, True])
def test_integrity_error_race_returns_duplicate(client, auth, monkeypatch, logged_in):
    # Simulates the loser of a race: the pre-check misses, then the flush hits the UNIQUE quiz_id
    data = body()
    headers = auth if logged_in else {}
    assert submit(client, data, headers).json()["stored"] is True
    original_first = sa_query.Query.first

    def first_without_precheck(self):
        cols = self.column_descriptions
        if cols and cols[0]["entity"] is QuizResult and cols[0]["name"] == "id":
            return None
        return original_first(self)

    monkeypatch.setattr(sa_query.Query, "first", first_without_precheck)
    r = submit(client, data, headers)
    assert r.status_code == 200 and r.json()["duplicate"] is True and r.json()["new_achievements"] == []
    assert len(rows()) == 1
    if logged_in:
        assert progress(client, auth)["stats"]["quizzes_completed"] == 1


# ---------------------------------------------------------------- local_date

@pytest.mark.parametrize("date", ["2026-02-30", "2026-13-45", "not-a-date"])
def test_impossible_or_malformed_date_is_422(client, auth, date):
    assert submit(client, body(local_date=date), auth).status_code == 422
    assert submit(client, body(local_date=date)).status_code == 422
    assert rows() == []


def test_out_of_range_date_anonymous(client):
    r = submit(client, body(local_date="2026-06-01"))
    assert r.status_code == 200
    assert r.json()["streak_skipped"] is True and r.json()["new_achievements"] == []
    assert rows()[0]["local_date"] == "2026-01-02"  # server date (pinned), not the client's


def test_out_of_range_date_logged_in_counts_later(client, auth):
    r = submit(client, body(local_date="2026-06-01"), auth)
    assert r.status_code == 200 and r.json()["streak_skipped"] is True and r.json()["new_achievements"] == []
    assert rows()[0]["local_date"] == "2026-01-02"
    p = progress(client, auth)
    assert p["stats"]["current_streak"] == 0 and p["stats"]["last_active_date"] is None
    assert p["stats"]["quizzes_completed"] == 1
    # the next in-range submit counts the earlier row toward quizzes
    r = submit(client, body(), auth).json()
    assert r["streak_skipped"] is False
    assert progress(client, auth)["stats"]["quizzes_completed"] == 2


# ---------------------------------------------------------------- other

def test_delete_account_anonymizes_quiz_results(client, auth):
    submit(client, body(), auth)
    r = client.post("/delete-account", json={"password": "pw"}, headers=auth)
    assert r.status_code == 200
    [row] = rows()
    assert row["user_id"] is None and row["source"] == "deleted" and row["visitor_id"] != V1


def test_quiz_mode_study_events_accepted_and_bogus_rejected(client):
    def attempt(mode, variant):
        return {"kind": "attempt", "visitor_id": V1, "set_key": "cat:a", "mode": mode, "variant": variant,
                "word_hawaiian": "aloha", "outcome": "correct", "is_retry": False}
    ok = client.post("/study-events", json={"events": [
        {"kind": "set", "visitor_id": V1, "set_key": "cat:a", "mode": "quiz", "event_type": "set_opened"},
        attempt("quiz", "connect_to_eng"), attempt("quiz", "mc_to_haw"),
        attempt("quiz", "writing_to_haw"), attempt("quiz", "writing_to_eng"),
        attempt("quiz", "mc_to_eng"), attempt("quiz", "connect_to_haw")]})
    assert ok.status_code == 200 and ok.json() == {"stored": 7}
    assert client.post("/study-events", json={"events": [attempt("bogus", None)]}).status_code == 422
    assert client.post("/study-events", json={"events": [attempt("quiz", "bogus_variant")]}).status_code == 422
    # existing modes and variants unchanged
    assert client.post("/study-events", json={"events": [attempt("flashcards", "hawaiian")]}).status_code == 200
