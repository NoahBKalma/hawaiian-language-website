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
ACCESS_TOKEN_EXPIRE_MINUTES = 10080 # how often they need to log in

# encode() turns str->bytes
# decode() turns bytes->str
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), hash.encode())

def create_access_token(user_id: int) -> str:
    expiration_time = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"user_id": user_id, "exp": expiration_time}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(jwt_token: str, database_session):
    try:
        payload = jwt.decode(jwt_token, SECRET_KEY, algorithms=[ALGORITHM])
        return database_session.query(User).filter(User.user_id == payload.get("user_id")).first()
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
