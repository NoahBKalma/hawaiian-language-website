from datetime import date

from analytics_app import queries
from analytics_app.filters import Filters
from fixture_db import att, connect, set_ev


def build(tmp_path):
    return connect(tmp_path, [
        set_ev("v1", "set_opened", "2026-01-01 10:00:00"),
        set_ev("v1", "set_opened", "2026-01-01 11:00:00"),                    # same visitor + deck + day
        set_ev("v1", "set_started", "2026-01-01 10:05:00"),
        set_ev("v1", "set_started", "2026-01-01 10:06:00"),                   # still one start
        set_ev("v1", "set_started", "2026-01-01 10:07:00", key="s2"),         # other deck
        set_ev("v2", "set_started", "2026-01-01 12:00:00"),
        set_ev("v2", "set_opened", "2026-01-04 12:00:00"),
    ], [
        att("v1", "a", "correct", "2026-01-01 10:01:00"),
        att("v1", "a", "hint_letter", "2026-01-01 10:02:00"),                 # hints are not attempts
        att("v1", "b", "gave_up", "2026-01-04 10:02:00"),
    ])


def test_counts_and_zero_fill(tmp_path):
    rows = queries.activity_by_day(build(tmp_path), Filters())
    assert [r["day"] for r in rows] == ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]
    assert rows[0] == {"day": "2026-01-01", "opens": 1, "starts": 3, "attempts": 1}
    assert rows[1] == {"day": "2026-01-02", "opens": 0, "starts": 0, "attempts": 0}
    assert rows[3] == {"day": "2026-01-04", "opens": 1, "starts": 0, "attempts": 1}


def test_range_zero_fills_outside_the_data(tmp_path):
    rows = queries.activity_by_day(build(tmp_path), Filters(date_from=date(2025, 12, 31), date_to=date(2026, 1, 2)))
    assert [r["day"] for r in rows] == ["2025-12-31", "2026-01-01", "2026-01-02"]
    assert rows[0]["opens"] == rows[0]["starts"] == rows[0]["attempts"] == 0
    assert rows[1]["starts"] == 3


def test_open_ended_range_uses_data_bounds(tmp_path):
    rows = queries.activity_by_day(build(tmp_path), Filters(date_from=date(2026, 1, 3)))
    assert [r["day"] for r in rows] == ["2026-01-03", "2026-01-04"]


def test_partition_filter_applies(tmp_path):
    rows = queries.activity_by_day(build(tmp_path), Filters(set_key="s2"))
    assert rows[0]["starts"] == 1 and rows[0]["opens"] == 0 and rows[0]["attempts"] == 0
