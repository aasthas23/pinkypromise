"""HTTP routes for live AI practice calls (/simulator/live/...).

Replies stream as server-sent events (one JSON object per `data:` line):
  {"type":"user","entry":{...}}            what the user said (transcribed, redacted)
  {"type":"no_speech"}                     nothing intelligible was heard
  {"type":"caller","entryId","utteranceId","text","atMs"}   one spoken sentence, as soon as it's ready
  {"type":"done","entryId","ended","session":{...}}
  {"type":"error","message"}
Audio for each caller sentence streams from GET .../speech/{utteranceId}.
"""

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import Field

from ..debrief import Debrief, outcome_definitions
from ..models import CamelModel
from ..service import InvalidAction, SessionNotFound
from .conversation import LLMUnavailable
from .models import LiveSessionView
from .service import LiveService
from .speech import MAX_AUDIO_BYTES, SpeechError, SpeechUnavailable

router = APIRouter(prefix='/simulator/live', tags=['live practice calls'])


def _svc(request: Request) -> LiveService:
    return request.app.state.live


class StartLive(CamelModel):
    difficulty: str = Field(pattern='^(beginner|intermediate|advanced)$')
    tz_offset_min: int | None = Field(default=None, ge=-14 * 60, le=14 * 60)
    previous_session_id: str | None = None


class TextTurn(CamelModel):
    text: str | None = Field(default=None, max_length=600)
    interrupted: bool = False
    # Caller sentences the person actually heard before interrupting.
    heard: list[str] | None = None
    silence: bool = False


class SpotRequest(CamelModel):
    entry_id: str | None = None


class LiveDebriefResponse(CamelModel):
    debrief: Debrief
    session: LiveSessionView


def _http(e: Exception) -> HTTPException:
    if isinstance(e, SessionNotFound):
        return HTTPException(404, 'This practice call has expired. Start a new one.')
    if isinstance(e, LLMUnavailable):
        return HTTPException(503, str(e))
    return HTTPException(409, str(e))


def _sse(events: AsyncIterator[dict]) -> StreamingResponse:
    async def body():
        async for ev in events:
            yield f'data: {json.dumps(ev, ensure_ascii=False)}\n\n'

    return StreamingResponse(body(), media_type='text/event-stream', headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})


@router.get('/status')
def status(request: Request):
    """Whether the AI caller (LLM) and server speech are configured. No secrets are returned."""
    return _svc(request).status() | {'learningOutcomes': [o.model_dump(by_alias=True) for o in outcome_definitions()]}


@router.post('/sessions', response_model=LiveSessionView, response_model_by_alias=True)
async def start(body: StartLive, request: Request):
    try:
        return _svc(request).start(body.difficulty, body.tz_offset_min, body.previous_session_id)
    except LLMUnavailable as e:
        raise _http(e)


@router.post('/sessions/{sid}/answer')
def answer(sid: str, request: Request):
    svc = _svc(request)
    try:
        svc._get(sid)
    except SessionNotFound as e:
        raise _http(e)
    return _sse(svc.answer(sid))


@router.post('/sessions/{sid}/turn')
async def turn(sid: str, request: Request, interrupted: bool = False, heard: str | None = None):
    """Body is either recorded audio (Content-Type audio/*) or JSON {text, interrupted, silence}."""
    svc = _svc(request)
    try:
        svc._get(sid)
    except SessionNotFound as e:
        raise _http(e)
    ctype = request.headers.get('content-type', '')
    if ctype.startswith('audio/'):
        if int(request.headers.get('content-length') or 0) > MAX_AUDIO_BYTES:
            raise HTTPException(413, 'That recording is too long.')
        audio = bytearray()
        async for chunk in request.stream():
            audio += chunk
            if len(audio) > MAX_AUDIO_BYTES:
                raise HTTPException(413, 'That recording is too long.')
        heard_ids = [h for h in (heard or '').split(',') if h] if heard is not None else None
        return _sse(svc.turn(sid, audio=bytes(audio), content_type=ctype, interrupted=interrupted, heard=heard_ids))
    try:
        body = TextTurn.model_validate(await request.json())
    except Exception:
        raise HTTPException(422, 'Send recorded audio or JSON with text.')
    return _sse(svc.turn(sid, text=body.text, interrupted=body.interrupted, heard=body.heard, silence=body.silence))


@router.post('/sessions/{sid}/spot', response_model=LiveSessionView, response_model_by_alias=True)
async def spot(sid: str, body: SpotRequest, request: Request):
    try:
        return _svc(request).spot(sid, body.entry_id)
    except SessionNotFound as e:
        raise _http(e)


@router.post('/sessions/{sid}/hangup', response_model=LiveSessionView, response_model_by_alias=True)
async def hang_up(sid: str, request: Request):
    try:
        return _svc(request).hang_up(sid)
    except SessionNotFound as e:
        raise _http(e)


@router.post('/sessions/{sid}/decline', response_model=LiveSessionView, response_model_by_alias=True)
async def decline(sid: str, request: Request):
    try:
        return _svc(request).decline(sid)
    except (SessionNotFound, InvalidAction) as e:
        raise _http(e)


@router.get('/sessions/{sid}/speech/{uid}')
async def speech(sid: str, uid: str, request: Request):
    """Streams the AI voice for one caller sentence. Only text the AI caller generated can be spoken."""
    svc = _svc(request)
    try:
        text, instructions = svc.utterance(sid, uid)
    except SessionNotFound as e:
        raise _http(e)
    audio = svc.speech.synthesize(text, instructions)
    try:
        first = await audio.__anext__()  # fail with an HTTP error (not a broken stream) if TTS is down
    except (SpeechError, SpeechUnavailable) as e:
        raise HTTPException(503, str(e))
    except StopAsyncIteration:
        raise HTTPException(502, 'No audio was generated.')

    async def body():
        yield first
        try:
            async for chunk in audio:
                yield chunk
        except SpeechError:
            return

    return StreamingResponse(body(), media_type=svc.speech.media_type, headers={'Cache-Control': 'no-store'})


@router.get('/sessions/{sid}/debrief', response_model=LiveDebriefResponse, response_model_by_alias=True)
async def debrief(sid: str, request: Request):
    try:
        d, view = await _svc(request).debrief(sid)
    except (SessionNotFound, InvalidAction) as e:
        raise _http(e)
    return LiveDebriefResponse(debrief=d, session=view)


@router.get('/sessions/{sid}/transcript.txt', response_class=PlainTextResponse)
async def transcript(sid: str, request: Request):
    """The finished call's saved transcript (backend/data/call_transcripts/)."""
    try:
        name, text = await _svc(request).transcript(sid)
    except (SessionNotFound, InvalidAction) as e:
        raise _http(e)
    return PlainTextResponse(text, media_type='text/plain; charset=utf-8',
                             headers={'Content-Disposition': f'inline; filename="{name}"', 'Cache-Control': 'no-store'})
