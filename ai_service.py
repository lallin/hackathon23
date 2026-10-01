"""OpenAI 호출 모음. 모든 LLM 호출은 이 파일을 거친다.

- OPENAI_API_KEY가 없어도 서버는 뜬다. LLM을 부르는 순간에만 LLMError가 난다.
- 모델은 .env의 OPENAI_MODEL / OPENAI_FALLBACK_MODEL로 바꿀 수 있다.
- 호출마다 시간 예산(timeout, 재시도 횟수)을 받는다. FE가 기다리는 시간 안에 성공이든 실패든 끝나게 한다.
- 같은 입력(모델·프롬프트·첨부 파일)이면 저장해 둔 응답을 바로 돌려준다. 시연 재현성과 속도용.
"""
import base64
import hashlib
import os
import re
import threading
from collections import OrderedDict
from typing import List, Optional, Sequence, Tuple, Type, TypeVar

import openai
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

PRIMARY_MODEL = os.getenv("OPENAI_MODEL") or "gpt-6-luna"
FALLBACK_MODEL = os.getenv("OPENAI_FALLBACK_MODEL") or ""  # 지정했을 때만 예비 모델로 한 번 더 시도
DEFAULT_TIMEOUT = float(os.getenv("OPENAI_TIMEOUT") or "60")
CACHE_SIZE = 500

T = TypeVar("T", bound=BaseModel)

_client = None
_cache: "OrderedDict[str, object]" = OrderedDict()
_cache_lock = threading.Lock()


class LLMError(RuntimeError):
    """LLM 호출이 끝내 실패했을 때. 호출한 쪽은 상태를 바꾸지 않고 안내 문구를 보여준다."""


def _get_client() -> openai.OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise LLMError("OPENAI_API_KEY가 .env 파일에 설정되어 있지 않습니다.")
        _client = openai.OpenAI(api_key=api_key, max_retries=2, timeout=DEFAULT_TIMEOUT)
    return _client


def _models() -> List[str]:
    models = [PRIMARY_MODEL]
    if FALLBACK_MODEL and FALLBACK_MODEL != PRIMARY_MODEL:
        models.append(FALLBACK_MODEL)
    return models


def _model_options(model: str, effort: str) -> dict:
    # 추론 모델(gpt-5 이후, o 시리즈)은 temperature를 받지 않는다.
    version = re.match(r"gpt-(\d+)", model)
    is_reasoning = (version and int(version.group(1)) >= 5) or model.startswith(("o1", "o3", "o4"))
    if is_reasoning and "chat" not in model:
        return {"reasoning_effort": effort}
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


def _cache_key(kind: str, system: Optional[str], prompt: str, pdf=None, images=None) -> str:
    h = hashlib.sha256()
    for part in (kind, PRIMARY_MODEL, system or "", prompt):
        h.update(part.encode())
        h.update(b"\0")
    if pdf:
        h.update(pdf[0])
    for data, mime in images or []:
        h.update(mime.encode())
        h.update(data)
    return h.hexdigest()


def _cache_get(key: str):
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    return None


def _cache_put(key: str, value) -> None:
    with _cache_lock:
        _cache[key] = value
        _cache.move_to_end(key)
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)


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


def ask_text(prompt: str, system: Optional[str] = None, timeout: float = DEFAULT_TIMEOUT, retries: int = 2,
             effort: str = "low") -> str:
    """프롬프트를 보내고 응답 텍스트를 돌려준다."""
    key = _cache_key("text:" + effort, system, prompt)
    cached = _cache_get(key)
    if cached is not None:
        return cached
    client = _get_client().with_options(timeout=timeout, max_retries=retries)

    def call(model: str) -> str:
        response = client.chat.completions.create(
            model=model,
            messages=_messages(system, prompt),
            **_model_options(model, effort),
        )
        return response.choices[0].message.content or ""

    result = _with_fallback(call)
    _cache_put(key, result)
    return result


def ask_json(
    schema: Type[T],
    prompt: str,
    system: Optional[str] = None,
    pdf: Optional[Tuple[bytes, str]] = None,
    images: Optional[Sequence[Tuple[bytes, str]]] = None,
    timeout: float = DEFAULT_TIMEOUT,
    retries: int = 2,
    effort: str = "low",
) -> T:
    """Structured Outputs로 pydantic 모델 형식의 응답을 받는다.

    schema의 필드에는 기본값을 두지 않는다(strict 모드는 모든 필드가 필수).
    timeout은 시도 한 번의 제한 시간, retries는 429·5xx·타임아웃 때 다시 시도하는 횟수다.
    effort는 추론 모델의 추론 강도("none"은 단순 분류용으로 가장 빠르다).
    """
    key = _cache_key(f"json:{schema.__name__}:{effort}", system, prompt, pdf=pdf, images=images)
    cached = _cache_get(key)
    if cached is not None:
        return cached.model_copy(deep=True)
    client = _get_client().with_options(timeout=timeout, max_retries=retries)
    content = _user_content(prompt, pdf=pdf, images=images)

    def call(model: str) -> T:
        response = client.chat.completions.parse(
            model=model,
            messages=_messages(system, content),
            response_format=schema,
            **_model_options(model, effort),
        )
        message = response.choices[0].message
        if message.parsed is None:
            raise openai.OpenAIError(f"구조화 응답을 받지 못했습니다: {message.refusal or '빈 응답'}")
        return message.parsed

    result = _with_fallback(call)
    _cache_put(key, result)
    return result.model_copy(deep=True)
