"""과목명 찾기: 이름이 여러 과목에 걸리면 아무거나 고르지 않고 되묻는다.

    python -m pytest tests/test_course_lookup.py -q
"""
import os
import sys
from pathlib import Path

os.environ.setdefault("OPENAI_API_KEY", "test")
os.environ["DATABASE_URL"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.answers import add_course_plan
from app.catalog import catalog
from app.schemas import ChatRequest


def test_exact_name_finds_one_course():
    assert catalog.find_course_by_name("스크린영어")["name"] == "스크린영어"


def test_partial_name_with_many_matches_is_ambiguous():
    assert len(catalog.find_courses_by_name("영어")) > 1
    assert catalog.find_course_by_name("영어") is None


def test_add_course_asks_again_when_ambiguous():
    plan = add_course_plan({"course_name": "영어"}, ChatRequest(message="영어 넣어줘"))
    assert plan["type"] == "none"
    assert "여러 개" in plan["message"] and "스크린영어" in plan["message"]
