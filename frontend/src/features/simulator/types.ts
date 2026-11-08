/**
 * Types for the Scam Coach simulator API (backend/app/simulator).
 *
 * The backend owns the scenarios, the deterministic call flow and the debrief,
 * and uses Claude to write the caller's lines. The app renders what it gets
 * back. It never sees where an option leads or how it's scored.
 */

export type ScenarioPhase =
  | 'intro'
  | 'authority_claim'
  | 'urgency'
  | 'simulated_sensitive_request'
  | 'resolution';

export type Outcome = 'protected' | 'recovered' | 'exposed' | 'not_engaged';

export type CallerInfo = {
  displayName: string;
  displayNumber: string;
  agentName: string;
  voice?: { pitch?: number; rate?: number } | null;
};

export type ScenarioSummary = {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedMinutes: number;
  learningObjectives: string[];
  caller: CallerInfo;
  provenance: string | null;
  hasRecording: boolean;
};

export type TranscriptEntry = {
  id: string;
  speaker: 'caller' | 'user' | 'sms' | 'system';
  text: string;
  sender?: string | null;
  /** Set when this caller entry is a real recording bundled with the app. */
  clipId?: string | null;
  /** How a caller line was produced. */
  source?: 'recording' | 'model' | 'scripted' | null;
};

export type OptionView = { id: string; label: string; keypad?: string | null };

export type NodeView = {
  id: string;
  phase: ScenarioPhase;
  acceptsSpeech: boolean;
  options: OptionView[];
  hasHint: boolean;
};

export type SessionView = {
  sessionId: string;
  scenarioId: string;
  status: 'ringing' | 'active' | 'ended';
  transcript: TranscriptEntry[];
  node: NodeView | null;
  endingId: string | null;
  answeredAtMs: number | null;
  freeTextAvailable: boolean;
  notice?: string | null;
};

export type SimulatorStatus = { dialogue: 'model' | 'scripted'; model: string | null };

export type TimelineKind = 'protective' | 'risky' | 'neutral' | 'info';

export type TimelineItem = {
  id: string;
  offsetMs: number;
  label: string;
  quote?: string | null;
  kind: TimelineKind;
  rationale?: string | null;
};

export type RedFlag = { id: string; title: string; explanation: string };

export type AttemptDifference = { text: string; direction: 'better' | 'worse' | 'same' };

export type Debrief = {
  scenarioTitle: string;
  ending: { id: string; title: string; outcome: Outcome; summary: string };
  outcome: Outcome;
  durationMs: number;
  timeline: TimelineItem[];
  keyBehaviors: {
    answered: boolean;
    pressedKeypad: boolean;
    challengedCaller: boolean;
    verifiedIndependently: boolean;
    protectedSensitive: boolean | null;
    disclosed: string[];
    hintsUsed: number;
  };
  tally: { protective: number; risky: number };
  redFlags: RedFlag[];
  takeaways: string[];
  saferAlternatives: string[];
  recoverySteps: string[];
  provenance?: string | null;
  recording?: { id: string; datasetFile: string } | null;
  usedModel: boolean;
  comparison: AttemptDifference[];
};

/** A real robocall recording bundled with the app (see scripts/robocalls). */
export type RecordingClip = {
  id: string;
  pool: string;
  transcript: string;
  durationSec: number;
  datasetFile: string;
  ftcLetter: string;
  /** Bundled asset module id from require(). */
  source: number;
};
