"""HTTP routes for the Scam Coach simulator."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import Field

from .debrief import Debrief
from .models import CamelModel
from .service import (
    InvalidAction,
    ScenarioSummary,
    SessionNotFound,
    SessionView,
    SimulatorService,
)
from .safety import MAX_USER_TEXT

router = APIRouter(prefix='/simulator', tags=['simulator'])


def _svc(request: Request) -> SimulatorService:
    return request.app.state.simulator


class StartRequest(CamelModel):
    scenario_id: str
    previous_session_id: str | None = None


class ChooseRequest(CamelModel):
    option_id: str


class SayRequest(CamelModel):
    # Allow some slack over the redaction cap; longer input is truncated, not rejected.
    text: str = Field(min_length=1, max_length=MAX_USER_TEXT * 2)


class HintResponse(CamelModel):
    session: SessionView
    hint: str | None


class StatusResponse(CamelModel):
    dialogue: str
    model: str | None


async def _run(coro):
    try:
        return await coro
    except SessionNotFound:
        raise HTTPException(404, 'Session not found or expired. Start a new practice call.')
    except InvalidAction as e:
        raise HTTPException(409, str(e))


@router.get('/status', response_model=StatusResponse, response_model_by_alias=True)
def status(request: Request):
    d = _svc(request).dialogue
    return StatusResponse(
        dialogue='model' if d.available else 'scripted',
        model=getattr(d, 'model', None) if d.available else None,
    )


@router.get('/scenarios', response_model=list[ScenarioSummary], response_model_by_alias=True)
def list_scenarios(request: Request):
    return _svc(request).list_scenarios()


@router.post('/sessions', response_model=SessionView, response_model_by_alias=True)
def start_session(body: StartRequest, request: Request):
    try:
        return _svc(request).start(body.scenario_id, body.previous_session_id)
    except SessionNotFound:
        raise HTTPException(404, 'Unknown scenario')


@router.post('/sessions/{sid}/answer', response_model=SessionView, response_model_by_alias=True)
async def answer(sid: str, request: Request):
    return await _run(_svc(request).answer(sid))


@router.post('/sessions/{sid}/decline', response_model=SessionView, response_model_by_alias=True)
async def decline(sid: str, request: Request):
    return await _run(_svc(request).decline(sid))


@router.post('/sessions/{sid}/choose', response_model=SessionView, response_model_by_alias=True)
async def choose(sid: str, body: ChooseRequest, request: Request):
    return await _run(_svc(request).choose(sid, body.option_id))


@router.post('/sessions/{sid}/say', response_model=SessionView, response_model_by_alias=True)
async def say(sid: str, body: SayRequest, request: Request):
    return await _run(_svc(request).say(sid, body.text))


@router.post('/sessions/{sid}/hangup', response_model=SessionView, response_model_by_alias=True)
async def hang_up(sid: str, request: Request):
    return await _run(_svc(request).hang_up(sid))


@router.post('/sessions/{sid}/hint', response_model=HintResponse, response_model_by_alias=True)
async def hint(sid: str, request: Request):
    async def go():
        view, text = await _svc(request).hint(sid)
        return HintResponse(session=view, hint=text)

    return await _run(go())


@router.get('/sessions/{sid}/debrief', response_model=Debrief, response_model_by_alias=True)
async def debrief(sid: str, request: Request, previous: str | None = None):
    async def go():
        return _svc(request).debrief(sid, previous)

    return await _run(go())


@router.delete('/sessions/{sid}', status_code=204)
def delete_session(sid: str, request: Request):
    _svc(request).delete(sid)
