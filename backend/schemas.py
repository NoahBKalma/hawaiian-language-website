import re
from datetime import date
from pydantic import BaseModel, StringConstraints, EmailStr, Field, ConfigDict, model_validator, field_validator
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

class LearningProgressIn(BaseModel):
    level: Literal[1] = 1
    done_count: int = Field(ge=0, le=5)

# Units in every target; keep in sync with scripts/unit-data.js
UNITS_PER_TARGET = 4

class UnitProgressIn(BaseModel):
    level: Literal[1] = 1
    target: int = Field(ge=1, le=5)
    done_count: int = Field(ge=0, le=UNITS_PER_TARGET)

class TutorialSeenIn(BaseModel):
    page: Literal["flashcards", "writing"]

# Spaced-repetition schedules. Items are loose dicts in the batch and validated one by one in the handler,
# so a single bad item is skipped instead of rejecting the whole PUT.
class ReviewStateItem(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mode: Literal['flashcards', 'writing']
    word_key: Annotated[str, StringConstraints(min_length=3, max_length=401, pattern=r'^[^\x00-\x1f\x7f]*\|[^\x00-\x1f\x7f]*$')]
    ef: float = Field(ge=1.3, le=10)
    interval_days: int = Field(ge=0, le=36500)
    repetitions: int = Field(ge=0, le=10000)
    due_at: int = Field(ge=0, le=253402300799000)     # UTC ms, up to the year 9999
    learning_step: Optional[int] = Field(default=None, ge=0, le=9)
    reviewed_at: int = Field(ge=0)

class ReviewStateBatch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    items: Annotated[list[dict], Field(min_length=1, max_length=500)]

# Analytics events. extra='forbid' so a client can never send its own user_id / source / timestamp.
UUID_PATTERN = r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

class _StudyEventBase(BaseModel):
    model_config = ConfigDict(extra='forbid')
    visitor_id: Annotated[str, StringConstraints(pattern=UUID_PATTERN)]
    set_key: Annotated[str, StringConstraints(min_length=1, max_length=200, pattern=r'^[^\x00-\x1f\x7f]+$')]
    min_frequency: int = Field(default=1, ge=1, le=5)
    mode: Literal['flashcards', 'writing', 'quiz']
    variant: Optional[Literal['hawaiian', 'english', 'to_hawaiian',
                              'writing_to_haw', 'writing_to_eng', 'mc_to_haw', 'mc_to_eng',
                              'connect_to_haw', 'connect_to_eng']] = None

class SetEventIn(_StudyEventBase):
    kind: Literal['set']
    event_type: Literal['set_opened', 'set_started', 'set_completed']

class AttemptEventIn(_StudyEventBase):
    kind: Literal['attempt']
    word_hawaiian: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    outcome: Literal['correct', 'correct_helped', 'incorrect', 'hint_blanks', 'hint_letter', 'gave_up']
    is_retry: bool
    is_spaced: bool = False

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

# One submitted quiz. extra='forbid' like the events: user_id / source / timestamp come from the server.
class QuizResultIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    quiz_id: Annotated[str, StringConstraints(pattern=UUID_PATTERN)]
    visitor_id: Annotated[str, StringConstraints(pattern=UUID_PATTERN)]
    set_key: Annotated[str, StringConstraints(min_length=1, max_length=200, pattern=r'^[^\x00-\x1f\x7f]+$')]
    local_date: Annotated[str, StringConstraints(pattern=r'^\d{4}-\d{2}-\d{2}$')]
    question_count: Literal[5, 10]
    score: float = Field(ge=0)
    writing_total: int = Field(ge=0)
    writing_correct: int = Field(ge=0)
    mc_total: int = Field(ge=0)
    mc_correct: int = Field(ge=0)
    connect_total: int = Field(ge=0)
    connect_score: float = Field(ge=0)
    unanswered: int = Field(ge=0)

    @model_validator(mode='after')
    def _consistent(self):
        if self.writing_total + self.mc_total + self.connect_total != self.question_count:
            raise ValueError("per-type totals must sum to question_count")
        if self.writing_correct > self.writing_total or self.mc_correct > self.mc_total \
                or self.connect_score > self.connect_total + 1e-6:
            raise ValueError("correct count exceeds its total")
        if abs(self.score - (self.writing_correct + self.mc_correct + self.connect_score)) > 1e-6:
            raise ValueError("score must equal the per-type sum")
        if self.unanswered >= self.question_count:
            raise ValueError("a quiz needs at least one answer")
        return self
