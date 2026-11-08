"""State of one live AI practice call. In memory only; the finished transcript is saved to disk."""

from typing import Literal

from pydantic import Field

from ..models import CamelModel


class LiveEntry(CamelModel):
    id: str
    speaker: Literal['caller', 'user', 'system']
    text: str
    at_ms: int
    # The person started talking before the caller finished this line.
    interrupted: bool = False
    # Caller lines: tactic ids from the turn assessment. User lines: action ids.
    flags: list[str] = []
    # Caller lines: ids of the spoken sentences (for text-to-speech).
    utterances: list[str] = []


class Spot(CamelModel):
    """The person tapped 🚩 while this caller line was on screen."""

    entry_id: str
    at_ms: int


class LiveSession(CamelModel):
    session_id: str
    scenario_id: str
    difficulty: str
    status: Literal['ringing', 'active', 'ended'] = 'ringing'
    started_at_ms: int
    answered_at_ms: int | None = None
    ended_at_ms: int | None = None
    end_reason: Literal['user_hang_up', 'caller_ended', 'declined', 'turn_limit'] | None = None
    tz_offset_min: int | None = None
    grounding_ids: list[str] = []
    # Which model wrote the caller's lines, e.g. "OpenAI gpt-6.1-terra".
    model_label: str = 'AI'
    entries: list[LiveEntry] = []
    spots: list[Spot] = []
    user_turns: int = 0
    seq: int = 0
    transcript_file: str | None = None
    # Claude message history (append-only) and utterance texts; never sent to the browser.
    system_prompt: str = Field(default='', exclude=True)
    messages: list[dict] = Field(default_factory=list, exclude=True)
    utterance_text: dict[str, str] = Field(default_factory=dict, exclude=True)

    def next_id(self, prefix: str) -> str:
        self.seq += 1
        return f'{self.session_id}-{prefix}{self.seq}'

    def last_caller(self) -> LiveEntry | None:
        return next((e for e in reversed(self.entries) if e.speaker == 'caller'), None)


class LiveEntryView(CamelModel):
    id: str
    speaker: str
    text: str
    at_ms: int
    interrupted: bool
    # Tactic / action labels, only after the call has ended (no mid-call spoilers).
    flags: list[str] = []


class LiveSessionView(CamelModel):
    session_id: str
    scenario_id: str
    title: str
    caller_display: str
    caller_number: str
    status: str
    answered_at_ms: int | None
    entries: list[LiveEntryView]
    speech_available: bool
    transcript_file: str | None
