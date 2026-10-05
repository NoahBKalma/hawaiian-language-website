import sqlite3

import pytest

from conftest import HAVE_SQLALCHEMY
from analytics_app import db
from fixture_db import build_analytics_db


@pytest.mark.skipif(not HAVE_SQLALCHEMY, reason="sqlalchemy not installed")
def test_fixture_ddl_and_required_columns_match_models(tmp_path):
    import database  # noqa: F401  (lazy engine is never connected)
    import models  # noqa: F401
    from database import Base

    conn = sqlite3.connect(build_analytics_db(tmp_path / "a.db", quiz_rows=[]))
    for table in ("set_events", "attempt_events", "quiz_results"):
        model = Base.metadata.tables[table]
        expected = {c.name: (not c.nullable) for c in model.columns}
        actual = {r[1]: bool(r[3]) or bool(r[5]) for r in conn.execute(f"PRAGMA table_info({table})")}
        assert actual == expected
        columns = db.REQUIRED_COLUMNS.get(table) or db.OPTIONAL_TABLES[table]
        assert set(columns) == set(expected)
    conn.close()
