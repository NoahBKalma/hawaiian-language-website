"""Writes an analytics-only copy of the database (run this on the machine that hosts hawaiian.db).

The output file contains ONLY set_events, attempt_events, quiz_results and the analytics views. No users,
emails, password hashes or any other table are copied, so the file is safe to move to another PC.

    cd backend
    python export_analytics.py /tmp/analytics.db          # refuses to overwrite an existing file
    python export_analytics.py /tmp/analytics.db --force  # replaces it
"""
import argparse
import os
import sqlite3
import sys
from pathlib import Path

from sqlalchemy import create_engine

from analytics_views import create_views
from database import Base
import models  # noqa: F401  (registers the tables on Base.metadata)

EXPORTED_TABLES = ("set_events", "attempt_events", "quiz_results")
# a source DB created before quizzes existed has no such table: export it empty instead of failing
OPTIONAL_SOURCE_TABLES = {"quiz_results"}


def export_analytics(db_path, out_path, force=False):
    """Returns {table: rows_copied}. Raises FileExistsError / FileNotFoundError / RuntimeError."""
    db_file = Path(db_path).resolve()
    out_file = Path(out_path).resolve()

    if not db_file.exists():
        raise FileNotFoundError(f"Database not found: {db_file}")
    if out_file.exists() and out_file.stat().st_size > 0:
        if not force:
            raise FileExistsError(f"{out_file} already exists (use --force to replace it)")
        for suffix in ("", "-wal", "-shm", "-journal"):
            Path(str(out_file) + suffix).unlink(missing_ok=True)

    # exact table definitions (types, primary keys, indexes) come from the models
    out_engine = create_engine(f"sqlite:///{out_file}")
    try:
        for name in EXPORTED_TABLES:
            Base.metadata.tables[name].create(out_engine)
    finally:
        out_engine.dispose()

    counts = {}
    connection = sqlite3.connect(out_file.as_uri(), uri=True)
    try:
        # the source is attached read-only and copied inside one read transaction
        connection.execute("ATTACH DATABASE ? AS src", (db_file.as_uri() + "?mode=ro",))
        try:
            connection.execute("BEGIN")
            for name in EXPORTED_TABLES:
                columns = ", ".join(column.name for column in Base.metadata.tables[name].columns)
                try:
                    connection.execute(f"INSERT INTO main.{name} ({columns}) SELECT {columns} FROM src.{name}")
                except sqlite3.OperationalError as error:
                    if name in OPTIONAL_SOURCE_TABLES:
                        counts[name] = 0
                        continue
                    raise RuntimeError(
                        f"Source database has no usable '{name}' table (start the backend once first): {error}")
                counts[name] = connection.execute(f"SELECT COUNT(*) FROM main.{name}").fetchone()[0]
            connection.commit()
        finally:
            connection.execute("DETACH DATABASE src")
    finally:
        connection.close()

    out_engine = create_engine(f"sqlite:///{out_file}")
    try:
        create_views(out_engine)
    finally:
        out_engine.dispose()
    return counts


def main():
    parser = argparse.ArgumentParser(description="Export an analytics-only copy of hawaiian.db")
    parser.add_argument("out", help="path of the analytics database file to create")
    parser.add_argument("--db", default="hawaiian.db", help="source database (default: ./hawaiian.db)")
    parser.add_argument("--force", action="store_true", help="replace the output file if it exists")
    args = parser.parse_args()

    try:
        counts = export_analytics(args.db, args.out, force=args.force)
    except (FileExistsError, FileNotFoundError, RuntimeError) as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(1)

    for table, count in counts.items():
        print(f"{table}: {count} rows")
    print(f"wrote {os.path.abspath(args.out)}")


if __name__ == "__main__":
    main()
