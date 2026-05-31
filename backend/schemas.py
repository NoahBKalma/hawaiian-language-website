from pydantic import BaseModel, StringConstraints, EmailStr
from typing import Annotated, Optional

class UserRegister(BaseModel):
    username: Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9_.-]+$')]
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    username: Optional[Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9_.-]+$')]] = None
    email: Optional[EmailStr] = None
    password: str
    
class AddFavoriteSet(BaseModel):
    set_name: str

class UpdateCardResult(BaseModel):
    word_hawaiian: str
    result: bool