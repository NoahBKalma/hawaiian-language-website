from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine, SessionLocal
import logging
import os
import threading
import time
import uuid
from collections import deque
from datetime import datetime, date, timedelta

from sqlalchemy.exc import IntegrityError

from models import User, FavoriteSet, ContinueSet, UserStats, SetProgress, SetCompletion, UserAchievement, SetEvent, AttemptEvent, QuizResult, LearningProgress
from schemas import UserRegister, DeleteAccount, UserEdit, PasswordEdit, UserLogin, ToggleFavoriteSet, UpdateContinueStudy, ActivityEvent, StudyEventBatch, QuizResultIn, LearningProgressIn
import achievements
from analytics_views import create_views
from auth import hash_password, create_access_token, get_current_user, get_optional_user, oauth2_scheme, oauth2_optional, verify_password

logger = logging.getLogger("study-events")

app = FastAPI()
# Allows my frontend to access my backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5501"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# creates all the tables defined in models.py with the engine from database.py
Base.metadata.create_all(engine)
# create_all doesn't build views, so the analytics views are (re)created here
create_views(engine)

# Logs a count only (never the payload) when a study-events batch is rejected
@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    if request.url.path == "/study-events":
        logger.warning("study-events batch rejected: %d validation error(s)", len(exc.errors()))
    return await request_validation_exception_handler(request, exc)

def get_db():
    database_session_local = SessionLocal()
    try:
        yield database_session_local
    finally:
        database_session_local.close()
        
# Registers a new account
@app.post("/register")
def user_register(user_data: UserRegister, database = Depends(get_db)):
    # Checks username and email for duplicates first because hashing is slow
    existing_user = database.query(User).filter(
        (User.username == user_data.username) | (User.email == user_data.email)
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Account with this username or email already exists")

    # Creates a user and adds it to the database
    new_user = User(username=user_data.username, email=user_data.email, password_hash=hash_password(user_data.password))
    
    database.add(new_user)
    database.commit()
    return {"message": "User created successfully"}

# Logs user in - gives JWT token
@app.post("/login")
def user_login(login_data: UserLogin, database = Depends(get_db)):
    
    # Checks for an existing user, then checks password equality
    existing_user = database.query(User).filter(
        (User.username == login_data.username) | (User.email == login_data.email)
    ).first()
    
    if not existing_user:
        raise HTTPException(status_code=400, detail="Account with this username or email doesn't exist")

    if verify_password(login_data.password, existing_user.password_hash):
        return {"access_token": create_access_token(existing_user.user_id)}
    else:
        raise HTTPException(status_code=401, detail="Password is incorrect")

# Deletes user account
@app.post("/delete-account")
def user_delete(password: DeleteAccount, token=Depends(oauth2_scheme), database = Depends(get_db)):
    user = get_current_user(token, database)
        
    if verify_password(password.password, user.password_hash):
        # Analytics history is kept but detached from the account: one fresh random visitor id per
        # deleted account keeps that person's rows linked to each other, not to the account or browser.
        # Same transaction as the deletes below, so it rolls back with them.
        anonymous_visitor_id = str(uuid.uuid4())
        for event_model in (SetEvent, AttemptEvent, QuizResult):
            database.query(event_model).filter(event_model.user_id == user.user_id).update(
                {"user_id": None, "visitor_id": anonymous_visitor_id, "source": "deleted"})

        database.query(FavoriteSet).filter(FavoriteSet.user_id == user.user_id).delete()
        database.query(ContinueSet).filter(ContinueSet.user_id == user.user_id).delete()
        database.query(UserStats).filter(UserStats.user_id == user.user_id).delete()
        database.query(SetProgress).filter(SetProgress.user_id == user.user_id).delete()
        database.query(SetCompletion).filter(SetCompletion.user_id == user.user_id).delete()
        database.query(UserAchievement).filter(UserAchievement.user_id == user.user_id).delete()
        database.query(LearningProgress).filter(LearningProgress.user_id == user.user_id).delete()

        database.delete(user)
        database.commit()
        return { "deleted": True }
    else:
        raise HTTPException(status_code=403, detail="Confirm password is incorrect")

# Gets user data from currently signed in
@app.get("/signed-in-user")
def user_fetch(token=Depends(oauth2_scheme), database = Depends(get_db)):
    user = get_current_user(token, database)
    return { "username" : user.username, "email" : user.email }

# Edit user username/email
@app.post("/edit-user")
def user_edit(user_data: UserEdit, token=Depends(oauth2_scheme), database = Depends(get_db)):
    user = get_current_user(token, database)

    # Checks if another account already has the new username or email
    existing_user = database.query(User).filter(
        ((User.username == user_data.new_username) | (User.email == user_data.new_email)) &
        (User.user_id != user.user_id)
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username or email is already taken")

    user.username = user_data.new_username
    user.email = user_data.new_email
    database.commit()

    return { "username" : user.username, "email" : user.email }

# Edit user password
@app.post("/edit-password")
def password_edit(password_data: PasswordEdit, token=Depends(oauth2_scheme), database = Depends(get_db)):
    user = get_current_user(token, database)

    if verify_password(password_data.curr_password, user.password_hash):
        user.password_hash = hash_password(password_data.new_password)
        database.commit()
    else:
        raise HTTPException(status_code=403, detail="Password is incorrect")

# Get user's favorites
@app.get("/favorites")
def get_favorites(token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    favorites = database.query(FavoriteSet).filter(FavoriteSet.user_id == user.user_id).all()
    return {"favorites": favorites}

# Add/remove a favorite set
@app.post("/favorites")
def toggle_favorite(set_data: ToggleFavoriteSet, token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    existing_favorite_set = database.query(FavoriteSet).filter((FavoriteSet.user_id == user.user_id) & 
                                                               (FavoriteSet.set_key == set_data.set_key)).first()
    if existing_favorite_set:
        database.delete(existing_favorite_set)
    else:
        database.add(FavoriteSet(user_id = user.user_id,
                                 set_key = set_data.set_key,
                                 set_name_haw = set_data.set_name_haw,
                                 set_name_eng = set_data.set_name_eng,
                                 set_size = set_data.set_size))
    database.commit()
    
    return {"favorited": 'unfavorited' if existing_favorite_set else 'favorited'}

# Gets the user's learning-trail progress (level 1 for now); 0 when nothing is saved yet
@app.get("/learning-progress")
def get_learning_progress(token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    row = database.query(LearningProgress).filter((LearningProgress.user_id == user.user_id) & (LearningProgress.level == 1)).first()
    return { "level": 1, "done_count": row.done_count if row else 0 }

# Saves the user's learning-trail progress (upsert; done_count 0 is also how the demo Reset works)
@app.put("/learning-progress")
def put_learning_progress(data: LearningProgressIn, token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    row = database.query(LearningProgress).filter((LearningProgress.user_id == user.user_id) & (LearningProgress.level == data.level)).first()
    if row:
        row.done_count = data.done_count
        row.updated_at = datetime.utcnow()
    else:
        database.add(LearningProgress(user_id=user.user_id, level=data.level, done_count=data.done_count))
    database.commit()
    return { "level": data.level, "done_count": data.done_count }

# Gets a list of user's sets to continue
@app.get("/continue-sets")
def get_continue_sets(token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    continue_sets = database.query(ContinueSet).filter(ContinueSet.user_id == user.user_id).order_by(ContinueSet.time_studied.desc()).all()

    return { "continue_sets": continue_sets }

# Saves a user's place in a set
@app.post("/continue-sets")
def update_continue_sets(continue_data: UpdateContinueStudy, token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)

    # checks if a user already has that set saved (one entry per set, whatever the frequency level)
    existing_continue_set = database.query(ContinueSet).filter((ContinueSet.user_id == user.user_id) &
                                                               (ContinueSet.set_key == continue_data.set_key)).first()
    
    # if saved on last card (set is done), remove it if it was saved before
    if continue_data.last_studied == continue_data.set_size:
        if existing_continue_set:
            database.delete(existing_continue_set)
            database.commit()
        return { "action": "completed" }

    # updates existing data
    if existing_continue_set:
        existing_continue_set.last_studied = continue_data.last_studied
        existing_continue_set.set_size = continue_data.set_size
        existing_continue_set.min_frequency = continue_data.min_frequency
        existing_continue_set.time_studied = datetime.utcnow()
    # or creates new
    else:
        database.add(ContinueSet(user_id = user.user_id,
                    set_key = continue_data.set_key,
                    min_frequency = continue_data.min_frequency,
                    set_name_haw = continue_data.set_name_haw,
                    set_name_eng = continue_data.set_name_eng,
                    last_studied = continue_data.last_studied,
                    set_size = continue_data.set_size))

    database.commit()
    return { "action": "saved" }

# Serializes every /activity request so counters and unlocks stay exact.
# Only valid for a single uvicorn worker (the lock is process-level).
activity_lock = threading.Lock()

def utc_today():
    return datetime.utcnow().date()

def _parse_date(value):
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid local_date")

def _get_set_progress(database, user_id, set_key):
    progress = database.query(SetProgress).filter(
        (SetProgress.user_id == user_id) & (SetProgress.set_key == set_key)).first()
    if not progress:
        progress = SetProgress(user_id=user_id, set_key=set_key, best_writing_streak=0, perfect_run=False)
        database.add(progress)
        database.flush()
    return progress

# Advances the daily streak for activity on event_date (a date); local_date is the same day as a string
def _touch_streak(stats, event_date, local_date):
    last = date.fromisoformat(stats.last_active_date) if stats.last_active_date else None
    if last is None:
        stats.current_streak = 1
    elif event_date == last + timedelta(days=1):
        stats.current_streak += 1
    elif event_date > last + timedelta(days=1):
        stats.current_streak = 1
    # same day or a late event (event_date < last): streak unchanged
    if last is None or event_date > last:
        stats.last_active_date = local_date
    stats.best_streak = max(stats.best_streak, stats.current_streak)

# Stores any newly earned achievements and returns them. Caller commits.
def _unlock_new(database, user_id):
    database.flush()  # sessions use autoflush=False; pending rows must be visible to values_for
    earned = achievements.unlocked_ids(achievements.values_for(database, user_id))
    stored = {row.achievement_id for row in
              database.query(UserAchievement).filter(UserAchievement.user_id == user_id).all()}
    new_achievements = []
    for achievement in achievements.ACHIEVEMENTS:
        if achievement["id"] in earned and achievement["id"] not in stored:
            database.add(UserAchievement(user_id=user_id, achievement_id=achievement["id"],
                                         unlocked_at=datetime.utcnow()))
            new_achievements.append({k: achievement[k] for k in ("id", "title", "icon", "ladder", "tier")})
    return new_achievements

# Records a study event: updates streak, counters and unlocks achievements
@app.post("/activity")
def record_activity(event: ActivityEvent, token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    event_date = _parse_date(event.local_date)
    if abs((event_date - utc_today()).days) > 2:
        raise HTTPException(status_code=422, detail="local_date is too far from the server date")

    with activity_lock:
        stats = database.get(UserStats, user.user_id)
        if not stats:
            stats = UserStats(user_id=user.user_id, cards_studied=0, words_written=0, sets_completed=0,
                              current_streak=0, best_streak=0)
            database.add(stats)
            database.flush()

        if event.type in ("card_graded", "word_correct"):
            _touch_streak(stats, event_date, event.local_date)

        if event.type == "card_graded":
            stats.cards_studied += 1
        elif event.type == "word_correct":
            stats.words_written += 1
            if event.set_key and event.streak is not None:
                progress = _get_set_progress(database, user.user_id, event.set_key)
                progress.best_writing_streak = max(progress.best_writing_streak, event.streak)
                if event.full_set and event.set_size and event.streak >= event.set_size:
                    progress.perfect_run = True
        elif event.type == "set_completed" and event.full_set and event.set_key:
            # Each (set, frequency level) counts once
            level = event.min_frequency
            already = database.query(SetCompletion).filter(
                (SetCompletion.user_id == user.user_id) & (SetCompletion.set_key == event.set_key)
                & (SetCompletion.min_frequency == level)).first() is not None
            if not already:
                database.add(SetCompletion(user_id=user.user_id, set_key=event.set_key,
                                           min_frequency=level, completed_at=datetime.utcnow()))
                stats.sets_completed += 1

        database.flush()
        new_achievements = _unlock_new(database, user.user_id)
        database.commit()

    return {"new_achievements": new_achievements}

# Analytics event intake. Open to logged-out visitors; a valid token links the rows to the user.
# The rate limit is in memory and per process (single uvicorn worker, like activity_lock). Behind a
# reverse proxy start uvicorn with --proxy-headers so request.client.host is the real client.
STUDY_EVENTS_PER_MINUTE = int(os.getenv("STUDY_EVENTS_PER_MINUTE", "300"))
_RATE_WINDOW_SECONDS = 60
_rate_hits = {}  # client ip -> deque of monotonic timestamps, one per event

def reset_rate_limit():
    _rate_hits.clear()

def _rate_limited(client_key, event_count):
    now = time.monotonic()
    hits = _rate_hits.setdefault(client_key, deque())
    while hits and now - hits[0] > _RATE_WINDOW_SECONDS:
        hits.popleft()
    if len(hits) + event_count > STUDY_EVENTS_PER_MINUTE:
        return True
    hits.extend([now] * event_count)

    # keeps the dict from growing without bound: forget clients with no recent events
    if len(_rate_hits) > 1000:
        for key in [k for k, v in _rate_hits.items() if not v or now - v[-1] > _RATE_WINDOW_SECONDS]:
            del _rate_hits[key]
    return False

@app.post("/study-events")
def record_study_events(batch: StudyEventBatch, request: Request,
                        token=Depends(oauth2_optional), database=Depends(get_db)):
    client_key = request.client.host if request.client else "unknown"
    if _rate_limited(client_key, len(batch.events)):
        logger.warning("study-events rate limit hit (%d events)", len(batch.events))
        raise HTTPException(status_code=429, detail="Too many events, slow down")

    user = get_optional_user(token, database)
    user_id = user.user_id if user else None
    source = "account" if user else "anonymous"
    occurred_at = datetime.utcnow()

    for event in batch.events:
        shared = dict(occurred_at=occurred_at, user_id=user_id, visitor_id=event.visitor_id, source=source,
                      set_key=event.set_key, min_frequency=event.min_frequency, mode=event.mode,
                      variant=event.variant)
        if event.kind == "set":
            database.add(SetEvent(event_type=event.event_type, **shared))
        else:
            database.add(AttemptEvent(word_hawaiian=event.word_hawaiian, outcome=event.outcome,
                                      is_retry=event.is_retry, **shared))
    database.commit()
    return {"stored": len(batch.events)}

# Stores one submitted quiz (idempotent on quiz_id). Open to logged-out visitors; a valid token links
# the row to the user, advances the streak (date in range only) and unlocks quiz achievements.
@app.post("/quiz-results")
def record_quiz_result(result: QuizResultIn, request: Request,
                       token=Depends(oauth2_optional), database=Depends(get_db)):
    client_key = request.client.host if request.client else "unknown"
    if _rate_limited(client_key, 1):
        raise HTTPException(status_code=429, detail="Too many events, slow down")

    user = get_optional_user(token, database)
    user_id = user.user_id if user else None
    result_date = _parse_date(result.local_date)  # an impossible date is a 422
    in_range = abs((result_date - utc_today()).days) <= 2
    stored_date = result.local_date if in_range else utc_today().isoformat()

    duplicate = {"stored": False, "duplicate": True, "streak_skipped": False, "new_achievements": []}
    with activity_lock:
        try:
            if database.query(QuizResult.id).filter(QuizResult.quiz_id == result.quiz_id).first():
                return duplicate
            database.add(QuizResult(
                occurred_at=datetime.utcnow(), user_id=user_id, visitor_id=result.visitor_id,
                source="account" if user else "anonymous", quiz_id=result.quiz_id, set_key=result.set_key,
                local_date=stored_date, question_count=result.question_count, score=result.score,
                writing_total=result.writing_total, writing_correct=result.writing_correct,
                mc_total=result.mc_total, mc_correct=result.mc_correct,
                connect_total=result.connect_total, connect_score=result.connect_score,
                unanswered=result.unanswered))
            database.flush()  # autoflush is off: the row must be visible to values_for

            new_achievements = []
            if user and in_range:
                stats = database.get(UserStats, user_id)
                if not stats:
                    stats = UserStats(user_id=user_id, cards_studied=0, words_written=0, sets_completed=0,
                                      current_streak=0, best_streak=0)
                    database.add(stats)
                    database.flush()
                _touch_streak(stats, result_date, result.local_date)
                new_achievements = _unlock_new(database, user_id)
            database.commit()
        except IntegrityError:
            database.rollback()
            return duplicate

    return {"stored": True, "duplicate": False, "streak_skipped": not in_range,
            "new_achievements": new_achievements}

# Gets the user's stats, display streak and all achievements with progress
@app.get("/progress")
def get_progress(today: str, token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    today_date = _parse_date(today)
    stats = database.get(UserStats, user.user_id)

    display_streak = 0
    if stats and stats.last_active_date:
        last = date.fromisoformat(stats.last_active_date)
        if last in (today_date, today_date - timedelta(days=1)):
            display_streak = stats.current_streak

    values = achievements.values_for(database, user.user_id)
    unlocked_at = {row.achievement_id: row.unlocked_at for row in
                   database.query(UserAchievement).filter(UserAchievement.user_id == user.user_id).all()}
    result = []
    for achievement in achievements.ACHIEVEMENTS:
        value = achievements.value_of(achievement, values)
        when = unlocked_at.get(achievement["id"])
        result.append({
            **achievement,
            "value": value,
            "progress": min(value, achievement["threshold"]),
            "unlocked": when is not None,
            "unlocked_at": when.isoformat() if when else None,
        })

    return {
        "stats": {
            "cards_studied": stats.cards_studied if stats else 0,
            "words_written": stats.words_written if stats else 0,
            "sets_completed": stats.sets_completed if stats else 0,
            "current_streak": stats.current_streak if stats else 0,
            "best_streak": stats.best_streak if stats else 0,
            "last_active_date": stats.last_active_date if stats else None,
            "quizzes_completed": values["quizzes"],
            "perfect_quizzes": values["quizperfect"],
        },
        "display_streak": display_streak,
        "achievements": result,
    }

# Gets the best writing streak stored for a set
@app.get("/set-progress")
def get_set_progress(set_key: str, token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    progress = database.query(SetProgress).filter(
        (SetProgress.user_id == user.user_id) & (SetProgress.set_key == set_key)).first()
    return {"set_key": set_key, "best_writing_streak": progress.best_writing_streak if progress else 0}
