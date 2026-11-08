import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readingMs, speakLine } from "@/lib/call-voice";
import { simulationService } from "@/lib/services";
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

describe("AI call service", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const sse = (events: object[]) => {
    const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
    // Split mid-event to prove the reader handles chunk boundaries.
    const cut = Math.floor(body.length / 2);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(body.slice(0, cut)));
        c.enqueue(new TextEncoder().encode(body.slice(cut)));
        c.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const liveSession = (status: string, extra = {}) => ({
    sessionId: "l1",
    scenarioId: "tmobile-sim-swap",
    title: "Urgent SIM-swap warning",
    callerDisplay: "T-Mobile Fraud Department",
    callerNumber: "(800) 555-0142",
    status,
    answeredAtMs: 1,
    entries: [],
    speechAvailable: true,
    transcriptFile: null,
    ...extra,
  });

  beforeEach(() => {
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/live/status"))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              llm: true,
              speech: true,
              model: "claude-opus-5-5",
              learningOutcomes: [],
            }),
          ),
        );
      if (url.endsWith("/live/sessions") && init?.method === "POST")
        return Promise.resolve(new Response(JSON.stringify(liveSession("ringing"))));
      if (url.includes("/answer") || url.includes("/turn"))
        return Promise.resolve(
          sse([
            {
              type: "caller",
              entryId: "t1",
              utteranceId: "u1",
              text: "This is the T-Mobile Fraud Department.",
              atMs: 1,
            },
            { type: "done", entryId: "t1", ended: false, session: liveSession("active") },
          ]),
        );
      if (url.includes("/debrief"))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              debrief: { ...debrief(), provenance: "Grounded in 4 real FTC robocall transcripts." },
              session: liveSession("ended", {
                transcriptFile: "data/call_transcripts/tmobile_sim_swap_x_transcript.txt",
                entries: [
                  {
                    id: "t1",
                    speaker: "caller",
                    text: "This is the T-Mobile Fraud Department.",
                    atMs: 1,
                    interrupted: false,
                    flags: ["authority_claim"],
                  },
                ],
              }),
            }),
          ),
        );
      return Promise.resolve(new Response(JSON.stringify(liveSession("active"))));
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts an AI call for the level, with the local timezone", async () => {
    const s = await simulationService.startAiCall("advanced");
    expect(s.status).toBe("ringing");
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/live/sessions"))!;
    expect(url).toMatch(/\/simulator\/live\/sessions$/);
    expect(JSON.parse(init.body)).toMatchObject({
      difficulty: "advanced",
      tzOffsetMin: new Date().getTimezoneOffset(),
    });
  });

  it("streams the caller's sentences as they arrive", async () => {
    const got = [];
    for await (const ev of simulationService.answerAiCall("l1")) got.push(ev.type);
    expect(got).toEqual(["caller", "done"]);
  });

  it("sends spoken replies as raw audio, flagging interruptions and what was heard", async () => {
    const audio = new Blob(["x"], { type: "audio/webm;codecs=opus" });
    for await (const _ of simulationService.sayToAiCaller(
      "l1",
      { audio },
      { interrupted: true, heard: ["u1", "u2"] },
    ))
      void _;
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes("/turn"))!;
    expect(url).toMatch(/\/live\/sessions\/l1\/turn\?interrupted=true&heard=u1%2Cu2$/);
    expect(init.headers["Content-Type"]).toBe("audio/webm;codecs=opus");
    expect(init.body).toBe(audio);
  });

  it("sends typed replies and silence as JSON", async () => {
    for await (const _ of simulationService.sayToAiCaller("l1", { text: "Who is this?" })) void _;
    for await (const _ of simulationService.sayToAiCaller("l1", { silence: true })) void _;
    const bodies = fetchMock.mock.calls
      .filter(([u]) => String(u).includes("/turn"))
      .map(([, i]) => JSON.parse(i.body));
    expect(bodies).toEqual([{ text: "Who is this?" }, { silence: true }]);
  });

  it("records the scored result with the saved transcript and how the call was grounded", async () => {
    const r = await simulationService.finishAiCall("l1", "advanced");
    expect(r.transcriptFile).toBe("data/call_transcripts/tmobile_sim_swap_x_transcript.txt");
    expect(r.provenance).toMatch(/real FTC robocall transcripts/);
    expect(r.transcript).toEqual([
      { who: "caller", text: "This is the T-Mobile Fraud Department.", flag: "Authority" },
    ]);
    expect(getDemo().lastResult).toEqual(r);
  });

  it("only reads AI voice from server-generated lines", () => {
    expect(simulationService.aiVoiceUrl("l1", "u1")).toMatch(
      /\/simulator\/live\/sessions\/l1\/speech\/u1$/,
    );
  });

  it("reports an unreachable server so the call can fall back to the scripted demo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(simulationService.startAiCall("advanced")).rejects.toThrow(
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
