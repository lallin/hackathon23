from fastapi import APIRouter, Depends, HTTPException

from app.auth import current_user, issue_token, normalize_email, public_user, store
from app.schemas import LoginRequest, SignupRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup")
def signup(req: SignupRequest):
    email = normalize_email(req.email)
    if "@" not in email:
        raise HTTPException(status_code=400, detail="이메일 형식이 아니에요.")
    try:
        user = store.create(email, req.password, req.name)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"token": issue_token(email), "user": public_user(user)}


@router.post("/login")
def login(req: LoginRequest):
    email = normalize_email(req.email)
    user = store.verify(email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 맞지 않아요.")
    return {"token": issue_token(email), "user": public_user(user)}


@router.get("/me")
def me(user: dict = Depends(current_user)):
    return public_user(user)
