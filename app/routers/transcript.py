from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ai_service import LLMError
from app.auth import current_user, optional_user, store
from app.schemas import SampleTranscriptRequest
from app.transcript import load_sample, parse_pdf, summarize

router = APIRouter(prefix="/api/transcript", tags=["transcript"])

MAX_PDF_BYTES = 10 * 1024 * 1024


def _save(user: Optional[dict], result: dict) -> dict:
    if user:
        store.save_transcript(user["email"], result)
    return {**result, "saved": bool(user)}


@router.post("/parse")
def parse(
    file: UploadFile = File(..., description="성적표 PDF"),
    admission_year: Optional[int] = Form(None),
    major: Optional[str] = Form(None),
    user: Optional[dict] = Depends(optional_user),
):
    """성적표 PDF → 이수 현황. 로그인 상태면 계정에 저장한다. PDF 파일은 보관하지 않는다."""
    data = file.file.read()
    if not data[:5].startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="성적표는 PDF 파일만 올릴 수 있어요.")
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="PDF는 10MB까지 올릴 수 있어요.")
    try:
        courses, warnings = parse_pdf(data, file.filename or "transcript.pdf")
    except LLMError:
        raise HTTPException(status_code=503, detail="지금 성적표를 읽을 수 없어요. 잠시 후 다시 시도해 주세요.")
    finally:
        del data
    if not courses:
        raise HTTPException(status_code=422, detail="성적표에서 과목을 찾지 못했어요. 성적표 PDF가 맞는지 확인해 주세요.")
    # warnings: 성적표의 학기별·총 취득학점과 읽은 과목이 맞지 않을 때의 안내 (비어 있으면 검산 통과)
    return _save(user, {**summarize(courses, admission_year, major), "warnings": warnings})


@router.delete("")
def clear(user: dict = Depends(current_user)):
    """계정에 저장된 이수 내역을 지운다. 시연 전에 데모 계정을 처음 상태로 돌릴 때 쓴다."""
    store.save_transcript(user["email"], None)
    return {"saved": False}


@router.post("/sample")
def sample(req: SampleTranscriptRequest = SampleTranscriptRequest(), user: Optional[dict] = Depends(optional_user)):
    """샘플 성적표로 같은 형식의 결과를 돌려준다."""
    data = load_sample()
    result = summarize(data["courses"], req.admission_year or data["admission_year"], req.major or data["major"])
    return _save(user, result)
