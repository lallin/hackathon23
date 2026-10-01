"""강의계획서(data/raw/syllabus_<학과>_*.json)와 개설 강좌 표(data/raw/catalog_<학과>.csv) → data/seed/catalog.json.

강의계획서 JSON은 [{course_name, course_code(과목번호), credits, schedule, professor, teaching_method,
evaluation_method, ...}] 목록이거나 {"courses": [...]}다. 파일 이름의 학과가 ge면 교양, 아니면 그 학과 전공이다.
- 학수번호·이수구분: 전공은 requirements.json의 major_courses(가장 최근 교육과정)에서, 교양은
  build_requirements.py의 교양 과목표에서 과목명으로 찾는다.
- 수업방식·평가방법은 분반의 syllabus 필드에 그대로 넣는다(상세 창에서 쓴다).
CSV는 학교 개설강좌 조회 화면의 열을 그대로 옮긴 것이다(지금은 쓰지 않음, 2025-1 표는 raw/archive/).
강의계획서만 있고 강의평이 없는 강의는 신규 개설로 보고 new_course: true를 붙인다. 서버는 강의평이 없는 강의를
점수에 반영하지 않고 체크리스트 평가에서 "정보 없음"으로 센다.
- section_id = 학수번호-과목번호(분반 번호). 폐강(status=폐강)과 시간이 없는 분반(e-러닝)은 뺀다.
- 강의시간 "월1330-1500(자연과학관 516), 수1500-1630(...)" → times [{day, start, end}].
- 이수구분: 전필·전선은 그대로. 교양(소양·기초·심화·인성)은 requirements.json에서 교필인 과목이면 교필, 아니면 교선.
- dept: 전공 과목은 파일 이름의 학과(cse/biz), 교양은 gen.
- 아직 실제 강의계획서가 없는 학과·교양의 기존 샘플 과목은 "sample": true를 붙여 남긴다. --drop-sample을 주면 지운다.

실행: python data/build_catalog.py [--drop-sample]
"""
import ast
import csv
import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent
SEED = DATA / "seed"
RAW_FILES = sorted((DATA / "raw").glob("catalog_*.csv"))
SYLLABUS_FILES = sorted((DATA / "raw").glob("syllabus_*.json"))

GE_CATEGORIES = {"소양", "기초", "심화", "인성", "교양"}
# 강의계획서의 수강 대상 "9학년"은 전학년 수강 가능을 뜻한다.
TARGET_ALIASES = {"9학년": "전학년"}
TIME_RE = re.compile(r"([월화수목금토일])\s*(\d{2})(\d{2})-(\d{2})(\d{2})")


def parse_times(text: str) -> list:
    return [{"day": d, "start": f"{h1}:{m1}", "end": f"{h2}:{m2}"} for d, h1, m1, h2, m2 in TIME_RE.findall(text)]


def num(text):
    value = float(text)
    return int(value) if value.is_integer() else value


def ge_course_ids() -> dict:
    """build_requirements.py의 BASIC_2023 표(학수번호, 과목명, 학점, 영역)에서 과목명 → 학수번호.
    import하면 requirements.json을 다시 쓰므로 소스에서 표만 읽는다."""
    tree = ast.parse((DATA / "build_requirements.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", None) == "BASIC_2023":
            return {name: cid for cid, name, _, _ in ast.literal_eval(node.value)}
    return {}


def main():
    drop_sample = "--drop-sample" in sys.argv
    req = json.load(open(SEED / "requirements.json", encoding="utf-8"))
    ge_required = {c["course_id"] for r in req["requirements"] for c in r["required_courses"] if c["category"] == "교필"}

    courses, sections, skipped, depts = {}, [], [], set()
    for path in RAW_FILES:
        major = path.stem.split("_", 1)[1]
        depts.add(major)
        with open(path, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                cid, raw_cat = row["course_id"].strip(), row["category"].strip()
                if raw_cat in GE_CATEGORIES:
                    category, dept = ("교필" if cid in ge_required else "교선"), "gen"
                else:
                    category, dept = raw_cat, major
                courses.setdefault(cid, {"course_id": cid, "name": row["name"].strip(), "credits": num(row["credits"]),
                                         "category": category, "dept": dept})
                label = f"{row['name']} {row['class_no']}({row['professor']})"
                if row["status"].strip() == "폐강":
                    skipped.append(f"{label}: 폐강")
                    continue
                times = parse_times(row["schedule"])
                if not times:
                    skipped.append(f"{label}: 시간 없음({row['schedule']})")
                    continue
                sections.append({"section_id": f"{cid}-{row['class_no'].strip()}", "course_id": cid,
                                 "professor": row["professor"].strip(), "times": times,
                                 "capacity": int(row["capacity"]), "lecture_type": row["lecture_type"].strip()})

    ge_ids = ge_course_ids()
    major_courses = {}  # (학과, 과목명) -> 최근 교육과정의 과목 정보
    for r in sorted(req["requirements"], key=lambda r: r["admission_year"]):
        for c in r.get("major_courses", []):
            major_courses[(r["major"], c["name"])] = c
    needs_check = []
    for path in SYLLABUS_FILES:
        major = path.stem.split("_")[1]
        data = json.load(open(path, encoding="utf-8"))
        rows = data["courses"] if isinstance(data, dict) else data
        depts.add("gen" if major == "ge" else major)  # 실제 강의계획서가 있는 학과·교양은 샘플을 지운다
        for row in rows:
            name = row["course_name"].strip()
            label = f"{name} {row['course_code']}({row['professor']})"
            if major == "ge":
                cid = row.get("course_id") or ge_ids.get(name)
                category, dept = ("교필" if cid in ge_required else "교선"), "gen"
            else:
                info = major_courses.get((major, name), {})
                cid, category, dept = row.get("course_id") or info.get("course_id"), info.get("category"), major
            if not cid or not category:
                skipped.append(f"{label}: 학수번호나 이수구분을 못 찾음 ({path.name})")
                continue
            courses.setdefault(cid, {"course_id": cid, "name": name, "credits": num(row["credits"]),
                                     "category": category, "dept": dept})
            for note in row.get("needs_check", []):
                needs_check.append(f"{label}: {note}")
            times = parse_times(row.get("schedule") or "")
            if not times:
                skipped.append(f"{label}: 시간 없음({row.get('schedule')})")
                continue
            syllabus = {k: row[k] for k in ("teaching_method", "evaluation_method") if row.get(k) is not None}
            sections.append({"section_id": f"{cid}-{row['course_code']}", "course_id": cid,
                             "professor": row["professor"].strip(), "times": times, "target": TARGET_ALIASES.get(row.get("target"), row.get("target")),
                             **({"syllabus": syllabus} if syllabus else {}), "from_syllabus": True})

    # 강의계획서만 있고 강의평이 없는 강의는 신규 개설로 보고 강의평 없이 진행한다(new_course 표시).
    review_lids = {l["lecture_id"] for l in json.load(open(SEED / "insights.json", encoding="utf-8"))["lectures"]
                   if not l.get("sample")}
    for s in sections:
        if s.pop("from_syllabus", False) and f"{s['course_id']}-{s['professor']}" not in review_lids:
            s["new_course"] = True

    old = json.load(open(SEED / "catalog.json", encoding="utf-8"))
    # 실제 표가 있는 학과의 샘플은 지우고, 나머지(다른 학과·교양) 샘플은 실제 데이터가 올 때까지 남긴다.
    keep = set() if drop_sample else {
        c["course_id"] for c in old["courses"]
        if c["dept"] not in depts and c["course_id"] not in courses and c.get("sample")
    }
    sample_courses = [{**c, "sample": True} for c in old["courses"] if c["course_id"] in keep]
    sample_sections = [{**s, "sample": True} for s in old["sections"] if s["course_id"] in keep]

    out = {
        "sample": bool(sample_courses),
        "note": f"실제 개설 강좌: {', '.join(sorted(depts))} (data/raw/syllabus_*.json). "
                "sample=true인 과목·분반은 개발용 가상 값으로, 실제 표가 들어오면 --drop-sample로 지운다.",
        "semester": old.get("semester", "2026-2"),
        "courses": list(courses.values()) + sample_courses,
        "sections": sections + sample_sections,
    }
    with open(SEED / "catalog.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print(f"실제 과목 {len(courses)}개 · 분반 {len(sections)}개, 샘플 과목 {len(sample_courses)}개 · 분반 {len(sample_sections)}개")
    for s in skipped:
        print(f"  뺀 분반: {s}")
    for s in needs_check:
        print(f"  원본 확인 필요: {s}")

    # 검사: 필수 과목이 개설됐는지, 강의평이 분반과 연결되는지
    all_courses = {c["course_id"] for c in out["courses"]}
    for r in req["requirements"]:
        if r["major"] not in depts:
            continue
        missing = [f"{c['name']}({c['course_id']})" for c in r["required_courses"] if c["course_id"] not in all_courses]
        if missing:
            print(f"  {r['admission_year']}-{r['major']} 필수 과목 중 이번 학기 개설 안 됨: {', '.join(missing)}")
    insights = json.load(open(SEED / "insights.json", encoding="utf-8"))["lectures"]
    section_lids = {f"{s['course_id']}-{s['professor']}" for s in sections}
    real = [l for l in insights if not l.get("sample")]
    linked = [l["lecture_id"] for l in real if l["lecture_id"] in section_lids]
    print(f"강의평 {len(real)}개 중 이번 분반과 연결: {len(linked)}개 ({', '.join(linked)})")


if __name__ == "__main__":
    main()
