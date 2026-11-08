/**
 * Core types for the Scam Coach simulator.
 *
 * Scenario content is plain data. The engine (engine/scenarioMachine.ts) moves a
 * session through it deterministically, and the debrief is derived from the
 * session's event log. Nothing here touches real calls, accounts or credentials.
 */

export type ScenarioPhase =
  | 'intro'
  | 'authority_claim'
  | 'urgency'
  | 'simulated_sensitive_request'
  | 'resolution';

/** Observable behaviors. We log what the user did, not what they "are". */
export type SimulatorEventType =
  | 'call_presented'
  | 'call_declined'
  | 'call_answered'
  | 'response_selected'
  | 'caller_challenged'
  | 'independent_verification_requested'
  | 'sensitive_information_refused'
  | 'dummy_code_disclosed'
  | 'dummy_pin_disclosed'
  | 'dummy_personal_info_disclosed'
  | 'simulated_remote_access_allowed'
  | 'simulated_payment_made'
  | 'keypad_pressed'
  | 'hint_requested'
  | 'call_ended';

/** Events that mean simulated sensitive information or access was handed over. */
export const DISCLOSURE_EVENTS: readonly SimulatorEventType[] = [
  'dummy_code_disclosed',
  'dummy_pin_disclosed',
  'dummy_personal_info_disclosed',
  'simulated_remote_access_allowed',
  'simulated_payment_made',
];

export type SimulatorEvent = {
  id: string;
  scenarioId: string;
  timestampMs: number;
  type: SimulatorEventType;
  phase?: ScenarioPhase;
  nodeId?: string;
  /** For response_selected: which scripted option was picked. */
  optionId?: string;
  /** For call_ended: who ended it and how. */
  endedBy?: 'user_hang_up' | 'scenario_ending' | 'declined';
};

/** How a response is classified for the debrief. */
export type ResponseBehavior = 'neutral' | 'challenge' | 'verify' | 'refuse' | 'comply';

export type ResponseOption = {
  id: string;
  /** What the user "says" — shown on the button and in the transcript. */
  label: string;
  /** If set, this is a keypad press (e.g. "1") rather than something said. */
  keypad?: string;
  behavior: ResponseBehavior;
  next: string;
  /** Extra behavioral events this choice produces (besides response_selected). */
  events?: SimulatorEventType[];
  /** Debrief explanation of why this choice was protective or risky. */
  rationale: string;
};

/** A simulated text message shown during the call (always fake, always labeled). */
export type SimulatedSms = {
  sender: string;
  body: string;
};

type BaseNode = {
  id: string;
  phase: ScenarioPhase;
  /** Lines the caller speaks on entering this node, in order. */
  callerLines: string[];
  /** Red flags the caller demonstrates in this node. */
  redFlags?: string[];
  sms?: SimulatedSms;
  /** Plays this session's real recording for the given pool before callerLines. */
  recordingPool?: string;
};

export type DialogueNode = BaseNode & {
  kind: 'dialogue';
  options: ResponseOption[];
  /** Optional training hint, only shown when the user asks for one. */
  hint?: string;
};

export type EndingNode = BaseNode & {
  kind: 'ending';
  endingId: string;
  /** Ending to use instead if the user disclosed anything earlier in the call. */
  endingIdIfDisclosed?: string;
};

export type ScenarioNode = DialogueNode | EndingNode;

export type RedFlag = {
  id: string;
  title: string;
  explanation: string;
};

export type Outcome = 'protected' | 'recovered' | 'exposed' | 'not_engaged';

export type ScenarioEnding = {
  id: string;
  title: string;
  outcome: Outcome;
  summary: string;
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

export type Scenario = {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedMinutes: number;
  learningObjectives: string[];
  caller: {
    displayName: string;
    /** Fictional number in the 555-01xx range reserved for fiction. */
    displayNumber: string;
    /** Name the caller uses for themselves. */
    agentName: string;
    /** Text-to-speech tuning so different callers sound different. */
    voice?: { pitch?: number; rate?: number };
  };
  /** Real recordings this scenario can open with, grouped by pool. */
  recordings?: RecordingClip[];
  /** Shown on the scenario card and in the debrief to say what's real and what's scripted. */
  provenance?: string;
  startNodeId: string;
  nodes: Record<string, ScenarioNode>;
  redFlags: Record<string, RedFlag>;
  endings: Record<string, ScenarioEnding>;
  /** Endings used when the user leaves via the call controls rather than a scripted line. */
  controlEndings: {
    declined: string;
    hungUpSafe: string;
    hungUpAfterDisclosure: string;
  };
  /** Safer habits shown in every debrief for this scenario. */
  saferAlternatives: string[];
  /** Steps shown when the user disclosed simulated information. */
  recoverySteps: string[];
};

export type TranscriptEntry = {
  id: string;
  speaker: 'caller' | 'user' | 'sms' | 'system';
  text: string;
  /** Set when this caller entry is a real recording rather than text-to-speech. */
  clipId?: string;
  /** For sms entries. */
  sender?: string;
};

export type SessionStatus = 'ringing' | 'active' | 'ended';

export type SimulatorSession = {
  sessionId: string;
  scenarioId: string;
  status: SessionStatus;
  currentNodeId: string;
  startedAtMs: number;
  answeredAtMs?: number;
  endedAtMs?: number;
  endingId?: string;
  events: SimulatorEvent[];
  transcript: TranscriptEntry[];
  /** Red flag ids in the order they were first encountered. */
  redFlagsSeen: string[];
  visitedNodeIds: string[];
  /** Which real recording this session uses for each pool. */
  recordingIds: Record<string, string>;
  /** Monotonic counter for deterministic ids. */
  seq: number;
};
