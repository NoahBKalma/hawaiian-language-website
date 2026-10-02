"""Regenerates analytics.db from backend/hawaiian.db by running backend/export_analytics.py.

The export runs in a subprocess (with the backend venv's Python when it exists) so the app itself needs
neither SQLAlchemy nor the backend on its import path. hawaiian.db is only read, by the export script,
through a read-only ATTACH. The new file is built next to the target and swapped in, so a failed export
never destroys the previous analytics.db.
"""
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND = REPO_ROOT / "backend"
SOURCE = BACKEND / "hawaiian.db"
OUTPUT = REPO_ROOT / "analytics.db"


class ExportError(Exception):
    pass


def backend_python():
    for candidate in (BACKEND / ".venv" / "Scripts" / "python.exe", BACKEND / ".venv" / "bin" / "python"):
        if candidate.exists():
            return str(candidate)
    return sys.executable


def regenerate(source=None, output=None, python=None):
    """Rebuilds `output` from `source`. Raises ExportError (the old output is kept on failure)."""
    source, output = Path(source or SOURCE).resolve(), Path(output or OUTPUT).resolve()   # looked up per call
    if not source.exists():
        raise ExportError(f"database not found: {source}")
    temp = output.with_name(output.name + ".tmp")
    for suffix in ("", "-journal", "-wal", "-shm"):
        Path(str(temp) + suffix).unlink(missing_ok=True)
    try:
        done = subprocess.run(
            [python or backend_python(), "export_analytics.py", str(temp), "--db", str(source.resolve()), "--force"],
            cwd=BACKEND, capture_output=True, text=True, timeout=300)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ExportError(f"could not run the export: {error}") from error
    if done.returncode != 0:
        temp.unlink(missing_ok=True)
        raise ExportError((done.stderr or done.stdout).strip() or "export failed")
    try:
        os.replace(temp, output)
    except OSError as error:
        temp.unlink(missing_ok=True)
        raise ExportError(f"could not replace {output} (is it open elsewhere?): {error}") from error
