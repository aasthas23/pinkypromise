import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { useMemo } from "react";
import { PageTitle } from "@/components/safe/AppShell";
import { EmployerDashboard } from "@/components/safe/EmployerDashboard";
import { parseCsv } from "@/lib/csv-analytics";
import { useDemo } from "@/lib/store";

/* ── Inline the CSV as base fallback ── */
import csvRaw from "@/data/fake_analysis.csv?raw";

export const Route = createFileRoute("/employer-dashboard")({
  head: () => ({
    meta: [
      { title: "Employer Analytics — Pinky Promise" },
      {
        name: "description",
        content:
          "Fleet-wide scam simulation analytics: vulnerability scores, tactic breakdowns, and employee risk roster.",
      },
      { property: "og:title", content: "Employer Analytics — Pinky Promise" },
      {
        property: "og:description",
        content:
          "Fleet-wide scam simulation analytics: vulnerability scores, tactic breakdowns, and employee risk roster.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmployerDashboardPage,
});

function EmployerDashboardPage() {
  const demo = useDemo();
  const records = useMemo(() => {
    return demo.csvRecords && demo.csvRecords.length > 0
      ? demo.csvRecords
      : parseCsv(csvRaw);
  }, [demo.csvRecords]);

  return (
    <div className="space-y-6">
      <PageTitle title="Employer Analytics" sub="Fleet-wide scam simulation insights">
        <span className="flex items-center gap-2 rounded-full bg-mint px-3 py-1.5 text-xs font-bold text-mint-foreground">
          <Activity className="size-3.5" />
          Live CSV Sync Active
        </span>
      </PageTitle>

      <EmployerDashboard records={records} />

      <p className="text-xs text-muted-foreground">
        Data sourced from Ollama-analyzed call transcripts. Scores are illustrative and synchronized across
        employee dashboard, customer progress check, and home page safety metrics.
      </p>
    </div>
  );
}
