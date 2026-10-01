"""AI 체크리스트: 기본 항목, 대학 스타일 프리셋, 합치기 규칙, 충족 판정."""
import re
from typing import Dict, List, Optional

from app.catalog import catalog
from app.schemas import ChecklistItem

LEVEL_NUM = {"low": 1, "mid": 2, "high": 3}
NUM_LEVEL = {1: "low", 2: "mid", 3: "high"}
LEVEL_KO = {"low": "적음", "mid": "보통", "high": "많음"}

# kind: lecture = 수강평 배치 분석 값, shape = 조합의 시간표에서 계산
BASE_ITEMS = [
    {"key": "assignment", "label": "과제량", "type": "level", "kind": "lecture"},
    {"key": "team_project", "label": "팀플", "type": "level", "kind": "lecture"},
    {"key": "exam", "label": "시험 횟수", "type": "level", "kind": "lecture"},
    {"key": "presentation", "label": "발표", "type": "level", "kind": "lecture"},
    {"key": "attendance", "label": "출석 체크", "type": "level", "kind": "lecture"},
    {"key": "first_period", "label": "1교시 수업", "type": "level", "kind": "shape"},
    {"key": "gap", "label": "우주공강", "type": "level", "kind": "shape"},
]
BASE = {item["key"]: item for item in BASE_ITEMS}
LECTURE_KEYS = [i["key"] for i in BASE_ITEMS if i["kind"] == "lecture"]

STYLES = {
    "graduation": {"label": "졸업 요건 우선", "items": []},
    "late_riser": {"label": "늦잠 우선", "items": [("first_period", "low"), ("attendance", "low")]},
    "club": {"label": "동아리 활동 우선", "items": [("assignment", "low"), ("team_project", "low")]},
    "career": {"label": "취업 준비 우선", "items": [("assignment", "low"), ("exam", "low")]},
    "commute": {"label": "통학 편의 우선", "items": [("first_period", "low"), ("gap", "low")]},
}


def custom_key(label: str) -> str:
    return "custom:" + re.sub(r"\s+", "", label)


def is_custom(key: str) -> bool:
    return key.startswith("custom:")


def display_name(item: ChecklistItem) -> str:
    """'팀플 적음', '교수님이 친절함'처럼 화면과 답장에 쓰는 이름."""
    if item.type == "level" and item.level:
        return f"{item.label} {LEVEL_KO[item.level]}"
    return item.label


def josa(word: str, pair: str) -> str:
    """받침에 따라 '을/를', '이/가', '은/는', '으로/로'를 붙인다."""
    with_batchim, without = pair.split("/")
    last = word.rstrip("'\" )")[-1:] if word else ""
    if last.isdigit():
        # 숫자는 읽는 소리로: 영·일·삼·육·칠·팔은 받침이 있다(일·칠·팔은 ㄹ 받침)
        last = "영일이삼사오육칠팔구"[int(last)]
    if last and "가" <= last <= "힣":
        code = (ord(last) - 0xAC00) % 28
        if pair == "으로/로" and code == 8:  # ㄹ 받침은 '로'
            return word + without
        return word + (with_batchim if code else without)
    return word + without


def style_items(style: str) -> List[ChecklistItem]:
    return [
        ChecklistItem(key=key, label=BASE[key]["label"], type="level", level=level, enabled=True, source="style")
        for key, level in STYLES[style]["items"]
    ]


# ---- 합치기 규칙 ----
def apply_style(checklist: List[ChecklistItem], style: str) -> List[ChecklistItem]:
    """이전 스타일이 넣고 아무도 건드리지 않은 항목(source=style)을 빼고 새 프리셋을 넣는다.
    이미 있는 key는 덮어쓰지 않는다(사용자가 직접 말한 값이 먼저)."""
    result = [item.model_copy() for item in checklist if item.source != "style"]
    keys = {item.key for item in result}
    for item in style_items(style):
        if item.key not in keys:
            result.append(item)
    return result


def merge_item(checklist: List[ChecklistItem], update: ChecklistItem) -> List[ChecklistItem]:
    """같은 key는 하나만. 챗봇이 말한 값은 기존 값을 덮어쓴다."""
    result = []
    replaced = False
    for item in checklist:
        if item.key == update.key:
            merged = item.model_copy(update={
                "level": update.level if update.type == "level" and update.level else item.level,
                "enabled": update.enabled,
                "source": update.source,
            })
            result.append(merged)
            replaced = True
        else:
            result.append(item)
    if not replaced:
        if update.type == "level" and not update.level:
            update = update.model_copy(update={"level": "mid"})
        result.append(update)
    return result


# ---- 강의별 값 ----
def syllabus_levels(syllabus: Optional[dict]) -> Dict[str, int]:
    """수강계획서 평가 방법에서 사실로 읽히는 값만 뽑는다.
    과제 비율은 강의평의 과제량과 잘 맞지 않아(0%인 강의도 70%가 '보통') 쓰지 않는다."""
    ev = (syllabus or {}).get("evaluation_method") or {}
    if not ev:
        return {}
    labels = [(o.get("label") or "", o.get("percent") or 0) for o in ev.get("others") or [] if isinstance(o, dict)]
    exams = int(bool(ev.get("midterm"))) + int(bool(ev.get("final")))
    levels = {"exam": 3 if any("퀴즈" in label for label, _ in labels) else 2 if exams == 2 else 1}
    for key, word in (("team_project", "팀"), ("presentation", "발표")):
        weights = [p for label, p in labels if word in label]
        if weights:
            levels[key] = 3 if max(weights) >= 20 else 2
    return levels


def lecture_level(lecture_id: str, key: str):
    """기본 항목 값과 출처. 강의평 값이 먼저이고, 없으면 수강계획서에서 읽히는 값."""
    value = (catalog.insights.get(lecture_id) or {}).get("levels", {}).get(key)
    if value is not None:
        return value, "review"
    value = syllabus_levels(catalog.syllabus_by_lecture.get(lecture_id)).get(key)
    return (value, "syllabus") if value is not None else (None, None)


def lecture_value(lecture_id: str, item: ChecklistItem):
    """레벨형은 1~3 또는 None, 적용형은 'match' / 'opposite' / None."""
    if item.key in LECTURE_KEYS:
        return lecture_level(lecture_id, item.key)[0]
    if is_custom(item.key):
        return catalog.judgments.get((lecture_id, item.key))
    return None


def to_minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def shape_counts(sections: List[dict]) -> Dict[str, int]:
    """1교시(10시 전 시작) 수업 횟수와 우주공강(같은 날 수업 사이 2시간 이상) 횟수."""
    first_period = 0
    by_day: Dict[str, List[tuple]] = {}
    for s in sections:
        for t in s["times"]:
            start, end = to_minutes(t["start"]), to_minutes(t["end"])
            if start < 10 * 60:
                first_period += 1
            by_day.setdefault(t["day"], []).append((start, end))
    gap = 0
    for slots in by_day.values():
        slots.sort()
        for (_, prev_end), (next_start, _) in zip(slots, slots[1:]):
            if next_start - prev_end >= 120:
                gap += 1
    return {"first_period": first_period, "gap": gap}


def shape_level(key: str, count: int) -> str:
    if key == "first_period":
        return "low" if count <= 1 else "mid" if count <= 3 else "high"
    return "low" if count == 0 else "mid" if count <= 2 else "high"


def avg_level(avg: float) -> str:
    if avg < 1.7:
        return "low"
    if avg <= 2.3:
        return "mid"
    return "high"


# ---- 충족 판정 ----
def evaluate_item(item: ChecklistItem, lecture_ids: List[str], sections: List[dict]) -> dict:
    """조합 하나에 대한 항목의 충족 여부와 분포."""
    base = item.model_dump()
    if item.key in BASE and BASE[item.key]["kind"] == "shape":
        count = shape_counts(sections)[item.key]
        level = shape_level(item.key, count)
        return {**base, "satisfied": level == item.level, "dist": {"count": count}, "avg": None,
                "text": f"주 {count}회 ({LEVEL_KO[level]})"}

    values = [lecture_value(lid, item) for lid in lecture_ids]
    if item.type == "toggle":
        match = sum(1 for v in values if v == "match")
        opposite = sum(1 for v in values if v == "opposite")
        unknown = len(values) - match - opposite
        satisfied: Optional[bool] = None if match + opposite == 0 else (opposite == 0 and match >= 1)
        text = f"맞음 {match} · 반대 {opposite} · 정보 없음 {unknown}과목"
        if satisfied is None:
            text = f"판단 불가 (정보 없음 {unknown}과목)"
        return {**base, "satisfied": satisfied, "dist": {"match": match, "opposite": opposite, "unknown": unknown},
                "avg": None, "text": text}

    known = [v for v in values if isinstance(v, int)]
    dist = {"low": known.count(1), "mid": known.count(2), "high": known.count(3), "unknown": len(values) - len(known)}
    if not known:
        return {**base, "satisfied": None, "dist": dist, "avg": None,
                "text": f"판단 불가 (정보 없음 {dist['unknown']}과목)"}
    avg = round(sum(known) / len(known), 1)
    text = f"적음 {dist['low']} · 보통 {dist['mid']} · 많음 {dist['high']}과목 (평균 {avg}/3)"
    if dist["unknown"]:
        text += f" · 정보 없음 {dist['unknown']}과목"
    satisfied = avg_level(avg) == item.level if item.level else None
    return {**base, "satisfied": satisfied, "dist": dist, "avg": avg, "text": text}


def evaluate_lecture(item: ChecklistItem, lecture_id: str) -> dict:
    """강의 하나에 대한 항목 판정(온디맨드 수강평 카드용)."""
    value = lecture_value(lecture_id, item)
    if value is None:
        result = "unknown"
    elif item.type == "toggle":
        result = value
    else:
        target = LEVEL_NUM.get(item.level or "mid", 2)
        result = "match" if value == target else "opposite" if abs(value - target) == 2 else "partial"
    return {"key": item.key, "label": item.label, "type": item.type, "level": item.level,
            "value": NUM_LEVEL.get(value) if isinstance(value, int) else value, "result": result}
