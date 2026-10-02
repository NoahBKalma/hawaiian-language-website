from datetime import date

import pytest

from analytics_app import queries
from analytics_app.filters import Filters
from fixture_db import att, connect, set_ev

HAW, ENG, TOH = "hawaiian", "english", "to_hawaiian"


def sets_of(conn, **kw):
    return queries.set_difficulty(conn, Filters(**kw))


def one(rows):
    assert len(rows) == 1, rows
    return rows[0]


def funnel_of(conn, **kw):
    return queries.funnel(conn, Filters(**kw))


def by_direction(rows):
    return {r["direction"]: r for r in rows}


# ---- one test per filter group: every dimension changes the tabs that have it

def rich(tmp_path):
    sets = [
        set_ev("v1", "set_opened", "2026-01-02 10:00:00", source="account", user=1),
        set_ev("v2", "set_opened", "2026-01-09 10:00:00", key="s2", level=3, mode="flashcards", variant=HAW),
    ]
    atts = [
        att("v1", "a", "correct", "2026-01-02 10:00:00", source="account", user=1),
        att("v2", "a", "incorrect", "2026-01-09 10:00:00", key="s2", level=3, mode="flashcards", variant=HAW),
        att("v2", "b", "incorrect", "2026-01-09 10:01:00", key="s2", level=3, mode="flashcards", variant=HAW),
    ]
    return connect(tmp_path, sets, atts)


@pytest.mark.parametrize("kw", [
    dict(visitor_id="v1"), dict(set_key="s2"), dict(min_frequency=3), dict(mode="flashcards"),
    dict(date_to=date(2026, 1, 5)), dict(sources=frozenset({"account"})), dict(user_id=1),
    dict(variants=frozenset({HAW})),
])
def test_every_filter_changes_every_tab(tmp_path, kw):
    conn = rich(tmp_path)
    base = Filters()
    f = Filters(**kw)
    assert queries.set_difficulty(conn, f).rows != queries.set_difficulty(conn, base).rows
    assert queries.word_difficulty(conn, f).rows != queries.word_difficulty(conn, base).rows
    assert queries.funnel(conn, f) != queries.funnel(conn, base)
    assert queries.activity_by_day(conn, f) != queries.activity_by_day(conn, base)


# ---- (a) first try before the window, later miss inside it

def test_a_first_try_before_window_is_not_recreated(tmp_path):
    conn = connect(tmp_path, [], [att("v1", "w", "correct", "2026-01-01 10:00:00"),
                                  att("v1", "w", "incorrect", "2026-01-05 10:00:00")])
    row = one(sets_of(conn, date_from=date(2026, 1, 3)).rows)
    assert (row["attempts"], row["incorrect"]) == (1, 1)
    assert (row["words_seen"], row["first_try_correct_words"]) == (0, 0)
    assert row["first_pass_incorrect_rate"] is None
    full = one(sets_of(conn).rows)
    assert (full["words_seen"], full["first_try_correct_words"]) == (1, 1)


# ---- (b) deleted vs anonymous

def test_b_audience(tmp_path):
    conn = connect(tmp_path, [], [att("v1", "w", "correct", source="deleted"),
                                  att("v2", "w", "incorrect", source="anonymous"),
                                  att("v3", "w", "correct", source="account", user=4)])
    for sources, attempts, correct in (({"deleted"}, 1, 1), ({"anonymous"}, 1, 0), ({"account"}, 1, 1),
                                       ({"deleted", "anonymous"}, 2, 1)):
        row = one(sets_of(conn, sources=frozenset(sources)).rows)
        assert (row["attempts"], row["correct"]) == (attempts, correct), sources
    assert sets_of(conn, sources=frozenset()).rows == []


# ---- (c) variant

def test_c_variant(tmp_path):
    conn = connect(tmp_path, [], [att("v1", "w", "correct", "2026-01-02 10:00:00", variant=HAW),
                                  att("v2", "w", "incorrect", "2026-01-02 10:00:00", variant=ENG)])
    assert one(sets_of(conn, variants=frozenset({HAW})).rows)["correct"] == 1
    assert one(sets_of(conn, variants=frozenset({ENG})).rows)["incorrect"] == 1
    assert one(sets_of(conn, variants=frozenset({HAW, ENG})).rows)["attempts"] == 2


# ---- (d) min-sample

def two_decks(tmp_path):
    return connect(tmp_path, [set_ev("v1", "set_opened"), set_ev("v1", "set_started")], [
        att("v1", "a", "correct"), att("v1", "b", "incorrect"), att("v1", "a", "incorrect", key="s2")])


def test_d_min_sample_hides_rows(tmp_path):
    conn = two_decks(tmp_path)
    result = sets_of(conn, min_set_words=2)
    assert [r["set_key"] for r in result.rows] == ["s1"] and result.hidden_count == 1
    words = queries.word_difficulty(conn, Filters(min_word_attempts=1))
    assert len(words.rows) == 3 and words.hidden_count == 0
    words = queries.word_difficulty(conn, Filters(min_word_attempts=2))
    assert words.rows == [] and words.hidden_count == 3


@pytest.mark.parametrize("kw", [dict(min_set_words=5, min_word_attempts=5), dict(split_by_direction=True)])
def test_d_funnel_and_activity_ignore_min_sample_and_split(tmp_path, kw):
    conn = two_decks(tmp_path)
    base = Filters()
    changed = Filters(**kw)
    assert queries.funnel(conn, changed) == queries.funnel(conn, base)
    assert queries.funnel_lists(conn, changed) == queries.funnel_lists(conn, base)
    assert queries.activity_by_day(conn, changed) == queries.activity_by_day(conn, base)


def test_d_split_does_not_change_tab_counts_but_min_sample_does_not_touch_other_tab(tmp_path):
    conn = two_decks(tmp_path)
    assert queries.word_difficulty(conn, Filters(min_set_words=99)).rows == queries.word_difficulty(
        conn, Filters()).rows
    assert queries.set_difficulty(conn, Filters(min_word_attempts=99)).rows == queries.set_difficulty(
        conn, Filters()).rows


# ---- (e) anonymous then account

def test_e_source_filter_applies_to_the_first_try_row(tmp_path):
    conn = connect(tmp_path, [], [att("v1", "w", "incorrect", "2026-01-01 10:00:00"),
                                  att("v1", "w", "correct", "2026-01-02 10:00:00", source="account", user=1)])
    row = one(sets_of(conn, sources=frozenset({"account"})).rows)
    assert (row["attempts"], row["words_seen"]) == (1, 0)
    row = one(sets_of(conn, sources=frozenset({"anonymous"})).rows)
    assert (row["attempts"], row["words_seen"], row["first_try_correct_words"]) == (1, 1, 0)


# ---- (f) funnel under audience filters

def test_f_funnel_by_source(tmp_path):
    conn = connect(tmp_path, [
        set_ev("v1", "set_opened", "2026-01-02 10:00:00"),
        set_ev("v1", "set_started", "2026-01-02 10:05:00", source="account", user=1),
        set_ev("v2", "set_opened"),
        set_ev("v3", "set_opened"), set_ev("v3", "set_started"), set_ev("v3", "set_completed")])
    account = one(funnel_of(conn, sources=frozenset({"account"})))
    assert (account["opened"], account["started"], account["completed"]) == (1, 1, 0)
    assert account["started_not_completed"] == 1
    _, detail, _ = queries.funnel_lists(conn, Filters(sources=frozenset({"account"})))
    assert [(r["visitor_id"], r["status"]) for r in detail] == [("v1", "started")]
    anon = one(funnel_of(conn, sources=frozenset({"anonymous"})))
    assert (anon["opened"], anon["started"], anon["completed"]) == (2, 1, 1)
    assert (anon["opened_not_started"], anon["started_not_completed"]) == (1, 0)


# ---- (g) cohort anchor is the earliest event of any type

def test_g_started_without_opened_and_cohort_anchor(tmp_path):
    conn = connect(tmp_path, [
        set_ev("v1", "set_started", "2026-01-05 10:00:00"),
        set_ev("v2", "set_opened", "2026-01-01 10:00:00"),
        set_ev("v2", "set_started", "2026-01-10 10:00:00")])
    row = one(funnel_of(conn, date_from=date(2026, 1, 5)))
    assert (row["opened"], row["started"]) == (1, 1)              # v1 only
    assert funnel_of(conn, date_to=date(2026, 1, 4))[0]["opened"] == 1
    row = one(funnel_of(conn, date_to=date(2026, 1, 2)))          # v2: later start still counted
    assert (row["opened"], row["started"]) == (1, 1)
    assert funnel_of(conn, date_from=date(2026, 1, 6), date_to=date(2026, 1, 9)) == []


# ---- (h) variant switch inside one deck

def test_h_variant_switch(tmp_path):
    conn = connect(tmp_path, [
        set_ev("v1", "set_opened", "2026-01-01 10:00:00", variant=HAW),
        set_ev("v1", "set_started", "2026-01-01 11:00:00", variant=ENG)], [
        att("v1", "w", "incorrect", "2026-01-01 10:30:00", variant=HAW),
        att("v1", "w", "correct", "2026-01-01 11:30:00", variant=ENG)])
    assert one(funnel_of(conn))["opened"] == 1
    assert one(funnel_of(conn, variants=frozenset({HAW})))["started"] == 1
    assert funnel_of(conn, variants=frozenset({ENG})) == []
    eng = one(sets_of(conn, variants=frozenset({ENG})).rows)
    assert (eng["attempts"], eng["correct"], eng["words_seen"]) == (1, 1, 0)
    haw = one(sets_of(conn, variants=frozenset({HAW})).rows)
    assert (haw["attempts"], haw["words_seen"], haw["first_try_correct_words"]) == (1, 1, 0)


# ---- (i) direction presets, split off

def test_i_direction_presets(tmp_path):
    kw = dict(mode="flashcards")
    conn = connect(tmp_path, [], [
        att("v1", "w", "correct", "2026-01-01 10:00:00", variant=HAW, **kw),
        att("v1", "w", "incorrect", "2026-01-01 11:00:00", variant=ENG, **kw),
        att("v2", "w", "incorrect", "2026-01-01 10:00:00", variant=ENG, **kw)])
    h2e = one(sets_of(conn, variants=frozenset({HAW})).rows)
    assert (h2e["attempts"], h2e["words_seen"], h2e["first_try_correct_words"]) == (1, 1, 1)
    e2h = one(sets_of(conn, variants=frozenset({ENG, TOH})).rows)
    assert (e2h["attempts"], e2h["words_seen"], e2h["first_try_correct_words"]) == (2, 1, 0)
    everything = one(sets_of(conn).rows)
    assert (everything["attempts"], everything["words_seen"], everything["first_try_correct_words"]) == (3, 2, 1)


# ---- (j)-(l) split by direction

def both_directions(tmp_path):
    return connect(tmp_path, [], [
        att("v1", "w", "incorrect", "2026-01-01 10:00:00", mode="flashcards", variant=HAW),
        att("v1", "w", "correct", "2026-01-01 11:00:00", mode="flashcards", variant=ENG)])


def test_j_split_on_vs_off(tmp_path):
    conn = both_directions(tmp_path)
    on = by_direction(sets_of(conn, split_by_direction=True).rows)
    assert set(on) == {"hawaiian_to_english", "english_to_hawaiian"}
    assert (on["hawaiian_to_english"]["words_seen"], on["hawaiian_to_english"]["first_try_correct_words"]) == (1, 0)
    assert (on["english_to_hawaiian"]["words_seen"], on["english_to_hawaiian"]["first_try_correct_words"]) == (1, 1)
    assert on["hawaiian_to_english"]["first_pass_incorrect_rate"] == 1.0
    assert on["english_to_hawaiian"]["first_pass_incorrect_rate"] == 0.0
    off = one(sets_of(conn).rows)
    assert (off["words_seen"], off["first_try_correct_words"]) == (1, 0)
    assert sum(r["words_seen"] for r in on.values()) > off["words_seen"]
    assert sum(r["attempts"] for r in on.values()) == off["attempts"] == 2
    words = by_direction(queries.word_difficulty(conn, Filters(split_by_direction=True)).rows)
    assert words["english_to_hawaiian"]["first_try_correct_words"] == 1
    assert words["hawaiian_to_english"]["incorrect"] == 1


def test_k_split_with_direction_preset(tmp_path):
    conn = both_directions(tmp_path)
    rows = sets_of(conn, split_by_direction=True, variants=frozenset({ENG, TOH})).rows
    row = one(rows)
    assert row["direction"] == "english_to_hawaiian"
    assert (row["words_seen"], row["first_try_correct_words"]) == (1, 1)
    assert one(sets_of(conn, variants=frozenset({ENG, TOH})).rows)["words_seen"] == 0


def test_l_split_with_mode(tmp_path):
    conn = connect(tmp_path, [], [
        att("v1", "w", "incorrect", "2026-01-01 10:00:00", mode="flashcards", variant=HAW),
        att("v1", "w", "correct", "2026-01-01 11:00:00", mode="flashcards", variant=ENG),
        att("v1", "w", "correct", "2026-01-01 12:00:00", mode="writing", variant=TOH)])
    cards = sets_of(conn, split_by_direction=True, mode="flashcards").rows
    assert {r["direction"] for r in cards} == {"hawaiian_to_english", "english_to_hawaiian"}
    assert all(r["mode"] == "flashcards" for r in cards)
    writing = one(sets_of(conn, split_by_direction=True, mode="writing").rows)
    assert writing["direction"] == "english_to_hawaiian" and writing["attempts"] == 1


# ---- (m) writing mode

@pytest.mark.parametrize("split", [False, True])
def test_m_writing_mode(tmp_path, split):
    conn = connect(tmp_path, [], [
        att("v1", "w", "correct", mode="writing", variant=TOH),
        att("v1", "x", "incorrect", mode="writing", variant=TOH),
        att("v1", "w", "correct", mode="flashcards", variant=HAW)])
    rows = sets_of(conn, mode="writing", split_by_direction=split).rows
    row = one(rows)
    assert row["mode"] == "writing" and (row["attempts"], row["correct"], row["incorrect"]) == (2, 1, 1)
    if split:
        assert row["direction"] == "english_to_hawaiian"
    assert all(r["mode"] == "writing" for r in queries.word_difficulty(conn, Filters(mode="writing")).rows)


# ---- (n) NULL variant

def test_n_null_variant_is_unknown(tmp_path):
    conn = connect(tmp_path, [], [
        att("v1", "w", "correct", mode="flashcards", variant=None),
        att("v1", "w", "incorrect", mode="writing", variant=None)])
    rows = sets_of(conn, split_by_direction=True).rows
    assert {r["direction"] for r in rows} == {"unknown"} and len(rows) == 2
    writing = one(sets_of(conn, split_by_direction=True, mode="writing").rows)
    assert writing["direction"] == "unknown" and writing["incorrect"] == 1


# ---- (o) (none)

def test_o_none_variant_entry(tmp_path):
    conn = connect(tmp_path, [
        set_ev("v1", "set_opened", variant=HAW),
        set_ev("v2", "set_opened", variant=None)], [
        att("v1", "w", "correct", variant=HAW),
        att("v2", "w", "incorrect", variant=None)])
    only = sets_of(conn, variants=frozenset({HAW})).rows
    assert (one(only)["attempts"], one(only)["words_seen"]) == (1, 1)
    both = one(sets_of(conn, variants=frozenset({HAW, None})).rows)
    assert (both["attempts"], both["words_seen"]) == (2, 2)
    assert one(sets_of(conn, variants=frozenset({None})).rows)["incorrect"] == 1
    assert one(funnel_of(conn, variants=frozenset({HAW})))["opened"] == 1
    assert one(funnel_of(conn, variants=frozenset({HAW, None})))["opened"] == 2
    assert one(funnel_of(conn, variants=frozenset({None})))["opened"] == 1


def test_filter_options_are_unfiltered(tmp_path):
    conn = rich(tmp_path)
    options = queries.filter_options(conn)
    assert options == {"set_keys": ["s1", "s2"], "min_frequencies": [1, 3], "variants": ["hawaiian", "to_hawaiian"],
                       "date_min": "2026-01-02", "date_max": "2026-01-09"}
