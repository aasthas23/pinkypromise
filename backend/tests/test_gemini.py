"""Gemini conversation + speech backends, against a mock HTTP transport (no network)."""

import asyncio
import base64
import json
import random

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.simulator.live import conversation, speech as speech_mod
from app.simulator.live.conversation import LLMUnavailable, NoCaller
from app.simulator.live.gemini_llm import GeminiCaller, to_gemini_contents
from app.simulator.live.gemini_speech import GeminiSpeech, pcm_to_wav, plausible_length
from app.simulator.live.service import LiveService
from app.simulator.live.speech import NoSpeech, SpeechError


class MockGemini:
    def __init__(self):
        self.requests: list[tuple[str, dict, httpx.Headers]] = []
        self.replies: list[list[str]] = []
        self.labels: list[dict] = []
        self.transcript = 'I’m going to check with T-Mobile myself. Goodbye.'
        self.status = 200
        self.error = {}

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        path = request.url.path
        self.requests.append((path, body, request.headers))
        if self.status != 200:
            return httpx.Response(self.status, json={'error': self.error})
        if path.endswith(':streamGenerateContent'):
            parts = self.replies.pop(0) if self.replies else ['Okay. ', 'Anything else?']
            chunks = [{'candidates': [{'content': {'role': 'model', 'parts': [{'text': t}]}}]} for t in parts]
            chunks[-1]['candidates'][0]['finishReason'] = 'STOP'
            chunks[-1]['candidates'][0]['content']['parts'].append({'text': '', 'thoughtSignature': 'sig-abc'})
            return httpx.Response(200, content=''.join(f'data: {json.dumps(c)}\r\n\r\n' for c in chunks))
        gen = body.get('generationConfig', {})
        if gen.get('responseModalities') == ['AUDIO']:
            pcm = b'\x00\x01' * 240
            return httpx.Response(200, json={'candidates': [{'content': {'parts': [
                {'inlineData': {'mimeType': 'audio/L16;codec=pcm;rate=24000', 'data': base64.b64encode(pcm).decode()}}]}}]})
        if gen.get('responseMimeType') == 'application/json':
            labels = self.labels.pop(0) if self.labels else {'caller_tactics': [], 'user_actions': []}
            return httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': json.dumps(labels)}]}}]})
        # transcription
        return httpx.Response(200, json={'candidates': [{'content': {'parts': [
            {'text': 'thinking…', 'thought': True}, {'text': self.transcript}]}}]})


def client(mock):
    return httpx.AsyncClient(base_url='https://gemini.test/v1beta', headers={'x-goog-api-key': 'AIza-test'},
                             transport=httpx.MockTransport(mock.handler))


def test_history_keeps_gemini_parts_verbatim():
    msgs = [
        {'role': 'user', 'content': '[The call connects.]'},
        {'role': 'assistant', 'content': {'gemini_parts': [{'text': 'Hi.'}, {'text': '', 'thoughtSignature': 's'}]}},
        {'role': 'user', 'content': 'Who is this?'},
        {'role': 'assistant', 'content': [{'type': 'text', 'text': 'Partial'}]},
    ]
    assert to_gemini_contents(msgs) == [
        {'role': 'user', 'parts': [{'text': '[The call connects.]'}]},
        {'role': 'model', 'parts': [{'text': 'Hi.'}, {'text': '', 'thoughtSignature': 's'}]},
        {'role': 'user', 'parts': [{'text': 'Who is this?'}]},
        {'role': 'model', 'parts': [{'text': 'Partial'}]},
    ]


def test_stream_reply_request_and_parsing():
    mock = MockGemini()
    mock.replies = [['Hi, this is Ashley ', 'from T-Mobile Rewards.']]
    caller = GeminiCaller(client(mock))

    async def run():
        s = caller.stream_reply('SYSTEM', [{'role': 'user', 'content': 'Hello?'}])
        return [d async for d in s], s

    got, stream = asyncio.run(run())
    assert got == ['Hi, this is Ashley ', 'from T-Mobile Rewards.']
    assert stream.stop_reason == 'end_turn'
    assert {'text': '', 'thoughtSignature': 'sig-abc'} in stream.content['gemini_parts']
    path, body, headers = mock.requests[0]
    assert path == '/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent'
    assert headers['x-goog-api-key'] == 'AIza-test'
    assert body['systemInstruction'] == {'parts': [{'text': 'SYSTEM'}]}
    assert body['contents'] == [{'role': 'user', 'parts': [{'text': 'Hello?'}]}]
    assert body['generationConfig']['thinkingConfig'] == {'thinkingLevel': 'MINIMAL'}


def test_assess_uses_json_schema():
    mock = MockGemini()
    mock.labels = [{'caller_tactics': ['too_good_offer', 'nonsense'], 'user_actions': ['challenged_caller']}]
    a = asyncio.run(GeminiCaller(client(mock)).assess('Hi', 'Who are you?', 'You won a discount!'))
    assert a.caller_tactics == ['too_good_offer'] and a.user_actions == ['challenged_caller']
    gen = mock.requests[0][1]['generationConfig']
    assert gen['responseMimeType'] == 'application/json' and gen['responseJsonSchema']['required'] == ['caller_tactics', 'user_actions']


def test_errors_quota_and_bad_key():
    mock = MockGemini()
    caller = GeminiCaller(client(mock))

    async def run():
        async for _ in caller.stream_reply('s', [{'role': 'user', 'content': 'x'}]):
            pass

    mock.status, mock.error = 429, {'status': 'RESOURCE_EXHAUSTED', 'message': 'Quota exceeded'}
    with pytest.raises(LLMUnavailable, match='usage limit'):
        asyncio.run(run())
    assert caller.available
    mock.status, mock.error = 400, {'status': 'INVALID_ARGUMENT', 'details': [{'reason': 'API_KEY_INVALID'}]}
    with pytest.raises(LLMUnavailable, match='key isn’t valid'):
        asyncio.run(run())
    assert not caller.available


def test_transcription_sends_inline_audio_and_skips_thoughts():
    mock = MockGemini()
    sp = GeminiSpeech(client(mock))
    text = asyncio.run(sp.transcribe(b'webm-bytes', 'audio/webm;codecs=opus'))
    assert text == 'I’m going to check with T-Mobile myself. Goodbye.'
    path, body, _ = mock.requests[0]
    assert path.endswith('/models/gemini-3.5-flash-lite:generateContent')
    inline = body['contents'][0]['parts'][1]['inlineData']
    assert inline == {'mimeType': 'audio/webm', 'data': base64.b64encode(b'webm-bytes').decode()}
    asyncio.run(sp.transcribe(b'mp4', 'audio/mp4'))  # Safari recordings
    assert mock.requests[1][1]['contents'][0]['parts'][1]['inlineData']['mimeType'] == 'audio/m4a'
    with pytest.raises(SpeechError):
        asyncio.run(sp.transcribe(b'x', 'video/quicktime'))


def test_tts_returns_playable_wav():
    mock = MockGemini()
    sp = GeminiSpeech(client(mock))

    async def run():
        return b''.join([c async for c in sp.synthesize('Hello there.', 'style')])

    wav = asyncio.run(run())
    assert wav[:4] == b'RIFF' and wav[8:12] == b'WAVE' and len(wav) == 44 + 480
    path, body, _ = mock.requests[0]
    assert path.endswith('/models/gemini-3.8-flash-tts:generateContent')
    assert body['contents'][0]['parts'][0]['text'] == 'Hello there.'  # only the line is spoken
    assert body['generationConfig']['speechConfig']['voiceConfig']['prebuiltVoiceConfig']['voiceName'] == 'Kore'
    assert pcm_to_wav(b'\x00' * 10)[24:28] == (24000).to_bytes(4, 'little')


def test_provider_defaults(monkeypatch):
    for k in ('SCAM_COACH_LLM_PROVIDER', 'SCAM_COACH_SPEECH_PROVIDER', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'):
        monkeypatch.delenv(k, raising=False)
    assert isinstance(conversation.create_caller(), NoCaller)
    assert isinstance(speech_mod.create_speech(), NoSpeech)
    monkeypatch.setenv('GEMINI_API_KEY', 'AIza-test')
    c = conversation.create_caller()
    assert isinstance(c, GeminiCaller) and c.label == 'Google gemini-3.5-flash-lite'
    assert isinstance(speech_mod.create_speech(), GeminiSpeech)


def test_full_spoken_call_on_gemini_only(tmp_path):
    mock = MockGemini()
    mock.replies = [
        ['Hello, this is Casey from T-Mobile Support. ', 'We noticed unusual activity on your account.'],
        ['Well, okay. ', 'Your account stays at risk then. [END_CALL]'],
    ]
    mock.labels = [
        {'caller_tactics': ['authority_claim', 'fear_of_loss'], 'user_actions': []},
        {'caller_tactics': [], 'user_actions': ['verified_independently', 'ended_conversation']},
    ]
    app.state.live = LiveService(GeminiCaller(client(mock)), GeminiSpeech(client(mock)), transcripts=tmp_path, rng=random.Random(5))
    with TestClient(app) as http:
        sid = http.post('/simulator/live/sessions', json={'difficulty': 'intermediate'}).json()['sessionId']
        ev = [json.loads(l[6:]) for l in http.post(f'/simulator/live/sessions/{sid}/answer').text.splitlines() if l.startswith('data: ')]
        uid = next(e['utteranceId'] for e in ev if e['type'] == 'caller')
        audio = http.get(f'/simulator/live/sessions/{sid}/speech/{uid}')
        assert audio.status_code == 200 and audio.headers['content-type'] == 'audio/wav' and audio.content[:4] == b'RIFF'
        r = http.post(f'/simulator/live/sessions/{sid}/turn', content=b'webm', headers={'Content-Type': 'audio/webm'})
        assert '"ended": true' in r.text
        d = http.get(f'/simulator/live/sessions/{sid}/debrief').json()['debrief']
    second_reply = [b for p, b, _ in mock.requests if p.endswith(':streamGenerateContent')][1]
    assert [c['role'] for c in second_reply['contents']] == ['user', 'model', 'user']
    assert {'text': '', 'thoughtSignature': 'sig-abc'} in second_reply['contents'][1]['parts']  # sent back verbatim
    assert d['outcome'] == 'protected' and 'Google gemini-3.5-flash-lite' in d['provenance']
    assert 'written live by AI (Google gemini-3.5-flash-lite)' in next(tmp_path.glob('*_transcript.txt')).read_text()


def tts_mock(by_model: dict):
    """by_model: model name -> (status, pcm bytes or None). Records the order models were tried."""
    tried = []

    def handler(request):
        model = request.url.path.split('/models/')[1].split(':')[0]
        tried.append(model)
        status, pcm = by_model.get(model, (404, None))
        if status != 200:
            err = {'status': 'RESOURCE_EXHAUSTED', 'details': [{'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '30s'}]} if status == 429 else {}
            return httpx.Response(status, json={'error': err})
        return httpx.Response(200, json={'candidates': [{'content': {'parts': [
            {'inlineData': {'mimeType': 'audio/L16;codec=pcm;rate=24000', 'data': base64.b64encode(pcm).decode()}}]}}]})

    return tried, httpx.AsyncClient(base_url='https://gemini.test/v1beta', transport=httpx.MockTransport(handler))


def say(sp, text='Hi, this is Dana with T-Mobile Rewards.'):
    async def run():
        return b''.join([c async for c in sp.synthesize(text, 'Warm and friendly.')])
    return asyncio.run(run())


def test_rate_limited_voice_model_falls_through_to_the_next_human_voice(monkeypatch):
    monkeypatch.delenv('SCAM_COACH_GEMINI_TTS_MODEL', raising=False)
    monkeypatch.delenv('SCAM_COACH_GEMINI_TTS_MODELS', raising=False)
    ok = b'\x00\x01' * 24000  # 1 s
    tried, c = tts_mock({'gemini-3.8-flash-tts': (429, None), 'gemini-3.8-flash-lite-tts': (429, None),
                         'gemini-3.1-flash-tts-preview': (200, ok)})
    sp = GeminiSpeech(c)
    assert say(sp)[:4] == b'RIFF'
    assert tried == ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview']
    # The limited models rest (RetryInfo said 30 s), so the next line goes straight to the working one.
    tried.clear()
    say(sp)
    assert tried == ['gemini-3.1-flash-tts-preview']


def test_every_voice_model_limited_raises_so_the_app_can_show_captions(monkeypatch):
    monkeypatch.delenv('SCAM_COACH_GEMINI_TTS_MODELS', raising=False)
    tried, c = tts_mock({m: (429, None) for m in ('gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts',
                                                   'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts')})
    with pytest.raises(SpeechError):
        say(GeminiSpeech(c))


def test_padded_clip_is_skipped_but_kept_as_a_last_resort(monkeypatch):
    monkeypatch.setenv('SCAM_COACH_GEMINI_TTS_MODELS', 'a-tts,b-tts')
    monkeypatch.delenv('SCAM_COACH_GEMINI_TTS_MODEL', raising=False)
    padded, good = b'\x00\x01' * 24000 * 20, b'\x00\x01' * 24000 * 2
    tried, c = tts_mock({'a-tts': (200, padded), 'b-tts': (200, good)})
    assert len(say(GeminiSpeech(c))) == 44 + len(good)
    tried, c = tts_mock({'a-tts': (200, padded), 'b-tts': (429, None)})
    assert len(say(GeminiSpeech(c))) == 44 + len(padded)  # a human voice beats no voice
    assert plausible_length(24000 * 2 * 3, 'Hi, this is Dana with T-Mobile Rewards.')
    assert not plausible_length(24000 * 2 * 16, 'Can you confirm the code we just texted you?')


def test_tts_model_env_puts_that_model_first(monkeypatch):
    monkeypatch.setenv('SCAM_COACH_GEMINI_TTS_MODEL', 'gemini-2.5-flash-preview-tts')
    monkeypatch.delenv('SCAM_COACH_GEMINI_TTS_MODELS', raising=False)
    sp = GeminiSpeech(client(MockGemini()))
    assert sp.tts_models[0] == 'gemini-2.5-flash-preview-tts' and len(sp.tts_models) == 4
