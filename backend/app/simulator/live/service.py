"""Lifecycle of live AI practice calls.

start -> (ringing) -> answer: the AI caller opens -> turns: the user speaks or types,
the reply streams back sentence by sentence (each sentence is spoken via TTS as soon
as it's complete) -> the user hangs up or the caller ends the call -> the transcript
is saved to backend/data/call_transcripts/ and the debrief is built.

Sessions live in memory (30 min TTL). Audio is never stored. Hang-up never waits for
an in-flight model call.
"""

import asyncio
import logging
import random
import re
import secrets
import time
from collections import OrderedDict
from collections.abc import AsyncIterator
from pathlib import Path

from ..debrief import Debrief
from ..safety import caller_line_ok, redact_user_text
from ..service import BACKEND_ROOT, InvalidAction, SessionNotFound, transcript_dir
from .conversation import END_TOKEN, MAX_USER_TURNS, LLMUnavailable, build_system_prompt
from .corpus import load_corpus
from .debrief import build_live_debrief
from .models import LiveEntry, LiveEntryView, LiveSession, LiveSessionView, Spot
from .scenarios import get_live_scenario, pick_scenario
from .speech import SpeechError, SpeechUnavailable
from .tactics import heuristic_actions, heuristic_tactics
from .transcript import format_live_transcript, live_transcript_filename

log = logging.getLogger(__name__)

SESSION_TTL_S = 30 * 60
MAX_SESSIONS = 500
OPENING = '[The call connects. They pick up and say: “Hello?”]'
SILENCE = '[They have been quiet for several seconds.]'
CUT_OFF = '[You were cut off mid-sentence: they started talking over you.]'
WRAP_UP = '[It’s time to wrap the call up in your next reply.]'
# A spoken sentence: end punctuation (plus closing quotes) followed by a space. The first
# few characters are skipped so very short fragments ("Okay.") join the next sentence.
_SENTENCE_END = re.compile(r'[.!?…]+["”’)\]]*\s')
_MIN_SENTENCE = 12


def _now() -> int:
    return int(time.time() * 1000)


def pop_sentences(buf: str) -> tuple[list[str], str]:
    out: list[str] = []
    while True:
        m = _SENTENCE_END.search(buf, _MIN_SENTENCE)
        if not m:
            return out, buf
        out.append(buf[: m.end()].strip())
        buf = buf[m.end():]


class LiveService:
    def __init__(self, caller, speech, transcripts: Path | None = None, rng: random.Random | None = None):
        self.caller = caller
        self.speech = speech
        self.transcript_dir = transcripts or transcript_dir()
        self.rng = rng or random.Random()
        self._sessions: OrderedDict[str, tuple[LiveSession, float]] = OrderedDict()
        self._locks: dict[str, asyncio.Lock] = {}
        self._assessments: dict[str, list[asyncio.Task]] = {}
        self._saving: dict[str, asyncio.Task] = {}

    # ------------------------------------------------------------ storage

    def _evict(self) -> None:
        cutoff = time.monotonic() - SESSION_TTL_S
        for sid in [sid for sid, (_, t) in self._sessions.items() if t < cutoff]:
            self._drop(sid)
        while len(self._sessions) > MAX_SESSIONS:
            self._drop(next(iter(self._sessions)))

    def _drop(self, sid: str) -> None:
        self._sessions.pop(sid, None)
        self._locks.pop(sid, None)
        self._assessments.pop(sid, None)
        self._saving.pop(sid, None)

    def _get(self, sid: str) -> LiveSession:
        entry = self._sessions.get(sid)
        if not entry:
            raise SessionNotFound(sid)
        self._sessions[sid] = (entry[0], time.monotonic())
        self._sessions.move_to_end(sid)
        return entry[0]

    def _scenario(self, s: LiveSession):
        sc = get_live_scenario(s.scenario_id)
        assert sc is not None
        return sc

    def view(self, s: LiveSession) -> LiveSessionView:
        sc = self._scenario(s)
        return LiveSessionView(
            session_id=s.session_id,
            scenario_id=s.scenario_id,
            title=sc.title,
            caller_display=sc.caller_display,
            caller_number=sc.caller_number,
            status=s.status,
            answered_at_ms=s.answered_at_ms,
            entries=[
                LiveEntryView(id=e.id, speaker=e.speaker, text=e.text, at_ms=e.at_ms, interrupted=e.interrupted,
                              flags=e.flags if s.status == 'ended' else [])
                for e in s.entries
            ],
            speech_available=self.speech.available,
            transcript_file=s.transcript_file,
        )

    def status(self) -> dict:
        return {'llm': self.caller.available, 'speech': self.speech.available, 'model': getattr(self.caller, 'model', None)}

    # ------------------------------------------------------------ lifecycle

    def start(self, difficulty: str, tz_offset_min: int | None = None, previous_session_id: str | None = None) -> LiveSessionView:
        if not self.caller.available:
            raise LLMUnavailable('The AI caller isn’t configured on the server.')
        self._evict()
        prev = self._sessions.get(previous_session_id or '')
        sc = pick_scenario(difficulty, avoid=prev[0].scenario_id if prev else None, rng=self.rng)
        grounding = load_corpus().retrieve(sc.retrieval_query, sc.retrieval_scam_types, sc.tactics, k=4, rng=self.rng)
        s = LiveSession(
            session_id=f'l{secrets.token_hex(8)}',
            scenario_id=sc.id,
            difficulty=difficulty,
            started_at_ms=_now(),
            tz_offset_min=tz_offset_min,
            grounding_ids=[d.id for d in grounding],
            model_label=getattr(self.caller, 'label', 'AI'),
            system_prompt=build_system_prompt(sc, grounding),
        )
        self._sessions[s.session_id] = (s, time.monotonic())
        return self.view(s)

    def decline(self, sid: str) -> LiveSessionView:
        s = self._get(sid)
        if s.status != 'ringing':
            raise InvalidAction('the call is not ringing')
        self._end(s, 'declined')
        return self.view(s)

    def hang_up(self, sid: str) -> LiveSessionView:
        """Never takes the session lock: an in-flight reply sees status 'ended' and stops."""
        s = self._get(sid)
        if s.status == 'active':
            s.entries.append(LiveEntry(id=s.next_id('t'), speaker='system', text='You hung up.', at_ms=_now()))
            self._end(s, 'user_hang_up')
        return self.view(s)

    def spot(self, sid: str, entry_id: str | None) -> LiveSessionView:
        """User tapped 🚩. Attributed to the caller line on screen (default: the latest)."""
        s = self._get(sid)
        if s.status == 'active':
            target = next((e for e in s.entries if e.id == entry_id and e.speaker == 'caller'), None) or s.last_caller()
            if target:
                s.spots.append(Spot(entry_id=target.id, at_ms=_now()))
        return self.view(s)

    async def answer(self, sid: str) -> AsyncIterator[dict]:
        s = self._get(sid)
        async with self._locks.setdefault(sid, asyncio.Lock()):
            if s.status != 'ringing':
                yield {'type': 'error', 'message': 'This call isn’t ringing anymore.'}
                return
            s.status = 'active'
            s.answered_at_ms = _now()
            s.messages.append({'role': 'user', 'content': OPENING})
            async for ev in self._reply(s, None, OPENING):
                yield ev

    async def turn(
        self,
        sid: str,
        *,
        text: str | None = None,
        audio: bytes | None = None,
        content_type: str = '',
        interrupted: bool = False,
        heard: list[str] | None = None,
        silence: bool = False,
    ) -> AsyncIterator[dict]:
        s = self._get(sid)
        async with self._locks.setdefault(sid, asyncio.Lock()):
            if s.status != 'active':
                yield {'type': 'error', 'message': 'The call has ended.'}
                return
            user_entry: LiveEntry | None = None
            if silence:
                content = SILENCE
            else:
                if audio is not None:
                    try:
                        text = await self.speech.transcribe(audio, content_type)
                    except (SpeechError, SpeechUnavailable) as e:
                        yield {'type': 'error', 'message': str(e)}
                        return
                said = redact_user_text(text or '')
                if not said:
                    yield {'type': 'no_speech'}
                    return
                if s.status != 'active':  # hung up while transcribing
                    return
                if interrupted and (last := s.last_caller()):
                    last.interrupted = True
                    # Keep the transcript in sync with the audio: only the sentences actually heard.
                    if heard is not None:
                        spoken = [s.utterance_text[u] for u in last.utterances if u in set(heard) and u in s.utterance_text]
                        last.text = ' '.join(spoken) or last.text
                user_entry = LiveEntry(id=s.next_id('t'), speaker='user', text=said, at_ms=_now())
                s.entries.append(user_entry)
                s.user_turns += 1
                yield {'type': 'user', 'entry': self._entry_json(user_entry)}
                content = f'{CUT_OFF} {said}' if interrupted else said
            if s.user_turns >= MAX_USER_TURNS:
                content = f'{content} {WRAP_UP}'
            s.messages.append({'role': 'user', 'content': content})
            async for ev in self._reply(s, user_entry, content):
                yield ev

    # ------------------------------------------------------------ the AI caller's reply

    @staticmethod
    def _entry_json(e: LiveEntry) -> dict:
        return LiveEntryView(id=e.id, speaker=e.speaker, text=e.text, at_ms=e.at_ms, interrupted=e.interrupted).model_dump(by_alias=True)

    async def _reply(self, s: LiveSession, user_entry: LiveEntry | None, user_content: str) -> AsyncIterator[dict]:
        previous_caller = (s.last_caller().text if s.last_caller() else '')
        entry = LiveEntry(id=s.next_id('t'), speaker='caller', text='', at_ms=_now())
        ended = False
        completed = False
        stream = None

        def emit(sentence: str) -> dict | None:
            nonlocal ended
            if END_TOKEN in sentence:
                ended = True
            clean = sentence.replace(END_TOKEN, '').strip()
            if not clean:
                return None
            if not caller_line_ok(clean):
                log.warning('Dropped an unsafe caller sentence in %s', s.session_id)
                return None
            if not entry.text:
                entry.at_ms = _now()
                s.entries.append(entry)
            uid = s.next_id('u')
            s.utterance_text[uid] = clean
            entry.utterances.append(uid)
            entry.text = f'{entry.text} {clean}'.strip()
            return {'type': 'caller', 'entryId': entry.id, 'utteranceId': uid, 'text': clean, 'atMs': entry.at_ms}

        try:
            try:
                stream = self.caller.stream_reply(s.system_prompt, s.messages)
                buf = ''
                async for delta in stream:
                    if s.status != 'active':
                        break  # hung up mid-reply
                    buf += delta
                    sentences, buf = pop_sentences(buf)
                    for sentence in sentences:
                        if (ev := emit(sentence)):
                            yield ev
                if s.status == 'active' and buf.strip() and (ev := emit(buf)):
                    yield ev
                completed = s.status == 'active'
            except LLMUnavailable as e:
                yield {'type': 'error', 'message': str(e)}
                return
            if completed and not entry.text:
                # Refused, filtered or empty: end the call gracefully instead of going silent.
                if (ev := emit('Sorry, I have to go. I’ll call you back.')):
                    yield ev
                ended = True
            if completed and (ended or s.user_turns >= MAX_USER_TURNS + 2):
                self._end(s, 'caller_ended' if ended else 'turn_limit')
            yield {'type': 'done', 'entryId': entry.id if entry.text else None, 'ended': s.status == 'ended',
                   'session': self.view(s).model_dump(by_alias=True)}
        finally:
            # Runs on completion, error, hang-up, or the client disconnecting (barge-in).
            if entry.text:
                if not completed:
                    entry.interrupted = True
                content = stream.content if (completed and stream and stream.content) else [{'type': 'text', 'text': entry.text}]
                s.messages.append({'role': 'assistant', 'content': content})
                self._assess_later(s, entry, user_entry, previous_caller, user_content)

    def _assess_later(self, s: LiveSession, caller_entry: LiveEntry, user_entry: LiveEntry | None, previous: str, user_content: str) -> None:
        async def run() -> None:
            a = await self.caller.assess(previous, user_entry.text if user_entry else user_content, caller_entry.text)
            caller_entry.flags = a.caller_tactics if a else heuristic_tactics(caller_entry.text)
            if user_entry:
                user_entry.flags = a.user_actions if a else heuristic_actions(user_entry.text)

        self._assessments.setdefault(s.session_id, []).append(asyncio.create_task(run()))

    # ------------------------------------------------------------ end, debrief, transcript

    def _end(self, s: LiveSession, reason: str) -> None:
        if s.status == 'ended':
            return
        s.status = 'ended'
        s.end_reason = reason
        s.ended_at_ms = _now()
        if s.entries and s.entries[-1].speaker == 'user':
            u = s.entries[-1]
            if not u.flags:  # last words before hanging up aren't assessed with a reply
                u.flags = heuristic_actions(u.text)
        # Routes that end a call are async, so the save runs on the server's event loop.
        self._saving[s.session_id] = asyncio.get_running_loop().create_task(self._save(s))

    async def _settled(self, s: LiveSession) -> None:
        tasks = self._assessments.get(s.session_id, [])
        if tasks:
            await asyncio.wait(tasks, timeout=20)

    async def _save(self, s: LiveSession) -> None:
        await self._settled(s)
        sc = self._scenario(s)
        debrief = build_live_debrief(sc, s)
        path = self.transcript_dir / live_transcript_filename(sc, s)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix('.txt.tmp')
            tmp.write_text(format_live_transcript(sc, s, debrief), encoding='utf-8')
            tmp.replace(path)
        except OSError as e:
            log.warning('Could not save live transcript for %s: %s', s.session_id, e)
            return
        try:
            s.transcript_file = path.relative_to(BACKEND_ROOT).as_posix()
        except ValueError:
            s.transcript_file = path.as_posix()

    async def debrief(self, sid: str) -> tuple[Debrief, LiveSessionView]:
        s = self._get(sid)
        if s.status != 'ended':
            raise InvalidAction('the call has not ended yet')
        if (task := self._saving.get(sid)):
            await asyncio.wait([task], timeout=25)
        else:
            await self._settled(s)
        return build_live_debrief(self._scenario(s), s), self.view(s)

    async def transcript(self, sid: str) -> tuple[str, str]:
        s = self._get(sid)
        if s.status != 'ended':
            raise InvalidAction('the call has not ended yet')
        if (task := self._saving.get(sid)):
            await asyncio.wait([task], timeout=25)
        if not s.transcript_file:
            raise InvalidAction('the transcript could not be saved')
        path = BACKEND_ROOT / s.transcript_file if not Path(s.transcript_file).is_absolute() else Path(s.transcript_file)
        return path.name, path.read_text(encoding='utf-8')

    # ------------------------------------------------------------ speech

    def utterance(self, sid: str, uid: str) -> tuple[str, str]:
        s = self._get(sid)
        text = s.utterance_text.get(uid)
        if text is None:
            raise SessionNotFound(uid)
        sc = self._scenario(s)
        return text, f'{sc.voice_style} This is a fictional training call; speak naturally, like a real phone conversation.'
