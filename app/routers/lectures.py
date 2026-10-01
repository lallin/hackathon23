from typing import Optional

from fastapi import APIRouter, HTTPException

from app.catalog import catalog
from app.checklist import BASE, LECTURE_KEYS, NUM_LEVEL, lecture_level

router = APIRouter(prefix="/api/lectures", tags=["lectures"])

TEACHING_KO = {"lecture": "강의", "discussion": "토론", "lab": "실습", "field": "현장", "elearning": "이러닝",
               "blended": "블렌디드", "flipped": "플립러닝"}
EVALUATION_KO = {"attendance": "출석", "midterm": "중간", "final": "기말", "assignment": "과제",
                 "participation": "참여"}


def _asset_url(path):
    if not path:
        return None
    return path if path.startswith(("http://", "https://", "/assets/")) else "/assets/" + path.lstrip("/")


def _syllabus_summary(syllabus: Optional[dict]) -> Optional[dict]:
    """수강계획서의 수업 방식·평가 비율을 화면에 바로 쓸 수 있는 문장으로 만든다."""
    if not syllabus:
        return None
    teaching = {k: v for k, v in (syllabus.get("teaching_method") or {}).items() if v}
    evaluation = syllabus.get("evaluation_method") or {}
    parts = [(EVALUATION_KO[k], evaluation[k]) for k in EVALUATION_KO if evaluation.get(k)]
    parts += [(o.get("label"), o.get("percent")) for o in evaluation.get("others") or [] if isinstance(o, dict) and o.get("percent")]
    return {
        "teaching_method": teaching,
        "evaluation_method": evaluation,
        "teaching_text": " · ".join(f"{TEACHING_KO.get(k, k)} {v}%" for k, v in teaching.items()) or None,
        "evaluation_text": " · ".join(f"{label} {pct}%" for label, pct in parts) or None,
    }


@router.get("/{lecture_id}")
def lecture_detail(lecture_id: str):
    """강의(과목 × 교수) 상세: 레벨과 출처, 3줄 요약, 근거 문장, 수강계획서 요약. 수강평 캡처는 보여주지 않는다."""
    insight = catalog.insights.get(lecture_id)
    course_id, _, professor = lecture_id.partition("-")
    course = catalog.courses.get(course_id)
    if not course and not insight:
        raise HTTPException(status_code=404, detail="강의를 찾지 못했어요.")
    if insight:
        professor = insight.get("professor", professor)
    evidence = (insight or {}).get("evidence", {})
    syllabus = _syllabus_summary(catalog.syllabus_by_lecture.get(lecture_id))
    sections = [s for s in catalog.sections_by_course.get(course_id, []) if s["professor"] == professor]

    levels = []
    for key in LECTURE_KEYS:
        value, source = lecture_level(lecture_id, key)
        note = evidence.get(key) if source == "review" else (
            f"수강계획서 평가 방법: {syllabus['evaluation_text']}" if source == "syllabus" and syllabus else None)
        levels.append({"key": key, "label": BASE[key]["label"], "value": value, "level": NUM_LEVEL.get(value),
                       "source": source, "evidence": note})

    return {
        "lecture_id": lecture_id,
        "course_id": course_id if course else None,
        "course": course["name"] if course else (insight or {}).get("course_name"),
        "category": course["category"] if course else None,
        "credits": course["credits"] if course else None,
        "professor": professor,
        "target": next((s.get("target") for s in sections if s.get("target")), None),
        "sections": sections,
        "has_insight": insight is not None,
        "rating": ((insight or {}).get("everytime") or {}).get("rating"),
        "levels": levels,
        "summary": (insight or {}).get("summary", []),
        "review_count": (insight or {}).get("review_count", 0),
        "syllabus": syllabus,
        "syllabus_image_url": _asset_url((insight or {}).get("syllabus_image")),
    }
