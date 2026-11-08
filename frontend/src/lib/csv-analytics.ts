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
