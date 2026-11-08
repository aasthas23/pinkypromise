"""Plain-text transcript of a finished live AI call (same layout as the scripted-call transcripts)."""

from ..debrief import Debrief
from ..transcript import KIND_LABEL, OUTCOME_LABEL, WIDTH, _clock, _duration, _local, _section, _utc_label, _wrap
from .models import LiveSession
from .scenarios import LiveScenario


def live_transcript_filename(scenario: LiveScenario, s: LiveSession) -> str:
    """snake_case like the project's data files, e.g. tmobile_sim_swap_20261108_142233_ab12cd_transcript.txt"""
    stamp = _local(s.started_at_ms, s.tz_offset_min).strftime('%Y%m%d_%H%M%S')
    return f'{scenario.id.replace("-", "_")}_{stamp}_{s.session_id[-6:]}_transcript.txt'


def format_live_transcript(scenario: LiveScenario, s: LiveSession, d: Debrief) -> str:
    started = _local(s.started_at_ms, s.tz_offset_min)
    t0 = s.answered_at_ms or s.started_at_ms
    out = [
        'SCAM COACH: SIMULATED CALL TRANSCRIPT',
        '=' * WIDTH,
        *_wrap('', 'This was a training simulation, not a real phone call and not a T-Mobile communication. '
                   'The caller was an AI with an AI-generated voice; every name and number is fictional.'),
        '',
    ]
    for label, value in [
        ('Scenario', scenario.title),
        ('Date', f'{started.strftime("%Y-%m-%d %H:%M")} ({_utc_label(started)})'),
        ('Caller ID', f'{scenario.caller_display}, {scenario.caller_number} (fictional)'),
        ('Call length', _duration(d.duration_ms) if d.key_behaviors.answered else 'not answered'),
        ('Outcome', f'{d.ending.title} ({OUTCOME_LABEL[d.outcome]})'),
        ('Caller lines', f'written live by AI ({s.model_label}) and voiced by AI.'),
        ('Grounding', f'patterns from {len(s.grounding_ids)} real FTC robocall transcripts: {", ".join(s.grounding_ids)}.'),
    ]:
        out += _wrap(f'{label + ":":<14}', value)

    out += _section('Transcript')
    if not s.entries:
        out.append('(The call was declined, so there was no conversation.)')
    name = scenario.agent_name
    for e in s.entries:
        stamp = f'[{_clock(e.at_ms - t0)}] '
        if e.speaker == 'caller':
            out += _wrap(stamp + f'{name}: ', e.text + (' [interrupted]' if e.interrupted else ''))
        elif e.speaker == 'user':
            out += _wrap(stamp + 'You: ', e.text)
        else:
            out += _wrap(stamp, f'({e.text.rstrip(".")})')
    out.append(f'[{_clock((s.ended_at_ms or t0) - t0)}] (Call ended.)')

    if d.learning_outcomes:
        out += _section('Learning outcomes')
        mark = {True: '[x] Achieved', False: '[ ] Practice next', None: '[-] Not practiced'}
        for o in d.learning_outcomes:
            out += _wrap(f'{mark[o.achieved]}: ', o.title)
            out += _wrap('        ', o.detail)
    if d.cues and d.cues.encountered:
        out += _section('Red flags you spotted')
        out.append(f'You flagged {len(d.cues.spotted)} of {len(d.cues.encountered)} tactics the caller used.')
        titles = {f.id: f.title for f in d.red_flags}
        for f in d.cues.encountered:
            out += _wrap(f'{"[x]" if f in d.cues.spotted else "[ ]"} ', titles.get(f, f))
    if d.timeline:
        out += _section('What you did')
        ring = t0 - s.started_at_ms
        for item in d.timeline:
            off = item.offset_ms - ring
            out += _wrap(f'[{_clock(off)}] ' if off >= 0 else '[ring] ', f'{item.label} ({KIND_LABEL[item.kind]})')
            if item.rationale:
                out += _wrap('        ', item.rationale)
    if d.recovery_steps:
        out += _section('If this happens in a real call')
        for i, step in enumerate(d.recovery_steps, 1):
            out += _wrap(f'{i}. ', step)
    out += _section('Safer habits')
    for tip in d.safer_alternatives:
        out += _wrap('- ', tip)
    out += _section('Notes')
    out += _wrap('- ', 'Numbers and email addresses you typed or said were removed before being used or saved. '
                       'Your voice recordings were transcribed and not kept.')
    out += _wrap('- ', 'Source transcripts: Robocall Audio Dataset (Prasad and Reaves, NC State, 2023), collected by the FTC; public domain.')
    return '\n'.join(out) + '\n'
