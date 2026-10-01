"""회원가입·로그인·토큰.

사용자 저장소는 지금 서버 메모리다(재시작하면 지워지고 데모 계정만 다시 생긴다).
Postgres로 바꿀 때는 UserStore와 같은 메서드를 가진 클래스로 store만 교체한다.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from typing import Dict, Optional

from fastapi import Header, HTTPException

SECRET_KEY = os.getenv("SECRET_KEY") or "etabuilder-dev-secret"
TOKEN_TTL_SECONDS = 7 * 24 * 3600
DEMO_EMAIL = "demo@etabuilder.kr"
DEMO_PASSWORD = "demo1234"


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()


class UserStore:
    def __init__(self):
        self._users: Dict[str, dict] = {}
        self._lock = threading.Lock()

    def create(self, email: str, password: str, name: Optional[str]) -> dict:
        with self._lock:
            if email in self._users:
                raise ValueError("이미 가입한 이메일이에요.")
            salt = secrets.token_hex(8)
            user = {"email": email, "name": name or email.split("@")[0], "salt": salt,
                    "password_hash": _hash_password(password, salt), "transcript": None,
                    "created_at": int(time.time())}
            self._users[email] = user
            return user

    def get(self, email: str) -> Optional[dict]:
        return self._users.get(email)

    def verify(self, email: str, password: str) -> Optional[dict]:
        user = self.get(email)
        if user and hmac.compare_digest(user["password_hash"], _hash_password(password, user["salt"])):
            return user
        return None

    def save_transcript(self, email: str, transcript: dict) -> None:
        with self._lock:
            if email in self._users:
                self._users[email]["transcript"] = transcript


store = UserStore()
store.create(DEMO_EMAIL, DEMO_PASSWORD, "데모 사용자")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def issue_token(email: str) -> str:
    payload = _b64(json.dumps({"sub": email, "exp": int(time.time()) + TOKEN_TTL_SECONDS}).encode())
    signature = _b64(hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def read_token(token: str) -> Optional[str]:
    try:
        payload, signature = token.split(".")
        expected = _b64(hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        return data["sub"] if data["exp"] > time.time() else None
    except (ValueError, KeyError):
        return None


def public_user(user: dict) -> dict:
    return {"email": user["email"], "name": user["name"], "transcript": user["transcript"]}


def _user_from_header(authorization: Optional[str]) -> Optional[dict]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    email = read_token(authorization[7:].strip())
    return store.get(email) if email else None


def current_user(authorization: Optional[str] = Header(None)) -> dict:
    user = _user_from_header(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="로그인이 필요해요.")
    return user


def optional_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    return _user_from_header(authorization)
