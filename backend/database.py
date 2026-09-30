import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# sets path for sqlite file
SQLALCHEMY_DATABASE_URL = "sqlite:///./hawaiian.db"

# Applies to every new connection. The busy timeout makes a blocked write wait instead of failing with
# "database is locked". Write-ahead logging (WAL) lets readers and the writer overlap, but it keeps extra
# hawaiian.db-wal / -shm files next to the database that change on every write (editors and Live Server
# watchers notice them), so it is opt-in: set SQLITE_WAL=1 on the server (e.g. the Pi) to use it.
def configure_sqlite(target_engine, wal=None):
    use_wal = (os.getenv("SQLITE_WAL", "0") == "1") if wal is None else wal

    @event.listens_for(target_engine, "connect")
    def set_sqlite_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        # journal_mode is stored in the database file, so always set it explicitly (DELETE is the default)
        cursor.execute(f"PRAGMA journal_mode={'WAL' if use_wal else 'DELETE'}")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

# creates the sql engine
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
configure_sqlite(engine)

# creates temporary connections for the database
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base for the other models
class Base(DeclarativeBase):
    pass
