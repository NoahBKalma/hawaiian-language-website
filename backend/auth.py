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

def create_access_token(user_id: int, token_version: int = 0) -> str:
    expiration_time = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"user_id": user_id, "tv": token_version, "exp": expiration_time}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

# True once a valid token has used up more than half its life, so regular visitors stay logged in
def token_needs_renewal(jwt_token: str) -> bool:
    try:
        payload = jwt.decode(jwt_token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return False
    remaining = datetime.utcfromtimestamp(payload["exp"]) - datetime.utcnow()
    return remaining < timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES / 2)

# Like oauth2_scheme but a missing token is allowed (logged-out visitors)
oauth2_optional = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

def get_current_user(jwt_token: str, database_session):
    try:
        payload = jwt.decode(jwt_token, SECRET_KEY, algorithms=[ALGORITHM])
        user = database_session.query(User).filter(User.user_id == payload.get("user_id")).first()

        # Check for deleted account, and for a token issued before the last password change
        # (tokens from before token versions existed have no "tv" and count as version 0)
        if user is not None and payload.get("tv", 0) == user.token_version:
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
