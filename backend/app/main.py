from __future__ import annotations

import logging
import os
import random
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import AnalysisResult, SessionCreateRequest, SessionResponse, TranscriptAnalysisRequest
from app.services.analysis import evaluate_transcript
from app.simulator.api import router as simulator_router
from app.simulator.dialogue import create_dialogue
from app.simulator.live.api import router as live_router
from app.simulator.live.conversation import create_caller
from app.simulator.live.service import LiveService
from app.simulator.live.speech import create_speech
from app.simulator.service import SimulatorService

if not os.environ.get("SCAM_COACH_SKIP_DOTENV"):
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))

app = FastAPI(title="Pink Promise API")

# The API uses no cookies or auth headers, so a wildcard origin is safe for local
# dev and Expo web. Set ALLOWED_ORIGINS (comma-separated) to lock it down.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",")],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
    expose_headers=["Content-Disposition"],
)

app.state.simulator = SimulatorService(create_dialogue())
app.state.live = LiveService(create_caller(), create_speech())
app.include_router(simulator_router)
app.include_router(live_router)

SESSION_STORE: dict[str, dict[str, str]] = {}


@app.get("/")
async def read_root() -> dict[str, str]:
    return {"message": "Pink Promise backend is running"}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ai/model-recommendations")
async def model_recommendations() -> dict[str, list[str] | str]:
    return {
        "recommended_free_models": [
            "Gemini 2.0 Flash / Flash-Lite (good for free tier speed and summarization)",
            "Ollama + Llama 3.1 8B (best for zero-credit local analysis)",
            "Mistral 7B via local inference (low-cost fallback)",
        ],
        "strategy": "Use Gemini for quick demos and Ollama for unlimited offline scoring during the hackathon.",
    }


@app.post("/sessions/create", response_model=SessionResponse)
async def create_session(payload: SessionCreateRequest) -> SessionResponse:
    code = f"{random.randint(1000, 9999)}"
    expires_at = (datetime.utcnow() + timedelta(minutes=1)).isoformat()
    SESSION_STORE[payload.user_id] = {
        "code": code,
        "expires_at": expires_at,
    }
    return SessionResponse(user_id=payload.user_id, code=code, expires_at=expires_at)


@app.get("/sessions/{user_id}")
async def get_session(user_id: str) -> dict[str, str]:
    session = SESSION_STORE.get(user_id)
    if not session:
        return {"error": "No active session"}
    return session


@app.get("/analytics/csv")
async def analytics_csv() -> PlainTextResponse:
    backend_root = Path(__file__).resolve().parents[1]
    csv_path = backend_root / "output" / "fake_analysis.csv"
    if not csv_path.exists():
        return PlainTextResponse("", media_type="text/csv; charset=utf-8")
    return PlainTextResponse(
        csv_path.read_text(encoding="utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/transcripts/analyze", response_model=AnalysisResult)
async def analyze_transcript(payload: TranscriptAnalysisRequest) -> AnalysisResult:
    result = evaluate_transcript(
        user_id=payload.user_id,
        transcript=payload.transcript,
        scam_type=payload.scam_type,
        employee_name=payload.employee_name or "Alex Rivera",
        department=payload.department or "Customer Support",
        scenario=payload.scenario or "Fake T-Mobile Support Rep",
        duration_seconds=payload.duration_seconds or 185,
    )
    return AnalysisResult(
        user_id=result["user_id"],
        scam_type=result["scam_type"],
        vulnerability_score=result["vulnerability_score"],
        red_flags=result["red_flags"],
        employee_summary=result["employee_summary"],
        actionable_tasks=[
            {
                "title": item["title"],
                "description": item["description"],
            }
            for item in result["actionable_tasks"]
        ],
        csv_rows=result["csv_rows"],
        outcome=result.get("outcome", "resisted"),
        employee_name=result.get("employee_name", "Alex Rivera"),
        department=result.get("department", "Customer Support"),
        scenario=result.get("scenario", "Fake T-Mobile Support Rep"),
        duration_seconds=result.get("duration_seconds", 185),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
