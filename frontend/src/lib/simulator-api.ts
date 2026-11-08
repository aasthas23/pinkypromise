/**
 * Client for the Scam Coach simulator backend (backend/app/simulator).
 *
 * The backend owns the scenario steps and scoring rules and uses Claude to
 * write the caller's lines and understand typed or spoken replies. No keys
 * live in the browser. UI code should go through simulationService
 * (src/lib/services.ts), not call this directly.
 */

export type ScenarioSummary = {
  id: string;
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  caller: {
    displayName: string;
    displayNumber: string;
    agentName: string;
    voice?: { pitch?: number; rate?: number } | null;
  };
  provenance: string | null;
  /** The learning outcomes every practice call works on, shown before the call. */
  learningOutcomes?: OutcomeDefinition[];
};

export type OutcomeDefinition = { id: string; title: string; description: string };

export type LearningOutcome = OutcomeDefinition & {
  /** null when the call never reached the point where this could be practiced. */
  achieved: boolean | null;
  detail: string;
};

export type TranscriptEntry = {
  id: string;
  speaker: "caller" | "user" | "sms" | "system";
  text: string;
  sender?: string | null;
  source?: "recording" | "model" | "scripted" | null;
  atMs?: number | null;
  /** Red flag ids the caller used in this step. */
  flags?: string[];
};

export type SessionView = {
  sessionId: string;
  scenarioId: string;
  status: "ringing" | "active" | "ended";
  transcript: TranscriptEntry[];
  node: {
    id: string;
    acceptsSpeech: boolean;
    options: { id: string; label: string; keypad?: string | null }[];
    hasHint: boolean;
  } | null;
  endingId: string | null;
  answeredAtMs: number | null;
  freeTextAvailable: boolean;
  notice?: string | null;
  /** Where the backend saved this call's .txt transcript (backend/data/call_transcripts/), once ended. */
  transcriptFile?: string | null;
};

export type Debrief = {
  ending: {
    id: string;
    title: string;
    outcome: "protected" | "recovered" | "exposed" | "not_engaged";
    summary: string;
  };
  outcome: "protected" | "recovered" | "exposed" | "not_engaged";
  timeline: {
    id: string;
    label: string;
    quote?: string | null;
    kind: "protective" | "risky" | "neutral" | "info";
    rationale?: string | null;
  }[];
  keyBehaviors: {
    answered: boolean;
    verifiedIndependently: boolean;
    challengedCaller: boolean;
    protectedSensitive: boolean | null;
    disclosed: string[];
    hintsUsed: number;
  };
  tally: { protective: number; risky: number };
  redFlags: { id: string; title: string; explanation: string }[];
  usedModel: boolean;
  /** How the call was generated and grounded. */
  provenance?: string | null;
  /** Fraud-cue identification: red flag ids the caller used, and which ones the user flagged with 🚩. */
  cues?: { encountered: string[]; spotted: string[]; missed: string[]; extraFlags: number } | null;
  learningOutcomes?: LearningOutcome[];
};

export class SimulatorApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** VITE_API_URL overrides; otherwise the backend on port 8000 of the host serving the app. */
export function apiBaseUrl(): string {
  const fromEnv = import.meta.env?.["VITE_API_URL"] as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (typeof window === "undefined") return "http://localhost:8000";
  return `${window.location.protocol === "https:" ? "https:" : "http:"}//${window.location.hostname}:8000`;
}

const TIMEOUT_MS = 30_000;

async function send(method: "GET" | "POST", path: string, body?: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    const init: RequestInit = { method, signal: controller.signal };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    res = await fetch(`${apiBaseUrl()}/simulator${path}`, init);
  } catch {
    throw new SimulatorApiError(
      controller.signal.aborted
        ? "The practice server took too long to respond."
        : `Can’t reach the practice server at ${apiBaseUrl()}.`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      /* keep generic message */
    }
    throw new SimulatorApiError(detail, res.status);
  }
  return res;
}

const json = async <T>(method: "GET" | "POST", path: string, body?: unknown) =>
  (await (await send(method, path, body)).json()) as T;

export const simulatorApi = {
  scenarios: () => json<ScenarioSummary[]>("GET", "/scenarios"),
  start: (scenarioId: string, previousSessionId?: string, tzOffsetMin?: number) =>
    json<SessionView>("POST", "/sessions", { scenarioId, previousSessionId, tzOffsetMin }),
  answer: (id: string) => json<SessionView>("POST", `/sessions/${id}/answer`),
  decline: (id: string) => json<SessionView>("POST", `/sessions/${id}/decline`),
  choose: (id: string, optionId: string) =>
    json<SessionView>("POST", `/sessions/${id}/choose`, { optionId }),
  say: (id: string, text: string) => json<SessionView>("POST", `/sessions/${id}/say`, { text }),
  hangUp: (id: string) => json<SessionView>("POST", `/sessions/${id}/hangup`),
  spot: (id: string) => json<SessionView>("POST", `/sessions/${id}/spot`),
  debrief: (id: string, previous?: string) =>
    json<Debrief>(
      "GET",
      `/sessions/${id}/debrief${previous ? `?previous=${encodeURIComponent(previous)}` : ""}`,
    ),
};

// ---------------------------------------------------------------- live AI calls

export type LiveEntry = {
  id: string;
  speaker: "caller" | "user" | "system";
  text: string;
  atMs: number;
  interrupted: boolean;
  /** Tactic / action labels; filled in only after the call ends. */
  flags?: string[];
};

export type LiveSession = {
  sessionId: string;
  scenarioId: string;
  title: string;
  callerDisplay: string;
  callerNumber: string;
  status: "ringing" | "active" | "ended";
  answeredAtMs: number | null;
  entries: LiveEntry[];
  speechAvailable: boolean;
  transcriptFile: string | null;
};

export type LiveStatus = {
  llm: boolean;
  speech: boolean;
  model: string | null;
  learningOutcomes: OutcomeDefinition[];
};

export type LiveEvent =
  | { type: "user"; entry: LiveEntry }
  | { type: "no_speech" }
  | { type: "caller"; entryId: string; utteranceId: string; text: string; atMs: number }
  | { type: "done"; entryId: string | null; ended: boolean; session: LiveSession }
  | { type: "error"; message: string };

const IDLE_TIMEOUT_MS = 30_000;

/** Reads server-sent events from a streaming response. Aborts if no data arrives for 30 s. */
async function* readEvents(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): AsyncGenerator<LiveEvent> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let idle = setTimeout(abort, IDLE_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${apiBaseUrl()}/simulator/live${path}`, {
        ...init,
        method: "POST",
        signal: controller.signal,
      });
    } catch {
      if (signal?.aborted) return;
      throw new SimulatorApiError(`Can’t reach the practice server at ${apiBaseUrl()}.`);
    }
    if (!res.ok || !res.body) {
      let detail = `Request failed (${res.status}).`;
      try {
        const data = await res.json();
        if (typeof data?.detail === "string") detail = data.detail;
      } catch {
        /* keep generic */
      }
      throw new SimulatorApiError(detail, res.status);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        if (signal?.aborted) return;
        throw new SimulatorApiError("The connection to the practice server dropped.");
      }
      if (chunk.done) break;
      clearTimeout(idle);
      idle = setTimeout(abort, IDLE_TIMEOUT_MS);
      buf += decoder.decode(chunk.value, { stream: true });
      let sep: number;
      while ((sep = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, sep).trim();
        buf = buf.slice(sep + 2);
        if (!line.startsWith("data: ")) continue;
        try {
          yield JSON.parse(line.slice(6)) as LiveEvent;
        } catch {
          throw new SimulatorApiError("The practice server returned an invalid stream response.");
        }
      }
    }
  } finally {
    clearTimeout(idle);
    signal?.removeEventListener("abort", abort);
  }
}

export const liveApi = {
  status: () => liveJson<LiveStatus>("GET", "/status"),
  start: (difficulty: string, tzOffsetMin: number, previousSessionId?: string) =>
    liveJson<LiveSession>("POST", "/sessions", { difficulty, tzOffsetMin, previousSessionId }),
  answer: (id: string, signal?: AbortSignal) => readEvents(`/sessions/${id}/answer`, {}, signal),
  sayText: (
    id: string,
    body: { text?: string; interrupted?: boolean; heard?: string[]; silence?: boolean },
    signal?: AbortSignal,
  ) =>
    readEvents(
      `/sessions/${id}/turn`,
      { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      signal,
    ),
  sayAudio: (
    id: string,
    audio: Blob,
    opts: { interrupted?: boolean; heard?: string[] },
    signal?: AbortSignal,
  ) => {
    const q = new URLSearchParams();
    if (opts.interrupted) q.set("interrupted", "true");
    if (opts.heard) q.set("heard", opts.heard.join(","));
    return readEvents(
      `/sessions/${id}/turn?${q}`,
      { headers: { "Content-Type": audio.type || "audio/webm" }, body: audio },
      signal,
    );
  },
  spot: (id: string, entryId?: string) =>
    liveJson<LiveSession>("POST", `/sessions/${id}/spot`, { entryId }),
  hangUp: (id: string) => liveJson<LiveSession>("POST", `/sessions/${id}/hangup`),
  decline: (id: string) => liveJson<LiveSession>("POST", `/sessions/${id}/decline`),
  debrief: (id: string) =>
    liveJson<{ debrief: Debrief; session: LiveSession }>("GET", `/sessions/${id}/debrief`),
  speechUrl: (id: string, utteranceId: string) =>
    `${apiBaseUrl()}/simulator/live/sessions/${id}/speech/${utteranceId}`,
};

async function liveJson<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  return (await (await send(method, `/live${path}`, body)).json()) as T;
}
