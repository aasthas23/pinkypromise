from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Any, Dict, List


def _normalize(text: str) -> str:
    return text.lower()


def _detect_red_flags(transcript: str) -> List[str]:
    text = _normalize(transcript)
    flags: List[str] = []
    checks = {
        "urgency": ["immediately", "today", "right now", "urgent", "act fast"],
        "authority": ["bank", "government", "security", "police", "official"],
        "fear": ["suspended", "locked", "fraud alert", "arrest", "account frozen"],
        "isolation": ["don't tell anyone", "keep it private", "secret", "alone"],
        "pii_request": ["ssn", "social security", "password", "code", "otp"],
    }

    for flag_name, patterns in checks.items():
        if any(pattern in text for pattern in patterns):
            flags.append(flag_name)

    if not flags:
        flags.append("low_engagement")

    return flags


def evaluate_transcript(user_id: str, transcript: str, scam_type: str = "unknown") -> Dict[str, Any]:
    text = _normalize(transcript)
    red_flags = _detect_red_flags(transcript)

    urgency_hits = sum(1 for keyword in ["urgent", "immediately", "right now", "today"] if keyword in text)
    authority_hits = sum(1 for keyword in ["official", "bank", "police", "security", "government"] if keyword in text)
    pii_hits = sum(1 for keyword in ["ssn", "password", "otp", "code", "social security"] if keyword in text)

    score = 30 + (urgency_hits * 15) + (authority_hits * 12) + (pii_hits * 18)
    score = max(0, min(100, score))

    employee_summary = (
        "The user stayed on the call longer than ideal and showed exposure to urgency and pressure-based persuasion. "
        "The response pattern suggests the need for a stronger pause-and-verify habit before sharing any code or account detail."
    )

    actionable_tasks = [
        {
            "title": "Pause before sharing any code",
            "description": "Do not disclose one-time codes, passwords, or account numbers during a call that creates urgency.",
        },
        {
            "title": "Verify through a trusted channel",
            "description": "If someone claims to be from a company, call the official number on the account or website instead of using the contact they provide.",
        },
        {
            "title": "Use the buddy rule",
            "description": "If a caller pressures you to act fast or keep things secret, hang up and ask a trusted family member or coworker to review the situation.",
        },
    ]

    csv_buffer = io.StringIO()
    writer = csv.DictWriter(
        csv_buffer,
        fieldnames=["user_id", "timestamp", "scam_type", "red_flags", "vulnerability_score", "employee_summary"],
    )
    writer.writeheader()
    writer.writerow(
        {
            "user_id": user_id,
            "timestamp": datetime.utcnow().isoformat(),
            "scam_type": scam_type,
            "red_flags": "; ".join(red_flags),
            "vulnerability_score": score,
            "employee_summary": employee_summary,
        }
    )

    return {
        "user_id": user_id,
        "scam_type": scam_type,
        "vulnerability_score": score,
        "red_flags": red_flags,
        "employee_summary": employee_summary,
        "actionable_tasks": actionable_tasks,
        "csv_rows": [{
            "user_id": user_id,
            "timestamp": datetime.utcnow().isoformat(),
            "scam_type": scam_type,
            "red_flags": "; ".join(red_flags),
            "vulnerability_score": score,
            "employee_summary": employee_summary,
        }],
        "csv_content": csv_buffer.getvalue(),
    }
