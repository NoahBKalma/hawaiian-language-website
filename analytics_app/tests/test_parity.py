"""A bare Filters() must reproduce the SQL views row for row."""
import pytest

from analytics_app import queries
from analytics_app.filters import Filters
from fixture_db import att, connect, set_ev

V1, V2, V3 = "v1", "v2", "v3"


def scenario():
    sets = [
        set_ev(V1, "set_opened", "2026-01-02 10:00:00"),
        set_ev(V1, "set_started", "2026-01-02 10:05:00", source="account", user=7),
        set_ev(V2, "set_opened", "2026-01-02 11:00:00"),
        set_ev(V3, "set_opened", "2026-01-03 09:00:00"),
        set_ev(V3, "set_started", "2026-01-03 09:01:00"),
        set_ev(V3, "set_completed", "2026-01-03 09:20:00"),
        set_ev("v4", "set_started", "2026-01-04 08:00:00"),                    # no set_opened
        set_ev(V1, "set_opened", "2026-01-02 12:00:00", level=3),
        set_ev(V1, "set_opened", "2026-01-02 12:30:00", mode="flashcards", variant="hawaiian"),
        set_ev(V2, "set_opened", "2026-01-05 12:30:00", key="s2", variant="english", mode="flashcards"),
    ]
    attempts = [
        att(V1, "aloha", "correct", "2026-01-02 10:01:00"),
        att(V1, "mahalo", "incorrect", "2026-01-02 10:02:00"),
        att(V1, "mahalo", "correct_helped", "2026-01-02 10:03:00"),
        att(V1, "ʻohana", "hint_blanks", "2026-01-02 10:04:00"),
        att(V1, "ʻohana", "gave_up", "2026-01-02 10:04:30"),
        att(V1, "ʻohana", "correct_helped", "2026-01-02 10:06:00", retry=True),
        att(V1, "aloha", "incorrect", "2026-01-02 12:31:00", mode="flashcards", variant="hawaiian"),
        att(V1, "aloha", "correct", "2026-01-02 12:32:00", mode="flashcards", variant="hawaiian"),
        att(V2, "aloha", "correct", "2026-01-02 12:33:00", mode="flashcards", variant="english",
            source="account", user=9),
        att(V2, "aloha", "incorrect", "2026-01-03 12:33:00", mode="flashcards", variant="hawaiian"),
        att(V2, "aloha", "hint_letter", "2026-01-03 13:00:00", key="s2", level=3, variant=None),
        att(V3, "aloha", "correct", "2026-01-04 13:00:00", key="s2", level=3, variant=None),
        att(V3, "aloha", "incorrect", "2026-01-04 13:00:00", key="s2", level=3, variant="to_hawaiian"),
    ]
    return sets, attempts


def view_rows(conn, view, keys):
    return {tuple(r[k] for k in keys): dict(r) for r in conn.execute(f"SELECT * FROM {view}")}


def assert_same(actual, expected, keys):
    got = {tuple(r[k] for k in keys): r for r in actual}
    assert got.keys() == expected.keys()
    for key, row in expected.items():
        for column, value in row.items():
            if column in keys:
                continue
            if value is None:
                assert got[key][column] is None, (key, column)
            elif isinstance(value, float):
                assert got[key][column] == pytest.approx(value), (key, column)
            else:
                assert got[key][column] == value, (key, column)


DECK = ("set_key", "mode", "min_frequency")


def test_set_difficulty_matches_view(tmp_path):
    conn = connect(tmp_path, *scenario())
    result = queries.set_difficulty(conn, Filters())
    assert result.hidden_count == 0 and not result.truncated
    assert_same(result.rows, view_rows(conn, "v_set_accuracy", DECK), DECK)


def test_word_difficulty_matches_view(tmp_path):
    conn = connect(tmp_path, *scenario())
    keys = ("word_hawaiian",) + DECK
    result = queries.word_difficulty(conn, Filters())
    assert_same(result.rows, view_rows(conn, "v_word_accuracy", keys), keys)


def test_funnel_matches_view(tmp_path):
    conn = connect(tmp_path, *scenario())
    assert_same(queries.funnel(conn, Filters()), view_rows(conn, "v_set_funnel", DECK), DECK)


def test_funnel_lists_match_view(tmp_path):
    conn = connect(tmp_path, *scenario())
    view = view_rows(conn, "v_set_funnel", DECK)
    rollup, detail, truncated = queries.funnel_lists(conn, Filters())
    assert not truncated
    for row in rollup:
        expected = view[tuple(row[k] for k in DECK)]
        assert row["opened_not_started"] == expected["opened_not_started"]
        assert row["started_not_completed"] == expected["started_not_completed"]
    assert len(detail) == len(conn.execute("SELECT * FROM v_set_status WHERE status != 'completed'").fetchall())
    started = [r["started_not_completed"] for r in rollup]
    assert started == sorted(started, reverse=True)


def test_split_off_still_equals_views_with_both_directions(tmp_path):
    # V2 studies the same deck + word in both directions: unsplit first try must stay per browser + word
    conn = connect(tmp_path, *scenario())
    rows = queries.set_difficulty(conn, Filters(split_by_direction=False)).rows
    assert all("direction" not in r for r in rows)
    assert_same(rows, view_rows(conn, "v_set_accuracy", DECK), DECK)
