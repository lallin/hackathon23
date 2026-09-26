# Hackathon23

## Hackathon AI Backend 실행 방법
1. 가상환경 생성 및 활성화: `python -m venv venv`
2. 패키지 설치: `pip install -r requirements.txt`
3. `.env` 파일 생성 후 GEMINI_API_KEY 설정
4. 서버 실행: `uvicorn main:app --reload`
5. API 테스트 문서: http://127.0.0.1:8000/docs
