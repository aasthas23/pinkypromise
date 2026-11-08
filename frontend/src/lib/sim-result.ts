/**
 * Turns the backend's debrief of a live practice call into the SimResult the
 * results and progress pages already show.
 *
 * The vulnerability score is a training rubric, not a fraud-detection measure:
 *   base by outcome  protected 15 · not answered 30 · stopped partway 55 · shared simulated info 85
 *   +5 per risky response, -3 per protective response, -2 per tactic flagged with 🚩,
 *   clamped to 5–95.
 * Lower is better, as the results page explains.
 */
import type { Difficulty } from "./mock-data";
import type { Debrief, LiveEntry, OutcomeDefinition, TranscriptEntry } from "./simulator-api";
import type { SimResult, TranscriptLine } from "./store";

const OUTCOME_BASE: Record<Debrief["outcome"], number> = {
  protected: 15,
  not_engaged: 30,
  recovered: 55,
  exposed: 85,
};

/** Backend red flag ids → the tactic names the results page highlights. */
export const TACTIC_FOR_FLAG: Record<string, string> = {
  artificial_urgency: "Urgency",
  authority_claim: "Authority",
  caller_id_as_proof: "Authority",
  partial_info_as_proof: "Authority",
  fake_verification_code: "Authority",
  fear_of_loss: "Fear",
  emotional_pressure: "Fear",
  threat_of_arrest: "Fear",
  too_good_offer: "Too-good-to-be-true offer",
  code_request: "Requests for verification codes",
};

/** The three outcomes every call practices. Used before the call if the server list isn't available. */
export const DEFAULT_OUTCOMES: OutcomeDefinition[] = [
  {
    id: "spot_tactics",
    title: "Spot the scam tactics",
    description:
      "Notice the tricks a scammer uses, like urgency, fear or a too-good offer, and flag them with 🚩.",
  },
  {
    id: "protect_info",
    title: "Keep codes and personal details private",
    description: "Don’t share one-time codes, PINs, personal details or payments with a caller.",
  },
  {
    id: "verify_yourself",
    title: "Check through an official channel",
    description:
      "Say you’ll contact the company yourself, using its app or the number on your bill.",
  },
];

export function scoreFor(d: Pick<Debrief, "outcome" | "tally" | "cues">): number {
  const spotted = d.cues?.spotted.length ?? 0;
  const raw = OUTCOME_BASE[d.outcome] + 5 * d.tally.risky - 3 * d.tally.protective - 2 * spotted;
  return Math.max(5, Math.min(95, Math.round(raw)));
}

const unique = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));

export function toTranscriptLines(
  entries: TranscriptEntry[],
  d: Pick<Debrief, "redFlags">,
): TranscriptLine[] {
  const titles = new Map(d.redFlags.map((f) => [f.id, f.title]));
  return entries.map((e) => {
    const flagId = e.flags?.[0];
    const flag = flagId ? (TACTIC_FOR_FLAG[flagId] ?? titles.get(flagId)) : undefined;
    const line: TranscriptLine = {
      who: e.speaker === "caller" ? "caller" : e.speaker === "user" ? "you" : "system",
      text:
        e.speaker === "sms"
          ? `Text message from ${"sender" in e ? (e.sender ?? "unknown") : "unknown"}: ${e.text}`
          : e.text,
    };
    if (flag) line.flag = flag;
    return line;
  });
}

export function debriefToSimResult(
  d: Debrief,
  entries: (TranscriptEntry | LiveEntry)[],
  difficulty: Difficulty,
  source: "practice" | "biweekly",
  completedAt = Date.now(),
): SimResult {
  const k = d.keyBehaviors;
  const title = new Map(d.redFlags.map((f) => [f.id, f.title]));
  const titles = (ids: string[] | undefined) => (ids ?? []).map((id) => title.get(id) ?? id);
  const wentWell = unique([
    ...d.timeline
      .filter((t) => t.kind === "protective")
      .map((t) => (t.quote ? `${t.label}: “${t.quote}”` : t.label)),
    k.protectedSensitive ? "You didn’t hand over anything sensitive" : "",
  ]);
  const watchOut = unique([
    ...d.timeline.filter((t) => t.kind === "risky").map((t) => t.rationale ?? t.label),
    k.answered && !k.verifiedIndependently
      ? "Next time, try checking with T-Mobile yourself through the app or the number on your bill"
      : "",
  ]);
  return {
    difficulty,
    source,
    score: scoreFor(d),
    tactics: unique(d.redFlags.map((f) => TACTIC_FOR_FLAG[f.id] ?? "")),
    wentWell: wentWell.length ? wentWell : ["You finished the practice call"],
    watchOut: watchOut.length ? watchOut : ["Keep it up: stay this careful on real calls"],
    completedAt,
    live: true,
    outcomeTitle: d.ending.title,
    outcomeSummary: d.ending.summary,
    transcript: toTranscriptLines(entries, d),
    aiCaller: d.usedModel,
    outcomes: (d.learningOutcomes ?? []).map(({ title, achieved, detail }) => ({
      title,
      achieved,
      detail,
    })),
    cues: { spotted: titles(d.cues?.spotted), missed: titles(d.cues?.missed) },
  };
}
