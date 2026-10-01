"""성적표 과목을 입학년도 요람의 이수구분으로 나누는지 확인하는 시험.

같은 성적표라도 23학번은 23 요람, 25학번은 25 요람의 전필/전선·교필로 센다.
성적표에 찍힌 이수구분은 전공·교양·기타 구분에만 쓴다.

    python -m pytest tests/test_transcript_year.py -q
"""
import os
import sys
from pathlib import Path

os.environ.setdefault("OPENAI_API_KEY", "test")
os.environ["DATABASE_URL"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.transcript import regroup, summarize  # noqa: E402


def course(cid, name, category, credits=3, grade="A0", deletion=None):
    return {"course_id": cid, "name": name, "category": category, "credits": credits, "grade": grade, "deletion": deletion}


# 23학번 성적표처럼 찍힌 과목들
TRANSCRIPT = [
    course("NDGE05021", "컴퓨터공학개론", "전필"),   # 23 요람 전필, 24~26 요람 전선
    course("NDGE15060", "자료구조", "전필"),         # 23~26 요람 모두 전필
    course("NDGE11863", "데이터베이스", "전필"),     # 23·24 요람 전필, 25·26 요람 전선
    course("NDGE11989", "컴퓨터프로그래밍", "전선"),  # 24~26 요람에 없는 전공 과목
    course("BKSA53699", "KUGEP1", "교선"),            # 성적표에는 '기초'로 찍히는 필수 교양
    course("BKSA64611", "창의글쓰기", "교선"),
    course("ZAAA58470", "동참형학기제", "기타", credits=1, grade="P"),
]


def categories(result):
    return {c["name"]: c["category"] for c in result["courses"]}


def test_major_category_follows_admission_year():
    by_year = {y: summarize(TRANSCRIPT, y, "cse") for y in (2023, 2024, 2025, 2026)}
    assert categories(by_year[2023])["컴퓨터공학개론"] == "전필"
    assert categories(by_year[2024])["컴퓨터공학개론"] == "전선"
    assert categories(by_year[2024])["데이터베이스"] == "전필"
    assert categories(by_year[2025])["데이터베이스"] == "전선"
    for y in by_year:
        assert categories(by_year[y])["자료구조"] == "전필"
    assert by_year[2023]["completed_credits"]["전필"] == 9
    assert by_year[2024]["completed_credits"]["전필"] == 6
    assert by_year[2025]["completed_credits"]["전필"] == 3
    assert by_year[2026]["completed_credits"]["전필"] == 3
    # 영역만 바뀌고 이수한 총 학점은 그대로
    assert len({r["total_credits"] for r in by_year.values()}) == 1


def test_course_not_in_that_years_curriculum_counts_as_major_elective():
    result = summarize(TRANSCRIPT + [course("NDGE99999", "가상전공과목", "전필")], 2025, "cse")
    assert categories(result)["컴퓨터프로그래밍"] == "전선"
    assert categories(result)["가상전공과목"] == "전선"  # 그 해 요람의 전필이 아니면 전필로 세지 않는다


def test_general_education_and_other():
    result = summarize(TRANSCRIPT + [course("BKSA58110", "가상교양", "교필")], 2025, "cse")
    cats = categories(result)
    assert cats["KUGEP1"] == "교필"      # 그 해 요람의 필수 교양
    assert cats["창의글쓰기"] == "교선"
    assert cats["가상교양"] == "교선"     # 성적표에 교필로 찍혀도 그 해 필수 교양이 아니면 교선
    assert cats["동참형학기제"] == "기타"
    assert result["completed_credits"]["기타"] == 1


def test_matches_curriculum_by_name_when_code_differs():
    result = summarize([course("NDGX00001", "컴퓨터 구조", "전선")], 2023, "cse")
    assert result["courses"][0]["course_id"] == "NDGE12263"
    assert result["courses"][0]["category"] == "전필"
    remaining = [c["course_id"] for c in result["requirements"]["required_remaining"]]
    assert "NDGE12263" not in remaining


def test_required_remaining_follows_admission_year():
    left = {y: [c["name"] for c in summarize(TRANSCRIPT, y, "cse")["requirements"]["required_remaining"]]
            for y in (2023, 2025)}
    assert "컴퓨터구조" in left[2023] and "운영체제" in left[2023]
    assert "컴퓨터구조" not in left[2025]  # 25 요람에는 전필이 아니다


def test_regroup_after_changing_admission_year():
    first = summarize(TRANSCRIPT, 2023, "cse")
    moved = regroup(first["courses"], first["excluded"], 2025, "cse", first["recognized_count"])
    direct = summarize(TRANSCRIPT, 2025, "cse")
    assert categories(moved) == categories(direct)
    assert moved["completed_credits"] == direct["completed_credits"]
    back = regroup(moved["courses"], moved["excluded"], 2023, "cse", moved["recognized_count"])
    assert categories(back) == categories(first)
    assert back["completed_credits"] == first["completed_credits"]


def test_regroup_endpoint_with_courses_as_the_screen_keeps_them():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)
    first = summarize(TRANSCRIPT, 2023, "cse")
    # 화면은 course_id·name·category·credits·grade만 들고 있고, 기타 과목은 course_id가 빈 문자열이다
    screen = [{"course_id": c.get("course_id") or "", "name": c["name"], "category": c["category"],
               "credits": c["credits"], "grade": c.get("grade")} for c in first["courses"]]
    res = client.post("/api/transcript/regroup", json={"admission_year": 2025, "major": "cse", "courses": screen})
    assert res.status_code == 200, res.text
    assert res.json()["completed_credits"] == summarize(TRANSCRIPT, 2025, "cse")["completed_credits"]
    res = client.post("/api/transcript/regroup", json={"admission_year": 2025, "major": "biz", "courses": screen})
    assert res.status_code == 404
