from __future__ import annotations

from typing import List, Optional

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
    scam_type: str = "tmobile_phishing"
    employee_name: Optional[str] = "Alex Rivera"
    department: Optional[str] = "Customer Support"
    scenario: Optional[str] = "Fake T-Mobile Support Rep"
    duration_seconds: Optional[int] = 185


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
    outcome: str = "resisted"
    employee_name: str = "Alex Rivera"
    department: str = "Customer Support"
    scenario: str = "Fake T-Mobile Support Rep"
    duration_seconds: int = 185
