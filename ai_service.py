"""OpenAI 호출 모음. 모든 LLM 호출은 이 파일을 거친다.

- OPENAI_API_KEY가 없어도 서버는 뜬다. LLM을 부르는 순간에만 LLMError가 난다.
- 모델은 .env의 OPENAI_MODEL / OPENAI_FALLBACK_MODEL로 바꿀 수 있다.
- 429·5xx·타임아웃은 SDK가 자동 재시도하고, 그래도 실패하면 예비 모델로 한 번 더 시도한다.
"""
import base64
import os
import re
from typing import List, Optional, Sequence, Tuple, Type, TypeVar

import openai
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

PRIMARY_MODEL = os.getenv("OPENAI_MODEL") or "gpt-6-luna"
FALLBACK_MODEL = os.getenv("OPENAI_FALLBACK_MODEL") or ""  # 지정했을 때만 예비 모델로 한 번 더 시도
TIMEOUT_SECONDS = float(os.getenv("OPENAI_TIMEOUT") or "60")

T = TypeVar("T", bound=BaseModel)

_client = None


class LLMError(RuntimeError):
    """LLM 호출이 끝내 실패했을 때. 호출한 쪽은 상태를 바꾸지 않고 안내 문구를 보여준다."""


def _get_client() -> openai.OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise LLMError("OPENAI_API_KEY가 .env 파일에 설정되어 있지 않습니다.")
        _client = openai.OpenAI(api_key=api_key, max_retries=2, timeout=TIMEOUT_SECONDS)
    return _client


def _models() -> List[str]:
    models = [PRIMARY_MODEL]
    if FALLBACK_MODEL and FALLBACK_MODEL != PRIMARY_MODEL:
        models.append(FALLBACK_MODEL)
    return models


def _model_options(model: str) -> dict:
    # 추론 모델(gpt-5 이후, o 시리즈)은 temperature를 받지 않는다.
    version = re.match(r"gpt-(\d+)", model)
    is_reasoning = (version and int(version.group(1)) >= 5) or model.startswith(("o1", "o3", "o4"))
    if is_reasoning and "chat" not in model:
        return {"reasoning_effort": "low"}
    return {"temperature": 0.2}


def _user_content(
    text: str,
    pdf: Optional[Tuple[bytes, str]] = None,
    images: Optional[Sequence[Tuple[bytes, str]]] = None,
):
    """텍스트만 있으면 문자열, 파일이 있으면 content part 목록을 만든다.

    pdf: (파일 바이트, 파일 이름), images: [(파일 바이트, MIME 타입)]
    """
    if not pdf and not images:
        return text
    parts = []
    if pdf:
        data, filename = pdf
        parts.append({
            "type": "file",
            "file": {
                "filename": filename,
                "file_data": "data:application/pdf;base64," + base64.b64encode(data).decode(),
            },
        })
    for data, mime in images or []:
        parts.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64," + base64.b64encode(data).decode()},
        })
    parts.append({"type": "text", "text": text})
    return parts


def _messages(system: Optional[str], user_content) -> list:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": user_content})
    return messages


def _with_fallback(call):
    errors = []
    for model in _models():
        try:
            return call(model)
        except openai.AuthenticationError as e:
            raise LLMError(f"OpenAI API 키가 올바르지 않습니다: {e}") from e
        except openai.OpenAIError as e:
            errors.append(f"{model}: {e}")
    raise LLMError("OpenAI 호출 실패 (" + " / ".join(errors) + ")")


def ask_text(prompt: str, system: Optional[str] = None) -> str:
    """프롬프트를 보내고 응답 텍스트를 돌려준다."""
    client = _get_client()

    def call(model: str) -> str:
        response = client.chat.completions.create(
            model=model,
            messages=_messages(system, prompt),
            **_model_options(model),
        )
        return response.choices[0].message.content or ""

    return _with_fallback(call)


def ask_json(
    schema: Type[T],
    prompt: str,
    system: Optional[str] = None,
    pdf: Optional[Tuple[bytes, str]] = None,
    images: Optional[Sequence[Tuple[bytes, str]]] = None,
) -> T:
    """Structured Outputs로 pydantic 모델 형식의 응답을 받는다.

    schema의 필드에는 기본값을 두지 않는다(strict 모드는 모든 필드가 필수).
    """
    client = _get_client()
    content = _user_content(prompt, pdf=pdf, images=images)

    def call(model: str) -> T:
        response = client.chat.completions.parse(
            model=model,
            messages=_messages(system, content),
            response_format=schema,
            **_model_options(model),
        )
        message = response.choices[0].message
        if message.parsed is None:
            raise openai.OpenAIError(f"구조화 응답을 받지 못했습니다: {message.refusal or '빈 응답'}")
        return message.parsed

    return _with_fallback(call)
