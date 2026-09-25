from sqlalchemy import Column, Integer, String, DateTime

from database import Base

from datetime import datetime

# Class for the user
class User(Base):
    __tablename__ = "users"
    user_id = Column(Integer, primary_key=True)
    username = Column(String, unique=True)
    email = Column(String, unique=True)
    password_hash = Column(String)
    
# Table for users' favorite sets
class FavoriteSet(Base):
    __tablename__ = "favorites"
    set_id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    set_name_haw = Column(String)
    set_name_eng = Column(String)
    set_size = Column(Integer)

# Table for users' to continue studying sets
class ContinueSet(Base):
    __tablename__ = "continue_sets"
    set_id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
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