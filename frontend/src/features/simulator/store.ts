import { create } from 'zustand';

import {
  answerCall,
  chooseResponse,
  createSession,
  type ClipPicker,
  declineCall,
  hangUp,
  requestHint,
} from './engine/scenarioMachine';
import { getScenario } from './scenarios';
import type { Scenario, SimulatorSession } from './types';

/**
 * Shared simulator state across the scenario, incoming, call and debrief screens.
 * Sessions live only in memory. Nothing is persisted or sent anywhere, and
 * closing the app clears history.
 */
type SimulatorState = {
  scenario?: Scenario;
  session?: SimulatorSession;
  /** Completed sessions this app run, newest last, used for retry comparisons. */
  history: SimulatorSession[];
  activeHint?: string;
  voiceEnabled: boolean;

  start: (scenarioId: string) => boolean;
  answer: () => void;
  decline: () => void;
  choose: (optionId: string) => void;
  hangUp: () => void;
  requestHint: () => void;
  dismissHint: () => void;
  setVoiceEnabled: (enabled: boolean) => void;
  clearHistory: () => void;
};

export const useSimulatorStore = create<SimulatorState>((set, get) => {
  /** Applies an engine transition and archives the session once it ends. */
  const apply = (fn: (scenario: Scenario, session: SimulatorSession) => SimulatorSession) => {
    const { scenario, session, history } = get();
    if (!scenario || !session) return;
    const next = fn(scenario, session);
    if (next === session) return;
    const justEnded = session.status !== 'ended' && next.status === 'ended';
    set({
      session: next,
      activeHint: undefined,
      history: justEnded ? [...history, next] : history,
    });
  };

  return {
    history: [],
    voiceEnabled: true,

    start: (scenarioId) => {
      const scenario = getScenario(scenarioId);
      if (!scenario) return false;
      // Retries hear a different real recording than last time, when there is one.
      const last = [...get().history].reverse().find((h) => h.scenarioId === scenarioId);
      const pick: ClipPicker = (clips, pool) => {
        const fresh = clips.filter((c) => c.id !== last?.recordingIds[pool]);
        const candidates = fresh.length ? fresh : clips;
        return candidates[Math.floor(Math.random() * candidates.length)];
      };
      const now = Date.now();
      set({
        scenario,
        session: createSession(scenario, now, `s${now}`, pick),
        activeHint: undefined,
      });
      return true;
    },
    answer: () => apply((sc, s) => answerCall(sc, s, Date.now())),
    decline: () => apply((sc, s) => declineCall(sc, s, Date.now())),
    choose: (optionId) => apply((sc, s) => chooseResponse(sc, s, optionId, Date.now())),
    hangUp: () => apply((sc, s) => hangUp(sc, s, Date.now())),
    requestHint: () => {
      const { scenario, session } = get();
      if (!scenario || !session) return;
      const result = requestHint(scenario, session, Date.now());
      if (result.hint) set({ session: result.session, activeHint: result.hint });
    },
    dismissHint: () => set({ activeHint: undefined }),
    setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
    clearHistory: () => set({ history: [] }),
  };
});

