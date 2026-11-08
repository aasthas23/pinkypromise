import {
  DISCLOSURE_EVENTS,
  type Outcome,
  type RecordingClip,
  type RedFlag,
  type ResponseBehavior,
  type Scenario,
  type ScenarioEnding,
  type SimulatorEventType,
  type SimulatorSession,
} from '../types';
import { countEvents, hasEvent } from './eventTracker';

/** Red flags that mean the caller asked for something sensitive. */
export const SENSITIVE_REQUEST_FLAGS = [
  'code_request',
  'personal_info_request',
  'remote_access_request',
  'gift_card_payment',
];

const DISCLOSURE_LABELS: Partial<Record<SimulatorEventType, string>> = {
  dummy_code_disclosed: 'a one-time code',
  dummy_pin_disclosed: 'an account PIN',
  dummy_personal_info_disclosed: 'personal details',
  simulated_remote_access_allowed: 'remote access to your device',
  simulated_payment_made: 'gift card numbers',
};

/**
 * Turns a finished session's event log into a debrief. It keeps two things apart:
 *  - observed: things the user actually did (timeline, key behaviors)
 *  - interpretation: hedged, supportive guidance built from those observations
 * There is no numeric "fraud detection" score. The tally only counts responses
 * by the documented rubric in BEHAVIOR_KIND.
 */

export type TimelineKind = 'protective' | 'risky' | 'neutral' | 'info';

export type TimelineItem = {
  id: string;
  offsetMs: number;
  label: string;
  /** Exact scripted line the user chose, if any. */
  quote?: string;
  kind: TimelineKind;
  rationale?: string;
};

/** Rubric: how each scripted response category counts in the tally. */
export const BEHAVIOR_KIND: Record<ResponseBehavior, TimelineKind> = {
  verify: 'protective',
  refuse: 'protective',
  challenge: 'protective',
  comply: 'risky',
  neutral: 'neutral',
};

export type KeyBehaviors = {
  answered: boolean;
  /** Pressed a key on a robocall menu (e.g. "press 1"), which connects you to a live scammer. */
  pressedKeypad: boolean;
  challengedCaller: boolean;
  verifiedIndependently: boolean;
  /** Something sensitive was requested and the user gave none of it. null if never requested. */
  protectedSensitive: boolean | null;
  /** Human labels for what was handed over, in order. */
  disclosed: string[];
  hintsUsed: number;
};

export type Debrief = {
  scenarioTitle: string;
  ending: ScenarioEnding;
  outcome: Outcome;
  durationMs: number;
  timeline: TimelineItem[];
  keyBehaviors: KeyBehaviors;
  tally: { protective: number; risky: number };
  redFlags: RedFlag[];
  /** Personalized notes, phrased as observations, not judgments. */
  takeaways: string[];
  saferAlternatives: string[];
  recoverySteps: string[];
  provenance?: string;
  /** The real recording this call opened with, if any. */
  recording?: RecordingClip;
};

export function getKeyBehaviors(scenario: Scenario, session: SimulatorSession): KeyBehaviors {
  const disclosed = [
    ...new Set(
      session.events
        .filter((e) => DISCLOSURE_EVENTS.includes(e.type))
        .map((e) => DISCLOSURE_LABELS[e.type] ?? e.type),
    ),
  ];
  const sensitiveRequested = session.visitedNodeIds.some((id) =>
    (scenario.nodes[id]?.redFlags ?? []).some((f) => SENSITIVE_REQUEST_FLAGS.includes(f)),
  );
  return {
    answered: hasEvent(session, 'call_answered'),
    pressedKeypad: hasEvent(session, 'keypad_pressed'),
    challengedCaller: hasEvent(session, 'caller_challenged'),
    verifiedIndependently: hasEvent(session, 'independent_verification_requested'),
    protectedSensitive: sensitiveRequested ? disclosed.length === 0 : null,
    disclosed,
    hintsUsed: countEvents(session, 'hint_requested'),
  };
}

function buildTimeline(scenario: Scenario, session: SimulatorSession): TimelineItem[] {
  const items: TimelineItem[] = [];
  const t0 = session.startedAtMs;
  for (const e of session.events) {
    const offsetMs = e.timestampMs - t0;
    switch (e.type) {
      case 'call_answered':
        items.push({ id: e.id, offsetMs, label: 'Answered the call', kind: 'neutral' });
        break;
      case 'call_declined':
        items.push({ id: e.id, offsetMs, label: 'Declined the call', kind: 'neutral' });
        break;
      case 'response_selected': {
        const node = e.nodeId ? scenario.nodes[e.nodeId] : undefined;
        const option =
          node?.kind === 'dialogue' ? node.options.find((o) => o.id === e.optionId) : undefined;
        if (!option) break;
        items.push({
          id: e.id,
          offsetMs,
          label: option.keypad ? `Pressed ${option.keypad} on the robocall menu` : behaviorLabel(option.behavior),
          quote: option.keypad ? undefined : option.label,
          kind: BEHAVIOR_KIND[option.behavior],
          rationale: option.rationale,
        });
        break;
      }
      case 'hint_requested':
        items.push({ id: e.id, offsetMs, label: 'Asked for a training hint', kind: 'info' });
        break;
      case 'call_ended':
        if (e.endedBy === 'user_hang_up') {
          items.push({
            id: e.id,
            offsetMs,
            label: 'Hung up',
            kind: 'protective',
            rationale: 'Ending a call that is pressuring you is always an option.',
          });
        }
        break;
      default:
        break;
    }
  }
  return items;
}

function behaviorLabel(b: ResponseBehavior): string {
  switch (b) {
    case 'verify':
      return 'Chose to verify independently';
    case 'refuse':
      return 'Refused the request';
    case 'challenge':
      return 'Questioned the caller';
    case 'comply':
      return 'Went along with the request';
    case 'neutral':
      return 'Kept talking';
  }
}

function buildTakeaways(k: KeyBehaviors, outcome: Outcome): string[] {
  const out: string[] = [];
  if (!k.answered) {
    out.push(
      'You didn’t answer. That’s a reasonable habit for unexpected calls. To practice the conversation itself, try answering next time.',
    );
    return out;
  }
  if (k.verifiedIndependently) {
    out.push('You chose to check with the carrier yourself instead of trusting the caller. That habit works for almost any scam call.');
  } else {
    out.push(
      'You didn’t try an independent callback this time. Next time, try “I’ll call back on the number on my bill.” It works whatever story the caller tells.',
    );
  }
  if (k.pressedKeypad)
    out.push('You pressed a key on a recorded message. With real robocalls, pressing anything connects you to a live scammer and confirms your number is active. Hanging up is safer.');
  if (k.challengedCaller) out.push('You questioned who was calling instead of accepting the claim.');
  if (k.protectedSensitive === true) out.push('You didn’t hand over anything sensitive, even when the caller asked for it.');
  if (k.disclosed.length && outcome === 'recovered')
    out.push(`You shared ${listJoin(k.disclosed)} (simulated), then stopped before giving more. Noticing partway and stopping really does matter.`);
  if (k.disclosed.length && outcome === 'exposed')
    out.push(`The caller’s pressure led to sharing ${listJoin(k.disclosed)} (simulated). These tactics work on lots of people. Spotting them is the skill to practice.`);
  if (k.hintsUsed > 0)
    out.push(`You used ${k.hintsUsed} training hint${k.hintsUsed > 1 ? 's' : ''}. Try the scenario again without hints to see what sticks.`);
  if (outcome === 'protected' && !k.verifiedIndependently)
    out.push('After hanging up on a call like this, it’s worth checking your account through the official app, just to be sure.');
  return out;
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function buildDebrief(scenario: Scenario, session: SimulatorSession): Debrief {
  if (session.status !== 'ended' || !session.endingId) {
    throw new Error('Debrief requires an ended session');
  }
  const ending = scenario.endings[session.endingId];
  if (!ending) throw new Error(`Unknown ending ${session.endingId}`);

  const timeline = buildTimeline(scenario, session);
  const keyBehaviors = getKeyBehaviors(scenario, session);
  const tally = {
    protective: timeline.filter((t) => t.kind === 'protective').length,
    risky: timeline.filter((t) => t.kind === 'risky').length,
  };

  return {
    scenarioTitle: scenario.title,
    ending,
    outcome: ending.outcome,
    durationMs: (session.endedAtMs ?? session.startedAtMs) - (session.answeredAtMs ?? session.startedAtMs),
    timeline,
    keyBehaviors,
    tally,
    redFlags: session.redFlagsSeen.map((id) => scenario.redFlags[id]).filter(Boolean),
    takeaways: buildTakeaways(keyBehaviors, ending.outcome),
    saferAlternatives: scenario.saferAlternatives,
    recoverySteps: keyBehaviors.disclosed.length ? scenario.recoverySteps : [],
    provenance: scenario.provenance,
    recording: Object.values(session.recordingIds)
      .map((id) => scenario.recordings?.find((c) => c.id === id))
      .find((c): c is RecordingClip => !!c),
  };
}

export type AttemptDifference = { text: string; direction: 'better' | 'worse' | 'same' };

/**
 * Compares two attempts at the same scenario on observable behaviors only.
 * This describes practice differences. It doesn't claim better real-world safety.
 */
export function compareAttempts(
  scenario: Scenario,
  previous: SimulatorSession,
  current: SimulatorSession,
): AttemptDifference[] {
  const a = getKeyBehaviors(scenario, previous);
  const b = getKeyBehaviors(scenario, current);
  const diffs: AttemptDifference[] = [];

  const flag = (before: boolean, after: boolean, gained: string, lost: string, goodWhenTrue = true) => {
    if (before === after) return;
    const improved = goodWhenTrue ? after : !after;
    diffs.push({ text: after ? gained : lost, direction: improved ? 'better' : 'worse' });
  };

  flag(a.verifiedIndependently, b.verifiedIndependently, 'This time you chose to verify independently.', 'Last time you chose to verify independently. This time you didn’t.');
  flag(a.challengedCaller, b.challengedCaller, 'This time you questioned the caller.', 'Last time you questioned the caller. This time you didn’t.');
  flag(a.pressedKeypad, b.pressedKeypad, 'This time you pressed a key on the robocall menu.', 'This time you didn’t press anything on the robocall menu.', false);
  flag(a.disclosed.length > 0, b.disclosed.length > 0, 'This time you shared simulated information. Last time you didn’t.', 'This time you didn’t share anything sensitive.', false);
  if (a.disclosed.length && b.disclosed.length && b.disclosed.length !== a.disclosed.length) {
    diffs.push({
      text: `You shared ${b.disclosed.length < a.disclosed.length ? 'less' : 'more'} than last time (${b.disclosed.length} vs ${a.disclosed.length} items).`,
      direction: b.disclosed.length < a.disclosed.length ? 'better' : 'worse',
    });
  }
  if (a.hintsUsed !== b.hintsUsed) {
    diffs.push({
      text: `Hints used: ${a.hintsUsed} → ${b.hintsUsed}.`,
      direction: b.hintsUsed < a.hintsUsed ? 'better' : 'same',
    });
  }
  if (!diffs.length) diffs.push({ text: 'Your key choices matched your last attempt.', direction: 'same' });
  return diffs;
}
