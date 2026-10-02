"""Read-only access to an exported analytics.db."""
import sqlite3
from pathlib import Path

REQUIRED_COLUMNS = {
    "set_events": ("id", "occurred_at", "user_id", "visitor_id", "source", "set_key",
                   "min_frequency", "mode", "variant", "event_type"),
    "attempt_events": ("id", "occurred_at", "user_id", "visitor_id", "source", "set_key",
                       "min_frequency", "mode", "variant", "word_hawaiian", "outcome", "is_retry"),
}
REQUIRED_VIEWS = ("v_set_status", "v_set_funnel", "v_first_try", "v_set_accuracy", "v_word_accuracy")


class SchemaError(Exception):
    """The file cannot be used as an analytics export."""


def open_readonly(path):
    """Opens `path` with mode=ro. Raises SchemaError for a missing or unreadable file."""
    file = Path(path)
    if not file.exists():
        raise SchemaError(f"file not found: {path}")
    conn = None
    try:
        conn = sqlite3.connect(file.resolve().as_uri() + "?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        conn.execute("SELECT name FROM sqlite_master LIMIT 1").fetchall()
    except sqlite3.DatabaseError as error:
        if conn is not None:
            conn.close()
        raise SchemaError(f"could not open read-only: {error}") from error
    return conn


def validate_schema(conn):
    """Raises SchemaError naming everything that is missing. Returns a list of warnings."""
    objects = {(row[0], row[1]) for row in conn.execute("SELECT type, name FROM sqlite_master")}
    problems = []
    for table, columns in REQUIRED_COLUMNS.items():
        if ("table", table) not in objects:
            problems.append(f"missing table {table}")
            continue
        present = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        missing = [column for column in columns if column not in present]
        if missing:
            problems.append(f"table {table} is missing columns: {', '.join(missing)}")
    missing_views = [view for view in REQUIRED_VIEWS if ("view", view) not in objects]
    if missing_views:
        problems.append(f"missing views: {', '.join(missing_views)}")
    if problems:
        raise SchemaError("; ".join(problems))
    warnings = []
    if ("table", "users") in objects:
        warnings.append("this looks like the live database (it has a `users` table); "
                        "analytics exports do not")
    return warnings
