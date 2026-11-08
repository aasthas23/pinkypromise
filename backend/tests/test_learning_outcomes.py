"""Fraud-cue identification (🚩 taps) and explicit learning outcomes."""

import itertools

from fastapi.testclient import TestClient

from app.main import app
from app.simulator import engine
from app.simulator.debrief import build_debrief
from app.simulator.dialogue import ScriptedDialogue
from app.simulator.scenarios import get_scenario
from app.simulator.service import SimulatorService
from app.simulator.transcript import format_transcript

_clock = itertools.count(50_000, 1_000)
SID = 'tmobile-support-rep'


def tick():
    return next(_clock)


def call(steps):
    """steps: option ids, or 'spot' to tap 🚩 on the current step."""
    sc = get_scenario(SID)
    s = engine.answer_call(sc, engine.create_session(sc, tick(), 'lo'), tick())
    for step in steps:
        s = engine.spot_red_flag(sc, s, tick()) if step == 'spot' else engine.choose_response(sc, s, step, tick())
    if s.status != 'ended':
        s = engine.hang_up(sc, s, tick())
    return sc, s


def outcomes(d):
    return {o.id: o.achieved for o in d.learning_outcomes}


def test_spotting_flags_the_current_steps_tactics():
    sc, s = call(['spot', 'intro_pp', 'spot', 'pp_mismatch'])
    d = build_debrief(sc, s)
    assert d.cues.spotted == ['unsolicited_contact', 'authority_claim', 'fear_of_loss', 'fake_verification_code', 'artificial_urgency']
    assert d.cues.missed == []
    assert outcomes(d) == {'spot_tactics': True, 'protect_info': True, 'verify_yourself': True}
    assert any(t.label == 'Flagged a red flag 🚩' and t.kind == 'info' for t in d.timeline)
    assert d.tally.protective == 2  # spotting is reported separately, not counted as a response


def test_repeated_taps_count_once_and_missed_cues_are_listed():
    sc, s = call(['spot', 'spot', 'intro_ok', 'id_give', 'code_disclose', 'pin_disclose'])
    d = build_debrief(sc, s)
    assert d.cues.spotted == ['unsolicited_contact', 'authority_claim', 'fear_of_loss']
    assert 'code_request' in d.cues.missed and 'personal_info_request' in d.cues.missed
    o = {x.id: x for x in d.learning_outcomes}
    # 3 of 6 meets the threshold (at least half), but the missed tactics are still named.
    assert o['spot_tactics'].achieved is True and 'Watch for:' in o['spot_tactics'].detail
    assert 'asking for a one-time code' in o['spot_tactics'].detail
    assert o['protect_info'].achieved is False and 'account PIN' in o['protect_info'].detail
    assert o['verify_yourself'].achieved is False


def test_no_taps_gives_a_clear_next_step():
    sc, s = call(['intro_verify', 'disc_hold_firm'])
    o = {x.id: x for x in build_debrief(sc, s).learning_outcomes}
    assert o['spot_tactics'].achieved is False and 'tap 🚩' in o['spot_tactics'].detail
    assert o['verify_yourself'].achieved is True


def test_declined_call_has_no_outcomes_practiced():
    sc = get_scenario(SID)
    s = engine.decline_call(sc, engine.create_session(sc, tick(), 'd'), tick())
    assert all(o.achieved is None for o in build_debrief(sc, s).learning_outcomes)


def test_spot_is_a_noop_unless_the_call_is_active():
    sc = get_scenario(SID)
    ringing = engine.create_session(sc, tick(), 'r')
    assert engine.spot_red_flag(sc, ringing, tick()) is ringing


def test_transcript_lists_outcomes_and_spotted_flags():
    sc, s = call(['spot', 'intro_pp', 'pp_mismatch'])
    text = format_transcript(sc, s)
    assert 'LEARNING OUTCOMES' in text and '[x] Achieved: Check through an official channel' in text
    assert 'RED FLAGS YOU SPOTTED' in text and 'You flagged 3 of 5 tactics' in text


def test_spot_endpoint_and_outcome_definitions_in_listing():
    app.state.simulator = SimulatorService(ScriptedDialogue())
    with TestClient(app) as http:
        listing = http.get('/simulator/scenarios').json()
        assert [o['id'] for o in listing[0]['learningOutcomes']] == ['spot_tactics', 'protect_info', 'verify_yourself']
        sid = http.post('/simulator/sessions', json={'scenarioId': SID}).json()['sessionId']
        assert http.post(f'/simulator/sessions/{sid}/spot').status_code == 200  # ringing: accepted, no-op
        http.post(f'/simulator/sessions/{sid}/answer')
        v = http.post(f'/simulator/sessions/{sid}/spot').json()
        assert v['status'] == 'active' and v['transcript'][-1]['speaker'] == 'caller'  # nothing added to the call
        http.post(f'/simulator/sessions/{sid}/hangup')
        d = http.get(f'/simulator/sessions/{sid}/debrief').json()
        assert d['cues']['spotted'] == ['unsolicited_contact', 'authority_claim', 'fear_of_loss']
        assert {o['id']: o['achieved'] for o in d['learningOutcomes']}['spot_tactics'] is True
