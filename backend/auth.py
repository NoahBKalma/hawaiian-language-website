import calendar
from datetime import datetime, timedelta
from jose import jwt, JWTError
from fastapi import HTTPException
import bcrypt
from models import User

# tokens come from /login
from fastapi.security import OAuth2PasswordBearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# For getting the secret key from the .env
from dotenv import load_dotenv
from os import getenv
load_dotenv()
SECRET_KEY = getenv("SECRET_KEY")

# For jwt
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 2880 # how long a login lasts without use; /signed-in-user hands out a fresh token past the halfway point

# encode() turns str->bytes
# decode() turns bytes->str
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hash: str) -> bool:
    # bcrypt raises past 72 bytes; no stored password is that long, so it can't match
    if len(password.encode()) > 72:
        return False
    return bcrypt.checkpw(password.encode(), hash.encode())

# Renewal never extends a login past this: "login_at" (the original sign-in) is carried over to every renewed token
SESSION_MAX_DAYS = 30

def _login_time(payload: dict) -> datetime:
    # tokens from before this cap existed have no "login_at"; count them as issued one lifetime before they expire
    if "login_at" in payload:
        return datetime.utcfromtimestamp(payload["login_at"])
    return datetime.utcfromtimestamp(payload["exp"]) - timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

def create_access_token(user_id: int, token_version: int = 0, login_at: datetime = None) -> str:
    now = datetime.utcnow()
    login_at = login_at or now
    expiration_time = min(now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES), login_at + timedelta(days=SESSION_MAX_DAYS))
    payload = {"user_id": user_id, "tv": token_version, "login_at": calendar.timegm(login_at.utctimetuple()), "exp": expiration_time}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

# A fresh token for the same login (keeps the original login_at so the cap still counts from the first sign-in)
def renew_access_token(jwt_token: str, user_id: int, token_version: int) -> str:
    payload = jwt.decode(jwt_token, SECRET_KEY, algorithms=[ALGORITHM])
    return create_access_token(user_id, token_version, _login_time(payload))

# True once a valid token has used up more than half its life, so regular visitors stay logged in,
# unless a new token wouldn't last any longer because the session cap is reached
def token_needs_renewal(jwt_token: str) -> bool:
    try:
        payload = jwt.decode(jwt_token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return False
    expires = datetime.utcfromtimestamp(payload["exp"])
    if expires >= _login_time(payload) + timedelta(days=SESSION_MAX_DAYS):
        return False
    return expires - datetime.utcnow() < timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES / 2)

# Like oauth2_scheme but a missing token is allowed (logged-out visitors)
oauth2_optional = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

def get_current_user(jwt_token: str, database_session):
    try:
        payload = jwt.decode(jwt_token, SECRET_KEY, algorithms=[ALGORITHM])
        user = database_session.query(User).filter(User.user_id == payload.get("user_id")).first()

        # Check for deleted account, and for a token issued before the last password change
        # (tokens from before token versions existed have no "tv" and count as version 0)
        # and for a login older than the session cap (renewed tokens keep their original login time)
        if (user is not None and payload.get("tv", 0) == user.token_version
                and datetime.utcnow() < _login_time(payload) + timedelta(days=SESSION_MAX_DAYS)):
            return user
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# The signed-in user, or None for no/invalid/expired token or a deleted account (never raises)
def get_optional_user(jwt_token, database_session):
    if not jwt_token:
        return None
    try:
        return get_current_user(jwt_token, database_session)
    except HTTPException:
        return None
