import streamlit as st

st.set_page_config(page_title="해커톤 앱", page_icon="🚀", layout="centered")

st.title("Hello World 🚀")
st.write("우리 팀 해커톤 앱 뼈대입니다.")

name = st.text_input("이름을 입력해보세요")
if st.button("확인"):
    st.success(f"안녕하세요, {name}님!")