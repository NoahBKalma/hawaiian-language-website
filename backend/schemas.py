from pydantic import BaseModel, StringConstraints, EmailStr, Field
from typing import Annotated, Literal, Optional

class UserRegister(BaseModel):
    username: Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9_.-]+$')]
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=1)]

class UserLogin(BaseModel):
    username: Optional[Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9_.-]+$')]] = None
    email: Optional[EmailStr] = None
    password: Annotated[str, StringConstraints(min_length=1)]

class DeleteAccount(BaseModel):
    password: str

class UserEdit(BaseModel):
    new_username: Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9_.-]+$')]
    new_email: EmailStr

class PasswordEdit(BaseModel):
    curr_password: str
    new_password: Annotated[str, StringConstraints(min_length=1)]

class ToggleFavoriteSet(BaseModel):
    set_key: str
    set_name_haw: str
    set_name_eng: str
    set_size: int

class UpdateContinueStudy(BaseModel):
    set_key: str
    min_frequency: int = Field(default=1, ge=1, le=5)
    set_name_haw: str
    set_name_eng: str
    last_studied: int
    set_size: int

class UpdateCardResult(BaseModel):
    word_hawaiian: str
    result: bool

class ActivityEvent(BaseModel):
    type: Literal['card_graded', 'word_correct', 'set_completed']
    local_date: Annotated[str, StringConstraints(pattern=r'^\d{4}-\d{2}-\d{2}$')]
    set_key: Optional[Annotated[str, StringConstraints(max_length=200)]] = None
    streak: Optional[int] = Field(default=None, ge=0)
    set_size: Optional[int] = Field(default=None, ge=1)
    full_set: bool = False
    # frequency filter the deck was finished at (1 = All); each level counts as its own completion
    min_frequency: int = Field(default=1, ge=1, le=5)
