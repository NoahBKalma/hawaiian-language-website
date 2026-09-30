from sqlalchemy import Column, Integer, String, DateTime, Boolean, UniqueConstraint

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
    set_id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    set_key = Column(String)
    set_name_haw = Column(String)
    set_name_eng = Column(String)
    set_size = Column(Integer)

# Table for users' to continue studying sets
class ContinueSet(Base):
    __tablename__ = "continue_sets"
    set_id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    set_key = Column(String)
    min_frequency = Column(Integer, default=1)
    set_name_haw = Column(String)
    set_name_eng = Column(String)
    last_studied = Column(Integer)
    set_size = Column(Integer)
    time_studied = Column(DateTime, default=datetime.utcnow)
    
# Table for users correct/incorrect card results
class CardResult(Base):
    __tablename__ = "card_results"
    num_id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    word_hawaiian = Column(String)
    correct_count = Column(Integer)
    incorrect_count = Column(Integer)

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
    completed = Column(Boolean, default=False, nullable=False)
    completed_at = Column(DateTime, nullable=True)

# One row per set finished at a given frequency filter level (1 = All ... 5 = most common only)
class SetCompletion(Base):
    __tablename__ = "set_completions"
    __table_args__ = (UniqueConstraint("user_id", "set_key", "min_frequency"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    set_key = Column(String, nullable=False)
    min_frequency = Column(Integer, nullable=False)
    completed_at = Column(DateTime, nullable=False)

# Table for users' unlocked achievements
class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_id"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    achievement_id = Column(String, nullable=False)
    unlocked_at = Column(DateTime, nullable=False)
