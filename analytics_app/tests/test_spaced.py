"""The Spaced filter (attempt_events.is_spaced) and exports that predate the column."""
from analytics_app import db, queries
from analytics_app.filters import Filters
from analytics_app.widgets.filter_bar import SPACED
from fixture_db import att, connect

V = "v1"


def rows():
    return [
        # normal: aloha first try wrong, retried right; mahalo first try right
        att(V, "aloha", "incorrect", "2026-01-02 10:00:00"),
        att(V, "aloha", "correct", "2026-01-02 10:01:00", retry=True),
        att(V, "mahalo", "correct", "2026-01-02 10:02:00"),
        # spaced: aloha first try right (a later row), mahalo wrong, a hint
        att(V, "aloha", "correct", "2026-01-03 10:00:00", spaced=True),
        att(V, "mahalo", "incorrect", "2026-01-03 10:01:00", spaced=True),
        att(V, "mahalo", "gave_up", "2026-01-03 10:02:00", spaced=True, retry=True),
        att(V, "mahalo", "hint_letter", "2026-01-03 10:03:00", spaced=True),
    ]


def word(result, name):
    return next(r for r in result.rows if r["word_hawaiian"] == name)


def test_default_counts_everything_and_reports_spaced_split(tmp_path):
    conn = connect(tmp_path, attempt_rows=rows())
    aloha = word(queries.word_difficulty(conn, Filters()), "aloha")
    assert (aloha["attempts"], aloha["spaced_attempts"], aloha["spaced_incorrect"]) == (3, 1, 0)
    mahalo = word(queries.word_difficulty(conn, Filters()), "mahalo")
    assert (mahalo["attempts"], mahalo["incorrect"], mahalo["spaced_attempts"], mahalo["spaced_incorrect"]) == (3, 2, 2, 2)
    deck = queries.set_difficulty(conn, Filters()).rows[0]
    assert (deck["attempts"], deck["spaced_attempts"], deck["spaced_incorrect"]) == (6, 3, 2)


def test_not_spaced_equals_today_for_normal_rows(tmp_path):
    normal_only = [r for r in rows() if not r["is_spaced"]]
    full = connect(tmp_path, attempt_rows=rows())
    (tmp_path / "ref").mkdir()
    reference = connect(tmp_path / "ref", attempt_rows=normal_only)
    got = queries.word_difficulty(full, Filters(spaced="normal")).rows
    want = queries.word_difficulty(reference, Filters()).rows
    drop = lambda rs: [{k: v for k, v in r.items() if not k.startswith("spaced_")} for r in rs]
    assert drop(got) == drop(want)
    # first try is judged among normal rows only: aloha's first try was wrong, mahalo's right
    assert (word(queries.word_difficulty(full, Filters(spaced="normal")), "aloha")["first_try_correct_words"],
            word(queries.word_difficulty(full, Filters(spaced="normal")), "mahalo")["first_try_correct_words"]) == (0, 1)


def test_spaced_only_first_try_and_retries(tmp_path):
    conn = connect(tmp_path, attempt_rows=rows())
    f = Filters(spaced="spaced")
    result = queries.word_difficulty(conn, f)
    aloha, mahalo = word(result, "aloha"), word(result, "mahalo")
    assert (aloha["attempts"], aloha["words_seen"], aloha["first_try_correct_words"]) == (1, 1, 1)
    assert (mahalo["attempts"], mahalo["incorrect"], mahalo["gave_up"], mahalo["hints"],
            mahalo["retry_attempts"], mahalo["first_try_correct_words"]) == (2, 2, 1, 1, 1, 0)
    deck = queries.set_difficulty(conn, f).rows[0]
    assert (deck["attempts"], deck["words_seen"], deck["first_try_correct_words"]) == (3, 2, 1)
    assert sum(d["attempts"] for d in queries.activity_by_day(conn, f)) == 3
    assert sum(d["attempts"] for d in queries.activity_by_day(conn, Filters(spaced="normal"))) == 3


def test_old_export_without_is_spaced_opens_and_ignores_filter(tmp_path):
    old = [{k: v for k, v in r.items() if k != "is_spaced"} for r in rows() if not r["is_spaced"]]
    conn = connect(tmp_path, attempt_rows=old, old_attempts=True)
    assert db.validate_schema(conn) == []
    assert db.has_spaced_data(conn) is False
    assert queries.filter_options(conn)["has_spaced"] is False
    plain = queries.word_difficulty(conn, Filters()).rows
    assert "spaced_attempts" not in plain[0]
    assert queries.word_difficulty(conn, Filters(spaced="spaced")).rows == plain
    assert queries.set_difficulty(conn, Filters(spaced="normal")).rows == queries.set_difficulty(conn, Filters()).rows
    assert queries.activity_by_day(conn, Filters(spaced="spaced")) == queries.activity_by_day(conn, Filters())


def test_new_export_exposes_filter_option(tmp_path):
    conn = connect(tmp_path, attempt_rows=rows())
    assert db.has_spaced_data(conn) is True
    assert queries.filter_options(conn)["has_spaced"] is True
    assert set(SPACED.values()) == {None, "normal", "spaced"}
