from fastapi import APIRouter

from app import answers
from app.insights import on_demand
from app.schemas import ChatRequest, CompareRequest, OnDemandRequest

router = APIRouter(prefix="/api", tags=["reviews"])


@router.post("/reviews/on-demand")
def reviews_on_demand(req: OnDemandRequest):
    """과목 하나의 교수님들을 체크리스트·별점으로 비교. 분반 시간과 추천 이유를 함께 준다."""
    return on_demand(req.course_name, req.professor, req.checklist)


@router.post("/compare")
def compare_lectures(req: CompareRequest):
    """챗봇 선택지에서 고른 강의(과목 × 교수) 두 개를 나란히 비교한다."""
    chat_req = ChatRequest(message="", checklist=req.checklist, context=req.context)
    return answers.compare_lectures(req.lecture_ids, chat_req)
