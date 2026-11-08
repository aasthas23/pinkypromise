"""Paths through the T-Mobile practice scenarios used by the web app."""

import itertools

import pytest

from app.simulator import engine
from app.simulator.debrief import build_debrief
from app.simulator.scenarios import get_scenario

_clock = itertools.count(10_000, 1_000)
DISCOUNT, SUPPORT, PORT_OUT = 'tmobile-loyalty-discount', 'tmobile-support-rep', 'account-security-sim-swap'


def play(sid, options):
    sc = get_scenario(sid)
    s = engine.answer_call(sc, engine.create_session(sc, next(_clock), 't'), next(_clock))
    for o in options:
        s = engine.choose_response(sc, s, o, next(_clock))
    return sc, s


@pytest.mark.parametrize('sid', [DISCOUNT, SUPPORT, PORT_OUT])
def test_all_web_app_scenarios_are_t_mobile_themed(sid):
    sc = get_scenario(sid)
    assert 'T-Mobile' in ' '.join(sc.nodes[sc.start_node_id].caller_lines)


@pytest.mark.parametrize(
    'sid,path,ending',
    [
        (DISCOUNT, ['intro_verify', 'disc_hold_firm'], 'verified'),
        (DISCOUNT, ['intro_challenge', 'proof_refuse'], 'refused'),
        (DISCOUNT, ['intro_interested', 'urg_disclose', 'fee_pay'], 'exposed'),
        (DISCOUNT, ['intro_interested', 'urg_disclose', 'fee_refuse'], 'recovered'),
        (DISCOUNT, ['intro_interested', 'urg_refuse', 'pr_refuse'], 'refused'),
        (SUPPORT, ['intro_pp', 'pp_mismatch'], 'verified'),
        (SUPPORT, ['intro_ok', 'id_give', 'code_disclose', 'pin_disclose'], 'exposed'),
        (SUPPORT, ['intro_ok', 'id_give', 'code_refuse', 'pr_refuse'], 'recovered'),
        (SUPPORT, ['intro_ok', 'id_challenge', 'pp_accept', 'code_refuse', 'pr_verify'], 'verified'),
        (SUPPORT, ['intro_verify', 'disc_hold_firm'], 'verified'),
    ],
)
def test_paths(sid, path, ending):
    _, s = play(sid, path)
    assert s.status == 'ended'
    assert s.ending_id == ending


def test_support_rep_pinky_promise_check_is_protective():
    sc, s = play(SUPPORT, ['intro_pp', 'pp_mismatch'])
    d = build_debrief(sc, s)
    assert d.key_behaviors.challenged_caller and d.key_behaviors.verified_independently
    assert 'fake_verification_code' in s.red_flags_seen
    assert d.tally.risky == 0


def test_caller_lines_are_tagged_with_tactics():
    _, s = play(DISCOUNT, ['intro_interested'])
    tagged = [(t.text[:20], t.flags) for t in s.transcript if t.flags]
    # Only the last caller line of each step carries that step's flags.
    assert tagged[0][1] == ['unsolicited_contact', 'too_good_offer']
    assert tagged[1][1] == ['code_request', 'artificial_urgency']
    assert all(t.flags == [] for t in s.transcript if t.speaker != 'caller')
