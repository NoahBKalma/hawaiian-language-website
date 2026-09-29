from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import main
from conftest import TestSession
from models import UserStats, SetProgress, UserAchievement


def post(client, auth, type_, date="2026-01-01", **extra):
    return client.post("/activity", json={"type": type_, "local_date": date, **extra}, headers=auth)


def progress(client, auth, today="2026-01-01"):
    return client.get("/progress", params={"today": today}, headers=auth).json()


def achievement(client, auth, achievement_id):
    return next(a for a in progress(client, auth)["achievements"] if a["id"] == achievement_id)


def today_str(offset=0):
    return (datetime.utcnow().date() + timedelta(days=offset)).isoformat()


def test_streak_progression(client, auth):
    post(client, auth, "card_graded", "2026-01-01")
    assert progress(client, auth)["stats"]["current_streak"] == 1
    post(client, auth, "card_graded", "2026-01-02")
    assert progress(client, auth)["stats"]["current_streak"] == 2
    post(client, auth, "card_graded", "2026-01-04")
    s = progress(client, auth)["stats"]
    assert s["current_streak"] == 1 and s["best_streak"] == 2
    post(client, auth, "card_graded", "2026-01-04")
    assert progress(client, auth)["stats"]["current_streak"] == 1


def test_late_event_keeps_streak(client, auth):
    post(client, auth, "card_graded", "2026-01-03")
    post(client, auth, "card_graded", "2026-01-02")
    s = progress(client, auth)["stats"]
    assert s["current_streak"] == 1
    assert s["last_active_date"] == "2026-01-03"
    assert s["cards_studied"] == 2


def test_validation(client, auth, monkeypatch):
    assert post(client, auth, "card_graded", today_str(5)).status_code == 422
    assert post(client, auth, "card_graded", today_str(-5)).status_code == 422
    assert post(client, auth, "card_graded", today_str(1)).status_code == 200
    assert post(client, auth, "word_wrong").status_code == 422
    assert post(client, auth, "card_graded", "2026-13-45").status_code == 422
    assert client.post("/activity", json={"type": "card_graded", "local_date": "2026-01-01"}).status_code == 401


def test_display_streak(client, auth):
    post(client, auth, "card_graded", "2026-01-01")
    assert progress(client, auth, "2026-01-01")["display_streak"] == 1
    assert progress(client, auth, "2026-01-02")["display_streak"] == 1
    assert progress(client, auth, "2026-01-03")["display_streak"] == 0


def test_cards_achievement(client, auth):
    responses = [post(client, auth, "card_graded").json() for _ in range(11)]
    assert responses[9]["new_achievements"] == [
        {"id": "cards-10", "title": "10 Cards Studied", "icon": "cards", "ladder": "cards", "tier": 1}]
    assert responses[10]["new_achievements"] == []
    assert progress(client, auth)["stats"]["cards_studied"] == 11
    item = achievement(client, auth, "cards-10")
    assert item["unlocked"] and item["unlocked_at"] is not None


def test_concurrency(client, auth):
    with ThreadPoolExecutor(max_workers=20) as pool:
        results = list(pool.map(lambda _: post(client, auth, "card_graded"), range(20)))
    assert all(r.status_code == 200 for r in results)
    assert progress(client, auth)["stats"]["cards_studied"] == 20
    ids = [a["id"] for r in results for a in r.json()["new_achievements"]]
    assert ids.count("cards-10") == 1
    with TestSession() as db:
        assert db.query(UserAchievement).filter_by(achievement_id="cards-10").count() == 1


def test_words_written(client, auth):
    for _ in range(3):
        post(client, auth, "word_correct", set_key="a", streak=1)
    assert progress(client, auth)["stats"]["words_written"] == 3


def test_sets_completed(client, auth):
    post(client, auth, "set_completed", set_key="a", full_set=True)
    post(client, auth, "set_completed", set_key="a", full_set=True)
    assert progress(client, auth)["stats"]["sets_completed"] == 1
    post(client, auth, "set_completed", set_key="b", full_set=False)
    assert progress(client, auth)["stats"]["sets_completed"] == 1
    assert achievement(client, auth, "sets-1")["unlocked"]


def test_sets_completed_per_frequency_level(client, auth):
    post(client, auth, "set_completed", set_key="a", full_set=True, min_frequency=5)
    post(client, auth, "set_completed", set_key="a", full_set=True, min_frequency=5)   # repeat: no change
    assert progress(client, auth)["stats"]["sets_completed"] == 1
    post(client, auth, "set_completed", set_key="a", full_set=True, min_frequency=4)
    post(client, auth, "set_completed", set_key="a", full_set=True)                    # All (level 1)
    assert progress(client, auth)["stats"]["sets_completed"] == 3
    post(client, auth, "set_completed", set_key="a", full_set=False, min_frequency=3)  # review deck: no
    assert progress(client, auth)["stats"]["sets_completed"] == 3
    assert post(client, auth, "set_completed", set_key="a", full_set=True, min_frequency=6).status_code == 422


def test_set_best_streak(client, auth):
    post(client, auth, "word_correct", set_key="A", streak=7)
    post(client, auth, "word_correct", set_key="A", streak=4)
    post(client, auth, "word_correct", set_key="B", streak=2)
    assert client.get("/set-progress", params={"set_key": "A"}, headers=auth).json() == {"set_key": "A", "best_writing_streak": 7}
    assert client.get("/set-progress", params={"set_key": "B"}, headers=auth).json()["best_writing_streak"] == 2
    assert client.get("/set-progress", params={"set_key": "C"}, headers=auth).json()["best_writing_streak"] == 0
    assert achievement(client, auth, "setstreak-5")["unlocked"]


def test_perfect_run(client, auth):
    post(client, auth, "word_correct", set_key="A", streak=3, set_size=3, full_set=False)
    assert not achievement(client, auth, "setstreak-perfect")["unlocked"]
    r = post(client, auth, "word_correct", set_key="A", streak=3, set_size=3, full_set=True)
    assert "setstreak-perfect" in [a["id"] for a in r.json()["new_achievements"]]
    assert achievement(client, auth, "setstreak-perfect")["unlocked"]


def test_progress_catalog(client, auth):
    data = progress(client, auth)
    ladders = [a["ladder"] for a in data["achievements"]]
    assert len(ladders) == 50
    assert ladders == ["cards"] * 10 + ["words"] * 10 + ["sets"] * 10 + ["streak"] * 10 + ["setstreak"] * 10
    assert not any(a["unlocked"] for a in data["achievements"])
    assert data["display_streak"] == 0


def test_delete_account_cascade(client, auth):
    post(client, auth, "word_correct", set_key="A", streak=10, set_size=10, full_set=True)
    with TestSession() as db:
        assert db.query(UserStats).count() == 1
        assert db.query(SetProgress).count() == 1
        assert db.query(UserAchievement).count() > 0
    assert client.post("/delete-account", json={"password": "pw"}, headers=auth).status_code == 200
    with TestSession() as db:
        assert db.query(UserStats).count() == 0
        assert db.query(SetProgress).count() == 0
        assert db.query(UserAchievement).count() == 0

