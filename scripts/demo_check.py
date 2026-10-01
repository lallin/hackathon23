"""시연 점검: 서버를 깨우고 시연 흐름 전체를 실제로 호출해 본다.

같은 입력은 서버가 응답을 저장해 두므로, 발표 10분 전에 한 번 돌려 두면 시연 때 AI 응답이 바로 나온다.
표준 라이브러리만 쓴다.

    python scripts/demo_check.py                     # 배포 서버
    python scripts/demo_check.py http://127.0.0.1:8000
    python scripts/demo_check.py --reset-demo        # 끝나고 데모 계정의 이수 내역을 지운다(업로드 단계부터 시연)
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BASE = "https://hackathon23.onrender.com"
DEMO = {"email": "demo@etabuilder.kr", "password": "demo1234"}
CHAT_MESSAGE = "수요일 공강이고 팀플은 적게, 교수님 친절한 수업이면 좋겠어"

args = [a for a in sys.argv[1:] if not a.startswith("--")]
BASE = (args[0] if args else DEFAULT_BASE).rstrip("/")
RESET = "--reset-demo" in sys.argv
failures = []


def call(method, path, body=None, token=None, timeout=90):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read() or b"null")


def step(name, fn, limit):
    """limit초 안에 끝나야 시연에 쓸 만하다."""
    started = time.time()
    try:
        detail = fn()
        took = time.time() - started
        mark = "OK  " if took <= limit else "SLOW"
        if took > limit:
            failures.append(f"{name}: {took:.1f}초 (기준 {limit}초)")
        print(f"[{mark}] {name} ({took:.1f}s) {detail or ''}")
    except (urllib.error.URLError, AssertionError, KeyError, ValueError) as e:
        failures.append(f"{name}: {e}")
        print(f"[FAIL] {name} ({time.time() - started:.1f}s) {e}")
    return None


ctx = {}


def wake():
    health = call("GET", "/", timeout=120)
    ctx["health"] = health
    return f"db={health.get('db')} data={health.get('data_sources')}"


def login():
    ctx["token"] = call("POST", "/api/auth/login", DEMO)["token"]


def requirements():
    r = call("GET", "/api/requirements?admission_year=2024&major=cse")
    assert r["supported"], r
    return f"졸업 {r['total_required']}학점, 최소 {r['credits']}"


def sample():
    t = call("POST", "/api/transcript/sample", {"admission_year": 2024, "major": "cse"}, token=ctx["token"])
    ctx["transcript"] = t
    return f"{t['message']}, 남은 졸업 학점 {t['requirements']['remaining_total']:g}"


def generate(checklist=None, conditions=None):
    t = ctx["transcript"]
    body = {"admission_year": 2024, "major": "cse", "completed_course_ids": t["completed_course_ids"],
            "completed_credits": t["completed_credits"], "checklist": checklist or [],
            "conditions": conditions or {"target_credits": 18, "free_days": [], "preferred_time": "any", "style": "graduation"}}
    g = call("POST", "/api/timetable/generate", body)
    assert g["combinations"], g.get("infeasible")
    ctx["combo"] = g["combinations"][0]
    warn = f" 경고 {g['warnings']}" if g["warnings"] else ""
    return f"{len(g['combinations'])}개 조합, 1순위 {ctx['combo']['total_credits']}학점: {ctx['combo']['reason']}{warn}"


def chat():
    r = call("POST", "/api/chat", {"message": CHAT_MESSAGE, "conditions": {}, "checklist": [], "history": []})
    assert not r.get("error"), r["reply"]
    ctx["chat"] = r
    return r["reply"]


def generate_with_chat():
    return generate(ctx["chat"]["checklist"], ctx["chat"]["conditions"])


def lecture():
    lid = ctx["combo"]["sections"][0]["lecture_id"]
    d = call("GET", "/api/lectures/" + urllib.parse.quote(lid))
    return f"{d['course']} {d['professor']}: {d['summary'][:1]}"


def review_chat():
    r = call("POST", "/api/chat", {"message": "운영체제 수강평 알려줘"})
    assert r["review_target"], r["reply"]
    ctx["review_target"] = r["review_target"]
    return r["reply"]


def on_demand():
    r = call("POST", "/api/reviews/on-demand", {**ctx["review_target"], "checklist": ctx["chat"]["checklist"]})
    return f"{r['message']} ({', '.join(x['professor'] + ':' + x['status'] for x in r['results'])})"


def reset():
    call("DELETE", "/api/transcript", token=ctx["token"])
    return "데모 계정 이수 내역을 지웠어요"


print(f"서버: {BASE}")
step("서버 깨우기", wake, 90)
step("데모 로그인", login, 5)
step("졸업 요건", requirements, 5)
step("샘플 성적표", sample, 10)
step("기본 시간표 생성", generate, 10)
step("챗봇: 조건·체크리스트", chat, 20)
step("챗봇 조건으로 생성(자유 항목 판정 포함)", generate_with_chat, 40)
step("강의 상세", lecture, 5)
step("챗봇: 수강평 질문", review_chat, 20)
step("교수별 수강평", on_demand, 40)
if RESET:
    step("데모 계정 초기화", reset, 5)

print()
if failures:
    print("확인 필요:")
    for f in failures:
        print(" -", f)
    sys.exit(1)
print("시연 흐름 전체 정상. 같은 입력은 이제 저장된 응답으로 바로 나와요.")
