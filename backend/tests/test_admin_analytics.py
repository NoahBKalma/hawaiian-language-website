"""Admin analytics: the ADMIN_USER_IDS gate, every /admin/analytics route on a small hand-counted fixture,
read-only access and the no-PII rule."""
import sqlite3

import pytest
from sqlalchemy import text

import admin_analytics as aa
from conftest import test_engine

PII_KEYS = {"email", "username", "password", "password_hash", "token_version"}


# -- fixture rows (hand counted, see the expectations below)
def stamp(at):
    at = at if " " in at else f"{at} 12:00:00"
    return at if "." in at else f"{at}.000000"


def set_ev(visitor, event_type, at, *, key="s1", mode="writing", level=1, variant="to_hawaiian",
           source="anonymous", user=None):
    return dict(occurred_at=stamp(at), user_id=user, visitor_id=visitor, source=source, set_key=key,
                min_frequency=level, mode=mode, variant=variant, event_type=event_type)


def att(visitor, word, outcome, at, *, key="s1", mode="writing", level=1, variant="to_hawaiian",
        source="anonymous", user=None, retry=False, spaced=False):
    return dict(occurred_at=stamp(at), user_id=user, visitor_id=visitor, source=source, set_key=key,
                min_frequency=level, mode=mode, variant=variant, word_hawaiian=word, outcome=outcome,
                is_retry=int(retry), is_spaced=int(spaced))


_quiz_n = [0]


def quiz_row(visitor, at, *, key, count, score, w, mc, cn, source="anonymous", user=None):
    _quiz_n[0] += 1
    return dict(occurred_at=stamp(at), user_id=user, visitor_id=visitor, source=source, quiz_id=f"q-{_quiz_n[0]}",
                set_key=key, local_date=at[:10], question_count=count, score=score, writing_total=w[0],
                writing_correct=w[1], mc_total=mc[0], mc_correct=mc[1], connect_total=cn[0], connect_score=cn[1],
                unanswered=0)


def insert(table, rows):
    with test_engine.begin() as conn:
        for row in rows:
            conn.execute(text(f"INSERT INTO {table} ({', '.join(row)}) VALUES ({', '.join(':' + k for k in row)})"), row)


ACCT = dict(source="account", user=1)
SET_ROWS = [
    set_ev("v1", "set_opened", "2026-01-02 10:00:00", **ACCT),
    set_ev("v1", "set_started", "2026-01-02 10:00:01", **ACCT),
    set_ev("v1", "set_completed", "2026-01-02 10:05:00", **ACCT),
    set_ev("v2", "set_opened", "2026-01-02 11:00:00"),
    set_ev("v2", "set_started", "2026-01-02 11:00:01"),
    set_ev("v3", "set_opened", "2026-01-03 08:00:00"),
    set_ev("v4", "set_opened", "2026-01-03 09:00:00", key="s2", mode="flashcards", variant="hawaiian"),
    set_ev("v4", "set_started", "2026-01-03 09:00:01", key="s2", mode="flashcards", variant="hawaiian"),
]
ATTEMPT_ROWS = [
    att("v1", "aloha", "correct", "2026-01-02 10:00:00", **ACCT),
    att("v1", "mahalo", "incorrect", "2026-01-02 10:01:00", **ACCT),
    att("v1", "mahalo", "correct", "2026-01-02 10:02:00", retry=True, **ACCT),
    att("v1", "aloha", "hint_letter", "2026-01-02 10:03:00", **ACCT),
    att("v2", "aloha", "incorrect", "2026-01-02 11:00:00"),
    att("v2", "mahalo", "gave_up", "2026-01-02 11:01:00"),
    att("v4", "wai", "correct", "2026-01-03 09:00:00", key="s2", mode="flashcards", variant="hawaiian"),
    att("v4", "kai", "incorrect", "2026-01-03 09:01:00", key="s2", mode="flashcards", variant="hawaiian"),
    att("v4", "kai", "correct", "2026-01-03 09:05:00", key="s2", mode="flashcards", variant="hawaiian", spaced=True),
    att("v5", "aloha", "correct", "2026-01-04 10:00:00", level=2),
    # quiz attempts (mode quiz, variant {type}_{dir})
    att("v2", "wai", "incorrect", "2026-01-03 10:00:00", key="s3", mode="quiz", variant="mc_to_eng"),
    att("v3", "wai", "correct", "2026-01-03 10:01:00", key="s3", mode="quiz", variant="mc_to_eng"),
]
QUIZ_ROWS = [
    quiz_row("v1", "2026-01-02 12:00:00", key="s1", count=5, score=4.0, w=(2, 2), mc=(2, 2), cn=(1, 0.0), **ACCT),
    quiz_row("v2", "2026-01-03 12:00:00", key="s1", count=4, score=2.0, w=(2, 1), mc=(1, 1), cn=(1, 0.0)),
    quiz_row("v3", "2026-01-03 12:00:00", key="s2", count=10, score=5.0, w=(4, 2), mc=(4, 3), cn=(2, 0.5)),
]


@pytest.fixture
def data():
    insert("set_events", SET_ROWS)
    insert("attempt_events", ATTEMPT_ROWS)
    insert("quiz_results", QUIZ_ROWS)


@pytest.fixture
def admin(client, auth, monkeypatch):
    """Headers of user 1 ('tester'), who is on the ADMIN_USER_IDS list."""
    monkeypatch.setenv("ADMIN_USER_IDS", "1")
    return auth


def get(client, headers, path, **params):
    return client.get(f"/admin/analytics/{path}", headers=headers, params=params)


def by(rows, *keys):
    return {tuple(r[k] for k in keys): r for r in rows}


def walk_keys(value):
    if isinstance(value, dict):
        for k, v in value.items():
            yield k
            yield from walk_keys(v)
    elif isinstance(value, list):
        for v in value:
            yield from walk_keys(v)


# -- the gate
ROUTES = ["me", "analytics/options", "analytics/summary?date_from=2026-01-01&date_to=2026-01-31",
          "analytics/sets", "analytics/words", "analytics/funnel", "analytics/activity",
          "analytics/quiz/trend", "analytics/quiz/types", "analytics/quiz/results", "analytics/quiz/words"]


@pytest.mark.parametrize("route", ROUTES)
def test_every_route_needs_a_token(client, monkeypatch, route):
    monkeypatch.setenv("ADMIN_USER_IDS", "1")
    assert client.get(f"/admin/{route}").status_code == 401
    assert client.get(f"/admin/{route}", headers={"Authorization": "Bearer nope"}).status_code == 401


@pytest.mark.parametrize("value", [None, "", "  ", ",,", "x", "x, 99", "-1", "1.5", "٣"])
@pytest.mark.parametrize("route", ROUTES)
def test_every_route_rejects_non_admins(client, auth, monkeypatch, route, value):
    if value is None:
        monkeypatch.delenv("ADMIN_USER_IDS", raising=False)
    else:
        monkeypatch.setenv("ADMIN_USER_IDS", value)
    assert client.get(f"/admin/{route}", headers=auth).status_code == 403


@pytest.mark.parametrize("value", ["1", " 1 ", "x,1", "7, 1,", "1,1"])
def test_admin_list_parsing(client, auth, monkeypatch, value):
    monkeypatch.setenv("ADMIN_USER_IDS", value)
    response = client.get("/admin/me", headers=auth)
    assert response.status_code == 200
    assert response.json() == {"admin": True, "user_id": 1}


def test_only_listed_account_is_admin(client, admin):
    client.post("/register", json={"username": "other", "email": "o@example.com", "password": "password1"})
    token = client.post("/login", json={"username": "other", "password": "password1"}).json()["access_token"]
    other = {"Authorization": f"Bearer {token}"}
    assert client.get("/admin/me", headers=admin).status_code == 200
    assert client.get("/admin/me", headers=other).status_code == 403
    assert get(client, other, "sets").status_code == 403


def test_admin_list_is_read_on_every_request(client, auth, monkeypatch):
    monkeypatch.setenv("ADMIN_USER_IDS", "1")
    assert client.get("/admin/me", headers=auth).status_code == 200
    monkeypatch.setenv("ADMIN_USER_IDS", "2")
    assert client.get("/admin/me", headers=auth).status_code == 403


# -- read-only access, no PII
def test_connection_is_read_only(client, admin, data):
    conn = aa.open_readonly()
    try:
        for sql in ("INSERT INTO set_events (visitor_id) VALUES ('x')", "DELETE FROM attempt_events",
                    "UPDATE users SET username = 'x'", "DROP TABLE quiz_results"):
            with pytest.raises(sqlite3.OperationalError):
                conn.execute(sql)
    finally:
        conn.close()
    assert get(client, admin, "sets").json()["rows"]  # data untouched


def test_connection_works_across_threads(client, admin, data):
    # the route dependency and the endpoint run on different threadpool threads
    import threading
    conn, errors = aa.open_readonly(), []

    def use():
        try:
            aa.has_quiz_data(conn)
        except sqlite3.ProgrammingError as error:
            errors.append(error)
    worker = threading.Thread(target=use)
    worker.start()
    worker.join()
    conn.close()
    assert errors == []


def test_no_pii_in_any_response(client, admin, data):
    paths = ["options", "sets", "words", "funnel", "activity", "quiz/trend", "quiz/types", "quiz/results",
             "quiz/words", "summary"]
    for path in paths:
        params = {"include_quiz": True, "date_from": "2026-01-01", "date_to": "2026-01-31"}
        body = get(client, admin, path, **params).json()
        assert not PII_KEYS & set(walk_keys(body)), path
    assert not PII_KEYS & set(walk_keys(client.get("/admin/me", headers=admin).json()))


# -- options
def test_options(client, admin, data):
    body = get(client, admin, "options").json()
    assert body == {"set_keys": ["s1", "s2"], "min_frequencies": [1, 2], "variants": ["hawaiian", "to_hawaiian"],
                    "has_spaced": True, "has_quiz": True, "date_min": "2026-01-02", "date_max": "2026-01-04"}
    body = get(client, admin, "options", include_quiz=True).json()
    assert body["set_keys"] == ["s1", "s2", "s3"] and body["variants"] == ["hawaiian", "mc_to_eng", "to_hawaiian"]


def test_options_on_an_empty_database(client, admin):
    body = get(client, admin, "options").json()
    assert body["set_keys"] == [] and body["date_min"] is None and body["date_max"] is None


# -- sets
def test_sets(client, admin, data):
    body = get(client, admin, "sets").json()
    assert body["hidden_count"] == 0 and body["truncated"] is False
    rows = by(body["rows"], "set_key", "mode", "min_frequency", "direction")
    assert len(rows) == 3
    s1 = rows[("s1", "writing", 1, "english_to_hawaiian")]
    assert (s1["attempts"], s1["correct"], s1["incorrect"], s1["hints"], s1["retry_attempts"]) == (5, 2, 3, 1, 1)
    assert (s1["words_seen"], s1["first_try_correct_words"], s1["first_pass_incorrect_rate"]) == (4, 1, 0.75)
    assert (s1["distinct_visitors"], s1["distinct_accounts"]) == (2, 1)
    s2 = rows[("s2", "flashcards", 1, "hawaiian_to_english")]
    assert (s2["attempts"], s2["correct"], s2["incorrect"], s2["spaced_attempts"], s2["spaced_incorrect"]) == (3, 2, 1, 1, 0)
    assert (s2["words_seen"], s2["first_pass_incorrect_rate"]) == (2, 0.5)
    assert rows[("s1", "writing", 2, "english_to_hawaiian")]["attempts"] == 1


def test_sets_without_split_has_no_direction(client, admin, data):
    rows = get(client, admin, "sets", split_by_direction=False).json()["rows"]
    assert len(rows) == 3 and all("direction" not in r for r in rows)


def test_sets_tabs(client, admin, data):
    flash = get(client, admin, "sets", tab="flashcards").json()["rows"]
    assert [(r["set_key"], r["mode"]) for r in flash] == [("s2", "flashcards")]
    writing = get(client, admin, "sets", tab="writing").json()["rows"]
    assert {(r["set_key"], r["min_frequency"]) for r in writing} == {("s1", 1), ("s1", 2)}


def test_sets_include_quiz_adds_quiz_decks(client, admin, data):
    assert not any(r["mode"] == "quiz" for r in get(client, admin, "sets").json()["rows"])
    rows = get(client, admin, "sets", include_quiz=True).json()["rows"]
    quiz = [r for r in rows if r["mode"] == "quiz"]
    assert len(quiz) == 1 and (quiz[0]["set_key"], quiz[0]["attempts"], quiz[0]["correct"]) == ("s3", 2, 1)


def test_sets_filters(client, admin, data):
    def only(**params):
        return get(client, admin, "sets", **params).json()["rows"]

    assert [r["attempts"] for r in only(audience="account")] == [3]            # v1: aloha, mahalo, mahalo retry
    assert [r["attempts"] for r in only(user_id=1)] == [3]
    assert [r["incorrect"] for r in only(visitor_id="v2")] == [2]
    assert {r["set_key"] for r in only(set_key="s2")} == {"s2"}
    assert [r["min_frequency"] for r in only(min_frequency=2)] == [2]
    assert [r["attempts"] for r in only(date_from="2026-01-03", date_to="2026-01-03", tab="flashcards")] == [3]
    assert {r["set_key"] for r in only(date_from="2026-01-04")} == {"s1"}       # only the level-2 row
    assert {r["set_key"] for r in only(direction="hawaiian_to_english")} == {"s2"}
    assert {r["set_key"] for r in only(direction="english_to_hawaiian")} == {"s1"}
    assert [r["attempts"] for r in only(spaced="normal", set_key="s2")] == [2]
    assert [r["attempts"] for r in only(spaced="spaced")] == [1]
    assert only(audience="deleted") == []


def test_sets_min_sample_hides_thin_decks(client, admin, data):
    body = get(client, admin, "sets", min_set_words=3).json()
    assert [r["set_key"] for r in body["rows"]] == ["s1"] and body["hidden_count"] == 2


# -- words
def test_words(client, admin, data):
    rows = get(client, admin, "words").json()["rows"]
    keyed = by(rows, "word_hawaiian", "set_key", "min_frequency")
    assert len(rows) == 5 and rows[0]["word_hawaiian"] == "mahalo"          # incorrect DESC, then word
    m = keyed[("mahalo", "s1", 1)]
    assert (m["attempts"], m["incorrect"], m["gave_up"], m["retry_attempts"], m["words_seen"],
            m["first_try_correct_words"]) == (3, 2, 1, 1, 2, 0)
    a = keyed[("aloha", "s1", 1)]
    assert (a["attempts"], a["incorrect"], a["hints"]) == (2, 1, 1)
    k = keyed[("kai", "s2", 1)]
    assert (k["attempts"], k["incorrect"], k["spaced_attempts"]) == (2, 1, 1)


def test_words_min_attempts_filters_and_counts_hidden(client, admin, data):
    body = get(client, admin, "words", min_word_attempts=3).json()
    assert [r["word_hawaiian"] for r in body["rows"]] == ["mahalo"] and body["hidden_count"] == 4


def test_words_filters(client, admin, data):
    rows = get(client, admin, "words", set_key="s2", spaced="normal").json()["rows"]
    assert {r["word_hawaiian"]: r["attempts"] for r in rows} == {"wai": 1, "kai": 1}
    rows = get(client, admin, "words", audience="anonymous", tab="writing", set_key="s1", min_frequency=1).json()["rows"]
    assert {r["word_hawaiian"]: r["incorrect"] for r in rows} == {"aloha": 1, "mahalo": 1}   # v2 only


# -- funnel
def test_funnel(client, admin, data):
    body = get(client, admin, "funnel").json()
    rows = by(body["rows"], "set_key", "mode")
    s1 = rows[("s1", "writing")]
    assert (s1["opened"], s1["started"], s1["completed"], s1["opened_not_started"], s1["started_not_completed"]) == (3, 2, 1, 1, 1)
    s2 = rows[("s2", "flashcards")]
    assert (s2["opened"], s2["started"], s2["completed"], s2["opened_not_started"], s2["started_not_completed"]) == (1, 1, 0, 0, 1)
    assert [(r["set_key"], r["started_not_completed"], r["opened_not_started"]) for r in body["rollup"]] == [("s1", 1, 1), ("s2", 1, 0)]
    assert [(d["visitor_id"], d["status"]) for d in body["detail"]] == [("v2", "started"), ("v3", "opened"), ("v4", "started")]
    assert body["detail_truncated"] is False


def test_funnel_filters(client, admin, data):
    def rows(**params):
        return get(client, admin, "funnel", **params).json()["rows"]

    assert [(r["set_key"], r["opened"], r["completed"]) for r in rows(audience="account")] == [("s1", 1, 1)]
    assert [r["set_key"] for r in rows(tab="flashcards")] == ["s2"]
    assert [r["set_key"] for r in rows(direction="hawaiian_to_english")] == ["s2"]
    assert [(r["opened"], r["started"]) for r in rows(date_from="2026-01-03", date_to="2026-01-03", set_key="s1")] == [(1, 0)]
    assert rows(visitor_id="nobody") == []


# -- activity
def test_activity(client, admin, data):
    rows = get(client, admin, "activity").json()["rows"]
    assert rows == [{"day": "2026-01-02", "opens": 2, "starts": 2, "attempts": 5},
                    {"day": "2026-01-03", "opens": 2, "starts": 1, "attempts": 3},
                    {"day": "2026-01-04", "opens": 0, "starts": 0, "attempts": 1}]


def test_activity_filters(client, admin, data):
    rows = get(client, admin, "activity", date_from="2026-01-03", date_to="2026-01-03").json()["rows"]
    assert rows == [{"day": "2026-01-03", "opens": 2, "starts": 1, "attempts": 3}]
    rows = get(client, admin, "activity", tab="flashcards", spaced="normal").json()["rows"]
    assert rows[1]["attempts"] == 2 and rows[0]["attempts"] == 0
    assert get(client, admin, "activity", audience="account").json()["rows"][0] == {"day": "2026-01-02", "opens": 1, "starts": 1, "attempts": 3}


def test_activity_empty_database(client, admin):
    assert get(client, admin, "activity").json() == {"rows": []}


# -- summary
def test_summary(client, admin, data):
    body = get(client, admin, "summary", date_from="2026-01-02", date_to="2026-01-03").json()
    prev = body.pop("previous")
    assert body == {"visitors": 4, "decks_started": 3, "decks_completed": 1, "completion_rate": 1 / 3,
                    "first_try_accuracy": 2 / 6, "answers": 8}
    assert prev == {"visitors": 0, "decks_started": 0, "decks_completed": 0, "completion_rate": None,
                    "first_try_accuracy": None, "answers": 0}


def test_summary_previous_window_is_the_day_before(client, admin, data):
    body = get(client, admin, "summary", date_from="2026-01-03", date_to="2026-01-03").json()
    assert (body["visitors"], body["decks_started"], body["answers"], body["first_try_accuracy"]) == (2, 1, 3, 0.5)
    assert body["previous"] == {"visitors": 2, "decks_started": 2, "decks_completed": 1, "completion_rate": 0.5,
                                "first_try_accuracy": 0.25, "answers": 5}


def test_summary_filters(client, admin, data):
    body = get(client, admin, "summary", date_from="2026-01-02", date_to="2026-01-03", audience="account").json()
    assert (body["visitors"], body["decks_started"], body["decks_completed"], body["answers"]) == (1, 1, 1, 3)
    body = get(client, admin, "summary", date_from="2026-01-02", date_to="2026-01-03", tab="flashcards").json()
    assert (body["visitors"], body["decks_started"], body["answers"], body["first_try_accuracy"]) == (1, 1, 3, 0.5)


def test_summary_needs_both_dates(client, admin, data):
    assert get(client, admin, "summary").status_code == 422
    assert get(client, admin, "summary", date_from="2026-01-02").status_code == 422
    assert get(client, admin, "summary", date_to="2026-01-02").status_code == 422


# -- quizzes
def test_quiz_trend(client, admin, data):
    rows = get(client, admin, "quiz/trend").json()["rows"]
    assert [(r["day"], r["quizzes"], round(r["avg_pct"], 6)) for r in rows] == [("2026-01-02", 1, 80.0), ("2026-01-03", 2, 50.0)]


def test_quiz_types(client, admin, data):
    rows = by(get(client, admin, "quiz/types").json()["rows"], "question_type")
    assert (rows[("writing",)]["total"], rows[("writing",)]["correct"], rows[("writing",)]["accuracy"]) == (8, 5, 62.5)
    assert (rows[("mc",)]["total"], rows[("mc",)]["correct"]) == (7, 6)
    assert (rows[("connect",)]["total"], rows[("connect",)]["correct"], rows[("connect",)]["accuracy"]) == (4, 0.5, 12.5)


def test_quiz_results(client, admin, data):
    body = get(client, admin, "quiz/results").json()
    assert body["truncated"] is False
    assert [(r["visitor_id"], r["set_key"], r["score"]) for r in body["rows"]] == [("v3", "s2", 5.0), ("v2", "s1", 2.0), ("v1", "s1", 4.0)]


def test_quiz_summaries_ignore_direction_and_level_but_honor_the_rest(client, admin, data):
    assert len(get(client, admin, "quiz/results", direction="english_to_hawaiian", min_frequency=9).json()["rows"]) == 3
    rows = get(client, admin, "quiz/results", audience="account").json()["rows"]
    assert [r["visitor_id"] for r in rows] == ["v1"]
    assert [r["day"] for r in get(client, admin, "quiz/trend", date_from="2026-01-03").json()["rows"]] == ["2026-01-03"]
    assert get(client, admin, "quiz/types", set_key="s2").json()["rows"][0]["total"] == 4


def test_quiz_words(client, admin, data):
    rows = get(client, admin, "quiz/words").json()["rows"]
    assert len(rows) == 1
    r = rows[0]
    assert (r["word_hawaiian"], r["set_key"], r["mode"], r["direction"]) == ("wai", "s3", "quiz", "hawaiian_to_english")
    assert (r["attempts"], r["incorrect"], r["words_seen"], r["first_try_correct_words"]) == (2, 1, 2, 1)
    assert get(client, admin, "quiz/words", direction="english_to_hawaiian").json()["rows"] == []
    assert get(client, admin, "quiz/words", direction="hawaiian_to_english").json()["rows"][0]["attempts"] == 2


def test_quiz_routes_on_a_database_without_quiz_rows(client, admin):
    for path in ("quiz/trend", "quiz/types", "quiz/results", "quiz/words"):
        body = get(client, admin, path).json()
        assert body["rows"] == [] or path == "quiz/types"   # types always lists the three zero rows
    assert all(r["total"] == 0 and r["accuracy"] is None for r in get(client, admin, "quiz/types").json()["rows"])


# -- validation
@pytest.mark.parametrize("path", ["sets", "words", "funnel", "activity", "quiz/trend", "options"])
def test_bad_params_are_422(client, admin, path):
    bad = [{"date_from": "not-a-date"}, {"date_from": "2026-02-01", "date_to": "2026-01-01"}, {"tab": "everything"},
           {"audience": "robots"}, {"direction": "sideways"}, {"spaced": "maybe"}, {"user_id": "abc"},
           {"min_frequency": "x"}, {"min_set_words": -1}, {"min_word_attempts": -5}, {"split_by_direction": "maybe"}]
    for params in bad:
        if path == "options" and not set(params) & {"include_quiz"}:
            continue  # options takes only include_quiz
        assert get(client, admin, path, **params).status_code == 422, (path, params)
    if path == "options":
        assert get(client, admin, path, include_quiz="maybe").status_code == 422
