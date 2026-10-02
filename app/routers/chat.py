from fastapi import APIRouter

from app.nlu import handle_chat
from app.schemas import ChatRequest

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat")
def chat(req: ChatRequest):
    """대화 → 의도, 합쳐진 조건·체크리스트, 답장. AI 호출이 실패해도 200으로 상태를 그대로 돌려준다."""
    return handle_chat(req)

