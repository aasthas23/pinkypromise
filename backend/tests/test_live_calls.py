"""Live AI practice calls, with fake Claude and fake speech clients (no network)."""

import asyncio
import json
import random
import re
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.simulator.live.conversation import ClaudeCaller, NoCaller, TurnAssessment
from app.simulator.live.corpus import load_corpus
from app.simulator.live.scenarios import SCENARIOS
from app.simulator.live.service import LiveService, pop_sentences
from app.simulator.live.speech import NoSpeech, SpeechError


# ---------------------------------------------------------------- fakes


class FakeStream:
    def __init__(self, chunks, delay=0.0):
        self._chunks, self._delay = chunks, delay

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    @property
    def text_stream(self):
        async def gen():
            for c in self._chunks:
                if self._delay:
                    await asyncio.sleep(self._delay)
                yield c
        return gen()

    async def get_final_message(self):
        text = ''.join(self._chunks)
        return SimpleNamespace(
            stop_reason='end_turn',
            content=[SimpleNamespace(model_dump=lambda **_: {'type': 'thinking', 'thinking': '', 'signature': 'sig'}),
                     SimpleNamespace(model_dump=lambda **_: {'type': 'text', 'text': text})],
        )


class FakeMessages:
    def __init__(self):
        self.replies: list[list[str]] = []
        self.assessments: list[dict | None] = []
        self.stream_calls: list[dict] = []
        self.delay = 0.0

    def stream(self, **kwargs):
        # Snapshot: the service keeps appending to the same history list.
        self.stream_calls.append({**kwargs, 'messages': [dict(m) for m in kwargs['messages']]})
        return FakeStream(self.replies.pop(0) if self.replies else ['Okay. ', 'Anything else?'], self.delay)

    async def create(self, **kwargs):
        data = self.assessments.pop(0) if self.assessments else {'caller_tactics': [], 'user_actions': []}
        if data is None:
            raise TypeError('authentication failed')  # exercise the keyword fallback
        return SimpleNamespace(stop_reason='end_turn', content=[SimpleNamespace(type='text', text=json.dumps(data))])


class FakeSpeech:
    available = True
    media_type = 'audio/mpeg'

    def __init__(self):
        self.heard: list[tuple[bytes, str]] = []
        self.transcript = 'Who is this, really?'
        self.fail_tts = False

    async def transcribe(self, audio, content_type):
        self.heard.append((audio, content_type))
        return self.transcript

    async def synthesize(self, text, instructions):
        if self.fail_tts:
            raise SpeechError('The caller’s voice couldn’t be generated.')
        yield b'ID3' + text.encode()[:10]
        yield b'more-audio'


@pytest.fixture
def live(tmp_path):
    fake = FakeMessages()
    caller = ClaudeCaller(SimpleNamespace(beta=SimpleNamespace(messages=fake)), model='claude-opus-5-5')
    speech = FakeSpeech()
    app.state.live = LiveService(caller, speech, transcripts=tmp_path, rng=random.Random(7))
    with TestClient(app) as http:
        yield http, fake, speech, tmp_path


def events(resp):
    return [json.loads(line[6:]) for line in resp.text.splitlines() if line.startswith('data: ')]


def start(http, difficulty='intermediate'):
    r = http.post('/simulator/live/sessions', json={'difficulty': difficulty, 'tzOffsetMin': 300})
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------- corpus & scenarios


def test_corpus_is_redacted_and_retrieval_matches_the_scenario():
    corpus = load_corpus()
    assert len(corpus.docs) > 500
    leak = re.compile(r'\d{3}[\s.-]*\d{3}[\s.-]*\d{4}|\d{7,}|https?://|www\.', re.I)
    assert not [d.id for d in corpus.docs if leak.search(d.text)]
    sim_swap = next(s for s in SCENARIOS if s.id == 'tmobile-sim-swap')
    hits = corpus.retrieve(sim_swap.retrieval_query, sim_swap.retrieval_scam_types, sim_swap.tactics, k=4)
    assert len(hits) == 4
    assert all(set(h.scam_types) & {'account_security', 'government'} for h in hits)


def test_every_level_has_t_mobile_scenarios():
    for level in ('beginner', 'intermediate', 'advanced'):
        assert len([s for s in SCENARIOS if s.difficulty == level]) == 2
    assert all('T-Mobile' in s.caller_display and '555-01' in s.caller_number for s in SCENARIOS)


def test_sentences_are_split_for_early_speech():
    sentences, rest = pop_sentences('Hi there, this is Ashley. Do you have a quick minute? I can')
    assert sentences == ['Hi there, this is Ashley.', 'Do you have a quick minute?']
    assert rest == 'I can'
    assert pop_sentences('Okay. Great, so')[0] == []  # tiny fragments join the next sentence


# ---------------------------------------------------------------- conversation


def test_start_grounds_the_call_but_keeps_sources_server_side(live):
    http, fake, _, _ = live
    s = start(http)
    assert s['status'] == 'ringing' and s['title'] and s['speechAvailable'] is True
    assert 'messages' not in s and 'systemPrompt' not in s
    svc = app.state.live
    session = svc._get(s['sessionId'])
    assert len(session.grounding_ids) == 4
    assert 'FTC robocall ftc-' in session.system_prompt
    assert 'Never say a real phone number' in session.system_prompt


def test_full_call_with_memory_streaming_and_saved_transcript(live):
    http, fake, speech, tmp = live
    s = start(http)
    sid = s['sessionId']
    fake.replies = [
        ['Hello, this is Casey from T-Mobile Support. ', 'We noticed unusual activity on your account.'],
        ['I’m Casey, badge three three one eight. ', 'Can you confirm your billing ZIP code?'],
        ['Okay, well, ', 'don’t say I didn’t warn you. [END_CALL]'],
    ]
    fake.assessments = [
        {'caller_tactics': ['authority_claim', 'fear_of_loss'], 'user_actions': []},
        {'caller_tactics': ['personal_info_request'], 'user_actions': ['challenged_caller']},
        {'caller_tactics': [], 'user_actions': ['verified_independently', 'ended_conversation']},
    ]

    ev = events(http.post(f'/simulator/live/sessions/{sid}/answer'))
    callers = [e for e in ev if e['type'] == 'caller']
    assert [c['text'] for c in callers] == ['Hello, this is Casey from T-Mobile Support.', 'We noticed unusual activity on your account.']
    assert ev[-1]['type'] == 'done' and ev[-1]['ended'] is False
    first_caller_id = callers[0]['entryId']

    # 🚩 while the opening line is on screen
    http.post(f'/simulator/live/sessions/{sid}/spot', json={'entryId': first_caller_id})

    # Spoken reply: raw audio body, transcribed server-side
    ev = events(http.post(f'/simulator/live/sessions/{sid}/turn', content=b'webm-bytes', headers={'Content-Type': 'audio/webm;codecs=opus'}))
    assert ev[0] == {'type': 'user', 'entry': ev[0]['entry']} and ev[0]['entry']['text'] == 'Who is this, really?'
    assert speech.heard == [(b'webm-bytes', 'audio/webm;codecs=opus')]

    # Typed reply with real-looking details: redacted before the model and the transcript
    ev = events(http.post(f'/simulator/live/sessions/{sid}/turn', json={'text': 'I’ll call T-Mobile myself at the number on my bill, my zip is 90210. Bye.'}))
    assert '90210' not in ev[0]['entry']['text']
    assert ev[-1]['ended'] is True  # the caller ended the call with [END_CALL]
    assert all('[END_CALL]' not in e.get('text', '') for e in ev)

    # Memory: every request carries the whole call so far
    last = fake.stream_calls[-1]['messages']
    assert [m['role'] for m in last] == ['user', 'assistant', 'user', 'assistant', 'user']
    assert 'Who is this, really?' in last[2]['content']
    assert last[1]['content'][0]['type'] == 'thinking'  # assistant turns appended exactly as returned
    assert fake.stream_calls[0]['system'][0]['cache_control'] == {'type': 'ephemeral'}
    assert fake.stream_calls[0]['fallbacks'] == 'default'

    r = http.get(f'/simulator/live/sessions/{sid}/debrief').json()
    d, view = r['debrief'], r['session']
    assert d['outcome'] == 'protected' and d['usedModel'] is True
    assert {o['id']: o['achieved'] for o in d['learningOutcomes']} == {'spot_tactics': True, 'protect_info': True, 'verify_yourself': True}
    assert d['cues']['spotted'] == ['unsolicited_contact', 'authority_claim', 'fear_of_loss']
    assert 'personal_info_request' in d['cues']['missed']
    assert 'real FTC robocall transcripts' in d['provenance']

    files = list(tmp.glob('*_transcript.txt'))
    assert len(files) == 1 and files[0].name.startswith('tmobile_')
    assert view['transcriptFile'].endswith(files[0].name)
    assert view['entries'][0]['flags'] == ['authority_claim', 'fear_of_loss']  # revealed only after the call
    text = files[0].read_text()
    from app.simulator.live.scenarios import get_live_scenario

    agent = get_live_scenario(view['scenarioId']).agent_name
    assert f'{agent}: Hello, this is Casey from T-Mobile Support.' in text
    assert 'You: Who is this, really?' in text and '90210' not in text
    assert 'Grounding:' in text and 'ftc-' in text and '(UTC-05:00)' in text
    assert http.get(f'/simulator/live/sessions/{sid}/transcript.txt').text == text


def test_interruption_and_silence_are_passed_to_the_model(live):
    http, fake, _, _ = live
    sid = start(http)['sessionId']
    fake.replies = [['This is T-Mobile Support calling. ', 'There’s a problem with your account. ', 'I need you to confirm a few things.']]
    ev = events(http.post(f'/simulator/live/sessions/{sid}/answer'))
    first_uid = next(e['utteranceId'] for e in ev if e['type'] == 'caller')
    events(http.post(f'/simulator/live/sessions/{sid}/turn', json={'text': 'Wait, stop.', 'interrupted': True, 'heard': [first_uid]}))
    assert '[You were cut off' in fake.stream_calls[-1]['messages'][-1]['content']
    session = app.state.live._get(sid)
    opener = next(e for e in session.entries if e.speaker == 'caller')
    assert opener.interrupted is True
    assert opener.text == 'This is T-Mobile Support calling.'  # trimmed to what was heard
    before = len([e for e in session.entries if e.speaker == 'user'])
    events(http.post(f'/simulator/live/sessions/{sid}/turn', json={'silence': True}))
    assert 'quiet' in fake.stream_calls[-1]['messages'][-1]['content']
    assert len([e for e in session.entries if e.speaker == 'user']) == before


def test_no_speech_and_unsafe_lines(live):
    http, fake, speech, _ = live
    sid = start(http)['sessionId']
    fake.replies = [['Call us back at 800-555-0199 right now. ', 'This is T-Mobile Security calling about your account.']]
    ev = events(http.post(f'/simulator/live/sessions/{sid}/answer'))
    assert [e['text'] for e in ev if e['type'] == 'caller'] == ['This is T-Mobile Security calling about your account.']
    speech.transcript = '   '
    ev = events(http.post(f'/simulator/live/sessions/{sid}/turn', content=b'x', headers={'Content-Type': 'audio/webm'}))
    assert ev == [{'type': 'no_speech'}]


def test_hang_up_mid_reply_keeps_the_partial_line_and_saves(live):
    http, fake, _, tmp = live
    svc: LiveService = app.state.live
    sid = start(http)['sessionId']
    fake.replies = [['Hi, this is T-Mobile. '], ['This is going to take ', 'a while to say. ', 'Are you still there? ', 'Hello?']]
    fake.delay = 0.05

    async def scenario():  # one event loop for the whole call, as in the server
        async for _ in svc.answer(sid):
            pass
        gen = svc.turn(sid, text='Okay')
        got = []
        async for ev in gen:
            got.append(ev)
            if ev['type'] == 'caller':
                svc.hang_up(sid)
        await svc.debrief(sid)
        return got

    got = asyncio.run(scenario())
    assert got[-1]['type'] == 'done' and got[-1]['ended'] is True
    session = svc._get(sid)
    assert session.end_reason == 'user_hang_up'
    partial = session.entries[-2]
    assert partial.speaker == 'caller' and partial.interrupted is True
    assert session.messages[-1] == {'role': 'assistant', 'content': [{'type': 'text', 'text': partial.text}]}


def test_keyword_fallback_when_assessment_fails(live):
    http, fake, _, _ = live
    sid = start(http)['sessionId']
    fake.replies = [['Hi, this is T-Mobile, I need the code we just texted you right now. ']]
    fake.assessments = [None]
    events(http.post(f'/simulator/live/sessions/{sid}/answer'))
    http.post(f'/simulator/live/sessions/{sid}/hangup')
    d = http.get(f'/simulator/live/sessions/{sid}/debrief').json()['debrief']
    assert {'code_request', 'artificial_urgency'} <= set(d['cues']['encountered'])


def test_speech_endpoint_streams_only_generated_lines(live):
    http, fake, speech, _ = live
    sid = start(http)['sessionId']
    ev = events(http.post(f'/simulator/live/sessions/{sid}/answer'))
    uid = next(e['utteranceId'] for e in ev if e['type'] == 'caller')
    r = http.get(f'/simulator/live/sessions/{sid}/speech/{uid}')
    assert r.status_code == 200 and r.headers['content-type'] == 'audio/mpeg' and r.content.startswith(b'ID3')
    assert http.get(f'/simulator/live/sessions/{sid}/speech/not-a-line').status_code == 404
    speech.fail_tts = True
    assert http.get(f'/simulator/live/sessions/{sid}/speech/{uid}').status_code == 503


def test_decline_and_unavailable_llm(live, tmp_path):
    http, _, _, tmp = live
    sid = start(http, 'beginner')['sessionId']
    assert http.post(f'/simulator/live/sessions/{sid}/decline').json()['status'] == 'ended'
    d = http.get(f'/simulator/live/sessions/{sid}/debrief').json()['debrief']
    assert d['outcome'] == 'not_engaged'
    assert list(tmp.glob('tmobile_*_transcript.txt'))

    app.state.live = LiveService(NoCaller(), NoSpeech(), transcripts=tmp_path)
    r = http.post('/simulator/live/sessions', json={'difficulty': 'advanced'})
    assert r.status_code == 503 and 'AI caller' in r.json()['detail']
    assert http.get('/simulator/live/status').json()['llm'] is False


def test_disclosure_then_caller_ends_is_exposed(live):
    http, fake, _, _ = live
    sid = start(http, 'advanced')['sessionId']
    fake.replies = [['This is the T-Mobile Fraud Department. '], ['Great, that blocks it. Thanks! [END_CALL]']]
    fake.assessments = [
        {'caller_tactics': ['authority_claim'], 'user_actions': []},
        {'caller_tactics': [], 'user_actions': ['disclosed_code']},
    ]
    events(http.post(f'/simulator/live/sessions/{sid}/answer'))
    events(http.post(f'/simulator/live/sessions/{sid}/turn', json={'text': 'The code is 482913'}))
    d = http.get(f'/simulator/live/sessions/{sid}/debrief').json()['debrief']
    assert d['outcome'] == 'exposed' and d['recoverySteps']
    assert {o['id']: o['achieved'] for o in d['learningOutcomes']}['protect_info'] is False
