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
    assert name_utc.startswith('account_security_sim_swap_') and name_utc.endswith('_transcript.txt')
    assert name_utc != name_ny
    assert '(UTC-05:00)' in format_transcript(sc, s, 300)
    assert '(UTC)' in format_transcript(sc, s, 0)


def test_finished_calls_are_saved_to_data_dir_without_a_download(tmp_path):
    svc = SimulatorService(ScriptedDialogue(), transcripts=tmp_path)
    app.state.simulator = svc
    with TestClient(app) as http:
        sid = http.post(
            '/simulator/sessions', json={'scenarioId': 'account-security-sim-swap', 'tzOffsetMin': 300}
        ).json()['sessionId']
        v = http.post(f'/simulator/sessions/{sid}/answer').json()
        assert v['transcriptFile'] is None and list(tmp_path.iterdir()) == []
        assert http.get(f'/simulator/sessions/{sid}/transcript.txt').status_code == 409  # not ended yet

        v = http.post(f'/simulator/sessions/{sid}/hangup').json()
        files = list(tmp_path.iterdir())
        assert len(files) == 1 and files[0].name.endswith('_transcript.txt')
        assert files[0].name.startswith('account_security_sim_swap_')
        assert v['transcriptFile'].endswith(files[0].name)
        saved = files[0].read_text(encoding='utf-8')
        assert '(You hung up)' in saved and '(UTC-05:00)' in saved

        # The app reads the saved file back; no attachment / save dialog.
        r = http.get(f'/simulator/sessions/{sid}/transcript.txt')
        assert r.status_code == 200 and r.text == saved
        assert r.headers['content-disposition'].startswith('inline;')
        assert not list(tmp_path.glob('*.tmp'))
        assert http.get('/simulator/sessions/nope/transcript.txt').status_code == 404


def test_declined_and_scripted_endings_are_saved_too(tmp_path):
    svc = SimulatorService(ScriptedDialogue(), transcripts=tmp_path)
    app.state.simulator = svc
    with TestClient(app) as http:
        a = http.post('/simulator/sessions', json={'scenarioId': 'tmobile-loyalty-discount'}).json()['sessionId']
        http.post(f'/simulator/sessions/{a}/decline')
        b = http.post('/simulator/sessions', json={'scenarioId': 'tmobile-loyalty-discount'}).json()['sessionId']
        http.post(f'/simulator/sessions/{b}/answer')
        for o in ['intro_verify', 'disc_hold_firm']:
            v = http.post(f'/simulator/sessions/{b}/choose', json={'optionId': o}).json()
        assert v['status'] == 'ended' and v['transcriptFile']
    assert len(list(tmp_path.glob('tmobile_loyalty_discount_*_transcript.txt'))) == 2


def test_unwritable_transcript_dir_does_not_break_the_call(tmp_path):
    blocker = tmp_path / 'not_a_dir'
    blocker.write_text('x')
    svc = SimulatorService(ScriptedDialogue(), transcripts=blocker / 'sub')
    app.state.simulator = svc
    with TestClient(app) as http:
        sid = http.post('/simulator/sessions', json={'scenarioId': 'account-security-sim-swap'}).json()['sessionId']
        http.post(f'/simulator/sessions/{sid}/answer')
        v = http.post(f'/simulator/sessions/{sid}/hangup').json()
        assert v['status'] == 'ended' and v['transcriptFile'] is None
        assert http.get(f'/simulator/sessions/{sid}/debrief').status_code == 200
        assert http.get(f'/simulator/sessions/{sid}/transcript.txt').status_code == 409
