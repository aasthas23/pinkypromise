/**
 * Mock service layer. Each function mirrors a future backend call:
 * - verificationService → authenticated session API + real-time listener
 * - simulationService → Voice AI + LLM evaluation
 * - trainingService → user progress tables
 * Swap implementations here without touching the UI.
 */
import { setDemo, type SimResult } from "./store";
import { CURRENT_CUSTOMER_ID, customers, scenarios, type Difficulty } from "./mock-data";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const CODE_TTL_MS = 60_000;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "http://localhost:8000";

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(init.body && !init.headers?.hasOwnProperty("Content-Type") ? { "Content-Type": "application/json" } : {}),
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Request failed for ${path}`);
  }

  if (typeof response.json === "function") {
    return (await response.json()) as T;
  }

  if (typeof response.text === "function") {
    return (await response.text()) as T;
  }

  return ({} as T);
}

export const backendSimulatorService = {
  async runTestCall(scenarioId: string = "account-security-sim-swap") {
    const start = await apiRequest<{ sessionId: string; status: string; transcript: Array<{ speaker: string; text: string }>; node?: { id?: string } | null }>(
      "/simulator/sessions",
      { method: "POST", body: JSON.stringify({ scenarioId }), headers: { "Content-Type": "application/json" } },
    );

    const sessionId = start.sessionId;
    let current = await apiRequest<{ sessionId: string; status: string; transcript: Array<{ speaker: string; text: string }>; node?: { id?: string } | null }>(
      `/simulator/sessions/${sessionId}/answer`,
      { method: "POST" },
    );

    const optionSequence = ["intro_challenge", "authority_verify", "discourage_hold_firm"];
    for (const optionId of optionSequence) {
      if (!current || current.status === "ended") break;
      current = await apiRequest<{ sessionId: string; status: string; transcript: Array<{ speaker: string; text: string }>; node?: { id?: string } | null }>(
        `/simulator/sessions/${sessionId}/choose`,
        { method: "POST", body: JSON.stringify({ optionId }), headers: { "Content-Type": "application/json" } },
      );
      if (current.status === "ended") break;
    }

    if (current.status !== "ended") {
      current = await apiRequest<{ sessionId: string; status: string; transcript: Array<{ speaker: string; text: string }>; node?: { id?: string } | null }>(
        `/simulator/sessions/${sessionId}/hangup`,
        { method: "POST" },
      );
    }

    const transcriptText = await apiRequest<string>(`/simulator/sessions/${sessionId}/transcript.txt?tzOffsetMin=0`);

    return {
      sessionId,
      status: current.status,
      transcriptEntries: current.transcript || start.transcript || [],
      transcriptText,
    };
  },
};

export const verificationService = {
  findCustomers(query: string) {
    const term = query.trim().toLowerCase();
    return term ? customers.filter((customer) => customer.name.toLowerCase().includes(term) || customer.id.toLowerCase() === term) : [];
  },
  async generate(customerId: string) {
    const customer = customers.find((entry) => entry.id === customerId);
    if (!customer) throw new Error("Select a valid customer before generating a code.");
    await wait(500);
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const now = Date.now();
    setDemo((s) => ({
      ...s,
      verification: {
        sessionId: "SS-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
        code, customerId: customer.id, customerName: customer.name, sentAt: now,
        createdAt: now, expiresAt: now + CODE_TTL_MS, status: "pending",
      },
    }));
  },
  check(code: string, customerId: string = CURRENT_CUSTOMER_ID): "verified" | "invalid" | "expired" {
    let outcome: "verified" | "invalid" | "expired" = "invalid";
    setDemo((s) => {
      const v = s.verification;
      if (!v || v.customerId !== customerId || v.code !== code.trim() || v.status === "cancelled") return s;
      if (Date.now() >= v.expiresAt || v.status === "expired") {
        outcome = "expired";
        return { ...s, verification: { ...v, status: "expired" } };
      }
      if (v.status !== "pending" && v.status !== "verified") return s;
      outcome = "verified";
      return { ...s, verification: { ...v, status: "verified" } };
    });
    return outcome;
  },
  expire() {
    setDemo((s) => s.verification?.status === "pending" ? { ...s, verification: { ...s.verification, status: "expired" } } : s);
  },
  cancel() { setDemo((s) => ({ ...s, verification: null })); },
};

const SCORES: Record<Difficulty, number> = { beginner: 24, intermediate: 38, advanced: 57 };

export const simulationService = {
  /** Mock AI evaluation of a finished practice call. */
  async evaluate(difficulty: Difficulty, source: "practice" | "biweekly" = "practice"): Promise<SimResult> {
    await wait(1400);
    const sc = scenarios.find((x) => x.id === difficulty);
    if (!sc) throw new Error("Unknown practice scenario");
    const tactics = Array.from(new Set(sc.script.map((l) => l.flag).filter(Boolean) as string[]));
    const result: SimResult = {
      difficulty, source, score: SCORES[difficulty], tactics, completedAt: Date.now(),
      wentWell: ["You refused to read a code aloud", "You asked to verify through an official channel", "You ended the call on your terms"],
      watchOut: difficulty === "advanced"
        ? ["You started looking for the code under time pressure", "Fear of losing bank access made you hesitate"]
        : ["You engaged with the offer before questioning it", "Official-sounding names lowered your guard"],
    };
    setDemo((s) => ({
      ...s, lastResult: result, callHistory: [...s.callHistory, result], simulations: s.simulations + 1,
      vulnerability: Math.round((s.vulnerability + result.score) / 2),
    }));
    return result;
  },
};

export const callPreferencesService = {
  setBiweeklyOptIn(enabled: boolean) {
    setDemo((s) => ({ ...s, biweeklyOptIn: enabled, biweeklyConsentAt: enabled ? Date.now() : null }));
  },
};

export const trainingService = {
  toggle(taskId: string) {
    setDemo((s) => {
      const done = s.completedTasks.includes(taskId);
      return {
        ...s,
        completedTasks: done ? s.completedTasks.filter((t) => t !== taskId) : [...s.completedTasks, taskId],
        vulnerability: Math.max(5, s.vulnerability + (done ? 3 : -3)),
      };
    });
  },
};
