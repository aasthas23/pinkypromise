from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field


class SessionCreateRequest(BaseModel):
    user_id: str = Field(..., min_length=1)


class SessionResponse(BaseModel):
    user_id: str
    code: str
    expires_at: str


class TranscriptAnalysisRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    transcript: str = Field(..., min_length=10)
    scam_type: str = "unknown"


class ActionItem(BaseModel):
    title: str
    description: str


class AnalysisResult(BaseModel):
    user_id: str
    scam_type: str
    vulnerability_score: int
    red_flags: List[str]
    employee_summary: str
    actionable_tasks: List[ActionItem]
    csv_rows: List[dict]
