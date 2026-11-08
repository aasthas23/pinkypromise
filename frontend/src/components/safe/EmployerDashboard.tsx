import { Fragment, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  AlertTriangle,
  Activity,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Download,
  Gauge,
  PhoneCall,
  Clock3,
  BrainCircuit,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SimulationRecord } from "@/lib/csv-analytics";
import {
  aggregateByTactic,
  aggregateByScenario,
  computeAdvancedAnalytics,
  computeKPIs,
  recordsToCsv,
} from "@/lib/csv-analytics";

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
  const advanced = useMemo(() => computeAdvancedAnalytics(records), [records]);

  /* ── Sortable roster state ─────────────────────────────────────── */
  const [sortField, setSortField] = useState<SortField>("vulnerabilityScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const sorted = useMemo(() => sortRecords(records, sortField, sortDir), [records, sortField, sortDir]);
  const [explorerSearch, setExplorerSearch] = useState("");
  const [explorerOutcome, setExplorerOutcome] = useState<"all" | "compromised" | "resisted">("all");
  const exploredRecords = useMemo(() => {
    const query = explorerSearch.trim().toLowerCase();
    return sorted.filter((record) => {
      const matchesOutcome = explorerOutcome === "all" || record.outcome === explorerOutcome;
      const searchable = `${record.employeeName} ${record.department} ${record.scenario} ${record.scamType} ${record.employeeSummary}`.toLowerCase();
      return matchesOutcome && (!query || searchable.includes(query));
    });
  }, [sorted, explorerSearch, explorerOutcome]);

  const [activeSection, setActiveSection] = useState<"command" | "threats" | "people" | "coaching" | "explorer">("command");

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

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExportCsv}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <nav className="overflow-x-auto rounded-2xl border bg-card p-2 shadow-soft">
        <div className="flex min-w-max gap-1">
          {[
            ["command", "01 Command Center"],
            ["threats", "02 Threat Intelligence"],
            ["people", "03 People & Teams"],
            ["coaching", "04 Coaching Center"],
            ["explorer", "05 Simulation Explorer"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveSection(id as typeof activeSection);
                document.getElementById(`analytics-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={cn(
                "rounded-xl px-4 py-2.5 text-sm font-bold transition-colors",
                activeSection === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <section id="analytics-command" className="scroll-mt-24 rounded-2xl border bg-gradient-to-br from-pink/45 via-card to-mint/35 p-5 shadow-soft sm:p-6">
        <div className="flex flex-col gap-5">
          <div>
            <div className="flex items-center gap-2 text-primary-deep">
              <BrainCircuit className="size-5" />
              <h2 className="text-lg font-black">Penny&apos;s Intelligence Brief</h2>
            </div>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Automatic, evidence-based findings generated from the synchronized simulation records.
            </p>
          </div>
          <Badge className="w-fit bg-primary text-primary-foreground">
            {advanced.compromiseRate}% fleet compromise rate
          </Badge>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3">
          <div className="rounded-xl border bg-card/90 p-4">
            <p className="text-xs font-black uppercase text-primary">Sensitive data risk</p>
            <p className="mt-2 text-2xl font-black">{advanced.piiCompromiseRate}%</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {advanced.piiCompromises} of {advanced.piiSessions} calls containing PII requests compromised.
            </p>
          </div>
          <div className="rounded-xl border bg-card/90 p-4">
            <p className="text-xs font-black uppercase text-primary">Conversation behavior</p>
            <p className="mt-2 text-2xl font-black">{formatDuration(advanced.compromisedDuration)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              average compromised duration; resisted calls averaged {formatDuration(advanced.resistedDuration)}.
            </p>
          </div>
          <div className="rounded-xl border bg-card/90 p-4">
            <p className="text-xs font-black uppercase text-primary">Priority target</p>
            <p className="mt-2 text-lg font-black">{advanced.employees[0]?.employeeName ?? "No employees yet"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {advanced.employees[0]
                ? `${advanced.employees[0].latestScore}/100 latest risk with ${advanced.employees[0].compromiseRate}% compromise rate.`
                : "Complete a simulation to generate coaching priorities."}
            </p>
          </div>
        </div>
      </section>

      {/* ═══ TOP ROW: KPI Cards ═══════════════════════════════════ */}
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-xl border bg-primary p-5 shadow-soft text-primary-foreground">
          <PhoneCall className="size-5" />
          <p className="mt-3 text-4xl font-black">{kpis.totalSimulations}</p>
          <p className="text-sm font-bold opacity-70">Total simulations</p>
          <p className="mt-2 text-xs opacity-75">{advanced.employees.length} employees assessed</p>
        </div>
        <div className={cn("rounded-xl border p-5 shadow-soft", kpiColor(kpis.avgVulnerability))}>
          <Gauge className="size-5" />
          <p className="mt-3 text-4xl font-black">{kpis.avgVulnerability}</p>
          <p className="text-sm font-bold opacity-70">Average vulnerability</p>
          <p className="mt-2 text-xs opacity-75">{advanced.resistedRate}% resistance rate</p>
        </div>
        <div className="rounded-xl border bg-peach p-5 shadow-soft text-peach-foreground">
          <AlertTriangle className="size-5" />
          <p className="mt-3 text-4xl font-black">{advanced.compromiseRate}%</p>
          <p className="text-sm font-bold opacity-70">Compromise rate</p>
          <p className="mt-2 text-xs opacity-75">{kpis.criticalCompromises} critical PII compromises</p>
        </div>
        <div className="rounded-xl border bg-mint p-5 shadow-soft text-mint-foreground">
          <Clock3 className="size-5" />
          <p className="mt-3 text-4xl font-black">{formatDuration(advanced.averageDuration)}</p>
          <p className="text-sm font-bold opacity-70">Average call duration</p>
          <p className="mt-2 text-xs opacity-75">{advanced.piiExposureRate}% involved PII exposure</p>
        </div>
        <div className="rounded-xl border p-5 shadow-soft">
          <Target className="size-5 text-primary" />
          <p className="mt-3 text-4xl font-black text-primary-deep">{advanced.highRiskEmployees}</p>
          <p className="text-sm font-bold text-muted-foreground">High-risk employees</p>
          <p className="mt-2 text-xs text-muted-foreground">{advanced.moderateRiskEmployees} moderate · {advanced.lowRiskEmployees} low</p>
        </div>
        <div className="rounded-xl border bg-pink/40 p-5 shadow-soft">
          <Activity className="size-5 text-primary-deep" />
          <p className="mt-3 text-4xl font-black text-primary-deep">{advanced.resistedRate}%</p>
          <p className="text-sm font-bold text-primary-deep/70">Overall resistance</p>
          <p className="mt-2 text-xs text-muted-foreground">Updates with every new call</p>
        </div>
      </div>

      <section id="analytics-threats" className="scroll-mt-24 space-y-6">
        <div className="grid grid-cols-1 gap-6">
          <section className="chart-surface border-t-4 border-t-primary p-4 sm:p-6">
            <div className="mb-5">
              <h2 className="text-xl font-black">Scam tactic effectiveness</h2>
              <p className="text-sm text-muted-foreground">Observed compromise rate whenever each tactic appeared</p>
            </div>
            <div className="space-y-3">
              {advanced.tactics.map((tactic) => (
                <div key={tactic.tactic}>
                  <div className="mb-1 flex items-center justify-between gap-4 text-sm">
                    <span className="font-bold capitalize">{tactic.label}</span>
                    <span className="text-muted-foreground">{tactic.compromiseRate}% · {tactic.compromised}/{tactic.occurrences} calls</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${tactic.compromiseRate}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="chart-surface border-t-4 border-t-peach-foreground p-4 sm:p-6">
            <div className="mb-5">
              <h2 className="text-xl font-black">Conversation duration vs. score</h2>
              <p className="text-sm text-muted-foreground">One dot per simulation; association is not proof of causation</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" />
                  <XAxis type="number" dataKey="duration" name="Duration" unit=" sec" axisLine={false} tickLine={false} tick={tick} />
                  <YAxis type="number" dataKey="score" name="Vulnerability" domain={[0, 100]} axisLine={false} tickLine={false} tick={tick} />
                  <ZAxis range={[70, 70]} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={tip} />
                  <Scatter
                    name="Simulation"
                    data={records.map((record) => ({
                      duration: record.durationSeconds,
                      score: record.vulnerabilityScore,
                      outcome: record.outcome,
                      employee: record.employeeName,
                    }))}
                    fill="var(--primary)"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        <section className="chart-surface overflow-hidden p-0">
          <div className="p-5">
            <h2 className="text-lg font-black">Department exposure heatmap</h2>
            <p className="text-sm text-muted-foreground">Compromise rate when a tactic appeared in each department</p>
          </div>
          <div className="overflow-x-auto px-5 pb-5">
            <div className="grid min-w-[760px] gap-2" style={{ gridTemplateColumns: `170px repeat(${advanced.tactics.length}, minmax(90px, 1fr))` }}>
              <div />
              {advanced.tactics.map((tactic) => (
                <div key={tactic.tactic} className="text-center text-[11px] font-black text-muted-foreground">{tactic.label}</div>
              ))}
              {advanced.departments.map((department) => (
                <Fragment key={department.department}>
                  <div key={`${department.department}-label`} className="flex items-center text-sm font-bold">{department.department}</div>
                  {advanced.tactics.map((tactic) => {
                    const cell = advanced.heatmap.find((item) => item.department === department.department && item.tactic === tactic.label);
                    const rate = cell?.compromiseRate ?? 0;
                    return (
                      <div
                        key={`${department.department}-${tactic.tactic}`}
                        title={cell ? `${cell.compromised}/${cell.occurrences} compromised · ${cell.avgScore}/100 avg score` : "No observations"}
                        className="grid min-h-16 place-items-center rounded-xl border text-xs font-black"
                        style={{ background: cell ? `color-mix(in srgb, var(--primary) ${Math.max(8, rate * 0.75)}%, var(--card))` : "var(--muted)" }}
                      >
                        {cell ? `${rate}%` : "—"}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </section>
      </section>

      {/* ═══ MIDDLE ROW: Charts ═══════════════════════════════════ */}
      <div className="grid grid-cols-1 gap-6">
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

      {/* ═══ LIVE TREND AND COACHING INSIGHTS ════════════════════════ */}
      <div id="analytics-coaching" className="scroll-mt-24 grid grid-cols-1 gap-6">
        <section className="chart-surface border-t-4 border-t-primary p-4 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">Fleet vulnerability trend</h2>
              <p className="text-sm text-muted-foreground">Each simulation plus the running fleet average</p>
            </div>
            <Badge variant="outline"><Activity className="mr-1 size-3" /> Live CSV</Badge>
          </div>
          <div className="h-72 w-full" role="img" aria-label="Simulation vulnerability trend chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={advanced.trend} margin={{ top: 5, right: 12, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={tick} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={tick} />
                <Tooltip contentStyle={tip} />
                <Area type="monotone" dataKey="runningAverage" name="Fleet average" stroke="var(--primary-deep)" fill="url(#riskFill)" strokeWidth={3} />
                <Area type="monotone" dataKey="score" name="Call score" stroke="var(--primary)" fillOpacity={0} strokeWidth={1.5} strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="chart-surface border-t-4 border-t-peach-foreground p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Target className="size-5 text-primary" />
            <h2 className="text-lg font-black">Coaching priorities</h2>
          </div>
          {advanced.coachingPriorities.length > 0 ? (
            <div className="space-y-3">
              {advanced.coachingPriorities.map((priority, index) => (
                <div key={priority} className="rounded-xl border bg-card p-3">
                  <div className="flex gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-pink text-xs font-black text-primary-deep">
                      {index + 1}
                    </span>
                    <p className="text-sm font-semibold leading-relaxed">{priority}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Complete a simulation to generate coaching priorities.</p>
          )}
        </section>
      </div>

      {/* ═══ EMPLOYEE PERFORMANCE AND DEPARTMENT BREAKDOWN ════════ */}
      <div id="analytics-people" className="scroll-mt-24 grid grid-cols-1 gap-6">
        <section className="chart-surface overflow-hidden">
          <div className="p-5">
            <div className="flex items-center gap-2">
              <Users className="size-5 text-primary" />
              <h2 className="text-lg font-black">Employee performance ranking</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Latest risk, call count, compromise rate, and improvement</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Calls</th>
                  <th className="px-5 py-3">Latest</th>
                  <th className="px-5 py-3">Compromise</th>
                  <th className="px-5 py-3">Change</th>
                </tr>
              </thead>
              <tbody>
                {advanced.employees.slice(0, 8).map((employee) => (
                  <tr key={employee.key} className="border-t">
                    <td className="px-5 py-3">
                      <div className="font-bold">{employee.employeeName}</div>
                      <div className="text-xs text-muted-foreground">{employee.department}</div>
                    </td>
                    <td className="px-5 py-3 font-bold tabular-nums">{employee.calls}</td>
                    <td className="px-5 py-3">{severityBadge(employee.latestScore)}</td>
                    <td className="px-5 py-3 font-bold">{employee.compromiseRate}%</td>
                    <td className="px-5 py-3">
                      <span className={cn("inline-flex items-center gap-1 font-bold", employee.improvement >= 0 ? "text-emerald-700" : "text-destructive")}>
                        {employee.improvement >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                        {Math.abs(employee.improvement)} pts
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="chart-surface border-t-4 border-t-mint-foreground p-5">
          <h2 className="text-lg font-black">Department comparison</h2>
          <p className="mt-1 text-sm text-muted-foreground">Average score and compromise rate</p>
          <div className="mt-4 space-y-4">
            {advanced.departments.slice(0, 6).map((department) => (
              <div key={department.department}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-bold">{department.department}</span>
                  <span className="text-muted-foreground">{department.averageScore}/100 · {department.compromiseRate}% compromised</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, department.averageScore)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ═══ BOTTOM ROW: Employee Risk Roster ═════════════════════ */}
      <section id="analytics-explorer" className="scroll-mt-24 chart-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-primary" />
            <div>
              <h2 className="text-lg font-black">Simulation Explorer</h2>
              <p className="text-xs text-muted-foreground">Search, filter, sort, and inspect call evidence</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {exploredRecords.length} of {records.length} records
          </Badge>
        </div>
        <div className="flex flex-col gap-2 border-y bg-muted/40 px-5 py-3">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={explorerSearch}
              onChange={(event) => setExplorerSearch(event.target.value)}
              className="w-full rounded-xl border bg-card py-2 pl-9 pr-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Search employee, department, scenario, or summary"
            />
          </label>
          <div className="flex gap-1 rounded-xl bg-card p-1">
            {(["all", "compromised", "resisted"] as const).map((outcome) => (
              <button
                key={outcome}
                type="button"
                onClick={() => setExplorerOutcome(outcome)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-black capitalize",
                  explorerOutcome === outcome ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {outcome}
              </button>
            ))}
          </div>
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
              {exploredRecords.map((r) => {
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
