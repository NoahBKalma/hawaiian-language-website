"""Tiny JSON settings file (remembers the last opened export)."""
import json
from pathlib import Path


def default_path():
    return Path.home() / ".hawaiian_analytics.json"


def load(path=None):
    try:
        data = json.loads(Path(path or default_path()).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def save(data, path=None):
    try:
        Path(path or default_path()).write_text(json.dumps(data), encoding="utf-8")
    except OSError:
        pass
