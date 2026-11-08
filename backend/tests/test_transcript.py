"""Transcript .txt generation."""

import itertools

from fastapi.testclient import TestClient

from app.main import app
from app.simulator import engine
from app.simulator.dialogue import ScriptedDialogue
from app.simulator.scenarios import get_scenario
from app.simulator.service import SimulatorService
from app.simulator.transcript import format_transcript, transcript_filename

_clock = itertools.count(1_700_000_000_000, 5_000)


def tick() -> int:
    return next(_clock)


def finished(scenario_id: str, options: list[str], user_text: str | None = None):
    sc = get_scenario(scenario_id)
    s = engine.create_session(sc, tick(), 'tx')
    s = engine.answer_call(sc, s, tick())
    for o in options:
        s = engine.choose_response(sc, s, o, tick(), user_text=user_text)
    if s.status != 'ended':
        s = engine.hang_up(sc, s, tick())
    return sc, s


def test_transcript_contents_for_robocall():
    sc, s = finished('amazon-suspicious-order', ['robo_press1', 'intro_give_email', 'ra_allow', 'gc_pay'])
    text = format_transcript(sc, s, tz_offset_min=0)
    assert text.startswith('SCAM COACH: SIMULATED CALL TRANSCRIPT')
    assert 'training simulation, not a real phone call' in text
    assert 'Recorded message (real robocall):' in text
    assert '(You pressed 1)' in text
    assert 'Kevin: Thank you for calling Amazon security department' in text
    assert 'Outcome:      The caller got what they asked for (Simulated' in text
    assert 'RED FLAGS IN THIS CALL' in text and 'Paying with gift cards' in text
    assert 'IF THIS HAPPENS IN A REAL CALL' in text
    assert 'Robocall Audio Dataset' in text
    assert '(Call ended.)' in text
    assert all(len(line) <= 78 for line in text.splitlines()), 'lines wrap at 78 chars'


def test_transcript_timestamps_are_relative_to_answer():
    sc, s = finished('account-security-sim-swap', ['intro_yes'])
    lines = format_transcript(sc, s).splitlines()
    stamps = [line[:6] for line in lines if line.startswith('[0:')]
    assert stamps[0] == '[0:00]'
    assert '[0:05]' in stamps  # first reply came one tick after answering


def test_transcript_uses_what_the_user_typed():
    sc, s = finished('account-security-sim-swap', ['intro_challenge'], user_text='who is this, really?')
    assert 'You: who is this, really?' in format_transcript(sc, s)


def test_declined_call_transcript():
    sc = get_scenario('ssa-suspension')
    s = engine.decline_call(sc, engine.create_session(sc, tick(), 'dec'), tick())
    text = format_transcript(sc, s)
    assert 'not answered' in text
    assert 'declined, so there was no conversation' in text


def test_filename_and_timezone():
    sc, s = finished('account-security-sim-swap', [])
    name_utc = transcript_filename(sc, s, 0)
    name_ny = transcript_filename(sc, s, 300)  # UTC-5
    assert name_utc.startswith('scam-coach_account-security-sim-swap_') and name_utc.endswith('.txt')
    assert name_utc != name_ny
    assert '(UTC-05:00)' in format_transcript(sc, s, 300)
    assert '(UTC)' in format_transcript(sc, s, 0)


def test_transcript_endpoint():
    app.state.simulator = SimulatorService(ScriptedDialogue())
    with TestClient(app) as http:
        sid = http.post('/simulator/sessions', json={'scenarioId': 'account-security-sim-swap'}).json()['sessionId']
        http.post(f'/simulator/sessions/{sid}/answer')
        assert http.get(f'/simulator/sessions/{sid}/transcript.txt').status_code == 409  # not ended yet
        http.post(f'/simulator/sessions/{sid}/hangup')
        r = http.get(f'/simulator/sessions/{sid}/transcript.txt', params={'tzOffsetMin': 300})
        assert r.status_code == 200
        assert r.headers['content-type'].startswith('text/plain')
        assert r.headers['cache-control'] == 'no-store'
        assert 'attachment; filename="scam-coach_account-security-sim-swap_' in r.headers['content-disposition']
        assert '(You hung up)' in r.text
        assert http.get('/simulator/sessions/nope/transcript.txt').status_code == 404
