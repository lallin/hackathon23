import os
import time
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google import genai

load_dotenv()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def hello():
    return {"message": "Hello World"}

@app.get("/gemini")
def gemini_test():
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    for attempt in range(3):
        try:
            res = client.models.generate_content(model="gemini-3.8-flash", contents="한 문장으로 인사해줘")
            return {"message": res.text}
        except Exception as e:
            if "503" in str(e) and attempt < 2:
                time.sleep(2)
                continue
            return {"error": f"{type(e).__name__}: {e}"}
