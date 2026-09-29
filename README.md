# 진행사항

## Hackathon AI Backend 실행 방법
1. 가상환경 생성 및 활성화: `python -m venv venv`
2. 패키지 설치: `pip install -r requirements.txt`
3. `.env` 파일 생성 후 GEMINI_API_KEY 설정
4. 서버 실행: `uvicorn main:app --reload`
5. API 테스트 문서: http://127.0.0.1:8000/docs

## 백엔드 및 AI 서버 배포 완료되어 주소 공유

- API 기본 URL (프론트엔드 코드용): https://hackathon23.onrender.com
- API Swagger 문서 (테스트 및 기능 확인용): https://hackathon23.onrender.com/docs
(/docs 링크로 들어오시면 각 API 엔드포인트와 요청/응답 규격을 직접 테스트 가능)
