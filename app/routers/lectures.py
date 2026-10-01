from fastapi import APIRouter, HTTPException

from app.catalog import catalog
from app.checklist import BASE, LECTURE_KEYS, NUM_LEVEL

router = APIRouter(prefix="/api/lectures", tags=["lectures"])


def _asset_url(path):
    if not path:
        return None
    return path if path.startswith(("http://", "https://", "/assets/")) else "/assets/" + path.lstrip("/")


@router.get("/{lecture_id}")
def lecture_detail(lecture_id: str):
    """강의(과목 × 교수) 상세: 레벨, 3줄 요약, 근거 문장, 계획서 이미지. 수강평 캡처는 보여주지 않는다."""
    insight = catalog.insights.get(lecture_id)
    course_id, _, professor = lecture_id.partition("-")
    course = catalog.courses.get(course_id)
    if not course and not insight:
        raise HTTPException(status_code=404, detail="강의를 찾지 못했어요.")
    if insight:
        professor = insight.get("professor", professor)
    levels = (insight or {}).get("levels", {})
    evidence = (insight or {}).get("evidence", {})
    return {
        "lecture_id": lecture_id,
        "course_id": course_id if course else None,
        "course": course["name"] if course else (insight or {}).get("course_name"),
        "category": course["category"] if course else None,
        "credits": course["credits"] if course else None,
        "professor": professor,
        "sections": [s for s in catalog.sections_by_course.get(course_id, []) if s["professor"] == professor],
        "has_insight": insight is not None,
        "levels": [
            {"key": key, "label": BASE[key]["label"], "value": levels.get(key),
             "level": NUM_LEVEL.get(levels.get(key)), "evidence": evidence.get(key)}
            for key in LECTURE_KEYS
        ],
        "summary": (insight or {}).get("summary", []),
        "review_count": (insight or {}).get("review_count", 0),
        "syllabus_image_url": _asset_url((insight or {}).get("syllabus_image")),
    }
