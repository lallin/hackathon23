import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import db
from app.catalog import ASSETS_DIR, catalog
from app.routers import auth, chat, checklist, lectures, meta, reviews, timetable, transcript

app = FastAPI(title="에타빌더 API", version="0.3")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth, meta, transcript, timetable, chat, checklist, lectures, reviews):
    app.include_router(module.router)

ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")


@app.get("/")
def health_check():
    # Render가 넣어 주는 배포 커밋. 어떤 버전이 떠 있는지 확인할 때 쓴다.
    version = (os.getenv("RENDER_GIT_COMMIT") or "local")[:7]
    return {"status": "ok", "version": version, "semester": catalog.semester, "db": db.enabled(),
            "data_sources": catalog.sources}
