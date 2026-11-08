import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readingMs, speakLine } from "@/lib/call-voice";
import { LIVE_SCENARIO, simulationService } from "@/lib/services";
import { debriefToSimResult, scoreFor } from "@/lib/sim-result";
import {
  apiBaseUrl,
  type Debrief,
  type SessionView,
  type TranscriptEntry,
} from "@/lib/simulator-api";
import { getDemo } from "./helpers";

const debrief = (over: Partial<Debrief> = {}): Debrief => ({
  ending: {
    id: "verified",
    title: "You chose to verify independently",
    outcome: "protected",
    summary: "Nothing was shared.",
  },
  outcome: "protected",
  timeline: [
    { id: "e1", label: "Answered the call", kind: "neutral" },
    {
      id: "e2",
      label: "Questioned the caller",
      quote: "Who is this?",
      kind: "protective",
      rationale: "Good.",
    },
    {
      id: "e3",
      label: "Went along with the request",
      quote: "Okay",
      kind: "risky",
      rationale: "Codes let someone take over your account.",
    },
  ],
  keyBehaviors: {
    answered: true,
    verifiedIndependently: false,
    challengedCaller: true,
    protectedSensitive: true,
    disclosed: [],
    hintsUsed: 0,
  },
  tally: { protective: 1, risky: 1 },
  redFlags: [
    { id: "authority_claim", title: "Claimed to be T-Mobile", explanation: "" },
    { id: "code_request", title: "Asking for a one-time code", explanation: "" },
    { id: "discouraging_verification", title: "Talking you out of checking", explanation: "" },
  ],
  usedModel: true,
  ...over,
});

const entries: TranscriptEntry[] = [
  {
    id: "t1",
    speaker: "caller",
    text: "Hi, this is Casey from T-Mobile Support.",
    source: "model",
    flags: ["authority_claim"],
  },
  { id: "t2", speaker: "user", text: "Who is this?" },
  {
    id: "t3",
    speaker: "sms",
    sender: "T-Mobile (simulated)",
    text: "SIMULATION ONLY. Code 482 913.",
  },
  {
    id: "t4",
    speaker: "caller",
    text: "Just read it to me.",
    flags: ["discouraging_verification"],
  },
];

describe("debriefToSimResult", () => {
  it("uses the documented rubric for the score", () => {
    expect(scoreFor({ outcome: "protected", tally: { protective: 1, risky: 1 } })).toBe(17); // 15 + 5 - 3
    expect(scoreFor({ outcome: "exposed", tally: { protective: 0, risky: 4 } })).toBe(95); // clamped
    expect(scoreFor({ outcome: "protected", tally: { protective: 6, risky: 0 } })).toBe(5); // clamped
  });

  it("maps behaviors, tactics and the real transcript", () => {
    const r = debriefToSimResult(debrief(), entries, "intermediate", "practice", 123);
    expect(r).toMatchObject({
      difficulty: "intermediate",
      source: "practice",
      live: true,
      aiCaller: true,
      completedAt: 123,
    });
    expect(r.wentWell).toEqual([
      "Questioned the caller: “Who is this?”",
      "You didn’t hand over anything sensitive",
    ]);
    expect(r.watchOut[0]).toBe("Codes let someone take over your account.");
    expect(r.watchOut).toContain(
      "Next time, try checking with T-Mobile yourself through the app or the number on your bill",
    );
    expect(r.tactics).toEqual(["Authority", "Requests for verification codes"]);
    expect(r.transcript).toEqual([
      { who: "caller", text: "Hi, this is Casey from T-Mobile Support.", flag: "Authority" },
      { who: "you", text: "Who is this?" },
      {
        who: "system",
        text: "Text message from T-Mobile (simulated): SIMULATION ONLY. Code 482 913.",
      },
      { who: "caller", text: "Just read it to me.", flag: "Talking you out of checking" },
    ]);
  });
});

describe("live call service", () => {
  const view = (status: SessionView["status"]): SessionView => ({
    sessionId: "s1",
    scenarioId: LIVE_SCENARIO.beginner,
    status,
    transcript: entries,
    node: null,
    endingId: status === "ended" ? "verified" : null,
    answeredAtMs: 1,
    freeTextAvailable: true,
  });
  let fetchMock: ReturnType<typeof vi.fn>;
  const ok = (body: unknown, headers: Record<string, string> = {}) =>
    Promise.resolve(
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status: 200,
        headers,
      }),
    );

  beforeEach(() => {
    fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/simulator/scenarios"))
        return ok([{ id: LIVE_SCENARIO.beginner, caller: { displayName: "T-Mobile Rewards" } }]);
      if (url.endsWith("/simulator/sessions")) return ok(view("ringing"));
      if (url.includes("/debrief")) return ok(debrief());
      if (url.includes("/transcript.txt"))
        return ok("SCAM COACH", { "content-disposition": 'attachment; filename="call.txt"' });
      return ok(view("active"));
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("all three levels map to T-Mobile scenarios", () => {
    expect(LIVE_SCENARIO).toEqual({
      beginner: "tmobile-loyalty-discount",
      intermediate: "tmobile-support-rep",
      advanced: "account-security-sim-swap",
    });
  });

  it("starts the right scenario and records the scored result", async () => {
    const { session, scenario } = await simulationService.startLiveCall("beginner");
    expect(session.status).toBe("ringing");
    expect(scenario?.caller.displayName).toBe("T-Mobile Rewards");
    const startCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/simulator/sessions"));
    expect(JSON.parse(startCall![1].body)).toMatchObject({
      scenarioId: "tmobile-loyalty-discount",
    });

    const before = getDemo().simulations;
    const result = await simulationService.finishLiveCall(view("ended"), "beginner");
    expect(result.live).toBe(true);
    expect(getDemo().lastResult).toEqual(result);
    expect(getDemo().simulations).toBe(before + 1);
  });

  it("never triggers a download: the server saves the transcript and the result keeps its path", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    const createUrl = vi.fn();
    URL.createObjectURL = createUrl;
    await simulationService.startLiveCall("advanced");
    const startCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/simulator/sessions"));
    expect(JSON.parse(startCall![1].body).tzOffsetMin).toBe(new Date().getTimezoneOffset());

    const ended = { ...view("ended"), transcriptFile: "data/call_transcripts/x_transcript.txt" };
    const result = await simulationService.finishLiveCall(ended, "advanced");
    expect(result.transcriptFile).toBe("data/call_transcripts/x_transcript.txt");
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("transcript.txt"))).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();
  });

  it("reports an unreachable server so the call can fall back to the scripted demo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(simulationService.startLiveCall("advanced")).rejects.toThrow(
      /Can’t reach the practice server/,
    );
  });
});

describe("browser voice", () => {
  it("defaults the API to port 8000 on the current host", () => {
    expect(apiBaseUrl()).toBe(`http://${window.location.hostname}:8000`);
  });

  it("still finishes a line at reading pace when speech is unavailable", async () => {
    vi.useFakeTimers();
    let done = false;
    void speakLine("This is a short caller line for the test.", { enabled: true }).then(
      () => (done = true),
    );
    await vi.advanceTimersByTimeAsync(readingMs("This is a short caller line for the test.") + 10);
    expect(done).toBe(true);
    vi.useRealTimers();
  });
});
