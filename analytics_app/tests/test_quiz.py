import sqlite3
from dataclasses import replace

import pytest

from analytics_app import db, queries
from analytics_app.filters import DIRECTION_SQL, QUIZ_VARIANTS, Filters, variant_direction_sql
from analytics_app.widgets import filter_bar
from fixture_db import att, build_analytics_db, connect, quiz, set_ev

HAW_ENG = filter_bar.DIRECTIONS["Hawaiian → English"]
ENG_HAW = filter_bar.DIRECTIONS["English → Hawaiian"]
TOTAL = Filters(modes=frozenset({"flashcards", "writing"}))
TOTAL_Q = Filters(modes=frozenset({"flashcards", "writing", "quiz"}), include_quiz=True)


def data(tmp_path):
    sets = [
        set_ev("v1", "set_opened", mode="flashcards", variant="hawaiian", key="s1"),
        set_ev("v1", "set_opened", mode="quiz", variant=None, key="quizonly", at="2026-02-01 10:00:00"),
        set_ev("v2", "set_opened", mode="quiz", variant=None, key="s1"),
    ]
    attempts = [
        att("v1", "a", "correct", mode="flashcards", variant="hawaiian"),
        att("v1", "b", "incorrect", mode="flashcards", variant="english"),
        att("v1", "a", "incorrect", mode="quiz", variant="writing_to_eng", key="quizonly", at="2026-02-01 10:00:00"),
        att("v1", "b", "correct", mode="quiz", variant="mc_to_haw", key="quizonly", at="2026-02-01 10:00:00"),
        att("v2", "c", "incorrect", mode="quiz", variant="connect_to_eng"),
    ]
    quizzes = [
        quiz("v1", "2026-01-02 10:00:00", score=4.0, w=(2, 2), mc=(2, 1), cn=(1, 0.5)),
        quiz("v1", "2026-01-02 12:00:00", score=5.0, w=(2, 2), mc=(2, 2), cn=(1, 1.0)),
        quiz("v2", "2026-02-01 10:00:00", key="quizonly", score=2.5, w=(2, 1), mc=(2, 0), cn=(1, 1.5)),
    ]
    return connect(tmp_path, sets, attempts, quizzes)


def modes_of(result):
    return {r["mode"] for r in result.rows}


def test_total_default_excludes_quiz_and_toggle_adds(tmp_path):
    conn = data(tmp_path)
    assert modes_of(queries.set_difficulty(conn, TOTAL)) == {"flashcards"}
    assert modes_of(queries.set_difficulty(conn, TOTAL_Q)) == {"flashcards", "quiz"}
    assert sum(r["opened"] for r in queries.funnel(conn, TOTAL)) == 1
    assert sum(r["opened"] for r in queries.funnel(conn, TOTAL_Q)) == 3


def test_filter_options_toggle(tmp_path):
    conn = data(tmp_path)
    off, on = queries.filter_options(conn), queries.filter_options(conn, include_quiz=True)
    assert off["set_keys"] == ["s1"] and on["set_keys"] == ["quizonly", "s1"]
    assert off["variants"] == ["english", "hawaiian"]
    assert "writing_to_eng" in on["variants"]
    assert off["date_max"] == "2026-01-02" and on["date_max"] == "2026-02-01"


def test_day_range_excludes_quiz_days_when_off(tmp_path):
    conn = data(tmp_path)
    assert queries._day_range(conn, Filters())[-1] == "2026-01-02"
    assert queries._day_range(conn, Filters(include_quiz=True))[-1] == "2026-02-01"


def test_funnel_null_quiz_variant(tmp_path):
    conn = data(tmp_path)
    quiz_only = replace(TOTAL_Q, mode="quiz", modes=None)
    assert sum(r["opened"] for r in queries.funnel(conn, quiz_only)) == 2     # "All": counted
    assert queries.funnel(conn, replace(quiz_only, variants=HAW_ENG)) == []   # preset: excluded


def words(conn, f):
    return {(r["word_hawaiian"], r["mode"]): r["attempts"] for r in queries.word_difficulty(conn, f).rows}


def test_hardest_words_per_preset(tmp_path):
    conn = data(tmp_path)
    base = replace(Filters(), mode="quiz", include_quiz=True)
    assert words(conn, base) == {("a", "quiz"): 1, ("b", "quiz"): 1, ("c", "quiz"): 1}
    assert words(conn, replace(base, variants=HAW_ENG)) == {("a", "quiz"): 1, ("c", "quiz"): 1}
    assert words(conn, replace(base, variants=ENG_HAW)) == {("b", "quiz"): 1}


def test_total_plus_quiz_plus_hawaiian_to_english(tmp_path):
    conn = data(tmp_path)
    f = replace(TOTAL_Q, variants=HAW_ENG)
    assert words(conn, f) == {("a", "flashcards"): 1, ("a", "quiz"): 1, ("c", "quiz"): 1}


def test_quiz_queries_hand_counted(tmp_path):
    conn = data(tmp_path)
    f = Filters()
    trend = queries.quiz_score_trend(conn, f)
    assert [(r["day"], r["quizzes"]) for r in trend] == [("2026-01-02", 2), ("2026-02-01", 1)]
    assert trend[0]["avg_pct"] == pytest.approx(90.0)       # (80% + 100%) / 2
    assert trend[1]["avg_pct"] == pytest.approx(50.0)
    types = {r["question_type"]: r for r in queries.quiz_type_accuracy(conn, f)}
    assert (types["writing"]["total"], types["writing"]["correct"]) == (6, 5)
    assert types["writing"]["accuracy"] == pytest.approx(100 * 5 / 6)
    assert (types["mc"]["total"], types["mc"]["correct"]) == (6, 3)
    assert (types["connect"]["total"], types["connect"]["correct"]) == (3, 3.0)
    results = queries.quiz_results_list(conn, f)
    assert [r["occurred_at"][:10] for r in results.rows] == ["2026-02-01", "2026-01-02", "2026-01-02"]
    only = Filters(set_key="quizonly")
    assert len(queries.quiz_results_list(conn, only).rows) == 1
    assert queries.quiz_type_accuracy(conn, only)[0]["total"] == 2


def test_quiz_results_queries_ignore_variants(tmp_path):
    conn = data(tmp_path)
    preset = Filters(variants=ENG_HAW, mode="quiz", min_frequency=9)
    assert queries.quiz_score_trend(conn, preset) == queries.quiz_score_trend(conn, Filters())
    assert queries.quiz_type_accuracy(conn, preset) == queries.quiz_type_accuracy(conn, Filters())
    assert queries.quiz_results_list(conn, preset) == queries.quiz_results_list(conn, Filters())


VARIANT_DIRECTION = [
    ("hawaiian", "hawaiian_to_english"), ("english", "english_to_hawaiian"),
    ("to_hawaiian", "english_to_hawaiian"), ("writing_to_eng", "hawaiian_to_english"),
    ("mc_to_eng", "hawaiian_to_english"), ("connect_to_eng", "hawaiian_to_english"),
    ("writing_to_haw", "english_to_hawaiian"), ("mc_to_haw", "english_to_hawaiian"),
    ("connect_to_haw", "english_to_hawaiian"), ("xto_eng", "unknown"), ("weird", "unknown"), (None, "unknown"),
]


@pytest.mark.parametrize("variant,expected", VARIANT_DIRECTION)
def test_variant_direction_sql_mapping(variant, expected):
    conn = sqlite3.connect(":memory:")
    assert conn.execute(f"SELECT {DIRECTION_SQL} FROM (SELECT ? AS variant)", (variant,)).fetchone()[0] == expected
    assert conn.execute(f"SELECT {variant_direction_sql('v')} FROM (SELECT ? AS v)", (variant,)).fetchone()[0] == expected


def test_presets_consistent_with_sql_direction():
    conn = sqlite3.connect(":memory:")
    for preset, direction in ((HAW_ENG, "hawaiian_to_english"), (ENG_HAW, "english_to_hawaiian")):
        for variant in preset:
            got = conn.execute(f"SELECT {DIRECTION_SQL} FROM (SELECT ? AS variant)", (variant,)).fetchone()[0]
            assert got == direction, variant
    assert filter_bar.DIRECTIONS["All"] is None
    assert QUIZ_VARIANTS["hawaiian_to_english"] <= HAW_ENG and QUIZ_VARIANTS["english_to_hawaiian"] <= ENG_HAW


def test_missing_quiz_table_is_gated(tmp_path):
    conn = connect(tmp_path, [set_ev("v1", "set_opened")], [att("v1", "a", "correct")])
    assert db.has_quiz_data(conn) is False
    f = Filters()
    assert queries.quiz_score_trend(conn, f) == [] and queries.quiz_type_accuracy(conn, f) == []
    assert queries.quiz_results_list(conn, f).rows == []
    assert queries.filter_options(conn, include_quiz=True)["set_keys"] == ["s1"]
    db.validate_schema(conn)    # old exports still open


def test_quiz_queries_do_not_need_quiz_views(tmp_path):
    path = build_analytics_db(tmp_path / "a.db", quiz_rows=[quiz("v1")])
    raw = sqlite3.connect(path)
    raw.execute("DROP VIEW IF EXISTS v_quiz_summary")
    raw.commit()
    raw.close()
    conn = db.open_readonly(path)
    assert db.has_quiz_data(conn) is True
    assert len(queries.quiz_results_list(conn, Filters()).rows) == 1


def test_quiz_tab_ignores_level_filter(tmp_path):
    conn = data(tmp_path)
    base = replace(Filters(), mode="quiz", include_quiz=True)
    assert words(conn, replace(base, min_frequency=9)) == {}
    assert words(conn, replace(base, min_frequency=None)) == {("a", "quiz"): 1, ("b", "quiz"): 1, ("c", "quiz"): 1}
