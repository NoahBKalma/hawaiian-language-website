import importlib.util
import sys
import types
from pathlib import Path

# Computed once, before any stubbing (find_spec raises ValueError for a stub with no __spec__)
HAVE_SQLALCHEMY = importlib.util.find_spec("sqlalchemy") is not None

if not HAVE_SQLALCHEMY:
    stub = types.ModuleType("sqlalchemy")
    stub.text = lambda s: s
    sys.modules["sqlalchemy"] = stub

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(REPO_ROOT))

import analytics_views  # noqa: E402,F401
