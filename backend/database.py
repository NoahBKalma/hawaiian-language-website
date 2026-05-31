from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# sets path for sqlite file
SQLALCHEMY_DATABASE_URL = "sqlite:///./hawaiian.db"

# creates the sql engine
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# creates temporary connections for the database
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base for the other models
class Base(DeclarativeBase):
    pass