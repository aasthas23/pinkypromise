import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CallBriefing } from "@/components/safe/CallBriefing";
import { simulationService } from "@/lib/services";
import { DEFAULT_OUTCOMES, debriefToSimResult, scoreFor } from "@/lib/sim-result";
import type { Debrief } from "@/lib/simulator-api";

describe("pre-call briefing", () => {
  it("states plainly that the call is safe and why we practice, before anything rings", () => {
    const onStart = vi.fn();
    render(
      <CallBriefing
        title="Fake T-Mobile support rep"
        outcomes={DEFAULT_OUTCOMES}
        handsOnFlags
        onStart={onStart}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: /You can’t be scammed here/ })).toBeInTheDocument();
    expect(screen.getByText(/No real person is calling/)).toBeInTheDocument();
    expect(screen.getByText(/Never use real details/)).toBeInTheDocument();
    for (const o of DEFAULT_OUTCOMES) expect(screen.getByText(o.title)).toBeInTheDocument();
    expect(screen.getByText(/Tap 🚩/)).toBeInTheDocument();
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Start the call/ }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("omits the 🚩 step when flagging isn't available (scripted fallback)", () => {
    render(
      <CallBriefing
        title="x"
        outcomes={DEFAULT_OUTCOMES}
        handsOnFlags={false}
        onStart={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByText(/Tap 🚩/)).not.toBeInTheDocument();
  });
});

const debrief: Debrief = {
  ending: {
    id: "verified",
    title: "You chose to verify independently",
    outcome: "protected",
    summary: "",
  },
  outcome: "protected",
  timeline: [],
  keyBehaviors: {
    answered: true,
    verifiedIndependently: true,
    challengedCaller: true,
    protectedSensitive: true,
    disclosed: [],
    hintsUsed: 0,
  },
  tally: { protective: 2, risky: 0 },
  redFlags: [
    { id: "authority_claim", title: "Claimed to be T-Mobile", explanation: "" },
    { id: "fake_verification_code", title: "A made-up “verification” code", explanation: "" },
    { id: "artificial_urgency", title: "Countdown pressure", explanation: "" },
  ],
  usedModel: false,
  cues: {
    encountered: ["authority_claim", "fake_verification_code", "artificial_urgency"],
    spotted: ["authority_claim", "fake_verification_code"],
    missed: ["artificial_urgency"],
    extraFlags: 0,
  },
  learningOutcomes: [
    {
      id: "spot_tactics",
      title: "Spot the scam tactics",
      description: "",
      achieved: true,
      detail: "You flagged 2 of 3 tactics the caller used.",
    },
    {
      id: "protect_info",
      title: "Keep codes and personal details private",
      description: "",
      achieved: true,
      detail: "x",
    },
    {
      id: "verify_yourself",
      title: "Check through an official channel",
      description: "",
      achieved: true,
      detail: "y",
    },
  ],
};

describe("explicit outcomes after the call", () => {
  it("carries outcomes and spotted/missed tactics into the result", () => {
    const r = debriefToSimResult(debrief, [], "intermediate", "practice");
    expect(r.outcomes).toEqual([
      {
        title: "Spot the scam tactics",
        achieved: true,
        detail: "You flagged 2 of 3 tactics the caller used.",
      },
      { title: "Keep codes and personal details private", achieved: true, detail: "x" },
      { title: "Check through an official channel", achieved: true, detail: "y" },
    ]);
    expect(r.cues).toEqual({
      spotted: ["Claimed to be T-Mobile", "A made-up “verification” code"],
      missed: ["Countdown pressure"],
    });
  });

  it("credits spotted tactics in the stated rubric", () => {
    expect(scoreFor(debrief)).toBe(5); // 15 - 3*2 - 2*2 = 5 (floor)
    expect(
      scoreFor({
        outcome: "recovered",
        tally: { protective: 1, risky: 1 },
        cues: { encountered: [], spotted: ["a"], missed: [], extraFlags: 0 },
      }),
    ).toBe(55);
  });
});

describe("🚩 spotting", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("posts to the spot endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ sessionId: "s1" }), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await simulationService.spotRedFlag("s1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/simulator\/sessions\/s1\/spot$/),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
