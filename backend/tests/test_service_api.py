"""Service + HTTP tests with a fake model, plus the scripted-fallback path."""

import json
import re
from types import SimpleNamespace

import anthropic
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.simulator.dialogue import ClaudeDialogue, ScriptedDialogue
from app.simulator.safety import caller_line_ok, redact_user_text
from app.simulator.scenarios import load_scenarios
from app.simulator.service import SimulatorService

SIM = 'account-security-sim-swap'
AMZ = 'amazon-suspicious-order'


# ---------------------------------------------------------------- fake Anthropic client


class FakeMessages:
    """Stands in for client.beta.messages. Replies are queued per call type."""

    def __init__(self):
        self.classify_replies: list[str] = []
        self.line_replies: list[list[str]] = []
        self.calls: list[dict] = []
        self.raise_error: Exception | None = None
        self.stop_reason = 'end_turn'

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.raise_error:
            raise self.raise_error
        props = kwargs['output_config']['format']['schema']['properties']
        if 'choice' in props:
            payload = {'choice': self.classify_replies.pop(0) if self.classify_replies else 'unclear'}
        else:
            payload = {'lines': self.line_replies.pop(0) if self.line_replies else ['Model says hi.']}
        return SimpleNamespace(
            stop_reason=self.stop_reason,
            content=[SimpleNamespace(type='thinking', thinking=''), SimpleNamespace(type='text', text=json.dumps(payload))],
        )


def make_client():
    fake = FakeMessages()
    client = SimpleNamespace(beta=SimpleNamespace(messages=fake))
    return client, fake


@pytest.fixture
def model_api():
    client, fake = make_client()
    app.state.simulator = SimulatorService(ClaudeDialogue(client, model='claude-opus-5-5', effort='low'))
    with TestClient(app) as http:
        yield http, fake


@pytest.fixture
def scripted_api():
    app.state.simulator = SimulatorService(ScriptedDialogue())
    with TestClient(app) as http:
        yield http


def start(http, scenario_id=SIM, previous=None):
    r = http.post('/simulator/sessions', json={'scenarioId': scenario_id, 'previousSessionId': previous})
    assert r.status_code == 200, r.text
    return r.json()['sessionId']


# ---------------------------------------------------------------- tests


def test_scenarios_listing_hides_script_details(scripted_api):
    r = scripted_api.get('/simulator/scenarios')
    assert r.status_code == 200
    body = r.json()
    assert [s['id'] for s in body] == list(load_scenarios())
    assert body[0]['hasRecording'] is True
    assert 'nodes' not in body[0] and 'endings' not in body[0]


def test_scripted_fallback_full_call(scripted_api):
    http = scripted_api
    assert http.get('/simulator/status').json() == {'dialogue': 'scripted', 'model': None}
    sid = start(http)
    v = http.post(f'/simulator/sessions/{sid}/answer').json()
    assert v['status'] == 'active'
    assert v['freeTextAvailable'] is False
    assert v['transcript'][0]['source'] == 'scripted'
    # Options carry no destination, behavior or rationale.
    assert set(v['node']['options'][0]) <= {'id', 'label', 'keypad'}

    v = http.post(f'/simulator/sessions/{sid}/say', json={'text': 'who is this?'}).json()
    assert 'unavailable' in v['notice']
    assert v['node']['id'] == 'intro'

    for opt in ['intro_challenge', 'authority_verify', 'discourage_hold_firm']:
        r = http.post(f'/simulator/sessions/{sid}/choose', json={'optionId': opt})
        assert r.status_code == 200, r.text
    v = r.json()
    assert v['status'] == 'ended' and v['endingId'] == 'verified'

    d = http.get(f'/simulator/sessions/{sid}/debrief').json()
    assert d['outcome'] == 'protected'
    assert d['usedModel'] is False


def test_invalid_option_and_unknown_session(scripted_api):
    http = scripted_api
    sid = start(http)
    http.post(f'/simulator/sessions/{sid}/answer')
    r = http.post(f'/simulator/sessions/{sid}/choose', json={'optionId': 'pin_disclose'})
    assert r.status_code == 409
    assert http.post('/simulator/sessions/nope/answer').status_code == 404
    assert http.get(f'/simulator/sessions/{sid}/debrief').status_code == 409


def test_model_writes_lines_and_classifies_free_text(model_api):
    http, fake = model_api
    assert http.get('/simulator/status').json()['dialogue'] == 'model'
    sid = start(http)

    fake.line_replies = [['Hey, it’s Jordan from account protection. Is this the account holder?']]
    v = http.post(f'/simulator/sessions/{sid}/answer').json()
    last = v['transcript'][-1]
    assert {k: last[k] for k in ('speaker', 'text', 'clipId', 'source')} == {
        'speaker': 'caller',
        'text': 'Hey, it’s Jordan from account protection. Is this the account holder?',
        'clipId': None,
        'source': 'model',
    }
    assert isinstance(last['atMs'], int)
    assert v['freeTextAvailable'] is True

    fake.classify_replies = ['intro_challenge']
    fake.line_replies = [['We flagged a SIM transfer.', 'I need to stop it now.']]
    v = http.post(f'/simulator/sessions/{sid}/say', json={'text': 'Hold on, who are you exactly?'}).json()
    assert v['node']['id'] == 'authority'
    assert v['transcript'][-3]['speaker'] == 'user'
    assert v['transcript'][-3]['text'] == 'Hold on, who are you exactly?'
    assert [t['text'] for t in v['transcript'][-2:]] == ['We flagged a SIM transfer.', 'I need to stop it now.']

    # The classifier only ever sees the allowed ids for this step.
    classify_call = fake.calls[1]
    enum = classify_call['output_config']['format']['schema']['properties']['choice']['enum']
    assert enum == ['intro_yes', 'intro_challenge', 'unclear']
    # Request shape: cached system prompt, effort, fallbacks opt-in.
    assert classify_call['system'][0]['cache_control'] == {'type': 'ephemeral'}
    assert classify_call['output_config']['effort'] == 'low'
    assert classify_call['fallbacks'] == 'default'
    assert classify_call['betas'] == ['server-side-fallback-2026-07-01']
    assert classify_call['model'] == 'claude-opus-5-5'


def test_unclear_free_text_stays_on_step(model_api):
    http, fake = model_api
    sid = start(http)
    http.post(f'/simulator/sessions/{sid}/answer')
    fake.classify_replies = ['unclear', 'unclear']
    fake.line_replies = [['Sorry, is this the account holder?'], ['I just need a yes or no.']]
    v = http.post(f'/simulator/sessions/{sid}/say', json={'text': 'banana'}).json()
    assert v['node']['id'] == 'intro' and v['notice'] is None
    v = http.post(f'/simulator/sessions/{sid}/say', json={'text': 'hmm'}).json()
    assert v['node']['id'] == 'intro'
    assert 'rephrase' in v['notice']


def test_free_text_is_redacted_before_model_and_transcript(model_api):
    http, fake = model_api
    sid = start(http)
    http.post(f'/simulator/sessions/{sid}/answer')
    fake.classify_replies = ['intro_yes']
    v = http.post(f'/simulator/sessions/{sid}/say', json={'text': 'yes, my email is jane@example.com and code 482913'}).json()
    said = v['transcript'][1]['text']
    assert 'jane@example.com' not in said and '482913' not in said
    sent = json.dumps(fake.calls[1]['messages'])
    assert 'jane@example.com' not in sent and '482913' not in sent


def test_unsafe_model_lines_fall_back_to_script(model_api):
    http, fake = model_api
    sid = start(http)
    fake.line_replies = [['Call us back at 888-555-0199 right away.']]
    v = http.post(f'/simulator/sessions/{sid}/answer').json()
    assert v['transcript'][0]['source'] == 'scripted'
    assert '888' not in v['transcript'][0]['text']


def test_refusal_or_error_falls_back_to_script(model_api):
    http, fake = model_api
    fake.stop_reason = 'refusal'
    sid = start(http)
    v = http.post(f'/simulator/sessions/{sid}/answer').json()
    assert v['transcript'][0]['source'] == 'scripted'

    fake.stop_reason = 'end_turn'
    fake.raise_error = anthropic.APIConnectionError(request=None)
    v = http.post(f'/simulator/sessions/{sid}/choose', json={'optionId': 'intro_yes'}).json()
    assert v['node']['id'] == 'authority'
    assert v['transcript'][-1]['source'] == 'scripted'


def test_recording_steps_are_never_generated(model_api):
    http, fake = model_api
    sid = start(http, AMZ)
    v = http.post(f'/simulator/sessions/{sid}/answer').json()
    assert v['transcript'][0]['source'] == 'recording'
    assert v['freeTextAvailable'] is False  # can't talk to a recording
    assert fake.calls == []
    r = http.post(f'/simulator/sessions/{sid}/say', json={'text': 'hello?'})
    assert r.status_code == 409
    v = http.post(f'/simulator/sessions/{sid}/choose', json={'optionId': 'robo_press1'}).json()
    assert v['transcript'][-1]['source'] == 'model'


def test_retry_comparison_and_new_recording(scripted_api):
    http = scripted_api
    a = start(http, AMZ)
    http.post(f'/simulator/sessions/{a}/answer')
    for opt in ['robo_press1', 'intro_give_email', 'ra_allow', 'gc_pay']:
        http.post(f'/simulator/sessions/{a}/choose', json={'optionId': opt})
    b = start(http, AMZ, previous=a)
    v = http.post(f'/simulator/sessions/{b}/answer').json()
    first_clip = http.get(f'/simulator/sessions/{a}/debrief').json()['recording']['id']
    assert v['transcript'][0]['clipId'] != first_clip
    http.post(f'/simulator/sessions/{b}/choose', json={'optionId': 'robo_check_app'})
    d = http.get(f'/simulator/sessions/{b}/debrief', params={'previous': a}).json()
    assert d['comparison'] and all(c['direction'] != 'worse' for c in d['comparison'])


def test_safety_helpers():
    assert redact_user_text('ssn 123-45-6789, card 4111 1111 1111 1111, pin 1234') == (
        'ssn [number removed], card [number removed], pin [number removed]'
    )
    assert redact_user_text('press 1 for $899') == 'press 1 for $899'
    assert caller_line_ok('That’s fourteen ninety-nine, shipping to Texas.')
    assert caller_line_ok('Badge number four four seven one.')
    assert caller_line_ok('Your account ends in 4417.')
    for bad in ['Call 1-800-555-0100', 'Go to www.example.com', 'email me at a@b.co', 'x' * 400]:
        assert not caller_line_ok(bad)


def test_no_recording_transcript_contains_a_phone_number():
    unsafe = re.compile(r'\d{3}[\s.-]*\d{3,4}|\d{7,}|\(\d{3}\)|call (us )?(back )?(at|on)\b', re.I)
    for sc in load_scenarios().values():
        for clip in sc.recordings:
            assert not unsafe.search(clip.transcript), clip.id


def test_missing_credentials_disables_model_and_falls_back(model_api):
    http, fake = model_api
    fake.raise_error = TypeError('"Could not resolve authentication method. Expected one of api_key..."')
    sid = start(http)
    v = http.post(f'/simulator/sessions/{sid}/answer').json()
    assert v['transcript'][0]['source'] == 'scripted'
    assert v['freeTextAvailable'] is False
    assert http.get('/simulator/status').json()['dialogue'] == 'scripted'


def test_hang_up_during_model_call_wins():
    """Hang-up doesn't wait for an in-flight model call, and that call's result is discarded."""
    import asyncio

    from app.simulator.service import SimulatorService

    client, fake = make_client()
    gate = asyncio.Event()
    original = fake.create

    async def slow_create(**kwargs):
        await gate.wait()
        return await original(**kwargs)

    fake.create = slow_create
    svc = SimulatorService(ClaudeDialogue(client))

    async def scenario():
        sid = svc.start(SIM).session_id
        gate.set()
        await svc.answer(sid)
        gate.clear()
        fake.classify_replies = ['intro_yes']
        say_task = asyncio.create_task(svc.say(sid, 'yes it is me'))
        await asyncio.sleep(0)  # say() is now waiting on the model
        hung = await asyncio.wait_for(svc.hang_up(sid), timeout=1)
        assert hung.status == 'ended'
        gate.set()
        after = await say_task
        assert after.status == 'ended' and after.ending_id == 'hung_up'
        assert not any(t.speaker == 'user' for t in after.transcript)

    asyncio.run(scenario())
