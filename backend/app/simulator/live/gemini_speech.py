"""Google Gemini speech-to-text and text-to-speech for live practice calls.

Same interface as OpenAISpeech: transcribe(audio, content_type) -> str and
synthesize(text, instructions) -> async iterator of audio bytes. Audio from the
user is sent inline for transcription and discarded; nothing is stored.

Config (env):
  GEMINI_API_KEY                required
  SCAM_COACH_GEMINI_STT_MODEL   default gemini-3.5-flash-lite (audio understanding, prompted to transcribe)
  SCAM_COACH_GEMINI_TTS_MODEL   the voice model to try first (default gemini-3.8-flash-tts)
  SCAM_COACH_GEMINI_TTS_MODELS  comma-separated fallback order; each model has its own quota, so when
                                one hits its limit the next one speaks instead of a robotic browser voice
  SCAM_COACH_GEMINI_VOICE       default Kore (one of Gemini's prebuilt voices)
"""

import base64
import json
import logging
import os
import re
import struct
import time
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


# Natural-sounding Gemini voice models, best first. Each has its own rate limit.
TTS_MODELS = ('gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts')
QUOTA_COOLDOWN_S = 60.0  # skip a rate-limited model this long unless the API says otherwise


def plausible_length(wav_or_pcm_bytes: int, text: str, rate: int = 24000) -> bool:
    """Rejects clips far longer than the line could take to say (some models pad with sound)."""
    seconds = wav_or_pcm_bytes / (rate * 2)
    words = max(1, len(text.split()))
    return seconds <= 2.5 + words * 0.6


def _retry_after(body: bytes) -> float:
    """Seconds the API asks us to wait (RetryInfo.retryDelay like "37s"), else the default cooldown."""
    try:
        for d in (json.loads(body or b'{}').get('error') or {}).get('details') or []:
            m = re.fullmatch(r'(\d+(?:\.\d+)?)s', str(d.get('retryDelay', '')))
            if m:
                return max(1.0, float(m.group(1)))
    except (ValueError, AttributeError):
        pass
    return QUOTA_COOLDOWN_S


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
        chain = [m.strip() for m in os.environ.get('SCAM_COACH_GEMINI_TTS_MODELS', '').split(',') if m.strip()] or list(TTS_MODELS)
        first = os.environ.get('SCAM_COACH_GEMINI_TTS_MODEL', '').strip()
        self.tts_models = [first] + [m for m in chain if m != first] if first else chain
        self.voice = os.environ.get('SCAM_COACH_GEMINI_VOICE', 'Kore')
        self._resting: dict[str, float] = {}  # model -> monotonic time it may be tried again

    @property
    def tts_model(self) -> str:
        return self.tts_models[0]

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

    def _ready_models(self) -> list[str]:
        now = time.monotonic()
        ready = [m for m in self.tts_models if self._resting.get(m, 0) <= now]
        # If every model is resting, try the one that recovers soonest rather than going silent.
        return ready or sorted(self.tts_models, key=lambda m: self._resting.get(m, 0))[:1]

    async def synthesize(self, text: str, instructions: str) -> AsyncIterator[bytes]:
        """One sentence at a time (the service splits replies), returned as a playable WAV.

        `instructions` (the scenario's voice style) is not sent; see the note below.
        Tries each natural voice model in order: a model that is rate-limited or missing
        is skipped (and rested), so the caller keeps a human voice whenever any model has quota.
        """
        body = {
            # Just the line: style notes make some models pad the clip with long stretches of sound,
            # and the prebuilt voices already sound like a person talking.
            'contents': [{'role': 'user', 'parts': [{'text': text[:4000]}]}],
            'generationConfig': {
                'responseModalities': ['AUDIO'],
                'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': self.voice}}},
            },
        }
        audio = None
        padded = None  # an over-long clip: still a human voice, so it beats no voice at all
        for model in self._ready_models():
            try:
                r = await self._client.post(f'/models/{model}:generateContent', json=body)
            except httpx.HTTPError as e:
                log.warning('Gemini speech request to %s failed: %s', model, type(e).__name__)
                continue
            if r.status_code == 429 or (r.status_code == 404):
                self._resting[model] = time.monotonic() + (_retry_after(r.content) if r.status_code == 429 else 3600)
                log.warning('Gemini voice %s unavailable (HTTP %s); trying the next voice model', model, r.status_code)
                continue
            if r.status_code != 200:
                try:
                    raise_for_error(r.status_code, r.content, 'speech')
                except GeminiError as e:
                    if e.fatal:  # bad key: no other model will work either
                        raise SpeechError('The caller’s voice couldn’t be generated.') from e
                continue
            audio = next(
                (p['inlineData'] for c in r.json().get('candidates') or [] for p in (c.get('content') or {}).get('parts') or []
                 if p.get('inlineData', {}).get('data')),
                None,
            )
            if not audio:
                continue
            raw = base64.b64decode(audio['data'])
            mime = (audio.get('mimeType') or '').lower()
            if ('wav' in mime or raw[:4] == b'RIFF') or plausible_length(len(raw), text, _rate(mime)):
                break
            log.warning('Gemini voice %s returned an implausibly long clip; trying the next voice model', model)
            padded = padded or (raw, mime)
            audio = None
        if not audio and padded:
            audio, (raw, mime) = True, padded
        if not audio:
            raise SpeechError('The caller’s voice couldn’t be generated.')
        yield raw if ('wav' in mime or raw[:4] == b'RIFF') else pcm_to_wav(raw, _rate(mime))


def create_gemini_speech() -> GeminiSpeech | None:
    key = api_key()
    return GeminiSpeech(make_client(key, os.environ.get('GEMINI_BASE_URL'))) if key else None
