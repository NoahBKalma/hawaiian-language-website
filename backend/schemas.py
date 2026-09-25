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
        
class UserEdit(BaseModel):
    new_username: Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9_.-]+$')]
    new_email: EmailStr

class PasswordEdit(BaseModel):
    curr_password: str
    new_password: str

class ToggleFavoriteSet(BaseModel):
    set_name_haw: str
    set_name_eng: str
    set_size: int

class UpdateCardResult(BaseModel):
    word_hawaiian: str
    result: bool