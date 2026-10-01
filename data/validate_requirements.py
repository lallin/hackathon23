"""requirements.json 검증: 8개 조합, 학점 합계, 필수 과목 형식, 확인 여부."""
import json, sys
from pathlib import Path
path = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent / "seed" / "requirements.json"
d = json.load(open(path, encoding="utf-8"))
cats = d["categories"]; errs, warns = [], []
years = [y["year"] for y in d["admission_years"] if y["supported"]]
majors = [m["id"] for m in d["majors"] if m["supported"]]
for y in years:
    for m in majors:
        k = f"{y}-{m}"; r = d["requirements"].get(k)
        if not r: errs.append(f"{k}: 없음"); continue
        c = r["credits"]
        if any(c.get(x) is None for x in ["전필", "전선", "교필"]): errs.append(f"{k}: 최소 학점 비어 있음"); continue
        if c.get("교선") is not None: errs.append(f"{k}: 교선은 최소 학점 없음(null)이어야 함")
        s = sum(c[x] for x in ["전필", "전선", "교필"])
        if s > r["total_credits"]: errs.append(f"{k}: 최저 학점 합 {s} > 졸업 {r['total_credits']}")

        if "free_credits" in r: errs.append(f"{k}: free_credits 남아 있음")
        for rc in r["required_courses"]:
            if rc["category"] not in cats or not rc["course_id"] or "TODO" in rc["course_id"]:
                errs.append(f"{k}: 필수 과목 형식 오류 {rc}")
        for cat in cats:
            req = sum(rc["credits"] for rc in r["required_courses"] if rc["category"] == cat)
            if c[cat] is not None and req != c[cat] and cat == "교필": errs.append(f"{k}: 교필 {c[cat]} != 필수 교양 합 {req}")
            if c[cat] is not None and req > c[cat]: errs.append(f"{k}: {cat} 필수 과목 합 {req} > 요구 {c[cat]}")
        if not r.get("major_required_listed"): warns.append(f"{k}: 전필 과목 목록 없음")
        else:
            jp = sum(x["credits"] for x in r["major_courses"] if x["category"] == "전필")
            js = sum(x["credits"] for x in r["major_courses"] if x["category"] == "전선")
            if jp != c["전필"]: errs.append(f"{k}: 학점표 전필 {c['전필']} != 전필 과목 합 {jp}")
            if js < c["전선"]: errs.append(f"{k}: 전선 과목 전체 {js} < 학점표 전선 {c['전선']}")
        for i in r.get("inferred", []): warns.append(f"{k}: 추정 - {i}")
print("\n".join(["ERROR " + e for e in errs] + ["WARN  " + w for w in warns]) or "OK")
sys.exit(1 if errs else 0)