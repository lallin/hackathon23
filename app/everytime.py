"""에브리타임 강의평 수집기 (BE-데이터 담당 구현).

fetch_reviews()만 구현하면 온디맨드 수강평(/api/reviews/on-demand)에 바로 연결된다.
- 한 번 호출에 강의(과목 × 교수) 하나만 가져온다.
- 세션 값 등 계정 정보는 .env에만 둔다.
- 구현 전에는 NotImplementedError를 던지고, 서버는 그 교수를 "지금은 가져올 수 없어요"로 표시한다.
"""
from typing import List


def fetch_reviews(course_name: str, professor: str) -> List[str]:
    """강의평 원문 텍스트 목록을 돌려준다. 강의평이 없으면 빈 목록."""
    raise NotImplementedError("에브리타임 수집기가 아직 구현되지 않았습니다.")
