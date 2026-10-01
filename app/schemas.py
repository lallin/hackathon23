"""API 요청·응답에 공통으로 쓰는 형식."""
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

Day = Literal["월", "화", "수", "목", "금"]
Level = Literal["low", "mid", "high"]
StyleId = Literal["graduation", "late_riser", "club", "career", "commute"]
PreferredTime = Literal["any", "morning", "afternoon"]


class ChecklistItem(BaseModel):
    key: str = Field(..., examples=["team_project"],
                     description='자유 항목은 "custom:교수님이친절함", 개수형은 "count:교양"')
    label: str = Field(..., examples=["팀플"])
    type: Literal["level", "toggle", "count"] = "level"
    level: Optional[Level] = Field(None, description="toggle·count면 null")
    count: Optional[int] = Field(None, ge=1, le=8, description="count형: 이 영역 과목을 몇 개 넣을지")
    enabled: bool = True
    source: Literal["style", "chat", "user"] = "user"


class Conditions(BaseModel):
    target_credits: int = Field(18, ge=1, le=23)
    free_days: List[Day] = Field(default_factory=list)
    preferred_time: PreferredTime = "any"
    style: StyleId = "graduation"


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatContext(BaseModel):
    """챗봇이 질문에 답할 때 근거로 쓰는 사용자 상황. 없으면 과목 정보만으로 답한다."""
    admission_year: Optional[int] = None
    major: Optional[str] = None
    completed_course_ids: List[str] = Field(default_factory=list)
    completed_credits: Optional[Dict[str, float]] = None
    section_ids: List[str] = Field(default_factory=list, description="지금 화면에 보이는 시간표 조합의 분반 id")


class ChatRequest(BaseModel):
    message: str
    conditions: Conditions = Field(default_factory=Conditions)
    checklist: List[ChecklistItem] = Field(default_factory=list)
    history: List[ChatMessage] = Field(default_factory=list)
    context: Optional[ChatContext] = None


class CompareRequest(BaseModel):
    lecture_ids: List[str] = Field(..., examples=[["NDGE11863-신문선", "NDGE14446-최수민"]],
                                   description="비교할 강의(과목 × 교수) 두 개")
    checklist: List[ChecklistItem] = Field(default_factory=list)
    context: Optional[ChatContext] = None


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


class RegroupCourse(BaseModel):
    course_id: Optional[str] = None
    name: str
    category: Literal["전필", "전선", "교필", "교선", "기타"]
    credits: float
    grade: Optional[str] = None
    # 성적표에 찍힌 이수구분과 교양 영역 (/api/transcript/parse 응답의 courses[].transcript_category·ge_area)
    transcript_category: Optional[str] = None
    ge_area: Optional[str] = None


class RegroupTranscriptRequest(BaseModel):
    """이미 읽은 성적표 과목(/api/transcript/parse 응답의 courses)을 다른 입학년도·학과 요람으로 다시 나눈다."""
    admission_year: int = Field(..., examples=[2025])
    major: str = Field(..., examples=["cse"])
    courses: List[RegroupCourse]
    excluded: List[dict] = []
    recognized_count: Optional[int] = None


class SignupRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=4)
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str
