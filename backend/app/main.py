from __future__ import annotations

from datetime import datetime, timedelta
import random

from fastapi import FastAPI

from app.schemas import AnalysisResult, SessionCreateRequest, SessionResponse, TranscriptAnalysisRequest
from app.services.analysis import evaluate_transcript

app = FastAPI(title="Pink Promise API")

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


@app.post("/transcripts/analyze", response_model=AnalysisResult)
async def analyze_transcript(payload: TranscriptAnalysisRequest) -> AnalysisResult:
    result = evaluate_transcript(payload.user_id, payload.transcript, payload.scam_type)
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
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
