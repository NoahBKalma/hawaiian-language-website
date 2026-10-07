from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, BigInteger, UniqueConstraint, Index

from database import Base

from datetime import datetime

# Class for the user
class User(Base):
    __tablename__ = "users"
    __table_args__ = {"sqlite_autoincrement": True} # so no new users get a new users id
    user_id = Column(Integer, primary_key=True)
    username = Column(String, unique=True)
    email = Column(String, unique=True)
    password_hash = Column(String)
    
# Table for users' favorite sets
class FavoriteSet(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "set_key"),)
    set_id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    set_key = Column(String)
    set_name_haw = Column(String)
    set_name_eng = Column(String)
    set_size = Column(Integer)

# Table for users' to continue studying sets
class ContinueSet(Base):
    __tablename__ = "continue_sets"
    __table_args__ = (UniqueConstraint("user_id", "set_key"),)
    set_id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    set_key = Column(String)
    min_frequency = Column(Integer, default=1)
    set_name_haw = Column(String)
    set_name_eng = Column(String)
    last_studied = Column(Integer)
    set_size = Column(Integer)
    time_studied = Column(DateTime, default=datetime.utcnow)
    
# Table for a user's demo learning-trail progress (one row per level; done_count = targets finished, 0-5)
class LearningProgress(Base):
    __tablename__ = "learning_progress"
    __table_args__ = (UniqueConstraint("user_id", "level"),)
    progress_id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    level = Column(Integer, default=1)
    done_count = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow)

# Table for per-unit progress (one row per user, level and target; done_count = units finished, 0-12)
class UnitProgress(Base):
    __tablename__ = "unit_progress"
    __table_args__ = (UniqueConstraint("user_id", "level", "target"),)
    progress_id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    level = Column(Integer, default=1)
    target = Column(Integer)
    done_count = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow)

# Spaced-repetition (SM-2) schedule, one row per user, mode and word. The client computes the state; the server stores it.
class ReviewState(Base):
    __tablename__ = "review_states"
    __table_args__ = (
        UniqueConstraint("user_id", "mode", "word_key"),
        Index("ix_review_states_user_mode", "user_id", "mode"),
    )
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    mode = Column(String(10), nullable=False)               # flashcards | writing
    word_key = Column(String(401), nullable=False)          # hawaiian|english
    ef = Column(Float, nullable=False)
    interval_days = Column(Integer, nullable=False)
    repetitions = Column(Integer, nullable=False)
    due_at = Column(BigInteger, nullable=False)             # when the word is next due, UTC ms
    learning_step = Column(Integer, nullable=True)          # short learning step (0, 1, ...) or null once graduated
    reviewed_at = Column(BigInteger, nullable=False)        # client ms
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

# Table for users' streak and activity counters
class UserStats(Base):
    __tablename__ = "user_stats"
    user_id = Column(Integer, primary_key=True)
    cards_studied = Column(Integer, default=0, nullable=False)
    words_written = Column(Integer, default=0, nullable=False)
    sets_completed = Column(Integer, default=0, nullable=False)
    current_streak = Column(Integer, default=0, nullable=False)
    best_streak = Column(Integer, default=0, nullable=False)
    last_active_date = Column(String, nullable=True) # YYYY-MM-DD in the user's local time

# Table for per-set writing progress
class SetProgress(Base):
    __tablename__ = "set_progress"
    __table_args__ = (UniqueConstraint("user_id", "set_key"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    set_key = Column(String, nullable=False)
    best_writing_streak = Column(Integer, default=0, nullable=False)
    perfect_run = Column(Boolean, default=False, nullable=False)

# One row per set finished at a given frequency filter level (1 = All ... 5 = most common only)
class SetCompletion(Base):
    __tablename__ = "set_completions"
    __table_args__ = (UniqueConstraint("user_id", "set_key", "min_frequency"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    set_key = Column(String, nullable=False)
    min_frequency = Column(Integer, nullable=False)
    completed_at = Column(DateTime, nullable=False)

# Analytics: one row each time a set is opened / first answered / completed.
# No foreign key to users on purpose: rows outlive the account (anonymized on deletion).
class SetEvent(Base):
    __tablename__ = "set_events"
    __table_args__ = (
        Index("ix_set_events_set", "set_key", "mode", "min_frequency", "occurred_at"),
        Index("ix_set_events_visitor", "visitor_id", "set_key"),
        Index("ix_set_events_user", "user_id"),
    )
    id = Column(Integer, primary_key=True)
    occurred_at = Column(DateTime, nullable=False)          # server UTC
    user_id = Column(Integer, nullable=True)                # NULL for logged-out visitors and deleted accounts
    visitor_id = Column(String(36), nullable=False)         # random per-browser id
    source = Column(String(9), nullable=False)             # account | anonymous | deleted
    set_key = Column(String(200), nullable=False)
    min_frequency = Column(Integer, nullable=False, default=1)
    mode = Column(String(10), nullable=False)               # flashcards | writing | quiz
    variant = Column(String(20), nullable=True)             # flashcards: front language; writing: to_hawaiian; quiz: {writing,mc,connect}_{to_haw,to_eng}
    event_type = Column(String(14), nullable=False)         # set_opened | set_started | set_completed

# Analytics: one row per attempt (grade, wrong guess, hint, give up, correct answer)
class AttemptEvent(Base):
    __tablename__ = "attempt_events"
    __table_args__ = (
        Index("ix_attempt_events_set", "set_key", "mode", "min_frequency", "occurred_at"),
        Index("ix_attempt_events_word", "word_hawaiian", "set_key"),
        Index("ix_attempt_events_visitor", "visitor_id"),
        Index("ix_attempt_events_user", "user_id"),
    )
    id = Column(Integer, primary_key=True)
    occurred_at = Column(DateTime, nullable=False)
    user_id = Column(Integer, nullable=True)
    visitor_id = Column(String(36), nullable=False)
    source = Column(String(9), nullable=False)
    set_key = Column(String(200), nullable=False)
    min_frequency = Column(Integer, nullable=False, default=1)
    mode = Column(String(10), nullable=False)               # flashcards | writing | quiz
    variant = Column(String(20), nullable=True)             # see SetEvent.variant
    word_hawaiian = Column(String(200), nullable=False)
    # correct | correct_helped | incorrect | hint_blanks | hint_letter | gave_up
    outcome = Column(String(14), nullable=False)
    is_retry = Column(Boolean, nullable=False, default=False)
    is_spaced = Column(Boolean, nullable=False, default=False)

# Analytics: one row per submitted quiz (summary; per-word attempts live in attempt_events with mode='quiz').
# No foreign key to users on purpose, like the event tables. quiz_id is the idempotency key.
class QuizResult(Base):
    __tablename__ = "quiz_results"
    __table_args__ = (
        Index("ix_quiz_results_set", "set_key", "occurred_at"),
        Index("ix_quiz_results_user", "user_id"),
        Index("ix_quiz_results_visitor", "visitor_id"),
    )
    id = Column(Integer, primary_key=True)
    occurred_at = Column(DateTime, nullable=False)          # server UTC
    user_id = Column(Integer, nullable=True)                # NULL for logged-out visitors and deleted accounts
    visitor_id = Column(String(36), nullable=False)
    source = Column(String(9), nullable=False)              # account | anonymous | deleted
    quiz_id = Column(String(36), nullable=False, unique=True)
    set_key = Column(String(200), nullable=False)
    local_date = Column(String(10), nullable=False)         # client date, or the server UTC date when out of range
    question_count = Column(Integer, nullable=False)        # 5 or 10
    score = Column(Float, nullable=False)
    writing_total = Column(Integer, nullable=False)
    writing_correct = Column(Integer, nullable=False)
    mc_total = Column(Integer, nullable=False)
    mc_correct = Column(Integer, nullable=False)
    connect_total = Column(Integer, nullable=False)
    connect_score = Column(Float, nullable=False)
    unanswered = Column(Integer, nullable=False)

# Table for users' unlocked achievements
class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_id"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    achievement_id = Column(String, nullable=False)
    unlocked_at = Column(DateTime, nullable=False)
