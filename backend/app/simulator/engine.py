"""Deterministic scenario state machine.

Every function takes a session and returns a new one; the input is never
mutated. Invalid actions (wrong status, unknown option) return the session
unchanged, so stray client calls can't corrupt state.

Which step comes next is decided only here, from scenario data. The caller's
wording for a step is passed in (from the model or the scripted fallback). When
none is given, the node's scripted lines are used.
"""

import random
from collections.abc import Callable

from .models import (
    DISCLOSURE_EVENTS,
    DialogueNode,
    RecordingClip,
    Scenario,
    ScenarioNode,
    SimulatorEvent,
    SimulatorSession,
    TranscriptEntry,
)

ClipPicker = Callable[[list[RecordingClip], str], RecordingClip]
LineSource = str  # 'model' | 'scripted'


def pick_first(clips: list[RecordingClip], _pool: str) -> RecordingClip:
    return clips[0]


def random_picker(avoid: dict[str, str] | None = None) -> ClipPicker:
    """Random clip per pool, avoiding the clip used last time when possible."""

    def pick(clips: list[RecordingClip], pool: str) -> RecordingClip:
        fresh = [c for c in clips if not avoid or c.id != avoid.get(pool)]
        return random.choice(fresh or clips)

    return pick


# ---------------------------------------------------------------- helpers


def get_node(scenario: Scenario, node_id: str) -> ScenarioNode:
    node = scenario.nodes.get(node_id)
    if node is None:
        raise KeyError(f'Scenario {scenario.id} has no node {node_id!r}')
    return node


def current_dialogue_node(scenario: Scenario, s: SimulatorSession) -> DialogueNode | None:
    if s.status != 'active':
        return None
    node = get_node(scenario, s.current_node_id)
    return node if isinstance(node, DialogueNode) else None


def has_event(s: SimulatorSession, type_: str) -> bool:
    return any(e.type == type_ for e in s.events)


def has_disclosed(s: SimulatorSession) -> bool:
    return any(e.type in DISCLOSURE_EVENTS for e in s.events)


def get_clip(scenario: Scenario, s: SimulatorSession, pool: str) -> RecordingClip | None:
    clip_id = s.recording_ids.get(pool)
    return next((c for c in scenario.recordings if c.id == clip_id), None)


def _copy(s: SimulatorSession) -> SimulatorSession:
    return s.model_copy(deep=True)


def _event(s: SimulatorSession, type_: str, now: int, **details) -> None:
    s.seq += 1
    s.events.append(
        SimulatorEvent(
            id=f'{s.session_id}-e{s.seq}',
            scenario_id=s.scenario_id,
            timestamp_ms=now,
            type=type_,
            **details,
        )
    )


def _say(s: SimulatorSession, speaker: str, text: str, now: int, **extra) -> None:
    s.seq += 1
    s.transcript.append(
        TranscriptEntry(id=f'{s.session_id}-t{s.seq}', speaker=speaker, text=text, at_ms=now, **extra)
    )


def _add_caller_lines(s: SimulatorSession, lines: list[str], source: LineSource, now: int) -> None:
    for line in lines:
        _say(s, 'caller', line, now, source=source)


def _enter(
    scenario: Scenario,
    s: SimulatorSession,
    node_id: str,
    now: int,
    caller_lines: list[str] | None,
    source: LineSource,
) -> None:
    """Moves into a node: recording, caller lines, SMS, red flags, and ending if terminal."""
    node = get_node(scenario, node_id)
    s.current_node_id = node_id
    s.visited_node_ids.append(node_id)
    s.unclear_streak = 0

    first_new = len(s.transcript)
    if node.recording_pool:
        clip = get_clip(scenario, s, node.recording_pool)
        if clip:
            _say(s, 'caller', clip.transcript, now, clip_id=clip.id, source='recording')

    if caller_lines is None:
        _add_caller_lines(s, node.caller_lines, 'scripted', now)
    else:
        _add_caller_lines(s, caller_lines, source, now)

    if node.sms:
        _say(s, 'sms', node.sms.body, now, sender=node.sms.sender)

    # Tag the step's last caller line with the tactics it used, for highlighting.
    caller_lines_added = [t for t in s.transcript[first_new:] if t.speaker == 'caller']
    if caller_lines_added and node.red_flags:
        caller_lines_added[-1].flags = list(node.red_flags)

    for flag in node.red_flags:
        if flag not in s.red_flags_seen:
            s.red_flags_seen.append(flag)

    if node.kind == 'ending':
        ending_id = (
            node.ending_id_if_disclosed
            if node.ending_id_if_disclosed and has_disclosed(s)
            else node.ending_id
        )
        _finish(s, ending_id, now, 'scenario_ending')


def _finish(s: SimulatorSession, ending_id: str, now: int, ended_by: str) -> None:
    _event(s, 'call_ended', now, ended_by=ended_by, node_id=s.current_node_id)
    s.status = 'ended'
    s.ending_id = ending_id
    s.ended_at_ms = now


# ---------------------------------------------------------------- transitions


def create_session(
    scenario: Scenario,
    now: int,
    session_id: str,
    pick_clip: ClipPicker = pick_first,
) -> SimulatorSession:
    recording_ids: dict[str, str] = {}
    for pool in dict.fromkeys(c.pool for c in scenario.recordings):
        clips = [c for c in scenario.recordings if c.pool == pool]
        recording_ids[pool] = pick_clip(clips, pool).id
    s = SimulatorSession(
        session_id=session_id,
        scenario_id=scenario.id,
        status='ringing',
        current_node_id=scenario.start_node_id,
        started_at_ms=now,
        recording_ids=recording_ids,
    )
    _event(s, 'call_presented', now)
    return s


def answer_call(
    scenario: Scenario,
    s: SimulatorSession,
    now: int,
    caller_lines: list[str] | None = None,
    source: LineSource = 'scripted',
) -> SimulatorSession:
    if s.status != 'ringing':
        return s
    s = _copy(s)
    _event(s, 'call_answered', now)
    s.status = 'active'
    s.answered_at_ms = now
    _enter(scenario, s, scenario.start_node_id, now, caller_lines, source)
    return s


def decline_call(scenario: Scenario, s: SimulatorSession, now: int) -> SimulatorSession:
    if s.status != 'ringing':
        return s
    s = _copy(s)
    _event(s, 'call_declined', now)
    _finish(s, scenario.control_endings.declined, now, 'declined')
    return s


def next_node_id(scenario: Scenario, s: SimulatorSession, option_id: str) -> str | None:
    """Where an option leads, or None if it isn't allowed right now."""
    node = current_dialogue_node(scenario, s)
    option = next((o for o in node.options if o.id == option_id), None) if node else None
    return option.next if option else None


def choose_response(
    scenario: Scenario,
    s: SimulatorSession,
    option_id: str,
    now: int,
    *,
    user_text: str | None = None,
    caller_lines: list[str] | None = None,
    source: LineSource = 'scripted',
) -> SimulatorSession:
    """Applies an allowed option. `user_text` is what the user actually typed, if free text."""
    node = current_dialogue_node(scenario, s)
    option = next((o for o in node.options if o.id == option_id), None) if node else None
    if not node or not option:
        return s
    s = _copy(s)
    _event(s, 'response_selected', now, phase=node.phase, node_id=node.id, option_id=option.id)
    for type_ in option.events:
        _event(s, type_, now, phase=node.phase, node_id=node.id)
    if option.keypad:
        _event(s, 'keypad_pressed', now, phase=node.phase, node_id=node.id)
        _say(s, 'system', f'You pressed {option.keypad}.', now)
    else:
        _say(s, 'user', user_text or option.label, now)
    _enter(scenario, s, option.next, now, caller_lines, source)
    return s


def unclear_response(
    scenario: Scenario,
    s: SimulatorSession,
    user_text: str,
    now: int,
    caller_lines: list[str],
    source: LineSource,
) -> SimulatorSession:
    """Free text that didn't match any allowed option: the caller reacts, the step stays."""
    node = current_dialogue_node(scenario, s)
    if not node or not node.accepts_speech:
        return s
    s = _copy(s)
    _event(s, 'free_text_unclear', now, phase=node.phase, node_id=node.id)
    _say(s, 'user', user_text, now)
    _add_caller_lines(s, caller_lines, source, now)
    s.unclear_streak += 1
    return s


def hang_up(scenario: Scenario, s: SimulatorSession, now: int) -> SimulatorSession:
    if s.status != 'active':
        return s
    s = _copy(s)
    ending = (
        scenario.control_endings.hung_up_after_disclosure
        if has_disclosed(s)
        else scenario.control_endings.hung_up_safe
    )
    _say(s, 'system', 'You hung up.', now)
    _finish(s, ending, now, 'user_hang_up')
    return s


def request_hint(
    scenario: Scenario, s: SimulatorSession, now: int
) -> tuple[SimulatorSession, str | None]:
    node = current_dialogue_node(scenario, s)
    if not node or not node.hint:
        return s, None
    s = _copy(s)
    _event(s, 'hint_requested', now, phase=node.phase, node_id=node.id)
    return s, node.hint


def spot_red_flag(scenario: Scenario, s: SimulatorSession, now: int) -> SimulatorSession:
    """The user flagged the current step as suspicious (fraud-cue identification).

    Recorded against the step whose caller lines are on screen. No feedback is
    given until the debrief, so the call doesn't hand out answers mid-way.
    """
    if s.status != 'active':
        return s
    node = get_node(scenario, s.current_node_id)
    s = _copy(s)
    _event(s, 'red_flag_spotted', now, phase=node.phase, node_id=node.id)
    return s


def validate_scenario(scenario: Scenario) -> list[str]:
    problems: list[str] = []
    if scenario.start_node_id not in scenario.nodes:
        problems.append(f'missing start node {scenario.start_node_id}')
    pools = {c.pool for c in scenario.recordings}
    for node in scenario.nodes.values():
        if node.recording_pool and node.recording_pool not in pools:
            problems.append(f'{node.id}: no recordings in pool {node.recording_pool}')
        for flag in node.red_flags:
            if flag not in scenario.red_flags:
                problems.append(f'{node.id}: unknown red flag {flag}')
        if node.caller_lines and not node.caller_goal:
            problems.append(f'{node.id}: has caller lines but no callerGoal for the model')
        if isinstance(node, DialogueNode):
            if not node.options:
                problems.append(f'{node.id}: no options')
            for o in node.options:
                if o.next not in scenario.nodes:
                    problems.append(f'{node.id}/{o.id}: unknown next {o.next}')
        else:
            for eid in (node.ending_id, node.ending_id_if_disclosed):
                if eid and eid not in scenario.endings:
                    problems.append(f'{node.id}: unknown ending {eid}')
    for eid in (
        scenario.control_endings.declined,
        scenario.control_endings.hung_up_safe,
        scenario.control_endings.hung_up_after_disclosure,
    ):
        if eid not in scenario.endings:
            problems.append(f'control ending {eid} missing')
    return problems
