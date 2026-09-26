from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ai_service import ask_gemini

app = FastAPI(title="AI Backend Engine Boilerplate")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    user_message: str


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.post("/api/chat")
def chat(request: ChatRequest):
    try:
        answer = ask_gemini(request.user_message)
        return {"response": answer}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
