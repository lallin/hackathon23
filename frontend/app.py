import os

import requests
import streamlit as st

# 팀원 백엔드 주소 (환경변수 BACKEND_URL이 있으면 그걸 우선 사용)
BACKEND_URL = os.getenv("BACKEND_URL", "https://hackathon23.onrender.com")

st.set_page_config(page_title="해커톤 앱", page_icon="🚀", layout="centered")
st.title("AI 도우미 🚀")


def check_server() -> bool:
    """백엔드가 살아있는지 확인 (Render 무료 서버는 잠들어 있으면 깨우는 데 최대 1분 걸림)"""
    try:
        res = requests.get(f"{BACKEND_URL}/", timeout=90)
        return res.status_code == 200
    except requests.RequestException:
        return False


def ask_backend(message: str) -> str:
    """백엔드 /api/chat 에 질문을 보내고 Gemini 답변을 받아온다"""
    res = requests.post(
        f"{BACKEND_URL}/api/chat",
        json={"user_message": message},
        timeout=90,
    )
    if res.status_code != 200:
        detail = res.json().get("detail", res.text) if res.headers.get("content-type", "").startswith("application/json") else res.text
        raise RuntimeError(f"서버 오류 ({res.status_code}): {detail}")
    return res.json()["response"]


# 사이드바: 서버 상태 확인 버튼
with st.sidebar:
    st.caption(f"백엔드: {BACKEND_URL}")
    if st.button("서버 상태 확인"):
        with st.spinner("서버 깨우는 중... (최대 1분)"):
            if check_server():
                st.success("서버 정상 ✅")
            else:
                st.error("서버 응답 없음 ❌")

# 대화 기록 저장
if "messages" not in st.session_state:
    st.session_state.messages = []

# 지금까지의 대화 보여주기
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# 입력창
if prompt := st.chat_input("무엇이든 물어보세요"):
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        with st.spinner("AI가 생각하는 중..."):
            try:
                answer = ask_backend(prompt)
            except requests.Timeout:
                answer = "⏰ 응답이 너무 오래 걸려요. 서버가 잠들어 있었을 수 있으니 잠시 후 다시 시도해 주세요."
            except Exception as e:
                answer = f"❌ 오류가 발생했어요: {e}"
        st.markdown(answer)

    st.session_state.messages.append({"role": "assistant", "content": answer})