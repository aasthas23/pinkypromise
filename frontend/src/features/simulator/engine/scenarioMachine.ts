import {
  DISCLOSURE_EVENTS,
  type DialogueNode,
  type RecordingClip,
  type Scenario,
  type ScenarioNode,
  type SimulatorSession,
  type TranscriptEntry,
} from '../types';
import { appendEvent } from './eventTracker';

/**
 * Deterministic scenario state machine. Every function is pure: it takes a
 * session plus a timestamp and returns a new session. Invalid actions (wrong
 * status, unknown option) return the session unchanged, so stray UI taps can't
 * corrupt state.
 */

export function getNode(scenario: Scenario, nodeId: string): ScenarioNode {
  const node = scenario.nodes[nodeId];
  if (!node) throw new Error(`Scenario ${scenario.id} has no node "${nodeId}"`);
  return node;
}

export function getCurrentDialogueNode(
  scenario: Scenario,
  session: SimulatorSession,
): DialogueNode | undefined {
  if (session.status !== 'active') return undefined;
  const node = getNode(scenario, session.currentNodeId);
  return node.kind === 'dialogue' ? node : undefined;
}

export function hasDisclosed(session: SimulatorSession): boolean {
  return session.events.some((e) => DISCLOSURE_EVENTS.includes(e.type));
}

/** Picks which real recording to use from a pool. Injected so tests stay deterministic. */
export type ClipPicker = (clips: RecordingClip[], pool: string) => RecordingClip;
const pickFirst: ClipPicker = (clips) => clips[0];

export function getClip(scenario: Scenario, session: SimulatorSession, pool: string) {
  const id = session.recordingIds[pool];
  return scenario.recordings?.find((c) => c.id === id);
}

export function createSession(
  scenario: Scenario,
  nowMs: number,
  sessionId: string = `s${nowMs}`,
  pickClip: ClipPicker = pickFirst,
): SimulatorSession {
  const recordingIds: Record<string, string> = {};
  for (const pool of new Set((scenario.recordings ?? []).map((c) => c.pool))) {
    const clips = scenario.recordings!.filter((c) => c.pool === pool);
    recordingIds[pool] = pickClip(clips, pool).id;
  }
  const base: SimulatorSession = {
    sessionId,
    scenarioId: scenario.id,
    status: 'ringing',
    currentNodeId: scenario.startNodeId,
    startedAtMs: nowMs,
    events: [],
    transcript: [],
    redFlagsSeen: [],
    visitedNodeIds: [],
    recordingIds,
    seq: 0,
  };
  return appendEvent(base, 'call_presented', nowMs);
}

function addTranscript(
  session: SimulatorSession,
  entry: Omit<TranscriptEntry, 'id'>,
): SimulatorSession {
  const seq = session.seq + 1;
  return {
    ...session,
    seq,
    transcript: [...session.transcript, { id: `${session.sessionId}-t${seq}`, ...entry }],
  };
}

/** Moves into a node: plays its caller lines and SMS, records red flags, and ends the call on an ending node. */
function enterNode(
  scenario: Scenario,
  session: SimulatorSession,
  nodeId: string,
  nowMs: number,
): SimulatorSession {
  const node = getNode(scenario, nodeId);
  let next: SimulatorSession = {
    ...session,
    currentNodeId: nodeId,
    visitedNodeIds: [...session.visitedNodeIds, nodeId],
  };

  if (node.recordingPool) {
    const clip = getClip(scenario, next, node.recordingPool);
    if (clip) next = addTranscript(next, { speaker: 'caller', text: clip.transcript, clipId: clip.id });
  }
  for (const line of node.callerLines) {
    next = addTranscript(next, { speaker: 'caller', text: line });
  }
  if (node.sms) {
    next = addTranscript(next, { speaker: 'sms', text: node.sms.body, sender: node.sms.sender });
  }

  const newFlags = (node.redFlags ?? []).filter((f) => !next.redFlagsSeen.includes(f));
  if (newFlags.length) next = { ...next, redFlagsSeen: [...next.redFlagsSeen, ...newFlags] };

  if (node.kind === 'ending') {
    const endingId =
      node.endingIdIfDisclosed && hasDisclosed(next) ? node.endingIdIfDisclosed : node.endingId;
    next = finish(next, endingId, nowMs, 'scenario_ending');
  }
  return next;
}

function finish(
  session: SimulatorSession,
  endingId: string,
  nowMs: number,
  endedBy: 'user_hang_up' | 'scenario_ending' | 'declined',
): SimulatorSession {
  const ended = appendEvent(session, 'call_ended', nowMs, {
    endedBy,
    nodeId: session.currentNodeId,
  });
  return { ...ended, status: 'ended', endingId, endedAtMs: nowMs };
}

export function answerCall(
  scenario: Scenario,
  session: SimulatorSession,
  nowMs: number,
): SimulatorSession {
  if (session.status !== 'ringing') return session;
  let next = appendEvent(session, 'call_answered', nowMs);
  next = { ...next, status: 'active', answeredAtMs: nowMs };
  return enterNode(scenario, next, scenario.startNodeId, nowMs);
}

export function declineCall(
  scenario: Scenario,
  session: SimulatorSession,
  nowMs: number,
): SimulatorSession {
  if (session.status !== 'ringing') return session;
  const declined = appendEvent(session, 'call_declined', nowMs);
  return finish(declined, scenario.controlEndings.declined, nowMs, 'declined');
}

export function chooseResponse(
  scenario: Scenario,
  session: SimulatorSession,
  optionId: string,
  nowMs: number,
): SimulatorSession {
  const node = getCurrentDialogueNode(scenario, session);
  const option = node?.options.find((o) => o.id === optionId);
  if (!node || !option) return session;

  let next = appendEvent(session, 'response_selected', nowMs, {
    phase: node.phase,
    nodeId: node.id,
    optionId: option.id,
  });
  for (const type of option.events ?? []) {
    next = appendEvent(next, type, nowMs, { phase: node.phase, nodeId: node.id });
  }
  if (option.keypad) {
    next = appendEvent(next, 'keypad_pressed', nowMs, { phase: node.phase, nodeId: node.id });
    next = addTranscript(next, { speaker: 'system', text: `You pressed ${option.keypad}.` });
  } else {
    next = addTranscript(next, { speaker: 'user', text: option.label });
  }
  return enterNode(scenario, next, option.next, nowMs);
}

export function hangUp(
  scenario: Scenario,
  session: SimulatorSession,
  nowMs: number,
): SimulatorSession {
  if (session.status !== 'active') return session;
  const endingId = hasDisclosed(session)
    ? scenario.controlEndings.hungUpAfterDisclosure
    : scenario.controlEndings.hungUpSafe;
  const withNote = addTranscript(session, { speaker: 'system', text: 'You hung up.' });
  return finish(withNote, endingId, nowMs, 'user_hang_up');
}

/** Logs a hint request and returns the hint text for the current node, if there is one. */
export function requestHint(
  scenario: Scenario,
  session: SimulatorSession,
  nowMs: number,
): { session: SimulatorSession; hint?: string } {
  const node = getCurrentDialogueNode(scenario, session);
  if (!node?.hint) return { session };
  const next = appendEvent(session, 'hint_requested', nowMs, {
    phase: node.phase,
    nodeId: node.id,
  });
  return { session: next, hint: node.hint };
}

/** Checks that the scenario graph is well formed. Used by tests and in dev. */
export function validateScenario(scenario: Scenario): string[] {
  const problems: string[] = [];
  if (!scenario.nodes[scenario.startNodeId]) problems.push(`missing start node ${scenario.startNodeId}`);
  for (const node of Object.values(scenario.nodes)) {
    if (node.recordingPool && !scenario.recordings?.some((c) => c.pool === node.recordingPool)) {
      problems.push(`${node.id}: no recordings in pool ${node.recordingPool}`);
    }
    for (const flag of node.redFlags ?? []) {
      if (!scenario.redFlags[flag]) problems.push(`${node.id}: unknown red flag ${flag}`);
    }
    if (node.kind === 'dialogue') {
      if (!node.options.length) problems.push(`${node.id}: no options`);
      for (const o of node.options) {
        if (!scenario.nodes[o.next]) problems.push(`${node.id}/${o.id}: unknown next ${o.next}`);
      }
    } else {
      for (const id of [node.endingId, node.endingIdIfDisclosed]) {
        if (id && !scenario.endings[id]) problems.push(`${node.id}: unknown ending ${id}`);
      }
    }
  }
  for (const id of Object.values(scenario.controlEndings)) {
    if (!scenario.endings[id]) problems.push(`control ending ${id} missing`);
  }
  return problems;
}
