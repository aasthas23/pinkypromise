"""Shared Google Gemini API client (generativelanguage.googleapis.com, generateContent REST).

The key is sent in the x-goog-api-key header (never in the URL, so it can't end up
in logs). Errors are mapped to short, user-safe messages.

Config (env): GEMINI_API_KEY (required), GEMINI_BASE_URL (default
https://generativelanguage.googleapis.com/v1beta).
"""

import json
import logging
import os

import httpx

log = logging.getLogger(__name__)

DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta'


class GeminiError(Exception):
    """A Gemini request failed. `message` is safe to show the user; `fatal` means the key/model is wrong."""

    def __init__(self, message: str, fatal: bool = False):
        super().__init__(message)
        self.fatal = fatal


def make_client(api_key: str, base_url: str | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=(base_url or DEFAULT_BASE).rstrip('/'),
        headers={'x-goog-api-key': api_key},
        timeout=httpx.Timeout(30.0, connect=5.0),
    )


def raise_for_error(status: int, body: bytes, what: str) -> None:
    """Turns a non-200 Gemini response into a GeminiError."""
    try:
        err = json.loads(body or b'{}').get('error') or {}
    except (json.JSONDecodeError, AttributeError):
        err = {}
    reason = err.get('status') or ''
    details = json.dumps(err.get('details') or [])
    log.warning('Gemini %s failed: HTTP %s %s %s', what, status, reason, (err.get('message') or '')[:200])
    if status == 429 or reason == 'RESOURCE_EXHAUSTED':
        raise GeminiError('The AI service’s usage limit has been reached. Try again in a minute, or check the Gemini API quota.')
    if 'API_KEY_INVALID' in details or status in (401, 403):
        raise GeminiError('The AI service key isn’t valid. Check GEMINI_API_KEY on the server.', fatal=True)
    if status == 404:
        raise GeminiError('The configured Gemini model wasn’t found. Check the model name on the server.', fatal=True)
    raise GeminiError('The AI service didn’t respond. Try again.')


def text_from(response: dict) -> str:
    """Visible text of a generateContent response (thought parts skipped)."""
    out = []
    for cand in response.get('candidates') or []:
        for part in (cand.get('content') or {}).get('parts') or []:
            if part.get('text') and not part.get('thought'):
                out.append(part['text'])
        break  # first candidate only
    return ''.join(out)


def api_key() -> str | None:
    return os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
