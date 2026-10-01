"""시간표 생성기. LLM 없이 탐색과 점수로 조합을 만든다.

반드시 지킬 것: 시간 겹침 없음, 같은 과목은 한 분반, 공강 요일엔 수업 없음,
총 학점은 목표-2 이상 목표 이하, 고정한 분반은 포함, 제한한 과목·이미 들은 과목은 제외.
"""
import heapq
import math
from itertools import combinations
from typing import Dict, List, Optional, Set

from app.catalog import CATEGORIES, DAYS, catalog, lecture_id_of, min_credits, total_credits
from app.checklist import (BASE, LEVEL_NUM, STYLES, evaluate_item, is_custom, josa, lecture_value,
                           shape_counts, shape_level, to_minutes)
from app.insights import judge_custom_items
from app.schemas import ChecklistItem, GenerateRequest

DAY_START = 8 * 60
SLOTS_PER_DAY = 32  # 08:00 ~ 24:00, 30분 단위
NODE_CAP = 120_000
DIAG_NODE_CAP = 30_000
KEEP = 400
TOP_N = 5

W_REQUIRED = 20
W_DEFICIT = 6
W_CHECK = 6
W_PREF = 3
W_STYLE = 4
W_CREDITS = 4
W_COMMUTE_DAY = 6
W_CAREER_GAP_HOUR = 2


class GenerateError(ValueError):
    pass


def section_mask(section: dict) -> int:
    mask = 0
    for t in section["times"]:
        day = DAYS.index(t["day"])
        start = (to_minutes(t["start"]) - DAY_START) // 30
        end = math.ceil((to_minutes(t["end"]) - DAY_START) / 30)
        for slot in range(max(start, 0), min(end, SLOTS_PER_DAY)):
            mask |= 1 << (day * SLOTS_PER_DAY + slot)
    return mask


def completed_credits_of(course_ids: List[str], admission_year: int, major: str) -> Dict[str, float]:
    credits = {c: 0.0 for c in CATEGORIES}
    for cid in course_ids:
        course = catalog.courses.get(cid)
        category = catalog.category(cid, admission_year, major)
        if course and category in credits:
            credits[category] += course["credits"]
    return credits


class Context:
    """요청 하나에 대한 탐색 준비물."""

    def __init__(self, req: GenerateRequest, items: List[ChecklistItem]):
        self.req = req
        self.cond = req.conditions
        self.style = self.cond.style
        requirement = catalog.requirements.get((req.admission_year, req.major))
        if not requirement:
            raise GenerateError("지원하지 않는 입학년도·학과예요. 지금은 컴퓨터공학과와 경영학과(2023~2026학번)만 쓸 수 있어요.")
        self.required_credits = min_credits(requirement)  # 교선은 최소 학점이 없다
        self.total_required = total_credits(requirement)
        self.done = set(req.completed_course_ids)
        self.required_remaining = [cid for cid in requirement["required_course_ids"] if cid not in self.done]
        done_credits = req.completed_credits or completed_credits_of(req.completed_course_ids, req.admission_year, req.major)
        self.done_credits = {c: float(done_credits.get(c, 0)) for c in CATEGORIES}
        self.remaining = {c: max(0.0, self.required_credits.get(c, 0) - self.done_credits[c]) for c in CATEGORIES}
        self.remaining_total = max(0.0, self.total_required - sum(self.done_credits.values()))

        self.items = [i for i in items if i.enabled]
        self.lecture_items = [i for i in self.items if (i.key in BASE and BASE[i.key]["kind"] == "lecture") or is_custom(i.key)]
        self.shape_items = [i for i in self.items if i.key in BASE and BASE[i.key]["kind"] == "shape"]

        self.pinned = [catalog.sections[sid] for sid in req.pinned_section_ids if sid in catalog.sections]
        pinned_courses = {s["course_id"] for s in self.pinned}
        self.excluded = set(req.excluded_course_ids) - pinned_courses
        self.free_days = set(self.cond.free_days)

        w_req = W_REQUIRED * (1.5 if self.style == "graduation" else 1)
        w_def = W_DEFICIT * (1.5 if self.style == "graduation" else 1)
        self.weights = (w_req, w_def)

        self.options = []  # [(course, [(score, section, mask)])]
        for course in catalog.courses.values():
            cid = course["course_id"]
            if course["dept"] not in (req.major, "gen") or cid in self.done or cid in self.excluded or cid in pinned_courses:
                continue
            opts = []
            for section in catalog.sections_by_course.get(cid, []):
                if any(t["day"] in self.free_days for t in section["times"]):
                    continue
                opts.append((self.section_score(course, section), section, section_mask(section)))
            if opts:
                opts.sort(key=lambda o: (-o[0], o[1]["section_id"]))
                self.options.append((course, opts))
        self.options.sort(key=lambda co: (-co[1][0][0], co[0]["course_id"]))

    def cat(self, course_id: str) -> str:
        """이 학생의 입학년도 교육과정 기준 이수구분."""
        return catalog.category(course_id, self.req.admission_year, self.req.major)

    def section_score(self, course: dict, section: dict) -> float:
        w_req, w_def = self.weights
        score = 0.0
        if course["course_id"] in self.required_remaining:
            score += w_req
        category = self.cat(course["course_id"])
        required = self.required_credits.get(category, 0)
        if self.remaining.get(category, 0) > 0 and required:
            score += w_def * min(1.0, self.remaining[category] / required) * course["credits"] / 3 + 2
        elif self.remaining_total > 0:
            score += course["credits"] / 3  # 최소 학점은 찼어도 남은 졸업 학점은 채운다
        else:
            score -= 2
        lid = lecture_id_of(course["course_id"], section["professor"])
        for item in self.lecture_items:
            value = lecture_value(lid, item)
            if item.type == "level" and isinstance(value, int) and item.level:
                score += W_CHECK * (1 - abs(value - LEVEL_NUM[item.level]))
            elif value == "match":
                score += W_CHECK
            elif value == "opposite":
                score -= W_CHECK
        for t in section["times"]:
            start, end = to_minutes(t["start"]), to_minutes(t["end"])
            if self.cond.preferred_time == "morning" and start >= 13 * 60:
                score -= W_PREF
            if self.cond.preferred_time == "afternoon" and start < 12 * 60:
                score -= W_PREF
            if self.style == "late_riser" and start < 10 * 60:
                score -= W_STYLE
            if self.style == "club" and end > 16 * 60:
                score -= W_STYLE
        return score

    def combo_score(self, sections: List[dict], partial: float, credits: float) -> float:
        score = partial - W_CREDITS * (self.cond.target_credits - credits)
        counts = shape_counts(sections) if self.shape_items else {}
        for item in self.shape_items:
            if item.level:
                diff = abs(LEVEL_NUM[shape_level(item.key, counts[item.key])] - LEVEL_NUM[item.level])
                score += W_CHECK * (1 - diff)
        if self.style == "commute":
            score -= W_COMMUTE_DAY * len(days_used(sections))
        if self.style == "career":
            score -= W_CAREER_GAP_HOUR * gap_minutes(sections) / 60
        return score


def days_used(sections: List[dict]) -> List[str]:
    used = {t["day"] for s in sections for t in s["times"]}
    return [d for d in DAYS if d in used]


def gap_minutes(sections: List[dict]) -> int:
    by_day: Dict[str, List[tuple]] = {}
    for s in sections:
        for t in s["times"]:
            by_day.setdefault(t["day"], []).append((to_minutes(t["start"]), to_minutes(t["end"])))
    total = 0
    for slots in by_day.values():
        slots.sort()
        total += sum(max(0, b[0] - a[1]) for a, b in zip(slots, slots[1:]))
    return total


def search(ctx: Context, node_cap: int = NODE_CAP) -> List[tuple]:
    """(score, section_ids, sections) 목록을 점수순으로 돌려준다."""
    target = ctx.cond.target_credits
    min_credits = target - 2
    opts = ctx.options
    n = len(opts)
    suffix_credits = [0.0] * (n + 1)
    suffix_min = [math.inf] * (n + 1)
    for i in range(n - 1, -1, -1):
        credits = opts[i][0]["credits"]
        suffix_credits[i] = suffix_credits[i + 1] + credits
        suffix_min[i] = min(suffix_min[i + 1], credits)

    base_mask, base_credits, base_score = 0, 0.0, 0.0
    for s in ctx.pinned:
        mask = section_mask(s)
        if base_mask & mask or any(t["day"] in ctx.free_days for t in s["times"]):
            return []
        base_mask |= mask
        course = catalog.courses[s["course_id"]]
        base_credits += course["credits"]
        base_score += ctx.section_score(course, s)

    # 과목 조합마다 가장 좋은 분반 배치 하나만 남긴다. 분반만 다른 변형이 상위를 채우지 않게.
    best: Dict[tuple, tuple] = {}
    nodes = 0
    chosen: List[dict] = list(ctx.pinned)

    def record(partial: float, credits: float):
        score = round(ctx.combo_score(chosen, partial, credits), 3)
        course_key = tuple(sorted(s["course_id"] for s in chosen))
        ids = tuple(sorted(s["section_id"] for s in chosen))
        entry = (score, ids, list(chosen))  # 같은 점수면 분반 id 순서로 정해져 결과가 재현된다
        if course_key not in best or entry > best[course_key]:
            best[course_key] = entry

    def dfs(i: int, mask: int, credits: float, partial: float):
        nonlocal nodes
        nodes += 1
        if nodes > node_cap or credits + suffix_credits[i] < min_credits:
            return
        if i == n or credits + suffix_min[i] > target:
            if min_credits <= credits <= target:
                record(partial, credits)
            return
        course, sections = opts[i]
        if credits + course["credits"] <= target:
            for score, section, smask in sections:
                if not mask & smask:
                    chosen.append(section)
                    dfs(i + 1, mask | smask, credits + course["credits"], partial + score)
                    chosen.pop()
        dfs(i + 1, mask, credits, partial)

    if base_credits <= target:
        dfs(0, base_mask, base_credits, base_score)
    return heapq.nlargest(KEEP, best.values())


def pick_diverse(results: List[tuple], top_n: int = TOP_N) -> List[tuple]:
    """앞서 고른 조합과 2과목 이상 다른 것을 우선 고르고, 모자라면 1과목 차이로 채운다."""
    picked: List[tuple] = []
    course_sets: List[Set[str]] = []
    for min_diff in (2, 1):
        for result in results:
            if len(picked) >= top_n:
                break
            courses = {s["course_id"] for s in result[2]}
            if any(r[1] == result[1] for r in picked):
                continue
            if all(len(courses - other) >= min_diff or len(other - courses) >= min_diff for other in course_sets):
                picked.append(result)
                course_sets.append(courses)
    picked.sort(key=lambda r: -r[0])
    return picked


def make_reason(ctx: Context, sections: List[dict], satisfied: int, enabled: int) -> str:
    placed = [s for s in sections if s["course_id"] in ctx.required_remaining]
    by_cat: Dict[str, int] = {}
    for s in placed:
        cat = ctx.cat(s["course_id"])
        by_cat[cat] = by_cat.get(cat, 0) + 1
    used = days_used(sections)
    if ctx.free_days:
        days_part = "·".join(d for d in DAYS if d in ctx.free_days) + "요일을 비웠어요"
    else:
        empty = [d for d in DAYS if d not in used]
        days_part = ("·".join(empty) + "요일은 수업이 없어요") if empty else ""
    if placed:
        detail = " · ".join(f"{c} {n}" for c, n in by_cat.items())
        head = f"남은 필수 과목 {len(placed)}개({detail})를 넣"
        sentence = f"{head}고 {days_part}." if days_part else f"{head}었어요."
    else:
        sentence = f"{days_part}." if days_part else "조건에 맞춰 고른 조합이에요."
    if enabled:
        sentence += f" 체크리스트 {enabled}개 중 {satisfied}개를 충족해요."
    return sentence


def build_combination(ctx: Context, rank: int, score: float, sections: List[dict], all_items: List[ChecklistItem]) -> dict:
    pinned_ids = {s["section_id"] for s in ctx.pinned}
    lecture_ids = [lecture_id_of(s["course_id"], s["professor"]) for s in sections]
    evals = [evaluate_item(item, lecture_ids, sections) for item in all_items]
    enabled = [e for e in evals if e["enabled"]]
    satisfied = sum(1 for e in enabled if e["satisfied"])

    this_semester = {c: 0.0 for c in CATEGORIES}
    out_sections = []
    for s in sorted(sections, key=lambda s: (CATEGORIES.index(ctx.cat(s["course_id"])), s["course_id"])):
        course = catalog.courses[s["course_id"]]
        this_semester[ctx.cat(course["course_id"])] += course["credits"]
        lid = lecture_id_of(course["course_id"], s["professor"])
        out_sections.append({
            "section_id": s["section_id"], "lecture_id": lid, "course_id": course["course_id"],
            "course": course["name"], "professor": s["professor"], "category": ctx.cat(course["course_id"]),
            "is_required": course["course_id"] in ctx.required_remaining, "credits": course["credits"],
            "pinned": s["section_id"] in pinned_ids, "times": s["times"], "has_insight": lid in catalog.insights,
        })
    placed = {s["course_id"] for s in sections}
    return {
        "rank": rank,
        "score": round(score, 1),
        "total_credits": sum(catalog.courses[s["course_id"]]["credits"] for s in sections),
        "sections": out_sections,
        "checklist_eval": evals,
        "satisfied_count": satisfied,
        "enabled_count": len(enabled),
        "days_used": days_used(sections),
        "graduation_after": [
            {"category": c, "done": ctx.done_credits[c], "this_semester": this_semester[c],
             "required": ctx.required_credits.get(c)} for c in CATEGORIES  # 교선은 required가 null
        ],
        "graduation_total_after": {"done": sum(ctx.done_credits.values()), "this_semester": sum(this_semester.values()),
                                   "required": ctx.total_required},
        "required_courses": [
            {"course_id": cid, "name": catalog.course_name(cid),
             "category": ctx.cat(cid),
             "placed": cid in placed, "offered": bool(catalog.sections_by_course.get(cid))}
            for cid in ctx.required_remaining
        ],
        "reason": make_reason(ctx, sections, satisfied, len(enabled)) if rank == 1 else None,
    }


def diagnose(req: GenerateRequest, items: List[ChecklistItem]) -> dict:
    """조합이 없을 때 이유를 찾고, 실제로 조합이 생기는 완화 방법만 제안한다."""
    pinned = [catalog.sections[sid] for sid in req.pinned_section_ids if sid in catalog.sections]
    name = lambda s: catalog.course_name(s["course_id"])
    message = None
    for a, b in combinations(pinned, 2):
        if section_mask(a) & section_mask(b):
            message = f"고정한 '{name(a)}'와 '{name(b)}' 시간이 겹쳐요."
            break
    if not message:
        for s in pinned:
            clash = [d for d in DAYS if d in req.conditions.free_days and any(t["day"] == d for t in s["times"])]
            if clash:
                message = f"고정한 {josa(repr_name(name(s)), '이/가')} {clash[0]}요일에 있어 {clash[0]}요일 공강과 겹쳐요."
                break
    if not message:
        pinned_credits = sum(catalog.courses[s["course_id"]]["credits"] for s in pinned)
        if pinned_credits > req.conditions.target_credits:
            message = f"고정한 과목만 {pinned_credits:g}학점이라 목표 학점 {req.conditions.target_credits}학점을 넘어요."

    # (버튼 문구, 안내 문장, FE가 그대로 덮어쓸 수 있는 요청 조각)
    candidates = []
    for day in req.conditions.free_days:
        days = [d for d in req.conditions.free_days if d != day]
        candidates.append((f"공강 요일에서 {day}요일 빼기", f"공강 요일에서 {day}요일을 빼면 조합이 생겨요.",
                           {"conditions": {**req.conditions.model_dump(), "free_days": days}}))
    for s in pinned:
        ids = [sid for sid in req.pinned_section_ids if sid != s["section_id"]]
        candidates.append((f"'{name(s)}' 고정 풀기", f"'{name(s)}' 고정을 풀면 조합이 생겨요.",
                           {"pinned_section_ids": ids}))
    for cid in req.excluded_course_ids:
        ids = [x for x in req.excluded_course_ids if x != cid]
        cname = catalog.course_name(cid)
        candidates.append((f"'{cname}' 제한 풀기", f"'{cname}' 제한을 풀면 조합이 생겨요.",
                           {"excluded_course_ids": ids}))
    if req.conditions.target_credits > 9:
        lower = max(9, req.conditions.target_credits - 3)
        candidates.append((f"목표 학점을 {lower}학점으로 낮추기", f"목표 학점을 {lower}학점으로 낮추면 조합이 생겨요.",
                           {"conditions": {**req.conditions.model_dump(), "target_credits": lower}}))

    suggestions = []
    for text, hint, patch in candidates:
        relaxed = req.model_copy(update={k: (type(req.conditions)(**v) if k == "conditions" else v) for k, v in patch.items()})
        found = len(pick_diverse(search(Context(relaxed, items), node_cap=DIAG_NODE_CAP)))
        if found:
            suggestions.append({"text": text, "hint": hint, "found": found, "patch": patch})
    suggestions.sort(key=lambda s: -s["found"])
    if not message:
        message = "조건을 모두 만족하는 조합이 없어요."
    message += " " + (suggestions[0]["hint"] if suggestions else "조건을 조금 넓혀서 다시 생성해 주세요.")
    return {"message": message, "suggestions": suggestions[:3]}


def repr_name(course_name: str) -> str:
    return f"'{course_name}'"


def generate(req: GenerateRequest) -> dict:
    warnings: List[str] = []
    ctx_probe = Context(req, [])  # 후보 강의 목록을 얻기 위한 준비
    candidate_lectures = sorted({lecture_id_of(course["course_id"], s["professor"])
                                 for course, opts in ctx_probe.options for _, s, _ in opts} |
                                {lecture_id_of(s["course_id"], s["professor"]) for s in ctx_probe.pinned})

    items = list(req.checklist)
    failed = judge_custom_items([i for i in items if i.enabled], candidate_lectures)
    if failed:
        warnings += [f"'{i.label}' 항목은 지금 판정할 수 없어 이번 생성에서 뺐어요." for i in items if i.key in failed]
        items = [i.model_copy(update={"enabled": False}) if i.key in failed else i for i in items]

    ctx = Context(req, items)
    results = pick_diverse(search(ctx))
    combinations_out = [build_combination(ctx, rank, score, sections, items)
                        for rank, (score, _, sections) in enumerate(results, 1)]
    infeasible = None if combinations_out else diagnose(req, items)
    return {"combinations": combinations_out, "infeasible": infeasible, "warnings": warnings}
