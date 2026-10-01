"""API 요청·응답에 공통으로 쓰는 형식."""
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

Day = Literal["월", "화", "수", "목", "금"]
Level = Literal["low", "mid", "high"]
StyleId = Literal["graduation", "late_riser", "club", "career", "commute"]
PreferredTime = Literal["any", "morning", "afternoon"]


class ChecklistItem(BaseModel):
    key: str = Field(..., examples=["team_project"], description='자유 항목은 "custom:교수님이친절함"')
    label: str = Field(..., examples=["팀플"])
    type: Literal["level", "toggle"] = "level"
    level: Optional[Level] = Field(None, description="toggle이면 null")
    enabled: bool = True
    source: Literal["style", "chat", "user"] = "user"


class Conditions(BaseModel):
    target_credits: int = Field(18, ge=9, le=21)
    free_days: List[Day] = Field(default_factory=list)
    preferred_time: PreferredTime = "any"
    style: StyleId = "graduation"


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    conditions: Conditions = Field(default_factory=Conditions)
    checklist: List[ChecklistItem] = Field(default_factory=list)
    history: List[ChatMessage] = Field(default_factory=list)


class AskRequest(BaseModel):
    user_message: str


class StyleRequest(BaseModel):
    style: StyleId
    checklist: List[ChecklistItem] = Field(default_factory=list)


class GenerateRequest(BaseModel):
    admission_year: int = Field(..., examples=[2024])
    major: str = Field(..., examples=["cse"])
    completed_course_ids: List[str] = Field(default_factory=list)
    completed_credits: Optional[Dict[str, float]] = Field(
        None, description="성적표 분석 결과의 영역별 이수 학점. 없으면 completed_course_ids로 계산"
    )
    conditions: Conditions = Field(default_factory=Conditions)
    checklist: List[ChecklistItem] = Field(default_factory=list)
    pinned_section_ids: List[str] = Field(default_factory=list)
    excluded_course_ids: List[str] = Field(default_factory=list)


class OnDemandRequest(BaseModel):
    course_name: str = Field(..., examples=["운영체제"])
    professor: Optional[str] = None
    checklist: List[ChecklistItem] = Field(default_factory=list)


class SampleTranscriptRequest(BaseModel):
    admission_year: Optional[int] = None
    major: Optional[str] = None


class SignupRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=4)
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str
