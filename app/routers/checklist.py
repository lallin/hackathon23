from fastapi import APIRouter

from app.checklist import apply_style
from app.schemas import StyleRequest

router = APIRouter(prefix="/api/checklist", tags=["checklist"])


@router.post("/style")
def change_style(req: StyleRequest):
    """스타일 변경 → 프리셋을 합친 체크리스트. FE가 합치기 규칙을 따로 구현하지 않아도 된다."""
    before = {i.key for i in req.checklist}
    checklist = apply_style(req.checklist, req.style)
    after = {i.key for i in checklist}
    return {
        "style": req.style,
        "checklist": [i.model_dump() for i in checklist],
        "added": sorted(after - before),
        "removed": sorted(before - after),
    }
