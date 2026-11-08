"""Data models for Scam Coach scenarios, sessions and API payloads.

Scenario content is plain data (scenarios/*.json). The engine moves a session
through it deterministically. The model only writes the caller's wording and
classifies free-text replies into the options a step allows, so it can never
change the learning objective or the scoring.
"""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


ScenarioPhase = Literal[
    'intro', 'authority_claim', 'urgency', 'simulated_sensitive_request', 'resolution'
]

SimulatorEventType = Literal[
    'call_presented',
    'call_declined',
    'call_answered',
    'response_selected',
    'caller_challenged',
    'independent_verification_requested',
    'sensitive_information_refused',
    'dummy_code_disclosed',
    'dummy_pin_disclosed',
    'dummy_personal_info_disclosed',
    'simulated_remote_access_allowed',
    'simulated_payment_made',
    'keypad_pressed',
    'free_text_unclear',
    'hint_requested',
    'call_ended',
]

DISCLOSURE_EVENTS: tuple[str, ...] = (
    'dummy_code_disclosed',
    'dummy_pin_disclosed',
    'dummy_personal_info_disclosed',
    'simulated_remote_access_allowed',
    'simulated_payment_made',
)

ResponseBehavior = Literal['neutral', 'challenge', 'verify', 'refuse', 'comply']
Outcome = Literal['protected', 'recovered', 'exposed', 'not_engaged']


# ---------------------------------------------------------------- scenario data


class ResponseOption(CamelModel):
    id: str
    label: str
    behavior: ResponseBehavior
    next: str
    keypad: str | None = None
    events: list[SimulatorEventType] = []
    rationale: str


class SimulatedSms(CamelModel):
    sender: str
    body: str


class _BaseNode(CamelModel):
    id: str
    phase: ScenarioPhase
    caller_lines: list[str]
    caller_goal: str | None = None
    red_flags: list[str] = []
    sms: SimulatedSms | None = None
    recording_pool: str | None = None


class DialogueNode(_BaseNode):
    kind: Literal['dialogue']
    options: list[ResponseOption]
    hint: str | None = None
    accepts_speech: bool = True


class EndingNode(_BaseNode):
    kind: Literal['ending']
    ending_id: str
    ending_id_if_disclosed: str | None = None


ScenarioNode = Annotated[Union[DialogueNode, EndingNode], Field(discriminator='kind')]


class RedFlag(CamelModel):
    id: str
    title: str
    explanation: str


class ScenarioEnding(CamelModel):
    id: str
    title: str
    outcome: Outcome
    summary: str


class CallerInfo(CamelModel):
    display_name: str
    display_number: str
    agent_name: str
    voice: dict[str, float] | None = None


class ControlEndings(CamelModel):
    declined: str
    hung_up_safe: str
    hung_up_after_disclosure: str


class RecordingClip(CamelModel):
    id: str
    pool: str
    transcript: str
    duration_sec: float
    dataset_file: str
    ftc_letter: str


class Scenario(CamelModel):
    id: str
    title: str
    description: str
    difficulty: Literal['beginner', 'intermediate', 'advanced']
    estimated_minutes: int
    learning_objectives: list[str]
    caller: CallerInfo
    provenance: str | None = None
    start_node_id: str
    nodes: dict[str, ScenarioNode]
    red_flags: dict[str, RedFlag]
    endings: dict[str, ScenarioEnding]
    control_endings: ControlEndings
    safer_alternatives: list[str]
    recovery_steps: list[str]
    recording_pools: list[str] = []
    # Filled in by the loader from recordings.json.
    recordings: list[RecordingClip] = []


# ---------------------------------------------------------------- sessions


class SimulatorEvent(CamelModel):
    id: str
    scenario_id: str
    timestamp_ms: int
    type: SimulatorEventType
    phase: ScenarioPhase | None = None
    node_id: str | None = None
    option_id: str | None = None
    ended_by: Literal['user_hang_up', 'scenario_ending', 'declined'] | None = None


class TranscriptEntry(CamelModel):
    id: str
    speaker: Literal['caller', 'user', 'sms', 'system']
    text: str
    sender: str | None = None
    clip_id: str | None = None
    # How the caller line was produced: real recording, model, or the scripted fallback.
    source: Literal['recording', 'model', 'scripted'] | None = None
    # When the entry happened (epoch ms), for timestamps in the saved transcript.
    at_ms: int | None = None


SessionStatus = Literal['ringing', 'active', 'ended']


class SimulatorSession(CamelModel):
    session_id: str
    scenario_id: str
    status: SessionStatus
    current_node_id: str
    started_at_ms: int
    answered_at_ms: int | None = None
    ended_at_ms: int | None = None
    ending_id: str | None = None
    events: list[SimulatorEvent] = []
    transcript: list[TranscriptEntry] = []
    red_flags_seen: list[str] = []
    visited_node_ids: list[str] = []
    recording_ids: dict[str, str] = {}
    # Consecutive unclear free-text replies at the current node.
    unclear_streak: int = 0
    seq: int = 0
