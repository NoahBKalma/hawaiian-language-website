from sqlalchemy import Column, Integer, String

from database import Base

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
    set_name = Column(String)
    
# Table for users correct/incorrect card results
class CardResult(Base):
    __tablename__ = "card_results"
    num_id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    word_hawaiian = Column(String)
    correct_count = Column(Integer)
    incorrect_count = Column(Integer)