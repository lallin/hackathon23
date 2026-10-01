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
    # 온디맨드는 수집(최대 15초) 뒤에 이어지고 FE는 60초 기다린다
    result = ask_json(InsightResult, prompt, system="너는 대학 강의평을 분석해 구조화하는 도우미다.",
                      timeout=15, retries=1)
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
JUDGE_CHUNK = 10  # 한 번에 판정할 강의 수. 응답이 짧을수록 빠르다
JUDGE_WORKERS = 6


class LectureJudgment(BaseModel):
    lecture_id: str
    values: List[Literal["low", "mid", "high", "match", "opposite", "unknown"]]


class JudgmentResult(BaseModel):
    lectures: List[LectureJudgment]


def _judge_chunk(items: List[ChecklistItem], lecture_ids: List[str]) -> Dict[tuple, object]:
    item_lines = "\n".join(
        f'{n}. {i.label} - ' + ("레벨형: low/mid/high/unknown (그 성향의 정도)" if i.type == "level"
                               else "적용형: match(맞음)/opposite(반대)/unknown")
        for n, i in enumerate(items, 1)
    )
    lecture_lines = "\n".join(
        f"[{lid}] " + " / ".join(r[:200] for r in catalog.insights[lid]["reviews"][:8]) for lid in lecture_ids
    )
    prompt = (f"판정할 항목:\n{item_lines}\n\n강의별 수강평:\n{lecture_lines}\n\n"
              f"강의마다 values에 위 항목 {len(items)}개의 판정을 순서대로 넣는다. "
              "그 항목을 직접 말한 문장만 근거로 삼는다(예: 시험 난이도는 시험 횟수로 추측하지 않는다). "
              "근거가 없으면 unknown.")
    # 생성 요청 안에서 불린다(FE는 60초 기다린다). 단순 분류라 추론 없이 빠르게.
    result = ask_json(JudgmentResult, prompt, system="너는 수강평을 읽고 강의가 조건에 맞는지 판정하는 도우미다.",
                      timeout=25, retries=1, effort="none")
    out: Dict[tuple, object] = {}
    for lj in result.lectures:
        if lj.lecture_id not in lecture_ids or len(lj.values) != len(items):
            continue
        for item, value in zip(items, lj.values):
            if item.type == "level":
                out[(lj.lecture_id, item.key)] = LEVEL_NUM.get(value)
            else:
                out[(lj.lecture_id, item.key)] = value if value in ("match", "opposite") else None
    for lid in lecture_ids:  # 응답에서 빠진 쌍은 정보 없음
        for item in items:
            out.setdefault((lid, item.key), None)
    return out


def judge_custom_items(items: List[ChecklistItem], lecture_ids: List[str]) -> List[str]:
    """자유 항목을 강의별로 판정해 catalog.judgments에 캐시한다.
    강의를 나눠 동시에 판정하고, 모든 묶음이 실패한 경우에만 그 항목 key를 실패로 돌려준다."""
    todo_items, todo_lectures = [], set()
    for item in (i for i in items if is_custom(i.key)):
        missing = [lid for lid in lecture_ids if (lid, item.key) not in catalog.judgments]
        with_reviews = [lid for lid in missing if catalog.insights.get(lid, {}).get("reviews")]
        for lid in set(missing) - set(with_reviews):
            catalog.judgments[(lid, item.key)] = None  # 수강평이 없으면 정보 없음
        if with_reviews:
            todo_items.append(item)
            todo_lectures.update(with_reviews)
    if not todo_items:
        return []

    ordered = sorted(todo_lectures)
    chunks = [ordered[i:i + JUDGE_CHUNK] for i in range(0, len(ordered), JUDGE_CHUNK)]
    succeeded = 0
    with ThreadPoolExecutor(max_workers=min(JUDGE_WORKERS, len(chunks))) as pool:
        for future in [pool.submit(_judge_chunk, todo_items, chunk) for chunk in chunks]:
            try:
                catalog.judgments.update(future.result())
                succeeded += 1
            except LLMError:
                pass  # 실패한 묶음은 캐시하지 않아 다음 생성 때 다시 판정한다
    return [] if succeeded else [i.key for i in todo_items]


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
