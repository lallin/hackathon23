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

ROOT = Path(__file__).resolve().parent.parent
SEED_DIR = ROOT / "data" / "seed"
RUNTIME_DIR = ROOT / "data" / "runtime"
ASSETS_DIR = ROOT / "data" / "assets"
COLLECTED_FILE = RUNTIME_DIR / "insights_collected.json"

DAYS = ["월", "화", "수", "목", "금"]
CATEGORIES = ["전필", "전선", "교필", "교선"]


def lecture_id_of(course_id: str, professor: str) -> str:
    return f"{course_id}-{professor}"


def normalize_name(text: str) -> str:
    return re.sub(r"[\s()\[\]·.,]", "", text or "").lower()


def _load(name: str):
    with open(SEED_DIR / name, encoding="utf-8") as f:
        return json.load(f)


class Catalog:
    def __init__(self):
        self._lock = threading.Lock()
        self.reload()

    def reload(self) -> None:
        req = _load("requirements.json")
        cat = _load("catalog.json")
        ins = _load("insights.json")

        self.semester: str = cat.get("semester", "2026-2")
        self.admission_years: List[int] = req["admission_years"]
        self.supported_years: List[int] = req["supported_years"]
        self.majors: List[dict] = req["majors"]
        self.requirements: Dict[tuple, dict] = {
            (r["admission_year"], r["major"]): r for r in req["requirements"]
        }
        self.courses: Dict[str, dict] = {c["course_id"]: c for c in cat["courses"]}
        self.sections: Dict[str, dict] = {s["section_id"]: s for s in cat["sections"]}
        self.sections_by_course: Dict[str, List[dict]] = defaultdict(list)
        for s in cat["sections"]:
            self.sections_by_course[s["course_id"]].append(s)

        self.insights: Dict[str, dict] = {l["lecture_id"]: l for l in ins["lectures"]}
        if COLLECTED_FILE.exists():
            with open(COLLECTED_FILE, encoding="utf-8") as f:
                for lecture in json.load(f):
                    self.insights[lecture["lecture_id"]] = lecture

        # (lecture_id, 체크리스트 key) -> 판정값. 자유 항목 판정 캐시.
        self.judgments: Dict[tuple, object] = {}

    # ---- 조회 ----
    def major(self, major_id: str) -> Optional[dict]:
        return next((m for m in self.majors if m["id"] == major_id), None)

    def is_supported(self, admission_year: int, major_id: str) -> bool:
        return (admission_year, major_id) in self.requirements

    def course_name(self, course_id: str) -> str:
        course = self.courses.get(course_id)
        return course["name"] if course else course_id

    def find_course_by_name(self, name: str) -> Optional[dict]:
        key = normalize_name(name)
        if not key:
            return None
        for course in self.courses.values():
            if normalize_name(course["name"]) == key:
                return course
        for course in self.courses.values():
            course_key = normalize_name(course["name"])
            if key in course_key or course_key in key:
                return course
        return None

    # ---- 저장 ----
    def save_insight(self, lecture: dict) -> None:
        """온디맨드로 가져온 강의 데이터를 저장해 다음 생성부터 쓰이게 한다."""
        with self._lock:
            self.insights[lecture["lecture_id"]] = lecture
            collected = []
            if COLLECTED_FILE.exists():
                with open(COLLECTED_FILE, encoding="utf-8") as f:
                    collected = json.load(f)
            collected = [l for l in collected if l["lecture_id"] != lecture["lecture_id"]]
            collected.append(lecture)
            RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
            with open(COLLECTED_FILE, "w", encoding="utf-8") as f:
                json.dump(collected, f, ensure_ascii=False, indent=1)
            # 수강평이 바뀌었으니 이 강의의 자유 항목 판정은 다시 한다.
            for key in [k for k in self.judgments if k[0] == lecture["lecture_id"]]:
                del self.judgments[key]


catalog = Catalog()
