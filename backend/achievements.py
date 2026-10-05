from sqlalchemy import func

from models import UserStats, SetProgress, QuizResult

def _tiers(ladder, icon, thresholds, titles):
    return [
        {"id": f"{ladder}-{t}", "ladder": ladder, "tier": i + 1, "threshold": t, "title": title, "icon": icon}
        for i, (t, title) in enumerate(zip(thresholds, titles))
    ]

def _fmt(n):
    return f"{n:,}"

# 10 levels per ladder. Every earlier threshold (10/100/500/2000, 1/5/25/100, 3/7/30/100, 5/10/20)
# is kept so achievements that were already unlocked keep the same id.
CARD_STEPS = [10, 25, 50, 100, 200, 350, 500, 1000, 1500, 2000]
WORD_STEPS = [10, 25, 50, 100, 200, 350, 500, 1000, 1500, 2000]
SET_STEPS = [1, 3, 5, 10, 15, 25, 40, 60, 80, 100]
STREAK_STEPS = [3, 5, 7, 10, 14, 21, 30, 50, 75, 100]
SET_STREAK_STEPS = [5, 8, 10, 12, 15, 20, 25, 30, 40]  # tier 10 is "Perfect Set"
QUIZ_STEPS = [1, 5, 10, 25, 50, 100]
QUIZ_PERFECT_STEPS = [1, 5, 10, 20]

ACHIEVEMENTS = (
    _tiers("cards", "cards", CARD_STEPS, [f"{_fmt(t)} Cards Studied" for t in CARD_STEPS])
    + _tiers("words", "pencil", WORD_STEPS, [f"{_fmt(t)} Words Written" for t in WORD_STEPS])
    + _tiers("sets", "stack", SET_STEPS,
             ["First Set Completed" if t == 1 else f"{t} Sets Completed" for t in SET_STEPS])
    + _tiers("streak", "flame", STREAK_STEPS, [f"{t}-Day Streak" for t in STREAK_STEPS])
    + _tiers("setstreak", "target", SET_STREAK_STEPS, [f"{t} in a Row" for t in SET_STREAK_STEPS])
    + [{"id": "setstreak-perfect", "ladder": "setstreak", "tier": 10, "threshold": 1,
        "title": "Perfect Set", "icon": "target"}]
    + _tiers("quizzes", "quiz", QUIZ_STEPS,
             ["First Quiz" if t == 1 else f"{t} Quizzes Completed" for t in QUIZ_STEPS])
    + _tiers("quizperfect", "star", QUIZ_PERFECT_STEPS,
             ["Perfect Quiz" if t == 1 else f"{t} Perfect Quizzes" for t in QUIZ_PERFECT_STEPS])
)

# Current value per ladder for a user. The "setstreak-perfect" achievement uses its own value
def values_for(db, user_id):
    stats = db.get(UserStats, user_id)
    best_set = db.query(func.max(SetProgress.best_writing_streak)).filter(SetProgress.user_id == user_id).scalar()
    perfect = db.query(func.count(SetProgress.id)).filter(
        SetProgress.user_id == user_id, SetProgress.perfect_run.is_(True)).scalar()
    quizzes = db.query(func.count(QuizResult.id)).filter(QuizResult.user_id == user_id).scalar()
    perfect_quizzes = db.query(func.count(QuizResult.id)).filter(
        QuizResult.user_id == user_id, QuizResult.score >= QuizResult.question_count - 1e-9).scalar()
    return {
        "cards": stats.cards_studied if stats else 0,
        "words": stats.words_written if stats else 0,
        "sets": stats.sets_completed if stats else 0,
        "streak": stats.best_streak if stats else 0,
        "setstreak": best_set or 0,
        "perfect": 1 if perfect else 0,
        "quizzes": quizzes or 0,
        "quizperfect": perfect_quizzes or 0,
    }

def value_of(achievement, values):
    if achievement["id"] == "setstreak-perfect":
        return values["perfect"]
    return values[achievement["ladder"]]

def unlocked_ids(values):
    return {a["id"] for a in ACHIEVEMENTS if value_of(a, values) >= a["threshold"]}
