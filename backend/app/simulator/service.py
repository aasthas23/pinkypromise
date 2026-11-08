"""Runs simulator sessions: deterministic engine + model-written dialogue.

Sessions live only in memory and expire after SESSION_TTL_S. Nothing is
written to disk or logged with transcript content.
"""

import asyncio
import secrets
import time
from collections import OrderedDict

from . import engine
from .debrief import Debrief, build_debrief
from .dialogue import Dialogue, DialogueUnavailable, LineMode
from .models import (
    CallerInfo,
    CamelModel,
    DialogueNode,
    Scenario,
    ScenarioPhase,
    SimulatorSession,
    TranscriptEntry,
)
from .safety import redact_user_text
from .transcript import format_transcript, transcript_filename
from .scenarios import get_scenario, load_scenarios

SESSION_TTL_S = 30 * 60
MAX_SESSIONS = 1000


class SessionNotFound(Exception):
    pass


class InvalidAction(Exception):
    pass


# ---------------------------------------------------------------- views sent to the app


class ScenarioSummary(CamelModel):
    id: str
    title: str
    description: str
    difficulty: str
    estimated_minutes: int
    learning_objectives: list[str]
    caller: CallerInfo
    provenance: str | None
    has_recording: bool


class OptionView(CamelModel):
    """Only what the app needs to render a choice: no destination, behavior or rationale."""

    id: str
    label: str
    keypad: str | None = None


class NodeView(CamelModel):
    id: str
    phase: ScenarioPhase
    accepts_speech: bool
    options: list[OptionView]
    has_hint: bool


class SessionView(CamelModel):
    session_id: str
    scenario_id: str
    status: str
    transcript: list[TranscriptEntry]
    node: NodeView | None
    ending_id: str | None
    answered_at_ms: int | None
    free_text_available: bool
    notice: str | None = None


def summarize(sc: Scenario) -> ScenarioSummary:
    return ScenarioSummary(
        id=sc.id,
        title=sc.title,
        description=sc.description,
        difficulty=sc.difficulty,
        estimated_minutes=sc.estimated_minutes,
        learning_objectives=sc.learning_objectives,
        caller=sc.caller,
        provenance=sc.provenance,
        has_recording=bool(sc.recordings),
    )


def _now() -> int:
    return int(time.time() * 1000)


class SimulatorService:
    def __init__(self, dialogue: Dialogue):
        self.dialogue = dialogue
        self._sessions: OrderedDict[str, tuple[SimulatorSession, float]] = OrderedDict()
        self._locks: dict[str, asyncio.Lock] = {}

    # ------------------------------------------------------------ storage

    def _evict(self) -> None:
        cutoff = time.monotonic() - SESSION_TTL_S
        for sid in [sid for sid, (_, t) in self._sessions.items() if t < cutoff]:
            self._drop(sid)
        while len(self._sessions) > MAX_SESSIONS:
            self._drop(next(iter(self._sessions)))

    def _drop(self, sid: str) -> None:
        self._sessions.pop(sid, None)
        self._locks.pop(sid, None)

    def _get(self, sid: str) -> tuple[Scenario, SimulatorSession]:
        entry = self._sessions.get(sid)
        if not entry:
            raise SessionNotFound(sid)
        s = entry[0]
        self._sessions[sid] = (s, time.monotonic())
        self._sessions.move_to_end(sid)
        scenario = get_scenario(s.scenario_id)
        assert scenario is not None
        return scenario, s

    def _put(self, s: SimulatorSession) -> None:
        self._sessions[s.session_id] = (s, time.monotonic())
        self._sessions.move_to_end(s.session_id)

    def _lock(self, sid: str) -> asyncio.Lock:
        return self._locks.setdefault(sid, asyncio.Lock())

    def delete(self, sid: str) -> None:
        self._drop(sid)

    def _ended_meanwhile(self, sid: str) -> SimulatorSession | None:
        """Hang-up skips the lock, so after awaiting the model, check it didn't end the call."""
        entry = self._sessions.get(sid)
        if entry is None:
            raise SessionNotFound(sid)
        return entry[0] if entry[0].status == 'ended' else None

    # ------------------------------------------------------------ views

    def view(self, scenario: Scenario, s: SimulatorSession, notice: str | None = None) -> SessionView:
        node = engine.current_dialogue_node(scenario, s)
        return SessionView(
            session_id=s.session_id,
            scenario_id=s.scenario_id,
            status=s.status,
            transcript=s.transcript,
            node=(
                NodeView(
                    id=node.id,
                    phase=node.phase,
                    accepts_speech=node.accepts_speech,
                    options=[OptionView(id=o.id, label=o.label, keypad=o.keypad) for o in node.options],
                    has_hint=bool(node.hint),
                )
                if node
                else None
            ),
            ending_id=s.ending_id,
            answered_at_ms=s.answered_at_ms,
            free_text_available=self.dialogue.available and bool(node and node.accepts_speech),
            notice=notice,
        )

    # ------------------------------------------------------------ dialogue helper

    async def _lines_for(
        self,
        scenario: Scenario,
        s: SimulatorSession,
        node_id: str,
        user_text: str | None,
        mode: LineMode = 'enter',
    ) -> tuple[list[str] | None, str]:
        node = engine.get_node(scenario, node_id)
        if not node.caller_lines:
            return None, 'scripted'
        lines = await self.dialogue.caller_lines(scenario, s, node, user_text=user_text, mode=mode)
        return (lines, 'model') if lines else (None, 'scripted')

    # ------------------------------------------------------------ actions

    def list_scenarios(self) -> list[ScenarioSummary]:
        return [summarize(sc) for sc in load_scenarios().values()]

    def start(self, scenario_id: str, previous_session_id: str | None = None) -> SessionView:
        scenario = get_scenario(scenario_id)
        if not scenario:
            raise SessionNotFound(scenario_id)
        self._evict()
        previous = self._sessions.get(previous_session_id or '')
        avoid = previous[0].recording_ids if previous else None
        s = engine.create_session(
            scenario, _now(), f's{secrets.token_hex(8)}', engine.random_picker(avoid)
        )
        self._put(s)
        return self.view(scenario, s)

    async def answer(self, sid: str) -> SessionView:
        async with self._lock(sid):
            scenario, s = self._get(sid)
            if s.status != 'ringing':
                raise InvalidAction('call is not ringing')
            lines, source = await self._lines_for(scenario, s, scenario.start_node_id, None)
            if ended := self._ended_meanwhile(sid):
                return self.view(scenario, ended)
            s = engine.answer_call(scenario, s, _now(), lines, source)
            self._put(s)
            return self.view(scenario, s)

    async def decline(self, sid: str) -> SessionView:
        async with self._lock(sid):
            scenario, s = self._get(sid)
            s = engine.decline_call(scenario, s, _now())
            self._put(s)
            return self.view(scenario, s)

    async def choose(self, sid: str, option_id: str) -> SessionView:
        async with self._lock(sid):
            scenario, s = self._get(sid)
            node = engine.current_dialogue_node(scenario, s)
            option = next((o for o in node.options if o.id == option_id), None) if node else None
            if not option:
                raise InvalidAction('that response is not available right now')
            said = None if option.keypad else option.label
            lines, source = await self._lines_for(scenario, s, option.next, said)
            if ended := self._ended_meanwhile(sid):
                return self.view(scenario, ended)
            s = engine.choose_response(
                scenario, s, option_id, _now(), caller_lines=lines, source=source
            )
            self._put(s)
            return self.view(scenario, s)

    async def say(self, sid: str, text: str) -> SessionView:
        """Free-text reply: classify into an allowed option, or let the caller react and stay."""
        async with self._lock(sid):
            scenario, s = self._get(sid)
            node = engine.current_dialogue_node(scenario, s)
            if not node or not node.accepts_speech:
                raise InvalidAction('free-text replies are not available right now')
            said = redact_user_text(text)
            if not said:
                raise InvalidAction('empty reply')
            try:
                option_id = await self.dialogue.classify(scenario, s, node, said)
            except DialogueUnavailable:
                return self.view(
                    scenario,
                    s,
                    notice='The AI caller is unavailable right now, so typed replies can’t be understood. Pick one of the suggested replies instead.',
                )

            if ended := self._ended_meanwhile(sid):
                return self.view(scenario, ended)

            if option_id:
                target = next(o for o in node.options if o.id == option_id).next
                lines, source = await self._lines_for(scenario, s, target, said)
                if ended := self._ended_meanwhile(sid):
                    return self.view(scenario, ended)
                s = engine.choose_response(
                    scenario, s, option_id, _now(), user_text=said, caller_lines=lines, source=source
                )
            else:
                lines, source = await self._lines_for(scenario, s, node.id, said, mode='clarify')
                if ended := self._ended_meanwhile(sid):
                    return self.view(scenario, ended)
                if not lines:
                    lines = ['Sorry, I didn’t catch that.', node.caller_lines[-1]] if node.caller_lines else ['Sorry?']
                s = engine.unclear_response(scenario, s, said, _now(), lines, source)
            self._put(s)
            notice = (
                'Not sure how to read that one. You can rephrase it or tap a suggested reply.'
                if s.unclear_streak >= 2
                else None
            )
            return self.view(scenario, s, notice=notice)

    async def hang_up(self, sid: str) -> SessionView:
        # Deliberately not under the session lock: hanging up must be instant even
        # while a model call for this session is in flight. Locked actions check
        # _ended_meanwhile() after every await and discard their result.
        scenario, s = self._get(sid)
        s = engine.hang_up(scenario, s, _now())
        self._put(s)
        return self.view(scenario, s)

    async def hint(self, sid: str) -> tuple[SessionView, str | None]:
        async with self._lock(sid):
            scenario, s = self._get(sid)
            s, hint = engine.request_hint(scenario, s, _now())
            self._put(s)
            return self.view(scenario, s), hint

    def debrief(self, sid: str, previous_session_id: str | None = None) -> Debrief:
        scenario, s = self._get(sid)
        if s.status != 'ended':
            raise InvalidAction('the call has not ended yet')
        previous = None
        if previous_session_id and previous_session_id != sid:
            entry = self._sessions.get(previous_session_id)
            if entry and entry[0].scenario_id == s.scenario_id and entry[0].status == 'ended':
                previous = entry[0]
        return build_debrief(scenario, s, previous)

    def transcript(self, sid: str, tz_offset_min: int | None = None) -> tuple[str, str]:
        """(filename, text) for a finished call. Built on demand; never written to disk."""
        scenario, s = self._get(sid)
        if s.status != 'ended':
            raise InvalidAction('the call has not ended yet')
        return (
            transcript_filename(scenario, s, tz_offset_min),
            format_transcript(scenario, s, tz_offset_min),
        )
