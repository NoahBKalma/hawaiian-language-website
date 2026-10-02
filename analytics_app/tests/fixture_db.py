"""Builds an analytics.db with the real table shapes and the real view DDL."""
import sqlite3

import analytics_views

SET_EVENTS_DDL = """
CREATE TABLE set_events (
    id INTEGER NOT NULL PRIMARY KEY,
    occurred_at DATETIME NOT NULL,
    user_id INTEGER,
    visitor_id VARCHAR(36) NOT NULL,
    source VARCHAR(9) NOT NULL,
    set_key VARCHAR(200) NOT NULL,
    min_frequency INTEGER NOT NULL,
    mode VARCHAR(10) NOT NULL,
    variant VARCHAR(20),
    event_type VARCHAR(14) NOT NULL
)"""
ATTEMPT_EVENTS_DDL = """
CREATE TABLE attempt_events (
    id INTEGER NOT NULL PRIMARY KEY,
    occurred_at DATETIME NOT NULL,
    user_id INTEGER,
    visitor_id VARCHAR(36) NOT NULL,
    source VARCHAR(9) NOT NULL,
    set_key VARCHAR(200) NOT NULL,
    min_frequency INTEGER NOT NULL,
    mode VARCHAR(10) NOT NULL,
    variant VARCHAR(20),
    word_hawaiian VARCHAR(200) NOT NULL,
    outcome VARCHAR(14) NOT NULL,
    is_retry BOOLEAN NOT NULL
)"""


def stamp(at):
    """'YYYY-MM-DD HH:MM:SS' -> SQLAlchemy-style text with microseconds."""
    at = at if " " in at else f"{at} 12:00:00"
    return at if "." in at else f"{at}.000000"


def set_ev(visitor, event_type, at="2026-01-02 10:00:00", *, key="s1", mode="writing", level=1,
           variant="to_hawaiian", source="anonymous", user=None):
    return dict(occurred_at=stamp(at), user_id=user, visitor_id=visitor, source=source, set_key=key,
                min_frequency=level, mode=mode, variant=variant, event_type=event_type)


def att(visitor, word, outcome, at="2026-01-02 10:00:00", *, key="s1", mode="writing", level=1,
        variant="to_hawaiian", source="anonymous", user=None, retry=False):
    return dict(occurred_at=stamp(at), user_id=user, visitor_id=visitor, source=source, set_key=key,
                min_frequency=level, mode=mode, variant=variant, word_hawaiian=word, outcome=outcome,
                is_retry=int(retry))


def _insert(conn, table, rows):
    for row in rows:
        names = ", ".join(row)
        marks = ", ".join(f":{name}" for name in row)
        conn.execute(f"INSERT INTO {table} ({names}) VALUES ({marks})", row)


def connect(tmp_path, set_rows=(), attempt_rows=()):
    """Builds a fixture db in tmp_path and returns a read-only connection to it."""
    from analytics_app import db
    return db.open_readonly(build_analytics_db(tmp_path / "analytics.db", set_rows, attempt_rows))


def build_analytics_db(path, set_rows=(), attempt_rows=()):
    conn = sqlite3.connect(path)
    try:
        conn.execute(SET_EVENTS_DDL)
        conn.execute(ATTEMPT_EVENTS_DDL)
        _insert(conn, "set_events", set_rows)
        _insert(conn, "attempt_events", attempt_rows)
        for _, sql in analytics_views.VIEWS:
            conn.execute(sql)
        conn.commit()
    finally:
        conn.close()
    return path
