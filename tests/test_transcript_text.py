"""학교 성적표(개인별 전체 성적조회) 글자 읽기 시험.

실제 성적표 PDF에서 pypdf가 뽑는 줄 모양을 본떠 만든 가상 성적표로, 다른 학생 성적표에서 생길 수 있는
경우(페이지 경계, 긴 과목명, 빈 학기 칸, 수강 중, 처음 보는 이수구분, 띄어쓰기)를 확인한다.
개인정보는 넣지 않는다.

    python -m pytest tests/test_transcript_text.py -q
"""
import os
import sys
from pathlib import Path

os.environ.setdefault("OPENAI_API_KEY", "test")
os.environ["DATABASE_URL"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.transcript import parse_transcript_lines, summarize  # noqa: E402

HEADER = ["년도", "학기", "이수구분", "학수번호", "과목명", "학점", "등급", "인정구분", "삭제구분"]
PERSONAL = ["학 생 인 적 사 항", "학 번", "2099000000", "성 명", "가상학생", "소 속", "가상학과", "개인별 전체 성적조회"]
PAGE_BREAK = ["1/2", "2026-10-01 오후 11:25:33", "개인별 전체 성적조회", *HEADER]


def row(year, term, cat, code, name, credits, grade, *extras):
    """pypdf가 한 행을 뽑는 모양: 칸마다 한 줄. 학기·이수구분·등급은 None이면 빠진다."""
    out = [year] + ([term] if term else []) + ([cat] if cat else []) + [code]
    out += name if isinstance(name, list) else [name]
    out += [credits] + ([grade] if grade else []) + list(extras)
    return out


def subtotal(applied, earned, gpa=None):
    out = ["신청학점 :", applied, "취득학점 :", earned]
    return out + (["평점평균 :", gpa] if gpa else [])


def parse(lines):
    return parse_transcript_lines(lines)


def test_basic_rows_spacing_retake_and_deletion():
    lines = PERSONAL + HEADER + [
        *row("2023", "1학기", "전필", "NDG E05021", "컴퓨터공학개론", "3", "C+"),
        *row("2023", "1학기", "전선", "NDG E14465", "U NIX시스템", "3", "C+"),
        *row("2023", "1학기", "일교", "ZA A A 58470", "동(기유발)참(여)형학기제", "1", "P", "동참형학기제인정학점"),
        *row("2023", "1학기", "기초", "BK SA 53699", "K U G EP1", "3", "A +"),
        *subtotal("10.0", "10.0", "3.25"),
        *row("2025", "2학기", "전필", "NDG E05021", "컴퓨터공학개론", "3", "A"),
        *row("2025", "2학기", "전선", "NDG E12263", "컴퓨터구조", "3", "C+", "취득학점포기"),
        *subtotal("6.0", "3.0", "4.0"),
        "총 신청학점 :", "16.0", "총 취득학점 :", "13.0", "총 평균평점 :", "3.5", "백분위 : 91.3",
    ]
    rows, warnings = parse(lines)
    assert warnings == []
    assert [r["course_id"] for r in rows] == ["NDGE05021", "NDGE14465", "ZAAA58470", "BKSA53699", "NDGE05021", "NDGE12263"]
    assert rows[1]["name"] == "UNIX시스템" and rows[3]["name"] == "KUGEP1" and rows[3]["grade"] == "A+"
    assert rows[2]["category"] == "기타" and rows[2]["deletion"] is None  # 인정구분은 삭제가 아니다
    assert rows[5]["deletion"] == "취득학점포기"

    s = summarize(rows, 2023, "cse")
    assert s["completed_credits"]["전필"] == 3  # 재수강은 한 번만
    assert s["completed_credits"]["교필"] == 3  # KUGEP1은 기초로 찍혀도 필수 교양
    assert s["completed_credits"]["기타"] == 1
    assert [e["reason"] for e in s["excluded"]] == ["취득학점포기"]


def test_page_break_inside_row_and_wrapped_name():
    lines = HEADER + [
        "2024", "1학기", *PAGE_BREAK, "소양", "BK SA 59472", "취업전략수립및역량개발", "1", "2", "P",
        *row("2024", "1학기", "전선", "NDG E48003", ["Java프로그래밍", "1"], "3", "A"),
        "2024", "1학기", "전선", "NDG E14393", "디지털논리회로", *PAGE_BREAK, "3", "B+",
        *subtotal("8.0", "8.0"),
    ]
    rows, warnings = parse(lines)
    assert warnings == []
    assert [(r["name"], r["credits"], r["grade"]) for r in rows] == [
        ("취업전략수립및역량개발1", 2.0, "P"), ("Java프로그래밍1", 3.0, "A"), ("디지털논리회로", 3.0, "B+")]


def test_missing_term_unknown_category_and_in_progress():
    lines = HEADER + [
        *row("2024", None, "기초", "BK SA 56558", "컴퓨팅적사고", "3", "C+"),          # 학기 칸이 빔
        *row("2024", "동계 계절학기", "인성", "BK SA 99999", "가상인성과목", "2", "A0"),
        *row("2025", "1학기", "연계전공X", "NDG E15060", "자료구조", "3", "B0"),      # 처음 보는 이수구분
        *subtotal("8.0", "8.0"),
        *row("2026", "2학기", "전선", "NDG E14446", "컴퓨터네트워크", "3", None),     # 수강 중(성적 없음)
        *row("2026", "2학기", "심화", "BK SA 13364", "영어회화1", "2", None),
    ]
    rows, warnings = parse(lines)
    assert [r["category"] for r in rows] == ["교선", "교선", "전필", "전선", "교선"]
    assert any("연계전공X" in w for w in warnings)  # 학수번호로 정했다고 알려 준다
    assert [r["grade"] for r in rows[-2:]] == ["", ""]
    s = summarize(rows, 2025, "cse")
    assert [e["reason"] for e in s["excluded"]] == ["성적 없음(수강 중)"] * 2
    assert s["total_credits"] == 8


def test_failed_and_n_grades_are_not_earned():
    lines = HEADER + [
        *row("2023", "2학기", "전선", "NDG E14419", "이산수학", "3", "F"),
        *row("2023", "2학기", "전선", "NDG E11989", "컴퓨터프로그래밍", "3", "N"),
        *row("2023", "2학기", "기초", "BK SA 64611", "창의글쓰기", "3", "B0"),
        *subtotal("9.0", "3.0"),
    ]
    rows, warnings = parse(lines)
    assert warnings == []  # F·N은 학교 취득학점에도 안 들어간다
    s = summarize(rows, 2023, "cse")
    assert s["total_credits"] == 3


def test_check_flags_a_missed_row():
    lines = HEADER + [
        *row("2023", "1학기", "전필", "NDG E05021", "컴퓨터공학개론", "3", "A"),
        "2023", "1학기", "전선", "깨진학수번호", "UNIX시스템", "3", "A",   # 학수번호를 못 알아보는 행
        *subtotal("6.0", "6.0"),
    ]
    rows, warnings = parse(lines)
    assert len(rows) == 1
    assert any("소계 취득학점 6학점인데 읽은 과목은 3학점" in w for w in warnings)


def test_personal_info_is_not_read_and_other_documents_are_rejected():
    rows, _ = parse(PERSONAL + HEADER + row("2023", "1학기", "전필", "NDG E05021", "컴퓨터공학개론", "3", "A"))
    assert all("가상학생" not in str(r) and "2099000000" not in str(r) for r in rows)
    assert parse(["강의 자료", "1장 멀티미디어", "2023", "참고문헌"]) == ([], [])


def test_real_transcript_pdf_if_given():
    """TRANSCRIPT_PDF=경로 를 주면 실제 성적표 PDF도 검산한다 (개인정보가 있어 저장소에 넣지 않는다)."""
    path = os.environ.get("TRANSCRIPT_PDF")
    if not path:
        return
    from app.transcript import parse_text_transcript
    rows, warnings = parse_text_transcript(Path(path).read_bytes())
    assert rows and warnings == [], warnings
