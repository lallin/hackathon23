from fastapi import APIRouter, HTTPException

from app.scheduler import GenerateError, generate
from app.schemas import GenerateRequest

router = APIRouter(prefix="/api/timetable", tags=["timetable"])


@router.post("/generate")
def generate_timetable(req: GenerateRequest):
    """대기 중인 조건 전체 → 상위 5개 조합과 체크리스트 평가."""
    try:
        return generate(req)
    except GenerateError as e:
        raise HTTPException(status_code=400, detail=str(e))
