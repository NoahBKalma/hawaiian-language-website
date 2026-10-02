import hashlib
import os
import sqlite3

import pytest

from analytics_app import db, queries
from analytics_app.filters import Filters
from fixture_db import att, build_analytics_db, connect, set_ev


def test_open_readonly_and_write_fails(tmp_path):
    conn = connect(tmp_path, [set_ev("V1", "set_opened")], [att("V1", "aloha", "correct")])
    assert db.validate_schema(conn) == []
    with pytest.raises(sqlite3.OperationalError):
        conn.execute("DELETE FROM set_events")
    conn.close()


def test_missing_path(tmp_path):
    with pytest.raises(db.SchemaError, match="file not found"):
        db.open_readonly(tmp_path / "nope.db")


def test_non_sqlite_file(tmp_path):
    junk = tmp_path / "junk.db"
    junk.write_bytes(os.urandom(4096))
    with pytest.raises(db.SchemaError, match="could not open read-only"):
        db.open_readonly(junk)


def _raw(tmp_path, statements):
    path = tmp_path / "raw.db"
    conn = sqlite3.connect(path)
    for statement in statements:
        conn.execute(statement)
    conn.commit()
    conn.close()
    return db.open_readonly(path)


def test_missing_table_columns_and_views(tmp_path):
    conn = _raw(tmp_path, ["CREATE TABLE set_events (id INTEGER, visitor_id TEXT)"])
    with pytest.raises(db.SchemaError) as error:
        db.validate_schema(conn)
    message = str(error.value)
    assert "missing table attempt_events" in message
    assert "set_events is missing columns" in message and "occurred_at" in message
    assert "v_set_funnel" in message


def test_missing_views_only(tmp_path):
    path = build_analytics_db(tmp_path / "a.db")
    raw = sqlite3.connect(path)
    raw.execute("DROP VIEW v_word_accuracy")
    raw.commit()
    raw.close()
    with pytest.raises(db.SchemaError, match="v_word_accuracy"):
        db.validate_schema(db.open_readonly(path))


def test_users_table_is_a_warning_and_still_loads(tmp_path):
    path = build_analytics_db(tmp_path / "a.db", [set_ev("V1", "set_opened")])
    raw = sqlite3.connect(path)
    raw.execute("CREATE TABLE users (id INTEGER)")
    raw.commit()
    raw.close()
    conn = db.open_readonly(path)
    warnings = db.validate_schema(conn)
    assert len(warnings) == 1 and "live database" in warnings[0]
    assert queries.funnel(conn, Filters())[0]["opened"] == 1


def test_reading_never_changes_the_file(tmp_path):
    path = build_analytics_db(
        tmp_path / "a.db", [set_ev("V1", "set_opened"), set_ev("V1", "set_started")],
        [att("V1", "aloha", "correct"), att("V1", "mahalo", "incorrect")])

    def fingerprint():
        return hashlib.sha256(path.read_bytes()).hexdigest(), path.stat().st_mtime_ns

    before = fingerprint()
    conn = db.open_readonly(path)
    for split in (False, True):
        f = Filters(split_by_direction=split)
        queries.set_difficulty(conn, f)
        queries.word_difficulty(conn, f)
        queries.funnel(conn, f)
        queries.funnel_lists(conn, f)
        queries.activity_by_day(conn, f)
    queries.filter_options(conn)
    conn.close()
    assert fingerprint() == before
