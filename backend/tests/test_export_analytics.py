import pytest
import sqlite3

from sqlalchemy import create_engine

from database import Base
import models  # noqa: F401
from export_analytics import export_analytics

QUIZ_ROW = ("2026-01-02 10:00:00.000000", None, "v1", "anonymous", "q-1", "cat:a", "2026-01-02",
            5, 4.5, 2, 2, 2, 2, 1, 0.5, 0)


def make_source(path, with_quiz=True):
    engine = create_engine(f"sqlite:///{path}")
    for name in ("set_events", "attempt_events") + (("quiz_results",) if with_quiz else ()):
        Base.metadata.tables[name].create(engine)
    engine.dispose()
    if with_quiz:
        conn = sqlite3.connect(path)
        conn.execute("INSERT INTO quiz_results (occurred_at, user_id, visitor_id, source, quiz_id, set_key, "
                     "local_date, question_count, score, writing_total, writing_correct, mc_total, mc_correct, "
                     "connect_total, connect_score, unanswered) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", QUIZ_ROW)
        conn.commit()
        conn.close()


def tables(path):
    conn = sqlite3.connect(path)
    try:
        return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    finally:
        conn.close()


def test_export_copies_quiz_results(tmp_path):
    make_source(tmp_path / "src.db")
    counts = export_analytics(tmp_path / "src.db", tmp_path / "out.db")
    assert counts["quiz_results"] == 1
    out = sqlite3.connect(tmp_path / "out.db")
    assert out.execute("SELECT set_key, score FROM quiz_results").fetchall() == [("cat:a", 4.5)]
    assert out.execute("SELECT quizzes, perfect FROM v_quiz_summary").fetchall() == [(1, 0)]
    assert out.execute("SELECT avg_pct FROM v_quiz_summary").fetchone()[0] == pytest.approx(90.0)
    assert out.execute("SELECT total, correct FROM v_quiz_type_accuracy WHERE question_type='connect'").fetchone() == (1, 0.5)
    out.close()
    assert "users" not in tables(tmp_path / "out.db")


def test_export_from_db_without_quiz_results(tmp_path):
    make_source(tmp_path / "src.db", with_quiz=False)
    counts = export_analytics(tmp_path / "src.db", tmp_path / "out.db")
    assert counts["quiz_results"] == 0
    names = tables(tmp_path / "out.db")
    assert "quiz_results" in names and "users" not in names
