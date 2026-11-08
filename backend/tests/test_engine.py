"""Engine and debrief tests (scripted lines, no model)."""

import itertools

import pytest

from app.simulator import engine
from app.simulator.debrief import build_debrief, compare_attempts
from app.simulator.models import DialogueNode, SimulatorSession
from app.simulator.scenarios import get_scenario, load_scenarios

_clock = itertools.count(1_000, 1_000)


def tick() -> int:
    return next(_clock)


def play(scenario_id: str, options: list[str], sid: str = 't', pick=engine.pick_first) -> SimulatorSession:
    sc = get_scenario(scenario_id)
    s = engine.create_session(sc, tick(), sid, pick)
    s = engine.answer_call(sc, s, tick())
    for o in options:
        s = engine.choose_response(sc, s, o, tick())
    return s


def types(s: SimulatorSession) -> list[str]:
    return [e.type for e in s.events]


SIM = 'account-security-sim-swap'
AMZ = 'amazon-suspicious-order'
SSA = 'ssa-suspension'


@pytest.mark.parametrize('sc', list(load_scenarios().values()), ids=lambda sc: sc.id)
def test_scenarios_are_well_formed(sc):
    assert engine.validate_scenario(sc) == []


@pytest.mark.parametrize('sc', list(load_scenarios().values()), ids=lambda sc: sc.id)
def test_every_node_reaches_an_ending(sc):
    def reaches_end(nid, seen):
        n = sc.nodes[nid]
        if n.kind == 'ending':
            return True
        if nid in seen:
            return False
        return any(reaches_end(o.next, seen | {nid}) for o in n.options)

    assert all(reaches_end(nid, frozenset()) for nid in sc.nodes)


def test_engine_does_not_mutate_input():
    sc = get_scenario(SIM)
    s = play(SIM, [])
    before = s.model_dump()
    engine.choose_response(sc, s, 'intro_yes', tick())
    engine.hang_up(sc, s, tick())
    assert s.model_dump() == before


def test_sim_swap_verification_path():
    s = play(SIM, ['intro_challenge', 'authority_verify', 'discourage_hold_firm'])
    assert s.ending_id == 'verified'
    assert 'independent_verification_requested' in types(s)
    assert 'dummy_code_disclosed' not in types(s)


def test_sim_swap_compliance_path():
    s = play(SIM, ['intro_yes', 'authority_panic', 'urgency_disclose', 'pin_disclose'])
    assert s.ending_id == 'exposed'
    assert any(t.speaker == 'sms' for t in s.transcript)
    d = build_debrief(get_scenario(SIM), s)
    assert d.key_behaviors.disclosed == ['a one-time code', 'an account PIN']
    assert d.recovery_steps


def test_sim_swap_refusal_and_recovery():
    assert play(SIM, ['intro_yes', 'authority_panic', 'urgency_refuse', 'pressure_refuse']).ending_id == 'refused'
    assert play(SIM, ['intro_yes', 'authority_panic', 'urgency_disclose', 'pin_stop']).ending_id == 'recovered'


def test_hang_up_ending_depends_on_disclosure():
    sc = get_scenario(SIM)
    assert engine.hang_up(sc, play(SIM, ['intro_yes']), tick()).ending_id == 'hung_up'
    late = engine.hang_up(sc, play(SIM, ['intro_yes', 'authority_panic', 'urgency_disclose']), tick())
    assert late.ending_id == 'hung_up_after_disclosure'


def test_decline():
    sc = get_scenario(SIM)
    s = engine.decline_call(sc, engine.create_session(sc, tick(), 'd'), tick())
    assert s.ending_id == 'declined'
    assert types(s) == ['call_presented', 'call_declined', 'call_ended']


def test_invalid_actions_are_noops():
    sc = get_scenario(SIM)
    ringing = engine.create_session(sc, tick(), 'r')
    assert engine.choose_response(sc, ringing, 'intro_yes', tick()) is ringing
    assert engine.hang_up(sc, ringing, tick()) is ringing
    active = play(SIM, [])
    assert engine.choose_response(sc, active, 'nope', tick()) is active
    assert engine.answer_call(sc, active, tick()) is active


def test_caller_lines_can_come_from_model():
    sc = get_scenario(SIM)
    s = engine.create_session(sc, tick(), 'm')
    s = engine.answer_call(sc, s, tick(), ['Model line.'], 'model')
    assert [(t.text, t.source) for t in s.transcript] == [('Model line.', 'model')]


def test_unclear_reply_stays_on_step():
    sc = get_scenario(SIM)
    s = play(SIM, [])
    s2 = engine.unclear_response(sc, s, 'what?', tick(), ['Sorry, the account holder?'], 'model')
    assert s2.current_node_id == s.current_node_id
    assert s2.unclear_streak == 1
    assert s2.transcript[-2].speaker == 'user' and s2.transcript[-1].text == 'Sorry, the account holder?'
    # The next real choice resets the streak.
    assert engine.choose_response(sc, s2, 'intro_yes', tick()).unclear_streak == 0


@pytest.mark.parametrize('sid', [AMZ, SSA])
def test_robocall_opens_with_real_recording_and_keypad(sid):
    sc = get_scenario(sid)
    last = lambda clips, _pool: clips[-1]  # noqa: E731
    s = play(sid, [], pick=last)
    first = s.transcript[0]
    assert first.clip_id == sc.recordings[-1].id and first.source == 'recording'
    node = engine.current_dialogue_node(sc, s)
    assert isinstance(node, DialogueNode) and not node.accepts_speech
    s = engine.choose_response(sc, s, 'robo_press1', tick())
    assert 'keypad_pressed' in types(s)
    assert s.transcript[-3].text == 'You pressed 1.' or any(t.text == 'You pressed 1.' for t in s.transcript)


def test_random_picker_avoids_last_clip():
    sc = get_scenario(AMZ)
    first = engine.create_session(sc, tick(), 'a', engine.random_picker())
    for i in range(20):
        nxt = engine.create_session(sc, tick(), f'b{i}', engine.random_picker(first.recording_ids))
        assert nxt.recording_ids['amazon_order'] != first.recording_ids['amazon_order']


def test_amazon_paths():
    exposed = play(AMZ, ['robo_press1', 'intro_give_email', 'ra_allow', 'gc_pay'])
    assert exposed.ending_id == 'exposed'
    d = build_debrief(get_scenario(AMZ), exposed)
    assert d.tally.risky == 4
    assert play(AMZ, ['robo_press1', 'intro_give_email', 'ra_allow', 'gc_refuse']).ending_id == 'recovered'
    assert play(AMZ, ['robo_check_app']).ending_id == 'verified_before_engaging'


def test_ssa_paths_and_comparison():
    sc = get_scenario(SSA)
    before = play(SSA, ['robo_press1', 'off_give_ssn', 'thr_pay'], 'p')
    after = play(SSA, ['robo_check_official'], 'q')
    assert before.ending_id == 'exposed' and after.ending_id == 'verified_before_engaging'
    diffs = compare_attempts(sc, before, after)
    assert 'worse' not in [d.direction for d in diffs]
    assert any('didn’t press anything' in d.text for d in diffs)


def test_debrief_quotes_what_the_user_typed():
    sc = get_scenario(SIM)
    s = play(SIM, [])
    s = engine.choose_response(sc, s, 'intro_challenge', tick(), user_text='who is this really?')
    s = engine.hang_up(sc, s, tick())
    d = build_debrief(sc, s)
    quoted = [t.quote for t in d.timeline if t.quote]
    assert quoted == ['who is this really?']
