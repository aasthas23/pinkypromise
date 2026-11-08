"""Plain-text transcript of a finished simulated call.

Built on request from the in-memory session; the server never writes it to
disk. The app saves the returned text as a .txt file on the user's device.
"""

import textwrap
from datetime import datetime, timedelta, timezone

from .debrief import build_debrief
from .models import Scenario, SimulatorSession

WIDTH = 78
OUTCOME_LABEL = {
    'protected': 'Nothing shared',
    'recovered': 'Partly shared, then stopped',
    'exposed': 'Simulated information shared',
    'not_engaged': 'Call not answered',
}
KIND_LABEL = {'protective': 'Protective', 'risky': 'Risky', 'neutral': 'Neutral', 'info': 'Hint'}
SOURCE_LABEL = {
    'recording': 'a real robocall recording',
    'model': 'written by AI (Claude) within the scenario’s fixed steps',
    'scripted': 'scripted',
}


def _clock(ms: int) -> str:
    s = max(0, round(ms / 1000))
    return f'{s // 60}:{s % 60:02d}'


def _duration(ms: int) -> str:
    s = max(0, round(ms / 1000))
    return f'{s}s' if s < 60 else f'{s // 60}m {s % 60:02d}s'


def _local(ms: int, tz_offset_min: int | None) -> datetime:
    """tz_offset_min follows JS Date.getTimezoneOffset(): minutes *behind* UTC."""
    tz = timezone(-timedelta(minutes=tz_offset_min)) if tz_offset_min is not None else timezone.utc
    return datetime.fromtimestamp(ms / 1000, tz)


def _utc_label(dt: datetime) -> str:
    z = dt.strftime('%z')  # e.g. -0500
    return 'UTC' if z in ('', '+0000') else f'UTC{z[:3]}:{z[3:]}'


def _wrap(prefix: str, text: str, hang: int | None = None) -> list[str]:
    """Wraps at WIDTH. Continuation lines align with the text after a short prefix; after a
    long one (e.g. "[0:05] Officer Davis: ") they align under the timestamp instead."""
    if hang is None:
        hang = len(prefix) if len(prefix) <= 16 else len('[0:00] ')
    return textwrap.wrap(
        text,
        width=WIDTH,
        initial_indent=prefix,
        subsequent_indent=' ' * hang,
        break_on_hyphens=False,
    ) or [prefix.rstrip()]


def _section(title: str) -> list[str]:
    return ['', title.upper(), '-' * len(title)]


def transcript_filename(scenario: Scenario, s: SimulatorSession, tz_offset_min: int | None = None) -> str:
    stamp = _local(s.started_at_ms, tz_offset_min).strftime('%Y%m%d-%H%M%S')
    return f'scam-coach_{scenario.id}_{stamp}.txt'


def format_transcript(
    scenario: Scenario, s: SimulatorSession, tz_offset_min: int | None = None
) -> str:
    if s.status != 'ended':
        raise ValueError('Transcript requires an ended session')
    debrief = build_debrief(scenario, s)
    started = _local(s.started_at_ms, tz_offset_min)
    t0 = s.answered_at_ms or s.started_at_ms
    sources = [SOURCE_LABEL[src] for src in ('recording', 'model', 'scripted')
               if any(t.source == src for t in s.transcript)]

    out: list[str] = [
        'SCAM COACH: SIMULATED CALL TRANSCRIPT',
        '=' * WIDTH,
        *_wrap('', 'This was a training simulation, not a real phone call. No real accounts, '
                   'codes or payments were involved, and every name and number is fictional.'),
        '',
    ]
    fields = [
        ('Scenario', scenario.title),
        ('Date', f'{started.strftime("%Y-%m-%d %H:%M")} ({_utc_label(started)})'),
        ('Caller ID', f'{scenario.caller.display_name}, {scenario.caller.display_number} (fictional)'),
        ('Call length', _duration(debrief.duration_ms) if debrief.key_behaviors.answered else 'not answered'),
        ('Outcome', f'{debrief.ending.title} ({OUTCOME_LABEL[debrief.outcome]})'),
    ]
    for label, value in fields:
        out += _wrap(f'{label + ":":<14}', value)
    if sources:
        out += _wrap(f'{"Caller lines:":<14}', '; '.join(sources) + '.')

    out += _section('Transcript')
    if not s.transcript:
        out.append('(The call was declined, so there was no conversation.)')
    for t in s.transcript:
        stamp = f'[{_clock((t.at_ms or t0) - t0)}] '
        if t.speaker == 'caller' and t.clip_id:
            out += _wrap(stamp + 'Recorded message (real robocall): ', f'“{t.text}”')
        elif t.speaker == 'caller':
            out += _wrap(stamp + f'{scenario.caller.agent_name}: ', t.text)
        elif t.speaker == 'user':
            out += _wrap(stamp + 'You: ', t.text)
        elif t.speaker == 'sms':
            out += _wrap(stamp + f'Text message from {t.sender}: ', t.text)
        else:
            out += _wrap(stamp, f'({t.text.rstrip(".")})')
    out.append(f'[{_clock((s.ended_at_ms or t0) - t0)}] (Call ended.)')

    if debrief.timeline:
        out += _section('What you did')
        # Debrief offsets count from when the phone rang; the transcript counts from answering.
        ring_ms = t0 - s.started_at_ms
        for item in debrief.timeline:
            offset = item.offset_ms - ring_ms
            stamp = f'[{_clock(offset)}] ' if offset >= 0 else '[ring] '
            out += _wrap(stamp, f'{item.label} ({KIND_LABEL[item.kind]})')
            if item.rationale:
                out += _wrap('        ', item.rationale)

    if debrief.red_flags:
        out += _section('Red flags in this call')
        for f in debrief.red_flags:
            out += _wrap('- ', f'{f.title}: {f.explanation}')

    if debrief.recovery_steps:
        out += _section('If this happens in a real call')
        for i, step in enumerate(debrief.recovery_steps, 1):
            out += _wrap(f'{i}. ', step)

    out += _section('Safer habits')
    for tip in debrief.safer_alternatives:
        out += _wrap('- ', tip)

    out += _section('Notes')
    out += _wrap('- ', 'Numbers and email addresses you typed were removed before being used or saved.')
    if debrief.recording:
        out += _wrap(
            '- ',
            f'Opening recording: {debrief.recording.dataset_file.rsplit("/", 1)[-1]} from the Robocall '
            'Audio Dataset (Prasad and Reaves, NC State, 2023), collected by the FTC; public domain.',
        )
    out += _wrap('- ', 'Scam Coach is a training prototype and isn’t affiliated with any carrier, company or agency.')
    return '\n'.join(out) + '\n'
