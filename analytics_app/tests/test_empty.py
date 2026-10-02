from datetime import date

import pytest

from analytics_app import queries
from analytics_app.filters import Filters
from fixture_db import connect


@pytest.mark.parametrize("split", [False, True])
def test_empty_database(tmp_path, split):
    conn = connect(tmp_path)
    f = Filters(split_by_direction=split, min_set_words=20, min_word_attempts=5)
    assert queries.set_difficulty(conn, f) == queries.Result([], 0, False)
    assert queries.word_difficulty(conn, f) == queries.Result([], 0, False)
    assert queries.funnel(conn, f) == []
    assert queries.funnel_lists(conn, f) == ([], [], False)
    assert queries.activity_by_day(conn, f) == []
    options = queries.filter_options(conn)
    assert options["date_min"] is None and options["date_max"] is None
    assert options["set_keys"] == [] and options["min_frequencies"] == [] and options["variants"] == []


def test_empty_database_with_range_zero_fills(tmp_path):
    rows = queries.activity_by_day(connect(tmp_path), Filters(date_from=date(2026, 1, 1), date_to=date(2026, 1, 2)))
    assert [(r["day"], r["opens"], r["starts"], r["attempts"]) for r in rows] == [
        ("2026-01-01", 0, 0, 0), ("2026-01-02", 0, 0, 0)]
