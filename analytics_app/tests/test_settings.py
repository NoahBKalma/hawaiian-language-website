from analytics_app import settings


def test_round_trip(tmp_path):
    path = tmp_path / "s.json"
    settings.save({"last_file": "C:/x/analytics.db"}, path)
    assert settings.load(path) == {"last_file": "C:/x/analytics.db"}


def test_missing_file(tmp_path):
    assert settings.load(tmp_path / "missing.json") == {}


def test_corrupt_file(tmp_path):
    path = tmp_path / "s.json"
    path.write_text("{not json", encoding="utf-8")
    assert settings.load(path) == {}
    path.write_text("[1, 2]", encoding="utf-8")
    assert settings.load(path) == {}


def test_default_path_follows_home(tmp_path, monkeypatch):
    monkeypatch.setattr(settings.Path, "home", classmethod(lambda cls: tmp_path))
    settings.save({"last_file": "a"})
    assert (tmp_path / ".hawaiian_analytics.json").exists()
    assert settings.load() == {"last_file": "a"}
