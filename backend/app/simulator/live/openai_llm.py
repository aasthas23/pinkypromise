"""OpenAI conversation backend for live AI practice calls (Responses API, via httpx).

Same interface as ClaudeCaller in conversation.py, so the session service doesn't
care which provider runs the call:
  stream_reply(system, messages) -> async-iterable of text deltas, then `.content`
  assess(previous_caller, user_text, caller_reply) -> TurnAssessment | None

Config (env):
  OPENAI_API_KEY                   required (the same key used for speech)
  OPENAI_BASE_URL                  default https://api.openai.com/v1
  SCAM_COACH_OPENAI_MODEL          default gpt-6.1-terra (fast, natural writing) for the caller
  SCAM_COACH_OPENAI_ASSESS_MODEL   default gpt-6-luna (efficient) for per-turn labels
  SCAM_COACH_OPENAI_EFFORT         default none (spoken replies need low latency; the
                                   default models support it, larger models may not)

Responses are sent with store=false, so OpenAI doesn't keep them for later retrieval.
"""

import json
import logging
import os
from collections.abc import AsyncIterator

import httpx

from .conversation import ASSESSOR_PROMPT, LLMUnavailable, TurnAssessment
from .tactics import TACTICS, USER_ACTIONS

log = logging.getLogger(__name__)

DEFAULT_MODEL = 'gpt-6.1-terra'
DEFAULT_ASSESS_MODEL = 'gpt-6-luna'


def to_openai_input(messages: list[dict]) -> list[dict]:
    """Session history -> Responses API input messages (plain-string content)."""
    out = []
    for m in messages:
        content = m['content']
        if isinstance(content, list):  # e.g. a partial reply stored as text blocks
            content = ' '.join(b.get('text', '') for b in content if b.get('type') == 'text').strip()
        out.append({'role': m['role'], 'content': content})
    return out


class OpenAIReplyStream:
    """Async-iterates the caller's reply text; afterwards `.content` holds the assistant turn."""

    def __init__(self, caller: 'OpenAICaller', system: str, messages: list[dict]):
        self._caller, self._system, self._messages = caller, system, messages
        self.content: str | None = None
        self.stop_reason: str | None = None

    async def __aiter__(self) -> AsyncIterator[str]:
        c = self._caller
        body = {
            'model': c.model,
            'instructions': self._system,
            'input': to_openai_input(self._messages),
            'reasoning': {'effort': c.effort},
            'max_output_tokens': 800,
            'store': False,
            'stream': True,
        }
        text = []
        try:
            async with c.client.stream('POST', '/responses', json=body) as r:
                if r.status_code != 200:
                    c.fail(r.status_code, await r.aread())
                async for line in r.aiter_lines():
                    if not line.startswith('data:'):
                        continue
                    data = line[5:].strip()
                    if not data or data == '[DONE]':
                        continue
                    try:
                        ev = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    kind = ev.get('type', '')
                    if kind == 'response.output_text.delta':
                        delta = ev.get('delta') or ''
                        text.append(delta)
                        yield delta
                    elif kind in ('response.completed', 'response.incomplete'):
                        self.stop_reason = 'end_turn' if kind == 'response.completed' else 'incomplete'
                    elif kind in ('response.failed', 'error'):
                        err = (ev.get('response') or {}).get('error') or ev.get('error') or ev
                        code = (err.get('code') or err.get('type') or '') if isinstance(err, dict) else ''
                        log.warning('OpenAI stream failed: %s %s', code, (err.get('message') if isinstance(err, dict) else '') or '')
                        if code in ('insufficient_quota', 'credit_balance_exhausted'):
                            raise LLMUnavailable('The AI service account is out of credits, so the AI caller can’t talk right now.')
                        raise LLMUnavailable('The AI caller didn’t respond. Try again.')
        except httpx.HTTPError as e:
            log.warning('OpenAI reply request failed: %s', type(e).__name__)
            raise LLMUnavailable('The AI caller didn’t respond. Check your connection and try again.') from e
        self.content = ''.join(text)


class OpenAICaller:
    provider = 'openai'

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str | None = None,
        model: str = DEFAULT_MODEL,
        assess_model: str = DEFAULT_ASSESS_MODEL,
        effort: str = 'none',
        client: httpx.AsyncClient | None = None,
    ):
        self.client = client or httpx.AsyncClient(
            base_url=(base_url or 'https://api.openai.com/v1').rstrip('/'),
            headers={'Authorization': f'Bearer {api_key}'},
            timeout=httpx.Timeout(30.0, connect=5.0),
        )
        self.model, self.assess_model, self.effort = model, assess_model, effort
        self.disabled_reason: str | None = None

    @property
    def available(self) -> bool:
        return self.disabled_reason is None

    @property
    def label(self) -> str:
        return f'OpenAI {self.model}'

    def fail(self, status: int, body: bytes = b'') -> None:
        """Maps an HTTP error to LLMUnavailable; bad key or model disables the caller."""
        try:
            err = json.loads(body or b'{}').get('error') or {}
        except (json.JSONDecodeError, AttributeError):
            err = {}
        code = err.get('code') or err.get('type') or ''
        if code in ('insufficient_quota', 'credit_balance_exhausted'):
            log.warning('OpenAI account has no credits left (%s). Add credits in the OpenAI billing settings.', code)
            raise LLMUnavailable('The AI service account is out of credits, so the AI caller can’t talk right now.')
        if status in (401, 403, 404):
            self.disabled_reason = f'HTTP {status}'
            log.warning('Disabling OpenAI caller: HTTP %s (check OPENAI_API_KEY and SCAM_COACH_OPENAI_MODEL)', status)
            raise LLMUnavailable('The AI caller isn’t configured correctly on the server.')
        log.warning('OpenAI request failed with HTTP %s', status)
        raise LLMUnavailable('The AI caller is busy right now. Try again in a moment.')

    def stream_reply(self, system: str, messages: list[dict]) -> OpenAIReplyStream:
        if not self.available:
            raise LLMUnavailable('The AI caller isn’t available.')
        return OpenAIReplyStream(self, system, messages)

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
            'additionalProperties': False,
        }
        body = {
            'model': self.assess_model,
            'instructions': ASSESSOR_PROMPT,
            'input': [{'role': 'user', 'content': (
                f'Caller said before: "{previous_caller}"\n'
                f'Person said: "{user_text}"\n'
                f'Caller replied: "{caller_reply}"'
            )}],
            'reasoning': {'effort': self.effort},
            'text': {'format': {'type': 'json_schema', 'name': 'turn_labels', 'schema': schema, 'strict': True}},
            'max_output_tokens': 400,
            'store': False,
        }
        try:
            r = await self.client.post('/responses', json=body)
        except httpx.HTTPError as e:
            log.warning('Turn assessment failed: %s', type(e).__name__)
            return None
        if r.status_code != 200:
            log.warning('Turn assessment failed with HTTP %s', r.status_code)
            return None
        text = next(
            (part.get('text') for item in r.json().get('output', []) if item.get('type') == 'message'
             for part in item.get('content', []) if part.get('type') == 'output_text'),
            None,
        )
        try:
            data = json.loads(text or '')
        except json.JSONDecodeError:
            return None
        return TurnAssessment(
            caller_tactics=[t for t in data.get('caller_tactics', []) if t in TACTICS],
            user_actions=[a for a in data.get('user_actions', []) if a in USER_ACTIONS],
        )


def create_openai_caller() -> OpenAICaller | None:
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        return None
    return OpenAICaller(
        key,
        base_url=os.environ.get('OPENAI_BASE_URL'),
        model=os.environ.get('SCAM_COACH_OPENAI_MODEL', DEFAULT_MODEL),
        assess_model=os.environ.get('SCAM_COACH_OPENAI_ASSESS_MODEL', DEFAULT_ASSESS_MODEL),
        effort=os.environ.get('SCAM_COACH_OPENAI_EFFORT', 'none'),
    )
