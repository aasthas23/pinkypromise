"""Builds a debrief from a finished session's event log.

Kept separate:
- observed: what the user actually did (timeline, key behaviors)
- interpretation: hedged, supportive guidance built from those observations
There is no numeric "fraud detection" score. The tally only counts responses
by the documented rubric in BEHAVIOR_KIND. Nothing here comes from the model.
"""

from typing import Literal

from .engine import has_event
from .models import (
    DISCLOSURE_EVENTS,
    CamelModel,
    DialogueNode,
    Outcome,
    RecordingClip,
    RedFlag,
    Scenario,
    ScenarioEnding,
    SimulatorSession,
)

TimelineKind = Literal['protective', 'risky', 'neutral', 'info']

BEHAVIOR_KIND: dict[str, TimelineKind] = {
    'verify': 'protective',
    'refuse': 'protective',
    'challenge': 'protective',
    'comply': 'risky',
    'neutral': 'neutral',
}

SENSITIVE_REQUEST_FLAGS = {
    'code_request',
    'personal_info_request',
    'remote_access_request',
    'gift_card_payment',
}

DISCLOSURE_LABELS = {
    'dummy_code_disclosed': 'a one-time code',
    'dummy_pin_disclosed': 'an account PIN',
    'dummy_personal_info_disclosed': 'personal details',
    'simulated_remote_access_allowed': 'remote access to your device',
    'simulated_payment_made': 'gift card numbers',
}

BEHAVIOR_LABEL = {
    'verify': 'Chose to verify independently',
    'refuse': 'Refused the request',
    'challenge': 'Questioned the caller',
    'comply': 'Went along with the request',
    'neutral': 'Kept talking',
}


class TimelineItem(CamelModel):
    id: str
    offset_ms: int
    label: str
    quote: str | None = None
    kind: TimelineKind
    rationale: str | None = None


class KeyBehaviors(CamelModel):
    answered: bool
    pressed_keypad: bool
    challenged_caller: bool
    verified_independently: bool
    protected_sensitive: bool | None
    disclosed: list[str]
    hints_used: int


class Tally(CamelModel):
    protective: int
    risky: int


class AttemptDifference(CamelModel):
    text: str
    direction: Literal['better', 'worse', 'same']


class CueReport(CamelModel):
    """Fraud-cue identification: which of the tactics the caller used the user flagged."""

    encountered: list[str]
    spotted: list[str]
    missed: list[str]
    # Taps on steps where the caller used no red flag.
    extra_flags: int = 0


class LearningOutcome(CamelModel):
    id: str
    title: str
    description: str
    # None when the call never reached the point where this could be practiced.
    achieved: bool | None
    detail: str


# The same three outcomes for every scenario, shown before the call and assessed after it.
LEARNING_OUTCOMES = [
    ('spot_tactics', 'Spot the scam tactics', 'Notice the tricks a scammer uses, like urgency, fear or a too-good offer, and flag them with 🚩.'),
    ('protect_info', 'Keep codes and personal details private', 'Don’t share one-time codes, PINs, personal details or payments with a caller.'),
    ('verify_yourself', 'Check through an official channel', 'Say you’ll contact the company yourself, using its app or the number on your bill.'),
]


class OutcomeDefinition(CamelModel):
    id: str
    title: str
    description: str


def outcome_definitions() -> list[OutcomeDefinition]:
    return [OutcomeDefinition(id=i, title=t, description=d) for i, t, d in LEARNING_OUTCOMES]


class Debrief(CamelModel):
    scenario_title: str
    ending: ScenarioEnding
    outcome: Outcome
    duration_ms: int
    timeline: list[TimelineItem]
    key_behaviors: KeyBehaviors
    tally: Tally
    red_flags: list[RedFlag]
    takeaways: list[str]
    safer_alternatives: list[str]
    recovery_steps: list[str]
    provenance: str | None = None
    recording: RecordingClip | None = None
    used_model: bool = False
    comparison: list[AttemptDifference] = []
    cues: CueReport | None = None
    learning_outcomes: list[LearningOutcome] = []


def key_behaviors(scenario: Scenario, s: SimulatorSession) -> KeyBehaviors:
    disclosed = list(
        dict.fromkeys(
            DISCLOSURE_LABELS.get(e.type, e.type) for e in s.events if e.type in DISCLOSURE_EVENTS
        )
    )
    sensitive_requested = any(
        set(scenario.nodes[nid].red_flags) & SENSITIVE_REQUEST_FLAGS
        for nid in s.visited_node_ids
        if nid in scenario.nodes
    )
    return KeyBehaviors(
        answered=has_event(s, 'call_answered'),
        pressed_keypad=has_event(s, 'keypad_pressed'),
        challenged_caller=has_event(s, 'caller_challenged'),
        verified_independently=has_event(s, 'independent_verification_requested'),
        protected_sensitive=(not disclosed) if sensitive_requested else None,
        disclosed=disclosed,
        hints_used=sum(1 for e in s.events if e.type == 'hint_requested'),
    )


def _timeline(scenario: Scenario, s: SimulatorSession) -> list[TimelineItem]:
    items: list[TimelineItem] = []
    t0 = s.started_at_ms
    # Map each response_selected event to the user's words in the transcript, in order.
    user_quotes = iter(t.text for t in s.transcript if t.speaker == 'user')
    for e in s.events:
        offset = e.timestamp_ms - t0
        if e.type == 'call_answered':
            items.append(TimelineItem(id=e.id, offset_ms=offset, label='Answered the call', kind='neutral'))
        elif e.type == 'call_declined':
            items.append(TimelineItem(id=e.id, offset_ms=offset, label='Declined the call', kind='neutral'))
        elif e.type == 'free_text_unclear':
            quote = next(user_quotes, None)
            items.append(
                TimelineItem(id=e.id, offset_ms=offset, label='Said something else', quote=quote, kind='neutral')
            )
        elif e.type == 'response_selected':
            node = scenario.nodes.get(e.node_id or '')
            option = (
                next((o for o in node.options if o.id == e.option_id), None)
                if isinstance(node, DialogueNode)
                else None
            )
            if not option:
                continue
            quote = None if option.keypad else next(user_quotes, option.label)
            items.append(
                TimelineItem(
                    id=e.id,
                    offset_ms=offset,
                    label=(
                        f'Pressed {option.keypad} on the robocall menu'
                        if option.keypad
                        else BEHAVIOR_LABEL[option.behavior]
                    ),
                    quote=quote,
                    kind=BEHAVIOR_KIND[option.behavior],
                    rationale=option.rationale,
                )
            )
        elif e.type == 'red_flag_spotted':
            items.append(TimelineItem(id=e.id, offset_ms=offset, label='Flagged a red flag 🚩', kind='info'))
        elif e.type == 'hint_requested':
            items.append(TimelineItem(id=e.id, offset_ms=offset, label='Asked for a training hint', kind='info'))
        elif e.type == 'call_ended' and e.ended_by == 'user_hang_up':
            items.append(
                TimelineItem(
                    id=e.id,
                    offset_ms=offset,
                    label='Hung up',
                    kind='protective',
                    rationale='Ending a call that is pressuring you is always an option.',
                )
            )
    return items


def cue_report(scenario: Scenario, s: SimulatorSession) -> CueReport:
    encountered = [f for f in s.red_flags_seen if f in scenario.red_flags]
    spotted: list[str] = []
    extra = 0
    for e in s.events:
        if e.type != 'red_flag_spotted':
            continue
        node_flags = scenario.nodes[e.node_id].red_flags if e.node_id in scenario.nodes else []
        if not node_flags:
            extra += 1
        spotted += [f for f in node_flags if f not in spotted]
    spotted = [f for f in encountered if f in spotted]  # keep call order
    return CueReport(
        encountered=encountered,
        spotted=spotted,
        missed=[f for f in encountered if f not in spotted],
        extra_flags=extra,
    )


def learning_outcomes(scenario: Scenario, k: KeyBehaviors, cues: CueReport) -> list[LearningOutcome]:
    titles = {i: (t, d) for i, t, d in LEARNING_OUTCOMES}

    def outcome(id_: str, achieved: bool | None, detail: str) -> LearningOutcome:
        return LearningOutcome(id=id_, title=titles[id_][0], description=titles[id_][1], achieved=achieved, detail=detail)

    if not k.answered:
        skipped = 'You didn’t answer, so there was nothing to practice this time.'
        return [outcome(i, None, skipped) for i, _, _ in LEARNING_OUTCOMES]

    names = lambda ids: _join([scenario.red_flags[f].title.lower() for f in ids]) if ids else ''  # noqa: E731
    n, got = len(cues.encountered), len(cues.spotted)
    if n == 0:
        spot = outcome('spot_tactics', None, 'The call ended before the caller used any tactics.')
    elif got * 2 >= n:
        spot = outcome('spot_tactics', True, f'You flagged {got} of {n} tactics the caller used.'
                       + (f' Watch for: {names(cues.missed)}.' if cues.missed else ''))
    elif got:
        spot = outcome('spot_tactics', False, f'You flagged {got} of {n} tactics. You missed: {names(cues.missed)}.')
    else:
        spot = outcome('spot_tactics', False, f'You didn’t flag any of the {n} tactics. Next time, tap 🚩 when something feels off.')

    if k.disclosed:
        protect = outcome('protect_info', False, f'You shared {_join(k.disclosed)} (simulated). Real callers can use these to take over an account.')
    elif k.protected_sensitive:
        protect = outcome('protect_info', True, 'The caller asked for something sensitive, and you didn’t hand it over.')
    else:
        protect = outcome('protect_info', True, 'You didn’t share anything sensitive.')

    if k.verified_independently:
        verify = outcome('verify_yourself', True, 'You chose to check with the company yourself instead of trusting the caller.')
    else:
        verify = outcome('verify_yourself', False, 'Next time, say “I’ll check through the official app or the number on my bill,” then hang up.')
    return [spot, protect, verify]


def _join(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def _takeaways(k: KeyBehaviors, outcome: Outcome) -> list[str]:
    if not k.answered:
        return [
            'You didn’t answer. That’s a reasonable habit for unexpected calls. To practice the conversation itself, try answering next time.'
        ]
    out: list[str] = []
    if k.verified_independently:
        out.append('You chose to check with the company or agency yourself instead of trusting the caller. That habit works for almost any scam call.')
    else:
        out.append('You didn’t try an independent callback this time. Next time, try “I’ll call back on the official number.” It works whatever story the caller tells.')
    if k.pressed_keypad:
        out.append('You pressed a key on a recorded message. With real robocalls, pressing anything connects you to a live scammer and confirms your number is active. Hanging up is safer.')
    if k.challenged_caller:
        out.append('You questioned who was calling instead of accepting the claim.')
    if k.protected_sensitive is True:
        out.append('You didn’t hand over anything sensitive, even when the caller asked for it.')
    if k.disclosed and outcome == 'recovered':
        out.append(f'You shared {_join(k.disclosed)} (simulated), then stopped before giving more. Noticing partway and stopping really does matter.')
    if k.disclosed and outcome == 'exposed':
        out.append(f'The caller’s pressure led to sharing {_join(k.disclosed)} (simulated). These tactics work on lots of people. Spotting them is the skill to practice.')
    if k.hints_used:
        out.append(f'You used {k.hints_used} training hint{"s" if k.hints_used > 1 else ""}. Try the scenario again without hints to see what sticks.')
    if outcome == 'protected' and not k.verified_independently:
        out.append('After hanging up on a call like this, it’s worth checking your account through the official app or website, just to be sure.')
    return out


def build_debrief(
    scenario: Scenario, s: SimulatorSession, previous: SimulatorSession | None = None
) -> Debrief:
    if s.status != 'ended' or not s.ending_id:
        raise ValueError('Debrief requires an ended session')
    ending = scenario.endings[s.ending_id]
    timeline = _timeline(scenario, s)
    k = key_behaviors(scenario, s)
    cues = cue_report(scenario, s)
    recording = next(
        (c for c in scenario.recordings if c.id in s.recording_ids.values()), None
    )
    return Debrief(
        scenario_title=scenario.title,
        ending=ending,
        outcome=ending.outcome,
        duration_ms=(s.ended_at_ms or s.started_at_ms) - (s.answered_at_ms or s.started_at_ms),
        timeline=timeline,
        key_behaviors=k,
        tally=Tally(
            protective=sum(1 for t in timeline if t.kind == 'protective'),
            risky=sum(1 for t in timeline if t.kind == 'risky'),
        ),
        red_flags=[scenario.red_flags[f] for f in s.red_flags_seen if f in scenario.red_flags],
        takeaways=_takeaways(k, ending.outcome),
        safer_alternatives=scenario.safer_alternatives,
        recovery_steps=scenario.recovery_steps if k.disclosed else [],
        provenance=scenario.provenance,
        recording=recording,
        used_model=any(t.source == 'model' for t in s.transcript),
        comparison=compare_attempts(scenario, previous, s) if previous else [],
        cues=cues,
        learning_outcomes=learning_outcomes(scenario, k, cues),
    )


def compare_attempts(
    scenario: Scenario, previous: SimulatorSession, current: SimulatorSession
) -> list[AttemptDifference]:
    """Compares observable behaviors only. Not a claim about real-world safety."""
    a, b = key_behaviors(scenario, previous), key_behaviors(scenario, current)
    diffs: list[AttemptDifference] = []

    def flag(before: bool, after: bool, gained: str, lost: str, good_when_true: bool = True) -> None:
        if before == after:
            return
        improved = after if good_when_true else not after
        diffs.append(AttemptDifference(text=gained if after else lost, direction='better' if improved else 'worse'))

    flag(a.verified_independently, b.verified_independently, 'This time you chose to verify independently.', 'Last time you chose to verify independently. This time you didn’t.')
    flag(a.challenged_caller, b.challenged_caller, 'This time you questioned the caller.', 'Last time you questioned the caller. This time you didn’t.')
    flag(a.pressed_keypad, b.pressed_keypad, 'This time you pressed a key on the robocall menu.', 'This time you didn’t press anything on the robocall menu.', False)
    flag(bool(a.disclosed), bool(b.disclosed), 'This time you shared simulated information. Last time you didn’t.', 'This time you didn’t share anything sensitive.', False)
    if a.disclosed and b.disclosed and len(a.disclosed) != len(b.disclosed):
        fewer = len(b.disclosed) < len(a.disclosed)
        diffs.append(AttemptDifference(
            text=f'You shared {"less" if fewer else "more"} than last time ({len(b.disclosed)} vs {len(a.disclosed)} items).',
            direction='better' if fewer else 'worse',
        ))
    ca, cb = cue_report(scenario, previous), cue_report(scenario, current)
    if len(ca.spotted) != len(cb.spotted):
        more = len(cb.spotted) > len(ca.spotted)
        diffs.append(AttemptDifference(
            text=f'Red flags you spotted: {len(ca.spotted)} → {len(cb.spotted)}.',
            direction='better' if more else 'worse',
        ))
    if a.hints_used != b.hints_used:
        diffs.append(AttemptDifference(
            text=f'Hints used: {a.hints_used} → {b.hints_used}.',
            direction='better' if b.hints_used < a.hints_used else 'same',
        ))
    return diffs or [AttemptDifference(text='Your key choices matched your last attempt.', direction='same')]
