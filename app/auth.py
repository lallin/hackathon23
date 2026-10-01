"""회원가입·로그인·토큰.

DATABASE_URL이 있으면 Postgres(app_users)에, 없으면 서버 메모리에 저장한다.
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

from app import db

SECRET_KEY = os.getenv("SECRET_KEY") or "etabuilder-dev-secret"
TOKEN_TTL_SECONDS = 7 * 24 * 3600
DEMO_EMAIL = "demo@etabuilder.kr"
DEMO_PASSWORD = "demo1234"


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()


class UserStore:
    """서버 메모리 저장소. DB가 없을 때 쓴다(재시작하면 지워진다)."""

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


class PgUserStore(UserStore):
    """Supabase Postgres의 app_users 테이블에 저장한다."""

    def create(self, email: str, password: str, name: Optional[str]) -> dict:
        salt = secrets.token_hex(8)
        rows = db.execute(
            "insert into app_users (email, name, salt, password_hash) values (%s, %s, %s, %s) "
            "on conflict (email) do nothing returning email",
            (email, name or email.split("@")[0], salt, _hash_password(password, salt)),
        )
        if not rows:
            raise ValueError("이미 가입한 이메일이에요.")
        return self.get(email)

    def get(self, email: str) -> Optional[dict]:
        rows = db.execute("select email, name, salt, password_hash, transcript, "
                          "extract(epoch from created_at)::bigint from app_users where email = %s", (email,))
        if not rows:
            return None
        email, name, salt, password_hash, transcript, created_at = rows[0]
        return {"email": email, "name": name, "salt": salt, "password_hash": password_hash,
                "transcript": transcript, "created_at": created_at}

    def save_transcript(self, email: str, transcript: Optional[dict]) -> None:
        value = db.jsonb(transcript) if transcript is not None else None
        db.execute("update app_users set transcript = %s where email = %s", (value, email))


store = PgUserStore() if db.init() else UserStore()
if not store.get(DEMO_EMAIL):
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
