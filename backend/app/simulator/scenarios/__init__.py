"""Loads scenario JSON files and attaches the real robocall recording metadata."""

import json
from functools import lru_cache
from pathlib import Path

from ..models import RecordingClip, Scenario

_DIR = Path(__file__).parent
# Display order: real-recording scenarios first, then fully scripted ones.
_ORDER = ['amazon-suspicious-order', 'ssa-suspension', 'account-security-sim-swap']


@lru_cache(maxsize=1)
def load_scenarios() -> dict[str, Scenario]:
    clips = [
        RecordingClip.model_validate(c)
        for c in json.loads((_DIR / 'recordings.json').read_text(encoding='utf-8'))
    ]
    scenarios: dict[str, Scenario] = {}
    for sid in _ORDER:
        data = json.loads((_DIR / f'{sid}.json').read_text(encoding='utf-8'))
        sc = Scenario.model_validate(data)
        sc.recordings = [c for c in clips if c.pool in sc.recording_pools]
        scenarios[sc.id] = sc
    return scenarios


def get_scenario(scenario_id: str) -> Scenario | None:
    return load_scenarios().get(scenario_id)
