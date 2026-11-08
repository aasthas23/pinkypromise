#!/usr/bin/env python3
"""
Builds the grounding corpus for AI practice calls from the FTC robocall dataset.

Source (left untouched; read only): Robocall Audio Dataset, Prasad and Reaves,
NC State University, TR-2023-1 — https://github.com/wspr-ncsu/robocall-audio-dataset
(recordings collected by the FTC's Project Point of No Entry; public domain).

Output: backend/data/robocall_transcripts.jsonl, one redacted transcript per line:
  {"id", "source_file", "ftc_letter", "text", "scam_types": [...], "tactics": [...]}

Redaction: phone numbers (digits and spelled out), URLs, emails, SSN-like and
long digit runs, and alphanumeric reference/order codes are replaced with
placeholders, so no callback number or identifier reaches the model or the app.
Near-duplicate scripts (same robocall sent many times) are collapsed.

Usage:
    python3 -I scripts/build_robocall_corpus.py [--metadata path/to/metadata.csv]
Without --metadata, the CSV is downloaded from the dataset repository.
"""
import argparse
import csv
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

SOURCE_CSV = 'https://raw.githubusercontent.com/wspr-ncsu/robocall-audio-dataset/main/metadata.csv'
OUT = Path(__file__).resolve().parents[1] / 'data' / 'robocall_transcripts.jsonl'

NUM_WORD = r'(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)'
REDACTIONS = [
    (re.compile(r'https?://\S+|www\.\S+|\b[\w-]+\.(?:com|net|org|gov|info|us)\b', re.I), '[website]'),
    # Web addresses dictated aloud ("W W W dot ... dot com")
    (re.compile(r'\bw\s?w\s?w\b\.?(?:\s*(?:dot\s+)?[\w-]+)?(?:\s+dot\s+(?:com|net|org|gov|us|info))?', re.I), '[website]'),
    (re.compile(r'\b[\w-]+\s+dot\s+(?:com|net|org|gov|us|info)\b', re.I), '[website]'),
    (re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+'), '[email]'),
    (re.compile(r'\(?\b\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}\b'), '[phone number]'),
    (re.compile(r'\b1?[\s.-]*8(?:00|33|44|55|66|77|88)[\s.-]*\d{3}[\s.-]*\d{4}\b'), '[phone number]'),
    (re.compile(rf'\b(?:{NUM_WORD}[\s,.-]+){{6,}}{NUM_WORD}\b', re.I), '[phone number]'),
    (re.compile(r'\b\d{3}[-\s]\d{2}[-\s]\d{4}\b'), '[number]'),
    (re.compile(r'\b\d{7,}\b'), '[number]'),
    (re.compile(r'\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9]{2,}-?[A-Z0-9]{3,}\b'), '[reference code]'),
]

SCAM_TYPES = {
    'account_security': r'suspend|suspicious activit|fraudulent activit|compromised|hack|unauthori[sz]ed|blocked|locked',
    'order_or_charge': r'\border\b|purchase|charged|charge of|payment of|authori[sz]e',
    'refund_or_billing': r'refund|overcharg|bill|invoice|credit back|reimburs',
    'discount_or_prize': r'discount|% off|percent off|offer|qualif|prize|winner|reward|free',
    'tech_support': r'computer|virus|technical support|tech support|microsoft|remote|software',
    'government': r'social security|irs|warrant|legal action|federal|police|arrest|court',
    'utility_or_carrier': r'electric|utility|disconnect|service will be|cell ?phone|phone service|wireless|carrier|directv|at&t',
}
TACTICS = {
    'authority_claim': r'department|officer|agent|representative|security team|customer service|on behalf of|calling from',
    'artificial_urgency': r'immediately|right now|today|final|last (?:attempt|notice|chance)|within \d+|expire|urgent|as soon as possible',
    'fear_of_loss': r'suspend|blocked|frozen|cancel|lose|legal|arrest|warrant|penalt|disconnect',
    'too_good_offer': r'discount|% off|percent off|free|qualif|selected|winner|reward|special offer',
    'press_one': r'press (?:1|one|2|two|9|nine)',
    'personal_info_request': r'verify your|confirm your|social security number|date of birth|account number',
    'payment_request': r'gift card|wire|payment|pay|bitcoin|card number',
    'remote_access_request': r'computer|remote|install|download|access to your',
    'secrecy_demand': r"don't tell|do not tell|confidential|keep (?:this|it) (?:private|secret)",
}


def redact(text: str) -> str:
    text = ' '.join(text.split())
    for pattern, repl in REDACTIONS:
        text = pattern.sub(repl, text)
    return text


def tags(text: str, table: dict[str, str]) -> list[str]:
    return [name for name, pat in table.items() if re.search(pat, text, re.I)]


def load_rows(path: str | None) -> list[dict]:
    if path:
        raw = Path(path).read_text(encoding='utf-8')
    else:
        with urllib.request.urlopen(SOURCE_CSV, timeout=60) as r:
            raw = r.read().decode('utf-8')
    return list(csv.DictReader(io.StringIO(raw)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--metadata', help='local copy of the dataset metadata.csv')
    args = ap.parse_args()

    rows = load_rows(args.metadata)
    seen: set[str] = set()
    out = []
    for r in rows:
        if r.get('language') != 'en':
            continue
        text = redact(r['transcript'])
        if len(text.split()) < 12:  # fragments carry no usable pattern
            continue
        key = re.sub(r'\W+', ' ', text.lower())[:90]
        if key in seen:
            continue
        seen.add(key)
        out.append({
            'id': f'ftc-{len(out) + 1:04d}',
            'source_file': Path(r['file_name']).name,
            'ftc_letter': r.get('case_pdf', ''),
            'text': text,
            'scam_types': tags(text, SCAM_TYPES),
            'tactics': tags(text, TACTICS),
        })

    # Safety net: refuse to write if anything that looks like a phone number survived.
    leak = re.compile(r'\d{3}[\s.-]*\d{3}[\s.-]*\d{4}|\d{7,}|https?://|www\.|\bdot com\b', re.I)
    bad = [x['id'] for x in out if leak.search(x['text'])]
    if bad:
        sys.exit(f'redaction failed for {len(bad)} transcripts, e.g. {bad[:5]}')

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', encoding='utf-8') as f:
        for x in out:
            f.write(json.dumps(x, ensure_ascii=False) + '\n')
    print(f'{len(rows)} source rows -> {len(out)} unique English transcripts -> {OUT}')


if __name__ == '__main__':
    main()
