/**
 * Service layer. Each function mirrors a backend call:
 * - verificationService → authenticated session API + real-time listener (mock)
 * - simulationService → AI practice calls via the simulator backend: Claude holds the
 *   conversation (grounded in real FTC scam transcripts), OpenAI handles speech, and the
 *   backend's fixed rules score the call. The scripted mock `evaluate` is the offline fallback.
 * - trainingService → user progress tables (mock)
 * Swap implementations here without touching the UI.
 */
import { setDemo, type SimResult } from "./store";
import { CURRENT_CUSTOMER_ID, customers, scenarios, type Difficulty } from "./mock-data";
import { debriefToSimResult } from "./sim-result";
import { liveApi } from "./simulator-api";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const CODE_TTL_MS = 60_000;

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

/** Last finished AI call per level, so the next one picks a different scenario. */
const lastAiCall: Partial<Record<Difficulty, string>> = {};

function recordResult(result: SimResult) {
  setDemo((s) => ({
    ...s, lastResult: result, callHistory: [...s.callHistory, result], simulations: s.simulations + 1,
    vulnerability: Math.round((s.vulnerability + result.score) / 2),
  }));
}

export const simulationService = {
  /** Whether the server's AI caller (LLM) and speech services are configured. */
  aiStatus: () => liveApi.status(),
  /** Starts an AI practice call: the server picks a T-Mobile scenario for this level, grounded in real scam transcripts. */
  startAiCall: (difficulty: Difficulty) => liveApi.start(difficulty, new Date().getTimezoneOffset(), lastAiCall[difficulty]),
  /** The AI caller's opening, streamed sentence by sentence. */
  answerAiCall: (sessionId: string, signal?: AbortSignal) => liveApi.answer(sessionId, signal),
  declineAiCall: (sessionId: string) => liveApi.decline(sessionId),
  /** A spoken reply (transcribed on the server) or a typed one. The server removes numbers and emails. */
  sayToAiCaller: (
    sessionId: string,
    reply: { audio: Blob } | { text: string } | { silence: true },
    opts: { interrupted?: boolean; heard?: string[] } = {},
    signal?: AbortSignal,
  ) =>
    "audio" in reply
      ? liveApi.sayAudio(sessionId, reply.audio, opts, signal)
      : liveApi.sayText(sessionId, { ...reply, ...opts }, signal),
  /** Streaming audio URL for one caller sentence (the voice is generated on the server). */
  aiVoiceUrl: (sessionId: string, utteranceId: string) => liveApi.speechUrl(sessionId, utteranceId),
  hangUpAiCall: (sessionId: string) => liveApi.hangUp(sessionId),
  /** User tapped 🚩 on what the caller is saying. Reviewed only after the call. */
  spotRedFlag: (sessionId: string, entryId?: string) => liveApi.spot(sessionId, entryId),

  /** Scores a finished AI call from the server debrief and records it like any other result. */
  async finishAiCall(sessionId: string, difficulty: Difficulty, source: "practice" | "biweekly" = "practice"): Promise<SimResult> {
    const { debrief, session } = await liveApi.debrief(sessionId);
    lastAiCall[difficulty] = sessionId;
    const result = debriefToSimResult(debrief, session.entries, difficulty, source);
    if (session.transcriptFile) result.transcriptFile = session.transcriptFile;
    if (debrief.provenance) result.provenance = debrief.provenance;
    recordResult(result);
    return result;
  },

  /** Offline fallback: mock evaluation of the scripted demo call. */
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
    recordResult(result);
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
