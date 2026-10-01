"""수강평·수강계획서 분석.

배치(이미지 캡처)와 온디맨드(에브리타임 텍스트)가 같은 결과 형식을 쓴다:
{lecture_id, course_id, professor, levels{5개 기본 항목: 1~3}, summary[3], evidence{key: 문장},
 reviews[원문], review_count, syllabus_image, source}
"""
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from typing import Dict, List, Literal, Optional, Sequence, Tuple

from pydantic import BaseModel

from ai_service import LLMError, ask_json
from app import everytime
from app.catalog import catalog, lecture_id_of
from app.checklist import BASE, LECTURE_KEYS, LEVEL_NUM, evaluate_lecture, is_custom
from app.schemas import ChecklistItem

FETCH_TIMEOUT_SECONDS = 15
MAX_PROFESSORS = 3

LEVEL_GUIDE = """기본 항목 5개를 1(적음)·2(보통)·3(많음)으로 판정한다. 판단할 근거가 없으면 null.
- assignment(과제량): 1 거의 없음 / 2 가끔 / 3 매주
- team_project(팀플): 1 없음 / 2 작은 팀 과제 / 3 학기 내내 팀 프로젝트
- exam(시험 횟수): 1 한 번 이하 / 2 중간·기말 / 3 퀴즈 포함 잦음
- presentation(발표): 1 없음 / 2 한 번 / 3 여러 번
- attendance(출석 체크): 1 거의 안 함 / 2 가끔 / 3 매번 엄격"""


class Evidence(BaseModel):
    key: Literal["assignment", "team_project", "exam", "presentation", "attendance"]
    sentence: str


class InsightResult(BaseModel):
    assignment: Optional[int]
    team_project: Optional[int]
    exam: Optional[int]
    presentation: Optional[int]
    attendance: Optional[int]
    summary: List[str]
    evidence: List[Evidence]


class ImageInsightResult(InsightResult):
    reviews: List[str]


def _to_lecture(result: InsightResult, course_id: Optional[str], professor: str, course_name: str,
                reviews: List[str], source: str) -> dict:
    levels = {}
    for key in LECTURE_KEYS:
        value = getattr(result, key)
        if isinstance(value, int) and 1 <= value <= 3:
            levels[key] = value
    return {
        "lecture_id": lecture_id_of(course_id or course_name, professor),
        "course_id": course_id,
        "course_name": course_name,
        "professor": professor,
        "levels": levels,
        "summary": result.summary[:3],
        "evidence": {e.key: e.sentence for e in result.evidence},
        "reviews": reviews,
        "review_count": len(reviews),
        "syllabus_image": None,
        "source": source,
        "collected_at": int(time.time()),
    }


def extract_insights_from_texts(course_name: str, professor: str, reviews: List[str],
                                course_id: Optional[str] = None, source: str = "on_demand") -> dict:
    """수강평 텍스트 → 강의 데이터 (온디맨드)."""
    joined = "\n".join(f"- {r[:400]}" for r in reviews[:30])
    prompt = (f"과목: {course_name}\n교수: {professor}\n\n수강평:\n{joined}\n\n"
              f"{LEVEL_GUIDE}\n\nsummary는 수강평을 요약한 짧은 한국어 문장 3개. "
              "evidence는 레벨을 판정한 근거가 된 수강평 문장을 항목별로 하나씩 그대로 옮긴다.")
    result = ask_json(InsightResult, prompt, system="너는 대학 강의평을 분석해 구조화하는 도우미다.")
    return _to_lecture(result, course_id, professor, course_name, reviews, source)


def extract_insights_from_images(images: Sequence[Tuple[bytes, str]], course_name: str, professor: str,
                                 course_id: Optional[str] = None) -> dict:
    """수강계획서·수강평 캡처 이미지 → 강의 데이터 (배치). images: [(바이트, MIME)]"""
    prompt = (f"과목: {course_name}\n교수: {professor}\n\n첨부한 이미지는 이 강의의 수강계획서와 수강평 화면 캡처다.\n"
              f"{LEVEL_GUIDE}\n\nsummary는 짧은 한국어 문장 3개. evidence는 근거 문장을 항목별로 하나씩. "
              "reviews에는 캡처에 보이는 수강평 원문을 한 개씩 그대로 옮긴다(자유 항목 판정에 쓴다).")
    result = ask_json(ImageInsightResult, prompt, system="너는 대학 강의 자료를 분석해 구조화하는 도우미다.",
                      images=images)
    return _to_lecture(result, course_id, professor, course_name, result.reviews, "batch")


# ---- 자유 항목 판정 ----
class Judgment(BaseModel):
    lecture_id: str
    key: str
    value: Literal["low", "mid", "high", "match", "opposite", "unknown"]


class JudgmentResult(BaseModel):
    judgments: List[Judgment]


def judge_custom_items(items: List[ChecklistItem], lecture_ids: List[str]) -> List[str]:
    """자유 항목을 강의별로 판정해 catalog.judgments에 캐시한다. 실패한 항목 key 목록을 돌려준다."""
    custom_items = [i for i in items if is_custom(i.key)]
    todo_items, todo_lectures = [], set()
    for item in custom_items:
        missing = [lid for lid in lecture_ids if (lid, item.key) not in catalog.judgments]
        for lid in missing:
            if not catalog.insights.get(lid, {}).get("reviews"):
                catalog.judgments[(lid, item.key)] = None  # 수강평이 없으면 정보 없음
            else:
                todo_lectures.add(lid)
        if any(catalog.insights.get(lid, {}).get("reviews") for lid in missing):
            todo_items.append(item)
    if not todo_items:
        return []

    item_lines = "\n".join(
        f'- key="{i.key}" 이름="{i.label}" 종류={"레벨형(low/mid/high 중 하나, 해당 정도)" if i.type == "level" else "적용형(match=맞음, opposite=반대)"}'
        for i in todo_items
    )
    lecture_lines = []
    for lid in sorted(todo_lectures):
        reviews = " / ".join(r[:200] for r in catalog.insights[lid]["reviews"][:8])
        lecture_lines.append(f'[{lid}] {reviews}')
    prompt = (
        f"판정할 항목:\n{item_lines}\n\n강의별 수강평:\n" + "\n".join(lecture_lines) +
        "\n\n모든 (강의, 항목) 쌍에 대해 value를 하나씩 정한다. 수강평에서 판단할 근거가 없으면 unknown. "
        "레벨형 항목에는 low/mid/high/unknown만, 적용형 항목에는 match/opposite/unknown만 쓴다."
    )
    try:
        result = ask_json(JudgmentResult, prompt, system="너는 수강평을 읽고 강의가 조건에 맞는지 판정하는 도우미다.")
    except LLMError:
        return [i.key for i in todo_items]

    types = {i.key: i.type for i in todo_items}
    for j in result.judgments:
        if j.key not in types or j.lecture_id not in todo_lectures:
            continue
        if types[j.key] == "level":
            value = LEVEL_NUM.get(j.value)
        else:
            value = j.value if j.value in ("match", "opposite") else None
        catalog.judgments[(j.lecture_id, j.key)] = value
    for item in todo_items:  # 응답에서 빠진 쌍은 정보 없음
        for lid in todo_lectures:
            catalog.judgments.setdefault((lid, item.key), None)
    return []


# ---- 온디맨드 ----
def _fetch_with_timeout(course_name: str, professor: str) -> Optional[List[str]]:
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(everytime.fetch_reviews, course_name, professor)
        try:
            return future.result(timeout=FETCH_TIMEOUT_SECONDS)
        except (FutureTimeout, NotImplementedError):
            return None
        except Exception:
            return None


def _collect(course_name: str, course_id: Optional[str], professor: str) -> Tuple[Optional[dict], str]:
    lid = lecture_id_of(course_id or course_name, professor)
    if lid in catalog.insights:
        return catalog.insights[lid], "cached"
    reviews = _fetch_with_timeout(course_name, professor)
    if not reviews:
        return None, "not_collected"
    try:
        lecture = extract_insights_from_texts(course_name, professor, reviews, course_id=course_id)
    except LLMError:
        return None, "not_collected"
    catalog.save_insight(lecture)
    return lecture, "collected"


def on_demand(course_name: str, professor: Optional[str], checklist: List[ChecklistItem]) -> dict:
    course = catalog.find_course_by_name(course_name)
    name = course["name"] if course else course_name.strip()
    course_id = course["course_id"] if course else None

    offered: List[str] = []
    for section in catalog.sections_by_course.get(course_id, []) if course_id else []:
        if section["professor"] not in offered:
            offered.append(section["professor"])
    if professor:
        matched = [p for p in offered if professor.replace("교수", "").strip() in p]
        professors = matched or [professor.replace("교수님", "").replace("교수", "").strip()]
    else:
        professors = offered[:MAX_PROFESSORS]
    if not professors:
        return {"course_name": name, "message": f"'{name}' 과목을 이번 학기 개설 강좌에서 찾지 못했어요. 교수님 성함을 같이 알려 주세요.",
                "results": []}

    with ThreadPoolExecutor(max_workers=len(professors)) as pool:
        collected = list(pool.map(lambda p: _collect(name, course_id, p), professors))

    enabled = [i for i in checklist if i.enabled and (i.key in BASE and BASE[i.key]["kind"] == "lecture" or is_custom(i.key))]
    lecture_ids = [l["lecture_id"] for l, _ in collected if l]
    failed = judge_custom_items(enabled, lecture_ids)

    results = []
    for prof, (lecture, status) in zip(professors, collected):
        entry = {"professor": prof, "status": status, "in_catalog": prof in offered,
                 "lecture_id": lecture_id_of(course_id or name, prof)}
        if lecture:
            evals = [evaluate_lecture(i, lecture["lecture_id"]) for i in enabled if i.key not in failed]
            entry.update({
                "review_count": lecture.get("review_count", 0),
                "levels": lecture.get("levels", {}),
                "summary": lecture.get("summary", []),
                "match": {"satisfied": sum(1 for e in evals if e["result"] == "match"), "total": len(evals)},
                "checklist_eval": evals,
                "_opposite": sum(1 for e in evals if e["result"] == "opposite"),
            })
        else:
            entry.update({"review_count": 0, "levels": {}, "summary": [], "match": {"satisfied": 0, "total": 0},
                          "checklist_eval": [], "_opposite": 0, "note": "지금은 가져올 수 없어요"})
        results.append(entry)

    results.sort(key=lambda r: (r["status"] == "not_collected", -r["match"]["satisfied"], r["_opposite"],
                                -r["review_count"]))
    for rank, r in enumerate(results, 1):
        r["rank"] = rank
        del r["_opposite"]

    top = results[0]
    if top["status"] == "not_collected":
        message = f"지금은 '{name}' 수강평을 가져올 수 없어요."
    elif enabled and top["match"]["satisfied"] > 0:
        message = f"체크리스트에 가장 잘 맞는 건 {top['professor']} 교수님 강의예요."
    else:
        message = f"'{name}' 교수님별 수강평이에요."
    warnings = [f"'{i.label}' 항목은 지금 판정할 수 없어 뺐어요." for i in enabled if i.key in failed]
    return {"course_name": name, "message": message, "results": results, "warnings": warnings}
