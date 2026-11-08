import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { Debrief, ScenarioSummary, SessionView, SimulatorStatus } from './types';

/**
 * Backend base URL. Set EXPO_PUBLIC_API_URL to override (it is not a secret;
 * no keys ever live in the app). Otherwise, in development, use the machine
 * running Metro, which is usually also running the backend on port 8000.
 */
export function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:8000`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host || 'localhost'}:8000`;
}

export const API_BASE_URL = resolveApiBaseUrl();

/** Model calls can take a few seconds; give them room but never hang forever. */
const TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function send(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/simulator${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      controller.signal.aborted
        ? 'The practice server took too long to respond.'
        : `Can’t reach the practice server at ${API_BASE_URL}.`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`;
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') detail = data.detail;
    } catch {
      // keep the generic message
    }
    throw new ApiError(detail, res.status);
  }
  return res;
}

async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await send(method, path, body);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Reads `filename="..."` from a Content-Disposition header. */
export function filenameFromDisposition(header: string | null | undefined): string | undefined {
  return header?.match(/filename="?([^";]+)"?/i)?.[1];
}

export const simulatorApi = {
  status: () => request<SimulatorStatus>('GET', '/status'),
  scenarios: () => request<ScenarioSummary[]>('GET', '/scenarios'),
  start: (scenarioId: string, previousSessionId?: string) =>
    request<SessionView>('POST', '/sessions', { scenarioId, previousSessionId }),
  answer: (id: string) => request<SessionView>('POST', `/sessions/${id}/answer`),
  decline: (id: string) => request<SessionView>('POST', `/sessions/${id}/decline`),
  choose: (id: string, optionId: string) => request<SessionView>('POST', `/sessions/${id}/choose`, { optionId }),
  say: (id: string, text: string) => request<SessionView>('POST', `/sessions/${id}/say`, { text }),
  hangUp: (id: string) => request<SessionView>('POST', `/sessions/${id}/hangup`),
  hint: (id: string) => request<{ session: SessionView; hint: string | null }>('POST', `/sessions/${id}/hint`),
  /** Plain-text transcript of a finished call. Times use the given JS timezone offset. */
  transcript: async (id: string, tzOffsetMin: number) => {
    const res = await send('GET', `/sessions/${id}/transcript.txt?tzOffsetMin=${tzOffsetMin}`);
    return {
      text: await res.text(),
      filename: filenameFromDisposition(res.headers.get('content-disposition')) ?? `scam-coach_${id}.txt`,
    };
  },
  debrief: (id: string, previous?: string) =>
    request<Debrief>('GET', `/sessions/${id}/debrief${previous ? `?previous=${encodeURIComponent(previous)}` : ''}`),
};
