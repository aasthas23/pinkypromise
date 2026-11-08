import os
import sys
from pathlib import Path

import tempfile

# Tests never call the real model, and never write into backend/data/.
os.environ.setdefault('SCAM_COACH_DIALOGUE', 'scripted')
os.environ['SCAM_COACH_TRANSCRIPT_DIR'] = tempfile.mkdtemp(prefix='scam_coach_transcripts_')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
