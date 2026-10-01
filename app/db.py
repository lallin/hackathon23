"""Supabase Postgres 연결. DATABASE_URL이 없거나 연결에 실패하면 enabled()가 False이고,
호출한 쪽은 메모리·파일 저장으로 동작한다.

테이블 (서버가 시작할 때 없으면 만든다)
- app_users: 계정과 저장된 이수 내역
- seed_data: requirements / catalog / insights JSON 문서. 행이 있으면 data/seed/ 파일 대신 쓴다.
- collected_insights: 온디맨드로 수집한 강의 데이터
- llm_cache: 챗봇 해석·자유 항목 판정의 AI 응답 (재배포 뒤에도 같은 입력엔 같은 답). 성적표 결과는 넣지 않는다
"""
import os
import threading
from typing import Any, List, Optional

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL") or ""

SCHEMA = """
create table if not exists app_users (
    email text primary key,
    name text not null,
    salt text not null,
    password_hash text not null,
    transcript jsonb,
    created_at timestamptz not null default now()
);
create table if not exists seed_data (
    name text primary key,
    data jsonb not null,
    updated_at timestamptz not null default now()
);
create table if not exists collected_insights (
    lecture_id text primary key,
    data jsonb not null,
    collected_at timestamptz not null default now()
);
create table if not exists llm_cache (
    key text primary key,
    kind text not null,
    value jsonb not null,
    created_at timestamptz not null default now()
);
"""

_conn = None
_lock = threading.Lock()
_enabled = False
_initialized = False


def _connect():
    import psycopg  # jsonb 컬럼은 dict/list로 읽힌다

    return psycopg.connect(DATABASE_URL, autocommit=True, connect_timeout=10)


def init() -> bool:
    """연결하고 테이블을 만든다. 실패하면 DB 없이 동작한다. 여러 번 불러도 한 번만 한다."""
    global _conn, _enabled, _initialized
    if _initialized or not DATABASE_URL:
        return _enabled
    _initialized = True
    try:
        _conn = _connect()
        _conn.execute(SCHEMA)
        _enabled = True
    except Exception as e:  # 연결 실패는 서버 기동을 막지 않는다
        print(f"[db] Postgres 연결 실패, 메모리·파일 저장으로 동작합니다: {e}")
        _enabled = False
    return _enabled


def enabled() -> bool:
    return _enabled


def execute(sql: str, params: Optional[tuple] = None) -> List[tuple]:
    """쿼리를 실행하고 결과 행을 돌려준다. 연결이 끊겼으면 한 번 다시 연결한다."""
    global _conn
    import psycopg

    with _lock:
        for attempt in (1, 2):
            try:
                if _conn is None or _conn.closed:
                    _conn = _connect()
                cur = _conn.execute(sql, params)
                return cur.fetchall() if cur.description else []
            except psycopg.OperationalError:
                _conn = None
                if attempt == 2:
                    raise
    return []


def jsonb(value: Any):
    from psycopg.types.json import Jsonb

    return Jsonb(value)
