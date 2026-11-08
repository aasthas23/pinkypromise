from __future__ import annotations

import csv
import sys
from pathlib import Path

from app.services.analysis import CSV_FIELDNAMES, evaluate_transcript

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
OUTPUT_DIR = ROOT / "output"
FRONTEND_DATA_DIR = ROOT.parent / "frontend" / "src" / "data"

OUTPUT_DIR.mkdir(exist_ok=True)
if FRONTEND_DATA_DIR.exists():
    FRONTEND_DATA_DIR.mkdir(parents=True, exist_ok=True)


def build_summary(result: dict) -> str:
    score = result["vulnerability_score"]
    red_flags = result["red_flags"]
    tasks = result["actionable_tasks"]

    lines = [
        "Pink Promise AI Fraud Analysis Summary (Ollama / Local Inference)",
        "===================================================================",
        f"Employee Name: {result.get('employee_name', 'Alex Rivera')}",
        f"User ID: {result['user_id']}",
        f"Department: {result.get('department', 'Customer Support')}",
        f"Scenario: {result.get('scenario', 'Fake T-Mobile Support Rep')}",
        f"Scam type: {result['scam_type']}",
        f"Outcome: {result.get('outcome', 'resisted').upper()}",
        f"Vulnerability score: {score}/100 (Scam Awareness: {100 - score}%)",
        "",
        "Detected tactics / red flags:",
    ]

    for flag in red_flags:
        lines.append(f"- {flag}")

    lines.extend([
        "",
        "Employee behavioral debrief:",
        result["employee_summary"],
        "",
        "Actionable tasks:",
    ])

    for index, item in enumerate(tasks, start=1):
        lines.append(f"{index}. {item['title']} - {item['description']}")

    lines.extend([
        "",
        "Risk profile chart:",
    ])

    tactic_scores = {
        "Urgency": max(15, min(100, score + 4)),
        "Authority": max(20, min(100, score - 2)),
        "Fear": max(10, min(100, score - 6)),
        "PII request": max(25, min(100, score)),
    }

    max_value = max(tactic_scores.values()) or 1
    for name, value in tactic_scores.items():
        bar_length = max(1, int((value / max_value) * 20))
        lines.append(f"{name:<14} {'█' * bar_length} {value}/100")

    return "\n".join(lines) + "\n"


def load_existing_rows(csv_path: Path) -> list[dict]:
    if not csv_path.exists():
        return []
    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def write_csv_rows(csv_path: Path, rows: list[dict]) -> None:
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDNAMES)
        writer.writeheader()
        for row in rows:
            # Ensure every field in CSV_FIELDNAMES is present
            sanitized = {k: row.get(k, "") for k in CSV_FIELDNAMES}
            writer.writerow(sanitized)


def main() -> None:
    transcript_file = Path(sys.argv[1]) if len(sys.argv) > 1 else (DATA_DIR / "fake_transcript.txt")
    if not transcript_file.exists():
        print(f"Error: Transcript file not found at {transcript_file}")
        sys.exit(1)

    transcript = transcript_file.read_text(encoding="utf-8")
    print(f"Analyzing transcript from: {transcript_file}...")

    result = evaluate_transcript(
        user_id="fake-user-001",
        transcript=transcript,
        scam_type="tmobile_phishing",
        employee_name="Alex Rivera",
        department="Customer Support",
        scenario="Fake T-Mobile Support Rep",
        duration_seconds=185,
    )

    new_row = result["csv_rows"][0]
    output_csv = OUTPUT_DIR / "fake_analysis.csv"
    existing_rows = load_existing_rows(output_csv)

    # Replace existing row for this user or prepend new row
    updated_rows = []
    user_replaced = False
    for r in existing_rows:
        if r.get("user_id") == new_row["user_id"]:
            updated_rows.append(new_row)
            user_replaced = True
        else:
            updated_rows.append(r)

    if not user_replaced:
        updated_rows.insert(0, new_row)

    # Write to backend output CSV
    write_csv_rows(output_csv, updated_rows)
    print(f"Updated backend CSV: {output_csv} ({len(updated_rows)} records)")

    # Also synchronize to frontend data directory if present
    frontend_csv = FRONTEND_DATA_DIR / "fake_analysis.csv"
    if FRONTEND_DATA_DIR.exists():
        write_csv_rows(frontend_csv, updated_rows)
        print(f"Updated frontend CSV: {frontend_csv}")

    summary = build_summary(result)
    summary_path = OUTPUT_DIR / "fake_analysis_summary.txt"
    summary_path.write_text(summary, encoding="utf-8")
    print(f"Summary written to: {summary_path}")

    print("\nSummary preview:\n")
    print(summary)


if __name__ == "__main__":
    main()
