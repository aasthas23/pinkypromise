from __future__ import annotations

import csv
import io
import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any, Dict, List

log = logging.getLogger(__name__)

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")

CSV_FIELDNAMES = [
    "user_id",
    "timestamp",
    "scam_type",
    "red_flags",
    "vulnerability_score",
    "employee_summary",
    "employee_name",
    "department",
    "scenario",
    "duration_seconds",
    "outcome",
]


def _normalize(text: str) -> str:
    return text.lower()


def _detect_red_flags(transcript: str) -> List[str]:
    text = _normalize(transcript)
    flags: List[str] = []
    checks = {
        "urgency": ["immediately", "today", "right now", "urgent", "act fast"],
        "authority": ["bank", "government", "security", "police", "official", "t-mobile support"],
        "fear": ["suspended", "locked", "fraud alert", "arrest", "account frozen", "blocked"],
        "isolation": ["don't tell anyone", "keep it private", "secret", "alone"],
        "pii_request": ["ssn", "social security", "password", "code", "otp", "pin"],
        "rewards": ["discount", "free", "gift card", "reward", "prize"],
        "social_engineering": ["verify account", "system update", "confirm identity"],
    }

    for flag_name, patterns in checks.items():
        if any(pattern in text for pattern in patterns):
            flags.append(flag_name)

    if not flags:
        flags.append("low_engagement")

    return flags


def _evaluate_with_ollama(transcript: str, scam_type: str = "unknown") -> Dict[str, Any] | None:
    """Attempts to analyze the call transcript using a local Ollama instance."""
    prompt = (
        "You are an expert fraud and scam defense analyst for Pinky Promise / T-Mobile. "
        "Analyze the following call transcript between a caller and customer/employee. "
        "Evaluate the tactics used, assess vulnerability, determine whether the customer resisted or compromised, "
        "and provide actionable feedback.\n\n"
        f"Transcript:\n{transcript}\n\n"
        "Return ONLY a valid JSON object matching this schema:\n"
        "{\n"
        '  "vulnerability_score": <integer 0-100>,\n'
        '  "red_flags": [<list of strings: "urgency", "authority", "fear", "pii_request", "rewards", "social_engineering">],\n'
        '  "scam_type": "<e.g. tmobile_phishing, account_security, rewards_scam, sim_swap>",\n'
        '  "outcome": "<"resisted" or "compromised">",\n'
        '  "employee_summary": "<concise 2-sentence summary of the employee\'s behavior>",\n'
        '  "actionable_tasks": [\n'
        '    {"title": "<title 1>", "description": "<description 1>"},\n'
        '    {"title": "<title 2>", "description": "<description 2>"},\n'
        '    {"title": "<title 3>", "description": "<description 3>"}\n'
        "  ],\n"
        '  "scenario": "<scenario title, e.g. Fake T-Mobile Support Rep>"\n'
        "}"
    )

    req_data = json.dumps(
        {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.2},
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        f"{OLLAMA_HOST.rstrip('/')}/api/generate",
        data=req_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            if response.status == 200:
                raw_body = json.loads(response.read().decode("utf-8"))
                parsed = json.loads(raw_body.get("response", "{}"))
                if "vulnerability_score" in parsed and "red_flags" in parsed:
                    log.info("Ollama analysis completed using model %s", OLLAMA_MODEL)
                    return parsed
    except Exception as exc:
        log.info("Ollama unavailable or errored (%s); falling back to heuristic analysis", exc)
        return None
    return None


def evaluate_transcript(
    user_id: str,
    transcript: str,
    scam_type: str = "tmobile_phishing",
    employee_name: str = "Alex Rivera",
    department: str = "Customer Support",
    scenario: str = "Fake T-Mobile Support Rep",
    duration_seconds: int = 185,
    outcome: str | None = None,
) -> Dict[str, Any]:
    ollama_result = _evaluate_with_ollama(transcript, scam_type)

    if ollama_result:
        score = max(0, min(100, int(ollama_result.get("vulnerability_score", 50))))
        red_flags = [str(f).lower() for f in ollama_result.get("red_flags", [])]
        scam_type = ollama_result.get("scam_type", scam_type)
        employee_summary = ollama_result.get("employee_summary", "")
        detected_outcome = ollama_result.get("outcome", outcome or ("compromised" if score >= 60 else "resisted"))
        actionable_tasks = ollama_result.get("actionable_tasks", [])
        scenario = ollama_result.get("scenario", scenario)
    else:
        text = _normalize(transcript)
        red_flags = _detect_red_flags(transcript)

        urgency_hits = sum(1 for keyword in ["urgent", "immediately", "right now", "today", "act fast"] if keyword in text)
        authority_hits = sum(1 for keyword in ["official", "bank", "police", "security", "government", "t-mobile"] if keyword in text)
        pii_hits = sum(1 for keyword in ["ssn", "password", "otp", "code", "social security", "pin"] if keyword in text)

        # Baseline vulnerability score calculation
        # If user verified or refused, lower score; if user surrendered PII, higher score
        refusal_hits = sum(1 for keyword in ["verify", "official app", "not sure", "hang up", "call back", "refuse"] if keyword in text)
        
        raw_score = 30 + (urgency_hits * 12) + (authority_hits * 10) + (pii_hits * 15) - (refusal_hits * 18)
        score = max(10, min(100, raw_score))

        detected_outcome = outcome or ("compromised" if score >= 60 else "resisted")

        if detected_outcome == "resisted":
            employee_summary = (
                f"{employee_name} hesitated when the caller created urgency, but refused to share verification codes "
                "or credentials and suggested checking through official channels."
            )
        else:
            employee_summary = (
                f"{employee_name} showed high vulnerability under pressure and provided verification details. "
                "Immediate reinforcement of pause-and-verify protocols is recommended."
            )

        actionable_tasks = [
            {
                "title": "Pause before sharing any code",
                "description": "Never disclose one-time SMS verification codes, passwords, or PINs to any inbound caller.",
            },
            {
                "title": "Verify through an official channel",
                "description": "If a caller claims to be from T-Mobile support or fraud prevention, hang up and call the official customer care number.",
            },
            {
                "title": "Recognize urgency manipulation",
                "description": "Urgency is a key psychological scam weapon. High pressure is a strong indicator of fraud.",
            },
        ]

    timestamp = datetime.utcnow().isoformat()
    csv_row = {
        "user_id": user_id,
        "timestamp": timestamp,
        "scam_type": scam_type,
        "red_flags": "; ".join(red_flags),
        "vulnerability_score": score,
        "employee_summary": employee_summary,
        "employee_name": employee_name,
        "department": department,
        "scenario": scenario,
        "duration_seconds": duration_seconds,
        "outcome": detected_outcome,
    }

    csv_buffer = io.StringIO()
    writer = csv.DictWriter(csv_buffer, fieldnames=CSV_FIELDNAMES)
    writer.writeheader()
    writer.writerow(csv_row)

    return {
        "user_id": user_id,
        "timestamp": timestamp,
        "scam_type": scam_type,
        "vulnerability_score": score,
        "red_flags": red_flags,
        "employee_summary": employee_summary,
        "employee_name": employee_name,
        "department": department,
        "scenario": scenario,
        "duration_seconds": duration_seconds,
        "outcome": detected_outcome,
        "actionable_tasks": actionable_tasks,
        "csv_rows": [csv_row],
        "csv_content": csv_buffer.getvalue(),
    }
