"""에브리타임 강의평 통계(data/raw/everytime_*.json) → data/seed/insights.json.

- 과목명은 requirements.json의 major_courses에서 실제 학수번호로 바꾼다. lecture_id = 학수번호-교수.
  거기 없는 과목(교양 등)은 원본 항목에 "course_id"를 직접 적으면 그 값을 쓴다.
- levels(1~3)는 에브리타임 선택지 중 가장 많이 고른 값(top)으로 정한다. 정보가 없으면 그 항목은 뺀다.
  과제·팀플: 없음 1 / 보통 2 / 많음 3
  시험 횟수: 없음·한 번 1 / 두 번 2
  출석 체크: 전자출결 2 / 직접호명·복합적 3 (전자출결은 부르지 않고 자동으로 찍혀 부담이 덜하다)
  발표: 에브리타임 통계에 없어 비워 둔다.
- 수강평 원문이 없으므로 reviews에는 통계를 문장으로 옮긴 한 줄만 넣는다. 자유 항목 판정('학점을 잘 줌' 등)이 이 줄을 읽는다.
- 기존 insights.json의 개발용 샘플 강의는 catalog.json에 그 샘플 과목이 남아 있을 때만 남긴다.
  --drop-sample을 주면 샘플을 지운다.

실행: python data/build_insights.py [--drop-sample]
"""
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent
RAW_FILES = sorted((DATA / "raw").glob("everytime_*.json"))
SEED = DATA / "seed"

THREE = {"none": 1, "mid": 2, "high": 3}
EXAM = {"없음": 1, "한 번": 1, "두 번": 2}
ATTENDANCE = {"전자출결": 2, "직접호명": 3, "복합적": 3}
AMOUNT_KO = {"none": "없음", "mid": "보통", "high": "많음"}
GRADING_KO = {"generous": "너그러움", "mid": "보통", "strict": "깐깐함"}


def course_ids() -> dict:
    req = json.load(open(SEED / "requirements.json", encoding="utf-8"))
    ids = {}
    for r in req["requirements"]:
        for c in r.get("major_courses", []) + r.get("required_courses", []):
            ids.setdefault(c["name"], c["course_id"])
    return ids


def pct_text(stat: dict, names: dict) -> str:
    """{'none': 3, 'mid': 78, 'high': 19, 'top': 'mid'} → "보통 78% · 많음 19% · 없음 3%". 비율이 없으면 top만."""
    parts = [(k, stat.get(k)) for k in names if stat.get(k) is not None]
    if not parts:
        return f"대부분 {names[stat['top']]}" if stat.get("top") else ""
    parts.sort(key=lambda p: -p[1])
    return " · ".join(f"{names[k]} {v}%" for k, v in parts)


def exam_types(exam_type: dict) -> str:
    labels = {"midterm": "중간", "final": "기말", "other": "기타"}
    parts = [f"{labels[k]} {'·'.join(v)}" for k, v in (exam_type or {}).items() if v]
    return ", ".join(parts)


def to_lecture(c: dict, course_id: str) -> dict:
    a, t, g = c["assignment"], c["team_project"], c["grading"]
    levels = {}
    if a.get("top") in THREE:
        levels["assignment"] = THREE[a["top"]]
    if t.get("top") in THREE:
        levels["team_project"] = THREE[t["top"]]
    if c.get("exam_count") in EXAM:
        levels["exam"] = EXAM[c["exam_count"]]
    if c.get("attendance") in ATTENDANCE:
        levels["attendance"] = ATTENDANCE[c["attendance"]]

    n = c["review_count"]
    evidence = {}
    if a.get("top"):
        evidence["assignment"] = f"강의평 {n}개 중 과제: {pct_text(a, AMOUNT_KO)}"
    if t.get("top"):
        evidence["team_project"] = f"강의평 {n}개 중 팀플: {pct_text(t, AMOUNT_KO)}"
    if c.get("exam_count"):
        kinds = exam_types(c.get("exam_type"))
        evidence["exam"] = f"시험 {c['exam_count']}" + (f" ({kinds})" if kinds else "")
    if c.get("attendance"):
        evidence["attendance"] = f"출결 방식: {c['attendance']}"

    summary = [f"별점 {c['rating']}/5 (강의평 {n}개)"]
    if a.get("top") or t.get("top"):
        summary.append(", ".join(x for x in [
            f"과제 {AMOUNT_KO[a['top']]}" if a.get("top") else "",
            f"팀플 {AMOUNT_KO[t['top']]}" if t.get("top") else "",
        ] if x))
    tail = [x for x in [
        f"학점 {GRADING_KO[g['top']]}" if g.get("top") else "",
        f"시험 {c['exam_count']}" if c.get("exam_count") else "",
        f"출결 {c['attendance']}" if c.get("attendance") else "",
    ] if x]
    if tail:
        summary.append(", ".join(tail))

    stat_line = " / ".join(x for x in [
        f"별점 {c['rating']}/5",
        f"과제 {pct_text(a, AMOUNT_KO)}" if a.get("top") else "",
        f"팀플 {pct_text(t, AMOUNT_KO)}" if t.get("top") else "",
        f"학점 {pct_text(g, GRADING_KO)}" if g.get("top") else "",
        f"시험 {c['exam_count']}" if c.get("exam_count") else "",
        f"출결 {c['attendance']}" if c.get("attendance") else "",
    ] if x)

    return {
        "lecture_id": f"{course_id}-{c['professor']}",
        "course_id": course_id,
        "course_name": c["course_name"],
        "professor": c["professor"],
        "levels": levels,
        "summary": summary,
        "evidence": evidence,
        "reviews": [f"[에브리타임 강의평 통계, {n}개] {stat_line}"],
        "review_count": n,
        "syllabus_image": None,
        "source": "everytime_stats",
        "everytime": {k: c.get(k) for k in
                      ["campus", "rating", "rating_distribution", "assignment", "team_project",
                       "grading", "attendance", "exam_count", "exam_type"]},
    }


def main():
    drop_sample = "--drop-sample" in sys.argv
    ids = course_ids()
    lectures, missing = [], []
    for path in RAW_FILES:
        raw = json.load(open(path, encoding="utf-8"))
        for c in raw["courses"]:
            cid = c.get("course_id") or ids.get(c["course_name"])
            if not cid:
                missing.append(f"{path.name}: {c['course_name']}")
                continue
            lectures.append(to_lecture(c, cid))

    seed_file = SEED / "insights.json"
    old = json.load(open(seed_file, encoding="utf-8"))
    real_ids = {l["lecture_id"] for l in lectures}
    # 샘플 강의는 카탈로그에 그 샘플 과목이 남아 있을 때만 남긴다(실제 강의계획서가 들어온 학과는 빠진다).
    catalog_ids = {c["course_id"] for c in json.load(open(SEED / "catalog.json", encoding="utf-8"))["courses"]}
    samples = [] if drop_sample else [
        {**l, "sample": True} for l in old["lectures"]
        if (l.get("sample") or l.get("source") == "batch") and l["course_id"] in catalog_ids
        and l["lecture_id"] not in real_ids
    ]
    out = {
        "sample": bool(samples),
        "note": "source=everytime_stats: 에브리타임 강의평 통계(실제 값, data/raw/). "
                "sample=true인 강의는 개발용 가상 값으로, 실제 카탈로그가 들어오면 --drop-sample로 지운다. "
                "levels는 1(적음)~3(많음).",
        "lectures": lectures + samples,
    }
    with open(seed_file, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print(f"실제 강의 {len(lectures)}개 + 샘플 {len(samples)}개 → {seed_file}")
    for m in missing:
        print(f"  학수번호를 못 찾음: {m}")


if __name__ == "__main__":
    main()
