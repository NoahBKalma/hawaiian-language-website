import os
import sys
import tempfile
from datetime import date

os.environ["SECRET_KEY"] = "test"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import database

# Point the app at a temp-file DB before main is imported so hawaiian.db is never touched
_db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_db_file.close()
test_engine = create_engine(f"sqlite:///{_db_file.name}", connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
database.engine = test_engine
database.SessionLocal = TestSession

import main  # noqa: E402
from database import Base  # noqa: E402


def _override_get_db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


main.app.dependency_overrides[main.get_db] = _override_get_db


def pytest_sessionfinish(session, exitstatus):
    test_engine.dispose()
    try:
        os.unlink(_db_file.name)
    except OSError:
        pass


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(test_engine)
    Base.metadata.create_all(test_engine)
    yield


@pytest.fixture(autouse=True)
def pin_server_date(request, monkeypatch):
    # Fixed server date so tests can use literal local dates; test_validation uses the real date
    if request.node.name != "test_validation":
        monkeypatch.setattr(main, "utc_today", lambda: date(2026, 1, 2))


@pytest.fixture
def client():
    return TestClient(main.app)


@pytest.fixture
def auth(client):
    # Registers and logs in a user; returns Bearer headers
    client.post("/register", json={"username": "tester", "email": "t@example.com", "password": "pw"})
    token = client.post("/login", json={"username": "tester", "password": "pw"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
