import sqlite3
import sys

import pytest

from conftest import HAVE_SQLALCHEMY
from analytics_app import db, export, queries
from analytics_app.filters import Filters


def test_missing_source(tmp_path):
    with pytest.raises(export.ExportError, match="database not found"):
        export.regenerate(tmp_path / "nope.db", tmp_path / "analytics.db")


@pytest.mark.skipif(not HAVE_SQLALCHEMY, reason="sqlalchemy not installed")
def test_regenerate_builds_a_usable_export_and_keeps_old_one_on_failure(tmp_path):
    import database
    import models  # noqa: F401
    from sqlalchemy import create_engine

    source = tmp_path / "live.db"
    engine = create_engine(f"sqlite:///{source}")
    database.Base.metadata.create_all(engine)
    engine.dispose()
    raw = sqlite3.connect(source)
    raw.execute("INSERT INTO set_events (occurred_at, visitor_id, source, set_key, min_frequency, mode, event_type) "
                "VALUES ('2026-01-02 10:00:00.000000', 'v1', 'anonymous', 's1', 1, 'writing', 'set_opened')")
    raw.commit()
    raw.close()
    before = source.read_bytes()

    output = tmp_path / "analytics.db"
    export.regenerate(source, output, python=sys.executable)
    conn = db.open_readonly(output)
    assert db.validate_schema(conn) == []          # exports have no users table
    assert queries.funnel(conn, Filters())[0]["opened"] == 1
    conn.close()
    assert source.read_bytes() == before            # the source is only read
    assert not (tmp_path / "analytics.db.tmp").exists()

    export.regenerate(source, output, python=sys.executable)    # --force: replaces the old export
    good = output.read_bytes()
    with pytest.raises(export.ExportError):
        export.regenerate(source, output, python=str(tmp_path / "no-such-python"))
    assert output.read_bytes() == good
