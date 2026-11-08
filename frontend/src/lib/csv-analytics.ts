/**
 * Parses the Ollama-analyzed transcript CSV into structured JSON
 * for the Employer Analytics Dashboard.
 */

export interface SimulationRecord {
  userId: string;
  timestamp: string;
  scamType: string;
  redFlags: string[];
  vulnerabilityScore: number;
  employeeSummary: string;
  employeeName: string;
  department: string;
  scenario: string;
  durationSeconds: number;
  outcome: "compromised" | "resisted";
}

export interface TacticAggregate {
  tactic: string;
  /** Display label for UI */
  label: string;
  /** Average vulnerability across records featuring this tactic */
  avgScore: number;
  /** Number of records featuring this tactic */
  count: number;
}

export interface ScenarioAggregate {
  scenario: string;
  avgScore: number;
  count: number;
}

/** Parses raw CSV text into an array of SimulationRecord. */
export function parseCsv(raw: string): SimulationRecord[] {
  const lines = raw.trim().split("\n");
  if (lines.length < 2) return [];

  // Skip header row
  return lines.slice(1).map((line) => {
    // Handle potential commas inside quoted fields
    const fields = parseCSVLine(line);
    return {
      userId: fields[0]?.trim() ?? "",
      timestamp: fields[1]?.trim() ?? "",
      scamType: fields[2]?.trim() ?? "",
      redFlags: (fields[3] ?? "")
        .split(";")
        .map((f) => f.trim())
        .filter(Boolean),
      vulnerabilityScore: Number(fields[4]?.trim() ?? 0),
      employeeSummary: fields[5]?.trim() ?? "",
      employeeName: fields[6]?.trim() ?? "",
      department: fields[7]?.trim() ?? "",
      scenario: fields[8]?.trim() ?? "",
      durationSeconds: Number(fields[9]?.trim() ?? 0),
      outcome: (fields[10]?.trim() ?? "resisted") as "compromised" | "resisted",
    };
  });
}

/** Simple CSV line parser that handles quoted fields. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/** Canonical tactic names and their display labels. */
const TACTIC_LABELS: Record<string, string> = {
  urgency: "Urgency",
  authority: "Authority",
  fear: "Fear",
  rewards: "Rewards",
  social_engineering: "Social Eng.",
  pii_request: "PII Request",
};

/** Aggregate vulnerability by psychological tactic across all records. */
export function aggregateByTactic(records: SimulationRecord[]): TacticAggregate[] {
  const map = new Map<string, { total: number; count: number }>();

  for (const record of records) {
    for (const flag of record.redFlags) {
      const key = flag.toLowerCase();
      const existing = map.get(key) ?? { total: 0, count: 0 };
      existing.total += record.vulnerabilityScore;
      existing.count += 1;
      map.set(key, existing);
    }
  }

  return Array.from(map.entries())
    .map(([tactic, { total, count }]) => ({
      tactic,
      label: TACTIC_LABELS[tactic] ?? tactic,
      avgScore: Math.round(total / count),
      count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}

/** Aggregate average vulnerability score by scenario type. */
export function aggregateByScenario(records: SimulationRecord[]): ScenarioAggregate[] {
  const map = new Map<string, { total: number; count: number }>();

  for (const record of records) {
    const key = record.scenario;
    const existing = map.get(key) ?? { total: 0, count: 0 };
    existing.total += record.vulnerabilityScore;
    existing.count += 1;
    map.set(key, existing);
  }

  return Array.from(map.entries())
    .map(([scenario, { total, count }]) => ({
      scenario,
      avgScore: Math.round(total / count),
      count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}

/** Compute fleet-wide KPI summaries. */
export function computeKPIs(records: SimulationRecord[]) {
  const totalSimulations = records.length;
  const avgVulnerability =
    records.length > 0
      ? Math.round(records.reduce((sum, r) => sum + r.vulnerabilityScore, 0) / records.length)
      : 0;
  const criticalCompromises = records.filter(
    (r) => r.outcome === "compromised" && r.redFlags.includes("pii_request"),
  ).length;

  return { totalSimulations, avgVulnerability, criticalCompromises };
}

export interface EmployeeAnalytics {
  key: string;
  employeeName: string;
  department: string;
  calls: number;
  latestScore: number;
  averageScore: number;
  compromiseRate: number;
  avgDuration: number;
  improvement: number;
  risk: "Low" | "Moderate" | "High";
}

export interface DepartmentAnalytics {
  department: string;
  calls: number;
  averageScore: number;
  compromiseRate: number;
  employees: number;
}

export interface AdvancedAnalytics {
  resistedRate: number;
  compromiseRate: number;
  averageDuration: number;
  piiExposureRate: number;
  highRiskEmployees: number;
  moderateRiskEmployees: number;
  lowRiskEmployees: number;
  trend: { name: string; score: number; runningAverage: number; outcome: string }[];
  employees: EmployeeAnalytics[];
  departments: DepartmentAnalytics[];
  scamTypes: { scamType: string; calls: number; averageScore: number; compromiseRate: number }[];
  coachingPriorities: string[];
  piiSessions: number;
  piiCompromises: number;
  piiCompromiseRate: number;
  compromisedDuration: number;
  resistedDuration: number;
  tactics: { tactic: string; label: string; occurrences: number; compromised: number; compromiseRate: number; avgScore: number }[];
  heatmap: { department: string; tactic: string; occurrences: number; compromised: number; compromiseRate: number; avgScore: number }[];
}

export function computeAdvancedAnalytics(records: SimulationRecord[]): AdvancedAnalytics {
  const mean = (values: number[]) =>
    values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

  const resisted = records.filter((record) => record.outcome === "resisted").length;
  const compromised = records.filter((record) => record.outcome === "compromised").length;
  const piiCompromises = records.filter(
    (record) => record.outcome === "compromised" && record.redFlags.includes("pii_request"),
  ).length;

  const chronological = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const trend = chronological.map((record, index) => {
    const subset = chronological.slice(0, index + 1);
    return {
      name: new Date(record.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: record.vulnerabilityScore,
      runningAverage: mean(subset.map((item) => item.vulnerabilityScore)),
      outcome: record.outcome,
    };
  });

  const employeeGroups = new Map<string, SimulationRecord[]>();
  for (const record of records) {
    const key = record.userId || record.employeeName.toLowerCase();
    employeeGroups.set(key, [...(employeeGroups.get(key) ?? []), record]);
  }

  const employees: EmployeeAnalytics[] = Array.from(employeeGroups.entries()).map(([key, calls]) => {
    const ordered = [...calls].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const latest = ordered[ordered.length - 1];
    const latestScore = latest?.vulnerabilityScore ?? 0;
    const firstScore = ordered[0]?.vulnerabilityScore ?? latestScore;
    const compromisedCalls = calls.filter((record) => record.outcome === "compromised").length;
    return {
      key,
      employeeName: latest.employeeName,
      department: latest.department,
      calls: calls.length,
      latestScore,
      averageScore: mean(calls.map((record) => record.vulnerabilityScore)),
      compromiseRate: Math.round((compromisedCalls / calls.length) * 100),
      avgDuration: mean(calls.map((record) => record.durationSeconds)),
      improvement: firstScore - latestScore,
      risk: latestScore < 34 ? "Low" : latestScore < 60 ? "Moderate" : "High",
    };
  }).sort((a, b) => b.latestScore - a.latestScore || b.compromiseRate - a.compromiseRate);

  const departmentGroups = new Map<string, SimulationRecord[]>();
  for (const record of records) {
    departmentGroups.set(record.department, [...(departmentGroups.get(record.department) ?? []), record]);
  }
  const departments: DepartmentAnalytics[] = Array.from(departmentGroups.entries()).map(([department, calls]) => ({
    department,
    calls: calls.length,
    averageScore: mean(calls.map((record) => record.vulnerabilityScore)),
    compromiseRate: Math.round((calls.filter((record) => record.outcome === "compromised").length / calls.length) * 100),
    employees: new Set(calls.map((record) => record.userId || record.employeeName)).size,
  })).sort((a, b) => b.averageScore - a.averageScore);

  const scamGroups = new Map<string, SimulationRecord[]>();
  for (const record of records) {
    scamGroups.set(record.scamType, [...(scamGroups.get(record.scamType) ?? []), record]);
  }
  const scamTypes = Array.from(scamGroups.entries()).map(([scamType, calls]) => ({
    scamType,
    calls: calls.length,
    averageScore: mean(calls.map((record) => record.vulnerabilityScore)),
    compromiseRate: Math.round((calls.filter((record) => record.outcome === "compromised").length / calls.length) * 100),
  })).sort((a, b) => b.averageScore - a.averageScore);

  const tacticCounts = new Map<string, { total: number; count: number }>();
  for (const record of records) {
    for (const flag of record.redFlags) {
      const current = tacticCounts.get(flag) ?? { total: 0, count: 0 };
      tacticCounts.set(flag, {
        total: current.total + record.vulnerabilityScore,
        count: current.count + 1,
      });
    }
  }
  const topTactic = Array.from(tacticCounts.entries())
    .sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count))[0];
  const topRisk = employees[0];
  const coachingPriorities = [
    ...(topRisk ? [`Prioritize coaching for ${topRisk.employeeName} (${topRisk.latestScore}/100 latest risk).`] : []),
    ...(topTactic ? [`Focus training on ${topTactic[0].replaceAll("_", " ")} tactics across the fleet.`] : []),
    ...(piiCompromises ? [`${piiCompromises} compromised call(s) included a PII or verification-code request.`] : []),
  ];
  const piiSessionsList = records.filter((record) => record.redFlags.includes("pii_request"));
  const meanDuration = (items: SimulationRecord[]) =>
    items.length ? Math.round(items.reduce((sum, record) => sum + record.durationSeconds, 0) / items.length) : 0;

  const tacticMap = new Map<string, SimulationRecord[]>();
  for (const record of records) {
    for (const rawTactic of record.redFlags) {
      const tactic = rawTactic.toLowerCase();
      tacticMap.set(tactic, [...(tacticMap.get(tactic) ?? []), record]);
    }
  }
  const tactics = Array.from(tacticMap.entries()).map(([tactic, calls]) => ({
    tactic,
    label: TACTIC_LABELS[tactic] ?? tactic.replaceAll("_", " "),
    occurrences: calls.length,
    compromised: calls.filter((record) => record.outcome === "compromised").length,
    compromiseRate: Math.round((calls.filter((record) => record.outcome === "compromised").length / calls.length) * 100),
    avgScore: mean(calls.map((record) => record.vulnerabilityScore)),
  })).sort((a, b) => b.compromiseRate - a.compromiseRate);

  const heatmap: AdvancedAnalytics["heatmap"] = [];
  const departmentNames = Array.from(new Set(records.map((record) => record.department).filter(Boolean)));
  for (const department of departmentNames) {
    const departmentCalls = records.filter((record) => record.department === department);
    for (const tactic of tactics) {
      const calls = departmentCalls.filter((record) =>
        record.redFlags.some((flag) => flag.toLowerCase() === tactic.tactic),
      );
      if (!calls.length) continue;
      heatmap.push({
        department,
        tactic: tactic.label,
        occurrences: calls.length,
        compromised: calls.filter((record) => record.outcome === "compromised").length,
        compromiseRate: Math.round((calls.filter((record) => record.outcome === "compromised").length / calls.length) * 100),
        avgScore: mean(calls.map((record) => record.vulnerabilityScore)),
      });
    }
  }

  return {
    resistedRate: records.length ? Math.round((resisted / records.length) * 100) : 0,
    compromiseRate: records.length ? Math.round((compromised / records.length) * 100) : 0,
    averageDuration: mean(records.map((record) => record.durationSeconds)),
    piiExposureRate: records.length ? Math.round((piiCompromises / records.length) * 100) : 0,
    highRiskEmployees: employees.filter((employee) => employee.risk === "High").length,
    moderateRiskEmployees: employees.filter((employee) => employee.risk === "Moderate").length,
    lowRiskEmployees: employees.filter((employee) => employee.risk === "Low").length,
    trend,
    employees,
    departments,
    scamTypes,
    coachingPriorities,
    piiSessions: piiSessionsList.length,
    piiCompromises: piiSessionsList.filter((record) => record.outcome === "compromised").length,
    piiCompromiseRate: piiSessionsList.length
      ? Math.round((piiSessionsList.filter((record) => record.outcome === "compromised").length / piiSessionsList.length) * 100)
      : 0,
    compromisedDuration: meanDuration(records.filter((record) => record.outcome === "compromised")),
    resistedDuration: meanDuration(records.filter((record) => record.outcome === "resisted")),
    tactics,
    heatmap,
  };
}

/** Formats an array of SimulationRecords back into standard CSV text. */
export function recordsToCsv(records: SimulationRecord[]): string {
  const header = "user_id,timestamp,scam_type,red_flags,vulnerability_score,employee_summary,employee_name,department,scenario,duration_seconds,outcome";
  const rows = records.map((r) => {
    const summary = r.employeeSummary.includes(",") || r.employeeSummary.includes('"')
      ? `"${r.employeeSummary.replace(/"/g, '""')}"`
      : r.employeeSummary;
    return [
      r.userId,
      r.timestamp,
      r.scamType,
      r.redFlags.join("; "),
      r.vulnerabilityScore,
      summary,
      r.employeeName,
      r.department,
      r.scenario,
      r.durationSeconds,
      r.outcome,
    ].join(",");
  });
  return [header, ...rows].join("\n");
}
