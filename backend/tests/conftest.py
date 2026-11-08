import os
import sys
from pathlib import Path

# Tests never call the real model.
os.environ.setdefault('SCAM_COACH_DIALOGUE', 'scripted')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
