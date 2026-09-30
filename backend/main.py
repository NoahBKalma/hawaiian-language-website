from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine, SessionLocal
import threading
from datetime import datetime, date, timedelta

from models import User, FavoriteSet, CardResult, ContinueSet, UserStats, SetProgress, SetCompletion, UserAchievement
from schemas import UserRegister, DeleteAccount, UserEdit, PasswordEdit, UserLogin, ToggleFavoriteSet, UpdateCardResult, UpdateContinueStudy, ActivityEvent
import achievements
from auth import hash_password, create_access_token, get_current_user, oauth2_scheme, verify_password

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

def get_db():
    database_session_local = SessionLocal()
    try:
        yield database_session_local
    finally:
        database_session_local.close()
        
# Register's a new account
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
    
    # Checks for an existing user, than checks password equality
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
        database.query(CardResult).filter(CardResult.user_id == user.user_id).delete()
        database.query(FavoriteSet).filter(FavoriteSet.user_id == user.user_id).delete()
        database.query(ContinueSet).filter(ContinueSet.user_id == user.user_id).delete()
        database.query(UserStats).filter(UserStats.user_id == user.user_id).delete()
        database.query(SetProgress).filter(SetProgress.user_id == user.user_id).delete()
        database.query(SetCompletion).filter(SetCompletion.user_id == user.user_id).delete()
        database.query(UserAchievement).filter(UserAchievement.user_id == user.user_id).delete()

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

# Gets a list of user's results
@app.get("/card-results")
def get_card_results(token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    return {"card-results": database.query(CardResult).filter(CardResult.user_id == user.user_id).all()}

# Reset a user's results
@app.post("/card-results-reset")
def reset_card_results(token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    database.query(CardResult).filter(CardResult.user_id == user.user_id).update({
        "correct_count": 0,
        "incorrect_count": 0
    })
    database.commit()
    return {"Reset": True}

# Adds a card's results
@app.post("/card-results")
def add_card_result(card_data: UpdateCardResult, token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    existing_card_result = database.query(CardResult).filter((CardResult.user_id == user.user_id) &
                                                             (CardResult.word_hawaiian == card_data.word_hawaiian)).first()
    if existing_card_result:
        if card_data.result:
            existing_card_result.correct_count += 1
        else:
            existing_card_result.incorrect_count += 1
    else:
        card_correct_count = 1 if card_data.result else 0
        card_incorrect_count = 0 if card_data.result else 1
        database.add(CardResult(user_id=user.user_id, word_hawaiian=card_data.word_hawaiian, correct_count=card_correct_count, incorrect_count=card_incorrect_count))
    database.commit()
    return {"Word Updated": True}


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
        progress = SetProgress(user_id=user_id, set_key=set_key, best_writing_streak=0,
                               perfect_run=False, completed=False)
        database.add(progress)
        database.flush()
    return progress

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
            last = date.fromisoformat(stats.last_active_date) if stats.last_active_date else None
            if last is None:
                stats.current_streak = 1
            elif event_date == last + timedelta(days=1):
                stats.current_streak += 1
            elif event_date > last + timedelta(days=1):
                stats.current_streak = 1
            # same day or a late event (event_date < last): streak unchanged
            if last is None or event_date > last:
                stats.last_active_date = event.local_date
            stats.best_streak = max(stats.best_streak, stats.current_streak)

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
            # Each (set, frequency level) counts once. A pre-existing SetProgress.completed flag
            # stands for an unfiltered (level 1) completion recorded before levels were tracked.
            level = event.min_frequency
            progress = _get_set_progress(database, user.user_id, event.set_key)
            already = database.query(SetCompletion).filter(
                (SetCompletion.user_id == user.user_id) & (SetCompletion.set_key == event.set_key)
                & (SetCompletion.min_frequency == level)).first() is not None
            if level == 1 and progress.completed:
                already = True
            if not already:
                database.add(SetCompletion(user_id=user.user_id, set_key=event.set_key,
                                           min_frequency=level, completed_at=datetime.utcnow()))
                if level == 1 and not progress.completed:
                    progress.completed = True
                    progress.completed_at = datetime.utcnow()
                stats.sets_completed += 1

        database.flush()
        earned = achievements.unlocked_ids(achievements.values_for(database, user.user_id))
        stored = {row.achievement_id for row in
                  database.query(UserAchievement).filter(UserAchievement.user_id == user.user_id).all()}
        new_achievements = []
        for achievement in achievements.ACHIEVEMENTS:
            if achievement["id"] in earned and achievement["id"] not in stored:
                database.add(UserAchievement(user_id=user.user_id, achievement_id=achievement["id"],
                                             unlocked_at=datetime.utcnow()))
                new_achievements.append({k: achievement[k] for k in ("id", "title", "icon", "ladder", "tier")})
        database.commit()

    return {"new_achievements": new_achievements}

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
