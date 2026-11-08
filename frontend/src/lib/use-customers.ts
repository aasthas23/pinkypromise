import { useMemo } from "react";
import { CURRENT_CUSTOMER_ID, customers, trainingTasks, type Customer } from "./mock-data";
import { useDemo } from "./store";
import { latestTacticScores } from "./analytics";

/** Customer list with the demo user's live stats merged in (future: role-restricted backend query). */
export function useCustomers(): Customer[] {
  const s = useDemo();
  return useMemo(() => customers.map((c) => c.id !== CURRENT_CUSTOMER_ID ? c : {
    ...c,
    vulnerability: s.vulnerability,
    simulations: s.simulations,
    training: Math.round((s.completedTasks.length / trainingTasks.length) * 100),
    lastSimulation: s.lastResult ? new Date(s.lastResult.completedAt).toISOString().slice(0, 10) : c.lastSimulation,
    trend: s.lastResult ? [...c.trend, s.vulnerability] : c.trend,
    susceptibility: latestTacticScores(c.susceptibility, s.lastResult),
    recognized: s.lastResult ? s.lastResult.tactics.filter((t) => !s.lastResult?.watchOut.some((w) => w.toLowerCase().includes(t.toLowerCase()))) : c.recognized,
    missed: s.lastResult ? s.lastResult.watchOut : c.missed,
    summary: s.lastResult ? `Latest simulated call: ${s.lastResult.difficulty}. ${s.lastResult.watchOut.join(". ")}. Scores are illustrative, not a real call assessment.` : c.summary,
  }), [s]);
}
export function riskTone(v: number) { return v < 34 ? "bg-mint text-mint-foreground" : v < 60 ? "bg-peach text-peach-foreground" : "bg-pink text-primary-deep"; }
