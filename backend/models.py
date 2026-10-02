from sqlalchemy import Column, Integer, String, DateTime, Boolean, UniqueConstraint, Index

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
    mode = Column(String(10), nullable=False)               # flashcards | writing
    variant = Column(String(20), nullable=True)             # flashcards: front language; writing: to_hawaiian
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
    mode = Column(String(10), nullable=False)
    variant = Column(String(20), nullable=True)
    word_hawaiian = Column(String(200), nullable=False)
    # correct | correct_helped | incorrect | hint_blanks | hint_letter | gave_up
    outcome = Column(String(14), nullable=False)
    is_retry = Column(Boolean, nullable=False, default=False)

# Table for users' unlocked achievements
class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_id"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    achievement_id = Column(String, nullable=False)
    unlocked_at = Column(DateTime, nullable=False)
