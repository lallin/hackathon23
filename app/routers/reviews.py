from fastapi import APIRouter

from app.insights import on_demand
from app.schemas import OnDemandRequest

router = APIRouter(prefix="/api/reviews", tags=["reviews"])


@router.post("/on-demand")
def reviews_on_demand(req: OnDemandRequest):
    """과목 하나의 교수별 수강평: 강의 데이터에 있으면 바로, 없으면 수집·분석·저장. 체크리스트 기준 순위."""
    return on_demand(req.course_name, req.professor, req.checklist)
