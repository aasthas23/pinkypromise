import { useMemo } from "react";
import { CURRENT_CUSTOMER_ID, customers, trainingTasks, type Customer } from "./mock-data";
import { useDemo } from "./store";
import { latestTacticScores } from "./analytics";
import type { SimulationRecord } from "./csv-analytics";

/** Customer list with live stats from store & CSV records merged in. */
export function useCustomers(): Customer[] {
  const s = useDemo();
  return useMemo(() => {
    // 1. Map existing mock customers with their live CSV / store updates
    const baseMapped = customers.map((c) => {
      const csvMatch = s.csvRecords?.find(
        (r) =>
          r.employeeName.toLowerCase() === c.name.toLowerCase() ||
          (c.id === "alex" && r.userId === "fake-user-001") ||
          (c.id === "maria" && r.userId === "fake-user-002") ||
          (c.id === "james" && r.userId === "fake-user-003") ||
          (c.id === "priya" && r.userId === "fake-user-004") ||
          (c.id === "dorothy" && r.userId === "fake-user-005") ||
          (c.id === "marcus" && r.userId === "fake-user-006")
      );

      if (c.id !== CURRENT_CUSTOMER_ID) {
        return {
          ...c,
          vulnerability: csvMatch ? csvMatch.vulnerabilityScore : c.vulnerability,
          summary: csvMatch?.employeeSummary || c.summary,
          lastSimulation: csvMatch?.timestamp ? csvMatch.timestamp.slice(0, 10) : c.lastSimulation,
        };
      }

      const alexSummary =
        s.lastResult
          ? `Latest simulated call: ${s.lastResult.difficulty}. ${s.lastResult.watchOut.join(". ")}. Scores are illustrative, not a real call assessment.`
          : csvMatch?.employeeSummary || c.summary;

      return {
        ...c,
        vulnerability: s.vulnerability,
        simulations: s.simulations,
        training: Math.round((s.completedTasks.length / trainingTasks.length) * 100),
        lastSimulation: s.lastResult
          ? new Date(s.lastResult.completedAt).toISOString().slice(0, 10)
          : csvMatch?.timestamp
            ? csvMatch.timestamp.slice(0, 10)
            : c.lastSimulation,
        trend: s.lastResult ? [...c.trend, s.vulnerability] : c.trend,
        susceptibility: latestTacticScores(c.susceptibility, s.lastResult),
        recognized: s.lastResult
          ? s.lastResult.tactics.filter((t) => !s.lastResult?.watchOut.some((w) => w.toLowerCase().includes(t.toLowerCase())))
          : c.recognized,
        missed: s.lastResult ? s.lastResult.watchOut : c.missed,
        summary: alexSummary,
      };
    });

    // 2. Discover any additional employees from active CSV records
    const knownNames = new Set(customers.map((c) => c.name.toLowerCase()));
    const extraRecords = (s.csvRecords || []).filter(
      (r) => !knownNames.has(r.employeeName.toLowerCase())
    );

    // Group extra records by employeeName to build comprehensive profile
    const extraCustomersMap = new Map<string, SimulationRecord>();
    for (const r of extraRecords) {
      const key = r.employeeName.toLowerCase();
      if (!extraCustomersMap.has(key)) {
        extraCustomersMap.set(key, r);
      }
    }

    const extraCustomers: Customer[] = Array.from(extraCustomersMap.values()).map((r) => {
      const id = r.employeeName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const nameParts = r.employeeName.split(" ");
      const initials = nameParts.map((w) => w[0]).join("").slice(0, 2).toUpperCase();
      const hasUrgency = r.redFlags.some((f) => f.includes("urgency"));
      const hasAuthority = r.redFlags.some((f) => f.includes("authority"));
      const hasFear = r.redFlags.some((f) => f.includes("fear"));
      const hasRewards = r.redFlags.some((f) => f.includes("rewards"));
      const hasSocial = r.redFlags.some((f) => f.includes("social"));

      return {
        id,
        name: r.employeeName,
        initials,
        vulnerability: r.vulnerabilityScore,
        simulations: (s.csvRecords || []).filter((x) => x.employeeName === r.employeeName).length || 1,
        training: Math.min(100, Math.max(10, Math.round(100 - r.vulnerabilityScore * 0.7))),
        lastSimulation: r.timestamp ? r.timestamp.slice(0, 10) : "2026-11-08",
        trend: [Math.min(100, r.vulnerabilityScore + 12), Math.min(100, r.vulnerabilityScore + 6), r.vulnerabilityScore],
        susceptibility: {
          Urgency: hasUrgency ? 75 : 30,
          Authority: hasAuthority ? 80 : 25,
          Fear: hasFear ? 70 : 20,
          Rewards: hasRewards ? 65 : 20,
          "Social engineering": hasSocial ? 70 : 25,
        },
        recognized: r.outcome === "resisted" ? ["Official verification"] : [],
        missed: r.redFlags.map((f) => f.replace("_", " ")),
        summary: r.employeeSummary,
      };
    });

    return [...baseMapped, ...extraCustomers];
  }, [s]);
}

export function riskTone(v: number) {
  return v < 34 ? "bg-mint text-mint-foreground" : v < 60 ? "bg-peach text-peach-foreground" : "bg-pink text-primary-deep";
}
