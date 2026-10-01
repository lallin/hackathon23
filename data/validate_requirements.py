"""requirements.json 검증: 서버 샘플 형식, 8개 조합, 학점, 같은 연도 학점표·과목 목록 일치."""
import json, sys
from pathlib import Path
path = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent / "seed" / "requirements.json"
d = json.load(open(path, encoding="utf-8"))
errs, warns = [], []
MIN = ["전필", "전선", "교필"]   # 교선은 최소 없음(팀 결정)
for key in ["admission_years", "supported_years", "majors", "requirements"]:
    if key not in d: errs.append(f"최상위 키 없음: {key}")
reqs = {(r["admission_year"], r["major"]): r for r in d.get("requirements", [])}
majors = [m["id"] for m in d.get("majors", []) if m["supported"]]
for y in d.get("supported_years", []):
    if y not in d["admission_years"]: errs.append(f"{y}: admission_years에 없음")
    for m in majors:
        k = f"{y}-{m}"; r = reqs.get((y, m))
        if not r: errs.append(f"{k}: 없음"); continue
        c = r["credits"]
        if set(c) != set(MIN) or any(not isinstance(c[x], int) for x in MIN):
            errs.append(f"{k}: credits는 전필·전선·교필 정수만 ({c})"); continue
        if sum(c.values()) > r["total_credits"]: errs.append(f"{k}: 최소 학점 합 > 졸업 {r['total_credits']}")
        ids = r.get("required_course_ids")
        if not isinstance(ids, list) or not ids: errs.append(f"{k}: required_course_ids 없음"); continue
        if len(ids) != len(set(ids)): errs.append(f"{k}: required_course_ids 중복")
        rc = {x["course_id"]: x for x in r.get("required_courses", [])}
        if set(ids) != set(rc): errs.append(f"{k}: required_course_ids와 required_courses 불일치")
        gp = sum(x["credits"] for x in rc.values() if x["category"] == "교필")
        if gp != c["교필"]: errs.append(f"{k}: 교필 {c['교필']} != 필수 교양 합 {gp}")
        if not r.get("major_required_listed"): warns.append(f"{k}: 전필 과목 목록 없음")
        else:
            jp = sum(x["credits"] for x in r["major_courses"] if x["category"] == "전필")
            js = sum(x["credits"] for x in r["major_courses"] if x["category"] == "전선")
            jr = sum(x["credits"] for x in rc.values() if x["category"] == "전필")
            if jp != c["전필"] or jr != c["전필"]: errs.append(f"{k}: 학점표 전필 {c['전필']} != 전필 과목 합 {jp}")
            if js < c["전선"]: errs.append(f"{k}: 전선 과목 전체 {js} < 학점표 전선 {c['전선']}")
        for i in r.get("inferred", []): warns.append(f"{k}: 추정 - {i}")
print("\n".join(["ERROR " + e for e in errs] + ["WARN  " + w for w in warns]) or "OK")
sys.exit(1 if errs else 0)