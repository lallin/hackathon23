"""졸업 기준 원자료(건국대 글로컬캠퍼스 학사요람 캡처) -> data/seed/requirements.json
연도마다 같은 연도의 학점표 · 교양 기준 · 전공교육과정을 쓴다. 없는 연도는 가장 가까운 이전 연도 값을 쓰고 inferred에 적는다."""
import json, copy
from pathlib import Path
OUT = Path(__file__).resolve().parent / "seed" / "requirements.json"   # data/seed/requirements.json
from cse_curriculum import CSE
from biz_curriculum import BIZ
CURRICULUM = {"cse": CSE, "biz": BIZ}

MAJORS = {"cse": {"name": "컴퓨터공학과", "college": "과학기술대학"},
          "biz": {"name": "경영학과", "college": "인문사회융합대학"}}

# 1. 졸업에 필요한 최저 이수 학점 수: (교양, 전필, 전선, 전공계, 다전공, 부전공, 졸업)
TABLE = {
    2023: {"cse": (35, 15, 51, 66, 40, None, 132), "biz": (35, 27, 39, 66, 45, None, 124)},
    2024: {"cse": (35, 12, 54, 66, 40, None, 132), "biz": (35, 27, 39, 66, 45, None, 124)},
    2025: {"cse": (31, 3, 63, 66, 40, 24, 132), "biz": (31, 27, 39, 66, 45, 24, 124)},
    2026: {"cse": (31, 3, 63, 66, 40, 24, 132), "biz": (31, 27, 39, 66, 45, 24, 124)},
}

# 4. 교양과목 기초교양 과목 (학수번호, 과목명, 학점, 세부영역). 외국인 전용·평생학습자 전용 과목은 제외
BASIC_2023 = [
    ("BKSA64611", "창의글쓰기", 3, "글쓰기"), ("BKSA64612", "실용글쓰기", 3, "글쓰기"),
    ("BKSA64613", "성찰글쓰기", 3, "글쓰기"), ("BKSA64623", "미디어글쓰기", 3, "글쓰기"),
    ("BKSA39798", "비판적사고와토론", 3, "발표와토론"), ("BKSA64608", "공감적소통과발표", 3, "발표와토론"),
    ("BKSA64609", "열린사고와실용적말하기", 3, "발표와토론"), ("BKSA64610", "협력적사고와토의", 3, "발표와토론"),
    ("BKSA58110", "문학의고전", 3, "인문기초"), ("BKSA58112", "역사의고전", 3, "인문기초"),
    ("BKSA58113", "철학의고전", 3, "인문기초"),
    ("BKSA15891", "대학기초수학", 3, "과학기초"), ("BKSA58133", "대학기초물리학", 3, "과학기초"),
    ("BKSA58224", "대학기초화학", 3, "과학기초"), ("BKSA59512", "대학기초생물학", 3, "과학기초"),
    ("BKSA56558", "컴퓨팅적사고", 3, "과학기초"), ("BKSA81308", "기초통계학", 3, "과학기초"),
    ("BKSA63377", "과학과예술", 3, "과학기초"),
    ("BKSA53699", "KUGEP1", 3, "외국어기초"), ("BKSA53700", "KUGEP2", 3, "외국어기초"),
    ("BKSA58109", "중국어기초", 3, "외국어기초"), ("BKSA51431", "프랑스어기초", 3, "외국어기초"),
    ("BKSA51432", "러시아어기초", 3, "외국어기초"), ("BKSA58149", "일본어기초", 3, "외국어기초"),
]
BASIC_2025 = [(c, n, 2, a) for c, n, _, a in BASIC_2023 if c != "BKSA63377"]   # 과학과예술 삭제, 학점 3 -> 2
BASIC_2025 = [(c, n, k, "AI/데이터" if c == "BKSA56558" else a) for c, n, k, a in BASIC_2025]  # 컴퓨팅적사고 -> AI/데이터
BASIC_2025 += [("BKSA67912", "데이터리터러시", 2, "AI/데이터"), ("BKSA67913", "AI리터러시", 2, "AI/데이터"),
               ("BKSA67914", "빅데이터의기초", 2, "AI/데이터"), ("BKSA67915", "프로그래밍의기초", 2, "AI/데이터")]

def ge_rules(basic, mins, total_basic):
    ids = lambda area: [c for c, _, _, a in basic if a == area]
    return [
        {"area": "기초교양", "ge_area": "기초", "min_credits": total_basic, "children": [
            {"area": a, "min_credits": m, "course_ids": ids(a), **({"must_include": ["BKSA53699"]} if a == "외국어기초" else {})}
            for a, m in mins]},
        {"area": "심화교양", "ge_area": "심화", "min_credits": 8,
         "rule": "글로벌언어·인간과문화·인간과사회·과학과기술·예술과체육·융복합 6개 영역 중 4개 영역 이상, 영역별 1학점 이상"},
        {"area": "KU소양", "ge_area": "소양", "min_credits": 9, "children": [
            {"area": "인성", "min_credits": 3, "must_include": ["BZZA62440"]},
            {"area": "실무", "min_credits": 4, "must_include": ["BKSA59472"]},
            {"area": "실기", "min_credits": 2}]},
    ]

def required(kugep1):
    return [
        {"course_id": "BKSA53699", "name": "KUGEP1", "category": "교필", "area": "기초교양/외국어기초", "credits": kugep1, "year_semester": "1-1,2"},
        {"course_id": "BZZA62440", "name": "성신의대학생활지도", "category": "교필", "area": "KU소양/인성", "credits": 1, "year_semester": "1-1"},
        {"course_id": "BKSA59472", "name": "취업전략수립및역량개발1", "category": "교필", "area": "KU소양/실무", "credits": 2, "year_semester": "2-1,2"},
    ]

# 교양 기준 (교양 학점, 기초/심화/소양, 세부 규칙, 필수 과목)
GE = {
    2023: {"ge": {"기초": 18, "심화": 8, "소양": 9},
           "rules": ge_rules(BASIC_2023, [("글쓰기", 3), ("발표와토론", 3), ("외국어기초", 6), ("인문기초", 3), ("과학기초", 3)], 18),
           "required": required(3)},
    2025: {"ge": {"기초": 14, "심화": 8, "소양": 9},
           "rules": ge_rules(BASIC_2025, [("글쓰기", 2), ("발표와토론", 2), ("외국어기초", 4), ("인문기초", 2), ("과학기초", 2), ("AI/데이터", 2)], 14),
           "required": required(2)},
}
GE[2024] = copy.deepcopy(GE[2023])   # 2024 학사요람 교양 기준 = 2023과 동일 (확인함)
GE[2026] = copy.deepcopy(GE[2025])   # 2026 학사요람 교양 기준 = 2025와 동일 (E-러닝 전용 기초 과목만 추가, 제외)

def pick(d, year):
    y = year if year in d else max(t for t in d if t <= year)
    return y, d[y]

def entry(year, major):
    table_year, t = pick(TABLE, year)
    g_total, t_jp, t_js, t_major, dm, minor, grad = t[major]
    ge_year, ge = pick(GE, year)
    curriculum = CURRICULUM[major].get(year)
    major_req = [{"course_id": c, "name": n, "category": "전필", "area": "전공", "credits": int(cr), "year_semester": ys}
                 for ys, cat, c, n, cr, _ in (curriculum or []) if cat == "전필"]
    inferred = []
    if table_year == year or not curriculum:
        jp, js = t_jp, t_js
    else:
        jp = sum(r["credits"] for r in major_req); js = t_major - jp
        inferred.append(f"전필 {jp} = 전필 과목 합, 전선 {js} = 전공계 {t_major} - 전필")
    if table_year != year: inferred.insert(0, f"{year} 학점표 없음: {table_year} 학점표 사용")
    if ge_year != year: inferred.append(f"{year} 교양 기준 없음: {ge_year} 교양 기준 사용")
    assert sum(ge["ge"].values()) == g_total or table_year != ge_year, (year, major, "교양 학점 불일치")
    gp = sum(c["credits"] for c in ge["required"])
    credits = {"전필": jp, "전선": js, "교필": gp, "교선": None}   # 교선은 최소 학점 없음
    return {
        "admission_year": year, "major": major,
        "total_credits": grad,
        "credits": credits,
        "ge_credits": dict(ge["ge"]),
        "double_major_credits": {"전공계": dm}, "minor_credits": minor,
        "required_courses": major_req + copy.deepcopy(ge["required"]),
        "major_required_listed": bool(curriculum),
        "major_courses": [{"course_id": c, "name": n, "category": cat, "credits": int(cr), "year_semester": ys,
                           **({"remark": rm} if rm else {})} for ys, cat, c, n, cr, rm in (curriculum or [])],
        "ge_sub_requirements": copy.deepcopy(ge["rules"]),
        "notes": [f"전필 {jp} + 전선 {js} + 교필 {gp} 최소 요건을 채우고, 나머지는 네 영역 중 아무 과목으로 채워 총 {grad}학점",
                  "교선은 최소 학점이 없고 수강한 학점만 표시",
                  f"ge_sub_requirements는 학사요람 교양 영역 기준(교양 {g_total}학점) 원문 데이터"],
        "inferred": inferred,
        "source": f"건국대 글로컬캠퍼스 학사요람: 졸업 최저 이수 학점({table_year}), 교양({ge_year})"
                  + (f", 전공교육과정({year})" if curriculum else ""),
        "credit_table_year": table_year, "ge_year": ge_year,
        "curriculum_year": year if curriculum else None,
        "verified": table_year == year and ge_year == year and bool(curriculum),
    }

SUPPORTED = [2023, 2024, 2025, 2026]
out = {
    "university": "건국대학교 글로컬캠퍼스",
    "semester": "2026-2",
    "categories": ["전필", "전선", "교필", "교선"],
    "ge_required_rule": "교양 과목(기초·심화·소양·인성) 중 required_courses에 있는 학수번호는 교필, 나머지는 교선",
    "category_mapping": {  # 성적표 이수구분 약어. "교양"은 ge_required_rule로 교필/교선 결정, null = 총학점에만 합산
        "전필": "전필", "전선": "전선", "기초": "교양", "소양": "교양", "인성": "교양", "심화": "교양",
        "일선": None, "자선": None, "다필": None, "다선": None, "교직": None},
    "admission_years": [{"year": y, "supported": y in SUPPORTED} for y in range(2019, 2027)],
    "majors": [{"id": k, **v, "supported": True} for k, v in MAJORS.items()],
    "requirements": {f"{y}-{m}": entry(y, m) for y in SUPPORTED for m in MAJORS},
}
OUT.parent.mkdir(parents=True, exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("wrote", len(out["requirements"]), "combos ->", OUT)