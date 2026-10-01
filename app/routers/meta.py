from fastapi import APIRouter

from app.catalog import CATEGORIES, DAYS, catalog, min_credits, total_credits
from app.checklist import BASE_ITEMS, LEVEL_KO, STYLES, style_items
from app.schemas import Conditions

router = APIRouter(prefix="/api", tags=["meta"])


def _semester_label(semester: str) -> str:
    year, term = semester.split("-")
    return f"{year}학년도 {term}학기"


@router.get("/meta")
def meta():
    return {
        "semester": catalog.semester,
        "semester_label": _semester_label(catalog.semester),
        "admission_years": catalog.admission_years,
        "supported_years": catalog.supported_years,
        "majors": catalog.majors,
        "categories": CATEGORIES,
        "days": DAYS,
        "styles": [
            {"id": sid, "label": s["label"], "items": [i.model_dump() for i in style_items(sid)]}
            for sid, s in STYLES.items()
        ],
        "base_items": BASE_ITEMS,
        "levels": [{"id": k, "label": v} for k, v in LEVEL_KO.items()],
        "preferred_times": [{"id": "any", "label": "상관없음"}, {"id": "morning", "label": "오전"},
                            {"id": "afternoon", "label": "오후"}],
        "credit_range": {"min": 9, "max": 21, "default": 18},
        "default_conditions": Conditions().model_dump(),
    }


@router.get("/requirements")
def requirements(admission_year: int, major: str):
    requirement = catalog.requirements.get((admission_year, major))
    if not requirement:
        supported_majors = "와 ".join(m["name"] for m in catalog.majors if m.get("supported"))
        if admission_year not in catalog.supported_years:
            years = f"{min(catalog.supported_years)}~{max(catalog.supported_years)}"
            message = f"아직 준비 중인 입학년도예요. 지금은 {years}학번에서 써 볼 수 있어요."
        else:
            message = f"아직 준비 중인 학과예요. 지금은 {supported_majors}에서 써 볼 수 있어요."
        return {"supported": False, "admission_year": admission_year, "major": major, "message": message}

    major_info = catalog.major(major) or {}
    mins = min_credits(requirement)
    total = total_credits(requirement)
    return {
        "supported": True,
        "admission_year": admission_year,
        "major": major,
        "major_name": major_info.get("name", major),
        "credits": mins,
        "total_required": total,
        "free_credits": max(0, total - sum(mins.values())),
        "no_min_categories": [c for c in CATEGORIES if c not in mins],
        "required_courses": [
            {"course_id": cid, "name": catalog.course_name(cid),
             "category": catalog.category(cid, admission_year, major),
             "credits": catalog.courses[cid]["credits"] if cid in catalog.courses else None,
             "offered": bool(catalog.sections_by_course.get(cid))}
            for cid in requirement["required_course_ids"]
        ],
    }
