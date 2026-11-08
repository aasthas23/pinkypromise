import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  parseCsv,
  recordsToCsv,
  aggregateByTactic,
  aggregateByScenario,
  computeKPIs,
  type SimulationRecord,
} from "@/lib/csv-analytics";
import { addOrUpdateCsvRecord, initialState, resetDemo, useDemo } from "@/lib/store";

const sampleCsv = `user_id,timestamp,scam_type,red_flags,vulnerability_score,employee_summary,employee_name,department,scenario,duration_seconds,outcome
fake-001,2026-11-08T01:00:00,tmobile_phishing,urgency; authority; pii_request,100,Summary 1,Alex Rivera,Support,Fake Support,240,compromised
fake-002,2026-11-08T02:00:00,rewards_scam,rewards; urgency,30,Summary 2,Maria Chen,Billing,Rewards Offer,90,resisted
fake-003,2026-11-08T03:00:00,account_security,fear; authority; pii_request,80,Summary 3,James O'Connor,Tech,Account Alert,180,compromised`;

describe("Employer Analytics Dashboard & CSV Parser", () => {
  it("parses CSV into structured SimulationRecord objects", () => {
    const records = parseCsv(sampleCsv);
    expect(records).toHaveLength(3);

    expect(records[0]).toEqual({
      userId: "fake-001",
      timestamp: "2026-11-08T01:00:00",
      scamType: "tmobile_phishing",
      redFlags: ["urgency", "authority", "pii_request"],
      vulnerabilityScore: 100,
      employeeSummary: "Summary 1",
      employeeName: "Alex Rivera",
      department: "Support",
      scenario: "Fake Support",
      durationSeconds: 240,
      outcome: "compromised",
    });

    expect(records[1]?.outcome).toBe("resisted");
    expect(records[1]?.vulnerabilityScore).toBe(30);
  });

  it("handles empty or single-line CSV gracefully", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("header_only,col2")).toEqual([]);
  });

  it("computes fleet-wide KPIs correctly", () => {
    const records = parseCsv(sampleCsv);
    const kpis = computeKPIs(records);

    expect(kpis.totalSimulations).toBe(3);
    // (100 + 30 + 80) / 3 = 70
    expect(kpis.avgVulnerability).toBe(70);
    // 2 compromised records with pii_request flag
    expect(kpis.criticalCompromises).toBe(2);
  });

  it("aggregates vulnerability scores by tactic for the radar chart", () => {
    const records = parseCsv(sampleCsv);
    const tactics = aggregateByTactic(records);

    const urgency = tactics.find((t) => t.tactic === "urgency");
    // (100 + 30) / 2 = 65
    expect(urgency?.avgScore).toBe(65);
    expect(urgency?.count).toBe(2);
    expect(urgency?.label).toBe("Urgency");

    const authority = tactics.find((t) => t.tactic === "authority");
    // (100 + 80) / 2 = 90
    expect(authority?.avgScore).toBe(90);
    expect(authority?.count).toBe(2);
  });

  it("aggregates vulnerability scores by scenario for the bar chart", () => {
    const records = parseCsv(sampleCsv);
    const scenarios = aggregateByScenario(records);

    expect(scenarios).toHaveLength(3);
    const fakeSupport = scenarios.find((s) => s.scenario === "Fake Support");
    expect(fakeSupport?.avgScore).toBe(100);
    expect(fakeSupport?.count).toBe(1);
  });

  it("serializes SimulationRecord array back into CSV format", () => {
    const records = parseCsv(sampleCsv);
    const serialized = recordsToCsv(records);
    const parsedBack = parseCsv(serialized);

    expect(parsedBack).toHaveLength(records.length);
    expect(parsedBack[0]?.userId).toBe(records[0]?.userId);
    expect(parsedBack[0]?.vulnerabilityScore).toBe(records[0]?.vulnerabilityScore);
    expect(parsedBack[0]?.employeeName).toBe(records[0]?.employeeName);
  });

  it("updates state and preserves consistency when a new call transcript record is added", () => {
    resetDemo();
    const { result } = renderHook(() => useDemo());
    expect(result.current.vulnerability).toBe(46);

    const newRecord: SimulationRecord = {
      userId: "fake-user-001",
      timestamp: "2026-11-08T04:00:00",
      scamType: "tmobile_phishing",
      redFlags: ["urgency", "authority"],
      vulnerabilityScore: 28,
      employeeSummary: "Alex spotted the urgency tactic quickly and verified through the app.",
      employeeName: "Alex Rivera",
      department: "Customer Support",
      scenario: "Fake T-Mobile Support Rep",
      durationSeconds: 150,
      outcome: "resisted",
    };

    act(() => {
      addOrUpdateCsvRecord(newRecord);
    });

    const currentAlex = result.current.csvRecords.find((r) => r.userId === "fake-user-001");
    expect(currentAlex?.vulnerabilityScore).toBe(28);
    expect(result.current.vulnerability).toBe(28);
  });
});
