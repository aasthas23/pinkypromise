import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { PageTitle } from "@/components/safe/AppShell";
import { useDemo } from "@/lib/store";
import { EmployerDashboard } from "@/components/safe/EmployerDashboard";
import { parseCsv } from "@/lib/csv-analytics";
import csvRaw from "@/data/fake_analysis.csv?raw";

export const Route = createFileRoute("/employee/")({
  head: () => ({ meta: [{ title: "Employee Analytics — Pinky Promise" }, { name: "description", content: "Comprehensive fleet-wide scam simulation intelligence, employee risk, coaching, and simulation analytics." }] }),
  component: Overview,
});


function Overview() {
  const { csvRecords } = useDemo();
  const records = csvRecords?.length ? csvRecords : parseCsv(csvRaw);

  return (
    <div className="space-y-6">
      <PageTitle title="Employee Analytics" sub="Fleet-wide scam simulation intelligence">
        <span className="flex items-center gap-2 rounded-full bg-mint px-3 py-1.5 text-xs font-bold text-mint-foreground">
          <Activity className="size-3.5" />
          Live CSV Sync
        </span>
      </PageTitle>
      <EmployerDashboard records={records} />
    </div>
  );
}
