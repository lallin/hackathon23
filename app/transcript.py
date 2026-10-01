"""성적표 PDF → 이수 현황.

PDF는 메모리에서 한 번 읽고 버린다. 학번·이름은 추출하지 않고 과목 목록만 남긴다.
"""
import io
import json
import re
from typing import List, Literal, Optional, Tuple

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


# ---- 학교 성적표(개인별 전체 성적조회) PDF를 글자 그대로 읽기 ----
# 한 행은 년도 / 학기 / 이수구분 / 학수번호 / 과목명 / 학점 / 등급 / (인정구분) / (삭제구분) 순서로 나온다.
# 학교 성적표 PDF는 한글 글꼴 때문에 AI 쪽 PDF 읽기에서 한글이 빠지므로, 이 형식이면 AI 없이 규칙으로 읽는다.
# 다른 학생 성적표에서 생길 수 있는 경우를 함께 처리한다:
#   행이 페이지 경계에서 잘림(머리글·쪽 번호가 끼어듦), 긴 과목명이 여러 줄, 학기 칸이 빈 행,
#   성적이 아직 없는 과목(수강 중), 처음 보는 이수구분, 글자 사이에 끼는 띄어쓰기(NDG E05021, A +)
# 읽은 뒤에는 학기별 '취득학점' 소계와 '총 취득학점'으로 검산해서, 맞지 않으면 경고를 남긴다.
CATEGORY_MAP = {
    "전필": "전필", "전공필수": "전필", "전기": "전필", "전공기초": "전필",
    "전선": "전선", "전공선택": "전선",
    "교필": "교필", "교양필수": "교필",
    "교선": "교선", "교양선택": "교선", "기초": "교선", "심화": "교선", "소양": "교선", "인성": "교선", "핵심": "교선",
    "일선": OTHER, "일교": OTHER, "자선": OTHER, "다필": OTHER, "다선": OTHER, "부필": OTHER, "부선": OTHER,
    "교직": OTHER, "연계": OTHER,
}
GE_CODE_PREFIXES = ("BKSA", "BZZA")  # 교양 학수번호. 이수구분을 모를 때 교선으로 본다
HEADER_WORDS = {"년도", "학기", "이수구분", "학수번호", "과목명", "학점", "등급", "인정구분", "삭제구분"}
CODE_RE = re.compile(r"[A-Z]{3,5}\d{4,6}")
CREDIT_RE = re.compile(r"\d{1,2}(\.\d+)?")
GRADE_RE = re.compile(r"A\+|A0|A|B\+|B0|B|C\+|C0|C|D\+|D0|D|F|FA|P|NP|N|S|U|W|I")
YEAR_RE = re.compile(r"(19|20)\d\d")
TERM_RE = re.compile(r"\d학기|.*계절.*|.*하계.*|.*동계.*")
SUBTOTAL_RE = re.compile(r"(총\s*)?(신청학점|취득학점|평점평균|평균평점|백분위)\s*:\s*([\d.]*)")
PAGE_JUNK_RE = re.compile(r"\d+\s*/\s*\d+|\d{4}-\d{2}-\d{2}.*|개인별\s*전체\s*성적조회")


def _despace(text: str) -> str:
    return re.sub(r"\s+", "", text)


def _clean(lines: List[str]) -> List[tuple]:
    """인적사항(첫 머리글 앞)을 버리고, 머리글·쪽 번호·날짜를 지우고, 소계 줄을 ('sub', 이름, 값)으로 바꾼다.
    나머지는 ('txt', 줄)."""
    try:
        start = next(i for i, l in enumerate(lines) if _despace(l) == "년도")
    except StopIteration:
        return []
    out, i = [], start
    while i < len(lines):
        line = lines[i]
        subs = list(SUBTOTAL_RE.finditer(line)) if SUBTOTAL_RE.match(line) else []
        if subs:  # '신청학점 : 16.0'처럼 한 줄에 하나 또는 여러 개. 값이 다음 줄에 올 수도 있다
            for m in subs:
                value = m.group(3)
                if not value and len(subs) == 1 and i + 1 < len(lines) and CREDIT_RE.fullmatch(lines[i + 1]):
                    value, i = lines[i + 1], i + 1
                out.append(("sub", ("총" if m.group(1) else "") + m.group(2), float(value) if value else None))
        elif _despace(line) not in HEADER_WORDS and not PAGE_JUNK_RE.fullmatch(line):
            out.append(("txt", line))
        i += 1
    return out


def _category(raw: Optional[str], code: str, warnings: List[str]) -> str:
    if raw in CATEGORY_MAP:
        return CATEGORY_MAP[raw]
    # 처음 보는 이수구분이거나 칸이 비었으면 학수번호로 정한다
    info = catalog.course_info(code)
    category = (info or {}).get("category") or ("교선" if code.startswith(GE_CODE_PREFIXES) else OTHER)
    if category not in CATEGORIES:
        category = OTHER
    warnings.append(f"{code}: 이수구분 '{raw or '없음'}'을(를) 몰라 {category}(으)로 봤어요")
    return category


def parse_transcript_lines(lines: List[str]) -> Tuple[List[dict], List[str]]:
    """성적표 글자 줄 → (과목 목록, 검산 경고). 이 형식이 아니면 ([], [])."""
    items = _clean(lines)
    warnings: List[str] = []
    texts = [(n, it[1]) for n, it in enumerate(items) if it[0] == "txt"]
    pos = {n: k for k, (n, _) in enumerate(texts)}  # items 위치 → texts 위치
    codes = [k for k, (_, t) in enumerate(texts) if CODE_RE.fullmatch(_despace(t))]
    rows = []
    for c_i, k in enumerate(codes):
        # 학수번호 앞: [년도] [학기] [이수구분] — 학기·이수구분은 빠질 수 있다
        back = [texts[x][1] for x in range(max(0, k - 3), k)]
        year_at = max((j for j, t in enumerate(back) if YEAR_RE.fullmatch(_despace(t))), default=None)
        if year_at is None:
            continue
        head = back[year_at + 1:]
        term = next((t for t in head if TERM_RE.fullmatch(_despace(t))), None)
        raw_cat = next((_despace(t) for t in head if t != term), None)
        # 이 행이 끝나는 곳: 다음 행의 년도 직전(없으면 끝)
        nxt = codes[c_i + 1] if c_i + 1 < len(codes) else None
        if nxt is not None:
            nback = [texts[x][1] for x in range(max(0, nxt - 3), nxt)]
            n_year = max((j for j, t in enumerate(nback) if YEAR_RE.fullmatch(_despace(t))), default=0)
            end = nxt - len(nback) + n_year
        else:
            end = len(texts)
        # 학수번호와 다음 행 사이에 소계가 있으면 소계 앞에서 끊는다
        stop_item = texts[end][0] if end < len(texts) else len(items)
        sub_item = next((n for n in range(texts[k][0] + 1, stop_item) if items[n][0] == "sub"), None)
        if sub_item is not None:
            end = min(end, next((pos[m] for m in range(sub_item, len(items)) if m in pos), len(texts)))
        body = [texts[x][1] for x in range(k + 1, end)]
        # 과목명 뒤 '학점 → 등급'. 등급이 없으면(수강 중) 마지막 숫자를 학점으로 본다
        credit_at = next((j for j in range(len(body) - 1)
                          if CREDIT_RE.fullmatch(body[j]) and GRADE_RE.fullmatch(_despace(body[j + 1]))), None)
        grade = ""
        if credit_at is not None:
            grade = _despace(body[credit_at + 1])
            extras = body[credit_at + 2:]
        else:
            credit_at = max((j for j, t in enumerate(body) if CREDIT_RE.fullmatch(t) and j > 0), default=None)
            if credit_at is None:
                warnings.append(f"{_despace(texts[k][1])}: 학점을 찾지 못해 뺐어요")
                continue
            extras = body[credit_at + 1:]
        code = _despace(texts[k][1])
        rows.append({
            "course_id": code,
            "name": _despace("".join(body[:credit_at])),
            "category": _category(raw_cat, code, warnings),
            "credits": float(body[credit_at]),
            "grade": grade,
            "deletion": next((x.strip() for x in extras if "포기" in x or "삭제" in x), None),
            "_item": texts[k][0],
        })
    _verify(items, rows, warnings)
    for r in rows:
        r.pop("_item")
    return rows, warnings


def _counted(row: dict) -> bool:
    """학교가 '취득학점'에 넣는 행: 성적이 있고, 낙제·미인정이 아니고, 학점포기가 아님"""
    grade = row["grade"].upper()
    return bool(grade) and grade not in EXCLUDED_GRADES and not row.get("deletion")


def _verify(items: List[tuple], rows: List[dict], warnings: List[str]) -> None:
    """학기별 '취득학점' 소계와 '총 취득학점'을 읽은 과목의 학점 합과 맞춰 본다."""
    prev, total_counted = -1, 0.0
    for n, it in enumerate(items):
        if it[0] != "sub" or it[1] not in ("취득학점", "총취득학점") or it[2] is None:
            continue
        if it[1] == "취득학점":
            got = sum(r["credits"] for r in rows if prev < r["_item"] < n and _counted(r))
            total_counted += got
            if abs(got - it[2]) > 0.01:
                warnings.append(f"학기 소계 취득학점 {it[2]:g}학점인데 읽은 과목은 {got:g}학점이에요")
            prev = n
        elif abs(total_counted - it[2]) > 0.01:
            warnings.append(f"총 취득학점 {it[2]:g}학점인데 읽은 과목은 {total_counted:g}학점이에요")


def parse_text_transcript(data: bytes) -> Tuple[List[dict], List[str]]:
    """PDF의 글자 데이터에서 과목 행을 읽는다. 이 형식이 아니면 ([], []). 인적사항(이름·학번)은 읽지 않는다."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        lines = [l.strip() for page in reader.pages for l in (page.extract_text() or "").splitlines() if l.strip()]
    except Exception as e:
        print(f"[transcript] PDF 글자를 읽지 못해 AI로 읽습니다: {e}")
        return [], []
    return parse_transcript_lines(lines)


def parse_pdf(data: bytes, filename: str = "transcript.pdf") -> Tuple[List[dict], List[str]]:
    """성적표 PDF → (과목 목록, 검산 경고)."""
    courses, warnings = parse_text_transcript(data)
    if courses:
        return courses, warnings
    # 학교 성적표 형식이 아니면(스캔본 등) AI로 읽는다. FE는 90초 기다린다: 40초 × 2번 시도
    result = ask_json(TranscriptResult, PROMPT, system="너는 성적표를 정확하게 표로 옮기는 도우미다.",
                      pdf=(data, filename or "transcript.pdf"), timeout=40, retries=1)
    return [c.model_dump() for c in result.courses], []


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
    if not grade:
        return "성적 없음(수강 중)"
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
    for n, course in enumerate(courses):
        reason = _excluded_reason(course)
        if reason:
            excluded.append({**course, "reason": reason})
            continue
        if course.get("category") == OTHER:
            # 재수강이면 같은 학수번호(없으면 과목명)로 합치고, 둘 다 없으면 행마다 따로 센다
            key = course.get("course_id") or normalize_name(course["name"]) or str(n)
            passed[OTHER + ":" + key] = {"name": course["name"], "credits": course["credits"], "category": OTHER}
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
