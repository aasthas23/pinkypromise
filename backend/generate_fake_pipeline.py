from __future__ import annotations

import csv
from pathlib import Path

from app.services.analysis import evaluate_transcript

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
OUTPUT_DIR = ROOT / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


def build_summary(result: dict) -> str:
    score = result["vulnerability_score"]
    red_flags = result["red_flags"]
    tasks = result["actionable_tasks"]

    lines = [
        "Pink Promise AI Fraud Analysis Summary",
        "====================================",
        f"User ID: {result['user_id']}",
        f"Scam type: {result['scam_type']}",
        f"Vulnerability score: {score}/100",
        "",
        "Detected red flags:",
    ]

    for flag in red_flags:
        lines.append(f"- {flag}")

    lines.extend([
        "",
        "Employee summary:",
        result["employee_summary"],
        "",
        "Actionable tasks:",
    ])

    for index, item in enumerate(tasks, start=1):
        lines.append(f"{index}. {item['title']} - {item['description']}")

    lines.extend([
        "",
        "Risk chart:",
    ])

    tactic_scores = {
        "Urgency": max(20, score - 5),
        "Authority": max(25, score - 3),
        "Fear": max(30, score),
        "Isolation": max(15, score - 10),
        "PII request": max(35, score),
    }

    max_value = max(tactic_scores.values())
    for name, value in tactic_scores.items():
        bar_length = max(1, int((value / max_value) * 20))
        lines.append(f"{name:<12} {'█' * bar_length} {value}")

    return "\n".join(lines) + "\n"


def main() -> None:
    transcript_path = DATA_DIR / "fake_transcript.txt"
    transcript = transcript_path.read_text(encoding="utf-8")

    result = evaluate_transcript(
        user_id="fake-user-001",
        transcript=transcript,
        scam_type="tmobile_phishing",
    )

    csv_path = OUTPUT_DIR / "fake_analysis.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "user_id",
                "timestamp",
                "scam_type",
                "red_flags",
                "vulnerability_score",
                "employee_summary",
            ],
        )
        writer.writeheader()
        for row in result["csv_rows"]:
            writer.writerow(row)

    summary = build_summary(result)
    summary_path = OUTPUT_DIR / "fake_analysis_summary.txt"
    summary_path.write_text(summary, encoding="utf-8")

    print(f"CSV written to: {csv_path}")
    print(f"Summary written to: {summary_path}")
    print("\nSummary preview:\n")
    print(summary)


if __name__ == "__main__":
    main()
