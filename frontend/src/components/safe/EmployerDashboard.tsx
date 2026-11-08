import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Gauge,
  PhoneCall,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SimulationRecord } from "@/lib/csv-analytics";
import { aggregateByTactic, aggregateByScenario, computeKPIs, recordsToCsv } from "@/lib/csv-analytics";
import { addOrUpdateCsvRecord, resetDemo } from "@/lib/store";

/* ── Style tokens (match AnalystCharts conventions) ────────────────── */
const tones = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary-deep)",
];
const tip = {
  background: "var(--card)",
  color: "var(--foreground)",
  border: "1px solid var(--border)",
  borderRadius: 20,
  boxShadow: "var(--shadow-soft)",
};
const tick = { fill: "var(--muted-foreground)", fontSize: 11 };

/* ── Severity helpers ──────────────────────────────────────────────── */
function severityBadge(score: number) {
  if (score < 34)
    return (
      <Badge className="border-transparent bg-mint text-mint-foreground hover:bg-mint/80">
        Low
      </Badge>
    );
  if (score < 60)
    return (
      <Badge className="border-transparent bg-peach text-peach-foreground hover:bg-peach/80">
        Moderate
      </Badge>
    );
  return (
    <Badge className="border-transparent bg-pink text-primary-deep hover:bg-pink/80">
      High
    </Badge>
  );
}

function kpiColor(score: number) {
  if (score < 34) return "bg-mint text-mint-foreground";
  if (score < 60) return "bg-peach text-peach-foreground";
  return "bg-pink text-primary-deep";
}

function outcomeBadge(outcome: string) {
  return outcome === "compromised" ? (
    <Badge variant="destructive">Compromised</Badge>
  ) : (
    <Badge className="border-transparent bg-mint text-mint-foreground hover:bg-mint/80">
      Resisted
    </Badge>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ── Sample transcripts for quick testing ──────────────────────────── */
const SAMPLE_TRANSCRIPTS: Record<
  string,
  { label: string; text: string; scamType: string; scenario: string; defaultOutcome: "resisted" | "compromised" }
> = {
  resisted: {
    label: "Alex Resisted (Verification Check)",
    scamType: "tmobile_phishing",
    scenario: "Fake T-Mobile Support Rep",
    defaultOutcome: "resisted",
    text: `Caller: This is T-Mobile fraud prevention. We detected an unauthorized attempt to access your SIM card.
We sent a 6-digit confirmation code to your phone. Read it back immediately or your phone will be disconnected.
Customer: I never share codes over an inbound call. If this is legitimate, I'll log in to the official T-Mobile app or call the 611 customer care number myself.
Caller: You don't have time! This is urgent! Your line will be suspended right now.
Customer: I am hanging up now to verify through the official app. Have a good day.`,
  },
  compromised: {
    label: "Alex Compromised (Disclosed OTP under pressure)",
    scamType: "tmobile_phishing",
    scenario: "Fake T-Mobile Support Rep",
    defaultOutcome: "compromised",
    text: `Caller: Urgent notice from T-Mobile Account Security. Suspicious login from overseas.
Caller: To keep your service active and block the hacker, please confirm your 6-digit code right now.
Customer: Wait, I received a text saying not to share this code with anyone.
Caller: That is standard automated text. I am an official representative from fraud control. If you don't read it in 30 seconds your account will be locked.
Customer: Okay, the code is 849201. Please fix it.
Caller: Code confirmed. Account secured.`,
  },
  rewards: {
    label: "Rewards Scam (Special Loyalty Discount)",
    scamType: "rewards_scam",
    scenario: "Suspicious Discount Offer",
    defaultOutcome: "resisted",
    text: `Caller: Congratulations! As a valued T-Mobile subscriber, you've qualified for a $50/mo plan discount and a free gift card.
Caller: To apply this promotional loyalty credit, I just need your account PIN and last four digits of your SSN.
Customer: That sounds too good to be true. T-Mobile doesn't ask for my PIN to apply discounts.
Customer: I'll check my plan options in my online account. Goodbye.`,
  },
};

/* ── Sort helpers for the roster table ─────────────────────────────── */
type SortField =
  | "employeeName"
  | "department"
  | "scenario"
  | "durationSeconds"
  | "outcome"
  | "vulnerabilityScore";
type SortDir = "asc" | "desc";

function sortRecords(records: SimulationRecord[], field: SortField, dir: SortDir) {
  return [...records].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (typeof av === "number" && typeof bv === "number") {
      return dir === "asc" ? av - bv : bv - av;
    }
    const sa = String(av).toLowerCase();
    const sb = String(bv).toLowerCase();
    return dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
  });
}

/* ═══════════════════════════════════════════════════════════════════ */
/* Main component                                                      */
/* ═══════════════════════════════════════════════════════════════════ */
export function EmployerDashboard({ records }: { records: SimulationRecord[] }) {
  const kpis = useMemo(() => computeKPIs(records), [records]);
  const tacticData = useMemo(() => aggregateByTactic(records), [records]);
  const scenarioData = useMemo(() => aggregateByScenario(records), [records]);

  /* ── Sortable roster state ─────────────────────────────────────── */
  const [sortField, setSortField] = useState<SortField>("vulnerabilityScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const sorted = useMemo(() => sortRecords(records, sortField, sortDir), [records, sortField, sortDir]);

  /* ── Interactive Transcript Ingestion State ─────────────────────── */
  const [showIngest, setShowIngest] = useState(false);
  const [selectedSampleKey, setSelectedSampleKey] = useState("resisted");
  const [customText, setCustomText] = useState(SAMPLE_TRANSCRIPTS.resisted.text);
  const [targetEmployee, setTargetEmployee] = useState("Alex Rivera");
  const [targetDept, setTargetDept] = useState("Customer Support");
  const [analyzing, setAnalyzing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (field !== sortField) return <ArrowUpDown className="ml-1 inline size-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 inline size-3" />
    ) : (
      <ChevronDown className="ml-1 inline size-3" />
    );
  }

  /* ── Radar chart data (normalize to 0-100) ─────────────────────── */
  const radarData = useMemo(
    () =>
      tacticData.map((t) => ({
        tactic: t.label,
        score: t.avgScore,
        fullMark: 100,
      })),
    [tacticData],
  );

  /* ── Handle Export CSV ─────────────────────────────────────────── */
  function handleExportCsv() {
    const csvContent = recordsToCsv(records);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `pinky_promise_fraud_analysis_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /* ── Handle Analyze Transcript ─────────────────────────────────── */
  async function handleAnalyzeTranscript() {
    if (!customText.trim()) return;
    setAnalyzing(true);
    setStatusMsg(null);

    try {
      const sample = SAMPLE_TRANSCRIPTS[selectedSampleKey];
      const payload = {
        user_id: targetEmployee === "Alex Rivera" ? "fake-user-001" : `fake-user-${Date.now().toString().slice(-3)}`,
        transcript: customText,
        scam_type: sample?.scamType || "tmobile_phishing",
        employee_name: targetEmployee,
        department: targetDept,
        scenario: sample?.scenario || "Fake T-Mobile Support Rep",
        duration_seconds: 180,
      };

      let evaluatedScore = 46;
      let evaluatedOutcome: "resisted" | "compromised" = "resisted";
      let evaluatedRedFlags = ["urgency", "authority"];
      let summaryText = "";

      // Try calling backend API first (which routes to Ollama or heuristic fallback)
      try {
        const resp = await fetch("http://localhost:8000/transcripts/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (resp.ok) {
          const data = await resp.json();
          evaluatedScore = data.vulnerability_score;
          evaluatedOutcome = data.outcome as "resisted" | "compromised";
          evaluatedRedFlags = data.red_flags;
          summaryText = data.employee_summary;
        } else {
          throw new Error("Backend response not ok");
        }
      } catch {
        // Fallback: client-side evaluation matching the Ollama heuristic
        const lower = customText.toLowerCase();
        const piiHit = lower.includes("code is") || lower.includes("849201") || lower.includes("pin");
        const urgencyHit = lower.includes("urgent") || lower.includes("immediately") || lower.includes("right now");
        const refusalHit = lower.includes("never share") || lower.includes("hanging up") || lower.includes("official app");

        if (piiHit && !refusalHit) {
          evaluatedScore = 88;
          evaluatedOutcome = "compromised";
          evaluatedRedFlags = ["urgency", "authority", "pii_request"];
          summaryText = `${targetEmployee} exposed sensitive credentials under urgency pressure. Immediate retraining required.`;
        } else if (refusalHit) {
          evaluatedScore = 26;
          evaluatedOutcome = "resisted";
          evaluatedRedFlags = urgencyHit ? ["urgency", "authority"] : ["authority"];
          summaryText = `${targetEmployee} resisted caller manipulation and verified identity through official channels.`;
        } else {
          evaluatedScore = 46;
          evaluatedOutcome = "resisted";
          evaluatedRedFlags = ["urgency", "authority"];
          summaryText = `${targetEmployee} hesitated during the call but refrained from sharing verification codes.`;
        }
      }

      const newRecord: SimulationRecord = {
        userId: payload.user_id,
        timestamp: new Date().toISOString(),
        scamType: payload.scam_type,
        redFlags: evaluatedRedFlags,
        vulnerabilityScore: evaluatedScore,
        employeeSummary: summaryText,
        employeeName: targetEmployee,
        department: targetDept,
        scenario: payload.scenario,
        durationSeconds: 175,
        outcome: evaluatedOutcome,
      };

      addOrUpdateCsvRecord(newRecord);
      setStatusMsg(
        `✓ Analyzed & synced to CSV! Score: ${evaluatedScore} (${evaluatedOutcome.toUpperCase()}). Employee roster, home page, and customer progress updated.`
      );
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ═══ ACTIONS BAR: Ingest Transcript, Export, Reset ═════════ */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-primary" />
          <div>
            <h3 className="font-bold">Call Transcript Pipeline</h3>
            <p className="text-xs text-muted-foreground">
              Ollama Llama-3.1 inference generates structured CSV analytics
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={showIngest ? "hero" : "soft"}
            size="sm"
            onClick={() => setShowIngest(!showIngest)}
          >
            <Sparkles className="size-4" />
            {showIngest ? "Close Transcript AI" : "Analyze New Transcript"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="size-4" />
            Export CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetDemo();
              setStatusMsg("Reset CSV records to default baseline.");
            }}
          >
            <RefreshCw className="size-4" />
            Reset
          </Button>
        </div>
      </div>

      {/* ═══ EXPANDABLE TRANSCRIPT INGESTION PANEL ══════════════════ */}
      {showIngest && (
        <section className="rounded-2xl border-2 border-primary/20 bg-pink/40 p-5 shadow-soft">
          <div className="flex items-center gap-2 font-black text-primary-deep">
            <Sparkles className="size-5" />
            <h3>Ollama Call Transcript Analyzer & CSV Updater</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Feed any phone transcript (.txt) into the scoring pipeline. Updates the fleet CSV and synchronizes
            with Alex Rivera's customer progress check and home page metrics in real-time.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground">Target Employee</label>
              <select
                className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm font-semibold"
                value={targetEmployee}
                onChange={(e) => setTargetEmployee(e.target.value)}
              >
                <option value="Alex Rivera">Alex Rivera (Customer Support / Demo User)</option>
                <option value="Maria Chen">Maria Chen (Billing)</option>
                <option value="James O'Connor">James O'Connor (Technical Support)</option>
                <option value="Priya Natarajan">Priya Natarajan (Customer Support)</option>
                <option value="Dorothy Williams">Dorothy Williams (Billing)</option>
                <option value="Marcus Johnson">Marcus Johnson (Technical Support)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground">Quick Preset Transcript</label>
              <select
                className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm font-semibold"
                value={selectedSampleKey}
                onChange={(e) => {
                  setSelectedSampleKey(e.target.value);
                  const sample = SAMPLE_TRANSCRIPTS[e.target.value];
                  if (sample) setCustomText(sample.text);
                }}
              >
                {Object.entries(SAMPLE_TRANSCRIPTS).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground">Department</label>
              <input
                className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm font-semibold"
                value={targetDept}
                onChange={(e) => setTargetDept(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="text-xs font-bold text-muted-foreground">
              Call Transcript (.txt text)
            </label>
            <textarea
              className="mt-1 h-32 w-full rounded-xl border bg-card p-3 font-mono text-xs leading-relaxed"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Paste raw conversation lines here..."
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="hero"
              disabled={analyzing || !customText.trim()}
              onClick={handleAnalyzeTranscript}
            >
              {analyzing ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {analyzing ? "Running Ollama AI Analysis..." : "Analyze Transcript & Update CSV"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Calls backend Ollama LLM endpoint or automatic heuristic fallback.
            </span>
          </div>

          {statusMsg && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-mint px-4 py-3 text-sm font-bold text-mint-foreground">
              <CheckCircle2 className="size-5 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}
        </section>
      )}

      {/* ═══ TOP ROW: KPI Cards ═══════════════════════════════════ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Total Simulations */}
        <div className="rounded-xl border p-4 shadow-soft bg-primary text-primary-foreground sm:p-5">
          <PhoneCall className="size-5 text-primary-foreground" />
          <p className="mt-3 text-4xl font-black">{kpis.totalSimulations}</p>
          <p className="text-sm font-bold opacity-70">Total Simulations Run</p>
        </div>

        {/* Average Fleet Vulnerability Score */}
        <div
          className={cn(
            "rounded-xl border p-4 shadow-soft sm:p-5",
            kpiColor(kpis.avgVulnerability),
          )}
        >
          <Gauge className="size-5" />
          <p className="mt-3 text-4xl font-black">{kpis.avgVulnerability}</p>
          <p className="text-sm font-bold opacity-70">Avg. Fleet Vulnerability</p>
        </div>

        {/* Critical Compromises */}
        <div className="rounded-xl border p-4 shadow-soft bg-peach text-peach-foreground sm:p-5">
          <AlertTriangle className="size-5" />
          <p className="mt-3 text-4xl font-black">{kpis.criticalCompromises}</p>
          <p className="text-sm font-bold opacity-70">Critical Compromises (PII)</p>
        </div>
      </div>

      {/* ═══ MIDDLE ROW: Charts ═══════════════════════════════════ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Radar Chart — Vulnerability by Tactic */}
        <section className="chart-surface border-t-4 border-t-primary p-4 sm:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-black">Vulnerability by Tactic</h2>
            <p className="text-sm text-muted-foreground">
              Aggregate weaknesses across psychological tactics
            </p>
          </div>
          <div
            className="h-72 w-full min-w-0"
            role="img"
            aria-label="Radar chart of vulnerability by psychological tactic"
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="tactic" tick={tick} />
                <PolarRadiusAxis
                  domain={[0, 100]}
                  tick={tick}
                  axisLine={false}
                />
                <Radar
                  name="Avg. Vulnerability"
                  dataKey="score"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
                <Tooltip contentStyle={tip} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Bar Chart — Avg Vulnerability by Scenario */}
        <section className="chart-surface border-t-4 border-t-mint-foreground p-4 sm:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-black">Vulnerability by Scenario</h2>
            <p className="text-sm text-muted-foreground">
              Average score broken down by simulation scenario
            </p>
          </div>
          <div
            className="h-72 w-full min-w-0"
            role="img"
            aria-label="Bar chart of average vulnerability by scenario"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={scenarioData}
                layout="vertical"
                margin={{ left: 0, right: 24, top: 0, bottom: 0 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="var(--border)"
                  strokeDasharray="3 5"
                />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={tick}
                />
                <YAxis
                  dataKey="scenario"
                  type="category"
                  width={110}
                  axisLine={false}
                  tickLine={false}
                  tick={tick}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={tip}
                />
                <Bar
                  dataKey="avgScore"
                  name="Avg. Vulnerability"
                  barSize={22}
                  radius={[0, 11, 11, 0]}
                >
                  {scenarioData.map((_s, i) => (
                    <Cell key={_s.scenario} fill={tones[i % tones.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* ═══ BOTTOM ROW: Employee Risk Roster ═════════════════════ */}
      <section className="chart-surface overflow-hidden">
        <div className="flex items-center justify-between p-5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-primary" />
            <h2 className="text-lg font-black">Employee Risk Roster</h2>
          </div>
          <Badge variant="outline" className="text-xs">
            {records.length} records in active CSV
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                {(
                  [
                    ["employeeName", "Employee"],
                    ["department", "Dept"],
                    ["scenario", "Scenario"],
                    ["durationSeconds", "Duration"],
                    ["outcome", "Outcome"],
                    ["vulnerabilityScore", "Score"],
                  ] as [SortField, string][]
                ).map(([field, label]) => (
                  <th
                    key={field}
                    className="cursor-pointer select-none px-5 py-3 font-black hover:text-foreground"
                    onClick={() => handleSort(field)}
                  >
                    {label}
                    <SortIcon field={field} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const isCurrentAlex = r.userId === "fake-user-001" || r.employeeName === "Alex Rivera";
                return (
                  <tr
                    key={`${r.userId}-${r.timestamp}`}
                    className={cn(
                      "border-t transition-colors hover:bg-blush",
                      isCurrentAlex && "bg-pink/20 font-medium"
                    )}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-full bg-pink text-xs font-black text-primary-deep">
                          {r.employeeName
                            .split(" ")
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)}
                        </span>
                        <div>
                          <span className="font-bold">{r.employeeName}</span>
                          {isCurrentAlex && (
                            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary">
                              Synced to Home
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{r.department}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.scenario}</td>
                    <td className="px-5 py-3 font-semibold tabular-nums">
                      {formatDuration(r.durationSeconds)}
                    </td>
                    <td className="px-5 py-3">{outcomeBadge(r.outcome)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 font-black",
                            r.vulnerabilityScore < 34
                              ? "bg-mint text-mint-foreground"
                              : r.vulnerabilityScore < 60
                                ? "bg-peach text-peach-foreground"
                                : "bg-pink text-primary-deep",
                          )}
                        >
                          {r.vulnerabilityScore}
                        </span>
                        {severityBadge(r.vulnerabilityScore)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
