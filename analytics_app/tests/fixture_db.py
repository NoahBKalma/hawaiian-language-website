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
    is_retry BOOLEAN NOT NULL,
    is_spaced BOOLEAN NOT NULL DEFAULT 0
)"""
# the pre-spaced-repetition shape: exports made before is_spaced existed
OLD_ATTEMPT_EVENTS_DDL = ATTEMPT_EVENTS_DDL.replace(",\n    is_spaced BOOLEAN NOT NULL DEFAULT 0", "")
QUIZ_RESULTS_DDL = """
CREATE TABLE quiz_results (
    id INTEGER NOT NULL PRIMARY KEY,
    occurred_at DATETIME NOT NULL,
    user_id INTEGER,
    visitor_id VARCHAR(36) NOT NULL,
    source VARCHAR(9) NOT NULL,
    quiz_id VARCHAR(36) NOT NULL UNIQUE,
    set_key VARCHAR(200) NOT NULL,
    local_date VARCHAR(10) NOT NULL,
    question_count INTEGER NOT NULL,
    score FLOAT NOT NULL,
    writing_total INTEGER NOT NULL,
    writing_correct INTEGER NOT NULL,
    mc_total INTEGER NOT NULL,
    mc_correct INTEGER NOT NULL,
    connect_total INTEGER NOT NULL,
    connect_score FLOAT NOT NULL,
    unanswered INTEGER NOT NULL
)"""

_quiz_counter = [0]


def stamp(at):
    """'YYYY-MM-DD HH:MM:SS' -> SQLAlchemy-style text with microseconds."""
    at = at if " " in at else f"{at} 12:00:00"
    return at if "." in at else f"{at}.000000"


def set_ev(visitor, event_type, at="2026-01-02 10:00:00", *, key="s1", mode="writing", level=1,
           variant="to_hawaiian", source="anonymous", user=None):
    return dict(occurred_at=stamp(at), user_id=user, visitor_id=visitor, source=source, set_key=key,
                min_frequency=level, mode=mode, variant=variant, event_type=event_type)


def att(visitor, word, outcome, at="2026-01-02 10:00:00", *, key="s1", mode="writing", level=1,
        variant="to_hawaiian", source="anonymous", user=None, retry=False, spaced=False):
    return dict(occurred_at=stamp(at), user_id=user, visitor_id=visitor, source=source, set_key=key,
                min_frequency=level, mode=mode, variant=variant, word_hawaiian=word, outcome=outcome,
                is_retry=int(retry), is_spaced=int(spaced))


def quiz(visitor, at="2026-01-02 10:00:00", *, key="s1", count=5, score=4.0, w=(2, 2), mc=(2, 2),
         cn=(1, 0.0), unanswered=0, source="anonymous", user=None):
    """A quiz_results row. w / mc = (total, correct); cn = (total, score)."""
    _quiz_counter[0] += 1
    return dict(occurred_at=stamp(at), user_id=user, visitor_id=visitor, source=source,
                quiz_id=f"q-{_quiz_counter[0]}", set_key=key, local_date=at[:10], question_count=count,
                score=score, writing_total=w[0], writing_correct=w[1], mc_total=mc[0], mc_correct=mc[1],
                connect_total=cn[0], connect_score=cn[1], unanswered=unanswered)


def _insert(conn, table, rows):
    for row in rows:
        names = ", ".join(row)
        marks = ", ".join(f":{name}" for name in row)
        conn.execute(f"INSERT INTO {table} ({names}) VALUES ({marks})", row)


def connect(tmp_path, set_rows=(), attempt_rows=(), quiz_rows=None, old_attempts=False):
    """Builds a fixture db in tmp_path and returns a read-only connection to it.
    quiz_rows=None builds the db WITHOUT a quiz_results table (an old export); old_attempts=True builds
    attempt_events WITHOUT is_spaced (an export from before spaced repetition; rows must not set it)."""
    from analytics_app import db
    return db.open_readonly(build_analytics_db(tmp_path / "analytics.db", set_rows, attempt_rows, quiz_rows,
                                                   old_attempts))


def build_analytics_db(path, set_rows=(), attempt_rows=(), quiz_rows=None, old_attempts=False):
    conn = sqlite3.connect(path)
    try:
        conn.execute(SET_EVENTS_DDL)
        conn.execute(OLD_ATTEMPT_EVENTS_DDL if old_attempts else ATTEMPT_EVENTS_DDL)
        _insert(conn, "set_events", set_rows)
        _insert(conn, "attempt_events", attempt_rows)
        if quiz_rows is not None:
            conn.execute(QUIZ_RESULTS_DDL)
            _insert(conn, "quiz_results", quiz_rows)
        for _, sql in analytics_views.VIEWS:
            conn.execute(sql)
        conn.commit()
    finally:
        conn.close()
    return path
