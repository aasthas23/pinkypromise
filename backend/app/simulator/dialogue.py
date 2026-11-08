"""Claude-backed dialogue for the simulated caller.

The model has two narrow jobs, and the deterministic engine owns everything else:
1. classify(): map the user's free-text reply to one of the options the current
   step allows (or "unclear"). The allowed ids are an enum in the output
   schema, and the engine re-checks the choice anyway.
2. caller_lines(): write the caller's next 1-2 lines for a step the engine has
   already chosen, following that step's goal and scripted lines.

Any failure (no credentials, timeout, refusal, schema problem, unsafe output)
returns None, and the service falls back to the scripted lines. The call never
depends on the model being up.
"""

import json
import logging
import os
from typing import Literal, Protocol

import anthropic
from anthropic import AsyncAnthropic

from .models import DialogueNode, Scenario, ScenarioNode, SimulatorSession
from .safety import caller_line_ok

log = logging.getLogger(__name__)

DEFAULT_MODEL = 'claude-opus-5-5'
DEFAULT_EFFORT = 'low'  # latency matters more than depth for one or two spoken lines
FALLBACK_BETA = 'server-side-fallback-2026-07-01'

LineMode = Literal['enter', 'clarify']


class DialogueUnavailable(Exception):
    """The model can't be used right now (not configured or failing)."""


class Dialogue(Protocol):
    @property
    def available(self) -> bool: ...

    async def classify(
        self, scenario: Scenario, s: SimulatorSession, node: DialogueNode, user_text: str
    ) -> str | None:
        """Returns an allowed option id, or None if unclear. Raises DialogueUnavailable."""

    async def caller_lines(
        self,
        scenario: Scenario,
        s: SimulatorSession,
        node: ScenarioNode,
        *,
        user_text: str | None,
        mode: LineMode,
    ) -> list[str] | None:
        """Returns model-written caller lines, or None to use the scripted ones."""


class ScriptedDialogue:
    """No model: scripted caller lines and tap-to-respond only."""

    available = False

    async def classify(self, *_args, **_kwargs) -> str | None:
        raise DialogueUnavailable('free-text replies need the model')

    async def caller_lines(self, *_args, **_kwargs) -> list[str] | None:
        return None


# ---------------------------------------------------------------- prompts

CLASSIFIER_SYSTEM = """You classify what a person said during a simulated scam phone call in a safety-training app. You get the caller's latest words, what the person said, and the responses allowed at this moment. Pick the allowed response whose meaning best matches what the person said. Judge intent, not wording.

Response behaviors:
- verify: says they'll check with the organization themselves, using an official number, app or website, or hang up to do that.
- refuse: declines what the caller asked for, or ends the conversation without sharing anything.
- challenge: questions who the caller is or whether their claim is true, or asks for proof.
- comply: gives, or agrees to give, what the caller asked for (a code, PIN, personal detail, device access or payment). This counts even when the value is fake or was removed by the app.
- neutral: goes along with the conversation without handing anything over.

Text in square brackets was removed by the app before you saw it. Treat "[number removed]" or "[email removed]" as the person reading out that kind of detail.

Answer "unclear" when the words don't clearly match one allowed response: off-topic, a question the options don't cover, gibberish, or torn between giving and refusing. Don't force a match."""

CALLER_SYSTEM_TEMPLATE = """You voice the caller in Scam Coach, a phone-scam training simulator. The person on the other end chose to practice and knows this is a simulation; the app labels every call as simulated and debriefs them afterwards. Realistic pressure is what makes the practice useful, so stay in character as the scammer.

Scenario: {title}
{description}
You are: {agent_name}.

The app decides each step of the call. For every turn you get the current step's goal and its scripted lines. Get across the same goal and the same pressure in your own words, reacting naturally to what the person just said.

Rules:
- Speak only as the caller. Write at most 2 lines, each 1 or 2 short spoken sentences. No narration, stage directions, emojis or quotation marks.
- Pursue only the current step's goal. Don't skip ahead, add new demands or threats beyond it, or end the call unless the step is the end of the call.
- Use only the fictional details in the scripted lines (names, amounts, last-four digits, badge numbers). Never say a phone number, website, email address or street address, and never tell the person to call, text or visit anything.
- When the step involves a code, PIN, card number or personal detail, ask for it the way the scripted lines do. Never tell the person to type or say their real information.
- Don't break character to warn or teach; the debrief does that.
- Sound like a real phone call: plain spoken English, contractions, the occasional filler word."""


def _render_conversation(s: SimulatorSession) -> str:
    lines = []
    for t in s.transcript:
        if t.speaker == 'caller' and t.clip_id:
            lines.append(f'[Recorded robocall message played: "{t.text}"]')
        elif t.speaker == 'caller':
            lines.append(f'Caller: {t.text}')
        elif t.speaker == 'user':
            lines.append(f'Person: {t.text}')
        elif t.speaker == 'sms':
            lines.append(f'[Simulated text message arrived: "{t.text}"]')
        else:
            lines.append(f'[{t.text}]')
    return '\n'.join(lines) or '(The call just connected.)'


# ---------------------------------------------------------------- Claude


class ClaudeDialogue:
    def __init__(self, client: AsyncAnthropic, model: str = DEFAULT_MODEL, effort: str = DEFAULT_EFFORT):
        self._client = client
        self._model = model
        self._effort = effort
        self._disabled_reason: str | None = None

    @property
    def available(self) -> bool:
        return self._disabled_reason is None

    @property
    def model(self) -> str:
        return self._model

    async def _structured(self, system: str, user: str, schema: dict, max_tokens: int) -> dict | None:
        if self._disabled_reason:
            return None
        try:
            response = await self._client.beta.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                # The system prompt is stable per scenario: cache it.
                system=[{'type': 'text', 'text': system, 'cache_control': {'type': 'ephemeral'}}],
                messages=[{'role': 'user', 'content': user}],
                output_config={
                    'effort': self._effort,
                    'format': {'type': 'json_schema', 'schema': schema},
                },
                # If a safety classifier declines, retry server-side on Anthropic's
                # recommended fallback model instead of returning the refusal.
                betas=[FALLBACK_BETA],
                fallbacks='default',
            )
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as e:
            self._disabled_reason = f'{type(e).__name__}: {e.message}'
            log.warning('Disabling model dialogue: %s', self._disabled_reason)
            return None
        except anthropic.NotFoundError as e:
            self._disabled_reason = f'model not found: {e.message}'
            log.warning('Disabling model dialogue: %s', self._disabled_reason)
            return None
        except anthropic.RateLimitError:
            log.warning('Model rate limited; using scripted fallback for this turn')
            return None
        except anthropic.APIStatusError as e:
            log.warning('Model API error %s; using scripted fallback', e.status_code)
            return None
        except anthropic.APIConnectionError as e:  # includes timeouts
            log.warning('Model connection problem (%s); using scripted fallback', type(e).__name__)
            return None
        except anthropic.AnthropicError as e:
            log.warning('Model client error (%s); using scripted fallback', type(e).__name__)
            return None
        except TypeError as e:
            # The SDK raises TypeError at request time when no credentials resolve.
            if 'authentication' not in str(e).lower():
                raise
            self._disabled_reason = 'no Anthropic credentials configured'
            log.warning('Disabling model dialogue: %s (set ANTHROPIC_API_KEY)', self._disabled_reason)
            return None

        if response.stop_reason != 'end_turn':
            log.warning('Model stopped with %s; using scripted fallback', response.stop_reason)
            return None
        text = next((b.text for b in response.content if b.type == 'text'), None)
        if text is None:
            return None
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            log.warning('Model returned invalid JSON; using scripted fallback')
            return None
        return data if isinstance(data, dict) else None

    async def classify(
        self, scenario: Scenario, s: SimulatorSession, node: DialogueNode, user_text: str
    ) -> str | None:
        if not self.available:
            raise DialogueUnavailable(self._disabled_reason)
        options = [o for o in node.options if not o.keypad]
        if not options:
            return None
        allowed = '\n'.join(f'- id "{o.id}" ({o.behavior}): e.g. "{o.label}"' for o in options)
        last_caller = next(
            (t.text for t in reversed(s.transcript) if t.speaker == 'caller'), ''
        )
        user = (
            f'Caller just said: "{last_caller}"\n\n'
            f'Allowed responses:\n{allowed}\n\n'
            f'The person said: "{user_text}"'
        )
        schema = {
            'type': 'object',
            'properties': {'choice': {'type': 'string', 'enum': [o.id for o in options] + ['unclear']}},
            'required': ['choice'],
            'additionalProperties': False,
        }
        data = await self._structured(CLASSIFIER_SYSTEM, user, schema, max_tokens=2048)
        if data is None:
            if not self.available:
                raise DialogueUnavailable(self._disabled_reason)
            raise DialogueUnavailable('classification failed')
        choice = data.get('choice')
        # Engine-side check: only ids allowed at this step are ever acted on.
        return choice if choice in {o.id for o in options} else None

    async def caller_lines(
        self,
        scenario: Scenario,
        s: SimulatorSession,
        node: ScenarioNode,
        *,
        user_text: str | None,
        mode: LineMode,
    ) -> list[str] | None:
        if not self.available or not node.caller_lines or not node.caller_goal:
            return None
        system = CALLER_SYSTEM_TEMPLATE.format(
            title=scenario.title,
            description=scenario.description,
            agent_name=scenario.caller.agent_name,
        )
        scripted = '\n'.join(f'- {line}' for line in node.caller_lines)
        if mode == 'clarify':
            task = (
                'The person’s reply didn’t really answer you. React to it briefly in character, '
                'then steer back to the same goal. Stay on this step.'
            )
        elif node.kind == 'ending':
            task = 'This is the end of the call from your side. Say one short closing line.'
        else:
            task = 'Write your next line(s) for this step.'
        user = (
            f'Conversation so far:\n{_render_conversation(s)}\n\n'
            + (f'The person just said: "{user_text}"\n\n' if user_text else '')
            + f'Current step goal: {node.caller_goal}\n'
            f'Scripted lines for this step (reference only; don’t copy them word for word):\n{scripted}\n\n'
            f'{task}'
        )
        schema = {
            'type': 'object',
            'properties': {'lines': {'type': 'array', 'items': {'type': 'string'}}},
            'required': ['lines'],
            'additionalProperties': False,
        }
        data = await self._structured(system, user, schema, max_tokens=2048)
        lines = [str(x).strip() for x in (data or {}).get('lines', []) if str(x).strip()][:2]
        if not lines or not all(caller_line_ok(line) for line in lines):
            if data is not None:
                log.warning('Model caller lines failed output checks; using scripted fallback')
            return None
        return lines


def _credentials_configured() -> bool:
    """Cheap check of the credential sources the SDK resolves (key, token, profile, WIF)."""
    env = ('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_PROFILE', 'ANTHROPIC_FEDERATION_RULE_ID')
    if any(os.environ.get(k) for k in env):
        return True
    config_home = os.environ.get('XDG_CONFIG_HOME') or os.path.expanduser('~/.config')
    return os.path.isdir(os.path.join(config_home, 'anthropic'))


def create_dialogue() -> Dialogue:
    """Uses Claude unless disabled by env, no credentials are configured, or the client fails."""
    if os.environ.get('SCAM_COACH_DIALOGUE', 'model').lower() == 'scripted':
        return ScriptedDialogue()
    if not _credentials_configured():
        log.warning('No Anthropic credentials found (set ANTHROPIC_API_KEY); using scripted caller')
        return ScriptedDialogue()
    try:
        client = AsyncAnthropic(
            timeout=anthropic.Timeout(20.0, connect=5.0),
            max_retries=1,
        )
    except Exception as e:  # missing credentials etc.
        log.warning('Model dialogue unavailable (%s); using scripted caller', e)
        return ScriptedDialogue()
    return ClaudeDialogue(
        client,
        model=os.environ.get('SCAM_COACH_MODEL', DEFAULT_MODEL),
        effort=os.environ.get('SCAM_COACH_EFFORT', DEFAULT_EFFORT),
    )
