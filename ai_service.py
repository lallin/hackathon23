import os

from dotenv import load_dotenv
from google import genai
from google.genai import errors as genai_errors

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY가 .env 파일에 설정되어 있지 않습니다.")

client = genai.Client(api_key=GEMINI_API_KEY)

PRIMARY_MODEL = "gemini-3.8-flash"
FALLBACK_MODEL = "gemini-flash-latest"


def ask_gemini(prompt: str) -> str:
    """주어진 프롬프트로 Gemini 모델을 호출하고 응답 텍스트를 반환한다."""
    try:
        response = client.models.generate_content(
            model=PRIMARY_MODEL,
            contents=prompt,
        )
        return response.text
    except genai_errors.APIError as primary_error:
        try:
            response = client.models.generate_content(
                model=FALLBACK_MODEL,
                contents=prompt,
            )
            return response.text
        except genai_errors.APIError as fallback_error:
            raise RuntimeError(
                f"Gemini 호출 실패 (primary: {primary_error}, fallback: {fallback_error})"
            ) from fallback_error
    except Exception as e:
        raise RuntimeError(f"Gemini 호출 중 알 수 없는 오류 발생: {e}") from e
