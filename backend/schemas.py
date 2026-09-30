from pydantic import BaseModel, StringConstraints, EmailStr, Field, ConfigDict
from typing import Annotated, Literal, Optional, Union

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

# Analytics events. extra='forbid' so a client can never send its own user_id / source / timestamp.
UUID_PATTERN = r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

class _StudyEventBase(BaseModel):
    model_config = ConfigDict(extra='forbid')
    visitor_id: Annotated[str, StringConstraints(pattern=UUID_PATTERN)]
    set_key: Annotated[str, StringConstraints(min_length=1, max_length=200, pattern=r'^[^\x00-\x1f\x7f]+$')]
    min_frequency: int = Field(default=1, ge=1, le=5)
    mode: Literal['flashcards', 'writing']
    variant: Optional[Literal['hawaiian', 'english', 'to_hawaiian']] = None

class SetEventIn(_StudyEventBase):
    kind: Literal['set']
    event_type: Literal['set_opened', 'set_started', 'set_completed']

class AttemptEventIn(_StudyEventBase):
    kind: Literal['attempt']
    word_hawaiian: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    outcome: Literal['correct', 'correct_helped', 'incorrect', 'hint_blanks', 'hint_letter', 'gave_up']
    is_retry: bool

class StudyEventBatch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    events: Annotated[list[Annotated[Union[SetEventIn, AttemptEventIn], Field(discriminator='kind')]],
                      Field(min_length=1, max_length=50)]

class ActivityEvent(BaseModel):
    type: Literal['card_graded', 'word_correct', 'set_completed']
    local_date: Annotated[str, StringConstraints(pattern=r'^\d{4}-\d{2}-\d{2}$')]
    set_key: Optional[Annotated[str, StringConstraints(max_length=200)]] = None
    streak: Optional[int] = Field(default=None, ge=0)
    set_size: Optional[int] = Field(default=None, ge=1)
    full_set: bool = False
    # frequency filter the deck was finished at (1 = All); each level counts as its own completion
    min_frequency: int = Field(default=1, ge=1, le=5)
