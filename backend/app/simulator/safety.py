"""Input redaction and output checks around the model.

- Users type free text, and some will type real details out of habit. Anything
  that looks like a code, card, SSN, phone number or email is replaced before it
  is sent to the model or shown back, and it's never stored.
- Model-written caller lines are rejected (and the scripted line used instead)
  if they contain phone numbers, URLs, emails or long digit runs, or run too long.
  The app must never send users to a real contact point.
"""

import re

MAX_USER_TEXT = 280
MAX_CALLER_LINE = 320

_REDACTIONS = [
    (re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+'), '[email removed]'),
    (re.compile(r'\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b'), '[number removed]'),  # SSN-like
    (re.compile(r'(?:\d[\s-]?){7,}'), '[number removed]'),  # cards, phones, long codes
    (re.compile(r'\b\d{4,6}\b'), '[number removed]'),  # PINs, OTPs, last-four
]

_NUM_WORD = r'(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)'
_UNSAFE_OUTPUT = [
    re.compile(r'\d{3}[\s.)-]*\d{3}[\s.-]*\d{4}'),  # phone numbers
    re.compile(r'\(\d{3}\)'),
    re.compile(r'\d{7,}'),
    re.compile(rf'(?:{_NUM_WORD}[\s,.-]+){{7,}}', re.I),  # spelled-out phone numbers
    re.compile(r'https?://|www\.|\.(?:com|net|org|gov)\b', re.I),
    re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+'),
    re.compile(r'\b(?:call|text|dial)\s+(?:us\s+)?(?:back\s+)?(?:at|on)\b', re.I),
]


def redact_user_text(text: str) -> str:
    text = ' '.join(text.split())[:MAX_USER_TEXT]
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


def caller_line_ok(line: str) -> bool:
    if not line.strip() or len(line) > MAX_CALLER_LINE:
        return False
    return not any(p.search(line) for p in _UNSAFE_OUTPUT)
