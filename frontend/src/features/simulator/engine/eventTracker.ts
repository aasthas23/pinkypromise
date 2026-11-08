import type { SimulatorEvent, SimulatorEventType, SimulatorSession } from '../types';

type EventDetails = Omit<SimulatorEvent, 'id' | 'scenarioId' | 'timestampMs' | 'type'>;

/** Returns a new session with one event appended. Ids are deterministic per session. */
export function appendEvent(
  session: SimulatorSession,
  type: SimulatorEventType,
  timestampMs: number,
  details: EventDetails = {},
): SimulatorSession {
  const seq = session.seq + 1;
  const event: SimulatorEvent = {
    id: `${session.sessionId}-e${seq}`,
    scenarioId: session.scenarioId,
    timestampMs,
    type,
    ...details,
  };
  return { ...session, seq, events: [...session.events, event] };
}

export function hasEvent(session: SimulatorSession, type: SimulatorEventType): boolean {
  return session.events.some((e) => e.type === type);
}

export function countEvents(session: SimulatorSession, type: SimulatorEventType): number {
  return session.events.filter((e) => e.type === type).length;
}
