"""Google Gemini speech-to-text and text-to-speech for live practice calls.

Same interface as OpenAISpeech: transcribe(audio, content_type) -> str and
synthesize(text, instructions) -> async iterator of audio bytes. Audio from the
user is sent inline for transcription and discarded; nothing is stored.

Config (env):
  GEMINI_API_KEY                required
  SCAM_COACH_GEMINI_STT_MODEL   default gemini-3.5-flash-lite (audio understanding, prompted to transcribe)
  SCAM_COACH_GEMINI_TTS_MODEL   default gemini-3.8-flash-lite-tts
  SCAM_COACH_GEMINI_VOICE       default Kore (one of Gemini's prebuilt voices)
"""

import base64
import logging
import os
import re
import struct
from collections.abc import AsyncIterator

import httpx

from .gemini_client import GeminiError, api_key, make_client, raise_for_error, text_from
from .speech import ALLOWED_AUDIO_TYPES, MAX_AUDIO_BYTES, SpeechError

log = logging.getLogger(__name__)

# Gemini's audio MIME names; Safari records audio/mp4, which Gemini lists as audio/m4a.
_GEMINI_AUDIO = {'audio/webm': 'audio/webm', 'audio/mp4': 'audio/m4a', 'audio/x-m4a': 'audio/m4a', 'audio/m4a': 'audio/m4a',
                 'audio/mpeg': 'audio/mpeg', 'audio/ogg': 'audio/ogg', 'audio/wav': 'audio/wav'}
TRANSCRIBE_PROMPT = (
    'Generate a transcript of the speech in this recording. Return only the words spoken, exactly as said, '
    'with normal punctuation and no labels, timestamps or commentary. If there is no intelligible speech, return nothing.'
)


def pcm_to_wav(pcm: bytes, rate: int = 24000, channels: int = 1, bits: int = 16) -> bytes:
    """Wraps raw little-endian PCM in a WAV header so browsers can play it."""
    block = channels * bits // 8
    header = b'RIFF' + struct.pack('<I', 36 + len(pcm)) + b'WAVEfmt ' + struct.pack(
        '<IHHIIHH', 16, 1, channels, rate, rate * block, block, bits) + b'data' + struct.pack('<I', len(pcm))
    return header + pcm


def _rate(mime: str) -> int:
    m = re.search(r'rate=(\d+)', mime or '')
    return int(m.group(1)) if m else 24000


class GeminiSpeech:
    available = True
    media_type = 'audio/wav'

    def __init__(self, client: httpx.AsyncClient):
        self._client = client
        self.stt_model = os.environ.get('SCAM_COACH_GEMINI_STT_MODEL', 'gemini-3.5-flash-lite')
        self.tts_model = os.environ.get('SCAM_COACH_GEMINI_TTS_MODEL', 'gemini-3.8-flash-lite-tts')
        self.voice = os.environ.get('SCAM_COACH_GEMINI_VOICE', 'Kore')

    async def transcribe(self, audio: bytes, content_type: str) -> str:
        base_type = content_type.split(';')[0].strip().lower()
        if base_type not in ALLOWED_AUDIO_TYPES or base_type not in _GEMINI_AUDIO:
            raise SpeechError('That audio format isn’t supported. Try typing your reply.')
        if not audio or len(audio) > MAX_AUDIO_BYTES:
            raise SpeechError('That recording was empty or too long. Try again.')
        body = {
            'contents': [{'role': 'user', 'parts': [
                {'text': TRANSCRIBE_PROMPT},
                {'inlineData': {'mimeType': _GEMINI_AUDIO[base_type], 'data': base64.b64encode(audio).decode()}},
            ]}],
            'generationConfig': {'maxOutputTokens': 600, 'thinkingConfig': {'thinkingLevel': 'MINIMAL'}},
        }
        try:
            r = await self._client.post(f'/models/{self.stt_model}:generateContent', json=body)
        except httpx.HTTPError as e:
            log.warning('Gemini transcription request failed: %s', type(e).__name__)
            raise SpeechError('Couldn’t reach the speech service. Try again or type your reply.') from e
        if r.status_code != 200:
            try:
                raise_for_error(r.status_code, r.content, 'transcription')
            except GeminiError as e:
                raise SpeechError(str(e)) from e
        return text_from(r.json()).strip()

    async def synthesize(self, text: str, instructions: str) -> AsyncIterator[bytes]:
        """One sentence at a time (the service splits replies), returned as a playable WAV."""
        body = {
            'contents': [{'role': 'user', 'parts': [{'text': text[:4000]}]}],
            'generationConfig': {
                'responseModalities': ['AUDIO'],
                'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': self.voice}}},
            },
        }
        try:
            r = await self._client.post(f'/models/{self.tts_model}:generateContent', json=body)
        except httpx.HTTPError as e:
            log.warning('Gemini speech request failed: %s', type(e).__name__)
            raise SpeechError('The caller’s voice couldn’t be generated.') from e
        if r.status_code != 200:
            try:
                raise_for_error(r.status_code, r.content, 'speech')
            except GeminiError as e:
                raise SpeechError('The caller’s voice couldn’t be generated.') from e
        audio = next(
            (p['inlineData'] for c in r.json().get('candidates') or [] for p in (c.get('content') or {}).get('parts') or []
             if p.get('inlineData', {}).get('data')),
            None,
        )
        if not audio:
            raise SpeechError('The caller’s voice couldn’t be generated.')
        raw = base64.b64decode(audio['data'])
        mime = (audio.get('mimeType') or '').lower()
        yield raw if ('wav' in mime or raw[:4] == b'RIFF') else pcm_to_wav(raw, _rate(mime))


def create_gemini_speech() -> GeminiSpeech | None:
    key = api_key()
    return GeminiSpeech(make_client(key, os.environ.get('GEMINI_BASE_URL'))) if key else None
