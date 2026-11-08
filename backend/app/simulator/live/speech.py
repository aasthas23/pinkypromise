"""Speech for live practice calls: provider selection, plus the OpenAI implementation.

The default provider is Gemini (gemini_speech.py); this module also has the OpenAI one.

Server-side only: the API key never reaches the browser. Audio from the user is
forwarded for transcription and discarded; nothing is written to disk.

Config (env):
  OPENAI_API_KEY             required for speech
  OPENAI_BASE_URL            default https://api.openai.com/v1
  SCAM_COACH_STT_MODEL       default gpt-transcribe
  SCAM_COACH_TTS_MODEL       default gpt-4o-mini-tts (OpenAI lists this model for shutdown on 2027-01-06)
  SCAM_COACH_TTS_VOICE       default marin
  SCAM_COACH_TTS_FORMAT      default mp3 (streams progressively in an <audio> element)
"""

import logging
import os
from collections.abc import AsyncIterator

import httpx

log = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 10 * 1024 * 1024  # a single spoken reply is far smaller; OpenAI's limit is 25 MB
ALLOWED_AUDIO_TYPES = {'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/m4a'}
_EXT = {'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a'}


class SpeechUnavailable(Exception):
    pass


class SpeechError(Exception):
    """A speech request failed; the message is safe to show the user."""


class OpenAISpeech:
    def __init__(self, api_key: str, base_url: str | None = None):
        self._client = httpx.AsyncClient(
            base_url=(base_url or 'https://api.openai.com/v1').rstrip('/'),
            headers={'Authorization': f'Bearer {api_key}'},
            timeout=httpx.Timeout(30.0, connect=5.0),
        )
        self.stt_model = os.environ.get('SCAM_COACH_STT_MODEL', 'gpt-transcribe')
        self.tts_model = os.environ.get('SCAM_COACH_TTS_MODEL', 'gpt-4o-mini-tts')
        self.voice = os.environ.get('SCAM_COACH_TTS_VOICE', 'marin')
        self.tts_format = os.environ.get('SCAM_COACH_TTS_FORMAT', 'mp3')

    available = True

    @property
    def media_type(self) -> str:
        return {'mp3': 'audio/mpeg', 'opus': 'audio/ogg', 'aac': 'audio/aac', 'wav': 'audio/wav'}.get(self.tts_format, 'application/octet-stream')

    async def transcribe(self, audio: bytes, content_type: str) -> str:
        base_type = content_type.split(';')[0].strip().lower()
        if base_type not in ALLOWED_AUDIO_TYPES:
            raise SpeechError('That audio format isn’t supported. Try typing your reply.')
        if not audio or len(audio) > MAX_AUDIO_BYTES:
            raise SpeechError('That recording was empty or too long. Try again.')
        try:
            r = await self._client.post(
                '/audio/transcriptions',
                files={'file': (f'reply.{_EXT[base_type]}', audio, base_type)},
                data={'model': self.stt_model, 'language': 'en', 'response_format': 'json'},
            )
        except httpx.HTTPError as e:
            log.warning('Transcription request failed: %s', type(e).__name__)
            raise SpeechError('Couldn’t reach the speech service. Try again or type your reply.') from e
        if r.status_code != 200:
            log.warning('Transcription failed with HTTP %s', r.status_code)
            raise SpeechError('Couldn’t understand that recording. Try again or type your reply.')
        return str(r.json().get('text', '')).strip()

    async def synthesize(self, text: str, instructions: str) -> AsyncIterator[bytes]:
        """Streams synthesized audio as it is generated, so playback can start immediately."""
        body = {
            'model': self.tts_model,
            'voice': self.voice,
            'input': text[:4096],
            'instructions': f'{instructions} This is a fictional training call; speak naturally, like a real phone conversation.'[:4096],
            'response_format': self.tts_format,
        }
        try:
            async with self._client.stream('POST', '/audio/speech', json=body) as r:
                if r.status_code != 200:
                    await r.aread()
                    log.warning('Speech synthesis failed with HTTP %s', r.status_code)
                    raise SpeechError('The caller’s voice couldn’t be generated.')
                async for chunk in r.aiter_bytes():
                    yield chunk
        except httpx.HTTPError as e:
            log.warning('Speech synthesis request failed: %s', type(e).__name__)
            raise SpeechError('The caller’s voice couldn’t be generated.') from e


class NoSpeech:
    """No OpenAI key: the app falls back to typed replies and the browser's own voice."""

    available = False
    media_type = 'audio/mpeg'

    async def transcribe(self, audio: bytes, content_type: str) -> str:
        raise SpeechUnavailable('Speech recognition isn’t configured on the server.')

    async def synthesize(self, text: str, instructions: str) -> AsyncIterator[bytes]:
        raise SpeechUnavailable('Speech synthesis isn’t configured on the server.')
        yield b''  # pragma: no cover


def create_speech():
    """Gemini by default (same GEMINI_API_KEY as the conversation); SCAM_COACH_SPEECH_PROVIDER=openai for OpenAI."""
    provider = os.environ.get('SCAM_COACH_SPEECH_PROVIDER', 'gemini').lower()
    if provider == 'gemini':
        from .gemini_speech import create_gemini_speech

        speech = create_gemini_speech()
        if speech is None:
            log.warning('GEMINI_API_KEY not set; live calls will use typed replies and browser voices')
            return NoSpeech()
        return speech
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        log.warning('OPENAI_API_KEY not set; live calls will use typed replies and browser voices')
        return NoSpeech()
    return OpenAISpeech(key, os.environ.get('OPENAI_BASE_URL'))
