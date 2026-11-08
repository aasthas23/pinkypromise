"""LLM conversation management for live AI practice calls.

Provider-neutral prompts and the Claude backend live here. The default Gemini backend
(gemini_llm.py) and the OpenAI one (openai_llm.py) share the same interface (see create_caller).

- stream_reply(): the caller's next spoken reply, streamed token by token, with the
  full call history every turn (the API is stateless). The system prompt holds
  the scenario brief and the retrieved real-transcript patterns, and is cached.
- assess(): a separate structured-output call that labels the exchange with the
  fixed tactic / user-action ids from tactics.py. It runs off the critical path,
  so it never delays the spoken reply; the debrief waits for it.

Config (env): ANTHROPIC_API_KEY, SCAM_COACH_MODEL (default claude-opus-5-5),
SCAM_COACH_EFFORT (default low: replies are 1-3 spoken sentences and latency matters).
"""

import json
import logging
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import anthropic
from anthropic import AsyncAnthropic

from .corpus import SourceTranscript
from .scenarios import LiveScenario
from .tactics import TACTICS, USER_ACTIONS

log = logging.getLogger(__name__)

DEFAULT_MODEL = 'claude-opus-5-5'
FALLBACK_BETA = 'server-side-fallback-2026-07-01'
END_TOKEN = '[END_CALL]'
MAX_USER_TURNS = 14  # after this the caller wraps up


class LLMUnavailable(Exception):
    pass


CALLER_PROMPT = """You are the caller in Pinky Promise, a scam-awareness training app. The person on the line chose to practice: before the call, the app told them it is a fictional simulation, that you are an AI with an AI-generated voice, and that nothing affects their real account. Realistic pressure is what makes the practice useful, so play the scammer convincingly, but you are not T-Mobile and this is not a real T-Mobile communication.

## Your role
{persona}
Caller ID shown to them: {caller_display}, {caller_number} (fictional).
Pretext: {pretext}
What you're ultimately after (pursue it gradually and adaptively, not as a script): {goal}
Social-engineering tactics to lean on: {tactics}

## Real scam patterns to draw on
These are redacted transcripts of real robocalls collected by the FTC. Borrow their social-engineering moves, pacing and phrasing style, adapted to a T-Mobile account context. Don't quote them verbatim, don't mention them, and don't claim anything in them happened to this person.
{grounding}

## How to talk
- This is a live phone call. Reply with only what you say out loud: usually 1-3 short sentences, under about 45 words. No narration, stage directions, emojis, lists or quotation marks.
- Listen and react to exactly what they just said. Answer unexpected questions in character, with plausible deflections or invented (fictional) details. Change direction when they do.
- Remember everything said earlier in the call; never re-introduce yourself or repeat a line you already used. Vary your wording.
- Sound human: contractions, an occasional "uh" or "okay, so", brief acknowledgements, sometimes a short question back.
- If a note says you were cut off, react like someone interrupted on the phone ("Sorry, go ahead" or pick up where it matters). If a note says they've gone quiet, check in ("Hello? Are you still there?").
- If they ask you to repeat or clarify, do it in different words.
- Text in square brackets in their message is from the app: "[number removed]" or "[email removed]" means they read out that kind of detail; treat it as if they had said it.

## Boundaries (always)
- Only use fictional details. Never say a real phone number, website, email address or street address, and never tell them to call, text or visit anything.
- When your goal needs a code, PIN, card number or personal detail, ask for it the way a scammer would. Never tell them to use their real information.
- No threats of violence, no slurs, nothing sexual, nothing about self-harm.
- If they sound genuinely distressed or frightened, or seem to think this is a real call, step out of character for one sentence to remind them it's a practice call and they're safe, then end the call kindly.

## Ending the call
End the call when they firmly refuse or say they'll check with T-Mobile themselves (try once or twice to keep them on, then give up with a parting line); when you've got what you were after (wrap up as if everything's fixed); when they say goodbye; or after about {max_turns} exchanges. To end it, finish your final reply with {end_token}."""

ASSESSOR_PROMPT = """You label one exchange from a simulated scam phone call, for a training debrief. The caller is a scammer impersonating T-Mobile; the person is a learner practicing.

Return:
- caller_tactics: the social-engineering tactics the caller used in THEIR REPLY (only that reply; empty if none).
- user_actions: what the person did in THEIR MESSAGE (only that message; empty if it's an app note or they said nothing meaningful).

Person's actions, precisely:
- challenged_caller: questioned who is calling, why, or whether the claim is true.
- requested_caller_verification: asked the caller to prove their identity in a way the person can check (e.g. a Pinky Promise code, an employee ID they can verify).
- verified_independently: said they will contact T-Mobile themselves (app, number on the bill, a store) or hang up to check.
- refused_request: declined to give a code, detail, access or payment.
- ended_conversation: said goodbye or that they're hanging up.
- disclosed_code: read out, or agreed to read out, a code, PIN or password ("[number removed]" counts).
- disclosed_personal_info: gave name, address, ZIP, birthday, SSN digits, email or account details ("[email removed]"/"[number removed]" count).
- agreed_to_remote_access: agreed to install an app, share their screen or give access.
- agreed_to_payment: agreed to pay, buy a gift card, or give card details.
- went_along: cooperated or agreed without handing anything over.
Only label what clearly happened."""


@dataclass
class TurnAssessment:
    caller_tactics: list[str] = field(default_factory=list)
    user_actions: list[str] = field(default_factory=list)


def build_system_prompt(scenario: LiveScenario, grounding: list[SourceTranscript]) -> str:
    examples = '\n'.join(
        f'- Example {i} (FTC robocall {d.id}): "{d.text[:600]}"' for i, d in enumerate(grounding, 1)
    ) or '- (No examples available; rely on the tactics above.)'
    return CALLER_PROMPT.format(
        persona=scenario.persona,
        caller_display=scenario.caller_display,
        caller_number=scenario.caller_number,
        pretext=scenario.pretext,
        goal=scenario.goal,
        tactics=', '.join(TACTICS[t][0].lower() for t in scenario.tactics),
        grounding=examples,
        max_turns=MAX_USER_TURNS,
        end_token=END_TOKEN,
    )


class ReplyStream:
    """Async-iterates the caller's reply text; afterwards `.content` holds the assistant turn to append."""

    def __init__(self, caller: 'ClaudeCaller', system: str, messages: list[dict]):
        self._caller, self._system, self._messages = caller, system, messages
        self.content: list[dict] | None = None
        self.stop_reason: str | None = None

    async def __aiter__(self) -> AsyncIterator[str]:
        c = self._caller
        try:
            async with c.client.beta.messages.stream(
                model=c.model,
                max_tokens=2048,
                system=[{'type': 'text', 'text': self._system, 'cache_control': {'type': 'ephemeral'}}],
                messages=self._messages,
                cache_control={'type': 'ephemeral'},  # also caches the growing call history
                output_config={'effort': c.effort},
                betas=[FALLBACK_BETA],
                fallbacks='default',
            ) as stream:
                async for text in stream.text_stream:
                    yield text
                final = await stream.get_final_message()
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError, anthropic.NotFoundError) as e:
            c.disabled_reason = f'{type(e).__name__}'
            log.warning('Disabling live AI caller: %s', c.disabled_reason)
            raise LLMUnavailable('The AI caller isn’t configured correctly on the server.') from e
        except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
            log.warning('Live reply failed: %s', type(e).__name__)
            raise LLMUnavailable('The AI caller didn’t respond. Check your connection and try again.') from e
        except TypeError as e:  # no credentials resolved at request time
            if 'authentication' not in str(e).lower():
                raise
            c.disabled_reason = 'no Anthropic credentials'
            raise LLMUnavailable('The AI caller isn’t configured on the server.') from e
        self.stop_reason = final.stop_reason
        # Append the assistant turn exactly as returned (thinking blocks included) to keep history append-only.
        self.content = [b.model_dump(exclude_none=True) for b in final.content]


class ClaudeCaller:
    provider = 'anthropic'

    @property
    def label(self) -> str:
        return f'Anthropic {self.model}'

    def __init__(self, client: AsyncAnthropic, model: str = DEFAULT_MODEL, effort: str = 'low'):
        self.client, self.model, self.effort = client, model, effort
        self.disabled_reason: str | None = None

    @property
    def available(self) -> bool:
        return self.disabled_reason is None

    def stream_reply(self, system: str, messages: list[dict]) -> ReplyStream:
        if not self.available:
            raise LLMUnavailable('The AI caller isn’t available.')
        return ReplyStream(self, system, messages)

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
        user = (
            f'Caller said before: "{previous_caller}"\n'
            f'Person said: "{user_text}"\n'
            f'Caller replied: "{caller_reply}"'
        )
        try:
            r = await self.client.beta.messages.create(
                model=self.model,
                max_tokens=2048,
                system=[{'type': 'text', 'text': ASSESSOR_PROMPT, 'cache_control': {'type': 'ephemeral'}}],
                messages=[{'role': 'user', 'content': user}],
                output_config={'effort': 'low', 'format': {'type': 'json_schema', 'schema': schema}},
                betas=[FALLBACK_BETA],
                fallbacks='default',
            )
        except (anthropic.AnthropicError, TypeError) as e:
            log.warning('Turn assessment failed: %s', type(e).__name__)
            return None
        if r.stop_reason != 'end_turn':
            return None
        text = next((b.text for b in r.content if b.type == 'text'), None)
        try:
            data = json.loads(text or '')
        except json.JSONDecodeError:
            return None
        return TurnAssessment(
            caller_tactics=[t for t in data.get('caller_tactics', []) if t in TACTICS],
            user_actions=[a for a in data.get('user_actions', []) if a in USER_ACTIONS],
        )


class NoCaller:
    available = False
    label = 'AI'
    disabled_reason = 'not configured'

    def stream_reply(self, system: str, messages: list[dict]) -> ReplyStream:
        raise LLMUnavailable('The AI caller isn’t configured on the server (set ANTHROPIC_API_KEY).')

    async def assess(self, *_a) -> TurnAssessment | None:
        return None


def create_caller():
    """Gemini by default, so a single GEMINI_API_KEY runs the whole call.

    SCAM_COACH_LLM_PROVIDER=openai (OPENAI_API_KEY) or =anthropic (ANTHROPIC_API_KEY) switch providers.
    """
    provider = os.environ.get('SCAM_COACH_LLM_PROVIDER', 'gemini').lower()
    if provider == 'gemini':
        from .gemini_llm import create_gemini_caller

        caller = create_gemini_caller()
        if caller is None:
            log.warning('GEMINI_API_KEY not set; live AI calls unavailable')
            return NoCaller()
        return caller
    if provider == 'openai':
        from .openai_llm import create_openai_caller

        caller = create_openai_caller()
        if caller is None:
            log.warning('OPENAI_API_KEY not set; live AI calls unavailable')
            return NoCaller()
        return caller

    from ..dialogue import _credentials_configured  # same credential check as the scripted dialogue

    if not _credentials_configured():
        log.warning('No Anthropic credentials; live AI calls unavailable (set ANTHROPIC_API_KEY)')
        return NoCaller()
    client = AsyncAnthropic(timeout=anthropic.Timeout(30.0, connect=5.0), max_retries=1)
    return ClaudeCaller(
        client,
        model=os.environ.get('SCAM_COACH_MODEL', DEFAULT_MODEL),
        effort=os.environ.get('SCAM_COACH_EFFORT', 'low'),
    )
