"""The OpenAI conversation backend (Responses API), against a mock HTTP transport."""

import asyncio
import json
import random

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.simulator.live import conversation
from app.simulator.live.conversation import LLMUnavailable, NoCaller
from app.simulator.live.openai_llm import OpenAICaller, to_openai_input
from app.simulator.live.service import LiveService


def sse(*events: dict) -> bytes:
    return b''.join(f'event: {e["type"]}\ndata: {json.dumps(e)}\n\n'.encode() for e in events)


class MockOpenAI:
    """Records requests; streams scripted replies and returns scripted labels."""

    def __init__(self):
        self.requests: list[dict] = []
        self.replies: list[list[str]] = []
        self.labels: list[dict] = []
        self.status = 200

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.requests.append(body)
        if self.status != 200:
            return httpx.Response(self.status, json={'error': {'message': 'nope'}})
        if body.get('stream'):
            parts = self.replies.pop(0) if self.replies else ['Okay. ', 'Anything else?']
            events = [{'type': 'response.created', 'response': {'status': 'in_progress'}}]
            events += [{'type': 'response.output_text.delta', 'delta': p} for p in parts]
            events += [{'type': 'response.completed', 'response': {'status': 'completed'}}]
            return httpx.Response(200, content=sse(*events), headers={'content-type': 'text/event-stream'})
        labels = self.labels.pop(0) if self.labels else {'caller_tactics': [], 'user_actions': []}
        return httpx.Response(200, json={'status': 'completed', 'output': [
            {'type': 'reasoning', 'summary': []},
            {'type': 'message', 'role': 'assistant', 'content': [{'type': 'output_text', 'text': json.dumps(labels)}]},
        ]})


def make_caller(mock: MockOpenAI) -> OpenAICaller:
    client = httpx.AsyncClient(base_url='https://api.openai.test/v1', transport=httpx.MockTransport(mock.handler))
    return OpenAICaller('sk-test', client=client)


def test_history_is_converted_to_plain_strings():
    msgs = [
        {'role': 'user', 'content': '[The call connects.]'},
        {'role': 'assistant', 'content': [{'type': 'thinking', 'thinking': ''}, {'type': 'text', 'text': 'Hi there.'}]},
        {'role': 'user', 'content': 'Who is this?'},
    ]
    assert to_openai_input(msgs) == [
        {'role': 'user', 'content': '[The call connects.]'},
        {'role': 'assistant', 'content': 'Hi there.'},
        {'role': 'user', 'content': 'Who is this?'},
    ]


def test_stream_reply_request_and_parsing():
    mock = MockOpenAI()
    mock.replies = [['Hi, this is ', 'T-Mobile Rewards.']]
    caller = make_caller(mock)

    async def run():
        stream = caller.stream_reply('SYSTEM PROMPT', [{'role': 'user', 'content': 'Hello?'}])
        got = [d async for d in stream]
        return got, stream

    got, stream = asyncio.run(run())
    assert got == ['Hi, this is ', 'T-Mobile Rewards.']
    assert stream.content == 'Hi, this is T-Mobile Rewards.' and stream.stop_reason == 'end_turn'
    req = mock.requests[0]
    assert req['model'] == 'gpt-6.1-terra' and req['instructions'] == 'SYSTEM PROMPT'
    assert req['input'] == [{'role': 'user', 'content': 'Hello?'}]
    assert req['stream'] is True and req['store'] is False
    assert req['reasoning'] == {'effort': 'none'}


def test_assess_uses_strict_json_schema_and_ignores_unknown_labels():
    mock = MockOpenAI()
    mock.labels = [{'caller_tactics': ['code_request', 'made_up'], 'user_actions': ['refused_request']}]
    a = asyncio.run(make_caller(mock).assess('Hi', 'No thanks', 'Read me the code.'))
    assert a.caller_tactics == ['code_request'] and a.user_actions == ['refused_request']
    req = mock.requests[0]
    assert req['model'] == 'gpt-6-luna' and req['store'] is False
    fmt = req['text']['format']
    assert fmt['type'] == 'json_schema' and fmt['strict'] is True
    assert fmt['schema']['additionalProperties'] is False


def test_bad_key_disables_and_server_errors_are_retryable():
    mock = MockOpenAI()
    caller = make_caller(mock)

    async def reply():
        async for _ in caller.stream_reply('s', [{'role': 'user', 'content': 'x'}]):
            pass

    mock.status = 503
    with pytest.raises(LLMUnavailable, match='busy'):
        asyncio.run(reply())
    assert caller.available
    mock.status = 401
    with pytest.raises(LLMUnavailable, match='configured'):
        asyncio.run(reply())
    assert not caller.available


def test_failed_event_mid_stream_raises():
    def handler(request):
        return httpx.Response(200, content=sse(
            {'type': 'response.output_text.delta', 'delta': 'Hello'},
            {'type': 'response.failed', 'response': {'error': {'code': 'server_error', 'message': 'boom'}}},
        ))

    caller = OpenAICaller('k', client=httpx.AsyncClient(base_url='https://x/v1', transport=httpx.MockTransport(handler)))

    async def run():
        async for _ in caller.stream_reply('s', [{'role': 'user', 'content': 'x'}]):
            pass

    with pytest.raises(LLMUnavailable):
        asyncio.run(run())


def test_provider_selection(monkeypatch):
    monkeypatch.setenv('SCAM_COACH_LLM_PROVIDER', 'openai')
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    assert isinstance(conversation.create_caller(), NoCaller)
    monkeypatch.setenv('OPENAI_API_KEY', 'sk-test')
    monkeypatch.setenv('SCAM_COACH_OPENAI_MODEL', 'gpt-6-luna')
    c = conversation.create_caller()
    assert isinstance(c, OpenAICaller) and c.model == 'gpt-6-luna' and c.label == 'OpenAI gpt-6-luna'


def test_full_call_on_openai_only(tmp_path):
    mock = MockOpenAI()
    mock.replies = [
        ['Hi, this is Agent Rivera with the T-Mobile Fraud Department. ', 'A SIM transfer is in progress on your line.'],
        ['I understand, but ', 'you’ll lose your number. Fine. [END_CALL]'],
    ]
    mock.labels = [
        {'caller_tactics': ['authority_claim', 'fear_of_loss'], 'user_actions': []},
        {'caller_tactics': ['fear_of_loss'], 'user_actions': ['verified_independently']},
    ]

    class FakeSpeech:
        available = True
        media_type = 'audio/mpeg'

        async def transcribe(self, audio, content_type):
            return 'I’ll call T-Mobile myself using the number on my bill.'

        async def synthesize(self, text, instructions):
            yield b'ID3'

    app.state.live = LiveService(make_caller(mock), FakeSpeech(), transcripts=tmp_path, rng=random.Random(3))
    with TestClient(app) as http:
        sid = http.post('/simulator/live/sessions', json={'difficulty': 'advanced'}).json()['sessionId']
        http.post(f'/simulator/live/sessions/{sid}/answer')
        r = http.post(f'/simulator/live/sessions/{sid}/turn', content=b'audio', headers={'Content-Type': 'audio/webm'})
        assert '"ended": true' in r.text
        d = http.get(f'/simulator/live/sessions/{sid}/debrief').json()['debrief']
        assert http.get('/simulator/live/status').json()['model'] == 'gpt-6.1-terra'

    # Memory: the second request carried the whole call, as plain strings.
    second = mock.requests[-1] if mock.requests[-1].get('stream') else next(q for q in reversed(mock.requests) if q.get('stream'))
    assert [m['role'] for m in second['input']] == ['user', 'assistant', 'user']
    assert 'Fraud Department' in second['input'][1]['content']
    assert 'real scam calls' in second['instructions'] or 'FTC' in second['instructions']
    assert d['outcome'] == 'protected'
    assert 'OpenAI gpt-6.1-terra' in d['provenance']
    saved = next(tmp_path.glob('*_transcript.txt')).read_text()
    assert 'written live by AI (OpenAI gpt-6.1-terra)' in saved


def test_out_of_credits_is_reported_clearly():
    def handler(request):
        return httpx.Response(429, json={'error': {'message': 'You have no credits remaining.', 'type': 'insufficient_quota', 'code': 'credit_balance_exhausted'}})

    caller = OpenAICaller('k', client=httpx.AsyncClient(base_url='https://x/v1', transport=httpx.MockTransport(handler)))

    async def run():
        async for _ in caller.stream_reply('s', [{'role': 'user', 'content': 'x'}]):
            pass

    with pytest.raises(LLMUnavailable, match='out of credits'):
        asyncio.run(run())
    assert caller.available  # adding credits fixes it without a restart


def test_out_of_credits_error_event_mid_stream():
    def handler(request):
        return httpx.Response(200, content=sse({'type': 'error', 'code': 'insufficient_quota', 'message': 'quota'}))

    caller = OpenAICaller('k', client=httpx.AsyncClient(base_url='https://x/v1', transport=httpx.MockTransport(handler)))

    async def run():
        async for _ in caller.stream_reply('s', [{'role': 'user', 'content': 'x'}]):
            pass

    with pytest.raises(LLMUnavailable, match='out of credits'):
        asyncio.run(run())
