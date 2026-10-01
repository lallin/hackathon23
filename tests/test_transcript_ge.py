"""교양 영역(기초교양·심화교양·KU소양) 현황을 입학년도 요람대로 계산하는지 확인하는 시험.

기초교양 세부 영역은 최소 과목 수, KU소양 세부 영역은 최소 학점, 심화교양은 6개 영역 중 4개 이상.
성적표 이수구분 칸의 기초·심화·소양으로 영역을 정하고, 세부 영역은 그 해 요람 과목표·강의계획서 영역으로 정한다.

    python -m pytest tests/test_transcript_ge.py -q
"""
import os
import sys
from pathlib import Path

os.environ.setdefault("OPENAI_API_KEY", "test")
os.environ["DATABASE_URL"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.transcript import parse_transcript_lines, regroup, summarize  # noqa: E402


def ge(cid, name, area, credits=3, category="교선"):
    return {"course_id": cid, "name": name, "category": category, "credits": credits, "grade": "A0",
            "deletion": None, "ge_area": area}


def status(courses, year=2023):
    result = summarize(courses, year, "cse")["requirements"]["ge"]
    areas = {a["area"]: a for a in result["areas"]}
    children = {c["area"]: c for a in result["areas"] for c in a.get("children", [])}
    return result, areas, children


BASIC_2023 = [
    ge("BKSA64611", "창의글쓰기", "기초"),
    ge("BKSA39798", "비판적사고와토론", "기초"),
    ge("BKSA53699", "KUGEP1", "기초"),
    ge("BKSA58109", "중국어기초", "기초"),
    ge("BKSA58113", "철학의고전", "기초"),
    ge("BKSA56558", "컴퓨팅적사고", "기초"),
]


def test_basic_areas_by_course_count():
    _, areas, children = status(BASIC_2023)
    assert [children[a]["satisfied"] for a in ("글쓰기", "발표와토론", "외국어기초", "인문기초", "과학기초")] == [True] * 5
    assert children["외국어기초"]["done_courses"] == 2 and children["외국어기초"]["min_courses"] == 2
    assert areas["기초교양"]["done_credits"] == 18 and areas["기초교양"]["satisfied"] is True

    _, areas, children = status(BASIC_2023[:3])  # 인문기초·과학기초 없음, 외국어기초 1과목
    assert children["외국어기초"]["satisfied"] is False
    assert children["인문기초"]["satisfied"] is False and children["과학기초"]["satisfied"] is False
    assert areas["기초교양"]["satisfied"] is False


def test_course_count_not_credits_for_basic_areas():
    # 23학번이 25년 이후 2학점으로 바뀐 과목을 들어도 그 세부 영역 1과목은 채운 것
    _, areas, children = status([ge("BKSA64611", "창의글쓰기", "기초", credits=2)])
    assert children["글쓰기"]["satisfied"] is True
    assert areas["기초교양"]["done_credits"] == 2  # 기초교양 전체 학점(18)은 학점으로 본다


def test_basic_area_follows_admission_year():
    _, _, c23 = status(BASIC_2023, 2023)
    _, _, c25 = status(BASIC_2023, 2025)
    assert "컴퓨팅적사고" in c23["과학기초"]["courses"]
    assert "컴퓨팅적사고" in c25["AI/데이터"]["courses"] and c25["과학기초"]["satisfied"] is False


def test_must_include():
    _, _, children = status([ge("BKSA53700", "KUGEP2", "기초"), ge("BKSA58109", "중국어기초", "기초")])
    assert children["외국어기초"]["done_courses"] == 2
    assert children["외국어기초"]["must_include"] == [{"course_id": "BKSA53699", "name": "KUGEP1", "done": False}]
    assert children["외국어기초"]["satisfied"] is False


def test_ku_areas_by_credits_and_unclassified():
    courses = [
        ge("BZZA62440", "성신의대학생활지도", "소양", credits=1),
        ge(None, "디지털시대의세계시민-되기", "소양", credits=2),   # 강의계획서(인성) 과목명으로 찾는다
        ge("BKSA59472", "취업전략수립및역량개발1", "소양", credits=2),
        ge("BKSA99998", "가상소양과목", "소양", credits=2),     # 세부 영역을 모름
    ]
    _, areas, children = status(courses)
    assert children["인성"]["done_credits"] == 3 and children["인성"]["satisfied"] is True
    assert children["실무"]["done_credits"] == 2 and children["실무"]["satisfied"] is None  # 모르는 과목이 채울 수도 있다
    assert areas["KU소양"]["unclassified"] == ["가상소양과목"]
    assert areas["KU소양"]["done_credits"] == 7 and areas["KU소양"]["satisfied"] is False  # 9학점 미만


def test_deep_areas():
    known = [ge(None, "토익1", "심화", 2), ge(None, "영어회화1", "심화", 2)]
    unknown = [ge("BKSA99997", "가상심화A", "심화", 2), ge("BKSA99996", "가상심화B", "심화", 2)]
    _, areas, _ = status(known + unknown)
    deep = areas["심화교양"]
    assert deep["done_areas"] == 1 and deep["min_areas"] == 4
    assert deep["done_credits"] == 8 and deep["satisfied"] is None  # 영역을 모르는 과목이 있어 확인 필요
    _, areas, _ = status(known)
    assert areas["심화교양"]["satisfied"] is False  # 4학점, 1개 영역


def test_unknown_area_and_major_courses_are_left_out():
    courses = [ge("BKSA99995", "영역모름", None, 2),
               {"course_id": "NDGE15060", "name": "자료구조", "category": "전필", "credits": 3, "grade": "A0", "deletion": None}]
    result, areas, _ = status(courses)
    assert result["unknown"] == ["영역모름"]
    assert all(a["done_credits"] == 0 for a in areas.values())


def test_parser_keeps_transcript_ge_area():
    header = ["년도", "학기", "이수구분", "학수번호", "과목명", "학점", "등급"]
    rows, _ = parse_transcript_lines(header + [
        "2023", "1학기", "기초", "BKSA64611", "창의글쓰기", "3", "A0",
        "2023", "1학기", "심화", "BKSA51421", "토익1", "2", "A0",
        "2023", "1학기", "소양", "BKSA58114", "MOS", "2", "P",
        "2023", "1학기", "전필", "NDGE15060", "자료구조", "3", "A0",
    ])
    assert [r["ge_area"] for r in rows] == ["기초", "심화", "소양", None]


def test_regroup_keeps_ge_status():
    courses = BASIC_2023 + [ge(None, "토익1", "심화", 2), ge("BZZA62440", "성신의대학생활지도", "소양", credits=1)]
    first = summarize(courses, 2023, "cse")
    moved = regroup(first["courses"], first["excluded"], 2025, "cse")
    assert moved["requirements"]["ge"] == summarize(courses, 2025, "cse")["requirements"]["ge"]
