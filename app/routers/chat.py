from fastapi import APIRouter, HTTPException

from ai_service import LLMError, ask_text
from app.nlu import handle_chat
from app.schemas import AskRequest, ChatRequest

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat")
def chat(req: ChatRequest):
    """대화 → 의도, 합쳐진 조건·체크리스트, 답장. AI 호출이 실패해도 200으로 상태를 그대로 돌려준다."""
    return handle_chat(req)


@router.post("/ask")
def ask(req: AskRequest):
    """기존 Streamlit용 단순 채팅."""
    try:
        return {"response": ask_text(req.user_message)}
    except LLMError as e:
        raise HTTPException(status_code=503, detail=str(e))
