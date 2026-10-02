"""data/seed/의 JSON을 읽어 메모리에 올린다.

BE-데이터가 같은 형식으로 JSON을 교체하면 코드 수정 없이 반영된다.
온디맨드로 새로 가져온 강의 데이터는 data/runtime/insights_collected.json에 쌓는다.
"""
import json
import re
import threading
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional

from app import db

ROOT = Path(__file__).resolve().parent.parent
SEED_DIR = ROOT / "data" / "seed"
RUNTIME_DIR = ROOT / "data" / "runtime"
ASSETS_DIR = ROOT / "data" / "assets"
COLLECTED_FILE = RUNTIME_DIR / "insights_collected.json"

DAYS = ["월", "화", "수", "목", "금"]
CATEGORIES = ["전필", "전선", "교필", "교선"]
# 팀 결정(10/2): 졸업 최소 요건은 전필·전선·교필뿐이고 교선은 들은 학점만 센다.
# 졸업 요건 데이터에 학사요람의 교선 값이 들어 있어도 서버는 최소 학점으로 쓰지 않는다.
NO_MIN_CATEGORIES = ("교선",)


def lecture_id_of(course_id: str, professor: str) -> str:
    return f"{course_id}-{professor}"


def min_credits(requirement: dict) -> Dict[str, float]:
    """영역별 최소 이수 학점. 교선과 0인 영역은 빠진다."""
    return {c: v for c, v in requirement["credits"].items() if v and c not in NO_MIN_CATEGORIES}


def total_credits(requirement: dict) -> float:
    """졸업 총 학점. 최소 학점 합보다 모자란 만큼은 네 영역 어디로든 채운다."""
    return requirement.get("total_credits") or sum(min_credits(requirement).values())


def normalize_name(text: str) -> str:
    return re.sub(r"[\s()\[\]·.,]", "", text or "").lower()


def _load(key: str):
    """DB seed_data에 같은 이름의 문서가 있으면 그것을, 없으면 data/seed/{key}.json을 읽는다."""
    if db.enabled():
        try:
            rows = db.execute("select data from seed_data where name = %s", (key,))
            if rows:
                return rows[0][0], "db"
        except Exception as e:
            print(f"[catalog] DB에서 {key}를 읽지 못해 파일을 씁니다: {e}")
    with open(SEED_DIR / f"{key}.json", encoding="utf-8") as f:
        return json.load(f), "file"


class Catalog:
    def __init__(self):
        self._lock = threading.Lock()
        self.reload()

    def reload(self) -> None:
        (req, req_src), (cat, cat_src), (ins, ins_src) = _load("requirements"), _load("catalog"), _load("insights")
        self.sources = {"requirements": req_src, "catalog": cat_src, "insights": ins_src}

        self.semester: str = cat.get("semester", "2026-2")
        self.admission_years: List[int] = req["admission_years"]
        self.supported_years: List[int] = req["supported_years"]
        self.majors: List[dict] = req["majors"]
        self.requirements: Dict[tuple, dict] = {
            (r["admission_year"], r["major"]): r for r in req["requirements"]
        }
        # (입학년도, 학과) -> {학수번호: 이수구분}. 같은 과목도 입학년도 교육과정마다 전필/전선이 다르다.
        self.categories_by_req: Dict[tuple, Dict[str, str]] = {
            key: {c["course_id"]: c["category"] for c in r.get("major_courses", []) + r.get("required_courses", [])}
            for key, r in self.requirements.items()
        }
        self.courses: Dict[str, dict] = {c["course_id"]: c for c in cat["courses"]}
        self.sections: Dict[str, dict] = {s["section_id"]: s for s in cat["sections"]}
        self.sections_by_course: Dict[str, List[dict]] = defaultdict(list)
        # 강의(과목 × 교수)별 수강계획서. 같은 교수의 분반이 여럿이면 평가 방법이 있는 첫 분반 것을 쓴다.
        self.syllabus_by_lecture: Dict[str, dict] = {}
        for s in cat["sections"]:
            self.sections_by_course[s["course_id"]].append(s)
            if (s.get("syllabus") or {}).get("evaluation_method"):
                self.syllabus_by_lecture.setdefault(lecture_id_of(s["course_id"], s["professor"]), s["syllabus"])

        # 졸업 요건 데이터에 적힌 과목 정보. 이번 학기에 열리지 않아 카탈로그에 없는 과목의 이름·이수구분에 쓴다.
        self.known_courses: Dict[str, dict] = {}
        for r in req["requirements"]:
            for c in r.get("required_courses", []) + r.get("major_courses", []):
                if c.get("course_id"):
                    self.known_courses.setdefault(c["course_id"], c)

        self.insights: Dict[str, dict] = {l["lecture_id"]: l for l in ins["lectures"]}
        for lecture in self._load_collected():
            self.insights[lecture["lecture_id"]] = lecture

        # (lecture_id, 체크리스트 key) -> 판정값. 자유 항목 판정 캐시.
        self.judgments: Dict[tuple, object] = {}

    # ---- 조회 ----
    def major(self, major_id: str) -> Optional[dict]:
        return next((m for m in self.majors if m["id"] == major_id), None)

    def is_supported(self, admission_year: int, major_id: str) -> bool:
        return (admission_year, major_id) in self.requirements

    def category(self, course_id: str, admission_year: Optional[int] = None, major: Optional[str] = None) -> Optional[str]:
        """그 입학년도·학과 교육과정의 이수구분. 교육과정에 없는 과목이면 카탈로그·졸업 요건 데이터의 값을 쓴다."""
        by_req = self.categories_by_req.get((admission_year, major), {})
        if course_id in by_req:
            return by_req[course_id]
        return (self.course_info(course_id) or {}).get("category")

    def course_info(self, course_id: str) -> Optional[dict]:
        """이번 학기 카탈로그에 있으면 그 과목, 없으면 졸업 요건 데이터에 적힌 정보."""
        return self.courses.get(course_id) or self.known_courses.get(course_id)

    def course_name(self, course_id: str) -> str:
        info = self.course_info(course_id)
        return info["name"] if info else course_id

    def is_offered(self, course_id: str) -> bool:
        """이번 학기에 열리는지. 학수번호가 달라도 같은 이름의 과목이 열리면 열린 것으로 본다."""
        if self.sections_by_course.get(course_id):
            return True
        name = normalize_name(self.course_name(course_id))
        return any(normalize_name(c["name"]) == name and self.sections_by_course.get(cid)
                   for cid, c in self.courses.items())

    def find_courses_by_name(self, name: str) -> List[dict]:
        """이름이 정확히 같은 과목이 있으면 그 하나, 없으면 이름이 일부 겹치는 과목 전부(이름당 하나)."""
        key = normalize_name(name)
        if not key:
            return []
        for course in self.courses.values():
            if normalize_name(course["name"]) == key:
                return [course]
        found: Dict[str, dict] = {}
        for course in self.courses.values():
            course_key = normalize_name(course["name"])
            if key in course_key or course_key in key:
                found.setdefault(course_key, course)
        return list(found.values())

    def find_course_by_name(self, name: str) -> Optional[dict]:
        """과목이 하나로 정해질 때만 돌려준다. '영어'처럼 후보가 여럿이면 None (find_courses_by_name으로 후보를 본다)."""
        found = self.find_courses_by_name(name)
        return found[0] if len(found) == 1 else None

    # ---- 저장 ----
    def _load_collected(self) -> List[dict]:
        if db.enabled():
            try:
                return [row[0] for row in db.execute("select data from collected_insights")]
            except Exception as e:
                print(f"[catalog] DB에서 수집한 강의 데이터를 읽지 못했습니다: {e}")
        if COLLECTED_FILE.exists():
            with open(COLLECTED_FILE, encoding="utf-8") as f:
                return json.load(f)
        return []

    def save_insight(self, lecture: dict) -> None:
        """온디맨드로 가져온 강의 데이터를 저장해 다음 생성부터 쓰이게 한다. DB가 있으면 DB에, 없으면 파일에."""
        with self._lock:
            self.insights[lecture["lecture_id"]] = lecture
            saved = False
            if db.enabled():
                try:
                    db.execute("insert into collected_insights (lecture_id, data) values (%s, %s) "
                               "on conflict (lecture_id) do update set data = excluded.data, collected_at = now()",
                               (lecture["lecture_id"], db.jsonb(lecture)))
                    saved = True
                except Exception as e:
                    print(f"[catalog] 수집한 강의 데이터를 DB에 저장하지 못해 파일에 씁니다: {e}")
            if not saved:
                collected = [l for l in self._load_collected() if l["lecture_id"] != lecture["lecture_id"]]
                collected.append(lecture)
                RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
                with open(COLLECTED_FILE, "w", encoding="utf-8") as f:
                    json.dump(collected, f, ensure_ascii=False, indent=1)
            # 수강평이 바뀌었으니 이 강의의 자유 항목 판정은 다시 한다.
            for key in [k for k in self.judgments if k[0] == lecture["lecture_id"]]:
                del self.judgments[key]


db.init()
catalog = Catalog()
