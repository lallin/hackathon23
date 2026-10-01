"""성적표 PDF → 이수 현황.

PDF는 메모리에서 한 번 읽고 버린다. 학번·이름은 추출하지 않고 과목 목록만 남긴다.
"""
import json
from typing import List, Literal, Optional

from pydantic import BaseModel

from ai_service import ask_json
from app.catalog import CATEGORIES, SEED_DIR, catalog, min_credits, normalize_name, total_credits

# 이수하지 않은 것으로 보는 등급. N(미인정)·F(낙제)와 NP·FA·U·W
EXCLUDED_GRADES = {"F", "N", "NP", "FA", "U", "W"}
# 삭제구분에 이 말이 있으면 성적표에 남아 있어도 이수 과목에서 뺀다
DELETION_MARKS = ("취득학점포기",)
# 일반선택·일반교양처럼 네 영역에 들지 않는 과목. 졸업 총 학점에만 더하고 과목명·학점만 남긴다
OTHER = "기타"


class TranscriptCourse(BaseModel):
    course_id: Optional[str]
    name: str
    category: Literal["전필", "전선", "교필", "교선", "기타"]
    credits: float
    grade: str
    deletion: Optional[str]


class TranscriptResult(BaseModel):
    courses: List[TranscriptCourse]


PROMPT = """첨부한 대학 성적표에서 수강한 과목을 한 행도 빠짐없이 표로 뽑아라.
성적표 표의 열은 보통 년도·학기·이수구분·학수번호·교과목명·학점·등급·삭제구분 순서다.
한글이 글자 데이터로 들어 있지 않은 PDF가 있으니 페이지 그림을 보고 읽는다.
- course_id: 학수번호(과목코드, 예: NDGE05021). 없으면 null
- name: 교과목명
- category: 이수구분을 전필/전선/교필/교선/기타 중 하나로 정규화한다.
  전공필수·전공기초·전필→전필, 전공선택·전선→전선, 교양필수·필수교양·교필→교필,
  교양선택·핵심교양·교선과 교양 영역 표기(기초·심화·소양·인성)→교선,
  일선(일반선택)·일교(일반교양)·자유선택·자선·다전공(다필·다선)·교직·그 밖→기타
- credits: 학점(숫자)
- grade: 등급 그대로(A+, B0, P, N, F, NP 등)
- deletion: 삭제구분 칸의 내용 그대로(예: 취득학점포기). 비어 있으면 null
같은 과목이 여러 번 있으면(재수강) 모두 뽑는다.
학번, 이름, 생년월일 같은 개인정보는 절대 뽑지 않는다. 학기별 소계·합계·평점 행은 제외한다."""


def parse_pdf(data: bytes, filename: str = "transcript.pdf") -> List[dict]:
    # FE는 90초 기다린다: 40초 × 2번 시도
    result = ask_json(TranscriptResult, PROMPT, system="너는 성적표를 정확하게 표로 옮기는 도우미다.",
                      pdf=(data, filename or "transcript.pdf"), timeout=40, retries=1)
    return [c.model_dump() for c in result.courses]


def load_sample() -> dict:
    with open(SEED_DIR / "sample_transcript.json", encoding="utf-8") as f:
        return json.load(f)


def _catalog_id(course: dict) -> Optional[str]:
    """성적표 과목을 카탈로그·졸업 요건의 학수번호에 맞춘다. 학수번호가 없으면 과목명으로 찾는다."""
    cid = (course.get("course_id") or "").strip()
    if cid in catalog.courses or cid in catalog.known_courses:
        return cid
    key = normalize_name(course["name"])
    for c in list(catalog.courses.values()) + list(catalog.known_courses.values()):
        if normalize_name(c["name"]) == key:
            return c["course_id"]
    return cid or None


def requirement_status(admission_year: Optional[int], major: Optional[str], completed_ids: List[str],
                       completed_credits: dict) -> Optional[dict]:
    requirement = catalog.requirements.get((admission_year, major)) if admission_year and major else None
    if not requirement:
        return None
    mins = min_credits(requirement)
    total = total_credits(requirement)
    done = set(completed_ids)
    remaining = {c: max(0.0, v - completed_credits.get(c, 0)) for c, v in mins.items()}
    remaining_total = max(0.0, total - sum(completed_credits.values()))
    return {
        "credits": mins,
        "total_required": total,
        "remaining": remaining,
        "remaining_total": remaining_total,
        # 최소 학점을 다 채워도 남는 졸업 학점. 네 영역 어디로든 채울 수 있다.
        "remaining_free": max(0.0, remaining_total - sum(remaining.values())),
        "required_remaining": [
            {"course_id": cid, "name": catalog.course_name(cid), "offered": catalog.is_offered(cid)}
            for cid in requirement["required_course_ids"] if cid not in done
        ],
    }


def _excluded_reason(course: dict) -> Optional[str]:
    grade = str(course.get("grade") or "").strip().upper()
    if grade in EXCLUDED_GRADES:
        return f"등급 {grade}"
    deletion = str(course.get("deletion") or "")
    if any(mark in deletion for mark in DELETION_MARKS):
        return deletion.strip()
    return None


def summarize(courses: List[dict], admission_year: Optional[int], major: Optional[str]) -> dict:
    """추출한 과목 → 영역별 이수 학점.
    등급 N·F 등과 삭제구분 '취득학점포기'는 빼고, 재수강은 마지막 기록만 센다.
    이수구분이 기타(일선·일교 등)인 과목은 과목명·학점만 남기고 졸업 총 학점에만 더한다."""
    requirement = catalog.requirements.get((admission_year, major)) if admission_year and major else None
    ge_required = set(requirement["required_course_ids"]) if requirement else set()
    passed, excluded = {}, []
    for course in courses:
        reason = _excluded_reason(course)
        if reason:
            excluded.append({**course, "reason": reason})
            continue
        if course.get("category") == OTHER:
            passed[OTHER + ":" + normalize_name(course["name"])] = {
                "name": course["name"], "credits": course["credits"], "category": OTHER}
            continue
        cid = _catalog_id(course)
        category = course["category"]
        # 교양 과목은 졸업 요건의 필수 학수번호에 있으면 교필, 없으면 교선 (학사요람 규칙)
        if requirement and category in ("교필", "교선"):
            category = "교필" if cid in ge_required else "교선"
        key = cid or normalize_name(course["name"])
        passed[key] = {**course, "course_id": cid, "category": category, "in_catalog": cid in catalog.courses}
        passed[key].pop("deletion", None)

    # 네 영역 + 기타. 기타는 영역 최소 요건에는 안 들어가고 졸업 총 학점에만 더해진다
    completed_credits = {c: 0.0 for c in CATEGORIES + [OTHER]}
    for course in passed.values():
        if course["category"] in completed_credits:
            completed_credits[course["category"]] += float(course["credits"])
    completed_ids = [c["course_id"] for c in passed.values() if c.get("course_id")]
    return {
        "admission_year": admission_year,
        "major": major,
        "recognized_count": len(courses),
        "message": f"인식된 과목 {len(courses)}개",
        "courses": list(passed.values()),
        "excluded": excluded,
        "completed_course_ids": completed_ids,
        "completed_credits": completed_credits,
        "total_credits": sum(completed_credits.values()),
        "requirements": requirement_status(admission_year, major, completed_ids, completed_credits),
    }
