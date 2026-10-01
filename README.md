# 에타빌더 백엔드

졸업 요건과 수업 성향(과제량·팀플 등)을 함께 맞춘 2026학년도 2학기 시간표를 추천하는 API.
화면 흐름과 API 계약은 팀 공유 문서(유저플로우)를 기준으로 한다.

## 실행

1. 가상환경 생성 및 활성화: `python -m venv venv`
2. 패키지 설치: `pip install -r requirements.txt`
3. `.env.example`을 `.env`로 복사하고 `OPENAI_API_KEY`, `SECRET_KEY` 설정
4. 서버 실행: `uvicorn main:app --reload`
5. API 문서: http://127.0.0.1:8000/docs

`OPENAI_API_KEY`가 없어도 서버는 뜬다. 로그인, 졸업 요건, 시간표 생성, 강의 상세는 그대로 동작하고
AI가 필요한 기능(성적표 PDF 분석, 챗봇, 자유 항목 판정, 수강평 수집 분석)만 안내 문구를 돌려준다.

시연용 계정: `demo@etabuilder.kr` / `demo1234`

## 배포 주소

- API 기본 URL (프론트엔드 코드용): https://hackathon23.onrender.com
- API Swagger 문서: https://hackathon23.onrender.com/docs

Render 환경변수에 `OPENAI_API_KEY`, `SECRET_KEY`를 넣는다.

## API

| 메서드 · 경로 | 용도 |
|---|---|
| `POST /api/auth/signup` · `POST /api/auth/login` | 가입·로그인 → 토큰 |
| `GET /api/auth/me` | 내 정보와 저장된 이수 내역 (`Authorization: Bearer <token>`) |
| `GET /api/meta` | 학기, 입학년도·학과(지원 여부), 스타일 프리셋, 기본 항목, 레벨 이름 |
| `GET /api/requirements?admission_year=2024&major=cse` | 네 영역 요구 학점과 필수 과목 |
| `POST /api/transcript/parse` | 성적표 PDF(multipart `file`, `admission_year`, `major`) → 이수 현황 |
| `POST /api/transcript/sample` | 샘플 성적표로 같은 형식의 결과 |
| `POST /api/timetable/generate` | 조건 전체 → 상위 5개 조합, 체크리스트 평가, 조합이 없으면 완화 제안 |
| `POST /api/chat` | 대화 → 의도, 합쳐진 조건·체크리스트, 답장 |
| `POST /api/checklist/style` | 스타일 변경 → 프리셋을 합친 체크리스트 |
| `GET /api/lectures/{lecture_id}` | 강의 상세: 레벨, 요약, 근거, 계획서 이미지 |
| `POST /api/reviews/on-demand` | 과목 하나의 교수별 수강평, 체크리스트 기준 순위 |
| `POST /api/ask` | 기존 Streamlit용 단순 채팅 |

## 코드 위치

- `main.py`: 라우터 등록만 한다.
- `app/routers/`: API. 로직은 `app/`의 `scheduler.py`(생성기), `checklist.py`(합치기·충족 판정), `nlu.py`(챗봇),
  `transcript.py`(성적표), `insights.py`(수강평 분석·자유 항목 판정·온디맨드), `auth.py`, `catalog.py`(데이터 로딩).
- `ai_service.py`: 모든 OpenAI 호출과 재시도.
- BE-데이터 담당: `data/seed/*.json`(지금은 가상 샘플), `data/assets/`(계획서 이미지), `app/everytime.py`의 `fetch_reviews()`.
  JSON을 같은 형식으로 바꾸면 코드 수정 없이 반영된다.
