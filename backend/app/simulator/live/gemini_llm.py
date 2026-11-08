"""Google Gemini conversation backend for live AI practice calls.

Same interface as ClaudeCaller / OpenAICaller:
  stream_reply(system, messages) -> async-iterable of text deltas, then `.content`
  assess(previous_caller, user_text, caller_reply) -> TurnAssessment | None

The model's own reply parts (including any thought signatures) are kept as the
assistant turn, so multi-turn history is sent back exactly as Gemini produced it.

Config (env):
  GEMINI_API_KEY                   required (the same key used for speech)
  SCAM_COACH_GEMINI_MODEL          default gemini-3.5-flash-lite (fastest current model)
  SCAM_COACH_GEMINI_ASSESS_MODEL   default gemini-3.5-flash-lite
  SCAM_COACH_GEMINI_THINKING       default MINIMAL (lowest level this model supports; keeps replies quick)
"""

import json
import logging
import os
from collections.abc import AsyncIterator

import httpx

from .conversation import ASSESSOR_PROMPT, LLMUnavailable, TurnAssessment
from .gemini_client import GeminiError, api_key, make_client, raise_for_error, text_from
from .tactics import TACTICS, USER_ACTIONS

log = logging.getLogger(__name__)

DEFAULT_MODEL = 'gemini-3.5-flash-lite'
BLOCKED = {'SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'OTHER'}


def to_gemini_contents(messages: list[dict]) -> list[dict]:
    """Session history -> Gemini contents (roles user/model)."""
    out = []
    for m in messages:
        role = 'model' if m['role'] == 'assistant' else 'user'
        c = m['content']
        if isinstance(c, dict) and 'gemini_parts' in c:  # a Gemini reply, kept verbatim
            parts = c['gemini_parts']
        elif isinstance(c, list):  # text blocks (e.g. a partial reply)
            parts = [{'text': ' '.join(b.get('text', '') for b in c if b.get('type') == 'text').strip()}]
        else:
            parts = [{'text': str(c)}]
        out.append({'role': role, 'parts': parts})
    return out


class GeminiReplyStream:
    def __init__(self, caller: 'GeminiCaller', system: str, messages: list[dict]):
        self._caller, self._system, self._messages = caller, system, messages
        self.content: dict | None = None
        self.stop_reason: str | None = None

    async def __aiter__(self) -> AsyncIterator[str]:
        c = self._caller
        body = {
            'systemInstruction': {'parts': [{'text': self._system}]},
            'contents': to_gemini_contents(self._messages),
            'generationConfig': {'maxOutputTokens': 800, 'thinkingConfig': {'thinkingLevel': c.thinking}},
        }
        parts: list[dict] = []
        try:
            async with c.client.stream('POST', f'/models/{c.model}:streamGenerateContent', params={'alt': 'sse'}, json=body) as r:
                if r.status_code != 200:
                    c.fail(r.status_code, await r.aread())
                async for line in r.aiter_lines():
                    if not line.startswith('data:'):
                        continue
                    try:
                        chunk = json.loads(line[5:].strip())
                    except json.JSONDecodeError:
                        continue
                    if (chunk.get('promptFeedback') or {}).get('blockReason'):
                        log.warning('Gemini blocked the prompt: %s', chunk['promptFeedback']['blockReason'])
                        self.stop_reason = 'blocked'
                        break
                    cand = (chunk.get('candidates') or [{}])[0]
                    for part in (cand.get('content') or {}).get('parts') or []:
                        parts.append(part)
                        if part.get('text') and not part.get('thought'):
                            yield part['text']
                    if cand.get('finishReason'):
                        reason = cand['finishReason']
                        self.stop_reason = 'end_turn' if reason in ('STOP', 'MAX_TOKENS') else reason
                        if reason in BLOCKED:
                            log.warning('Gemini stopped the reply: %s', reason)
        except httpx.HTTPError as e:
            log.warning('Gemini reply request failed: %s', type(e).__name__)
            raise LLMUnavailable('The AI caller didn’t respond. Check your connection and try again.') from e
        self.content = {'gemini_parts': parts or [{'text': ''}]}


class GeminiCaller:
    provider = 'gemini'

    def __init__(self, client: httpx.AsyncClient, *, model: str = DEFAULT_MODEL,
                 assess_model: str = DEFAULT_MODEL, thinking: str = 'MINIMAL'):
        self.client, self.model, self.assess_model, self.thinking = client, model, assess_model, thinking
        self.disabled_reason: str | None = None

    @property
    def available(self) -> bool:
        return self.disabled_reason is None

    @property
    def label(self) -> str:
        return f'Google {self.model}'

    def fail(self, status: int, body: bytes) -> None:
        try:
            raise_for_error(status, body, 'reply')
        except GeminiError as e:
            if e.fatal:
                self.disabled_reason = str(e)
            raise LLMUnavailable(str(e)) from e

    def stream_reply(self, system: str, messages: list[dict]) -> GeminiReplyStream:
        if not self.available:
            raise LLMUnavailable('The AI caller isn’t available.')
        return GeminiReplyStream(self, system, messages)

    async def assess(self, previous_caller: str, user_text: str, caller_reply: str) -> TurnAssessment | None:
        if not self.available:
            return None
        schema = {
            'type': 'object',
            'properties': {
                'caller_tactics': {'type': 'array', 'items': {'type': 'string', 'enum': list(TACTICS)}},
                'user_actions': {'type': 'array', 'items': {'type': 'string', 'enum': list(USER_ACTIONS)}},
            },
            'required': ['caller_tactics', 'user_actions'],
        }
        body = {
            'systemInstruction': {'parts': [{'text': ASSESSOR_PROMPT}]},
            'contents': [{'role': 'user', 'parts': [{'text': (
                f'Caller said before: "{previous_caller}"\n'
                f'Person said: "{user_text}"\n'
                f'Caller replied: "{caller_reply}"'
            )}]}],
            'generationConfig': {
                'responseMimeType': 'application/json',
                'responseJsonSchema': schema,
                'maxOutputTokens': 400,
                'thinkingConfig': {'thinkingLevel': self.thinking},
            },
        }
        try:
            r = await self.client.post(f'/models/{self.assess_model}:generateContent', json=body)
        except httpx.HTTPError as e:
            log.warning('Turn assessment failed: %s', type(e).__name__)
            return None
        if r.status_code != 200:
            log.warning('Turn assessment failed with HTTP %s', r.status_code)
            return None
        try:
            data = json.loads(text_from(r.json()) or '')
        except json.JSONDecodeError:
            return None
        return TurnAssessment(
            caller_tactics=[t for t in data.get('caller_tactics', []) if t in TACTICS],
            user_actions=[a for a in data.get('user_actions', []) if a in USER_ACTIONS],
        )


def create_gemini_caller() -> GeminiCaller | None:
    key = api_key()
    if not key:
        return None
    return GeminiCaller(
        make_client(key, os.environ.get('GEMINI_BASE_URL')),
        model=os.environ.get('SCAM_COACH_GEMINI_MODEL', DEFAULT_MODEL),
        assess_model=os.environ.get('SCAM_COACH_GEMINI_ASSESS_MODEL', DEFAULT_MODEL),
        thinking=os.environ.get('SCAM_COACH_GEMINI_THINKING', 'MINIMAL'),
    )
