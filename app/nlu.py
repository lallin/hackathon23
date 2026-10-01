"""AI 챗봇: 메시지를 해석해 시간표 조건·체크리스트에 반영한다.

LLM은 의도와 변경 내용만 JSON으로 뽑는다. 실제 상태 합치기와 답장 문구는 서버가 만든다.
그래야 답장과 화면이 어긋나지 않는다.
"""
from typing import List, Literal, Optional

from pydantic import BaseModel

from ai_service import LLMError, ask_json
from app.catalog import DAYS
from app.checklist import BASE, BASE_ITEMS, LEVEL_KO, STYLES, apply_style, custom_key, display_name, josa, merge_item
from app.schemas import ChatRequest, ChecklistItem, Conditions

AI_ERROR_REPLY = "지금 AI 응답이 늦어요. 잠시 후 다시 말씀해 주세요."
TIME_KO = {"any": "상관없음", "morning": "오전", "afternoon": "오후"}


class CondPatch(BaseModel):
    target_credits: Optional[int]
    free_days: Optional[List[Literal["월", "화", "수", "목", "금"]]]
    preferred_time: Optional[Literal["any", "morning", "afternoon"]]
    style: Optional[Literal["graduation", "late_riser", "club", "career", "commute"]]


class ItemPatch(BaseModel):
    key: str
    label: str
    type: Literal["level", "toggle"]
    level: Optional[Literal["low", "mid", "high"]]
    enabled: bool


class ReviewTarget(BaseModel):
    course_name: str
    professor: Optional[str]


class ChatParse(BaseModel):
    intent: Literal["set_preferences", "course_review", "other"]
    conditions: CondPatch
    checklist: List[ItemPatch]
    unsupported: List[str]
    review_targets: List[ReviewTarget]
    answer: Optional[str]


def _system_prompt() -> str:
    base = "\n".join(f'- {i["key"]}: {i["label"]}' for i in BASE_ITEMS)
    styles = "\n".join(f"- {k}: {v['label']}" for k, v in STYLES.items())
    return f"""너는 대학생 시간표 추천 서비스 '에타빌더'의 챗봇 해석기다. 사용자 메시지를 읽고 JSON으로만 답한다.

intent
- set_preferences: 시간표 조건이나 수업 성향(체크리스트)을 말함
- course_review: 특정 과목(또는 과목+교수)의 수강평·평가를 물음
- other: 사용법 질문, 잡담 등

conditions: 바뀌는 값만 채우고 나머지는 null.
- target_credits: 9~21 정수
- free_days: 공강 요일. 바뀌면 현재 값에 변경을 반영한 '전체 목록'을 넣는다(예: 현재 ["수"]에서 "금요일도 공강" → ["수","금"]).
- preferred_time: any(상관없음) / morning(오전) / afternoon(오후)
- style (대학 스타일, 하나만):
{styles}

checklist: 수업 성향 항목의 추가·변경. 기본 항목 key:
{base}
- 기본 항목에 해당하면 그 key를 쓰고 type은 level.
- 기본 항목이 아니면서 수강평으로 판단할 수 있는 성향(교수님이 친절함, 녹화 강의 제공, 학점을 잘 줌, 시험 난이도, 실습 비중 등)은 key를 "custom"으로, label은 짧은 한국어 구로 쓴다.
  정도를 말할 수 있으면(난이도, 비중) type=level, 맞다/아니다만 있으면 type=toggle(level은 null).
- 현재 체크리스트에 같은 뜻의 항목이 이미 있으면 그 항목의 key를 그대로 쓴다(다른 말로 다시 말해도 같은 항목).
  이미 있는 조건을 다시 말해도 빼지 말고 그 항목을 checklist에 넣는다.
- level: low(적음) / mid(보통) / high(많음). "적당히" 같은 애매한 말은 mid. 레벨형은 반드시 level을 채운다.
- "OO는 상관없어"는 그 항목을 enabled=false로. 그 밖에는 enabled=true.
- "1교시 싫어" → first_period low, "우주공강 싫어" → gap low, "공강 많게" 같은 말은 free_days로 판단하지 말고 무시.

unsupported: 수강평·수강계획서·시간표 어디에서도 판단할 수 없는 조건(강의실이 가까운, 친구와 같은 수업 등)을 원문 표현으로.
review_targets: course_review일 때 물어본 과목들(과목명, 교수명 없으면 null). 다른 intent에서도 메시지에 수강평 질문이 섞여 있으면 채운다.
answer: intent가 other일 때만 짧은 한국어 답(2문장 이내). 시간표와 상관없는 질문은 짧게 답하고 시간표 이야기로 돌린다. 그 밖에는 null."""


def _parse(req: ChatRequest) -> ChatParse:
    history = "\n".join(f"{m.role}: {m.content}" for m in req.history[-6:])
    current = [
        {"key": i.key, "label": i.label, "type": i.type, "level": i.level, "enabled": i.enabled}
        for i in req.checklist
    ]
    prompt = (f"현재 시간표 조건: {req.conditions.model_dump()}\n"
              f"현재 체크리스트: {current}\n"
              f"최근 대화:\n{history or '(없음)'}\n\n"
              f"사용자 메시지: {req.message}")
    # FE는 45초 기다린다: 20초 × 2번 시도
    return ask_json(ChatParse, prompt, system=_system_prompt(), timeout=20, retries=1, persist=True)


def _to_item(patch: ItemPatch, existing: List[ChecklistItem]) -> ChecklistItem:
    keys = {i.key: i for i in existing}
    if patch.key in BASE:
        key, label, typ = patch.key, BASE[patch.key]["label"], "level"
    elif patch.key in keys:
        key, label, typ = patch.key, keys[patch.key].label, keys[patch.key].type
    else:
        label = patch.label.strip() or patch.key.replace("custom:", "")
        key, typ = custom_key(label), patch.type
        if key in keys:
            label, typ = keys[key].label, keys[key].type
    level = patch.level if typ == "level" else None  # None이면 기존 값 유지, 새 항목이면 보통
    return ChecklistItem(key=key, label=label, type=typ, level=level, enabled=patch.enabled, source="chat")


def _condition_sentences(old: Conditions, new: Conditions) -> List[str]:
    sentences = []
    added = [d for d in DAYS if d in new.free_days and d not in old.free_days]
    removed = [d for d in DAYS if d in old.free_days and d not in new.free_days]
    if added:
        sentences.append(f"공강 요일에 {'·'.join(added)}요일을 넣었어요.")
    if removed:
        sentences.append(f"공강 요일에서 {'·'.join(removed)}요일을 뺐어요.")
    if new.target_credits != old.target_credits:
        sentences.append(f"목표 학점을 {new.target_credits}학점으로 바꿨어요.")
    if new.preferred_time != old.preferred_time:
        sentences.append(f"선호 시간을 {josa(TIME_KO[new.preferred_time], '으로/로')} 바꿨어요.")
    if new.style != old.style:
        sentences.append(f"대학 스타일을 {josa(_quote(STYLES[new.style]['label']), '으로/로')} 바꿨어요.")
    return sentences


def _quote(text: str) -> str:
    return f"'{text}'"


def handle_chat(req: ChatRequest) -> dict:
    try:
        parsed = _parse(req)
    except LLMError:
        return {"intent": "other", "reply": AI_ERROR_REPLY, "conditions": req.conditions.model_dump(),
                "checklist": [i.model_dump() for i in req.checklist], "changes": [], "unsupported": [],
                "review_target": None, "error": "llm_unavailable"}

    old_cond = req.conditions
    patch = {k: v for k, v in parsed.conditions.model_dump().items() if v is not None}
    if "target_credits" in patch:
        patch["target_credits"] = min(21, max(9, patch["target_credits"]))
    if "free_days" in patch:
        patch["free_days"] = [d for d in DAYS if d in patch["free_days"]]
    new_cond = old_cond.model_copy(update=patch)

    checklist = [i.model_copy() for i in req.checklist]
    changes = [f"conditions.{field}" for field in ("target_credits", "free_days", "preferred_time", "style")
               if getattr(new_cond, field) != getattr(old_cond, field)]
    if new_cond.style != old_cond.style:
        checklist = apply_style(checklist, new_cond.style)

    original_keys = {i.key for i in req.checklist}
    # 스타일을 바꿔서 프리셋으로 새로 들어온 항목도 답장에 알린다
    added = [i for i in checklist if i.key not in original_keys]
    changes += [f"checklist.{i.key}" for i in added]
    updated, disabled, unchanged = [], [], []
    before = {i.key: i for i in checklist}
    for item_patch in parsed.checklist:
        item = _to_item(item_patch, checklist)
        prev = before.get(item.key)
        checklist = merge_item(checklist, item)
        merged = next(i for i in checklist if i.key == item.key)
        if prev is None:
            (added if merged.enabled else disabled).append(merged)
        elif not merged.enabled and prev.enabled:
            disabled.append(merged)
        elif merged.level != prev.level or merged.enabled != prev.enabled:
            updated.append(merged)
        else:
            if item.key in original_keys:  # 이번 메시지에서 스타일이 막 넣은 항목은 '이미 있음'이 아니다
                unchanged.append(merged)
            continue
        changes.append(f"checklist.{item.key}")
    changes = list(dict.fromkeys(changes))

    review_target = None
    notes = []
    targets = parsed.review_targets
    if parsed.intent == "course_review" and targets:
        first = targets[0]
        review_target = {"course_name": first.course_name, "professor": first.professor}
        if len(targets) > 1:
            notes.append(f"한 번에 한 과목씩 조회할 수 있어요. 먼저 {_quote(first.course_name)}부터 볼게요.")
        else:
            who = f" {first.professor} 교수님" if first.professor else ""
            notes.append(f"{_quote(first.course_name)}{who} 수강평을 찾아볼게요.")
    elif targets:
        notes.append("수강평은 다음 메시지로 한 과목씩 물어봐 주세요.")

    sentences = _condition_sentences(old_cond, new_cond)
    if added:
        sentences.append(f"체크리스트에 {josa(', '.join(_quote(display_name(i)) for i in added), '을/를')} 추가했어요.")
    for item in updated:
        if item.type == "level" and item.level:
            sentences.append(f"{josa(_quote(item.label), '을/를')} {josa(LEVEL_KO[item.level], '으로/로')} 바꿨어요.")
        else:
            sentences.append(f"{josa(_quote(item.label), '을/를')} 다시 켰어요.")
    if disabled:
        sentences.append(f"{josa(', '.join(_quote(i.label) for i in disabled), '은/는')} 체크를 해제했어요.")
    if unchanged:
        sentences.append(f"{josa(', '.join(_quote(display_name(i)) for i in unchanged), '은/는')} 이미 체크리스트에 있어요.")
    if parsed.unsupported:
        sentences.append(f"{josa(', '.join(_quote(u) for u in parsed.unsupported), '은/는')} 수강평·계획서·시간표로 판단할 수 없어 반영하지 못했어요.")

    intent = parsed.intent
    if changes:
        if intent != "set_preferences" and review_target is None:
            intent = "set_preferences"
        sentences.append("[생성하기]를 누르면 시간표에 반영돼요.")
    elif intent == "other":
        sentences.insert(0, parsed.answer or "원하는 시간표 조건을 말해 주세요. 예: '금요일 공강, 팀플 적게'")
    elif intent == "set_preferences" and not parsed.unsupported and not unchanged:
        sentences.append("바꿀 조건을 찾지 못했어요. '금요일 공강', '팀플 적게', '1교시 싫어'처럼 말해 주세요.")

    reply = " ".join(sentences + notes).strip()
    return {
        "intent": intent,
        "reply": reply,
        "conditions": new_cond.model_dump(),
        "checklist": [i.model_dump() for i in checklist],
        "changes": changes,
        "unsupported": parsed.unsupported,
        "review_target": review_target,
    }
