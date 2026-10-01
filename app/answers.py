"""챗봇의 자유 질문 답변과 과목 비교.

- 정보 질문·대화: 서버가 관련 데이터(지금 시간표, 졸업 현황, 언급한 과목)를 모아 AI에게 주고,
  AI는 그 데이터 안에서만 답장을 쓴다. 데이터에 없는 내용은 지어내지 않는다.
- 과목 비교: 데이터에서 바로 계산한다(AI 호출 없음, 자유 항목 판정만 필요하면 호출).
"""
import json
from typing import Dict, List, Optional

from ai_service import ask_text
from app.catalog import DAYS, catalog, lecture_id_of, normalize_name
from app.checklist import (BASE, LECTURE_KEYS, LEVEL_KO, NUM_LEVEL, display_name, evaluate_lecture, is_custom,
                           josa, lecture_level)
from app.insights import judge_custom_items
from app.routers.lectures import syllabus_summary
from app.schemas import ChatContext, ChatRequest, ChecklistItem
from app.transcript import requirement_status

ANSWER_SYSTEM = """너는 대학생 시간표 추천 서비스 '에타빌더'의 챗봇이다.
- 사용자 메시지에 친절한 한국어로 2~5문장 답한다. 마크다운·목록 기호 없이 대화하듯 쓴다.
- 사실(시간, 학점, 별점, 평가 비율, 과제량, 남은 학점 등)은 아래 데이터에 있는 값만 쓴다. 데이터에 없으면 추측하지 말고 지금 데이터에는 없다고 말한다.
- '강의평'은 에브리타임 강의평 통계, '수강계획서'는 학교 강의계획서에서 온 값이다. 출처가 섞이면 구분해서 말한다.
- '가장 ~한 과목'을 물으면 데이터에서 그 값이 가장 높은(또는 낮은) 과목을 먼저 답한다. 같은 값이 여럿이면 함께 말한다.
- 시간표 조건이나 체크리스트를 바꿨다고 말하지 않는다. '서버가 이미 반영한 변경'이 데이터에 있으면 그 문장은 답장 앞에 따로 붙으니 다시 말하지 말고 질문에만 답한다.
- 사용자가 할 수 있는 조작만 안내한다: 대화로 바꾸는 것은 공강 요일·목표 학점·선호 시간·대학 스타일·수업 성향(팀플·과제·시험·출석·1교시 등)뿐이다.
  과목을 빼거나 넣는 것은 대화로 안 되고, 시간표에서 블록을 눌러 [고정] 또는 [제한]을 누른 뒤 [생성하기]를 눌러야 한다. 바뀐 조건은 [생성하기]를 눌러야 시간표에 반영된다.
- 시간표와 상관없는 잡담에는 짧게 답하고 시간표 이야기로 자연스럽게 돌린다.
- 이 서비스가 할 수 있는 일: 성적표 PDF로 이수 현황 계산, 졸업 요건 기준 시간표 추천(상위 5개), 대화로 조건·체크리스트 반영, 과목별 교수 수강평 순위, 두 과목 비교, 과목·시간표·졸업 요건 질문 답변."""

MAX_COLUMNS = 2


def _times_text(times: List[dict]) -> str:
    if not times:
        return "이러닝(정해진 수업 시간 없음)"
    return ", ".join(f"{t['day']} {t['start']}-{t['end']}" for t in times)


def _grading(insight: dict) -> Optional[Dict[str, int]]:
    grading = (insight.get("everytime") or {}).get("grading") or {}
    if not grading:
        return None
    return {"너그러움": grading.get("generous"), "보통": grading.get("mid"), "깐깐함": grading.get("strict")}


def lecture_facts(course_id: str, professor: str) -> dict:
    """강의(과목 × 교수) 하나의 사실 정보."""
    lid = lecture_id_of(course_id, professor)
    insight = catalog.insights.get(lid) or {}
    sections = [s for s in catalog.sections_by_course.get(course_id, []) if s["professor"] == professor]
    levels = {}
    for key in LECTURE_KEYS:
        value, source = lecture_level(lid, key)
        if value is not None:
            levels[key] = {"label": BASE[key]["label"], "level": LEVEL_KO[NUM_LEVEL[value]],
                           "source": "강의평" if source == "review" else "수강계획서"}
    syllabus = syllabus_summary(catalog.syllabus_by_lecture.get(lid)) or {}
    return {
        "lecture_id": lid,
        "professor": professor,
        "sections": [{"section_id": s["section_id"], "times": _times_text(s["times"]), "target": s.get("target")}
                     for s in sections],
        "rating": (insight.get("everytime") or {}).get("rating"),
        "review_count": insight.get("review_count", 0),
        "levels": levels,
        "grading": _grading(insight),
        "evaluation": syllabus.get("evaluation_text"),
        "teaching": syllabus.get("teaching_text"),
        "summary": insight.get("summary", []),
    }


def _find_known(name: str) -> Optional[dict]:
    key = normalize_name(name)
    return next((c for c in catalog.known_courses.values() if normalize_name(c["name"]) == key), None)


def course_facts(name: str, professor: Optional[str], ctx: ChatContext) -> dict:
    """과목 하나의 사실 정보. 이번 학기에 열리면 교수별 강의 정보까지."""
    course = catalog.find_course_by_name(name)
    if not course:
        known = _find_known(name)
        if not known:
            return {"name": name, "found": False, "offered": False}
        return {"name": known["name"], "course_id": known["course_id"], "found": True, "offered": False,
                "category": catalog.category(known["course_id"], ctx.admission_year, ctx.major),
                "credits": known.get("credits"), "lectures": []}
    cid = course["course_id"]
    professors: List[str] = []
    for s in catalog.sections_by_course.get(cid, []):
        if s["professor"] not in professors:
            professors.append(s["professor"])
    if professor:
        wanted = professor.replace("교수님", "").replace("교수", "").strip()
        professors = [p for p in professors if wanted in p] or professors
    return {
        "name": course["name"], "course_id": cid, "found": True, "offered": bool(professors),
        "category": catalog.category(cid, ctx.admission_year, ctx.major), "credits": course["credits"],
        "lectures": [lecture_facts(cid, p) for p in professors],
    }


def timetable_facts(ctx: ChatContext) -> Optional[dict]:
    sections = [catalog.sections[sid] for sid in ctx.section_ids if sid in catalog.sections]
    if not sections:
        return None
    requirement = catalog.requirements.get((ctx.admission_year, ctx.major)) or {}
    required = set(requirement.get("required_course_ids", []))
    rows = []
    for s in sections:
        course = catalog.courses[s["course_id"]]
        lid = lecture_id_of(s["course_id"], s["professor"])
        insight = catalog.insights.get(lid) or {}
        rows.append({
            "과목": course["name"], "교수": s["professor"], "학점": course["credits"],
            "이수구분": catalog.category(s["course_id"], ctx.admission_year, ctx.major),
            "시간": _times_text(s["times"]), "필수 과목": s["course_id"] in required,
            "별점": (insight.get("everytime") or {}).get("rating"),
            "레벨": {BASE[k]["label"]: LEVEL_KO[NUM_LEVEL[v]] for k in LECTURE_KEYS
                     for v in [lecture_level(lid, k)[0]] if v is not None},
        })
    used = {t["day"] for s in sections for t in s["times"]}
    return {"총 학점": sum(r["학점"] for r in rows), "수업 있는 요일": [d for d in DAYS if d in used], "과목": rows}


def graduation_facts(ctx: ChatContext) -> Optional[dict]:
    if not (ctx.admission_year and ctx.major) or (ctx.admission_year, ctx.major) not in catalog.requirements:
        return None
    if not (ctx.completed_course_ids or ctx.completed_credits):
        requirement = catalog.requirements[(ctx.admission_year, ctx.major)]
        return {"성적표": "아직 올리지 않음", "졸업 총 학점": requirement.get("total_credits")}
    credits = ctx.completed_credits or {}
    status = requirement_status(ctx.admission_year, ctx.major, ctx.completed_course_ids, credits) or {}
    return {
        "이수 학점": credits, "졸업 총 학점": status.get("total_required"), "영역별 최소 학점": status.get("credits"),
        "영역별 남은 학점": status.get("remaining"), "남은 졸업 학점": status.get("remaining_total"),
        "아무 영역으로 채울 학점": status.get("remaining_free"),
        "남은 필수 과목": [{"과목": c["name"], "이번 학기 개설": c["offered"]} for c in status.get("required_remaining", [])],
    }


def answer(req: ChatRequest, mentioned: List[dict], applied: List[str]) -> str:
    """데이터를 근거로 AI가 답장을 쓴다. 실패하면 LLMError가 난다."""
    ctx = req.context or ChatContext()
    data = {
        "지금 보고 있는 시간표": timetable_facts(ctx) or "아직 생성 전",
        "졸업 현황": graduation_facts(ctx) or "입학년도·학과 정보 없음",
        "언급한 과목": [course_facts(m["course_name"], m.get("professor"), ctx) for m in mentioned[:3]],
        "시간표 조건": req.conditions.model_dump(),
        "체크리스트": [display_name(i) for i in req.checklist if i.enabled],
    }
    if applied:
        data["이번 메시지로 서버가 이미 반영한 변경(답장 앞에 따로 붙는다)"] = applied
    history = "\n".join(f"{m.role}: {m.content}" for m in req.history[-6:])
    prompt = (f"최근 대화:\n{history or '(없음)'}\n\n사용자 메시지: {req.message}\n\n"
              f"데이터(JSON):\n{json.dumps(data, ensure_ascii=False)}")
    # 성적표에서 나온 숫자가 들어가므로 DB 캐시에는 넣지 않는다(메모리 캐시만)
    return ask_text(prompt, system=ANSWER_SYSTEM, timeout=20, retries=1).strip()


# ---- 과목 비교 ----
def _column(target: dict, ctx: ChatContext) -> dict:
    facts = course_facts(target["course_name"], target.get("professor"), ctx)
    lectures = facts.pop("lectures", [])
    # 교수를 말하지 않았으면 강의평이 있고 별점이 높은 강의를 대표로 고른다
    lectures.sort(key=lambda l: (l["rating"] is None, -(l["rating"] or 0)))
    facts["lecture"] = lectures[0] if lectures else None
    facts["other_professors"] = [l["professor"] for l in lectures[1:]]
    return facts


def _label(col: dict, same_course: bool) -> str:
    if same_course and col.get("lecture"):
        return f"{col['lecture']['professor']} 교수님"
    return col["name"]


def _highlights(cols: List[dict], enabled: bool) -> List[str]:
    a, b = cols
    same = a.get("course_id") and a.get("course_id") == b.get("course_id")
    na, nb = f"'{_label(a, same)}'", f"'{_label(b, same)}'"
    lines = []
    for col, n in ((a, na), (b, nb)):
        if not col.get("found"):
            lines.append(f"{josa(n, '은/는')} 과목 정보를 찾지 못했어요.")
        elif not col.get("offered"):
            lines.append(f"{josa(n, '은/는')} 이번 학기에 열리지 않아요.")
    la, lb = a.get("lecture"), b.get("lecture")
    if not (la and lb):
        return lines
    ra, rb = la["rating"], lb["rating"]
    if ra and rb:
        if abs(ra - rb) < 0.2:
            lines.append(f"별점은 비슷해요({ra:g}점, {rb:g}점).")
        else:
            hi, lo, rh, rl = (na, nb, ra, rb) if ra > rb else (nb, na, rb, ra)
            lines.append(f"별점은 {josa(hi, '이/가')} {rh:g}점으로 {lo}({rl:g}점)보다 높아요.")
    for key in ("assignment", "team_project", "exam", "attendance"):
        va, vb = la["levels"].get(key), lb["levels"].get(key)
        if va and vb and va["level"] != vb["level"]:
            order = ["적음", "보통", "많음"]
            less = na if order.index(va["level"]) < order.index(vb["level"]) else nb
            label = BASE[key]["label"]
            lines.append(f"{josa(label, '은/는')} {josa(less, '이/가')} 더 적어요({va['level']} · {vb['level']}).")
    ga, gb = la.get("grading"), lb.get("grading")
    if ga and gb and ga.get("너그러움") is not None and gb.get("너그러움") is not None \
            and abs(ga["너그러움"] - gb["너그러움"]) >= 10:
        more = na if ga["너그러움"] > gb["너그러움"] else nb
        lines.append(f"학점은 {josa(more, '이/가')} 더 너그럽다는 평이 많아요(너그러움 {ga['너그러움']}% · {gb['너그러움']}%).")
    if enabled:
        sa, sb = la["match"]["satisfied"], lb["match"]["satisfied"]
        if sa != sb:
            better = na if sa > sb else nb
            lines.append(f"지금 체크리스트에는 {josa(better, '이/가')} 더 잘 맞아요({sa}/{la['match']['total']} · {sb}/{lb['match']['total']}).")
    return lines


def compare(targets: List[dict], req: ChatRequest) -> dict:
    """두 과목(또는 같은 과목의 두 교수)을 나란히 비교한다."""
    ctx = req.context or ChatContext()
    cols = [_column(t, ctx) for t in targets[:MAX_COLUMNS]]
    enabled = [i for i in req.checklist if i.enabled and ((i.key in BASE and BASE[i.key]["kind"] == "lecture")
                                                          or is_custom(i.key))]
    lecture_ids = [c["lecture"]["lecture_id"] for c in cols if c.get("lecture")]
    failed = judge_custom_items(enabled, lecture_ids)
    for col in cols:
        lecture = col.get("lecture")
        if lecture:
            evals = [evaluate_lecture(i, lecture["lecture_id"]) for i in enabled if i.key not in failed]
            lecture["checklist_eval"] = evals
            lecture["match"] = {"satisfied": sum(1 for e in evals if e["result"] == "match"), "total": len(evals)}
    same = len(cols) == 2 and cols[0].get("course_id") and cols[0].get("course_id") == cols[1].get("course_id")
    names = [f"'{_label(c, bool(same))}'" for c in cols]
    head = f"{josa(names[0], '과/와')} {josa(names[1], '을/를')} 비교했어요." if len(cols) == 2 else ""
    highlights = _highlights(cols, bool(enabled)) if len(cols) == 2 else []
    return {"message": " ".join([head] + highlights).strip(), "highlights": highlights, "courses": cols}
