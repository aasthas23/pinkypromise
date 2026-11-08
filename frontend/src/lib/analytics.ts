import type { Customer, Tactic } from "./mock-data";
import type { SimResult } from "./store";

export const BIWEEKLY_INTERVAL_DAYS = 14;
export function nextCallDate(consentAt: number | null): number | null {
  return consentAt === null ? null : consentAt + BIWEEKLY_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
}

export function tacticAnalytics(customers: Customer[]) {
  const tactics: Tactic[] = ["Urgency", "Authority", "Fear", "Rewards", "Social engineering"];
  return tactics.map((tactic) => ({
    tactic,
    score: customers.length ? Math.round(customers.reduce((sum, c) => sum + c.susceptibility[tactic], 0) / customers.length) : 0,
    affected: customers.filter((c) => c.susceptibility[tactic] >= 60).length,
  })).sort((a, b) => b.score - a.score);
}

export function latestTacticScores(base: Customer["susceptibility"], result: SimResult | null) {
  if (!result) return base;
  const scores = { ...base };
  for (const tactic of Object.keys(base) as Tactic[]) {
    const used = result.tactics.includes(tactic) || (tactic === "Rewards" && result.tactics.includes("Too-good-to-be-true offer"));
    if (used) scores[tactic] = result.score;
  }
  return scores;
}