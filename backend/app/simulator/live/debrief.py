"""Debrief for a live AI call, in the same shape as the scripted-call debrief.

The conversation was free-form, but the scoring is rule-based: it works only
from the fixed tactic / action labels assigned per turn (tactics.py), the 🚩
taps, and how the call ended.
"""

from ..debrief import (
    BEHAVIOR_KIND,
    CueReport,
    Debrief,
    KeyBehaviors,
    Tally,
    TimelineItem,
    _join,
    learning_outcomes,
)
from ..models import ScenarioEnding
from .models import LiveSession
from .scenarios import LiveScenario
from .tactics import DISCLOSURE_ACTIONS, DISCLOSURE_LABELS, SENSITIVE_TACTICS, TACTICS, USER_ACTIONS, red_flag

SAFER = [
    'Hang up and contact T-Mobile yourself through the T-Mobile app or the number on your bill. Never use a number or link the caller gives you.',
    'Ask the caller for their Pinky Promise code and check it in the app. A real T-Mobile employee can give you one; a scammer can’t pass the check.',
    'Never read out a one-time code or your account PIN. They’re for you to type in yourself.',
    'No real company asks you to pay a fee or deposit with a gift card, wire or crypto.',
]
RECOVERY = [
    'Contact T-Mobile right away through the app or the number on your bill. Say you may have shared a code or account details.',
    'Change your account PIN or passcode, and ask about turning on number-transfer (port-out) protection.',
    'Watch for a sudden loss of signal. If your phone shows “No service” unexpectedly, contact T-Mobile from another phone.',
    'If you paid with a gift card, contact the card company right away using the number on the card, and report it at ReportFraud.ftc.gov.',
]

PROTECTIVE = {a for a, (_, kind, _) in USER_ACTIONS.items() if kind == 'protective'}


def _ending(s: LiveSession, disclosed: list[str], protective_after: bool) -> ScenarioEnding:
    if s.end_reason == 'declined' or not s.answered_at_ms:
        return ScenarioEnding(id='declined', title='You declined the call', outcome='not_engaged',
                              summary='Not answering an unexpected call is a reasonable habit. Answer next time to practice the conversation.')
    if disclosed and (protective_after or s.end_reason == 'user_hang_up'):
        return ScenarioEnding(id='recovered', title='You stopped partway through', outcome='recovered',
                              summary=f'You shared {_join(disclosed)} (simulated), then pulled back before giving more. In real life, follow up with T-Mobile quickly.')
    if disclosed:
        return ScenarioEnding(id='exposed', title='The caller got what they were after', outcome='exposed',
                              summary=f'You shared {_join(disclosed)} (simulated). In a real call this could let someone take over your account or number. This was practice: the point is to spot the moves next time.')
    if s.end_reason == 'user_hang_up':
        return ScenarioEnding(id='hung_up', title='You hung up', outcome='protected', summary='You ended the call without sharing anything.')
    return ScenarioEnding(id='held_firm', title='You held firm', outcome='protected',
                          summary='The caller gave up without getting anything from you.')


def build_live_debrief(scenario: LiveScenario, s: LiveSession) -> Debrief:
    t0 = s.started_at_ms
    user_entries = [e for e in s.entries if e.speaker == 'user']
    actions = [a for e in user_entries for a in e.flags]
    disclosed = list(dict.fromkeys(DISCLOSURE_LABELS[a] for a in actions if a in DISCLOSURE_ACTIONS))
    last_disclosure = max((i for i, e in enumerate(user_entries) if set(e.flags) & DISCLOSURE_ACTIONS), default=-1)
    protective_after = any(set(e.flags) & PROTECTIVE for e in user_entries[last_disclosure + 1:]) if last_disclosure >= 0 else False

    # Timeline: every user turn, every 🚩 tap, and a hang-up.
    timeline: list[TimelineItem] = []
    if s.answered_at_ms:
        timeline.append(TimelineItem(id='answered', offset_ms=s.answered_at_ms - t0, label='Answered the call', kind='neutral'))
    events = [(e.at_ms, 'user', e) for e in user_entries] + [(sp.at_ms, 'spot', sp) for sp in s.spots]
    for at, kind, item in sorted(events, key=lambda x: x[0]):
        if kind == 'spot':
            timeline.append(TimelineItem(id=f'spot-{at}', offset_ms=at - t0, label='Flagged a red flag 🚩', kind='info'))
            continue
        acts = [a for a in item.flags if a in USER_ACTIONS]
        risky = [a for a in acts if USER_ACTIONS[a][1] == 'risky']
        safe = [a for a in acts if USER_ACTIONS[a][1] == 'protective']
        main = (risky or safe or acts or ['went_along'])[0]
        label, behavior, why = USER_ACTIONS[main]
        timeline.append(TimelineItem(
            id=item.id, offset_ms=at - t0, label=label, quote=item.text,
            kind='risky' if risky else 'protective' if safe else 'neutral', rationale=why,
        ))
    if s.end_reason == 'user_hang_up':
        timeline.append(TimelineItem(id='hangup', offset_ms=(s.ended_at_ms or t0) - t0, label='Hung up', kind='protective',
                                     rationale='Ending a call that is pressuring you is always an option.'))

    # Cues: tactics the caller used vs. the ones on lines the person flagged.
    # Every answered call opens with an unexpected contact, so that cue sits on the first caller line.
    caller_entries = [e for e in s.entries if e.speaker == 'caller']
    first_caller = caller_entries[0].id if caller_entries else None

    def line_tactics(e) -> list[str]:
        ts = [t for t in e.flags if t in TACTICS]
        return (['unsolicited_contact'] + ts) if e.id == first_caller else ts

    encountered = list(dict.fromkeys(t for e in caller_entries for t in line_tactics(e)))
    by_id = {e.id: e for e in caller_entries}
    flagged: set[str] = set()
    extra = 0
    for sp in s.spots:
        e = by_id.get(sp.entry_id)
        if e is None:
            continue
        ts = line_tactics(e)
        if not ts:
            extra += 1
        flagged.update(ts)
    cues = CueReport(
        encountered=encountered,
        spotted=[t for t in encountered if t in flagged],
        missed=[t for t in encountered if t not in flagged],
        extra_flags=extra,
    )

    sensitive_asked = bool(set(encountered) & SENSITIVE_TACTICS)
    k = KeyBehaviors(
        answered=bool(s.answered_at_ms),
        pressed_keypad=False,
        challenged_caller=bool({'challenged_caller', 'requested_caller_verification'} & set(actions)),
        verified_independently='verified_independently' in actions,
        protected_sensitive=(not disclosed) if sensitive_asked else None,
        disclosed=disclosed,
        hints_used=0,
    )
    ending = _ending(s, disclosed, protective_after)
    return Debrief(
        scenario_title=scenario.title,
        ending=ending,
        outcome=ending.outcome,
        duration_ms=(s.ended_at_ms or t0) - (s.answered_at_ms or t0),
        timeline=timeline,
        key_behaviors=k,
        tally=Tally(protective=sum(1 for t in timeline if t.kind == 'protective'),
                    risky=sum(1 for t in timeline if t.kind == 'risky')),
        red_flags=[red_flag(t) for t in encountered],
        takeaways=[],
        safer_alternatives=SAFER,
        recovery_steps=RECOVERY if disclosed else [],
        provenance=(
            f'The caller’s lines were written live by AI ({s.model_label}) and voiced by AI, using patterns from '
            f'{len(s.grounding_ids)} real FTC robocall transcripts ({", ".join(s.grounding_ids)}) adapted to a '
            'fictional T-Mobile scenario. The caller, numbers and details are fictional.'
        ),
        used_model=True,
        cues=cues,
        learning_outcomes=learning_outcomes(lambda f: TACTICS[f][0], k, cues),
    )


__all__ = ['build_live_debrief', 'BEHAVIOR_KIND']
