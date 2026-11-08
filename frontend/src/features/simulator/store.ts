import { create } from 'zustand';

import { ApiError, simulatorApi } from './api';
import type { ScenarioSummary, SessionView, SimulatorStatus } from './types';

/**
 * Client state for the simulator. The backend is the source of truth for the
 * call; this store only holds the latest view of it plus UI concerns.
 */
type SimulatorState = {
  scenarios?: ScenarioSummary[];
  status?: SimulatorStatus;
  loadError?: string;

  scenario?: ScenarioSummary;
  session?: SessionView;
  /** The finished attempt before this one (same scenario), for the debrief comparison. */
  previousSessionId?: string;
  /** True while waiting for the backend (e.g. the caller is "thinking"). */
  pending: boolean;
  error?: string;
  activeHint?: string;
  voiceEnabled: boolean;
  /** Last finished session per scenario, for retry comparisons and fresh recordings. */
  lastEnded: Record<string, string>;
  attempts: number;

  loadScenarios: () => Promise<void>;
  start: (scenarioId: string) => Promise<boolean>;
  answer: () => Promise<boolean>;
  decline: () => Promise<boolean>;
  choose: (optionId: string) => Promise<void>;
  say: (text: string) => Promise<boolean>;
  hangUp: () => Promise<void>;
  requestHint: () => Promise<void>;
  dismissHint: () => void;
  clearError: () => void;
  setVoiceEnabled: (enabled: boolean) => void;
};

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

export const useSimulatorStore = create<SimulatorState>((set, get) => {
  const setSession = (session: SessionView) => {
    const { lastEnded, attempts, session: prev } = get();
    const justEnded = session.status === 'ended' && prev?.status !== 'ended';
    set({
      session,
      activeHint: undefined,
      lastEnded: justEnded ? { ...lastEnded, [session.scenarioId]: session.sessionId } : lastEnded,
      attempts: justEnded ? attempts + 1 : attempts,
    });
  };

  /** Runs one call action; returns false (and records the error) on failure. */
  const act = async (fn: (id: string) => Promise<SessionView>): Promise<boolean> => {
    const { session, pending } = get();
    if (!session || pending) return false;
    set({ pending: true, error: undefined });
    try {
      setSession(await fn(session.sessionId));
      return true;
    } catch (e) {
      set({ error: message(e) });
      return false;
    } finally {
      set({ pending: false });
    }
  };

  return {
    pending: false,
    voiceEnabled: true,
    lastEnded: {},
    attempts: 0,

    loadScenarios: async () => {
      set({ loadError: undefined });
      try {
        const [scenarios, status] = await Promise.all([simulatorApi.scenarios(), simulatorApi.status()]);
        set({ scenarios, status });
      } catch (e) {
        set({ loadError: message(e) });
      }
    },

    start: async (scenarioId) => {
      const scenario = get().scenarios?.find((s) => s.id === scenarioId);
      if (!scenario || get().pending) return false;
      set({ pending: true, error: undefined });
      try {
        const previousSessionId = get().lastEnded[scenarioId];
        const session = await simulatorApi.start(scenarioId, previousSessionId);
        set({ scenario, session, previousSessionId, activeHint: undefined });
        return true;
      } catch (e) {
        set({ error: message(e) });
        return false;
      } finally {
        set({ pending: false });
      }
    },

    answer: () => act(simulatorApi.answer),
    decline: () => act(simulatorApi.decline),
    choose: async (optionId) => {
      await act((id) => simulatorApi.choose(id, optionId));
    },
    say: (text) => act((id) => simulatorApi.say(id, text)),

    // Hang up must always work: it doesn't wait for pending actions, and the
    // screen leaves the call even if the request fails.
    hangUp: async () => {
      const { session } = get();
      if (!session || session.status !== 'active') return;
      try {
        setSession(await simulatorApi.hangUp(session.sessionId));
      } catch (e) {
        set({ error: message(e) });
      }
    },

    requestHint: async () => {
      const { session, pending } = get();
      if (!session || pending) return;
      try {
        const res = await simulatorApi.hint(session.sessionId);
        set({ session: res.session, activeHint: res.hint ?? undefined });
      } catch (e) {
        set({ error: message(e) });
      }
    },

    dismissHint: () => set({ activeHint: undefined }),
    clearError: () => set({ error: undefined }),
    setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
  };
});
